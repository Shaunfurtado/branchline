"""Why did tool-driven simulates not unlock compare_branches / stage_plan?

desiredToolNames gates them on currentSimulatedBranches(state).length.
Dump the branch records after tool-driven simulates to see their status /
simulation / staleness, and watch the registry over time.
"""
import json
import pathlib
import sys

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from webmcp_verify import SHIM, click, invoke, registered  # noqa: E402

BASE = "http://127.0.0.1:4173"

with sync_playwright() as pw:
    b = pw.chromium.launch()
    page = b.new_page(viewport={"width": 1600, "height": 1000})
    page.add_init_script(SHIM)
    page.goto(f"{BASE}/?fresh=1&tour=0", wait_until="networkidle")
    page.wait_for_timeout(1200)

    click(page, "trigger-shock")
    page.wait_for_timeout(1200)

    invoke(page, "create_branch", {"name": "Probe A", "strategy": "service_first"})
    page.wait_for_timeout(700)
    invoke(page, "create_branch", {"name": "Probe B", "strategy": "cost_guard"})
    page.wait_for_timeout(700)

    snap = invoke(page, "get_ops_snapshot", {})
    data = (snap.get("result") or {}).get("data") or {}
    print("snapshot data keys:", list(data.keys()))

    branches = data.get("branches") or []
    ids = [br.get("id") for br in branches if isinstance(br, dict)]
    print("branch ids:", ids)

    for bid in ids:
        r = invoke(page, "simulate_branch", {"branch_id": bid, "horizon_days": 12})
        print(f"simulate {bid} -> {(r.get('result') or {}).get('summary')}")
        page.wait_for_timeout(1200)

    # Watch the registry settle over time
    for wait in (0, 800, 1600, 2600):
        if wait:
            page.wait_for_timeout(wait if wait == 800 else 800)
        print(f"  registered[+{wait}ms]: {registered(page)}")

    # Now dump branch records in detail
    snap2 = invoke(page, "get_ops_snapshot", {})
    d2 = (snap2.get("result") or {}).get("data") or {}
    brs = d2.get("branches") or []
    print("\nbranch records after simulate:")
    for br in brs:
        if not isinstance(br, dict):
            continue
        print("   FULL:", json.dumps(br, default=str)[:1200])
    b.close()
