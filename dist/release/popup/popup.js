import { loadRoot, updateRoot, isLocked, unlock, loadPrefs } from "../lib/store.js";
import { applyTheme, esc, mask, initials } from "../lib/theme.js";
import { gopuram, lotus, diya, icon } from "../lib/art.js";

const $ = id => document.getElementById(id);
let tab = null, status = null, root = null;
const send = msg => new Promise(res => chrome.runtime.sendMessage(msg, r => { void chrome.runtime.lastError; res(r); }));

// artwork
$("logo").innerHTML = gopuram({ w: 30, body: "#ffe6a6", line: "#7d1414" });
$("theme").innerHTML = icon.moon(16);
$("settings").innerHTML = icon.people(17);
$("diyaIcon").innerHTML = diya(20);
$("footLotus").innerHTML = lotus(26);
$("lockArt").innerHTML = gopuram({ w: 54, body: "#c9962c", line: "#fff3d6", glow: true });

const STOPS = {
  PAYMENT: "Stopped at the payment step. Payment is your decision.", CAPTCHA: "Please type the CAPTCHA, then Continue.", FILL_ONLY: "Fill-only booking. Continue yourself.",
  VALIDATION_ERRORS: "TTD shows errors on the page.", NO_CONTINUE: "Continue button not found.", FORBIDDEN_BUTTON: "Next button looked like Pay/Submit, so it wasn't clicked.",
  CONTINUE_DISABLED: "Continue is still disabled.", FIELDS_FAILED: "Not continued: some fields need attention.", DONE: "Continued."
};
const CODES = {
  E_UNSUPPORTED: "This page isn't a supported booking form.", E_PAYMENT: "Payment page. Nothing to fill here.", E_LOCKED: "Locked. Please enter your PIN.",
  E_INJECT: "Can't access this tab. Open a TTD booking page.", E_NO_ROWS: "Pilgrim rows aren't loaded yet. Wait a moment.",
  E_WRONG_PAGE: "The page changed. Please try again.", E_MEMBER_NOT_FOUND: "Member section not found on the page.", E_BUSY: "Already filling…"
};
const STATUS_ICONS = { ok: lotus(28, "#b8862b"), idle: gopuram({ w: 26, body: "#b8862b", line: "#fff3d6" }), warn: diya(24) };

async function init() {
  applyTheme((await loadPrefs()).theme);
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (await isLocked()) { $("lock").classList.remove("hidden"); $("main").classList.add("hidden"); $("pin").focus(); return; }
  $("lock").classList.add("hidden"); $("main").classList.remove("hidden");
  root = await loadRoot();
  renderPeople();
  await refreshStatus();
}

function setStatus(kind, html) { $("statusIcon").innerHTML = STATUS_ICONS[kind] || STATUS_ICONS.idle; $("pageLine").innerHTML = html; }

async function refreshStatus() {
  const isTTD = tab?.url && (/^https:\/\/([a-z0-9-]+\.)*ttdevasthanams\.ap\.gov\.in\//i.test(tab.url) || /ttd-mock\.html/i.test(tab.url));
  if (!isTTD) {
    status = null;
    setStatus("idle", `<strong>Namaskaram 🙏</strong><br><span class="small">Open a TTD booking page and the helper will be ready to fill.</span>`);
    $("healthLine").textContent = "";
    setButtons(false); renderReadiness(null); renderLast(); return;
  }
  status = await send({ t: "TAB_STATUS", tabId: tab.id });
  const d = status?.detect;
  if (status?.error || !d) { setStatus("warn", `<span class="bad">${esc(CODES[status?.error] || "Couldn't check this tab.")}</span>`); setButtons(false); return; }
  if (d.step === "payment") { setStatus("warn", `<strong>Payment page</strong><br><span class="small">The helper rests here. Payment is your decision.</span>`); setButtons(false); }
  else if (d.flow === "unknown") { setStatus("idle", `<strong>TTD page</strong><br><span class="small warn">Open the pilgrim details page to fill.</span>`); setButtons(false); }
  else {
    const slots = d.slots != null ? `${d.slots} slot${d.slots === 1 ? "" : "s"} on this page` : d.members != null ? `${d.members} member section(s)` : "Ready to fill";
    setStatus("ok", `<strong>${esc(d.title)}</strong> <span class="ok">✔</span><br><span class="small">${esc(slots)}${d.step === "waiting" ? ' · <span class="warn">form still loading</span>' : ""}</span>`);
    setButtons(true, d.canContinue);
  }
  const h = status.health;
  $("healthLine").innerHTML = (h === "degraded" ? `<span class="warn">⚠ Under repair. Use the Copy buttons.</span> ` : h === "working" ? `<span class="ok">Working ✔</span> · ` : "")
    + `Mappings ${esc(status.configVersion)} (${esc(status.configSource)})` + (status.healthMessage ? `<br>${esc(status.healthMessage)}` : "");
  $("limitNote").textContent = d.maxPersons ? `This booking fills up to ${d.maxPersons} ${d.maxPersons === 1 ? "person" : "people"}, in the order shown.` : "";
  const schema = d.kind === "schema" || d.kind === "group";
  $("memberBox").classList.toggle("hidden", d.kind !== "group");
  $("people").classList.toggle("hidden", schema);
  $("profile").classList.toggle("hidden", schema);
  $("peopleTitle").textContent = d.kind === "group" ? "Group Seva" : d.kind === "schema" ? "Srivari Seva details" : "Who is going?";
  if (d.kind === "schema") $("limitNote").textContent = "Uses the Srivari Seva details saved in settings.";
  if (d.kind === "group") renderMembers();
  renderReadiness(status.readiness);
  renderLast();
}

function setButtons(on, canContinue) {
  for (const id of ["btnFill", "btnPractice", "btnClear"]) $(id).disabled = !on;
  $("btnFillC").disabled = !on || !canContinue;
  $("btnFillC").title = canContinue ? "Fill, then press Continue (stops before payment)" : "This booking is fill-only";
}
const activeProfile = () => root.profiles.find(p => p.id === root.activeProfileId) || root.profiles[0];

function renderPeople() {
  const sel = $("profile");
  sel.innerHTML = root.profiles.map(p => `<option value="${esc(p.id)}">${esc(p.name)} (${p.persons.length})</option>`).join("");
  sel.value = root.activeProfileId;
  const prof = activeProfile(), ul = $("people");
  if (!prof.persons.length) {
    ul.innerHTML = `<li class="empty"><div><div class="mut">No one added yet.</div><button type="button" class="btn btn-gold btn-sm" id="addPeople" style="margin-top:8px">${icon.plus(14)} Add family members</button></div></li>`;
    $("addPeople").onclick = () => openOptions("#people"); return;
  }
  const order = [...prof.selection.filter(id => prof.persons.some(p => p.id === id)), ...prof.persons.filter(p => !prof.selection.includes(p.id)).map(p => p.id)];
  let n = 0;
  ul.innerHTML = order.map(id => {
    const p = prof.persons.find(x => x.id === id), on = prof.selection.includes(id);
    const senior = p.tags?.includes("SENIOR"), da = p.tags?.includes("DIFFERENTLY_ABLED");
    return `<li draggable="true" data-id="${esc(id)}" class="${on ? "" : "off"}">
      <span class="grip" aria-hidden="true">${icon.grip(14)}</span>
      <span class="order">${on ? ++n : ""}</span>
      <span class="avatar ${senior ? "senior" : ""}" aria-hidden="true">${esc(initials(p.name))}</span>
      <span class="nm"><b>${esc(p.name)}</b><span>${esc(p.age)} · ${{ M: "Male", F: "Female", T: "Transgender" }[p.gender] || ""} · ${p.idType === "PASSPORT" ? "Passport" : "Aadhaar"} ${esc(mask(p.idNumber))}${senior ? " · Senior" : ""}${da ? " · Differently-abled" : ""}</span></span>
      <input type="checkbox" ${on ? "checked" : ""} aria-label="Include ${esc(p.name)}"></li>`;
  }).join("");
  ul.querySelectorAll("input[type=checkbox]").forEach(cb => cb.addEventListener("change", saveSelection));
  let dragEl = null;
  ul.querySelectorAll("li[draggable]").forEach(li => {
    li.addEventListener("dragstart", () => { dragEl = li; li.classList.add("dragging"); });
    li.addEventListener("dragend", () => { li.classList.remove("dragging"); dragEl = null; saveSelection(); });
    li.addEventListener("dragover", e => { e.preventDefault(); if (!dragEl || dragEl === li) return;
      const after = e.clientY > li.getBoundingClientRect().top + li.offsetHeight / 2; li.parentNode.insertBefore(dragEl, after ? li.nextSibling : li); });
  });
}
async function saveSelection() {
  const lis = [...$("people").querySelectorAll("li[data-id]")];
  const ids = lis.filter(li => li.querySelector("input").checked).map(li => li.dataset.id), all = lis.map(li => li.dataset.id);
  root = await updateRoot(r => {
    const p = r.profiles.find(x => x.id === r.activeProfileId);
    p.selection = ids; p.persons.sort((a, b) => all.indexOf(a.id) - all.indexOf(b.id));
  });
  renderPeople();
  if (status?.detect?.flow && status.detect.flow !== "unknown") renderReadiness(await send({ t: "READINESS", flowId: status.detect.flow }));
}
function renderMembers() {
  const sel = $("member");
  sel.innerHTML = root.group.members.map((m, i) => `<option value="${i}">${i === 0 ? "Leader" : "Member " + (i + 1)}: ${esc(m.identity?.name || "(empty)")}</option>`).join("");
  sel.value = String(root.group.current || 0);
}
$("member").addEventListener("change", async e => { root = await updateRoot(r => { r.group.current = +e.target.value; }); renderReadiness(await send({ t: "READINESS", flowId: "group_seva" })); });
$("profile").addEventListener("change", async e => {
  root = await updateRoot(r => { r.activeProfileId = e.target.value; }); renderPeople();
  if (status?.detect?.flow && status.detect.flow !== "unknown") renderReadiness(await send({ t: "READINESS", flowId: status.detect.flow }));
});

function renderReadiness(list) {
  const ul = $("ready"), b = $("readyBadge");
  if (!list) { ul.innerHTML = `<li class="mut">Open a supported booking page to check your details.</li>`; b.innerHTML = ""; return; }
  const errs = list.filter(i => !i.warn), warns = list.filter(i => i.warn);
  b.innerHTML = errs.length ? `<span class="badge bad">✖ ${errs.length} to fix</span>` : warns.length ? `<span class="badge warn">Ready, with notes</span>` : `<span class="badge ok">✔ Ready</span>`;
  ul.innerHTML = list.length ? list.slice(0, 8).map(i => `<li class="${i.warn ? "warn" : "bad"}">${esc(i.msg)}</li>`).join("") + (list.length > 8 ? `<li class="mut">+${list.length - 8} more</li>` : "")
    : `<li class="ok">All details look good. May your darshan be blessed 🙏</li>`;
}
async function renderLast() {
  const { lastRun } = await chrome.storage.local.get("lastRun");
  $("lastRun").textContent = lastRun ? `Last fill: ${lastRun.passed}/${lastRun.total} ${lastRun.ok ? "✔" : "✖"} · ${(lastRun.durationMs / 1000).toFixed(1)} s` : "No fills yet";
  const days = root.meta.lastBackupAt ? Math.floor((Date.now() - Date.parse(root.meta.lastBackupAt)) / 864e5) : null;
  $("backupLine").innerHTML = days == null ? `<a href="#" id="bk">Back up your details</a>`
    : `Backup: ${days === 0 ? "today" : days + " day(s) ago"}${days > root.settings.backupReminderDays ? ` · <a href="#" id="bk">Back up now</a>` : ""}`;
  const bk = $("bk"); if (bk) bk.onclick = e => { e.preventDefault(); openOptions("#backup"); };
}

async function doFill(mode) {
  $("result").textContent = "Filling with care…";
  for (const id of ["btnFill", "btnFillC", "btnPractice"]) $(id).disabled = true;
  const r = await send({ t: "REQUEST_FILL", tabId: tab.id, mode });
  const rep = r?.report;
  if (!rep || rep.error) $("result").innerHTML = `<span class="bad">${esc(CODES[rep?.error || r?.code] || r?.error || "Something went wrong.")}</span>`;
  else {
    const failed = rep.fields.filter(f => f.status === "FAILED");
    $("result").innerHTML = (rep.ok ? `<span class="ok">✔ All ${rep.total} details filled in ${(rep.durationMs / 1000).toFixed(1)} s</span>`
      : `<span class="bad">Filled ${rep.passed} of ${rep.total}. ${failed.length} need attention (see the panel on the page)</span>`)
      + (rep.stoppedAt ? `<br>${esc(STOPS[rep.stoppedAt] || rep.stoppedAt)}` : "")
      + (rep.notes || []).map(n => `<br><span class="warn">${esc(n)}</span>`).join("");
  }
  await refreshStatus();
}
$("btnFill").onclick = () => doFill("FILL");
$("btnFillC").onclick = () => doFill("FILL_CONTINUE");
$("btnPractice").onclick = () => doFill("PRACTICE");
$("btnClear").onclick = async () => { const r = await send({ t: "CLEAR", tabId: tab.id }); $("result").textContent = `Cleared ${r?.cleared ?? 0} field(s).`; };

function openOptions(hash = "") { send({ t: "OPEN_OPTIONS", hash }); window.close(); }
$("settings").onclick = () => openOptions("#people");
$("help").onclick = e => { e.preventDefault(); openOptions("#help"); };
$("theme").onclick = async () => {
  const cur = document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const next = cur === "dark" ? "light" : "dark"; applyTheme(next);
  try { await updateRoot(r => { r.settings.theme = next; }); } catch {}
};
$("unlockForm").addEventListener("submit", async e => {
  e.preventDefault(); $("pinErr").textContent = "";
  if (await unlock($("pin").value)) init(); else { $("pinErr").textContent = "That PIN didn't match."; $("pin").select(); }
});
init();
