"""BRANCHLINE — WebMCP end-to-end verification.

Goal: prove the 14-tool WebMCP surface works through the app's REAL native
registration path (src/webmcp/registry.ts -> document.modelContext), not just
the local fallback used when WebMCP is unsupported.

Approach:
  1. Try to launch Chromium with candidate `--enable-features` / blink flags
     that expose navigator/document.modelContext (the same thing the
     chrome://flags/#enable-webmcp-testing toggle flips).
  2. If the flag is unavailable in this Chromium build, install a faithful
     document.modelContext shim via addInitScript (runs before app code), so
     registry.ts takes the NATIVE branch (setWebMCPSupport(true)) and really
     calls registerTool / getTools / toolchange.
  3. Drive the canonical recovery flow and record the tool lifecycle:
     which tools register, which unregister, and -- critically -- that
     apply_plan stays ABSENT until a human approves, then appears.
  4. Invoke real tools through their registered `execute` to prove handlers
     run and return the documented envelope.
"""
import json
import pathlib
import sys

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:4173"
OUT = pathlib.Path(__file__).resolve().parent

FLAG_CANDIDATES = [
    ("(no flag - baseline)", []),
    ("--enable-features=WebMCPTesting", ["--enable-features=WebMCPTesting"]),
    ("--enable-features=WebMCP", ["--enable-features=WebMCP"]),
    ("--enable-blink-features=WebMCP", ["--enable-blink-features=WebMCP"]),
]

# Faithful stand-in for the WebMCP browser API.
SHIM = r"""
window.__webmcp = { log: [], registered: new Map(), listeners: [] };
(function () {
  const s = window.__webmcp;
  function emit() {
    for (const cb of s.listeners) { try { cb(new Event('toolchange')); } catch (e) {} }
  }
  document.modelContext = {
    registerTool: async function (def, opts) {
      const name = def && def.name;
      if (!name) throw new Error('WebMCP: tool definition missing name');
      if (s.registered.has(name)) return;
      s.registered.set(name, { def: def, at: Date.now() });
      s.log.push({ op: 'register', name: name, t: Date.now() });
      const signal = opts && opts.signal;
      if (signal) {
        signal.addEventListener('abort', () => {
          if (s.registered.has(name)) {
            s.registered.delete(name);
            s.log.push({ op: 'unregister', name: name, t: Date.now(),
                         reason: String(signal.reason || 'aborted') });
            emit();
          }
        });
      }
      emit();
    },
    unregisterTool: function (name) {
      if (s.registered.delete(name)) {
        s.log.push({ op: 'unregister', name: name, t: Date.now(), reason: 'explicit' });
        emit();
      }
    },
    getTools: async function () {
      return [...s.registered.keys()].map((n) => Object.assign({ name: n }, s.registered.get(n).def));
    },
    addEventListener: function (type, cb) { if (type === 'toolchange') s.listeners.push(cb); },
    removeEventListener: function (type, cb) {
      const i = s.listeners.indexOf(cb); if (i >= 0) s.listeners.splice(i, 1);
    }
  };
})();
"""


def probe_native(pw):
    """Try each flag combo; return (label, args, supported)."""
    results = []
    for label, args in FLAG_CANDIDATES:
        try:
            b = pw.chromium.launch(args=args)
            pg = b.new_page()
            pg.goto("about:blank")
            supported = pg.evaluate(
                "() => typeof document.modelContext !== 'undefined' "
                "&& typeof document.modelContext.registerTool === 'function'"
            )
            results.append((label, args, bool(supported)))
            b.close()
        except Exception as e:  # noqa: BLE001
            results.append((label, args, f"error: {e}"))
    return results


def registered(pg):
    return pg.evaluate(
        """() => {
            if (window.__webmcp) return [...window.__webmcp.registered.keys()].sort();
            if (document.modelContext && document.modelContext.getTools) {
              return document.modelContext.getTools().then(t => t.map(x => x.name).sort());
            }
            return [];
        }"""
    )


def invoke(pg, name, payload):
    return pg.evaluate(
        """async ([name, payload]) => {
            const s = window.__webmcp;
            const entry = s && s.registered.get(name);
            if (!entry) return { error: 'not-registered', available: s ? [...s.registered.keys()] : [] };
            try {
              const res = await entry.def.execute(payload, { signal: new AbortController().signal });
              return { ok: true, result: res };
            } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
        }""",
        [name, payload],
    )


def click(pg, action):
    return pg.evaluate(
        """a => { const el = document.querySelector('[data-action="' + a + '"]');
                  if (!el) throw new Error('missing data-action: ' + a); el.click(); }""",
        action,
    )


def main():
    report = {"native_probe": [], "phases": [], "invocations": [], "assertions": []}

    with sync_playwright() as pw:
        probes = probe_native(pw)
        for label, args, supported in probes:
            report["native_probe"].append({"flag": label, "supported": supported})
            print(f"  probe {label:38} -> {supported}")

        native = next(((l, a) for l, a, s in probes if s is True), None)
        if native:
            label, args = native
            print(f"\nNATIVE WebMCP available via: {label}")
            report["mode"] = f"native ({label})"
        else:
            label, args = "(shim)", []
            print("\nNative WebMCP flag unavailable in this Chromium build.")
            print("Installing a faithful document.modelContext shim so registry.ts")
            print("takes the NATIVE branch and really calls registerTool/getTools.")
            report["mode"] = "shim (native flag unavailable in this Chromium build)"

        browser = pw.chromium.launch(args=args)
        page = browser.new_page(viewport={"width": 1600, "height": 1000})
        errors = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))

        if not native:
            page.add_init_script(SHIM)

        page.goto(f"{BASE}/?fresh=1&tour=0", wait_until="networkidle")
        page.wait_for_timeout(1200)

        def phase(name, note=""):
            tools = registered(page)
            report["phases"].append({"phase": name, "note": note, "registered": tools})
            print(f"\n[{name}] {len(tools)} tools" + (f" — {note}" if note else ""))
            print("   " + ", ".join(tools))
            return tools

        # ---- Phase 1: healthy ----
        t0 = phase("1. healthy (pre-disruption)")

        # Support flag surfaced by the app itself
        support = page.evaluate(
            "() => { const el = document.querySelector('.status-chip'); return el ? el.innerText.replace(/\\n/g,' | ') : null; }"
        )
        report["status_chip"] = support
        print(f"   status chip: {support}")

        # ---- Invoke a read tool ----
        inv = invoke(page, "get_ops_snapshot", {})
        report["invocations"].append({"tool": "get_ops_snapshot", "result": _trim(inv)})
        print(f"   invoke get_ops_snapshot -> ok={inv.get('ok')} :: {_brief(inv)}")

        # ---- Phase 2: shock ----
        click(page, "trigger-shock")
        page.wait_for_timeout(1100)
        t1 = phase("2. after trigger-shock")

        # ---- Phase 3: fork trio ----
        click(page, "create-demo-trio")
        page.wait_for_timeout(1600)
        t2 = phase("3. after create-demo-trio (3 branches simulated)")

        # ---- Phase 4: stage ----
        click(page, "stage-branch")
        page.wait_for_timeout(1100)
        t3 = phase("4. after stage-branch (plan staged, NOT approved)")

        apply_before = "apply_plan" in t3
        report["assertions"].append(
            {"assert": "apply_plan ABSENT before human approval", "pass": not apply_before,
             "detail": f"registered={t3}"}
        )
        print(f"   ASSERT apply_plan absent pre-approval: {not apply_before}")

        # ---- Phase 5: approve ----
        click(page, "approve-plan")
        page.wait_for_timeout(1200)
        t4 = phase("5. after approve-plan (human approved)")
        apply_after = "apply_plan" in t4
        report["assertions"].append(
            {"assert": "apply_plan PRESENT after human approval", "pass": apply_after,
             "detail": f"registered={t4}"}
        )
        print(f"   ASSERT apply_plan present post-approval: {apply_after}")
        page.screenshot(path=str(OUT / "webmcp-05-apply-unlocked.png"))

        # ---- Phase 6: apply ----
        click(page, "manual-apply")
        page.wait_for_timeout(1400)
        t5 = phase("6. after manual-apply (executed)")

        # ---- Phase 7: verify ----
        click(page, "manual-verify")
        page.wait_for_timeout(1300)
        t6 = phase("7. after manual-verify")

        # ---- Invoke verify_plan + rollback availability ----
        if "verify_plan" in t6:
            inv2 = invoke(page, "verify_plan", {})
            report["invocations"].append({"tool": "verify_plan", "result": _trim(inv2)})
            print(f"   invoke verify_plan -> ok={inv2.get('ok')} :: {_brief(inv2)}")

        # Capability dock screenshot
        click(page, "toggle-capabilities")
        page.wait_for_timeout(900)
        page.screenshot(path=str(OUT / "webmcp-07-capability-dock-native.png"))
        click(page, "close-capabilities")
        page.wait_for_timeout(600)

        # ---- Phase 8: reset -> tools should unregister ----
        click(page, "reset-demo")
        page.wait_for_timeout(1400)
        t7 = phase("8. after reset-demo (back to healthy)")
        shrank = len(t7) < len(t6)
        report["assertions"].append(
            {"assert": "tools unregister when preconditions no longer hold (reset)",
             "pass": shrank, "detail": f"{len(t6)} -> {len(t7)}"}
        )
        print(f"   ASSERT lifecycle shrinks on reset: {shrank} ({len(t6)} -> {len(t7)})")

        # ---- Unregistration log evidence ----
        log = page.evaluate("() => window.__webmcp ? window.__webmcp.log : []")
        report["lifecycle_log"] = log[-40:]
        unreg = [e for e in log if e["op"] == "unregister"]
        print(f"\n   lifecycle events: {len(log)} total, {len(unreg)} unregister")
        for e in unreg[:8]:
            print(f"     - {e['name']} ({e.get('reason','')[:60]})")

        report["console_errors"] = errors
        print(f"\n   console errors: {len(errors)}")
        for e in errors[:5]:
            print(f"     ! {e}")

        page.screenshot(path=str(OUT / "webmcp-08-after-reset.png"))
        browser.close()

    (OUT / "webmcp-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"\nReport written to {OUT / 'webmcp-report.json'}")

    failed = [a for a in report["assertions"] if not a["pass"]]
    print(f"\nASSERTIONS: {len(report['assertions']) - len(failed)}/{len(report['assertions'])} passed")
    for a in failed:
        print(f"  FAILED: {a['assert']} :: {a['detail']}")
    return 1 if failed else 0


def _trim(obj):
    try:
        return json.loads(json.dumps(obj, default=str))[:2000]
    except Exception:  # noqa: BLE001
        return str(obj)[:2000]


def _brief(inv):
    if not inv.get("ok"):
        return f"error={inv.get('error')}"
    r = inv.get("result") or {}
    if isinstance(r, dict):
        keys = {k: (str(v)[:90]) for k, v in r.items() if k in ("ok", "summary", "affected_ids", "next_tools")}
        return json.dumps(keys, default=str)
    return str(r)[:160]


if __name__ == "__main__":
    sys.exit(main())
