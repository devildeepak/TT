"""End-to-end test: loads the DEV build in Chromium and fills the mock TTD pages.
Run:  python scripts/build.py dev && python test/e2e.py
(needs: pip install playwright && playwright install chromium; or set CHROME_PATH)
"""
import asyncio, base64, http.server, json, pathlib, sys, threading, os
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
EXT = ROOT / "dist" / "dev"
PORT = 8765
CHROME = os.environ.get("CHROME_PATH")

D=[[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]]
P=[[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]]
INV=[0,4,3,2,1,5,6,7,8,9]
def aadhaar(base11):
    c=0
    for i,ch in enumerate(reversed(base11)): c=D[c][P[(i+1)%8][int(ch)]]
    return base11+str(INV[c])

PNG = "data:image/png;base64," + base64.b64encode(open(ROOT/"icons"/"icon48.png","rb").read()).decode()

def seed():
    pid = "prof-1"
    persons = [
      {"id":"a","name":"Ramesh Kumar","age":45,"gender":"M","idType":"AADHAAR","idNumber":aadhaar("23456789012"),"tags":[],"docs":{"aadhaar":"docid:img1"}},
      {"id":"b","name":"Lakshmi Kumar","age":68,"gender":"F","idType":"AADHAAR","idNumber":aadhaar("34567890123"),"tags":["SENIOR"],"spouseId":"e","docs":{"aadhaar":"docid:img1"}},
      {"id":"c","name":"Sai Kumar","age":16,"gender":"M","idType":"PASSPORT","idNumber":"N1234567","passport":{"country":"United States","visaNo":"OCI12345","visaType":"OCI","validity":"31/12/2030"},"tags":[],"docs":{}},
      {"id":"d","name":"Anu Kumar","age":12,"gender":"F","idType":"AADHAAR","idNumber":aadhaar("45678901234"),"tags":[],"docs":{}},
      {"id":"e","name":"Venkat Rao","age":70,"gender":"M","idType":"AADHAAR","idNumber":aadhaar("56789012345"),"tags":["SENIOR"],"spouseId":"b","docs":{"aadhaar":"docid:img1"}},
    ]
    member = lambda n: {"identity":{"idType":"Aadhaar Card","idNumber":aadhaar("67890123456"),"name":n,"surname":"Rao","fatherOrSpouse":"Rao","dob":"01/01/1990","mobile":"9876543210","email":"a@b.com","bloodGroup":"O+","gender":"Male","mentallyFit":True,"physicallyFit":True},
        "address":{"street":"MG Road","doorNo":"12","pincode":"560001","country":"India","state":"Karnataka","district":"Bengaluru Urban","city":"Bengaluru","nearestTemple":"Bengaluru"},"photo":"docid:img1"}
    seva = member("Srinivas"); seva["experience"] = {"volunteeredBefore":"Yes","times":"2","languages":["Telugu","Kannada"],"ref1Name":"Ravi"}
    return {"schemaVersion":1,"profiles":[{"id":pid,"name":"Family","persons":persons,"contact":{"email":"family@example.com","city":"Bengaluru","country":"India","state":"Karnataka","pincode":"560001"},"selection":["a","b","c","d"]}],
            "activeProfileId":pid,"seva":seva,"group":{"members":[member("Leader"),member("Second"),member("Third")],"current":1},
            "settings":{"defaultAction":"FILL","theme":"system","floatingButton":True,"autoAdvanceGroup":True,"backupReminderDays":14,"labs":False,"remoteConfigUrl":"","remotePublicKey":""},
            "meta":{"createdAt":"2026-10-24T00:00:00Z","updatedAt":"2026-10-24T00:00:00Z","lastBackupAt":None}}

results = []
def check(name, cond, info=""):
    results.append((name, bool(cond)))
    safe_name = name.encode("ascii", "replace").decode("ascii")
    safe_info = str(info).encode("ascii", "replace").decode("ascii")
    print(("PASS " if cond else "FAIL ") + safe_name + ("" if cond else f"  -> {safe_info}"))

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

async def launch(p, **extra):
    candidates = []
    if CHROME:
        candidates.append({"executable_path": CHROME})
    for channel in ["msedge", "chrome", "chromium"]:
        if channel == "chromium":
            candidates.append({"channel": channel})
        elif not any((c.get("executable_path") or "").lower().endswith(f"{channel}.exe") for c in candidates if c.get("executable_path")):
            candidates.append({"channel": channel})
    last_err = None
    for opts in candidates:
        try:
            kw = dict(headless=True, args=[f"--disable-extensions-except={EXT}", f"--load-extension={EXT}"], **extra)
            kw.update(opts)
            ctx = await p.chromium.launch_persistent_context("", **kw)
            sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event("serviceworker", timeout=20000)
            return ctx, sw.url.split("/")[2]
        except Exception as e:
            last_err = e
    raise last_err

async def main():
    os.chdir(ROOT / "test")
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Quiet)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{PORT}/ttd-mock.html"

    async with async_playwright() as p:
        ctx, ext_id = await launch(p)
        await asyncio.sleep(0.5)
        opt = await ctx.new_page()
        await opt.goto(f"chrome-extension://{ext_id}/options/options.html#people")
        await opt.evaluate("""async ([root, png]) => { await chrome.storage.local.set({ root, prefs: root.settings, 'doc:img1': png }); }""", [seed(), PNG])
        page = await ctx.new_page()
        async def go(h):
            await page.goto(url + h); await page.wait_for_timeout(900)
        async def fill(mode="FILL"):
            return await opt.evaluate("""async (mode) => {
              const [t] = await chrome.tabs.query({ url: "http://127.0.0.1/*" });
              return await new Promise(r => chrome.runtime.sendMessage({ t: "REQUEST_FILL", tabId: t.id, mode }, r)); }""", mode)
        async def status():
            return await opt.evaluate("""async () => { const [t] = await chrome.tabs.query({ url: "http://127.0.0.1/*" });
              return await new Promise(r => chrome.runtime.sendMessage({ t: "TAB_STATUS", tabId: t.id }, r)); }""")
        st = lambda: page.evaluate("() => ({...window.__state})")
        async def edit_root(js):
            await opt.evaluate("async () => { const {root} = await chrome.storage.local.get('root'); %s; await chrome.storage.local.set({root}); }" % js)

        # 0. naive .value assignment is lost on this mock (reproduces the review bug)
        await go("#/special-entry")
        await page.evaluate("""() => { const el = document.querySelector('[data-key="p0.name"]'); el.value = 'X'; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('blur')); }""")
        check("mock reproduces 'filled but not visible' for naive setters", (await st()).get("p0.name") in (None, ""))

        # 1. detection
        await go("#/special-entry")
        s = await status()
        check("detects Special Entry Darshan with 4 slots", s["detect"]["flow"] == "sed" and s["detect"]["slots"] == 4, s)
        check("readiness computed", isinstance(s.get("readiness"), list), s)
        await go("#/pilgrim-details")
        s = await status()
        check("detects real-world pilgrim-details route alias", s["detect"]["flow"] == "sed" and s["detect"]["slots"] == 4, s)

        # 2. SED fill incl. passport popup + dependent State dropdown
        r = await fill("FILL"); rep = r["report"]; S = await st()
        check("SED fill reports ok", rep["ok"], [f for f in rep["fields"] if f["status"] == "FAILED"])
        check("row values kept by framework state", S.get("p0.name") == "Ramesh Kumar" and S.get("p3.name") == "Anu Kumar" and S.get("p1.gender") == "Female", S)
        check("passport row: popup filled & closed", S.get("p2.idType") == "Passport" and S.get("pp.visaNo") == "OCI12345" and S.get("pp.country") == "United States"
              and not await page.evaluate("document.getElementById('ppd').classList.contains('open')"), S)
        check("dependent Country → State filled", S.get("c.country") == "India" and S.get("c.state") == "Karnataka", S)
        check("Aadhaar values accepted", S.get("p0.idNumber") == seed()["profiles"][0]["persons"][0]["idNumber"], S)
        check("fill speed < 3 s (headless)", rep["durationMs"] < 3000, rep["durationMs"])

        # 3. Fill & Continue stops at CAPTCHA, then continues to payment and stops
        await page.wait_for_timeout(200)
        r = await fill("FILL_CONTINUE")
        check("Fill & Continue stops when CAPTCHA empty", r["report"].get("stoppedAt") == "CAPTCHA", r["report"])
        await page.evaluate("""() => { const el=document.querySelector('[data-key="captcha"]'); const d=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value'); d.set.call(el,'AB12'); el.dispatchEvent(new Event('input',{bubbles:true})); }""")
        r = await fill("FILL_CONTINUE"); await page.wait_for_timeout(500)
        paid = await page.evaluate("!!window.__paid")
        check("Continue pressed then stopped at payment, never paid", "#/payment" in page.url and not paid and r["report"].get("stoppedAt") == "PAYMENT", (page.url, r["report"].get("stoppedAt"), paid))
        s = await status()
        check("payment page recognised; helper idle", s["detect"]["step"] == "payment", s["detect"])

        # 4. Srivani (4 people, fill-only)
        await go("#/srivani")
        r = await fill("FILL_CONTINUE")
        check("Srivani detected and filled", r["detect"]["flow"] == "srivani" and r["report"]["ok"], r)
        check("Srivani never continues (fill-only)", r["report"].get("stoppedAt") == "FILL_ONLY" and "srivani" in page.url)

        # 5. Senior: select only Lakshmi → spouse auto-added + uploads
        await edit_root("root.profiles[0].selection=['b']")
        await go("#/senior")
        r = await fill(); S = await st()
        files = await page.evaluate("() => [...document.querySelectorAll('input[type=file]')].map(f => f.files.length)")
        check("Senior: spouse auto-linked into row 2", S.get("p0.name") == "Lakshmi Kumar" and S.get("p1.name") == "Venkat Rao", S)
        check("Senior: Aadhaar images uploaded in both rows", files == [1, 1], files)
        check("Senior report ok", r["report"]["ok"], [f for f in r["report"]["fields"] if f["status"] == "FAILED"])

        # 6. Srivari Seva individual
        await go("#/srivari-seva")
        r = await fill(); S = await st(); rep = r["report"]
        extra = await page.evaluate("""() => ({ mfit: document.querySelector('[data-chk="s.mfit"]').checked, pv: document.querySelector('[name=pv][value=Yes]').checked,
            langs: [...document.querySelectorAll('input[type=checkbox][value]')].filter(c=>c.checked).map(c=>c.value), photo: document.querySelector('[data-file="s.photo"]').files.length })""")
        check("Seva detected", r["detect"]["flow"] == "srivari_seva", r["detect"])
        check("Seva text/select/dependent fields", S.get("s.name") == "Srinivas" and S.get("s.district") == "Bengaluru Urban" and S.get("s.temple") == "Bengaluru" and S.get("s.times") == "2", S)
        check("Seva checkbox, radio, multi, photo", extra == {"mfit": True, "pv": True, "langs": ["Telugu", "Kannada"], "photo": 1}, extra)
        failed = [f for f in rep["fields"] if f["status"] == "FAILED"]
        check("Seva: no failed fields", not failed, failed)

        # 7. Group Seva member 2 (collapsed accordion) + auto-advance
        await go("#/group-seva")
        r = await fill(); S = await st()
        check("Group: member 2 expanded and filled", S.get("g1.name") == "Second" and not S.get("g0.name") and r["report"]["ok"], [f for f in r["report"]["fields"] if f["status"] == "FAILED"])
        cur = await opt.evaluate("""async () => (await chrome.storage.local.get('root')).root.group.current""")
        check("Group: auto-advanced to member 3", cur == 2, cur)

        # 8. Practice + Clear
        await go("#/srivani")
        r = await fill("PRACTICE")
        await opt.evaluate("""async () => { const [t] = await chrome.tabs.query({ url: "http://127.0.0.1/*" }); return new Promise(r => chrome.runtime.sendMessage({ t: "CLEAR", tabId: t.id }, r)); }""")
        await page.wait_for_timeout(200); S = await st()
        check("Practice fill then Clear empties fields", r["report"]["ok"] and not S.get("p0.name"), S.get("p0.name"))

        # 9. Field the page rejects → honest status
        await edit_root("root.profiles[0].selection=['a']; root.profiles[0].persons[0].idNumber='12345'")
        await go("#/srivani")
        r = await fill(); f = [x for x in r["report"]["fields"] if x["status"] == "FAILED"]
        check("Invalid ID → report not ok, field flagged with TTD error", not r["report"]["ok"] and any(x["key"] == "idNumber" and x["reason"] == "TTD_VALIDATION_ERROR" for x in f), f)
        check("Fewer people than slots → note shown", any("empty row" in n for n in r["report"]["notes"]), r["report"]["notes"])

        # 10. Label renamed → fallback strategy
        await go("#/srivani")
        await edit_root("root.profiles[0].persons[0].idNumber='%s'" % seed()["profiles"][0]["persons"][0]["idNumber"])
        await page.evaluate("""() => document.querySelectorAll('label').forEach(l => { if (l.textContent==='Photo ID Number') { l.textContent='Proof Number'; l.nextElementSibling.setAttribute('formcontrolname','idNumber'); } })""")
        r = await fill(); f = [x for x in r["report"]["fields"] if x["key"] == "idNumber"]
        check("Renamed label → filled via fallback strategy", f and f[0]["status"] == "OK" and f[0]["strategy"] > 0, f)

        # 10b. Field label is on the input itself (live TTD style)
        await go("#/srivani")
        await page.evaluate("""() => { const el = document.querySelector('[data-key="p0.name"]'); if (el) el.setAttribute('label', 'Name'); }""")
        r = await fill(); f = [x for x in r["report"]["fields"] if x["key"] == "name"]
        check("Input-level label attribute works for live TTD field markup", f and f[0]["status"] == "OK", f)

        # 11. No refresh needed
        await go("#/srivani")
        await page.evaluate("() => document.getElementById('pilgrim-helper-host')?.remove()")
        r = await fill()
        check("Re-injection / fill works without refresh", r["report"]["ok"], r)

        # 12. Unsupported page
        await page.goto(f"{url}#/unknown-xyz")
        await page.evaluate("() => { document.getElementById('app').innerHTML = '<h2>Accommodation</h2><p>nothing</p>'; }")
        await page.wait_for_timeout(500)
        r = await fill()
        check("Unsupported page → nothing filled", r.get("code") == "E_UNSUPPORTED", r)

        # 13. Privacy
        reqs = []
        ctx.on("request", lambda q: reqs.append(q.url + " " + (q.post_data or "")))
        await go("#/special-entry"); await fill()
        leaked = [q for q in reqs if "Ramesh" in q or "OCI12345" in q]
        check("No personal data in network requests", not leaked, leaked)

        # 14. PIN + encrypted backup round trip
        res = await opt.evaluate("""async () => {
          const s = await import('../lib/store.js');
          await s.enablePin('123456'); const enc = (await chrome.storage.local.get('root')).root.enc != null;
          await s.lock(); const locked = await s.isLocked(); let threw=false; try { await s.loadRoot(); } catch(e){ threw = e.code==='LOCKED'; }
          const bad = await s.unlock('000000'); const good = await s.unlock('123456');
          const name = (await s.loadRoot()).profiles[0].persons[0].name;
          const backup = await s.exportBackup('long passphrase');
          const data = await s.readBackup(backup, 'long passphrase');
          let wrong=false; try { await s.readBackup(backup, 'nope nope'); } catch { wrong=true; }
          await s.disablePin('123456');
          return { enc, locked, threw, bad, good, name, restored: data.root.profiles[0].persons.length, docs: Object.keys(data.docs).length, wrong };
        }""")
        check("PIN: data encrypted at rest, locks and unlocks", res["enc"] and res["locked"] and res["threw"] and not res["bad"] and res["good"] and res["name"] == "Ramesh Kumar", res)
        check("Encrypted backup round trip, wrong passphrase rejected", res["restored"] == 5 and res["docs"] == 1 and res["wrong"], res)

        # 15. Sample profiles (DEV build) restore + fill
        res = await opt.evaluate("""async () => {
          const s = await import('../lib/store.js');
          const txt = await (await fetch(chrome.runtime.getURL('config/sample-profiles.json'))).text();
          await s.applyBackup(await s.readBackup(txt), 'replace');
          const r = await s.loadRoot(); return { profiles: r.profiles.length, people: r.profiles.reduce((a,p)=>a+p.persons.length,0), group: r.group.members.length };
        }""")
        check("Sample profiles restore (10 profiles, 34 people, group of 6)", res == {"profiles": 10, "people": 34, "group": 6}, res)
        async def use_profile(i): await edit_root(f"root.activeProfileId = root.profiles[{i}].id")
        await use_profile(0); await go("#/special-entry"); r = await fill(); S = await st()
        check("Sample 01 (family of 6) on 4 slots → 4 filled, note for 2", r["report"]["ok"] and S.get("p3.name") == "Test Anu Kumar" and any("not filled" in n for n in r["report"]["notes"]), (r["report"]["notes"], [f for f in r["report"]["fields"] if f["status"] == "FAILED"]))
        await use_profile(2); await go("#/special-entry"); r = await fill(); S = await st()
        check("Sample 03 (NRI passports) fills passport rows", r["report"]["ok"] and S.get("p0.idType") == "Passport", [f for f in r["report"]["fields"] if f["status"] == "FAILED"])
        await use_profile(6); await go("#/srivani"); r = await fill()
        check("Sample 07 (Srivani 4) all filled", r["report"]["ok"] and r["report"]["passed"] == 20, r["report"]["passed"])
        await use_profile(8); await go("#/srivani"); r = await fill(); s = await status()
        check("Sample 09 (invalid data) → readiness errors and ✖ fields", not r["report"]["ok"] and any(not i.get("warn") for i in s["readiness"]), s["readiness"])

        # 15c. step without General Details: absent contact fields are skipped, not failed
        await use_profile(0); await go("#/special-entry-nocontact"); r = await fill()
        check("no contact section ? contact fields SKIPPED and fill ok", r["report"]["ok"] and all(f["status"] == "SKIPPED" for f in r["report"]["fields"] if f["key"].startswith("contact.")), [f for f in r["report"]["fields"] if f["status"] == "FAILED"])

        # 15a. strict mode (TTD ignores scripted input): guard, no false "Filled", Quick Paste with trusted keyboard
        await opt.evaluate("""async ([root]) => { await chrome.storage.local.set({ root, prefs: root.settings }); }""", [seed()])
        await go("?strict=1#/special-entry")
        r = await fill("FILL"); rep = r["report"]
        check("strict: scripted fill flags trustedGuard and never reports Filled", rep.get("trustedGuard") is True and rep["ok"] is False, rep)
        r = await fill("FILL_CONTINUE")
        check("strict: Fill & Continue is refused", r["report"].get("stoppedAt") == "TRUSTED_GUARD" and not await page.evaluate("window.__continued"), r["report"])
        tabmsg = lambda m: opt.evaluate("""async (m) => { const [t] = await chrome.tabs.query({ url: "http://127.0.0.1/*" });
              return await new Promise(r => chrome.tabs.sendMessage(t.id, m, r)); }""", m)
        await page.bring_to_front()
        await tabmsg({"t": "QP_START"})
        P = seed()["profiles"][0]; people = P["persons"]; C = P["contact"]
        want = {}
        for i, pp in enumerate(people[:4]):
            want.update({f"p{i}.name": pp["name"], f"p{i}.age": str(pp["age"]), f"p{i}.gender": {"M": "Male", "F": "Female", "T": "Transgender"}[pp["gender"]],
                         f"p{i}.idNumber": pp["idNumber"], f"p{i}.idType": "Passport" if pp["idType"] == "PASSPORT" else "Aadhaar Card"})
        want.update({"c.country": C["country"], "c.state": C["state"], "c.city": C["city"], "c.pincode": C["pincode"], "c.email": C["email"]})
        order = []
        for _ in range(40):
            key = await page.evaluate("document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.key || '' : ''")
            if key not in want or (order and order[-1] == key and (await st()).get(key) == want[key]):
                await page.wait_for_timeout(450)
                key2 = await page.evaluate("document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.key || '' : ''")
                if key2 == key or key2 not in want: break
                key = key2
            if (await st()).get(key) != want[key]:
                await page.keyboard.type(want[key])
            order.append(key)
            await page.wait_for_timeout(500)
        S = await st()
        check("quick paste: row fields entered by trusted typing", all(S.get(k) == v for k, v in want.items() if k.startswith("p") and not k.endswith("idType")), {k: S.get(k) for k in list(want)[:6]})
        check("quick paste: contact entered in order Country then State then City", order.index("c.country") < order.index("c.state") < order.index("c.city") if all(k in order for k in ["c.country", "c.state", "c.city"]) else False, order)
        check("quick paste: Continue never pressed", not await page.evaluate("window.__continued"))

        # 15d. quick paste: choosing Female must not satisfy a "Male" step (whole-word match)
        await go("?strict=1#/special-entry"); await page.reload(); await page.wait_for_timeout(900); await fill("FILL"); await page.bring_to_front(); await tabmsg({"t": "QP_START"})
        g = '[data-key="p0.gender"]'
        for k, v in (("p0.name", people[0]["name"]), ("p0.age", str(people[0]["age"]))):
            await page.click(f'[data-key="{k}"]'); await page.keyboard.type(v); await page.wait_for_timeout(700)
        before = (await tabmsg({"t": "QP_STATE"}))["step"]
        await page.focus(g); await page.keyboard.type("Fe"); await page.wait_for_timeout(900)
        s_f = (await tabmsg({"t": "QP_STATE"}))["step"]
        await page.focus(g); await page.keyboard.press("ArrowUp"); await page.wait_for_timeout(900)
        s_m = (await tabmsg({"t": "QP_STATE"}))["step"]
        check("quick paste: Female does not satisfy Male step, Male does", s_f == before and s_m > before, (before, s_f, s_m, await page.eval_on_selector(g, 'e=>[e.value,e.selectedOptions[0]?.text]'), (await st()).get('p0.gender')))

        # 15b. selectors cover field names read from TTD's public JS
        cfg = open(os.path.join(ROOT, "config", "selectors.json"), encoding="utf8").read() if "ROOT" in globals() else open("config/selectors.json", encoding="utf8").read()
        check("selectors include live TTD names", all(k in cfg for k in ["fname","photoIdType","idProofNumber","emailId","visaNumber","visaValidityDate","Enter ID Card Number","/ssdpat/pilgrim-details","Tiruchanoor"]))
        # 16. UI renders without errors (popup + every settings page, light & dark)
        errs = []
        pop = await ctx.new_page(); pop.on("pageerror", lambda e: errs.append(str(e)))
        await pop.goto(f"chrome-extension://{ext_id}/popup/popup.html"); await pop.wait_for_timeout(800)
        for h in ["#welcome", "#people", "#contact", "#seva", "#group", "#backup", "#security", "#settings", "#help"]:
            await pop.goto(f"chrome-extension://{ext_id}/options/options.html{h}"); await pop.wait_for_timeout(300)
        check("Popup and all settings pages render without JS errors", not errs, errs)
        await ctx.close()
    srv.shutdown()
    ok = sum(1 for _, c in results if c)
    print(f"\n{ok}/{len(results)} checks passed")
    sys.exit(0 if ok == len(results) else 1)

if __name__ == "__main__":
    asyncio.run(main())
