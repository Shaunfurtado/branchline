# BRANCHLINE architecture

## Architectural invariant

BRANCHLINE has one operational reality. The human interface and the WebMCP interface never own independent copies of business state.

```text
                         one deterministic domain engine
                                    │
                        centralized BranchlineStore
                                    │
              ┌─────────────────────┴─────────────────────┐
              │                                           │
       human event handlers                       WebMCP handlers
  controls, graph, approvals, audit        schemas, lifecycle, outputs
              │                                           │
              └──────────── same domain methods ───────────┘
```

The static client runs entirely in the page. There is no agent backend, database, API key, hidden optimizer service, or internal chat interface.

## Command and state flow

Meaningful work follows this order:

```text
intent
→ runtime validation
→ phase/precondition validation
→ shared store/domain method
→ deterministic mutation or simulation
→ stateVersion increment
→ contextVersion increment when decision context changed
→ append-only audit event
→ visual event
→ native tool-registry reconciliation
→ DOM/SVG render
```

Human controls and WebMCP handlers call the same store methods. For example, the human **Protect this order** action and subsequent `list_constraints` / `simulate_branch` calls all operate on `branchlineStore`.

`src/app/commandBus.ts` defines the generic command envelope and dispatch seam. The store is the transaction boundary for the current client implementation. It validates each operation, updates versions, writes provenance, emits visual events, persists safe local state, and notifies both renderer and registry.

## Version model

### `stateVersion`

Increments for every meaningful application change, including branch creation, simulation completion, staging, approval, execution, verification, rollback, and decision-context changes.

### `contextVersion`

Increments only when the operational decision context changes:

- disruption activation or removal;
- route event changes;
- global constraint edits;
- human order protection;
- operational execution;
- rollback.

Each simulation stores both `contextVersion` and a stable context hash. A mismatch causes immediate stale invalidation. A stale branch cannot stage; any staged/approved plan is revoked; and consequential tools are unregistered.

## Transaction model

The `BranchlineStore.mutate` helper:

1. clones the previous immutable state;
2. applies a validated mutation;
3. increments versions;
4. invalidates branches when context changes;
5. appends an `AuditEvent` with deterministic timestamp and evidence;
6. emits a `VisualEvent`;
7. recomputes phase and entity status;
8. persists the result;
9. notifies subscribers.

Plan execution validates the exact approval, context, branch hash, action invariants, and idempotence key before creating a checkpoint and changing operational state. Rollback restores the checkpoint’s operational snapshot but retains the audit, tool activity, and checkpoint records.

## Domain boundaries

| Boundary | Files | Responsibility |
|---|---|---|
| Scenario | `src/data/` | Deterministic synthetic entities and validation |
| Graph and impact | `src/domain/graph.ts`, `impact.ts` | Directed dependency traversal and computed headline exposure |
| Constraints | `src/domain/constraints.ts` | Compatibility and branch/global merge rules |
| Planner | `src/domain/planner.ts` | Bounded deterministic candidate generation |
| Simulator | `src/domain/simulator.ts` | Day 0–30 inventory, capacity, fulfillment, cost, risk, emissions |
| Scoring | `src/domain/scoring.ts` | Strategy-specific normalized ranking |
| Invariants | `src/domain/invariants.ts` | Hard post-simulation and execution checks |
| Store | `src/store/branchlineStore.ts` | Transaction boundary, versions, audit, checkpoint lifecycle |
| WebMCP | `src/webmcp/` | Schemas, handlers, native definitions, dynamic registry |
| Renderer | `src/components/`, `src/styles/` | Accessible command center and signature motion |
| Tests | `src/tests/`, `e2e/` | Domain, registry, security, browser flow, responsiveness |

## Rendering architecture

Business state never waits for animation. The store commits first, then appends a semantic `VisualEvent`. Components derive visuals from current state plus the latest visual event.

Examples:

- `shock_started` renders the radial outage wave and affected causal edges;
- `impact_traced` focuses the graph and numbered path;
- `branch_created` sprouts a future;
- `branches_compared` enters Branchspace;
- `human_constraint_added` draws the gold upstream wave;
- `reality_committed` runs the future-to-reality transition;
- `checkpoint_restored` runs the rewind treatment.

SVG entity positions are fixed in scenario data for deterministic identity-preserving transitions. The application uses no random force layout. CSS respects `prefers-reduced-motion`; optional Web Audio is muted until the human enables it.

The current presentation layer uses a light editorial visual system (tokens in `src/styles/tokens.css`, layout/motion in `global.css` / `responsive.css` / `motion.css`). Visual treatment must never invent metrics; all numbers remain simulator-derived.

## WebMCP lifecycle

`src/webmcp/registry.ts` owns one `AbortController` per registered tool. It compares `desiredToolNames(state)` against active controllers, aborts obsolete registrations, registers newly valid tools with direct native calls, and mirrors the current registry to the Capability Dock. It optionally reconciles with `document.modelContext.getTools()` and listens for `toolchange`.

The registry is a progressive enhancement. When `document.modelContext?.registerTool` is unavailable, the human application remains fully functional and reports the limitation accurately.

## Persistence and reset

State is persisted to local storage with the synthetic scenario identifier and versioned structure. Native registry state and temporary overlays are not trusted across refresh. `?fresh=1` bypasses persistence. **Reset** clears persistence, increments a reset token to cancel stale work, and reconstructs the healthy deterministic world.

## Static deployment

Live demo: https://trybranchline.vercel.app/?fresh=1

The production build contains only HTML, CSS, JavaScript, and SVG assets. The included Python server and hosting configurations add:

```text
Origin-Agent-Cluster: ?1
Permissions-Policy: tools=(self)
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
```

No cross-origin tool exposure is configured.
