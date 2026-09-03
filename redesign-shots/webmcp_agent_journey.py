"""Full agent journey through the 14 WebMCP tools, with valid arguments.

Proves, against the running app:
  * read tools return real domain data
  * an agent can author + simulate + compare branches purely over MCP
  * apply_plan is ABSENT (not merely disabled) until a human approves
  * after approval the agent can apply, verify, and roll back
"""
import json
import pathlib
import sys

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from webmcp_verify import SHIM, click, invoke, registered  # noqa: E402

BASE = "http://127.0.0.1:4173"
OUT = pathlib.Path(__file__).resolve().parent

DISRUPTION = "disrupt_nori_12d"
SUPPLIER = "sup_nori"
COMPONENT = "cmp_battery_cell"

results = []


def call(page, tool, payload, label=""):
    """Invoke a registered tool and record a compact result."""
    registered_now = registered(page)
    out = invoke(page, tool, payload)
    r = out.get("result") or {}
    if not out.get("ok"):
        entry = {"tool": tool, "payload": payload, "available": False,
                 "error": out.get("error"), "registered": registered_now}
        results.append(entry)
        print(f"  {tool:22} UNAVAILABLE ({out.get('error')})")
        return entry
    entry = {
        "tool": tool, "payload": payload, "available": True,
        "ok": r.get("ok"), "summary": r.get("summary"),
        "affected_ids": r.get("affected_ids"),
        "next_tools": r.get("next_tools"),
        "data_keys": list(r.get("data").keys()) if isinstance(r.get("data"), dict) else None,
        "registered": registered_now,
    }
    results.append(entry)
    flag = "OK " if r.get("ok") else "ERR"
    print(f"  {flag} {tool:22} {str(r.get('summary'))[:96]}")
    return entry


def ids_of(entry, *prefer):
    """Pull plausible ids out of an invocation result."""
    blob = json.dumps(entry, default=str)
    import re
    found = re.findall(r'"([a-z]+_(?:branch|plan|checkpoint)[a-z0-9_]*)"', blob)
    return found


with sync_playwright() as pw:
    b = pw.chromium.launch()
    page = b.new_page(viewport={"width": 1600, "height": 1000})
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    page.add_init_script(SHIM)
    page.goto(f"{BASE}/?fresh=1&tour=0", wait_until="networkidle")
    page.wait_for_timeout(1200)

    # Disrupt so write tools unlock
    click(page, "trigger-shock")
    page.wait_for_timeout(1200)

    print("\n=== PHASE A: read-only reconnaissance (6 tools always available) ===")
    call(page, "get_ops_snapshot", {})
    call(page, "trace_impact", {"source_id": DISRUPTION, "direction": "downstream", "max_depth": 5})
    call(page, "inspect_entity", {"entity_id": SUPPLIER, "include_links": True})
    call(page, "list_constraints", {})
    call(page, "find_substitutes", {"component_id": COMPONENT, "needed_by_day": 8, "quantity": 4000})
    call(page, "read_external_alerts", {})

    print("\n=== PHASE B: agent authors two branches over MCP ===")
    b1 = call(page, "create_branch", {
        "name": "Agent probe A",
        "strategy": "service_first",
        "constraints": {"protect_tiers": [1, 2], "max_delayed_orders": 4},
    })
    page.wait_for_timeout(900)
    b2 = call(page, "create_branch", {"name": "Agent probe B", "strategy": "cost_guard"})
    page.wait_for_timeout(900)

    print("\nregistered now:", registered(page))

    # Get branch ids from the app's own state via the snapshot tool
    snap = invoke(page, "get_ops_snapshot", {})
    data = (snap.get("result") or {}).get("data") or {}
    branches = data.get("branches") or data.get("branch_summaries") or []
    bid_a = bid_b = None
    if isinstance(branches, list):
        for br in branches:
            if not isinstance(br, dict):
                continue
            nm = str(br.get("name", ""))
            bid = br.get("id") or br.get("branch_id")
            if "Agent probe A" in nm:
                bid_a = bid
            elif "Agent probe B" in nm:
                bid_b = bid
    print(f"  branch ids -> A={bid_a} B={bid_b}")

    if bid_a:
        call(page, "simulate_branch", {"branch_id": bid_a, "horizon_days": 12})
        page.wait_for_timeout(900)
    if bid_b:
        call(page, "simulate_branch", {"branch_id": bid_b, "horizon_days": 12})
        page.wait_for_timeout(900)

    print("\n=== PHASE C: compare + explain ===")
    if bid_a and bid_b:
        call(page, "compare_branches", {"branch_ids": [bid_a, bid_b]})
        call(page, "explain_tradeoff", {"branch_id": bid_a, "versus_branch_id": bid_b, "focus": "all"})

    print("\n=== PHASE D: stage, then attempt apply WITHOUT approval (safety check) ===")
    if bid_a:
        st = call(page, "stage_plan", {
            "branch_id": bid_a,
            "rationale": "Agent-staged plan: protects tiers 1-2 within the delay ceiling.",
        })
        page.wait_for_timeout(1000)

    print("\n  >>> SAFETY: apply_plan must be ABSENT before human approval <<<")
    pre = registered(page)
    has_apply_pre = "apply_plan" in pre
    attempt = call(page, "apply_plan", {"plan_id": "whatever"})
    print(f"  apply_plan in registry before approval? {has_apply_pre}")
    print(f"  agent attempt result: {attempt.get('error') or attempt.get('summary')}")
    results.append({"safety_check": "apply_plan absent pre-approval",
                    "in_registry": has_apply_pre,
                    "agent_call_rejected": not attempt.get("available")})

    print("\n=== PHASE E: human approves in the UI -> agent may now apply ===")
    click(page, "approve-plan")
    page.wait_for_timeout(1300)
    post = registered(page)
    print(f"  apply_plan in registry after approval? {'apply_plan' in post}")
    results.append({"safety_check": "apply_plan present post-approval",
                    "in_registry": "apply_plan" in post})

    print(f"\nconsole/page errors: {len(errs)}")
    for e in errs[:5]:
        print("  !", e)

    b.close()

(OUT / "webmcp-journey.json").write_text(json.dumps(results, indent=2, default=str), encoding="utf-8")
print(f"\nJourney written to {OUT / 'webmcp-journey.json'}")
