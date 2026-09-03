"""Discover real IDs from live tool output, then invoke WebMCP tools with
valid arguments to prove the handlers actually run end-to-end."""
import json
import pathlib
import sys

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from webmcp_verify import SHIM, click, invoke, registered  # noqa: E402

BASE = "http://127.0.0.1:4173"
OUT = pathlib.Path(__file__).resolve().parent


def show(title, obj, limit=1400):
    s = json.dumps(obj, default=str)
    print(f"\n--- {title} ---")
    print(s[:limit] + (" ...[truncated]" if len(s) > limit else ""))


def find_ids(obj, acc=None, depth=0):
    """Collect id-ish fields from a nested structure."""
    if acc is None:
        acc = {}
    if depth > 5:
        return acc
    if isinstance(obj, dict):
        for k, v in obj.items():
            if isinstance(v, str) and ("id" in k.lower() or k.endswith("Id")):
                acc.setdefault(k, v)
            if isinstance(v, (dict, list)):
                find_ids(v, acc, depth + 1)
    elif isinstance(obj, list):
        for v in obj[:12]:
            find_ids(v, acc, depth + 1)
    return acc


with sync_playwright() as pw:
    b = pw.chromium.launch()
    page = b.new_page(viewport={"width": 1600, "height": 1000})
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    page.add_init_script(SHIM)
    page.goto(f"{BASE}/?fresh=1&tour=0", wait_until="networkidle")
    page.wait_for_timeout(1200)

    # ---- Disrupt, then snapshot ----
    click(page, "trigger-shock")
    page.wait_for_timeout(1200)

    snap = invoke(page, "get_ops_snapshot", {})
    data = (snap.get("result") or {}).get("data") if snap.get("ok") else None
    ids = find_ids(snap.get("result") or {})
    show("get_ops_snapshot (disrupted) summary", {
        "ok": (snap.get("result") or {}).get("ok"),
        "summary": (snap.get("result") or {}).get("summary"),
        "affected_ids": (snap.get("result") or {}).get("affected_ids"),
    })
    show("discovered id fields", ids)

    # ---- trace_impact on the disruption / supplier ----
    src = ids.get("disruption_id") or ids.get("id") or ids.get("source_id")
    if src:
        tr = invoke(page, "trace_impact", {"source_id": src, "direction": "downstream", "max_depth": 4})
        r = tr.get("result") or {}
        show(f"trace_impact(source_id={src})", {
            "ok": r.get("ok"), "summary": r.get("summary"),
            "affected_count": len(r.get("affected_ids") or []),
            "sample": (r.get("affected_ids") or [])[:6],
        })

    # ---- inspect_entity on an affected entity ----
    ent = None
    for k in ("entity_id", "component_id", "supplier_id", "node_id"):
        if ids.get(k):
            ent = ids[k]
            break
    if ent:
        ins = invoke(page, "inspect_entity", {"entity_id": ent, "include_links": True})
        r = ins.get("result") or {}
        show(f"inspect_entity(entity_id={ent})", {
            "ok": r.get("ok"), "summary": r.get("summary"),
        })

    # ---- list_constraints (no args) ----
    lc = invoke(page, "list_constraints", {})
    r = lc.get("result") or {}
    show("list_constraints()", {"ok": r.get("ok"), "summary": r.get("summary")})

    # ---- create a branch via the tool itself ----
    cb = invoke(page, "create_branch", {
        "name": "Agent-authored probe",
        "strategy": "service_first",
        "note": "Created by calling the WebMCP tool directly.",
    })
    r = cb.get("result") or {}
    show("create_branch(...) [agent writes via MCP]", {
        "ok": r.get("ok"), "summary": r.get("summary"),
        "affected_ids": r.get("affected_ids"), "next_tools": r.get("next_tools"),
    })
    page.wait_for_timeout(1200)
    print("\nregistered after agent create_branch:", registered(page))

    # ---- simulate it ----
    bid = None
    for k, v in find_ids(r).items():
        if "branch" in k.lower():
            bid = v
            break
    if bid:
        sb = invoke(page, "simulate_branch", {"branch_id": bid})
        r2 = sb.get("result") or {}
        show(f"simulate_branch(branch_id={bid})", {
            "ok": r2.get("ok"), "summary": r2.get("summary"), "next_tools": r2.get("next_tools"),
        })

    # ---- read_external_alerts (untrusted-content tool) ----
    ra = invoke(page, "read_external_alerts", {})
    r3 = ra.get("result") or {}
    show("read_external_alerts() [untrusted]", {"ok": r3.get("ok"), "summary": r3.get("summary")})

    # ---- Schema validation negative test ----
    bad = invoke(page, "inspect_entity", {"entity_id": ""})
    show("inspect_entity(entity_id='') [negative test]", {
        "ok": (bad.get("result") or {}).get("ok"),
        "summary": (bad.get("result") or {}).get("summary"),
    })

    bad2 = invoke(page, "trace_impact", {"source_id": src or "x", "direction": "sideways"})
    show("trace_impact(direction='sideways') [negative test]", {
        "ok": (bad2.get("result") or {}).get("ok"),
        "summary": (bad2.get("result") or {}).get("summary"),
    })

    print(f"\nconsole/page errors: {len(errs)}")
    for e in errs[:5]:
        print("  !", e)
    b.close()
