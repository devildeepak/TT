# PROJECT_CONTEXT – read this first (for Copilot / any helper)

## What it is
Personal side project of Deepak VATTI. Chrome/Edge MV3 extension "Pilgrim Form Helper for Tirumala".
Plain JavaScript (ES modules for extension pages, one classic content script). No framework, no npm build.

## Non-negotiable rules
1. Fill-only. Never click Pay / Confirm / Submit / Book Now / I Agree (hard-coded list in content/ttd.js and background.js; remote config can only ADD words).
2. Never touch the CAPTCHA or OTP. Never auto-refresh, poll or book without a user click.
3. Personal data only in chrome.storage.local (optional AES-GCM PIN). Never in network requests.
4. "Filled ✔" only after read-back verification of every field.
5. Core booking flows always free. No hidden PIN codes (Labs toggle instead).
6. Not affiliated with TTD: no TTD logo, neutral name, disclaimer everywhere.

## Files
| File | Role |
|---|---|
| manifest.json | Release manifest (TTD hosts only). build.py dev adds localhost/file + "(DEV)" |
| background/background.js | Config load (bundled + signed remote), expandConfig, on-demand injection (no refresh), payload with documents, readiness, shortcuts, group auto-advance |
| content/ttd.js | Detection, resolver (label → attr → placeholder → css strategies), setters (native setter + events, typing fallback, select, custom select, radio, checkbox, multi, date, file), passport popup, verify + retry, Continue guard, practice/clear, Shadow-DOM pill + results panel (temple theme), SPA watcher |
| config/selectors.json | Field mappings per flow (PLACEHOLDERS until mapped from live TTD) |
| lib/store.js | Storage, PIN encryption, documents, migrations, backup/restore, text export, prefs mirror |
| lib/validation.js | Aadhaar Verhoeff, passport, email, mobile, pincode, DOB |
| lib/sevaSchema.js | Srivari Seva / Group fields (drive both the settings forms and filling) |
| lib/art.js | SVG artwork: gopuram, lotus, diya, icons, Seven Hills scene, kolam |
| lib/ui.css | Design system: sandalwood/kumkum/saffron/gold, day and night themes, toranam, buttons, cards |
| lib/theme.js, lib/image.js | Theme, escaping, masking, initials; image compression |
| popup/* | Page status, who is going (drag order), Fill / Fill & Continue / Practice / Clear, readiness, PIN unlock |
| options/* | Welcome hero, People (cards, edit dialog), Contact, Srivari Seva, Group Seva, Backup, Security, Settings, Help |
| test/ttd-mock.html | Mock TTD pages behaving like React (ignores plain .value) |
| test/e2e.py | 38 Playwright checks; test/fixtures/test-profiles.json = 10 fake profiles |
| scripts/build.py, scripts/sign-config.mjs | Builds; Ed25519 signing of remote mappings |

## Flows (config/selectors.json → flows)
sed (6), arjitha (6, 2 continues, gothram), srivani (4, fill-only), senior (2, spouse link, Aadhaar upload),
differently_abled (2, certificate), angapradakshinam (1), srivari_seva (schema), group_seva (15, accordion, auto-advance).

## Changelog
- 1.0.0 (24 Oct 2026) – engine, all flows, PIN, backup, signed mappings, 33 tests.
- 1.1.0 (24 Oct 2026) – devotional redesign (temple header, toranam, Seven Hills welcome, gold avatars, day/night themes,
  in-page panel restyle), 10 fake test profiles + "Load sample profiles" button in DEV builds, 38 tests.
- 1.1.1 (24 Oct 2026) – added real-world `pilgrim-details` route alias and broader field selectors for TTD forms; e2e launch now falls back to the installed Edge browser when Chromium is missing.
- 1.3.0 (25 Oct 2026) ? fixes Ammavari/real TTD not filling: TTD ignores scripted input (isTrusted), so scripted fill now flags `trustedGuard` (never "Filled ?", Fill & Continue disabled) and offers **Quick Paste**: step-by-step panel where the user presses Ctrl+V / types / chooses, auto-advance on matching value, Back/Skip/jump-to-field, final read-back verify, never presses Continue. Contact fill order is Country ? State ? City ? Pincode ? Email. Mock `?strict=1` and e2e checks added. Passport popup is manual and reported as such.
- 1.2.2 (25 Oct 2026) ? Special Entry Darshan (Ammavari Temple, Tiruchanoor) confirmed from TTD JS: it is the `/spat/pilgrim-details` route (SPAT = Sri Padmavathi Ammavari Temple, `sedTempleFlow`), same shared form as SED; `/ssdpat/pilgrim-details` (slotted sarva darshan at Ammavari) added to the spat flow detection.
- 1.2.1 (25 Oct 2026) ? field names confirmed from TTD public JS and live /pilgrim-details (contact `emailId`, `city`, `state`, `country`, `pincode`; row `fname`, `age`, `gender`, `photoIdType`, `idProofNumber`; passport `visaNumber`, `visaType`, `visaValidityDate`); added placeholder strategies, `/pld` and `/agp` routes, li/div fallback for TTD custom dropdowns. Live: scripted input is rejected (isTrusted), typed input accepted, so Quick Paste is the real path.
- 1.2.0 (24 Oct 2026) – broadened real-site host support to `tirupatibalaji.ap.gov.in` and optional `ttdsevaonline.com`, updated selector versioning and `attrContains`/`notUrl` handling, aligned the field selectors with the public TTD autofill adapters (`fname`, `photoIdType`, `idProofNumber`, `pincode`, etc.), added state normalization and real-site route detection improvements.

## Open to-dos
- Confirm selectors with capture files for SED, SPAT, Arjitha, Senior/PLD, Medical, Angapradakshinam, Srivani (+ donation site), Srivari Seva, Group Seva, passport popup.
- Validate real TTD field names on the production host during an open booking slot and keep the route aliases in sync.
- Telugu / Hindi / Tamil / Kannada interface text.
- Firefox build; daily health-check workflow; privacy/FAQ website.

## How to ask for a change
Upload the latest zip (without dist/) and say: "Read PROJECT_CONTEXT.md. Problem: …. Give full updated files, run e2e, update changelog."

## Real-site facts (gathered 25 Oct 2026 from TTD public JS, live /pilgrim-details, public open-source adapter code and tests)
- KNOWN: SED and SPAT /pilgrim-details rows use `fname`, `age`, `gender`, `photoIdType`, `idProofNumber`; `id` of each input is the row index. General Details inputs there are `emailId`, `city`, `state`, `country`, `pincode`.
- KNOWN: Special Entry Darshan (Ammavari Temple, Tiruchanoor) = `/spat/pilgrim-details` (SPAT = Sri Padmavathi Ammavari Temple); same row + General Details fields as SED (`fname, age, gender, photoIdType, idProofNumber`; `emailId, city, state, country, pincode`). Slotted Sarva Darshan at Ammavari = `/ssdpat/pilgrim-details`, same row fields.
- KNOWN: Arjitha / Homam / Virtual Seva use `pilgrimEmail`, `pilgrimCity`, `pilgrimState`, `pilgrimCountry`, `pilgrimPincode`, `gothram`.
- KNOWN: PLD (senior citizen) rows use `name`, `age`, `idNumber`, plus "Upload Document" (hidden file input, .jpeg/.png/.pdf, rejects > 1000 KB).
- KNOWN: Gender options Female/Male/Transgender; ID proof options Aadhaar Card/Passport; ID number max 12 chars and disabled until ID type chosen; name pattern letters+space, max 80.
- KNOWN: Passport popup inputs `country`, `visaNumber`, `visaType`, `visaValidityDate`.
- KNOWN: TTD's shared text field ignores untrusted events (isTrusted); State and Country dropdowns open and accept an option only on a trusted click. Quick Paste / user-driven entry is the supported path.
- KNOWN: pincode must be 6 digits or "Please enter valid pincode" blocks Continue.
- UNVERIFIED: person-row DOM on a live open slot; Srivani donation site; Angapradakshinam photo upload.
