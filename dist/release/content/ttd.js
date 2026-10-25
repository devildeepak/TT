// Pilgrim Form Helper – content script (runs on TTD pages).
// FILL-ONLY: never clicks Pay / Confirm / Submit, never touches CAPTCHA, never runs on its own.
(() => {
  "use strict";
  let VERSION;
  try { VERSION = chrome.runtime.getManifest().version; } catch { return; }
  if (window.__pilgrimHelper && window.__pilgrimHelper.version === VERSION && window.__pilgrimHelper.alive()) return;
  try { window.__pilgrimHelper?.destroy?.(); } catch {}
  document.querySelectorAll("#pilgrim-helper-host").forEach(e => e.remove()); // stale UI from an old version

  const HARD_FORBIDDEN = ["pay", "pay now", "make payment", "proceed to payment", "confirm", "confirm & submit", "submit", "book now", "i agree"];
  const INPUT_SEL = "input:not([type=hidden]):not([type=button]):not([type=submit]):not([type=reset]):not([type=image]), select, textarea, [role=combobox], [contenteditable=true]";
  const BUTTON_SEL = "button, input[type=submit], input[type=button], a[role=button], [role=button]";

  let cfg = null, prefs = {}, lastDetect = { flow: "unknown" }, lastRecords = [], busy = false, destroyed = false;
  const timers = [], observers = [];

  /* ================= utilities ================= */
  const norm = s => String(s ?? "").replace(/[*:]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const tick = () => new Promise(r => setTimeout(r, 0)).then(() => new Promise(r => setTimeout(r, 0)));
  const alive = () => { try { return !!chrome.runtime?.id; } catch { return false; } };
  function visible(el) {
    if (!el || !el.isConnected) return false;
    if (el.closest?.("#pilgrim-helper-host")) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && el.getClientRects().length > 0;
  }
  const usable = el => visible(el) || (el?.type === "file" && el.isConnected);
  function waitFor(fn, timeout = 3000) {
    return new Promise((resolve, reject) => {
      let r; try { r = fn(); } catch {}
      if (r) return resolve(r);
      const obs = new MutationObserver(() => { let v; try { v = fn(); } catch {} if (v) { cleanup(); resolve(v); } });
      const poll = setInterval(() => { let v; try { v = fn(); } catch {} if (v) { cleanup(); resolve(v); } }, 100);
      const to = setTimeout(() => { cleanup(); reject(new Error("TIMEOUT")); }, timeout);
      function cleanup() { obs.disconnect(); clearInterval(poll); clearTimeout(to); }
      obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    });
  }
  const getPath = (o, path) => path.split(".").reduce((a, k) => (a == null ? undefined : a[k]), o);
  const pageText = () => norm((document.body?.innerText || "").slice(0, 30000));

  /* ================= resolver ================= */
  function ownText(el) {
    let t = "";
    for (const n of el.childNodes) if (n.nodeType === 3) t += n.textContent; else if (n.nodeType === 1 && !n.matches(INPUT_SEL) && !n.querySelector(INPUT_SEL)) t += " " + n.textContent;
    return norm(t);
  }
  function inputForLabel(lab) {
    if (lab.htmlFor) { const t = document.getElementById(lab.htmlFor); if (t) return t; }
    const inner = lab.querySelector(INPUT_SEL); if (inner) return inner;
    let sib = lab.nextElementSibling;
    for (let i = 0; i < 4 && sib; i++, sib = sib.nextElementSibling) {
      if (sib.matches(INPUT_SEL)) return sib;
      const q = sib.querySelector(INPUT_SEL); if (q) return q;
    }
    let anc = lab.parentElement;
    for (let lvl = 0; lvl < 3 && anc; lvl++, anc = anc.parentElement)
      for (const c of anc.querySelectorAll(INPUT_SEL)) if (lab.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING) return c;
    return null;
  }
  function findAll(s, scope) {
    scope = scope || document;
    if (s.css) { try { return [...scope.querySelectorAll(s.css)]; } catch { return []; } }
    if (s.attr) return [...scope.querySelectorAll(Object.entries(s.attr).map(([k, v]) => `[${k}="${CSS.escape(String(v))}"]`).join(""))];
    if (s.placeholder) { const w = norm(s.placeholder); return [...scope.querySelectorAll("[placeholder]")].filter(e => norm(e.getAttribute("placeholder")).includes(w)); }
    if (s.label) {
      const w = norm(s.label), out = [];
      const groups = [scope.querySelectorAll("label, mat-label, legend, .form-label, .label"), scope.querySelectorAll("span, p, th, td, div, h5, h6")];
      for (const exact of [true, false]) {
        for (const g of groups) for (const lab of g) {
          if (lab.closest("#pilgrim-helper-host")) continue;
          const t = ownText(lab);
          if (!t || t.length > w.length + 20) continue;
          if (exact ? t !== w : !(t.startsWith(w + " ") || t.startsWith(w + "(") || t.startsWith(w + "/"))) continue;
          const el = inputForLabel(lab);
          if (el && !out.includes(el)) out.push(el);
        }
        if (out.length) break;
      }
      return out;
    }
    if (s.buttonText) { const ws = s.buttonText.map(norm); return [...scope.querySelectorAll(BUTTON_SEL)].filter(b => ws.includes(norm(b.innerText || b.value || b.getAttribute("aria-label")))); }
    if (s.role) return [...scope.querySelectorAll(`[role="${s.role}"]`)];
    return [];
  }
  function resolve(strategies, scope) {
    for (let i = 0; i < (strategies || []).length; i++) {
      const els = findAll(strategies[i], scope).filter(usable);
      if (els.length) return { el: els[0], els, idx: i };
    }
    return null;
  }
  async function resolveWait(strategies, scope, timeout) {
    const r = resolve(strategies, scope); if (r || !timeout) return r;
    try { return await waitFor(() => resolve(strategies, scope), timeout); } catch { return null; }
  }

  /* ================= detection ================= */
  function getRows(flow) {
    const r = resolve(flow.rowAnchor, document); if (!r) return [];
    const anchors = r.els;
    return anchors.map(a => {
      let row = a;
      while (row.parentElement && row.parentElement !== document.body) {
        const p = row.parentElement;
        if (anchors.some(x => x !== a && p.contains(x))) break;
        row = p;
      }
      return row;
    });
  }
  function detectStep() {
    const pm = cfg.paymentMarkers || {}, url = location.href.toLowerCase(), txt = pageText();
    if ((pm.url || []).some(u => url.includes(u)) || (pm.text || []).some(t => txt.includes(norm(t))) || (pm.css || []).some(c => document.querySelector(c))) return "payment";
    return null;
  }
  function detect() {
    if (!cfg) return { flow: "unknown" };
    const step0 = detectStep(), url = location.href.toLowerCase(), txt = pageText();
    let best = null;
    for (const f of Object.values(cfg.flows)) {
      let s = 0;
      if ((f.detect.url || []).some(u => url.includes(u))) s += 0.45;
      if ((f.detect.text || []).some(t => txt.includes(norm(t)))) s += 0.35;
      if ((f.detect.notText || []).some(t => txt.includes(norm(t)))) s -= 0.4;
      if (s <= 0) continue;
      if (f.kind === "rows" && getRows(f).length) s += 0.2;
      if (f.kind === "schema" && f.schemaFields.slice(0, 10).filter(d => resolve(d.strategies)).length >= 3) s += 0.2;
      if (f.kind === "group" && resolve(f.memberContainer)) s += 0.2;
      if (!best || s > best.score) best = { flow: f.id, score: s };
    }
    if (!best || best.score < 0.5) return { flow: "unknown", step: step0 };
    const f = cfg.flows[best.flow];
    const res = { flow: f.id, title: f.title, kind: f.kind, canContinue: !!f.continue?.allowed, maxPersons: f.maxPersons,
      confidence: +best.score.toFixed(2), step: step0 || "details", configVersion: cfg.version };
    if (f.kind === "rows") {
      res.slots = getRows(f).length;
      if (!res.slots && !step0) res.step = (cfg.reviewMarkers?.text || []).some(t => txt.includes(norm(t))) ? "review" : "waiting";
    }
    if (f.kind === "group") res.members = (resolve(f.memberContainer)?.els || []).length;
    return res;
  }

  /* ================= setters ================= */
  const protoOf = el => el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const nativeSet = (el, v) => Object.getOwnPropertyDescriptor(protoOf(el), "value").set.call(el, v);
  const fire = (el, type, Ctor = Event, init = {}) => el.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true, composed: true, ...init }));
  const prep = (v, compare) => { v = String(v ?? ""); return compare === "alnum" ? v.replace(/[^a-z0-9]/gi, "") : v.trim(); };
  function same(a, b, compare) {
    a = String(a ?? ""); b = String(b ?? "");
    if (compare === "alnum") return a.replace(/[^a-z0-9]/gi, "").toLowerCase() === b.replace(/[^a-z0-9]/gi, "").toLowerCase();
    return a.trim().toLowerCase() === b.trim().toLowerCase();
  }
  const dmyToIso = v => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v); return m ? `${m[3]}-${m[2]}-${m[1]}` : v; };

  async function setText(el, value, compare) {
    let v = prep(value, compare);
    if (el.type === "date") v = dmyToIso(v);
    if (el.maxLength > 0 && v.length > el.maxLength) v = v.replace(/\s/g, "");
    el.focus?.(); fire(el, "focus", FocusEvent); fire(el, "focusin", FocusEvent);
    nativeSet(el, v);
    fire(el, "input", InputEvent, { inputType: "insertText", data: v });
    fire(el, "change"); fire(el, "blur", FocusEvent); fire(el, "focusout", FocusEvent);
    await tick();
    if (same(el.value, v, compare)) return { ok: true, level: 1 };
    // Level 2: type character by character
    el.focus?.(); fire(el, "focus", FocusEvent);
    nativeSet(el, ""); fire(el, "input", InputEvent, { inputType: "deleteContentBackward" });
    for (const ch of v) {
      fire(el, "keydown", KeyboardEvent, { key: ch }); fire(el, "keypress", KeyboardEvent, { key: ch });
      nativeSet(el, el.value + ch);
      fire(el, "input", InputEvent, { inputType: "insertText", data: ch });
      fire(el, "keyup", KeyboardEvent, { key: ch });
    }
    fire(el, "change"); fire(el, "blur", FocusEvent); fire(el, "focusout", FocusEvent);
    await tick();
    return same(el.value, v, compare) ? { ok: true, level: 2 } : { ok: false, reason: "NOT_ACCEPTED" };
  }
  function findOption(sel, label) {
    const w = norm(label), opts = [...sel.options];
    return opts.find(o => norm(o.text) === w || o.value === label) || opts.find(o => w && norm(o.text).startsWith(w));
  }
  async function setNativeSelect(el, label) {
    let opt = findOption(el, label);
    if (!opt) { try { opt = await waitFor(() => findOption(el, label), 3000); } catch { return { ok: false, reason: "OPTION_NOT_FOUND" }; } }
    el.focus?.(); nativeSet(el, opt.value); opt.selected = true;
    fire(el, "input"); fire(el, "change"); fire(el, "blur", FocusEvent);
    await tick();
    return el.value === opt.value ? { ok: true, level: 1 } : { ok: false, reason: "NOT_ACCEPTED" };
  }
  function clickLike(el) {
    for (const t of ["pointerdown", "mousedown", "pointerup", "mouseup"]) fire(el, t, t.startsWith("pointer") ? PointerEvent : MouseEvent);
    el.click();
  }
  async function setCustomSelect(el, label) {
    const w = norm(label);
    const findOpt = () => [...document.querySelectorAll("[role=option], mat-option, .ng-option, .dropdown-item, li[role=option]")].filter(visible).find(o => norm(o.innerText) === w) || null;
    clickLike(el);
    const input = el.matches("input") ? el : el.querySelector("input");
    if (input && !input.readOnly) await setText(input, label).catch(() => {});
    let opt; try { opt = await waitFor(findOpt, 2500); } catch {
      fire(document.activeElement || el, "keydown", KeyboardEvent, { key: "Escape" });
      return { ok: false, reason: "OPTION_NOT_FOUND" };
    }
    clickLike(opt); await sleep(60);
    const shown = norm(el.innerText || el.value || el.querySelector("input")?.value || el.getAttribute("aria-label"));
    return shown.includes(w) ? { ok: true, level: 1 } : { ok: false, reason: "NOT_ACCEPTED" };
  }
  const labelOfChoice = inp => norm(inp.labels?.[0]?.innerText || inp.closest("label")?.innerText || inp.nextSibling?.textContent || inp.value);
  async function setRadio(el, value) {
    const group = el.name ? [...document.querySelectorAll(`input[type=radio][name="${CSS.escape(el.name)}"]`)] : [el];
    const target = group.find(r => labelOfChoice(r) === norm(value) || norm(r.value) === norm(value));
    if (!target) return { ok: false, reason: "OPTION_NOT_FOUND" };
    if (!target.checked) target.click();
    await tick();
    return target.checked ? { ok: true, level: 1 } : { ok: false, reason: "NOT_ACCEPTED" };
  }
  async function setCheckbox(el, value) {
    const want = value === true || value === "true" || value === "Yes";
    if (el.checked !== want) el.click();
    await tick();
    return el.checked === want ? { ok: true, level: 1 } : { ok: false, reason: "NOT_ACCEPTED" };
  }
  async function setMulti(el, values) {
    values = (Array.isArray(values) ? values : [values]).map(norm);
    let box = el.parentElement;
    while (box && box.querySelectorAll("input[type=checkbox]").length < 2 && box !== document.body) box = box.parentElement;
    const boxes = [...(box || document).querySelectorAll("input[type=checkbox]")];
    for (const b of boxes) { const want = values.includes(labelOfChoice(b)); if (b.checked !== want) b.click(); }
    await tick();
    const okAll = boxes.every(b => b.checked === values.includes(labelOfChoice(b)));
    const missing = values.filter(v => !boxes.some(b => labelOfChoice(b) === v));
    return okAll && !missing.length ? { ok: true, level: 1 } : { ok: false, reason: missing.length ? "OPTION_NOT_FOUND" : "NOT_ACCEPTED" };
  }
  function dataUrlToFile(dataUrl, base) {
    const [head, b64] = dataUrl.split(",");
    const mime = /data:([^;]+)/.exec(head)?.[1] || "application/octet-stream";
    const bin = atob(b64), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const ext = mime === "application/pdf" ? "pdf" : mime === "image/png" ? "png" : "jpg";
    return new File([u], `${base}.${ext}`, { type: mime, lastModified: Date.now() });
  }
  async function setFile(el, dataUrl, base) {
    if (!(el instanceof HTMLInputElement) || el.type !== "file") { const inner = el.querySelector?.("input[type=file]"); if (!inner) return { ok: false, reason: "NOT_FOUND" }; el = inner; }
    const file = dataUrlToFile(dataUrl, base);
    const dt = new DataTransfer(); dt.items.add(file);
    el.files = dt.files;
    fire(el, "input"); fire(el, "change");
    await sleep(50);
    return el.files.length === 1 && el.files[0].size === file.size ? { ok: true, level: 1, el } : { ok: false, reason: "NOT_ACCEPTED" };
  }
  function readValue(el, type) {
    if (!el?.isConnected) return undefined;
    if (type === "checkbox") return el.checked;
    if (type === "file") { const f = el.type === "file" ? el : el.querySelector("input[type=file]"); return f?.files?.length ? "file" : ""; }
    if (el instanceof HTMLSelectElement) return el.selectedOptions[0]?.text ?? "";
    if (el.type === "radio") { const g = el.name ? document.querySelector(`input[type=radio][name="${CSS.escape(el.name)}"]:checked`) : el; return g ? labelOfChoice(g) : ""; }
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value;
    return el.innerText;
  }
  function hasErrorNear(el) {
    if (el.getAttribute?.("aria-invalid") === "true") return true;
    const grp = el.closest(".form-group, mat-form-field, .mat-form-field, .field, .form-field, td") || el.parentElement;
    if (!grp) return false;
    for (const sel of cfg.errorSelectors || []) for (const e of grp.querySelectorAll(sel)) if (visible(e) && e.innerText.trim()) return e.innerText.trim().slice(0, 80);
    return false;
  }
  function hasVisibleErrors() {
    for (const sel of cfg.errorSelectors || []) for (const e of document.querySelectorAll(sel)) if (visible(e) && e.innerText.trim()) return true;
    return false;
  }

  /* ================= field filling ================= */
  async function applyField(def, el, value, fileBase) {
    let v = value;
    if (def.valueMap && v != null && def.valueMap[v] != null) v = def.valueMap[v];
    if (def.type === "file") return setFile(el, v, fileBase || def.key);
    if (def.type === "checkbox") return el.type === "checkbox" ? setCheckbox(el, v) : { ok: false, reason: "NOT_FOUND" };
    if (def.type === "multi") return setMulti(el, v);
    if (def.type === "radio" || el.type === "radio") return setRadio(el, v);
    if (el instanceof HTMLSelectElement) {
      if (def.skipIfEquals && v === def.skipIfEquals && norm(readValue(el)) === norm(v)) return { ok: true, level: 0, skipped: true };
      return setNativeSelect(el, v);
    }
    if (def.type === "select" && !(el instanceof HTMLInputElement && el.type === "text" && !el.getAttribute("role"))) return setCustomSelect(el, v);
    return setText(el, v, def.compare);
  }
  const isEmpty = v => v == null || v === "" || (Array.isArray(v) && !v.length);

  /** Fill one field; returns a record kept in memory for verify / Fix / Copy. */
  async function fillOne(def, scope, value, row, extra = {}) {
    const rec = { key: def.key, label: def.label || def.key, row, def, scope, value, status: "PENDING" };
    if (isEmpty(value)) { rec.status = def.optional || def.type === "checkbox" ? "SKIPPED" : "FAILED"; rec.reason = "NO_DATA"; return rec; }
    const r = await resolveWait(def.strategies, scope, extra.wait || 0);
    if (!r) { rec.status = def.optional ? "SKIPPED" : "FAILED"; rec.reason = "NOT_FOUND"; return rec; }
    rec.el = r.el; rec.strategy = r.idx;
    if (r.el.disabled || (r.el.readOnly && def.type !== "select")) { rec.status = "FAILED"; rec.reason = "DISABLED"; return rec; }
    let res;
    try { res = await applyField(def, r.el, value, extra.fileBase); } catch (e) { res = { ok: false, reason: "ERROR" }; console.warn("[PilgrimHelper]", def.key, e); }
    if (res.el) rec.el = res.el;
    rec.status = res.ok ? (res.level === 2 ? "RETRIED_OK" : "OK") : "FAILED";
    if (!res.ok) rec.reason = res.reason;
    return rec;
  }
  function mutex() { let p = Promise.resolve(); return fn => { const run = p.then(fn, fn); p = run.catch(() => {}); return run; }; }
  const popupLock = mutex();

  function isForbidden(btn) {
    const t = norm(btn.innerText || btn.value || btn.getAttribute("aria-label"));
    const list = [...new Set([...HARD_FORBIDDEN, ...(cfg.forbidden || [])])].map(norm);
    return list.some(w => new RegExp(`(^|\\W)${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\W|$)`).test(t));
  }
  async function handlePassport(flow, person, row) {
    const recs = [], pp = flow.passport;
    const dlg = await (async () => { try { return await waitFor(() => resolve(pp.container)?.el, 2500); } catch { return null; } })();
    if (!dlg) { recs.push({ key: "passport.popup", row, status: "FAILED", reason: "POPUP_NOT_FOUND", label: "Passport popup" }); return recs; }
    const LBL = { country: "Passport country", visaNo: "Visa/OCI number", visaType: "Visa type", validity: "Visa validity" };
    for (const [k, def] of Object.entries(pp.fields))
      recs.push(await fillOne({ ...def, key: "passport." + k, label: LBL[k] || k, noVerify: true }, dlg, getPath({ person }, def.source), row));
    const allowed = (cfg.allowedClose || []).map(norm);
    const btn = [...dlg.querySelectorAll(BUTTON_SEL)].filter(visible).find(b => allowed.includes(norm(b.innerText || b.value)) && !isForbidden(b));
    if (btn) { btn.click(); try { await waitFor(() => !visible(dlg), 2500); } catch { recs.push({ key: "passport.close", row, status: "FAILED", reason: "POPUP_DID_NOT_CLOSE", label: "Passport popup" }); } }
    else recs.push({ key: "passport.close", row, status: "FAILED", reason: "CLOSE_BUTTON_NOT_FOUND", label: "Passport popup" });
    return recs;
  }
  async function fillRow(flow, rowEl, person, i) {
    const recs = [];
    for (const def of flow.rowFields) {
      const value = getPath({ person }, def.source);
      if (def.key === "idType" && person.idType === "PASSPORT" && flow.passport) {
        recs.push(...await popupLock(async () => {
          const pre = resolve(def.strategies, rowEl);
          const already = pre && norm(readValue(pre.el)) === norm(def.valueMap?.[value] ?? value);
          const rec = await fillOne(def, rowEl, value, i);
          if (rec.status === "FAILED") return [rec];
          // Re-fill on the same page: TTD only opens the popup when the ID type changes, so keep what was entered.
          if (already && !resolve(flow.passport.container)) return [rec, { key: "passport.popup", row: i, status: "SKIPPED", reason: "ALREADY_SET", label: "Passport details" }];
          return [rec, ...(await handlePassport(flow, person, i))];
        }));
      } else recs.push(await fillOne(def, rowEl, value, i));
    }
    for (const up of flow.rowUploads || [])
      recs.push(await fillOne({ ...up }, rowEl, getPath({ person }, up.source), i, { fileBase: `${up.key}_${i + 1}` }));
    return recs;
  }
  async function verify(records) {
    for (const r of records) {
      if (!r.el || !["OK", "RETRIED_OK"].includes(r.status) || r.def?.type === "file" || r.def?.noVerify) continue;
      if (!r.el.isConnected && r.def) { const again = resolve(r.def.strategies, r.scope); if (again) r.el = again.el; }
      const cur = readValue(r.el, r.def.type);
      let expect = r.value;
      if (r.def.valueMap && r.def.valueMap[expect] != null) expect = r.def.valueMap[expect];
      let ok;
      if (r.def.type === "checkbox") ok = cur === (expect === true || expect === "true" || expect === "Yes");
      else if (r.def.type === "multi") ok = true; // verified in setter
      else if (r.el.type === "date") ok = same(cur, dmyToIso(String(expect)));
      else ok = same(cur, prep(expect, r.def.compare), r.def.compare) || (r.def.type === "select" && norm(cur).includes(norm(expect)));
      if (!ok) { r.status = "FAILED"; r.reason = "NOT_ACCEPTED"; continue; }
      const err = hasErrorNear(r.el);
      if (err) { r.status = "FAILED"; r.reason = "TTD_VALIDATION_ERROR"; r.ttdMessage = typeof err === "string" ? err : ""; }
    }
  }
  async function retryFailed(records) {
    for (const r of records) {
      if (r.status !== "FAILED" || !r.def || !["NOT_ACCEPTED", "OPTION_NOT_FOUND"].includes(r.reason)) continue;
      const again = await fillOne(r.def, r.scope, r.value, r.row, { wait: 800 });
      Object.assign(r, { el: again.el || r.el, status: again.status === "OK" ? "RETRIED_OK" : again.status, reason: again.reason, strategy: again.strategy });
    }
  }

  async function runFill(flowId, mode, data) {
    const t0 = performance.now(), flow = cfg.flows[flowId], det = detect();
    if (det.flow !== flowId) return { flow: flowId, mode, ok: false, error: "E_WRONG_PAGE", fields: [] };
    if (det.step === "payment") return { flow: flowId, mode, ok: false, error: "E_PAYMENT", fields: [] };
    let records = [];
    const notes = [];
    if (flow.kind === "rows") {
      const rows = getRows(flow), persons = data.persons || [];
      if (!rows.length) return { flow: flowId, mode, ok: false, error: "E_NO_ROWS", fields: [] };
      if (persons.length > rows.length) notes.push(`The page has ${rows.length} slot(s); ${persons.length - rows.length} person(s) were not filled.`);
      if (persons.length < rows.length) notes.push(`${rows.length - persons.length} empty row(s) on the page. TTD may need every row filled.`);
      const n = Math.min(rows.length, persons.length);
      records = (await Promise.all(Array.from({ length: n }, (_, i) => fillRow(flow, rows[i], persons[i], i)))).flat();
      for (const def of flow.contactFields || []) records.push(await fillOne(def, document, getPath({ contact: data.contact }, def.source), undefined, { wait: def.dependsOn ? 1500 : 0 }));
      records.forEach(r => { if (r.row != null) r.person = persons[r.row]?.name; });
    } else {
      let scope = document;
      if (flow.kind === "group") {
        const containers = resolve(flow.memberContainer)?.els || [];
        scope = containers[data.memberIndex];
        if (!scope) return { flow: flowId, mode, ok: false, error: "E_MEMBER_NOT_FOUND", memberIndex: data.memberIndex, fields: [] };
        const exp = resolve(flow.memberExpand, scope);
        if (exp) { exp.el.click(); await sleep(300); }
        scope.scrollIntoView({ block: "start", behavior: "smooth" });
        notes.push(`Member ${data.memberIndex + 1} of ${data.memberCount}`);
      }
      const src = flow.kind === "group" ? { member: data.member } : { seva: data.seva };
      for (const def of flow.schemaFields) {
        if (def.showIf && getPath(src, def.source.replace(def.key, def.showIf.key)) !== def.showIf.equals) continue;
        records.push(await fillOne(def, scope, getPath(src, def.source), undefined, { wait: def.dependsOn || def.showIf ? 1500 : 0, fileBase: def.key.replace(/\W/g, "_") }));
      }
    }
    await verify(records); await retryFailed(records); await verify(records);

    const counted = records.filter(r => r.status !== "SKIPPED");
    const passed = counted.filter(r => r.status === "OK" || r.status === "RETRIED_OK").length;
    const report = { flow: flowId, title: flow.title, mode, ok: passed === counted.length && counted.length > 0,
      total: counted.length, passed, durationMs: Math.round(performance.now() - t0), notes, memberIndex: data.memberIndex,
      fields: records.map(r => ({ key: r.key, label: r.label, row: r.row, person: r.person, status: r.status, reason: r.reason, strategy: r.strategy, ttdMessage: r.ttdMessage })) };
    lastRecords = records;
    records.filter(r => r.status === "FAILED" && r.el).forEach(r => highlight(r.el, true));
    if (mode === "FILL_CONTINUE") {
      if (report.ok) Object.assign(report, await doContinue(flow));
      else report.stoppedAt = "FIELDS_FAILED";
    }
    return report;
  }

  /* ================= continue controller ================= */
  async function doContinue(flow) {
    if (!flow.continue?.allowed) return { continued: false, stoppedAt: "FILL_ONLY" };
    let clicks = 0;
    for (; clicks < (flow.continue.maxClicks || 1); clicks++) {
      if (detectStep() === "payment") return { continued: clicks > 0, stoppedAt: "PAYMENT" };
      const cap = resolve(cfg.captcha);
      if (cap && !cap.el.value) return { continued: clicks > 0, stoppedAt: "CAPTCHA" };
      if (hasVisibleErrors()) return { continued: clicks > 0, stoppedAt: "VALIDATION_ERRORS" };
      const btnR = resolve(cfg.continueButton);
      if (!btnR) return { continued: clicks > 0, stoppedAt: clicks ? "DONE" : "NO_CONTINUE" };
      const btn = btnR.el;
      if (isForbidden(btn)) return { continued: clicks > 0, stoppedAt: "FORBIDDEN_BUTTON" };
      try { await waitFor(() => !btn.disabled && btn.getAttribute("aria-disabled") !== "true", 4000); }
      catch { return { continued: clicks > 0, stoppedAt: "CONTINUE_DISABLED" }; }
      const before = location.href;
      btn.click();
      try { await waitFor(() => location.href !== before || !visible(btn), 5000); } catch {}
      await sleep(300);
    }
    return { continued: true, stoppedAt: detectStep() === "payment" ? "PAYMENT" : "DONE" };
  }
  async function clearFilled() {
    let n = 0;
    for (const r of lastRecords) {
      const el = r.el; if (!el?.isConnected) continue;
      try {
        if (el.type === "checkbox") { if (el.checked) el.click(); }
        else if (el.type === "radio") { /* leave radios */ }
        else if (el.type === "file") { el.value = ""; fire(el, "change"); }
        else if (el instanceof HTMLSelectElement) { nativeSet(el, el.options[0]?.value ?? ""); fire(el, "change"); }
        else if ("value" in el) { nativeSet(el, ""); fire(el, "input", InputEvent); fire(el, "change"); fire(el, "blur", FocusEvent); }
        highlight(el, false); n++;
      } catch {}
    }
    lastRecords = [];
    return n;
  }

  /* ================= UI (Shadow DOM, temple theme) ================= */
  const DIYA = `<svg class="diya" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path class="flame" d="M12 1.5c2.4 3.2 3.2 5.6 0 8.8-3.2-3.2-2.4-5.6 0-8.8z" fill="#ffd166"/><path class="flame" d="M12 4.3c1.1 1.7 1.4 2.9 0 4.6-1.4-1.7-1.1-2.9 0-4.6z" fill="#f97316"/><path d="M2.5 12.5h19c-1 4.4-5 6.8-9.5 6.8s-8.5-2.4-9.5-6.8z" fill="currentColor"/><path d="M8 21.3h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
  const LOTUS = `<svg width="26" height="16" viewBox="0 0 40 24" aria-hidden="true"><g fill="#c9962c"><path d="M20 1c4.5 5 4.5 12.5 0 21-4.5-8.5-4.5-16 0-21z"/><path d="M20 22c-2-7-7-12.5-14.5-13.5 1 7.5 6.5 12.5 14.5 13.5z" opacity=".85"/><path d="M20 22c2-7 7-12.5 14.5-13.5-1 7.5-6.5 12.5-14.5 13.5z" opacity=".85"/></g></svg>`;
  const host = document.createElement("div");
  host.id = "pilgrim-helper-host";
  host.style.cssText = "all:initial;position:fixed;z-index:2147483646;right:16px;bottom:16px;";
  const shadow = host.attachShadow({ mode: "closed" });
  shadow.innerHTML = `
  <style>
    :host{all:initial}
    *{box-sizing:border-box;font-family:"Segoe UI","Nirmala UI",system-ui,-apple-system,Roboto,"Noto Sans","Noto Sans Telugu",sans-serif}
    .wrap{--bg:#fffaf1;--bg2:#fff1da;--fg:#3b1f0e;--mut:#7a5c45;--line:#ebd6ae;--gold:#c9962c;--ok:#2e7d32;--bad:#b3261e;--warn:#9a5b00;
      color:var(--fg);font-size:13px;display:flex;flex-direction:column;align-items:flex-end;gap:10px}
    @media (prefers-color-scheme:dark){.wrap{--bg:#2a170f;--bg2:#331d12;--fg:#f8ead3;--mut:#cfae8c;--line:#4d2f1c;--gold:#e9c46a;--ok:#7bd88f;--bad:#ff8a80;--warn:#ffcc66}}
    .pill{display:flex;align-items:center;color:#fff6e0;border-radius:999px;overflow:hidden;border:1.5px solid #f3c56b;
      background:linear-gradient(120deg,#4f0b0b,#8b1a1a 50%,#d65a0c);box-shadow:0 6px 20px rgba(79,11,11,.35),0 0 0 4px rgba(233,196,106,.25)}
    .pill button{all:unset;cursor:pointer;display:flex;align-items:center;gap:6px;padding:9px 13px;font-weight:700;color:#fff6e0;letter-spacing:.2px}
    .pill button:hover{background:rgba(255,209,102,.18)} .pill button:focus-visible{outline:2px solid #ffd166;outline-offset:-3px}
    .pill .drag{cursor:grab;padding:9px 4px 9px 11px;color:#ffd98a;user-select:none;font-size:14px}
    .pill .sep{width:1px;align-self:stretch;background:rgba(255,217,138,.4)}
    .diya{color:#ffd98a}
    @media (prefers-reduced-motion:no-preference){@keyframes fl{0%,100%{transform:scale(1)}50%{transform:scale(1.07,.93)}}.flame{transform-origin:50% 70%;animation:fl 2.2s ease-in-out infinite}}
    .panel{width:350px;max-height:62vh;overflow:auto;background:linear-gradient(180deg,var(--bg),var(--bg2));border:1px solid var(--line);border-radius:16px;
      box-shadow:0 14px 36px rgba(79,11,11,.3);}
    .hd{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 12px;color:#fff6e0;border-radius:15px 15px 0 0;
      background:linear-gradient(120deg,#4f0b0b,#8b1a1a 55%,#d65a0c);border-bottom:2px solid #e9c46a}
    .hd b{font-family:"Noto Serif",Georgia,serif;font-size:14.5px;letter-spacing:.3px}
    .hd small{display:block;color:#ffd98a;font-size:11px}
    .x{all:unset;cursor:pointer;padding:2px 7px;border-radius:50%;color:#ffe6b0}
    .x:hover{background:rgba(255,230,176,.2)}
    .body{padding:10px 12px 12px}
    .sum{display:flex;align-items:center;gap:8px;font-weight:700;margin:2px 0 8px;font-size:13.5px}
    .ok{color:var(--ok)} .bad{color:var(--bad)} .warn{color:var(--warn)} .mut{color:var(--mut)}
    .row{border-top:1px dashed var(--line);padding:6px 0}
    .f{display:flex;justify-content:space-between;gap:6px;align-items:center;padding:2px 0}
    .f small{display:block;color:var(--mut)}
    .btns button,.act button{all:unset;cursor:pointer;border:1px solid var(--line);border-radius:999px;padding:2px 10px;margin-left:4px;font-size:12px;background:var(--bg)}
    .btns button:hover,.act button:hover{border-color:var(--gold)}
    .act{display:flex;gap:6px;margin-top:10px;flex-wrap:wrap} .act button{margin:0;padding:5px 12px;font-weight:600}
    .note{border-left:3px solid var(--gold);background:rgba(233,196,106,.14);border-radius:8px;padding:6px 9px;margin:6px 0}
    .note.bad{border-left-color:var(--bad)} .note.ok{border-left-color:var(--ok)}
    .bless{display:flex;justify-content:center;align-items:center;gap:8px;color:var(--gold);font-family:"Noto Serif",Georgia,serif;font-size:12px;margin-top:8px}
    .hidden{display:none!important}
  </style>
  <div class="wrap" role="region" aria-label="Pilgrim Form Helper">
    <div class="panel hidden" id="panel" aria-live="polite"></div>
    <div class="pill hidden" id="pill">
      <span class="drag" id="drag" title="Drag to move" aria-hidden="true">⋮⋮</span>
      <button id="fill" type="button" title="Fill (Alt+A)">${DIYA}<span id="fillLbl">Fill</span></button>
      <span class="sep" id="sepc"></span>
      <button id="fillc" type="button" title="Fill &amp; Continue (Alt+S) – stops before payment" aria-label="Fill and continue">»</button>
      <span class="sep"></span>
      <button id="toggle" type="button" title="Show / hide results" aria-label="Show results">≡</button>
    </div>
  </div>`;
  const $ = id => shadow.getElementById(id);
  const panel = $("panel"), pill = $("pill");
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const REASONS = {
    NOT_FOUND: "field not found on page", NOT_ACCEPTED: "TTD didn't keep the value", OPTION_NOT_FOUND: "option not in the list",
    TTD_VALIDATION_ERROR: "TTD shows an error", NO_DATA: "nothing saved for this", DISABLED: "field is locked", POPUP_NOT_FOUND: "passport popup didn't open",
    POPUP_DID_NOT_CLOSE: "passport popup still open", CLOSE_BUTTON_NOT_FOUND: "popup close button not found", ERROR: "unexpected error"
  };
  const STOPS = {
    PAYMENT: "You've reached the payment step. The helper stops here; payment is your decision.",
    CAPTCHA: "Please type the CAPTCHA, then press Continue yourself.",
    VALIDATION_ERRORS: "TTD shows errors on the page. Fix them, then press Continue.",
    NO_CONTINUE: "Continue button not found. Please press it yourself.",
    FORBIDDEN_BUTTON: "The next button looks like Pay/Submit, so it wasn't clicked.",
    CONTINUE_DISABLED: "Continue is still disabled. Please check the form.",
    FIELDS_FAILED: "Not continued because some fields need attention.",
    FILL_ONLY: "This booking is fill-only. Type the CAPTCHA and continue yourself.",
    DONE: "Continued. Please review the next screen."
  };
  const ERRORS = {
    E_WRONG_PAGE: "This page changed. Please try again.", E_PAYMENT: "Payment page. The helper does nothing here.",
    E_NO_ROWS: "Pilgrim rows aren't loaded yet. Wait a moment and try again.", E_MEMBER_NOT_FOUND: "That member's section wasn't found on the page.",
    E_UNSUPPORTED: "This page isn't a supported booking form.", E_LOCKED: "Locked. Open the extension and enter your PIN.", E_INJECT: "Couldn't access this tab."
  };

  let panelOpen = false;
  function showPanel(open) { panelOpen = open; panel.classList.toggle("hidden", !open); }
  function header(title, sub) {
    return `<div class="hd"><div><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</div><button class="x" id="px" type="button" aria-label="Close">✕</button></div>`;
  }
  function notice(text, level = "warn") {
    panel.innerHTML = header("Pilgrim Helper", "ఓం నమో వేంకటేశాయ") + `<div class="body"><div class="note ${level}">${esc(text)}</div></div>`;
    shadow.getElementById("px").onclick = () => showPanel(false);
    showPanel(true);
  }
  function renderReport(rep) {
    if (!rep) return;
    if (rep.error) return notice(ERRORS[rep.error] || rep.error, "bad");
    const groups = new Map();
    for (const f of rep.fields) {
      const k = f.row != null ? `Row ${f.row + 1}${f.person ? " · " + f.person : ""}` : (f.key.startsWith("contact.") ? "Contact details" : "Form");
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(f);
    }
    let html = header(rep.title || rep.flow, rep.mode === "PRACTICE" ? "Practice run – nothing will be submitted" : "Fill-only · never pays") + `<div class="body">`;
    html += rep.ok
      ? `<div class="sum ok">✔ All ${rep.total} details filled in ${(rep.durationMs / 1000).toFixed(1)} s</div>`
      : `<div class="sum bad">Filled ${rep.passed} of ${rep.total}. Please check the fields marked ✖</div>`;
    for (const n of rep.notes || []) html += `<div class="note">${esc(n)}</div>`;
    for (const [g, fs] of groups) {
      const bad = fs.filter(f => f.status === "FAILED");
      html += `<div class="row"><div class="f"><span>${esc(g)}</span><span class="${bad.length ? "bad" : "ok"}">${bad.length ? "✖ " + bad.length : "✔"}</span></div>`;
      for (const f of fs) {
        if (f.status !== "FAILED") continue;
        const i = rep.fields.indexOf(f);
        html += `<div class="f"><span>${esc(f.label)}<small>${esc(REASONS[f.reason] || f.reason)}${f.ttdMessage ? ": " + esc(f.ttdMessage) : ""}</small></span>
          <span class="btns"><button type="button" data-fix="${i}">Fix</button><button type="button" data-copy="${i}">Copy</button></span></div>`;
      }
      html += `</div>`;
    }
    if (rep.stoppedAt) html += `<div class="note ${rep.stoppedAt === "DONE" || rep.stoppedAt === "PAYMENT" ? "ok" : ""}">${esc(STOPS[rep.stoppedAt] || rep.stoppedAt)}</div>`;
    else if (rep.ok && rep.mode !== "PRACTICE") html += `<div class="note ok">Next: check the details, type the CAPTCHA and continue yourself.</div>`;
    html += `<div class="act">${rep.mode === "PRACTICE" ? `<button type="button" id="clr">Clear filled fields</button>` : ""}<button type="button" id="again">Fill again</button></div>`;
    if (rep.ok) html += `<div class="bless">${LOTUS}<span>Govinda Govinda</span>${LOTUS}</div>`;
    html += `</div>`;
    panel.innerHTML = html;
    shadow.getElementById("px").onclick = () => showPanel(false);
    shadow.getElementById("again").onclick = () => trigger("FILL");
    const clr = shadow.getElementById("clr");
    if (clr) clr.onclick = async () => { const n = await clearFilled(); notice(`Cleared ${n} field(s).`, "ok"); };
    panel.querySelectorAll("[data-fix]").forEach(b => b.onclick = () => fixField(+b.dataset.fix, rep));
    panel.querySelectorAll("[data-copy]").forEach(b => b.onclick = () => copyField(+b.dataset.copy, b));
    showPanel(true);
    if (rep.ok && !rep.notes?.length && rep.mode !== "PRACTICE") timers.push(setTimeout(() => { if (panelOpen) showPanel(false); }, 8000));
  }
  async function fixField(i, rep) {
    const r = lastRecords[i]; if (!r?.def) return;
    if (r.el) { r.el.scrollIntoView({ block: "center" }); r.el.focus?.(); }
    const again = await fillOne(r.def, r.scope, r.value, r.row, { wait: 1000 });
    Object.assign(r, { el: again.el || r.el, status: again.status, reason: again.reason });
    await verify([r]);
    rep.fields[i].status = r.status; rep.fields[i].reason = r.reason;
    const counted = rep.fields.filter(f => f.status !== "SKIPPED");
    rep.passed = counted.filter(f => f.status === "OK" || f.status === "RETRIED_OK").length;
    rep.ok = rep.passed === counted.length;
    if (r.status !== "FAILED" && r.el) highlight(r.el, false);
    renderReport(rep);
  }
  async function copyField(i, btn) {
    const r = lastRecords[i]; if (!r) return;
    let v = r.value; if (r.def?.valueMap?.[v] != null) v = r.def.valueMap[v];
    if (typeof v === "string" && v.startsWith("data:")) { btn.textContent = "n/a"; return; }
    try { await navigator.clipboard.writeText(Array.isArray(v) ? v.join(", ") : String(v ?? "")); btn.textContent = "Copied"; }
    catch { btn.textContent = "Blocked"; }
    if (r.el) { r.el.scrollIntoView({ block: "center" }); r.el.focus?.(); }
  }
  function highlight(el, on) { try { el.style.outline = on ? "3px solid #b3261e" : ""; el.style.outlineOffset = on ? "2px" : ""; } catch {} }

  function trigger(mode) {
    if (!alive()) return teardown();
    if (busy) return;
    $("fillLbl").textContent = "Filling…";
    chrome.runtime.sendMessage({ t: "REQUEST_FILL", mode }, res => {
      void chrome.runtime.lastError;
      renderPill();
      if (res && !res.ok && !res.report) notice(ERRORS[res.code] || res.error || "Something went wrong.", "bad");
    });
  }
  $("fill").addEventListener("click", () => trigger(prefs.defaultAction === "FILL_CONTINUE" ? "FILL_CONTINUE" : "FILL"));
  $("fillc").addEventListener("click", () => trigger("FILL_CONTINUE"));
  $("toggle").addEventListener("click", () => showPanel(!panelOpen));
  (() => { // drag to move
    const d = $("drag"); let sx, sy, sr, sb, dragging = false;
    d.addEventListener("pointerdown", e => { dragging = true; d.setPointerCapture(e.pointerId); sx = e.clientX; sy = e.clientY; sr = parseFloat(host.style.right); sb = parseFloat(host.style.bottom); });
    d.addEventListener("pointermove", e => { if (!dragging) return;
      host.style.right = Math.max(0, Math.min(innerWidth - 80, sr - (e.clientX - sx))) + "px";
      host.style.bottom = Math.max(0, Math.min(innerHeight - 40, sb - (e.clientY - sy))) + "px"; });
    d.addEventListener("pointerup", () => { dragging = false; try { chrome.storage.local.set({ "ui:pos": { right: host.style.right, bottom: host.style.bottom } }); } catch {} });
  })();
  function renderPill() {
    const d = lastDetect, show = prefs.floatingButton !== false && d.flow !== "unknown" && d.step !== "payment";
    pill.classList.toggle("hidden", !show);
    if (!show) return;
    const f = cfg.flows[d.flow];
    $("fillLbl").textContent = "Fill" + (d.slots ? ` ${d.slots}` : "");
    $("fill").title = `Fill ${f.title} (Alt+A)`;
    $("fillc").classList.toggle("hidden", !f.continue?.allowed);
    $("sepc").classList.toggle("hidden", !f.continue?.allowed);
  }

  /* ================= SPA watcher ================= */
  let lastUrl = location.href, debounceT;
  function redetect() {
    clearTimeout(debounceT);
    debounceT = setTimeout(() => { if (destroyed) return; if (!alive()) return teardown(); lastDetect = detect(); renderPill(); }, 350);
  }
  function teardown() {
    destroyed = true;
    observers.forEach(o => o.disconnect()); timers.forEach(t => { clearTimeout(t); clearInterval(t); });
    window.removeEventListener("hashchange", redetect); window.removeEventListener("popstate", redetect);
    host.remove();
  }

  /* ================= messaging ================= */
  chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
    if (destroyed) return;
    switch (msg?.t) {
      case "PING": sendResponse({ version: VERSION }); return;
      case "DETECT": lastDetect = detect(); renderPill(); sendResponse(lastDetect); return;
      case "NOTICE": notice(msg.text, msg.level); sendResponse(true); return;
      case "CLEAR": clearFilled().then(n => { notice(`Cleared ${n} field(s).`, "ok"); sendResponse({ cleared: n }); }); return true;
      case "FILL":
        if (busy) { sendResponse({ ok: false, error: "E_BUSY", fields: [] }); return; }
        busy = true;
        lastRecords.forEach(r => r.el && highlight(r.el, false));
        runFill(msg.flowId, msg.mode, msg.data)
          .then(rep => { renderReport(rep); sendResponse(rep); })
          .catch(e => { console.error("[PilgrimHelper]", e); notice("Unexpected error. Please fill manually and use Report issue in settings.", "bad"); sendResponse({ flow: msg.flowId, ok: false, error: "E_INTERNAL", fields: [] }); })
          .finally(() => { busy = false; });
        return true;
    }
  });

  /* ================= init ================= */
  window.__pilgrimHelper = { version: VERSION, alive: () => !destroyed && alive(), destroy: teardown };
  chrome.runtime.sendMessage({ t: "GET_CONFIG" }, res => {
    if (chrome.runtime.lastError || !res?.config) return;
    cfg = res.config; prefs = res.prefs || {};
    (document.body || document.documentElement).appendChild(host);
    chrome.storage.local.get("ui:pos", r => { const p = r?.["ui:pos"]; if (p) { host.style.right = p.right; host.style.bottom = p.bottom; } });
    lastDetect = detect(); renderPill();
    const mo = new MutationObserver(m => { if (m.some(x => !host.contains(x.target))) redetect(); });
    mo.observe(document.body, { childList: true, subtree: true });
    observers.push(mo);
    window.addEventListener("hashchange", redetect); window.addEventListener("popstate", redetect);
    timers.push(setInterval(() => {
      if (!alive()) return teardown();
      if (location.href !== lastUrl) { lastUrl = location.href; redetect(); }
    }, 700));
    chrome.storage.onChanged.addListener((ch, area) => { if (area === "local" && ch.prefs && !destroyed) { prefs = ch.prefs.newValue || {}; renderPill(); } });
  });
})();
