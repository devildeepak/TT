// Background service worker: shortcuts, on-demand injection, config, payload building.
// Personal data is only passed from here to the content script over local extension messaging.
import { loadRoot, updateRoot, getDoc, isLocked, loadPrefs } from "../lib/store.js";
import { SCHEMAS, flatFields, getPath } from "../lib/sevaSchema.js";
import { validatePerson, validateContact, validateSchemaValue, ageFromDob } from "../lib/validation.js";

const VERSION = chrome.runtime.getManifest().version;
const TTD_MATCHES = ["https://ttdevasthanams.ap.gov.in/*", "https://*.ttdevasthanams.ap.gov.in/*"];
const HARD_FORBIDDEN = ["pay", "pay now", "make payment", "proceed to payment", "confirm", "confirm & submit", "submit", "book now", "i agree"];

/* ---------------- config ---------------- */
let cfgMem = null;
function cmpVer(a, b) {
  const x = String(a).split(".").map(Number), y = String(b).split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  return 0;
}
async function verifySignature(text, sigB64, pubB64) {
  try {
    const key = await crypto.subtle.importKey("raw", Uint8Array.from(atob(pubB64), c => c.charCodeAt(0)), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify({ name: "Ed25519" }, key, Uint8Array.from(atob(sigB64.trim()), c => c.charCodeAt(0)), new TextEncoder().encode(text));
  } catch (e) { console.warn("Signature check failed", e); return false; }
}
async function fetchRemote(prefs) {
  const url = prefs.remoteConfigUrl, pub = prefs.remotePublicKey;
  if (!url || !pub) return null;
  try {
    const [t, sig] = await Promise.all([
      fetch(url, { credentials: "omit", cache: "no-store" }).then(r => r.ok ? r.text() : Promise.reject(r.status)),
      fetch(url + ".sig", { credentials: "omit", cache: "no-store" }).then(r => r.ok ? r.text() : Promise.reject(r.status))
    ]);
    if (!(await verifySignature(t, sig, pub))) throw new Error("bad signature");
    const json = JSON.parse(t);
    if (!json.flows || cmpVer(json.minExtVersion || "0", VERSION) > 0) throw new Error("incompatible config");
    let status = null;
    try { status = await (await fetch(url.replace(/[^/]+$/, "status.json"), { credentials: "omit", cache: "no-store" })).json(); } catch {}
    const cfgRemote = { json, status, at: Date.now() };
    await chrome.storage.local.set({ cfgRemote });
    return cfgRemote;
  } catch (e) { console.warn("Remote config not used:", e); return null; }
}
async function getRawConfig(force = false) {
  if (cfgMem && !force && Date.now() - cfgMem.at < 3600e3) return cfgMem;
  const bundled = await (await fetch(chrome.runtime.getURL("config/selectors.json"))).json();
  const prefs = await loadPrefs();
  let cfg = bundled, source = "built-in", status = null;
  let { cfgRemote } = await chrome.storage.local.get("cfgRemote");
  if (prefs.remoteConfigUrl && (!cfgRemote || force || Date.now() - cfgRemote.at > 6 * 3600e3)) cfgRemote = (await fetchRemote(prefs)) || cfgRemote;
  if (prefs.remoteConfigUrl && cfgRemote?.json && cfgRemote.json.version > bundled.version) { cfg = cfgRemote.json; source = "remote"; status = cfgRemote.status; }
  // Remote config may only ADD forbidden words, never remove the built-in ones.
  cfg.forbiddenButtonText = [...new Set([...HARD_FORBIDDEN, ...(cfg.forbiddenButtonText || [])].map(s => s.toLowerCase()))];
  cfgMem = { cfg, source, status, at: Date.now() };
  return cfgMem;
}
function schemaFieldDefs(cfg, schemaName, sourceRoot) {
  return flatFields(SCHEMAS[schemaName]).map(f => {
    const last = f.key.split(".").pop();
    const def = { key: f.key, type: f.type, source: `${sourceRoot}.${f.key}`, optional: !f.required,
      dependsOn: f.dependsOn, showIf: f.showIf, label: f.label,
      strategies: [{ label: f.label }, { attr: { formcontrolname: last } }, { attr: { name: last } }, { placeholder: f.label }] };
    return { ...def, ...(cfg.schemaOverrides?.[f.key] || {}) };
  });
}
/** Expanded, data-free config for the content script. */
function expandConfig(cfg) {
  const pf = cfg.personFields, flows = {};
  const L = { name: "Name", age: "Age", gender: "Gender", idType: "ID proof type", idNumber: "ID number" };
  for (const [id, f] of Object.entries(cfg.flows)) {
    const e = { id, title: f.title, kind: f.kind, detect: f.detect, maxPersons: f.maxPersons, continue: f.continue || { allowed: false } };
    if (f.kind === "rows") {
      e.rowAnchor = pf.name.strategies;
      e.rowFields = f.rowFields.map(k => ({ key: k, label: L[k] || k, ...pf[k] }));
      e.rowUploads = (f.rowUploads || []).map(u => ({ type: "file", label: u.key === "certDoc" ? "Disability certificate" : "Aadhaar image", ...u }));
      e.passport = f.passport ? cfg.passportPopup : null;
      e.contactFields = (f.contact || []).map(k => ({ key: "contact." + k, label: k[0].toUpperCase() + k.slice(1), ...cfg.contactFields[k] }));
    } else {
      e.schemaFields = schemaFieldDefs(cfg, f.schema, f.sourceRoot);
      if (f.kind === "group") { e.memberContainer = f.memberContainer; e.memberExpand = f.memberExpand; e.maxMembers = f.maxMembers; }
    }
    flows[id] = e;
  }
  return { version: cfg.version, flows, forbidden: cfg.forbiddenButtonText, allowedClose: cfg.allowedCloseButtonText,
    errorSelectors: cfg.errorSelectors, paymentMarkers: cfg.paymentMarkers, reviewMarkers: cfg.reviewMarkers,
    captcha: cfg.captcha, continueButton: cfg.continue };
}

/* ---------------- tabs / injection ---------------- */
function sendToTab(tabId, msg, timeout = 0) {
  return new Promise((resolve, reject) => {
    let done = false, t;
    if (timeout) t = setTimeout(() => { if (!done) { done = true; reject(new Error("TIMEOUT")); } }, timeout);
    chrome.tabs.sendMessage(tabId, msg, res => {
      if (done) return; done = true; clearTimeout(t);
      const err = chrome.runtime.lastError;
      err ? reject(new Error(err.message)) : resolve(res);
    });
  });
}
async function ensureContent(tabId) {
  try { const r = await sendToTab(tabId, { t: "PING" }, 400); if (r?.version === VERSION) return true; } catch {}
  try { await chrome.scripting.executeScript({ target: { tabId }, files: ["content/ttd.js"] }); }
  catch (e) { throw Object.assign(new Error("Cannot access this tab"), { code: "E_INJECT", detail: e.message }); }
  for (let i = 0; i < 5; i++) {
    try { const r = await sendToTab(tabId, { t: "PING" }, 400); if (r?.version === VERSION) return true; } catch {}
    await new Promise(r => setTimeout(r, 150));
  }
  throw Object.assign(new Error("Helper did not start in this tab"), { code: "E_INJECT" });
}

/* ---------------- payload ---------------- */
async function withDocs(person) {
  const p = structuredClone(person);
  if (p.dob) { const a = ageFromDob(p.dob); if (a != null) p.age = a; }
  p.doc = {};
  for (const [k, v] of Object.entries(person.docs || {})) if (typeof v === "string" && v.startsWith("docid:")) p.doc[k] = await getDoc(v.slice(6));
  return p;
}
async function resolveDocsDeep(obj) {
  const out = structuredClone(obj || {});
  const walk = async o => { for (const [k, v] of Object.entries(o)) {
    if (typeof v === "string" && v.startsWith("docid:")) o[k] = await getDoc(v.slice(6));
    else if (v && typeof v === "object" && !Array.isArray(v)) await walk(v);
  } };
  await walk(out); return out;
}
function pickPersons(root, flow) {
  const prof = root.profiles.find(p => p.id === root.activeProfileId) || root.profiles[0];
  const byId = Object.fromEntries(prof.persons.map(p => [p.id, p]));
  let list = (prof.selection || []).map(id => byId[id]).filter(Boolean);
  if (flow.linkSpouse) {
    const out = [];
    for (const p of list) {
      if (!out.includes(p)) out.push(p);
      const s = p.spouseId && byId[p.spouseId];
      if (s && !out.includes(s)) out.push(s);
    }
    list = out;
  }
  const max = flow.maxPersons || 6;
  return { prof, persons: list.slice(0, max), dropped: Math.max(0, list.length - max) };
}
async function buildData(flowId, cfg, root, memberIndex) {
  const flow = cfg.flows[flowId];
  if (flow.kind === "rows") {
    const { prof, persons } = pickPersons(root, flow);
    return { persons: await Promise.all(persons.map(withDocs)), contact: prof.contact || {} };
  }
  if (flow.kind === "schema") return { seva: await resolveDocsDeep(root.seva) };
  const idx = memberIndex ?? root.group.current ?? 0;
  const m = await resolveDocsDeep(root.group.members[idx] || {});
  const temple = getPath(root.group.members[0] || {}, "address.nearestTemple");
  if (temple) { m.address ??= {}; m.address.nearestTemple = temple; }
  return { member: m, memberIndex: idx, memberCount: root.group.members.length };
}

/* ---------------- readiness ---------------- */
async function readiness(flowId, root) {
  const { cfg } = await getRawConfig();
  const flow = cfg.flows[flowId]; if (!flow) return [];
  const issues = [];
  if (flow.kind === "rows") {
    const { prof, persons, dropped } = pickPersons(root, flow);
    if (!persons.length) issues.push({ msg: "No people selected" });
    if (dropped) issues.push({ msg: `${dropped} selected ${dropped === 1 ? "person exceeds" : "people exceed"} this booking's limit (${flow.maxPersons})`, warn: true });
    for (const p of persons) {
      const age = p.dob ? ageFromDob(p.dob) ?? p.age : p.age;
      for (const e of validatePerson({ ...p, age })) issues.push({ msg: `${p.name || "Unnamed"}: ${e.msg}` });
      if (flow.minAge && Number(age) < flow.minAge) issues.push({ msg: `${p.name}: below ${flow.minAge} (a spouse may still be allowed – check TTD rules)`, warn: true });
      for (const u of flow.rowUploads || []) {
        const k = u.source.split(".").pop();
        if (!u.optional && !p.docs?.[k]) issues.push({ msg: `${p.name}: ${k === "aadhaar" ? "Aadhaar image" : "certificate"} not uploaded` });
      }
    }
    for (const e of validateContact(prof.contact, flow.contact || [])) issues.push({ msg: e.msg, warn: e.warn });
  } else {
    const fields = flatFields(SCHEMAS[flow.schema]);
    const data = flow.kind === "group" ? root.group.members[root.group.current || 0] || {} : root.seva;
    for (const f of fields) {
      if (f.showIf && getPath(data, f.showIf.key) !== f.showIf.equals) continue;
      const err = validateSchemaValue(f, getPath(data, f.key));
      if (err) issues.push({ msg: err, warn: !f.required });
    }
  }
  const days = root.meta.lastBackupAt ? (Date.now() - Date.parse(root.meta.lastBackupAt)) / 864e5 : Infinity;
  if (days > root.settings.backupReminderDays) issues.push({ msg: "No recent backup", warn: true });
  return issues;
}

/* ---------------- fill ---------------- */
async function requestFill(tabId, mode, memberIndex) {
  await ensureContent(tabId);
  const det = await sendToTab(tabId, { t: "DETECT" });
  if (!det || det.flow === "unknown") {
    await sendToTab(tabId, { t: "NOTICE", level: "warn", text: "This page isn't a supported booking form." }).catch(() => {});
    return { ok: false, code: "E_UNSUPPORTED", detect: det };
  }
  if (det.step === "payment") return { ok: false, code: "E_PAYMENT", detect: det };
  if (await isLocked()) {
    await sendToTab(tabId, { t: "NOTICE", level: "warn", text: "Locked. Open the extension and enter your PIN." }).catch(() => {});
    return { ok: false, code: "E_LOCKED" };
  }
  const root = await loadRoot();
  const { cfg } = await getRawConfig();
  const data = await buildData(det.flow, cfg, root, memberIndex);
  const report = await sendToTab(tabId, { t: "FILL", flowId: det.flow, mode, data });
  if (report) await onFillDone(report);
  return { ok: !!report?.ok, report, detect: det };
}
async function onFillDone(report) {
  // Store only field keys and statuses – never values.
  const safe = { flow: report.flow, mode: report.mode, at: Date.now(), durationMs: report.durationMs,
    ok: report.ok, total: report.total, passed: report.passed, continued: report.continued, stoppedAt: report.stoppedAt,
    fields: (report.fields || []).map(f => ({ key: f.key, row: f.row, status: f.status, reason: f.reason, strategy: f.strategy })) };
  await chrome.storage.local.set({ lastRun: safe });
  if (report.flow === "group_seva" && report.ok && report.mode !== "PRACTICE") {
    try { await updateRoot(r => { if (r.settings.autoAdvanceGroup && r.group.current < r.group.members.length - 1) r.group.current++; }); } catch {}
  }
}

/* ---------------- events ---------------- */
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === "install") chrome.tabs.create({ url: chrome.runtime.getURL("options/options.html#welcome") });
  // Inject into TTD tabs that were already open, so no refresh is ever needed.
  try {
    const tabs = await chrome.tabs.query({ url: TTD_MATCHES });
    for (const t of tabs) chrome.scripting.executeScript({ target: { tabId: t.id }, files: ["content/ttd.js"] }).catch(() => {});
  } catch {}
});
chrome.commands.onCommand.addListener(async (cmd, tab) => {
  if (!tab?.id) [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  requestFill(tab.id, cmd === "fill-continue" ? "FILL_CONTINUE" : "FILL").catch(e => console.warn(e));
});
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg?.t) {
      case "GET_CONFIG": {
        const { cfg } = await getRawConfig();
        return { config: expandConfig(cfg), prefs: await loadPrefs(), version: VERSION };
      }
      case "REQUEST_FILL": {
        const tabId = msg.tabId ?? sender.tab?.id;
        let mode = msg.mode;
        if (mode === "DEFAULT") mode = (await loadPrefs()).defaultAction === "FILL_CONTINUE" ? "FILL_CONTINUE" : "FILL";
        return requestFill(tabId, mode, msg.memberIndex);
      }
      case "TAB_STATUS": {
        const raw = await getRawConfig();
        let detect = null, error = null;
        try { await ensureContent(msg.tabId); detect = await sendToTab(msg.tabId, { t: "DETECT" }); }
        catch (e) { error = e.code || "E_INJECT"; }
        const locked = await isLocked();
        let ready = null;
        if (detect?.flow && detect.flow !== "unknown" && !locked) ready = await readiness(detect.flow, await loadRoot());
        const { lastRun } = await chrome.storage.local.get("lastRun");
        return { detect, error, readiness: ready, lastRun, locked, configVersion: raw.cfg.version, configSource: raw.source,
          health: raw.status?.flows?.[detect?.flow] || null, healthMessage: raw.status?.message?.en || null,
          flows: Object.fromEntries(Object.entries(raw.cfg.flows).map(([k, v]) => [k, v.title])) };
      }
      case "READINESS": return readiness(msg.flowId, await loadRoot());
      case "CLEAR": await ensureContent(msg.tabId); return sendToTab(msg.tabId, { t: "CLEAR" });
      case "OPEN_OPTIONS": chrome.tabs.create({ url: chrome.runtime.getURL("options/options.html" + (msg.hash || "")) }); return true;
      case "REFRESH_CONFIG": { const r = await getRawConfig(true); return { version: r.cfg.version, source: r.source }; }
      default: return undefined;
    }
  })().then(sendResponse, e => sendResponse({ ok: false, code: e.code || "E_INTERNAL", error: e.message }));
  return true;
});
