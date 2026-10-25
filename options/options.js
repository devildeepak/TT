import {
  loadRoot, updateRoot, newId, isLocked, unlock, lock, isPinEnabled, enablePin, disablePin, wipeAll,
  putDoc, getDoc, deleteDoc, cleanupDocs, exportBackup, readBackup, applyBackup, markBackedUp, backupAsText
} from "../lib/store.js";
import { SEVA_SCHEMA, GROUP_MEMBER_SCHEMA, INDIAN_STATES, getPath, setPath, flatFields } from "../lib/sevaSchema.js";
import { validatePerson, validateContact, validateSchemaValue, ageFromDob } from "../lib/validation.js";
import { compressImage } from "../lib/image.js";
import { applyTheme, esc, mask, initials } from "../lib/theme.js";
import { gopuram, lotus, diya, icon, sevenHillsScene, kolam } from "../lib/art.js";

const $ = (s, r = document) => r.querySelector(s);
const view = $("#view"), dlg = $("#dlg");
let root = null;
const VERSION = chrome.runtime.getManifest().version;
const GENDER = { M: "Male", F: "Female", T: "Transgender" };

$("#logo").innerHTML = gopuram({ w: 34, body: "#ffe6a6", line: "#7d1414" });
$("#theme").innerHTML = icon.moon(16);
$("#wm").innerHTML = kolam(320);
$("#theme").onclick = async () => {
  const cur = document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const next = cur === "dark" ? "light" : "dark"; applyTheme(next);
  try { await save(r => { r.settings.theme = next; }); } catch {}
};

const NAV = [
  ["welcome", "Welcome", icon.home], ["people", "People & profiles", icon.people], ["contact", "Contact details", icon.mail],
  ["seva", "Srivari Seva", icon.hands], ["group", "Group Seva", icon.group], ["backup", "Backup & restore", icon.save],
  ["security", "Security (PIN)", icon.shield], ["settings", "Settings", icon.gear], ["help", "Help & FAQ", icon.help]
];
$("#nav").innerHTML = NAV.map(([id, label, ic]) => `<a href="#${id}"><span class="ni">${ic(16)}</span>${esc(label)}</a>`).join("")
  + `<div class="navfoot">${lotus(28)}<br>Your details stay on this device.<br>Not affiliated with TTD.</div>`;

function flash(msg = "Saved ✔") { $("#saved").textContent = msg; clearTimeout(flash.t); flash.t = setTimeout(() => $("#saved").textContent = "", 1800); }
async function save(fn) { root = await updateRoot(fn); flash(); return root; }
function debounce(fn, ms = 400) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
const send = msg => new Promise(res => chrome.runtime.sendMessage(msg, r => { void chrome.runtime.lastError; res(r); }));
const activeProfile = () => root.profiles.find(p => p.id === root.activeProfileId) || root.profiles[0];
const title = (t, sub, art = lotus(30)) => `<div class="page-title">${art}<h2>${esc(t)}</h2></div>${sub ? `<p class="page-sub">${sub}</p>` : ""}`;

/* ================= router ================= */
const ROUTES = { welcome, people, contact, seva, group, backup, security, settings, help };
async function route() {
  if (await isLocked()) return renderLocked();
  root = await loadRoot();
  applyTheme(root.settings.theme);
  const name = (location.hash || (root.profiles.some(p => p.persons.length) ? "#people" : "#welcome")).slice(1);
  document.querySelectorAll("nav a").forEach(a => a.classList.toggle("on", a.getAttribute("href") === "#" + name));
  await (ROUTES[name] || people)();
  view.focus({ preventScroll: true });
}
window.addEventListener("hashchange", route);

function renderLocked() {
  view.innerHTML = `<div class="card" style="max-width:460px;margin:40px auto;text-align:center">
    <div>${gopuram({ w: 70, body: "#c9962c", line: "#fff3d6", glow: true })}</div>
    <h3 style="justify-content:center">Your details are locked</h3><p class="mut">Enter your 6-digit PIN.</p>
    <form id="uf" class="row" style="justify-content:center"><input id="pin" type="password" inputmode="numeric" maxlength="6" style="max-width:180px;text-align:center;letter-spacing:6px" aria-label="PIN"><button class="btn btn-primary">Unlock</button></form>
    <p id="pe" class="bad" role="alert"></p><p class="small mut">Forgot your PIN? It can't be recovered. <a href="#" id="wipe">Erase everything</a> and restore from a backup.</p></div>`;
  $("#uf").onsubmit = async e => { e.preventDefault(); if (await unlock($("#pin").value)) route(); else $("#pe").textContent = "That PIN didn't match."; };
  $("#wipe").onclick = async e => { e.preventDefault(); if (confirm("Erase ALL saved data on this device?")) { await wipeAll(); route(); } };
}

/* ================= generic field rendering ================= */
function fieldHtml(f, value, idp = "") {
  const id = idp + f.key.replace(/\W/g, "_"), req = f.required ? " *" : "";
  if (f.type === "checkbox") return `<div class="fld chk"><label><input type="checkbox" id="${id}" data-k="${f.key}" ${value ? "checked" : ""}> ${esc(f.label)}</label></div>`;
  if (f.type === "radio") return `<div class="fld"><label>${esc(f.label)}${req}</label><div class="radios">${f.options.map(o => `<label><input type="radio" name="${id}" data-k="${f.key}" value="${esc(o)}" ${value === o ? "checked" : ""}> ${esc(o)}</label>`).join("")}</div></div>`;
  if (f.type === "multi") { const v = Array.isArray(value) ? value : []; return `<div class="fld" style="grid-column:1/-1"><label>${esc(f.label)}</label><div class="multi">${f.options.map(o => `<label><input type="checkbox" data-multi="${f.key}" value="${esc(o)}" ${v.includes(o) ? "checked" : ""}> ${esc(o)}</label>`).join("")}</div></div>`; }
  if (f.type === "file") return `<div class="fld"><label for="${id}">${esc(f.label)}</label><div class="row">${value ? `<img class="thumb" data-thumb="${f.key}" alt="">` : ""}<input type="file" id="${id}" data-file="${f.key}" accept="${esc(f.accept || "image/*")}" style="flex:1">${value ? `<button type="button" class="btn btn-sm" data-rmfile="${f.key}">Remove</button>` : ""}</div><div class="hint">JPEG/PNG, shrunk under ${((f.maxBytes || 1048576) / 1048576).toFixed(0)} MB automatically</div><div class="err" data-err="${f.key}"></div></div>`;
  if (f.type === "textarea") return `<div class="fld" style="grid-column:1/-1"><label for="${id}">${esc(f.label)}${req}</label><textarea id="${id}" data-k="${f.key}" rows="2">${esc(value)}</textarea><div class="err" data-err="${f.key}"></div></div>`;
  if (f.type === "select" && f.options && !f.free) return `<div class="fld"><label for="${id}">${esc(f.label)}${req}</label><select id="${id}" data-k="${f.key}"><option value="">Select</option>${f.options.map(o => `<option ${value === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select><div class="err" data-err="${f.key}"></div></div>`;
  const list = f.options ? `list="${id}_l"` : "";
  return `<div class="fld"><label for="${id}">${esc(f.label)}${req}</label><input id="${id}" data-k="${f.key}" value="${esc(value)}" ${list} ${f.type === "date" ? 'placeholder="DD/MM/YYYY"' : ""}>${f.options ? `<datalist id="${id}_l">${f.options.map(o => `<option value="${esc(o)}">`).join("")}</datalist>` : ""}${f.hint ? `<div class="hint">${esc(f.hint)}</div>` : ""}<div class="err" data-err="${f.key}"></div></div>`;
}
/** Renders a schema form bound to a data object; persists via onChange(data). */
function schemaForm(container, schema, getData, onChange, idp) {
  const data = getData();
  container.innerHTML = schema.map(sec => `<div class="card"><h3>${lotus(20)} ${esc(sec.section)}</h3><div class="grid">${sec.fields.map(f => `<div data-wrap="${f.key}">${fieldHtml(f, getPath(data, f.key) ?? "", idp)}</div>`).join("")}</div></div>`).join("");
  const fields = flatFields(schema);
  const applyShowIf = () => { const d = getData(); for (const f of fields) if (f.showIf) container.querySelector(`[data-wrap="${f.key}"]`).classList.toggle("hidden", getPath(d, f.showIf.key) !== f.showIf.equals); };
  const validateAll = () => { const d = getData(); for (const f of fields) { const e = container.querySelector(`[data-err="${f.key}"]`); if (e && f.type !== "file") e.textContent = validateSchemaValue(f, getPath(d, f.key)) || ""; } };
  const persist = debounce(async () => { await onChange(getData()); validateAll(); }, 400);
  container.addEventListener("input", e => {
    const k = e.target.dataset.k, m = e.target.dataset.multi, d = getData();
    if (k) setPath(d, k, e.target.type === "checkbox" ? e.target.checked : e.target.value);
    if (m) setPath(d, m, [...container.querySelectorAll(`[data-multi="${m}"]:checked`)].map(x => x.value));
    applyShowIf(); persist();
  });
  container.addEventListener("change", async e => {
    const fk = e.target.dataset.file; if (!fk || !e.target.files[0]) return;
    const f = fields.find(x => x.key === fk), errEl = container.querySelector(`[data-err="${fk}"]`);
    try {
      const url = await compressImage(e.target.files[0], f.maxBytes || 1048576);
      const d = getData(), old = getPath(d, fk);
      setPath(d, fk, "docid:" + (await putDoc(url)));
      if (typeof old === "string" && old.startsWith("docid:")) await deleteDoc(old.slice(6));
      await onChange(d); route();
    } catch (err) { errEl.textContent = err.message; }
  });
  container.addEventListener("click", async e => {
    const fk = e.target.dataset.rmfile; if (!fk) return;
    const d = getData(), old = getPath(d, fk);
    if (typeof old === "string" && old.startsWith("docid:")) await deleteDoc(old.slice(6));
    setPath(d, fk, ""); await onChange(d); route();
  });
  container.querySelectorAll("[data-thumb]").forEach(async img => {
    const v = getPath(getData(), img.dataset.thumb);
    if (typeof v === "string" && v.startsWith("docid:")) { const u = await getDoc(v.slice(6)); if (u?.startsWith("data:image")) img.src = u; else img.replaceWith(Object.assign(document.createElement("span"), { textContent: "PDF ✔" })); }
  });
  applyShowIf(); validateAll();
}

/* ================= welcome ================= */
async function welcome() {
  let sample = null;
  try { const r = await fetch(chrome.runtime.getURL("config/sample-profiles.json")); if (r.ok) sample = await r.text(); } catch {}
  const count = root.profiles.reduce((s, p) => s + p.persons.length, 0);
  view.innerHTML = `
  <section class="hero rise">${sevenHillsScene()}
    <div class="copy">
      <div class="te" lang="te">ఓం నమో వేంకటేశాయ</div>
      <h1>Namaskaram 🙏<br>Book your darshan with a calm mind</h1>
      <p>Save your family's details once. On booking day, one click fills the TTD form, so you can focus on the Lord, not on typing.</p>
      <div class="cta">
        <a class="btn btn-primary btn-lg" href="#people">${count ? "View your people" : "Add your family"}</a>
        ${sample ? `<button type="button" class="btn btn-gold btn-lg" id="loadSample">Load 10 sample profiles (test build)</button>` : ""}
      </div>
    </div>
  </section>
  <div class="card"><h3>${lotus(22)} Three gentle promises</h3><div class="promises">
    <div class="promise"><span class="pi">${icon.shield(22)}</span><div><b>Private</b><br><span class="small mut">Details stay only on this device</span></div></div>
    <div class="promise"><span class="pi">${diya(22)}</span><div><b>Fill-only</b><br><span class="small mut">Never presses Pay, Submit or CAPTCHA</span></div></div>
    <div class="promise"><span class="pi">${icon.check(22)}</span><div><b>Honest</b><br><span class="small mut">Says “filled” only when TTD keeps it</span></div></div>
    <div class="promise"><span class="pi">${icon.hands(22)}</span><div><b>Free</b><br><span class="small mut">Every booking type, no payment</span></div></div>
  </div></div>
  <div class="card"><h3>${lotus(22)} Your path, step by step</h3><div class="steps">
    ${[["Add your people", "Name, age, gender and ID. Tag seniors and link spouses.", "#people"],
       ["Add contact details", "Email, city and pincode, used on every booking.", "#contact"],
       ["Seva details (optional)", "For Srivari Seva or a Group Seva of up to 15.", "#seva"],
       ["Take a backup", "Keep your details safe for any device.", "#backup"],
       ["Practice once", "Open the booking page and press Practice run in the popup.", null],
       ["On booking day", "Click Fill (Alt+A). Type the CAPTCHA, check, and continue yourself.", null]]
      .map(([t, d, h], i) => `<div class="step"><span class="num">${i + 1}</span><div><b>${h ? `<a href="${h}">${esc(t)}</a>` : esc(t)}</b><span class="small mut">${esc(d)}</span></div></div>`).join("")}
  </div></div>`;
  const ls = $("#loadSample");
  if (ls) ls.onclick = async () => {
    if (!confirm("Replace current data with 10 fake test profiles?")) return;
    await applyBackup(await readBackup(sample), "replace"); root = await loadRoot();
    flash("Sample profiles loaded ✔"); location.hash = "#people";
  };
}

/* ================= people ================= */
function people() {
  const prof = activeProfile();
  view.innerHTML = title("People & profiles", "Keep separate groups, such as Family or Parents. Choose who goes and in what order from the popup.") + `
  <div class="card"><div class="tabs">${root.profiles.map(p => `<button type="button" data-prof="${p.id}" class="btn btn-sm ${p.id === prof.id ? "on" : ""}">${esc(p.name)} · ${p.persons.length}</button>`).join("")}
    <button type="button" class="btn btn-sm btn-gold" id="addProf" ${root.profiles.length >= 12 ? "disabled" : ""}>${icon.plus(14)} New profile</button></div>
    <div class="row"><button type="button" class="btn btn-sm" id="renProf">Rename</button><button type="button" class="btn btn-sm btn-danger" id="delProf" ${root.profiles.length < 2 ? "disabled" : ""}>Delete profile</button></div></div>
  <div class="card"><div class="row" style="justify-content:space-between;margin-bottom:10px"><h3 style="margin:0">${lotus(22)} ${esc(prof.name)}</h3>
    <button type="button" class="btn btn-primary" id="addPerson" ${prof.persons.length >= 10 ? "disabled" : ""}>${icon.plus(15)} Add person</button></div>
    <div id="plist" class="pgrid"></div>
    <p class="small mut" style="margin-top:10px">Limits per booking: darshan 6, Srivani 4, senior citizen 2 (with spouse).</p></div>`;
  const list = $("#plist");
  list.innerHTML = prof.persons.length ? prof.persons.map(p => {
    const issues = validatePerson({ ...p, age: p.dob ? ageFromDob(p.dob) ?? p.age : p.age });
    const spouse = p.spouseId && prof.persons.find(x => x.id === p.spouseId);
    const senior = p.tags?.includes("SENIOR");
    return `<div class="pcard"><span class="avatar ${senior ? "senior" : ""}">${esc(initials(p.name))}</span>
      <div class="who"><b>${esc(p.name)}</b><div class="meta">${esc(p.age)} yrs · ${GENDER[p.gender] || "—"} · ${p.idType === "PASSPORT" ? "Passport" : "Aadhaar"} ${esc(mask(p.idNumber))}</div>
        <div class="tags">${senior ? `<span class="badge gold">Senior</span>` : ""}${p.tags?.includes("DIFFERENTLY_ABLED") ? `<span class="badge gold">Differently-abled</span>` : ""}
        ${spouse ? `<span class="badge">Spouse: ${esc(spouse.name)}</span>` : ""}${p.docs?.aadhaar ? `<span class="badge ok">Aadhaar image ✔</span>` : ""}${p.docs?.cert ? `<span class="badge ok">Certificate ✔</span>` : ""}
        ${issues.length ? `<span class="badge bad" title="${esc(issues.map(i => i.msg).join("\n"))}">✖ ${issues.length} to fix</span>` : `<span class="badge ok">✔ Valid</span>`}</div>
        ${issues.length ? `<div class="small bad" style="margin-top:4px">${issues.map(i => esc(i.msg)).join(" · ")}</div>` : ""}</div>
      <div class="acts"><button type="button" class="btn btn-sm" data-edit="${p.id}">Edit</button><button type="button" class="btn btn-sm btn-danger" data-del="${p.id}">Delete</button></div></div>`;
  }).join("") : `<div class="mut" style="padding:20px;text-align:center">${gopuram({ w: 50, body: "#c9962c", line: "#fff3d6" })}<br>No one here yet. Add the first person 🙏</div>`;

  view.querySelectorAll("[data-prof]").forEach(b => b.onclick = async () => { await save(r => { r.activeProfileId = b.dataset.prof; }); people(); });
  $("#addProf").onclick = async () => { const n = prompt("Profile name (e.g. Parents)"); if (!n) return; const id = newId(); await save(r => { r.profiles.push({ id, name: n.trim().slice(0, 40), persons: [], contact: { ...activeProfile().contact }, selection: [] }); r.activeProfileId = id; }); people(); };
  $("#renProf").onclick = async () => { const n = prompt("New name", prof.name); if (!n) return; await save(r => { r.profiles.find(p => p.id === prof.id).name = n.trim().slice(0, 40); }); people(); };
  $("#delProf").onclick = async () => { if (!confirm(`Delete profile “${prof.name}” and its people?`)) return; await save(r => { r.profiles = r.profiles.filter(p => p.id !== prof.id); r.activeProfileId = r.profiles[0].id; }); await cleanupDocs(root); people(); };
  $("#addPerson").onclick = () => editPerson(null);
  view.querySelectorAll("[data-edit]").forEach(b => b.onclick = () => editPerson(b.dataset.edit));
  view.querySelectorAll("[data-del]").forEach(b => b.onclick = async () => {
    const p = prof.persons.find(x => x.id === b.dataset.del); if (!confirm(`Delete ${p.name}?`)) return;
    await save(r => { const pr = r.profiles.find(x => x.id === prof.id); pr.persons = pr.persons.filter(x => x.id !== p.id); pr.selection = pr.selection.filter(x => x !== p.id); pr.persons.forEach(x => { if (x.spouseId === p.id) delete x.spouseId; }); });
    await cleanupDocs(root); people();
  });
}

function editPerson(id) {
  const prof = activeProfile();
  const p = structuredClone(prof.persons.find(x => x.id === id) || { id: newId(), name: "", age: "", gender: "", idType: "AADHAAR", idNumber: "", passport: {}, tags: [], docs: {} });
  const others = prof.persons.filter(x => x.id !== p.id);
  dlg.innerHTML = `<form method="dialog" id="pf"><div class="dlg-hd"><h3>${id ? "Edit" : "Add"} person</h3></div><div class="dlg-body">
  <div class="card"><h3>${lotus(20)} Details as on the ID</h3><div class="grid">
    <div class="fld"><label for="p_name">Name *</label><input id="p_name" value="${esc(p.name)}" required maxlength="50"></div>
    <div class="fld"><label for="p_dob">Date of birth (optional)</label><input id="p_dob" placeholder="DD/MM/YYYY" value="${esc(p.dob || "")}"><div class="hint">If given, age is worked out on booking day</div></div>
    <div class="fld"><label for="p_age">Age *</label><input id="p_age" type="number" min="1" max="120" value="${esc(p.age)}"></div>
    <div class="fld"><label for="p_gender">Gender *</label><select id="p_gender"><option value="">Select</option><option value="M">Male</option><option value="F">Female</option><option value="T">Transgender</option></select></div>
    <div class="fld"><label for="p_idType">ID proof *</label><select id="p_idType"><option value="AADHAAR">Aadhaar Card</option><option value="PASSPORT">Passport</option></select></div>
    <div class="fld"><label for="p_idNumber">ID number *</label><input id="p_idNumber" value="${esc(p.idNumber)}" autocomplete="off"></div>
  </div></div>
  <div id="ppBox" class="card"><h3>${lotus(20)} Passport &amp; visa (NRI / foreign devotees)</h3><div class="grid">
    <div class="fld"><label for="pp_country">Country (as listed on TTD)</label><input id="pp_country" value="${esc(p.passport?.country || "")}"></div>
    <div class="fld"><label for="pp_visaNo">Visa / OCI number</label><input id="pp_visaNo" value="${esc(p.passport?.visaNo || "")}"></div>
    <div class="fld"><label for="pp_visaType">Type of visa (as listed on TTD)</label><input id="pp_visaType" value="${esc(p.passport?.visaType || "")}"></div>
    <div class="fld"><label for="pp_validity">Visa validity</label><input id="pp_validity" placeholder="DD/MM/YYYY" value="${esc(p.passport?.validity || "")}"></div>
  </div></div>
  <div class="card"><h3>${lotus(20)} Special darshan</h3><div class="grid">
    <div class="fld chk"><label><input type="checkbox" id="t_senior" ${p.tags?.includes("SENIOR") ? "checked" : ""}> Senior citizen</label></div>
    <div class="fld chk"><label><input type="checkbox" id="t_da" ${p.tags?.includes("DIFFERENTLY_ABLED") ? "checked" : ""}> Differently-abled</label></div>
    <div class="fld"><label for="p_spouse">Spouse (added automatically in senior booking)</label><select id="p_spouse"><option value="">None</option>${others.map(o => `<option value="${o.id}">${esc(o.name)}</option>`).join("")}</select></div>
    <div class="fld"><label for="d_aadhaar">Aadhaar image</label><input type="file" id="d_aadhaar" accept="image/jpeg,image/png,application/pdf"><span id="s_aadhaar" class="small ok">${p.docs?.aadhaar ? "Saved ✔" : ""}</span></div>
    <div class="fld"><label for="d_cert">Disability certificate</label><input type="file" id="d_cert" accept="image/jpeg,image/png,application/pdf"><span id="s_cert" class="small ok">${p.docs?.cert ? "Saved ✔" : ""}</span></div>
  </div></div>
  <div id="perr" class="bad small" role="alert" style="margin:0 12px"></div></div>
  <div class="dlg-ft"><button type="button" class="btn" id="pcancel">Cancel</button><button type="button" class="btn hidden" id="psaveAny">Save anyway</button><button type="submit" class="btn btn-primary" id="psave">Save</button></div></form>`;
  $("#p_gender").value = p.gender || ""; $("#p_idType").value = p.idType || "AADHAAR"; $("#p_spouse").value = p.spouseId || "";
  const syncPP = () => $("#ppBox").classList.toggle("hidden", $("#p_idType").value !== "PASSPORT");
  $("#p_idType").onchange = syncPP; syncPP();
  $("#p_dob").oninput = () => { const a = ageFromDob($("#p_dob").value); if (a != null) $("#p_age").value = a; };
  const newDocs = {};
  for (const k of ["aadhaar", "cert"]) $("#d_" + k).onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    $("#s_" + k).textContent = "Compressing…";
    try { newDocs[k] = await compressImage(f, 1048576); $("#s_" + k).textContent = "Ready ✔"; }
    catch (err) { $("#s_" + k).textContent = err.message; e.target.value = ""; }
  };
  const collect = () => ({ ...p, name: $("#p_name").value.trim(), dob: $("#p_dob").value.trim(), age: Number($("#p_age").value), gender: $("#p_gender").value,
    idType: $("#p_idType").value, idNumber: $("#p_idNumber").value.replace(/\s+/g, "").toUpperCase(),
    passport: { country: $("#pp_country").value.trim(), visaNo: $("#pp_visaNo").value.trim(), visaType: $("#pp_visaType").value.trim(), validity: $("#pp_validity").value.trim() },
    tags: [$("#t_senior").checked && "SENIOR", $("#t_da").checked && "DIFFERENTLY_ABLED"].filter(Boolean), spouseId: $("#p_spouse").value || undefined });
  const doSave = async person => {
    for (const [k, url] of Object.entries(newDocs)) {
      const old = person.docs?.[k];
      person.docs = { ...(person.docs || {}), [k]: "docid:" + (await putDoc(url)) };
      if (old?.startsWith?.("docid:")) await deleteDoc(old.slice(6));
    }
    await save(r => {
      const pr = r.profiles.find(x => x.id === prof.id);
      const i = pr.persons.findIndex(x => x.id === person.id);
      if (i >= 0) pr.persons[i] = person; else { pr.persons.push(person); pr.selection.push(person.id); }
      pr.persons.forEach(x => { if (x.id !== person.id && x.spouseId === person.id && person.spouseId !== x.id) delete x.spouseId; });
      if (person.spouseId) { const s = pr.persons.find(x => x.id === person.spouseId); if (s) s.spouseId = person.id; }
    });
    dlg.close(); people();
  };
  $("#pf").onsubmit = async e => {
    e.preventDefault();
    const person = collect();
    if (!person.name) { $("#perr").textContent = "Name is required."; return; }
    const errs = validatePerson(person);
    if (errs.length) { $("#perr").innerHTML = errs.map(x => esc(x.msg)).join("<br>"); $("#psaveAny").classList.remove("hidden"); return; }
    doSave(person);
  };
  $("#psaveAny").onclick = () => doSave(collect());
  $("#pcancel").onclick = () => dlg.close();
  dlg.showModal(); $("#p_name").focus();
}

/* ================= contact ================= */
function contact() {
  const prof = activeProfile(), c = prof.contact || {};
  view.innerHTML = title("Contact details", `Used on every booking for the profile <b>${esc(prof.name)}</b>.`, icon.mail(28)) + `
  <div class="card"><div class="grid" id="cg">
    ${[["email", "Email *"], ["mobile", "Mobile"], ["city", "City *"]].map(([k, l]) => `<div class="fld"><label for="c_${k}">${l}</label><input id="c_${k}" data-c="${k}" value="${esc(c[k] || "")}"></div>`).join("")}
    <div class="fld"><label for="c_state">State</label><input id="c_state" data-c="state" list="stl" value="${esc(c.state || "")}"><datalist id="stl">${INDIAN_STATES.map(s => `<option value="${esc(s)}">`).join("")}</datalist></div>
    <div class="fld"><label for="c_country">Country</label><input id="c_country" data-c="country" value="${esc(c.country || "India")}"></div>
    <div class="fld"><label for="c_pincode">Pincode / Zip *</label><input id="c_pincode" data-c="pincode" value="${esc(c.pincode || "")}"></div>
    <div class="fld"><label for="c_gothram">Gothram (only for Divyanugraha Homam)</label><input id="c_gothram" data-c="gothram" value="${esc(c.gothram || "")}"></div>
  </div><div id="cerr" class="small bad" style="margin-top:8px"></div></div>`;
  const v = () => { $("#cerr").innerHTML = validateContact(activeProfile().contact, ["email", "city", "pincode"]).map(e => esc(e.msg)).join(" · "); };
  const persist = debounce(async (k, val) => { await save(r => { const p = r.profiles.find(x => x.id === prof.id); p.contact = { ...p.contact, [k]: val.trim() }; }); v(); });
  $("#cg").addEventListener("input", e => { if (e.target.dataset.c) persist(e.target.dataset.c, e.target.value); });
  v();
}

/* ================= seva ================= */
function seva() {
  view.innerHTML = title("Srivari Seva", "Volunteer service details. Saved as you type. For dropdowns without a list, type the option exactly as TTD shows it.", icon.hands(28)) + `<div id="sf"></div>`;
  let data = structuredClone(root.seva || {});
  schemaForm($("#sf"), SEVA_SCHEMA, () => data, async d => { data = d; await save(r => { r.seva = structuredClone(d); }); }, "s_");
}

/* ================= group seva ================= */
function group() {
  const g = root.group, cur = Math.min(g.current || 0, g.members.length - 1);
  view.innerHTML = title("Group Seva", "Up to 15 members. The popup fills the selected member, then moves to the next.", icon.group(28)) + `
  <div class="split"><aside class="card"><div class="mlist">${g.members.map((m, i) => `<button type="button" class="btn ${i === cur ? "on" : ""}" data-m="${i}"><span class="avatar" style="width:28px;height:28px;font-size:11px">${i === 0 ? "★" : i + 1}</span><span>${i === 0 ? "Leader" : "Member " + (i + 1)}<small>${esc(m.identity?.name || "(empty)")}</small></span></button>`).join("")}</div>
    <div class="row"><button type="button" class="btn btn-sm btn-gold" id="addM" ${g.members.length >= 15 ? "disabled" : ""}>${icon.plus(14)} Add</button><button type="button" class="btn btn-sm btn-danger" id="rmM" ${g.members.length < 2 || cur === 0 ? "disabled" : ""}>Remove</button></div>
    <label class="small" style="display:flex;gap:6px;margin-top:10px"><input type="checkbox" id="adv" ${root.settings.autoAdvanceGroup ? "checked" : ""}> Move to next member after filling</label></aside>
  <div><div class="card row">${cur === 0 ? `<button type="button" class="btn btn-sm" id="cpAll">Copy address to all members</button><span class="small mut">The leader's nearest TTD temple is used for everyone.</span>` : `<button type="button" class="btn btn-sm" id="cpFrom">Copy address from leader</button>`}</div><div id="gf"></div></div></div>`;
  let data = structuredClone(g.members[cur] || {});
  schemaForm($("#gf"), GROUP_MEMBER_SCHEMA, () => data, async d => { data = d; await save(r => { r.group.members[cur] = structuredClone(d); }); }, "g_");
  view.querySelectorAll("[data-m]").forEach(b => b.onclick = async () => { await save(r => { r.group.current = +b.dataset.m; }); group(); });
  $("#addM").onclick = async () => { await save(r => { r.group.members.push({}); r.group.current = r.group.members.length - 1; }); group(); };
  $("#rmM").onclick = async () => { if (!confirm(`Remove member ${cur + 1}?`)) return; await save(r => { r.group.members.splice(cur, 1); r.group.current = Math.max(0, cur - 1); }); await cleanupDocs(root); group(); };
  $("#adv").onchange = e => save(r => { r.settings.autoAdvanceGroup = e.target.checked; });
  const addrKeys = ["street", "doorNo", "pincode", "country", "state", "district", "city"];
  if ($("#cpAll")) $("#cpAll").onclick = async () => { if (!confirm("Copy the leader's address to every member?")) return; await save(r => { const a = r.group.members[0].address || {}; r.group.members.slice(1).forEach(m => { m.address = { ...(m.address || {}) }; addrKeys.forEach(k => m.address[k] = a[k]); }); }); flash("Copied ✔"); };
  if ($("#cpFrom")) $("#cpFrom").onclick = async () => { await save(r => { const a = r.group.members[0].address || {}; const m = r.group.members[cur]; m.address = { ...(m.address || {}) }; addrKeys.forEach(k => m.address[k] = a[k]); }); group(); };
}

/* ================= backup ================= */
function backup() {
  const last = root.meta.lastBackupAt ? new Date(root.meta.lastBackupAt).toLocaleString() : "never";
  view.innerHTML = title("Backup & restore", `Last backup: <b>${esc(last)}</b>. A backup includes people, contact, seva details and documents.`, icon.save(28)) + `
  <div class="card"><h3>${lotus(20)} Save a backup</h3>
    <div class="grid"><div class="fld"><label for="bp1">Passphrase (recommended)</label><input id="bp1" type="password" autocomplete="new-password"></div>
    <div class="fld"><label for="bp2">Repeat passphrase</label><input id="bp2" type="password" autocomplete="new-password"></div></div>
    <div class="row" style="margin-top:10px"><button type="button" class="btn btn-primary" id="exEnc">${icon.lock(15)} Download protected backup</button><button type="button" class="btn" id="exPlain">Download unprotected (.json)</button></div>
    <p id="exMsg" class="small"></p></div>
  <div class="card"><h3>${lotus(20)} Restore</h3><div class="row"><input type="file" id="imFile" accept=".ttdbackup,.json,application/json" style="max-width:320px">
    <select id="imMode" style="max-width:240px"><option value="merge">Merge with current data</option><option value="replace">Replace everything</option></select></div>
    <div class="fld hidden" id="imPassBox" style="max-width:320px;margin-top:8px"><label for="imPass">Backup passphrase</label><input id="imPass" type="password"></div>
    <div class="row" style="margin-top:10px"><button type="button" class="btn btn-gold" id="imGo" disabled>Restore</button></div><p id="imMsg" class="small" role="alert"></p></div>
  <div class="card"><h3>${lotus(20)} Quick copies</h3><div class="row"><button type="button" class="btn" id="cpText">Copy all details as text</button><button type="button" class="btn" id="print">Printable card (IDs hidden)</button></div>
    <pre id="txt" class="hidden"></pre></div>
  <div class="card"><h3>${lotus(20)} Erase</h3><p class="small mut">Removes every saved detail from this device. Uninstalling the extension does this too.</p><button type="button" class="btn btn-danger" id="wipe">Erase everything</button></div>`;
  const dl = (name, text) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "application/json" })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); };
  const stamp = () => new Date().toISOString().slice(0, 10).replace(/-/g, "");
  $("#exEnc").onclick = async () => {
    const a = $("#bp1").value, b = $("#bp2").value;
    if (a.length < 8) return $("#exMsg").innerHTML = `<span class="bad">Use at least 8 characters.</span>`;
    if (a !== b) return $("#exMsg").innerHTML = `<span class="bad">Passphrases don't match.</span>`;
    dl(`pilgrim-helper-${stamp()}.ttdbackup`, await exportBackup(a)); await markBackedUp(); root = await loadRoot();
    $("#exMsg").innerHTML = `<span class="ok">Downloaded ✔ Keep the passphrase safe. It can't be recovered.</span>`;
  };
  $("#exPlain").onclick = async () => {
    if (!confirm("This file will contain ID numbers in plain text. Continue?")) return;
    dl(`pilgrim-helper-${stamp()}.json`, await exportBackup(null)); await markBackedUp(); root = await loadRoot();
    $("#exMsg").innerHTML = `<span class="ok">Downloaded ✔</span>`;
  };
  let fileText = null;
  $("#imFile").onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    fileText = await f.text(); $("#imGo").disabled = false;
    try { $("#imPassBox").classList.toggle("hidden", !JSON.parse(fileText).encrypted); } catch { $("#imMsg").innerHTML = `<span class="bad">Not a valid backup file.</span>`; }
  };
  $("#imGo").onclick = async () => {
    try {
      const data = await readBackup(fileText, $("#imPass").value);
      const n = data.root.profiles.reduce((s, p) => s + p.persons.length, 0), mode = $("#imMode").value;
      if (!confirm(`Backup has ${data.root.profiles.length} profile(s), ${n} people, ${Object.keys(data.docs || {}).length} document(s).\n${mode === "replace" ? "REPLACE all current data?" : "Merge into current data?"}`)) return;
      await applyBackup(data, mode); root = await loadRoot(); await cleanupDocs(root);
      $("#imMsg").innerHTML = `<span class="ok">Restored ✔</span>`;
    } catch (err) { $("#imMsg").innerHTML = `<span class="bad">${esc(err.message)}</span>`; }
  };
  $("#cpText").onclick = async () => { const t = backupAsText(root); $("#txt").textContent = t; $("#txt").classList.remove("hidden"); try { await navigator.clipboard.writeText(t); flash("Copied ✔"); } catch {} };
  $("#print").onclick = () => {
    const w = window.open("", "_blank");
    const rows = root.profiles.map(p => `<h2>${esc(p.name)}</h2><table border="1" cellpadding="6" cellspacing="0"><tr><th>#</th><th>Name</th><th>Age</th><th>Gender</th><th>ID</th></tr>${p.persons.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.name)}</td><td>${esc(x.age)}</td><td>${esc(x.gender)}</td><td>${x.idType === "PASSPORT" ? "Passport" : "Aadhaar"} ${esc(mask(x.idNumber))}</td></tr>`).join("")}</table>`).join("");
    w.document.write(`<title>Pilgrim details</title><body style="font-family:Georgia,serif;color:#3b1f0e"><h1 style="color:#7d1414">Pilgrim details</h1>${rows}<p style="color:#777">Printed ${new Date().toLocaleString()} · IDs hidden</p></body>`);
    w.document.close(); w.print();
  };
  $("#wipe").onclick = async () => { if (!confirm("Erase ALL saved details on this device? This cannot be undone.")) return; if (prompt("Type ERASE to confirm") !== "ERASE") return; await wipeAll(); location.hash = "#welcome"; route(); };
}

/* ================= security ================= */
async function security() {
  const on = await isPinEnabled();
  view.innerHTML = title("Security", "A PIN encrypts ID numbers, passport details and documents on this device (AES-256). Enter it once per browser session.", icon.shield(28)) + `<div class="card">
  <p class="small warn">If you forget the PIN, your data can't be recovered. Keep a backup.</p>
  ${on ? `<p class="ok"><b>PIN lock is on.</b></p><div class="row"><button type="button" class="btn" id="lockNow">${icon.lock(15)} Lock now</button></div>
     <div class="row" style="margin-top:12px"><input id="pinOff" type="password" inputmode="numeric" maxlength="6" placeholder="Current PIN" style="max-width:160px"><button type="button" class="btn" id="disable">Turn off PIN</button></div>`
  : `<div class="row"><input id="p1" type="password" inputmode="numeric" maxlength="6" placeholder="6-digit PIN" style="max-width:160px"><input id="p2" type="password" inputmode="numeric" maxlength="6" placeholder="Repeat PIN" style="max-width:160px"><button type="button" class="btn btn-primary" id="enable">Turn on PIN</button></div>`}
  <p id="secMsg" class="small" role="alert"></p></div>`;
  const msg = (t, c = "bad") => $("#secMsg").innerHTML = `<span class="${c}">${esc(t)}</span>`;
  if (on) {
    $("#lockNow").onclick = async () => { await lock(); route(); };
    $("#disable").onclick = async () => { try { await disablePin($("#pinOff").value); security(); } catch (e) { msg(e.message); } };
  } else $("#enable").onclick = async () => {
    const a = $("#p1").value, b = $("#p2").value;
    if (!/^\d{6}$/.test(a)) return msg("PIN must be 6 digits."); if (a !== b) return msg("PINs don't match.");
    try { await enablePin(a); security(); } catch (e) { msg(e.message); }
  };
}

/* ================= settings ================= */
function settings() {
  const s = root.settings;
  view.innerHTML = title("Settings", "", icon.gear(28)) + `
  <div class="card"><h3>${lotus(20)} Everyday</h3><div class="grid">
    <div class="fld"><label for="defAct">Floating button action</label><select id="defAct"><option value="FILL">Fill</option><option value="FILL_CONTINUE">Fill &amp; Continue</option></select></div>
    <div class="fld"><label for="theme2">Theme</label><select id="theme2"><option value="system">Follow device</option><option value="light">Day (sandalwood)</option><option value="dark">Night (temple lamp)</option></select></div>
    <div class="fld"><label for="brd">Backup reminder (days)</label><input id="brd" type="number" min="1" max="90" value="${esc(s.backupReminderDays)}"></div>
    <div class="fld chk"><label><input type="checkbox" id="fb" ${s.floatingButton ? "checked" : ""}> Show the floating Fill button on TTD pages</label></div>
    <div class="fld chk"><label><input type="checkbox" id="labs" ${s.labs ? "checked" : ""}> Labs: try new features early (no codes needed)</label></div>
  </div><p class="small"><a href="#" id="shortcuts">Change keyboard shortcuts</a> (Alt+A fill, Alt+S fill &amp; continue)</p></div>
  <div class="card"><h3>${lotus(20)} Field mappings</h3><p class="small mut">Mappings tell the helper where each field is on the TTD page. Optionally point to a signed mappings file so fixes arrive within hours when TTD changes its site. Only that file is downloaded; no personal data is sent.</p>
    <div class="grid"><div class="fld"><label for="rurl">Mappings URL (HTTPS, …/selectors.json)</label><input id="rurl" value="${esc(s.remoteConfigUrl)}" placeholder="https://example.github.io/pilgrim-helper/config/selectors.json"></div>
    <div class="fld"><label for="rkey">Ed25519 public key (base64)</label><input id="rkey" value="${esc(s.remotePublicKey)}"></div></div>
    <div class="row" style="margin-top:10px"><button type="button" class="btn" id="rsave">Save</button><button type="button" class="btn" id="rref">Check for update now</button><span id="rmsg" class="small"></span></div></div>`;
  $("#defAct").value = s.defaultAction; $("#theme2").value = s.theme;
  const set = (k, v) => save(r => { r.settings[k] = v; });
  $("#defAct").onchange = e => set("defaultAction", e.target.value);
  $("#theme2").onchange = async e => { await set("theme", e.target.value); applyTheme(e.target.value); };
  $("#brd").onchange = e => set("backupReminderDays", Math.max(1, Math.min(90, +e.target.value || 14)));
  $("#fb").onchange = e => set("floatingButton", e.target.checked);
  $("#labs").onchange = e => set("labs", e.target.checked);
  $("#shortcuts").onclick = e => { e.preventDefault(); chrome.tabs.create({ url: "chrome://extensions/shortcuts" }); };
  $("#rsave").onclick = async () => {
    const u = $("#rurl").value.trim();
    if (u && !/^https:\/\//.test(u)) return $("#rmsg").innerHTML = `<span class="bad">Must be HTTPS</span>`;
    if (u) { const ok = await chrome.permissions.request({ origins: [new URL(u).origin + "/*"] }).catch(() => false); if (!ok) return $("#rmsg").innerHTML = `<span class="bad">Permission needed to download mappings</span>`; }
    await save(r => { r.settings.remoteConfigUrl = u; r.settings.remotePublicKey = $("#rkey").value.trim(); });
    $("#rmsg").innerHTML = `<span class="ok">Saved</span>`;
  };
  $("#rref").onclick = async () => { const r = await send({ t: "REFRESH_CONFIG" }); $("#rmsg").textContent = r ? `Using ${r.version} (${r.source})` : "Failed"; };
}

/* ================= help ================= */
async function help() {
  const { lastRun } = await chrome.storage.local.get("lastRun");
  view.innerHTML = title("Help & FAQ", "", icon.help(28)) + `<div class="card">
  ${[
    ["Which bookings are supported?", "Special Entry Darshan (₹300), Srivani (current-day and advance), Senior Citizen (with spouse and Aadhaar upload), Differently-abled (with certificate), Angapradakshinam, Arjitha Seva / Homam, Srivari Seva (individual) and Group Seva (up to 15). The popup shows whether the open page is supported."],
    ["Does it work for senior citizens?", "Yes. Tag the person as Senior, link the spouse and add their Aadhaar images in People. The spouse is added automatically."],
    ["Why doesn't it press Pay or fill the CAPTCHA?", "By design. The helper only fills details. Typing the CAPTCHA, checking and paying are always your decision."],
    ["It says “Filled” but I don't see the data.", "This helper reads every field back from the TTD page and only says “filled” when TTD actually kept the value. If a field fails, the panel shows it with Fix and Copy buttons."],
    ["Do I need to refresh the page?", "No. If the page was open before you installed or updated the helper, it starts itself when you click Fill."],
    ["It says “Under repair”.", "TTD changed its page. Fill manually with the Copy buttons; a fix is usually published within hours."],
    ["Where is my data?", "Only in this browser on this device. Nothing is uploaded. Use Backup to move to another device."],
    ["Is there a PIN for beta features?", "No hidden codes. Turn on Labs in Settings."],
    ["Does it work on mobile?", "On Android, use a browser that supports extensions (for example Firefox for Android) once the Firefox version is published."]
  ].map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}</div>
  <div class="card"><h3>${lotus(20)} Report an issue</h3><p class="small mut">Copies technical details only (versions, page type, which fields failed). No names or ID numbers.</p>
  <button type="button" class="btn" id="diag">Copy diagnostic info</button><pre id="dg" class="hidden"></pre></div>
  <p class="small mut" style="margin:12px;text-align:center">${lotus(24)}<br>Version ${VERSION} · Independent tool, not affiliated with, endorsed by, or connected to Tirumala Tirupati Devasthanams.</p>`;
  $("#diag").onclick = async () => {
    const st = await send({ t: "REFRESH_CONFIG" });
    const d = { ext: VERSION, mappings: st, ua: navigator.userAgent, lastRun: lastRun && { flow: lastRun.flow, mode: lastRun.mode, ok: lastRun.ok, passed: lastRun.passed, total: lastRun.total, stoppedAt: lastRun.stoppedAt, failed: lastRun.fields.filter(f => f.status === "FAILED").map(f => `${f.key}${f.row != null ? "#" + (f.row + 1) : ""}:${f.reason}`) } };
    const t = JSON.stringify(d, null, 2); $("#dg").textContent = t; $("#dg").classList.remove("hidden");
    try { await navigator.clipboard.writeText(t); flash("Copied ✔"); } catch {}
  };
}

route();
