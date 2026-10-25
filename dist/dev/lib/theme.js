export function applyTheme(theme) {
  const r = document.documentElement;
  if (theme === "light" || theme === "dark") r.dataset.theme = theme; else delete r.dataset.theme;
}
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const mask = id => { const s = String(id ?? "").replace(/\s/g, ""); return s ? "••" + s.slice(-4) : ""; };
export const initials = n => String(n ?? "").replace(/^test\s+/i, "").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("") || "?";
