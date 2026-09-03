# Judging map

This document maps observable evidence—not aspirational claims—to the four challenge dimensions.

## WebMCP leverage

| Evidence | Path / behavior |
|---|---|
| Direct native registration | `src/webmcp/registry.ts` calls `document.modelContext.registerTool` |
| Fourteen typed semantic tools | `src/webmcp/definitions.ts`, `schemas.ts`, `handlers.ts` |
| Strict schemas/runtime validation | `src/webmcp/schemas.ts`; schema tests |
| Read-only annotations | Definitions and `src/tests/webmcp.test.ts` |
| Untrusted external alerts | `read_external_alerts`, `untrustedContentHint: true`, escaped alert test |
| Shared live page state | Human controls and tools call singleton `branchlineStore` |
| Dynamic registration | `desiredToolNames` + per-tool AbortControllers in registry |
| Human intent changes agent context | Protecting `order_1082` increments context, stales branches, revokes tools |
| Approval boundary | No approval tool; `apply_plan` absent until UI approval |
| Visible semantic calls | Tool wrapper emits graph/future/commit/verify/rollback visual events |
| Verification | `verify_plan` compares simulated and actual evidence |
| Rollback | Exact checkpoint restore with retained audit |
| Capability truthfulness | Dock mirrors registered and native-discovered names |
| Cancellation | Simulation abort checks and no-partial-result test |

Judge sequence evidence: `e2e/test_featured_flow.py` and `submission/screenshots/01`–`09`.

## Execution

| Evidence | Path / behavior |
|---|---|
| Coherent full workflow | Healthy → shock → branch → stale → approve → commit → verify → rollback |
| Deterministic data and planner | `src/data/`, `src/domain/planner.ts`, `simulator.ts` |
| Manual human product | Shared controls in left/right rails and overlays |
| Original visual system | Custom Causal Atlas, Branchspace, intent wave, commit/rewind CSS/SVG |
| Empty/unsupported states | Healthy Branch Chamber and WebMCP fallback banner |
| Error states | Structured domain errors and toast/locked-capability reasons |
| Responsive behavior | E2E at 1024, 1440, 1920 widths |
| Accessibility | Semantic controls, modal roles, focus handling, reduced motion, accessible entity record |
| Security | `docs/SECURITY.md`, strict input tests, no approval bypass |
| Tests | 23 unit/WebMCP tests + 5 Chromium E2E tests |
| Static deployment | `dist/`, `vercel.json`, `netlify.toml`, `public/_headers` |
| Documentation | README and `docs/` set |
| Submission captures | Nine screenshots in `submission/screenshots/` |
| Live demo | https://branchline-flax.vercel.app/?fresh=1 |
| Public repository | https://github.com/Shaunfurtado/branchline |
| Judge testing notes | `submission/testing-instructions.md` |

## Potential impact

Target user: an operations or supply-chain planning lead at a mid-sized manufacturer coordinating disruptions across ERP screens, spreadsheets, supplier messages, inventory reports, production plans, and logistics tools.

Concrete product value demonstrated:

- one semantic path across dependencies instead of disconnected screen navigation;
- simultaneous comparison of service, cost, risk, and emissions futures;
- direct human constraints that become the agent’s next exact context;
- execution authority retained by the person;
- structured evidence and rollback rather than an untraceable recommendation.

The project does not claim measured hours saved, accuracy gains, or production readiness. All data is synthetic and visibly disclosed. A credible production path would connect the same command/domain boundaries to authenticated ERP/TMS/WMS adapters with server-side policy and audit storage.

## Creativity and ambition

| Differentiator | Evidence |
|---|---|
| Futures as spatial objects | Branchspace ribbons with shared origin and T+0/T+7/T+14/T+30 snapshots |
| Human intent as live causal input | Gold pin and upstream wave on `order_1082` |
| Stale-state fracture | Ribbons/cards freeze amber and lose stage/apply capabilities |
| Future-to-reality commit | View Transition/CSS convergence plus actual state mutation |
| Causal Proof | Numbered observation/action/counterfactual evidence from simulation data |
| Dynamic capability choreography | Capability Dock animates actual register/unregister transitions |
| Cinematic rollback | Exact restore plus reverse-motion phase and retained history |
| No chatbot crutch | The product is the operational world; the agent interface is WebMCP |

## Honest end-state metrics

The verified featured commit displays only derived values:

```text
$26.56M revenue protected (93.4% of exposure)
$258,849 incremental cost
23/24 orders on time
1 lower-priority delayed order
0 hard violations
Apex order at T+1
13 semantic calls at verification capture
43 entities inspected
1 human approval
1 rollback checkpoint
```

These values are seed-dependent outputs, not hardcoded marketing claims.
