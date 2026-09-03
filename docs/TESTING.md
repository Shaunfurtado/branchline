# Testing and verification

## Commands

```bash
npm install
npm run typecheck
npm run lint
npm run test
npm run check:tools
npm run build
npm run test:e2e
npm run capture
npm run verify
```

`npm run verify` covers typecheck, lint, domain/WebMCP tests, tool budgets, and production build. E2E is separate because it requires system Chromium and Python Playwright.

## Test layers

### Domain and WebMCP unit tests

`src/tests/domain.test.ts` and `src/tests/webmcp.test.ts` compile with strict TypeScript and run through Node’s built-in test runner.

Current coverage includes:

- scenario structure and required entities;
- data-derived Nori impact;
- graph path tracing;
- Voltra/ORION hard rejection;
- deterministic simulation;
- materially different strategy outcomes;
- source capacity and inventory invariants;
- pre-lock Apex tradeoff;
- post-lock allocation change;
- branch/global constraint merge policy;
- stale/invalid staging rejection;
- human-only approval and stale approval;
- apply idempotence;
- checkpoint-before-execution;
- verification;
- exact rollback and append-only audit;
- monotonic versions;
- metrics changing with source data;
- exact 14 tool surface;
- strict serializable schemas;
- annotations;
- malicious-looking external content;
- compact output envelopes;
- one shared human/tool state;
- dynamic lifecycle and context revocation;
- cancellation without partial results;
- duplicate prevention and AbortController cleanup.

### Tool-budget checks

`scripts/check-tool-budgets.mjs` verifies:

- exact canonical tool names;
- names under 30 characters;
- title/description budgets;
- executable definitions;
- boolean read-only/untrusted annotations;
- every object schema closes extra properties;
- schema serialization budget;
- external-alert and apply annotations.

### Chromium E2E

`e2e/test_featured_flow.py` loads the production `dist/` build at three viewport sizes and executes the canonical workflow through tools registered into the test-only `document.modelContext`.

The E2E suite verifies:

1. healthy state and six base tools;
2. shock and computed impact;
3. dynamic `create_branch` registration;
4. semantic trace visualization;
5. three branch creations/simulations;
6. Branchspace comparison;
7. human Apex protection;
8. stale cards and tool revocation;
9. balanced re-simulation;
10. staging and approval modal;
11. `apply_plan` absent before and present after UI approval;
12. commit and checkpoint;
13. verification and Apex protection;
14. Causal Proof evidence;
15. rollback and capability removal;
16. reset to healthy state;
17. no console/page errors;
18. 1024×768, 1440×900, 1920×1080 layout containment;
19. reduced-motion media query behavior;
20. keyboard dismissal and escaped untrusted alerts.

The mock is lifecycle-faithful but test-only. It is injected before application code with Playwright and is not shipped in `dist/`.

## Visual review

`scripts/capture_screenshots.py` drives the same registered tool surface and saves 1600×900 captures under `submission/screenshots/`:

| File | Moment |
|---|---|
| `01-healthy.png` | Healthy featured twin |
| `02-disrupted.png` | Featured NoriCell shock cascade |
| `03-branches.png` | Three recovery branches simulated |
| `04-compare.png` | Branchspace comparison |
| `05-staged-approval.png` | Staged plan awaiting human approval |
| `06-executed.png` | Commit after UI approval |
| `07-verified-recovery.png` | Verification evidence |
| `08-capability-surface.png` | Agent Capability Surface |
| `09-about-architecture.png` | Architecture / about surface |

These are the submission screenshots. Inspect hierarchy, clipping, text size, panel balance, causal legibility, and support-state accuracy before regenerating for a release.

## Header verification

The local server emits the required static headers. Verify with:

```bash
npm run build
python3 scripts/serve.py --root dist --port 4173 &
curl -I http://127.0.0.1:4173/
```

Expected relevant values:

```text
Origin-Agent-Cluster: ?1
Permissions-Policy: tools=(self)
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
```

Equivalent files exist for Vercel, Netlify, and `_headers`-compatible static hosts.

## Accessibility review

Automated browser assertions cover modal roles, accessible names, keyboard dismissal, and reduced motion. Manual review should additionally traverse:

- command bar controls;
- graph nodes with keyboard focus;
- view tabs;
- branch cards and stage controls;
- approval focus trap/restoration;
- Capability Dock;
- audit events;
- entity accessible record;
- report and rollback controls.

Status is expressed through text, shape, border, and icon in addition to color.

## Performance checks

- no runtime dependencies or post-load network calls;
- deterministic SVG positions, no force-layout recalculation;
- bounded branches (4), nodes, particles, and audit list rendering;
- cooperative simulation yields and cancellation checks;
- registry listener/controller cleanup;
- production output size reported by `scripts/verify-build.mjs` when run;
- tab visibility and reduced-motion behavior limit unnecessary animation.

## Native external-agent verification

The repository verifies native API shape and lifecycle through the injected ModelContext test double. A real ChatGPT Site tools recording requires a current compatible desktop build and account rollout. That credentialed external run is intentionally distinguished from automated tests and is listed as a manual submission step.
