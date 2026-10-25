// Validators shared by options, popup and background.
const D = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]];
const P = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];

export const clean = s => String(s ?? "").replace(/\s+/g, "");
export function isValidAadhaar(n) {
  n = clean(n);
  if (!/^[2-9]\d{11}$/.test(n)) return false;
  let c = 0;
  [...n].reverse().forEach((ch, i) => { c = D[c][P[i % 8][+ch]]; });
  return c === 0;
}
export const isValidIndianPassport = n => /^[A-PR-WY][1-9]\d{5}[1-9]$/i.test(clean(n));
export const isValidPassport = n => isValidIndianPassport(n) || /^[A-Z0-9]{6,12}$/i.test(clean(n));
export const isValidEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e ?? "").trim());
export const isValidMobile = m => /^(\+\d{1,3})?[6-9]\d{9}$/.test(clean(m)) || /^\+\d{8,15}$/.test(clean(m));
export const isValidPincode = p => /^[1-9]\d{5}$/.test(clean(p)) || /^[A-Z0-9 -]{3,10}$/i.test(String(p ?? "").trim());
export const isValidName = n => /^[A-Za-z][A-Za-z .']{1,49}$/.test(String(n ?? "").trim());
export const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa",
  "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala",
  "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland",
  "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands",
  "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir",
  "Ladakh", "Lakshadweep", "Puducherry"
];
export function normalizeState(v) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  const map = {
    ap: "Andhra Pradesh", ts: "Telangana", tg: "Telangana", ka: "Karnataka", tn: "Tamil Nadu",
    kl: "Kerala", mh: "Maharashtra", dl: "Delhi", or: "Odisha", odisha: "Odisha",
    orissa: "Odisha", puducherry: "Puducherry", pondicherry: "Puducherry",
    uttarakhand: "Uttarakhand", uttaranchal: "Uttarakhand", telangana: "Telangana"
  };
  const key = s.replace(/&/gi, "and").replace(/[^a-z]/gi, "").toLowerCase();
  if (map[key]) return map[key];
  const exact = INDIAN_STATES.find(st => st.toLowerCase() === s.toLowerCase());
  if (exact) return exact;
  const wide = INDIAN_STATES.find(st => st.toLowerCase().includes(s.toLowerCase()) || s.toLowerCase().includes(st.toLowerCase()));
  return wide || s;
}

export function parseDMY(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s ?? "").trim());
  if (!m) return null;
  const d = new Date(+m[3], +m[2] - 1, +m[1]);
  return d.getDate() === +m[1] && d.getMonth() === +m[2] - 1 ? d : null;
}
export function ageFromDob(dmy) {
  const d = parseDMY(dmy); if (!d) return null;
  const now = new Date(); let a = now.getFullYear() - d.getFullYear();
  if (now < new Date(now.getFullYear(), d.getMonth(), d.getDate())) a--;
  return a;
}
export function validatePerson(p) {
  const e = [];
  if (!isValidName(p.name)) e.push({ field: "name", msg: "Name: 2–50 letters" });
  const age = Number(p.age);
  if (!Number.isInteger(age) || age < 1 || age > 120) e.push({ field: "age", msg: "Age: 1–120" });
  if (!["M", "F", "T"].includes(p.gender)) e.push({ field: "gender", msg: "Choose gender" });
  if (p.idType === "AADHAAR" && !isValidAadhaar(p.idNumber)) e.push({ field: "idNumber", msg: "Aadhaar number is not valid (12 digits, checksum)" });
  if (p.idType === "PASSPORT") {
    if (!isValidPassport(p.idNumber)) e.push({ field: "idNumber", msg: "Passport number is not valid" });
    const pp = p.passport || {};
    if (!pp.country) e.push({ field: "passport.country", msg: "Passport: country required" });
    if (!pp.visaNo) e.push({ field: "passport.visaNo", msg: "Passport: visa/OCI number required" });
    const v = parseDMY(pp.validity);
    if (!v) e.push({ field: "passport.validity", msg: "Visa validity: DD/MM/YYYY" });
    else if (v < new Date()) e.push({ field: "passport.validity", msg: "Visa validity is in the past" });
  }
  return e;
}
export function validateContact(c = {}, needed = []) {
  const e = [];
  if (needed.includes("email") && !isValidEmail(c.email)) e.push({ field: "email", msg: "Email is not valid" });
  if (needed.includes("city") && !String(c.city ?? "").trim()) e.push({ field: "city", msg: "City required" });
  if (needed.includes("pincode") && !isValidPincode(c.pincode)) e.push({ field: "pincode", msg: "Pincode is not valid" });
  if (needed.includes("gothram") && !String(c.gothram ?? "").trim()) e.push({ field: "gothram", msg: "Gothram (needed for Homam)", warn: true });
  return e;
}
export function validateSchemaValue(f, v) {
  const s = String(v ?? "").trim();
  if (f.required && (v == null || s === "" || v === false)) return `${f.label} is required`;
  if (!s) return null;
  switch (f.validate) {
    case "email": return isValidEmail(s) ? null : "Email is not valid";
    case "mobile": case "mobileOptional": return isValidMobile(s) ? null : "Mobile number is not valid";
    case "pincode": return isValidPincode(s) ? null : "Pincode is not valid";
    case "date": return parseDMY(s) ? null : "Use DD/MM/YYYY";
    case "name": return isValidName(s) ? null : "Use letters only";
    default: return null;
  }
}
