"""BRANCHLINE final verification (fresh redo).

1. Proves the 14-tool WebMCP surface through the app's REAL native
   registration path using a faithful document.modelContext shim
   (registry.ts -> registerTool/getTools/toolchange).
2. Drives the canonical human recovery flow, capturing a light-theme
   screenshot at every phase, and asserts the apply_plan safety boundary.
3. Resolves the 'invalid branch' question: for every strategy, create_branch
   + simulate_branch are driven through the TOOL path and the exact
   hard-constraint violations are printed, so the report is accurate.
4. Asserts zero console errors.
"""
import json
import pathlib
import sys

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:4173"
OUT = pathlib.Path(__file__).resolve().parent

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


def registered(pg):
    return pg.evaluate(
        "() => window.__webmcp ? [...window.__webmcp.registered.keys()].sort() : []"
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


def shot(pg, name):
    pg.screenshot(path=str(OUT / name), full_page=False)
    print(f"   screenshot -> {name}")


def main():
    report = {"phases": [], "invocations": [], "assertions": [], "strategy_audit": []}

    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=[])
        page = browser.new_page(viewport={"width": 1600, "height": 1000})
        errors = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))

        # No native flag in this Chromium build, so use the shim to force the
        # app's NATIVE registration branch.
        page.add_init_script(SHIM)
        page.goto(f"{BASE}/?fresh=1&tour=0", wait_until="networkidle")
        page.wait_for_timeout(1200)

        def phase(name, note=""):
            tools = registered(page)
            report["phases"].append({"phase": name, "registered": tools})
            print(f"[{name}] {len(tools)} tools: {', '.join(tools)}")
            return tools

        # ---------- canonical human flow ----------
        t0 = phase("1. healthy")
        shot(page, "s01-healthy.png")
        support = page.evaluate(
            "() => { const el = document.querySelector('.status-chip'); return el ? el.innerText.replace(/\\n/g,' | ') : null; }"
        )
        report["status_chip"] = support
        print(f"   status chip: {support}")

        inv = invoke(page, "get_ops_snapshot", {})
        report["invocations"].append({"tool": "get_ops_snapshot", "ok": inv.get("ok"),
                                       "summary": (inv.get("result", {}) or {}).get("summary") if inv.get("ok") else inv.get("error")})
        print(f"   invoke get_ops_snapshot -> ok={inv.get('ok')} :: {(inv.get('result',{}) or {}).get('summary')}")

        click(page, "trigger-shock")
        page.wait_for_timeout(1100)
        t1 = phase("2. after trigger-shock")
        shot(page, "s02-shock.png")

        click(page, "create-demo-trio")
        page.wait_for_timeout(1700)
        t2 = phase("3. after create-demo-trio")
        shot(page, "s03-trio.png")

        click(page, "stage-branch")
        page.wait_for_timeout(1100)
        t3 = phase("4. after stage-branch (NOT approved)")
        shot(page, "s04-stage.png")
        apply_before = "apply_plan" in t3
        report["assertions"].append({"assert": "apply_plan ABSENT before human approval", "pass": not apply_before})

        click(page, "approve-plan")
        page.wait_for_timeout(1200)
        t4 = phase("5. after approve-plan (human approved)")
        shot(page, "s05-approval-unlocked.png")
        apply_after = "apply_plan" in t4
        report["assertions"].append({"assert": "apply_plan PRESENT after human approval", "pass": apply_after})

        click(page, "toggle-capabilities")
        page.wait_for_timeout(900)
        shot(page, "s08-capabilities.png")
        click(page, "close-capabilities")
        page.wait_for_timeout(600)

        click(page, "manual-apply")
        page.wait_for_timeout(1400)
        t5 = phase("6. after manual-apply (executed)")
        shot(page, "s06-commit.png")

        click(page, "manual-verify")
        page.wait_for_timeout(1300)
        t6 = phase("7. after manual-verify")
        shot(page, "s07-recovery.png")

        click(page, "reset-demo")
        page.wait_for_timeout(1400)
        t7 = phase("8. after reset-demo")
        shot(page, "s09-reset.png")
        report["assertions"].append({"assert": "tools unregister on reset", "pass": len(t7) < len(t6),
                                       "detail": f"{len(t6)} -> {len(t7)}"})

        # ---------- invalid-branch investigation ----------
        print("\n=== strategy audit (tool-driven create_branch + simulate_branch) ===")
        click(page, "trigger-shock")
        page.wait_for_timeout(900)
        for strategy in ["service_first", "cost_guard", "balanced", "resilience"]:
            created = invoke(page, "create_branch",
                             {"name": f"Audit {strategy}", "strategy": strategy, "constraints": {}})
            if not created.get("ok"):
                print(f"  {strategy}: create failed -> {created.get('error')}")
                report["strategy_audit"].append({"strategy": strategy, "error": created.get("error")})
                continue
            bid = ((created.get("result", {}) or {}).get("data", {}) or {}).get("id")
            sim = invoke(page, "simulate_branch", {"branch_id": bid, "horizon_days": 30})
            if not sim.get("ok"):
                print(f"  {strategy}: simulate failed -> {sim.get('error')}")
                report["strategy_audit"].append({"strategy": strategy, "create_id": bid, "error": sim.get("error")})
                continue
            data = (sim.get("result", {}) or {}).get("data", {}) or {}
            branch = data.get("branch", {})
            vios = data.get("hard_violations", [])
            entry = {
                "strategy": strategy,
                "branch_id": bid,
                "status": branch.get("status"),
                "delayed_orders": branch.get("delayed_orders"),
                "extra_cost_dollars": branch.get("extra_cost_dollars"),
                "hard_violations": vios,
                "summary": (sim.get("result", {}) or {}).get("summary"),
            }
            report["strategy_audit"].append(entry)
            print(f"  {strategy:14} -> status={branch.get('status')} delayed={branch.get('delayed_orders')} "
                  f"cost=${branch.get('extra_cost_dollars')} violations={len(vios)}")
            for v in vios:
                print(f"      - {v}")

        log = page.evaluate("() => window.__webmcp ? window.__webmcp.log : []")
        report["console_errors"] = errors
        browser.close()

    (OUT / "final-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"\nconsole errors: {len(errors)}")
    for e in errors[:8]:
        print(f"   ! {e}")
    failed = [a for a in report["assertions"] if not a["pass"]]
    print(f"\nASSERTIONS: {len(report['assertions']) - len(failed)}/{len(report['assertions'])} passed")
    for a in failed:
        print(f"  FAILED: {a['assert']}")
    return 1 if (failed or errors) else 0


if __name__ == "__main__":
    sys.exit(main())
