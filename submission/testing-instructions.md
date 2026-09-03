# Testing instructions (for judges)

**No login or credentials are required.**

## Live app

Open:

https://branchline-flax.vercel.app/?fresh=1

`?fresh=1` starts from the healthy featured baseline (ignores any prior local demo state).

## What this app is

BRANCHLINE is a static operational recovery demo for the OpenAI WebMCP challenge. One human UI and fourteen typed WebMCP tools share a single live supply-chain twin. You can run the full workflow with the UI alone; Site tools / WebMCP are optional and unlock the agent path.

## Quick human walkthrough (5–7 min)

1. Confirm the healthy Asterion Mobility twin and **6** inspection tools in the command bar.
2. Click **Trigger featured supplier shock**. Check the cascade numbers: 16 affected orders, 2 constrained plants, $28.43M exposure, 48,300-cell shortfall.
3. Open **Agent Capability Surface** and note `create_branch` appearing after the shock.
4. Create and simulate three recovery strategies (Service First, Cost Guard, Balanced), then compare them in Branchspace.
5. Select `order_1082` (Apex Health) and click **Protect this order**. Confirm gold intent, stale prior branches, and revoked stage/apply capabilities.
6. Re-simulate the balanced branch, stage it, then **Approve and unlock execution** yourself in the UI.
7. Confirm `apply_plan` appears only after that approval. Apply, verify, open Causal Proof, then optionally roll back or **Reset**.

Canonical agent prompt (also available via the in-app copy control after the shock):

> Inspect the active disruption. Protect every Tier-1 customer and keep incremental cost below $300,000. Never use Voltra V-2170 cells in ORION-X. Create and simulate three materially different recovery branches, compare them, recommend one, and stage it for approval. Do not execute any operational change until I approve it in the BRANCHLINE interface.

## WebMCP / Site tools (optional)

Use a current Site-tools-compatible browser (for example ChatGPT desktop with Site tools enabled). Confirm BRANCHLINE’s tools appear under the address-bar **Site tools** control.

If WebMCP is unavailable, the app still works fully through the human UI and shows a clear fallback notice. That is expected; do not treat the local test mock as a live agent.

## Local run (optional)

```bash
npm install
npm run build
npm run preview
```

Open `http://127.0.0.1:4173/?fresh=1`.

Requires Node.js 22+ and Python 3.11+ (`python3` or `py -3` on Windows).

Automated checks:

```bash
npm run verify
npm run test:e2e
```

## Source and docs

- Repository: https://github.com/Shaunfurtado/branchline
- Judge walkthrough: `docs/DEMO_SCRIPT.md`
- WebMCP tool surface: `docs/WEBMCP.md`
- Screenshots: `submission/screenshots/`

## Synthetic-data note

All companies, orders, routes, costs, and disruptions are fictional. Nothing connects to a real ERP, TMS, WMS, or production system.
