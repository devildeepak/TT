// Local-only storage with optional PIN encryption (AES-GCM 256, PBKDF2-SHA256).
// Nothing in this file talks to the network.
export const SCHEMA_VERSION = 1;
const ITER = 310000;
const enc = new TextEncoder(), dec = new TextDecoder();

export const newId = () => crypto.randomUUID();
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
function b64big(buf) {
  const u = new Uint8Array(buf); let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}

export function defaultRoot() {
  const pid = newId(), now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    profiles: [{ id: pid, name: "Family", persons: [], contact: { country: "India" }, selection: [] }],
    activeProfileId: pid,
    seva: {},
    group: { members: [{}], current: 0 },
    settings: { defaultAction: "FILL", theme: "system", floatingButton: true, autoAdvanceGroup: true,
      backupReminderDays: 14, labs: false, remoteConfigUrl: "", remotePublicKey: "" },
    meta: { createdAt: now, updatedAt: now, lastBackupAt: null }
  };
}

const MIGRATIONS = {
  // 2: r => { r.settings.newThing = false; return r; }
};
export function migrate(r) {
  let v = r.schemaVersion ?? 1;
  while (MIGRATIONS[v + 1]) { r = MIGRATIONS[v + 1](r); v++; r.schemaVersion = v; }
  const d = defaultRoot();
  r.settings = { ...d.settings, ...(r.settings || {}) };
  r.group ??= d.group; r.seva ??= {}; r.meta ??= d.meta;
  if (!Array.isArray(r.group.members) || !r.group.members.length) r.group.members = [{}];
  if (!Array.isArray(r.profiles) || !r.profiles.length) { r.profiles = d.profiles; r.activeProfileId = d.activeProfileId; }
  for (const p of r.profiles) { p.persons ??= []; p.contact ??= {}; p.selection ??= p.persons.map(x => x.id); }
  if (!r.profiles.some(p => p.id === r.activeProfileId)) r.activeProfileId = r.profiles[0].id;
  return r;
}

/* ---------- crypto ---------- */
async function deriveKey(secret, salt) {
  const base = await crypto.subtle.importKey("raw", enc.encode(secret), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: ITER, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}
async function encryptStr(key, str) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(str));
  return { iv: b64(iv), ct: b64big(ct) };
}
async function decryptStr(key, o) {
  return dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(o.iv) }, key, unb64(o.ct)));
}
async function sessionKey() {
  const { k } = await chrome.storage.session.get("k");
  if (!k) return null;
  return crypto.subtle.importKey("raw", unb64(k), "AES-GCM", true, ["encrypt", "decrypt"]);
}
async function rememberKey(key) { await chrome.storage.session.set({ k: b64(await crypto.subtle.exportKey("raw", key)) }); }

export async function isPinEnabled() { return !!(await chrome.storage.local.get("vault")).vault; }
export async function isLocked() { return (await isPinEnabled()) && !(await sessionKey()); }

/* ---------- root ---------- */
export async function loadRoot() {
  const { root } = await chrome.storage.local.get("root");
  if (!root) return defaultRoot();
  if (root.enc) {
    const key = await sessionKey();
    if (!key) throw Object.assign(new Error("LOCKED"), { code: "LOCKED" });
    return migrate(JSON.parse(await decryptStr(key, root.enc)));
  }
  return migrate(root);
}
export async function saveRoot(root) {
  root.meta.updatedAt = new Date().toISOString();
  // Settings hold no personal data; mirrored unencrypted so the page button works while locked.
  await chrome.storage.local.set({ prefs: root.settings });
  if (await isPinEnabled()) {
    const key = await sessionKey();
    if (!key) throw Object.assign(new Error("LOCKED"), { code: "LOCKED" });
    await chrome.storage.local.set({ root: { enc: await encryptStr(key, JSON.stringify(root)) } });
  } else await chrome.storage.local.set({ root });
}
export async function updateRoot(fn) { const r = await loadRoot(); await fn(r); await saveRoot(r); return r; }
export async function loadPrefs() {
  const { prefs } = await chrome.storage.local.get("prefs");
  return { ...defaultRoot().settings, ...(prefs || {}) };
}

/* ---------- documents (data URLs) ---------- */
export async function putDoc(dataUrl, id = newId()) {
  const key = (await isPinEnabled()) ? await sessionKey() : null;
  await chrome.storage.local.set({ ["doc:" + id]: key ? { enc: await encryptStr(key, dataUrl) } : dataUrl });
  return id;
}
export async function getDoc(id) {
  if (!id) return null;
  const v = (await chrome.storage.local.get("doc:" + id))["doc:" + id];
  if (!v) return null;
  if (typeof v === "string") return v;
  const key = await sessionKey();
  if (!key) throw Object.assign(new Error("LOCKED"), { code: "LOCKED" });
  return decryptStr(key, v.enc);
}
export async function deleteDoc(id) { if (id) await chrome.storage.local.remove("doc:" + id); }
export function referencedDocIds(root) {
  const ids = new Set();
  const walk = o => { if (!o || typeof o !== "object") return;
    for (const v of Object.values(o)) { if (typeof v === "string" && v.startsWith("docid:")) ids.add(v.slice(6)); else walk(v); } };
  walk(root.profiles); walk(root.seva); walk(root.group);
  return ids;
}
export async function cleanupDocs(root) {
  const all = await chrome.storage.local.get(null), keep = referencedDocIds(root);
  const del = Object.keys(all).filter(k => k.startsWith("doc:") && !keep.has(k.slice(4)));
  if (del.length) await chrome.storage.local.remove(del);
  return del.length;
}

/* ---------- PIN ---------- */
async function allDocKeys() { return Object.keys(await chrome.storage.local.get(null)).filter(k => k.startsWith("doc:")); }
export async function enablePin(pin) {
  if (!/^\d{6}$/.test(pin)) throw new Error("PIN must be 6 digits");
  if (await isPinEnabled()) throw new Error("PIN already enabled");
  const root = await loadRoot();
  const docs = {}; for (const k of await allDocKeys()) docs[k] = await getDoc(k.slice(4));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(pin, salt);
  const check = await encryptStr(key, "ok");
  await rememberKey(key);
  await chrome.storage.local.set({ vault: { salt: b64(salt), check } });
  await saveRoot(root);
  for (const [k, v] of Object.entries(docs)) await putDoc(v, k.slice(4));
}
export async function unlock(pin) {
  const { vault } = await chrome.storage.local.get("vault");
  if (!vault) return true;
  const key = await deriveKey(pin, unb64(vault.salt));
  try { if ((await decryptStr(key, vault.check)) !== "ok") return false; } catch { return false; }
  await rememberKey(key); return true;
}
export async function lock() { await chrome.storage.session.remove("k"); }
export async function disablePin(pin) {
  if (!(await unlock(pin))) throw new Error("Wrong PIN");
  const root = await loadRoot();
  const docs = {}; for (const k of await allDocKeys()) docs[k] = await getDoc(k.slice(4));
  await chrome.storage.local.remove("vault"); await lock();
  await saveRoot(root);
  for (const [k, v] of Object.entries(docs)) await putDoc(v, k.slice(4));
}
export async function wipeAll() { await chrome.storage.local.clear(); await chrome.storage.session.clear(); }

/* ---------- backup ---------- */
export async function exportBackup(passphrase) {
  const root = await loadRoot();
  const docs = {};
  for (const id of referencedDocIds(root)) { const d = await getDoc(id); if (d) docs[id] = d; }
  const payload = JSON.stringify({ root, docs });
  if (!passphrase) return JSON.stringify({ format: "pilgrimhelper", v: 1, encrypted: false, data: JSON.parse(payload) });
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(passphrase, salt);
  return JSON.stringify({ format: "pilgrimhelper", v: 1, encrypted: true, kdf: { salt: b64(salt), iter: ITER }, ...(await encryptStr(key, payload)) });
}
export async function readBackup(text, passphrase) {
  let f; try { f = JSON.parse(text); } catch { throw new Error("Not a valid backup file"); }
  if (f.format !== "pilgrimhelper") throw new Error("Not a Pilgrim Helper backup");
  let data;
  if (f.encrypted) {
    if (!passphrase) throw Object.assign(new Error("Passphrase required"), { code: "NEED_PASS" });
    const key = await deriveKey(passphrase, unb64(f.kdf.salt));
    try { data = JSON.parse(await decryptStr(key, f)); } catch { throw new Error("Wrong passphrase"); }
  } else data = f.data;
  if (!data?.root?.profiles) throw new Error("Backup is incomplete");
  data.root = migrate(data.root);
  return data;
}
export async function applyBackup(data, mode) {
  for (const [id, d] of Object.entries(data.docs || {})) await putDoc(d, id);
  if (mode === "replace") { await saveRoot(data.root); return data.root; }
  return updateRoot(r => {
    for (const p of data.root.profiles) {
      const ex = r.profiles.find(x => x.id === p.id || x.name === p.name);
      if (!ex) { r.profiles.push(p); continue; }
      for (const per of p.persons) {
        const dup = ex.persons.find(x => x.id === per.id ||
          (x.name === per.name && String(x.idNumber).slice(-4) === String(per.idNumber).slice(-4)));
        if (dup) Object.assign(dup, per); else ex.persons.push(per);
      }
      ex.contact = { ...ex.contact, ...p.contact };
    }
    if (Object.keys(data.root.seva || {}).length) r.seva = data.root.seva;
    if (data.root.group?.members?.some(m => Object.keys(m).length)) r.group = data.root.group;
  });
}
export async function markBackedUp() { await updateRoot(r => { r.meta.lastBackupAt = new Date().toISOString(); }); }
export function backupAsText(root) {
  const lines = [];
  for (const p of root.profiles) {
    lines.push(`== ${p.name} ==`);
    p.persons.forEach((x, i) => {
      let s = `${i + 1}. ${x.name}, ${x.age}, ${x.gender}, ${x.idType === "PASSPORT" ? "Passport" : "Aadhaar"} ${x.idNumber}`;
      if (x.idType === "PASSPORT" && x.passport) s += ` (Country ${x.passport.country}, Visa ${x.passport.visaNo} ${x.passport.visaType || ""}, valid ${x.passport.validity})`;
      if (x.tags?.length) s += ` [${x.tags.join(", ")}]`;
      lines.push(s);
    });
    const c = p.contact || {};
    lines.push(`Contact: ${[c.email, c.mobile, c.city, c.state, c.country, c.pincode, c.gothram && "Gothram " + c.gothram].filter(Boolean).join(", ")}`, "");
  }
  return lines.join("\n");
}
