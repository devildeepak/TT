# 🛕 Pilgrim Form Helper for Tirumala (v1.2.0)

Free, private, **fill-only** autofill for TTD booking forms (Chrome / Edge, Manifest V3).
Never presses Pay / Confirm / Submit, never touches the CAPTCHA, keeps all data on the device.
Temple-themed interface: sandalwood day theme and temple-lamp night theme, Seven Hills welcome screen, toranam header.

## Quick start (Windows)
```
cd pilgrim-helper\scripts
python build.py dev
```
1. Chrome/Edge → `chrome://extensions` → **Developer mode** on → **Load unpacked** → choose `dist\dev`.
2. Extension **Details** → turn on **Allow access to file URLs**.
3. The Welcome page opens → click **Load 10 sample profiles (test build)**.
4. Open the mock page (path is printed by build.py), e.g.
   `file:///C:/…/pilgrim-helper/test/ttd-mock.html#/special-entry`
5. Click the orange **Fill** button (bottom-right) or press **Alt+A**. Also try `#/srivani`, `#/senior`, `#/srivari-seva`, `#/group-seva`.
6. Switch profiles from the popup (extension icon) to test passports, seniors, invalid data and so on.

After changing code: `python build.py dev` → click ↻ on the extension card → refresh the mock page.

| Command | Output | Use |
|---|---|---|
| `python build.py dev` | `dist/dev` | Mock page testing, includes the sample-profiles button |
| `python build.py` | `dist/release` + zip | Real TTD site and store upload (TTD hosts only, no sample data) |

## Automated tests (38 checks)
```
pip install playwright && playwright install chromium
python scripts/build.py dev && python test/e2e.py
```

## Test profiles (`test/fixtures/test-profiles.json`, all fake)
| # | Profile | Tests |
|---|---|---|
| 01 | Family of 6 | 6-row darshan; on 4 slots it fills 4 and notes 2 |
| 02 | Senior couple | Spouse linked automatically, Aadhaar images |
| 03 | NRI family | Passport and visa popup |
| 04 | Mixed Aadhaar + passport | Popup on one row only |
| 05 | Differently-abled + attendant | Certificate upload |
| 06 | Single | Angapradakshinam / empty-row note |
| 07 | Srivani group of 4 | Srivani limit, Gothram |
| 08 | Friends 8 | Over the limit warning |
| 09 | Invalid data | Bad Aadhaar, short ID, expired visa, under-age senior |
| 10 | Senior couple with DOB | Age worked out from date of birth |
Plus a complete Srivari Seva form and a Group Seva group of 6. Regenerate with `python test/fixtures/make_test_profiles.py`.
Use these only on the mock page, never on the real TTD site.

## Using on the real TTD site
1. Load the unpacked extension from `dist/release`.
2. Open a real TTD booking page and click **Practice** first. If TTD rejects scripted input, the helper will stop with the real-input message and the panel will guide you through Quick Paste / manual entry.
3. When a page opens during a booking slot, click **Capture this page's fields** in the Labs flow to record the exact labels and option text without sending personal values over the network.
4. Keep the fill-only guard in place: stop before Continue / Pay / Submit, and never touch CAPTCHA or OTP.

`config/selectors.json` labels, URL fragments and button texts are still the live-site mapping layer; adjust them when the page structure changes, then rebuild and re-test.

## Signed mapping updates (optional)
`node scripts/sign-config.mjs keygen` → host `selectors.json` + `.sig` + `status.json` on HTTPS →
`PRIVATE_KEY=… node scripts/sign-config.mjs sign selectors.json` → paste the URL and public key in Settings → Field mappings.
Unsigned or tampered files are ignored.

### Quick Paste (when TTD rejects scripted input)
TTD only accepts values you enter yourself. If Fill reports "TTD accepts only details you enter yourself", click **Start Quick Paste**. The panel walks field by field: press Ctrl+V (value is already copied), type the shown number (Age), or choose the shown dropdown value. It advances when the field matches, then verifies. Fill & Continue is disabled in this mode; press Continue yourself. Passport popups are filled by hand.
