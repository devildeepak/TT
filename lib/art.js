// Devotional artwork as inline SVG (no external images, crisp at any size, tiny).

/** Temple tower (gopuram). */
export function gopuram({ w = 40, body = "#fff3d6", line = "#7d1414", glow = false } = {}) {
  let tiers = "";
  for (let i = 0; i < 5; i++) {
    const yb = 96 - i * 13, yt = yb - 12, hb = 32 - i * 5, ht = hb - 3;
    tiers += `<path d="M${50 - hb} ${yb}L${50 + hb} ${yb}L${50 + ht} ${yt}L${50 - ht} ${yt}Z"/>`;
    tiers += `<rect x="${50 - hb - 2}" y="${yb - 2}" width="${2 * hb + 4}" height="3" rx="1"/>`;
    const n = 4 - Math.floor(i / 2);
    for (let k = 0; k < n; k++) {
      const x = 50 - (n - 1) * 5 + k * 10;
      tiers += `<rect x="${x - 1.6}" y="${yt + 3.5}" width="3.2" height="5" rx="1.4" fill="${line}" opacity=".55"/>`;
    }
  }
  return `<svg width="${w}" height="${w * 1.2}" viewBox="0 0 100 120" aria-hidden="true" focusable="false">
    ${glow ? `<defs><radialGradient id="gg" cx="50%" cy="35%" r="60%"><stop offset="0" stop-color="#ffd166" stop-opacity=".55"/><stop offset="1" stop-color="#ffd166" stop-opacity="0"/></radialGradient></defs><circle cx="50" cy="45" r="50" fill="url(#gg)"/>` : ""}
    <g fill="${body}">
      ${tiers}
      <path d="M36 32Q50 14 64 32Z"/><rect x="34" y="31" width="32" height="3" rx="1"/>
      <circle cx="41" cy="20" r="2.4"/><circle cx="50" cy="14" r="3"/><circle cx="59" cy="20" r="2.4"/>
      <rect x="49.3" y="6" width="1.4" height="8"/><rect x="40.4" y="13" width="1.2" height="6"/><rect x="58.4" y="13" width="1.2" height="6"/>
      <rect x="15" y="96" width="70" height="24" rx="1.5"/>
    </g>
    <path d="M43 120V107Q50 98 57 107V120Z" fill="${line}"/>
  </svg>`;
}

/** Lotus flower. */
export function lotus(size = 22, c = "#c9962c") {
  return `<svg width="${size}" height="${Math.round(size * 0.62)}" viewBox="0 0 40 24" aria-hidden="true" focusable="false"><g fill="${c}">
    <path d="M20 1c4.5 5 4.5 12.5 0 21-4.5-8.5-4.5-16 0-21z"/>
    <path d="M20 22c-2-7-7-12.5-14.5-13.5 1 7.5 6.5 12.5 14.5 13.5z" opacity=".85"/>
    <path d="M20 22c2-7 7-12.5 14.5-13.5-1 7.5-6.5 12.5-14.5 13.5z" opacity=".85"/>
    <path d="M20 22C14 19 7 18 .5 19.5 5.5 22.5 13 23.5 20 22z" opacity=".55"/>
    <path d="M20 22c6-3 13-4 19.5-2.5-5 3-12.5 4-19.5 2.5z" opacity=".55"/></g></svg>`;
}

/** Oil lamp (diya). */
export function diya(size = 20) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M12 1.5c2.4 3.2 3.2 5.6 0 8.8-3.2-3.2-2.4-5.6 0-8.8z" fill="#ffd166"/>
    <path d="M12 4.3c1.1 1.7 1.4 2.9 0 4.6-1.4-1.7-1.1-2.9 0-4.6z" fill="#f97316"/>
    <path d="M2.5 12.5h19c-1 4.4-5 6.8-9.5 6.8s-8.5-2.4-9.5-6.8z" fill="currentColor"/>
    <path d="M8 21.3h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
}

/** Small UI icons (stroke style). */
const I = (d, s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`;
export const icon = {
  people: s => I('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.6"/><path d="M16.5 14.6c2.6.2 4.4 1.9 5 4.9"/>', s),
  home: s => I('<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>', s),
  mail: s => I('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 7 8.5-7"/>', s),
  hands: s => I('<path d="M12 21V9.5c0-2 1-3.5 2.5-5.5"/><path d="M12 21V9.5c0-2-1-3.5-2.5-5.5"/><path d="M14.5 4c1.5 2 3.5 4 3.5 8 0 3-1.5 5-3 6l-3 3"/><path d="M9.5 4C8 6 6 8 6 12c0 3 1.5 5 3 6l3 3"/>', s),
  group: s => I('<circle cx="12" cy="7" r="3"/><circle cx="5" cy="10" r="2.3"/><circle cx="19" cy="10" r="2.3"/><path d="M6.5 20c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><path d="M1.5 18c.4-2 1.6-3.3 3.3-3.6"/><path d="M22.5 18c-.4-2-1.6-3.3-3.3-3.6"/>', s),
  save: s => I('<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 17v3h16v-3"/>', s),
  shield: s => I('<path d="M12 3 4.5 6v6c0 4.5 3.2 7.8 7.5 9 4.3-1.2 7.5-4.5 7.5-9V6z"/><path d="m9 12 2 2 4-4"/>', s),
  gear: s => I('<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M4.2 5.6l2.1 2.1M17.7 16.3l2.1 2.1M2.5 12h3M18.5 12h3M4.2 18.4l2.1-2.1M17.7 7.7l2.1-2.1"/>', s),
  help: s => I('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1.9-1.1 1.8"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>', s),
  moon: s => I('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>', s),
  play: s => I('<path d="M5 12h12"/><path d="m13 6 6 6-6 6"/>', s),
  flask: s => I('<path d="M9 3h6"/><path d="M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3"/><path d="M7 15h10"/>', s),
  eraser: s => I('<path d="m15 4 5 5-9 9H6l-3-3z"/><path d="M9 21h12"/>', s),
  check: s => I('<path d="m5 12.5 4.5 4.5L19 7.5"/>', s),
  lock: s => I('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', s),
  plus: s => I('<path d="M12 5v14M5 12h14"/>', s),
  grip: s => I('<circle cx="9" cy="7" r=".8"/><circle cx="15" cy="7" r=".8"/><circle cx="9" cy="12" r=".8"/><circle cx="15" cy="12" r=".8"/><circle cx="9" cy="17" r=".8"/><circle cx="15" cy="17" r=".8"/>', s)
};

/** Dawn over the Seven Hills (Saptagiri) with the temple tower – welcome hero. */
export function sevenHillsScene() {
  const birds = [[420, 70], [445, 58], [468, 74], [560, 92], [585, 80]].map(([x, y]) => `<path d="M${x} ${y}q6-6 12 0q6-6 12 0" stroke="#5c0d0d" stroke-width="2" fill="none" opacity=".55"/>`).join("");
  return `<svg class="scene" viewBox="0 0 1000 300" preserveAspectRatio="xMidYMax slice" role="img" aria-label="Dawn over the Seven Hills">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3b0a1e"/><stop offset=".38" stop-color="#8b1a1a"/>
      <stop offset=".68" stop-color="#e8740c"/><stop offset="1" stop-color="#ffd27a"/></linearGradient>
    <radialGradient id="sun" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff4c2"/><stop offset=".55" stop-color="#ffd166"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>
    <radialGradient id="halo" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffe29a" stop-opacity=".7"/><stop offset="1" stop-color="#ffe29a" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1000" height="300" fill="url(#sky)"/>
  <circle cx="770" cy="200" r="260" fill="url(#halo)"/>
  <g stroke="#ffe29a" stroke-width="2" opacity=".25">${Array.from({ length: 18 }, (_, i) => { const a = Math.PI * (i / 17); return `<line x1="${770 - Math.cos(a) * 100}" y1="${200 - Math.sin(a) * 100}" x2="${770 - Math.cos(a) * 340}" y2="${200 - Math.sin(a) * 340}"/>`; }).join("")}</g>
  <circle cx="770" cy="200" r="92" fill="url(#sun)"/>
  ${birds}
  <path d="M0 230 Q70 170 140 205 T290 190 T430 200 T570 185 T720 200 T860 180 T1000 205 V300 H0Z" fill="#a33a1c" opacity=".55"/>
  <path d="M0 250 Q90 200 180 232 T360 222 T520 196 T680 228 T850 214 T1000 236 V300 H0Z" fill="#6e1712" opacity=".85"/>
  <g transform="translate(704 84) scale(1.32)">${gopuram({ w: 100, body: "#3a0a08", line: "#ffd166" }).replace(/<svg[^>]*>|<\/svg>/g, "")}</g>
  <path d="M0 275 Q120 238 250 262 T500 250 T750 262 T1000 252 V300 H0Z" fill="#3a0a08"/>
  <g fill="#ffd166">${[90, 210, 330, 670, 790, 910].map(x => `<ellipse cx="${x}" cy="284" rx="9" ry="3.5"/><path d="M${x} 270c3 4 3 7 0 10-3-3-3-6 0-10z" fill="#ffb347"/>`).join("")}</g>
</svg>`;
}

/** Decorative kolam corner used as a faint watermark. */
export function kolam(size = 160, c = "#c9962c") {
  let dots = "", loops = "";
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) dots += `<circle cx="${20 + i * 30}" cy="${20 + j * 30}" r="2.4"/>`;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const x = 35 + i * 30, y = 35 + j * 30; loops += `<path d="M${x - 15} ${y}Q${x} ${y - 20} ${x + 15} ${y}Q${x} ${y + 20} ${x - 15} ${y}Z"/>`; }
  return `<svg width="${size}" height="${size}" viewBox="0 0 160 160" aria-hidden="true"><g fill="${c}">${dots}</g><g fill="none" stroke="${c}" stroke-width="1.3">${loops}</g></svg>`;
}
