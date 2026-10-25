#!/usr/bin/env python3
"""Build the extension. Run from the project folder or from scripts/.
  python build.py            -> dist/release + dist/pilgrim-helper-<ver>.zip (TTD hosts only, for the store)
  python build.py dev        -> dist/dev (adds localhost + file:// mock page + sample profiles button)
"""
import json, shutil, sys, pathlib, zipfile
ROOT = pathlib.Path(__file__).resolve().parent.parent
mode = sys.argv[1] if len(sys.argv) > 1 else "release"
if mode not in ("dev", "release"): sys.exit("usage: python build.py [dev|release]")
out = ROOT / "dist" / mode
if out.exists(): shutil.rmtree(out)
out.mkdir(parents=True)
for d in ["background", "content", "lib", "popup", "options", "config", "icons"]:
    shutil.copytree(ROOT / d, out / d)
m = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
if mode == "dev":
    m["host_permissions"] += ["http://localhost/*", "http://127.0.0.1/*", "file:///*"]
    m["content_scripts"][0]["matches"] += ["http://localhost/*", "http://127.0.0.1/*", "file:///*/ttd-mock.html"]
    m["name"] += " (DEV)"
    shutil.copy(ROOT / "test" / "fixtures" / "test-profiles.json", out / "config" / "sample-profiles.json")
(out / "manifest.json").write_text(json.dumps(m, indent=2, ensure_ascii=False), encoding="utf-8")
if mode == "release":
    z = ROOT / "dist" / f"pilgrim-helper-{m['version']}.zip"
    with zipfile.ZipFile(z, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in sorted(out.rglob("*")):
            if f.is_file(): zf.write(f, f.relative_to(out))
    print("zip:", z)
print("built:", out)
if mode == "dev":
    print("Load unpacked:", out, "\nMock page:", (ROOT / "test" / "ttd-mock.html").as_uri() + "#/special-entry")
