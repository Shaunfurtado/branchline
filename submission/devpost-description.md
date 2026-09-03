# BRANCHLINE

## Fork reality. Simulate the consequences. Commit the future.

**Live application:** [https://trybranchline.vercel.app/?fresh=1](https://trybranchline.vercel.app/?fresh=1)  
**Repository:** [https://github.com/Shaunfurtado/branchline](https://github.com/Shaunfurtado/branchline)  
**Video:** _Recording/upload pending; complete script and captions included._  
**Testing instructions:** no credentials — see `submission/testing-instructions.md`

## The problem

A supplier outage is not one broken record in an ERP. It propagates through component compatibility, purchase orders, transport lanes, plant inventory, production capacity, product schedules, customer tiers, contractual due dates, revenue, and cost. Operations leads often reconstruct that chain across multiple screens, spreadsheets, messages, and planning tools before they can even compare recovery options.

An ordinary browser agent does not inherently understand those operational semantics. It can inspect a DOM or move a cursor, but it must infer which values matter, which actions are reversible, whether a simulation is stale, and when execution is allowed.

## What BRANCHLINE does

BRANCHLINE is an agent-native operational recovery control plane for complex supply chains. It gives a person and their browser agent two equal interfaces into one deterministic live operational twin.

The featured synthetic world models Asterion Mobility, a fictional commercial EV-platform manufacturer with twelve suppliers, three plants, four products, three hubs, ten transport lanes, eight customers, and twenty-four orders.

When the human triggers a twelve-day NoriCell outage, BRANCHLINE computes and renders the cascade:

- 16 affected orders;
- 2 critically constrained plants;
- $28.43M exposed revenue;
- a 48,300-cell near-term shortfall.

The agent can trace that impact, inspect entities, find compatible substitutes, create recovery branches, and run a deterministic day-0-to-day-30 simulation. Branchspace renders those alternatives as parallel futures emerging from one shared present rather than as ordinary recommendation cards.

## The defining collaboration

Before human intervention, the otherwise attractive Cost Guard future delays `order_1082`, an ORION-X order for Apex Health Logistics.

The human opens that order in the visual application and presses **Protect this order**.

That direct interface action:

1. drops a gold human-intent seal on the order;
2. sends a gold wave upstream through its dependencies;
3. increments the shared context version;
4. marks every prior simulation stale;
5. revokes any staged or approved plan;
6. unregisters capabilities whose preconditions no longer hold.

The agent’s next WebMCP call sees the exact human-authored lock. Re-simulating the balanced branch reallocates scarce compatible Helix inventory to Pune, projects Apex at T+1, and moves the delay to a lower-priority order. That result comes from the priority and allocation engine, not a visual switch.

## Why is this use case a strong fit for WebMCP?

Operational recovery is a long semantic workflow over a changing page state. The agent needs precise operations such as “trace downstream impact,” “find compatible substitute supply,” “simulate this strategy against context version 3,” and “verify the applied plan.” Those are much richer and safer than clicking controls whose meaning must be inferred from pixels.

WebMCP also makes capability availability part of the product. BRANCHLINE registers only tools that are currently valid. `apply_plan` does not exist until a human approves the exact simulated diff in the page. If the context changes, the registration is immediately aborted. This is materially better than exposing one flat action list and relying on prose warnings.

## How does it create a better user experience?

Every semantic tool call has a meaningful visual consequence:

- snapshots sweep the whole twin;
- entity inspection focuses the graph and opens an accessible record;
- impact traces send a violet pulse through causal edges;
- substitute search draws ghost supply routes;
- branch creation sprouts a future ribbon;
- simulation extends it through T+30;
- comparison fans futures apart;
- human intent appears in gold;
- stale futures fracture amber;
- commit converges one future into reality;
- verification scans the result;
- rollback visibly rewinds the timeline.

The person does not have to choose between a usable visual application and agent automation. Both interfaces remain complete, and both call the same domain methods.

## What can people and agents do together that was difficult before?

The agent can compress a multi-screen operational investigation into typed semantic calls while the human stays oriented in the causal world. The human can then change intent directly—without translating it into a chat instruction—and know the agent’s next action will use that exact state. The application automatically invalidates stale reasoning, preserves a human authority boundary, verifies the committed result, and keeps an exact rollback checkpoint.

The collaboration is therefore not “agent proposes, human watches.” It is a shared control loop:

```text
OBSERVE → TRACE → BRANCH → SIMULATE
→ HUMAN CHANGES INTENT → RE-SIMULATE
→ STAGE → HUMAN APPROVAL → COMMIT
→ VERIFY → EXPLAIN → ROLLBACK
```

## How WebMCP was implemented

BRANCHLINE uses the current imperative API directly:

```ts
await document.modelContext.registerTool(
  toolDefinitions[name],
  { signal: controller.signal },
);
```

The application implements fourteen strict tools:

```text
get_ops_snapshot      inspect_entity
trace_impact          list_constraints
find_substitutes      read_external_alerts
create_branch         simulate_branch
compare_branches      explain_tradeoff
stage_plan            apply_plan
verify_plan           rollback_plan
```

Each tool has a compact JSON Schema with `additionalProperties: false`, runtime validation, a structured output envelope, cancellation handling, invocation/correlation logging, and a visual event. All true read tools use `readOnlyHint`. External alerts use `untrustedContentHint` and are rendered only as escaped text.

A registry owns one AbortController per active tool, prevents duplicates, reconciles desired capabilities from live state, aborts obsolete registrations, listens for `toolchange`, and mirrors `getTools()` into the Agent Capability Surface.

There is deliberately no WebMCP approval tool. Human approval is bound to the plan ID, context version, simulation hash, and summary hash. Only then is `apply_plan` registered.

## Simulation and planning

The planner generates bounded deterministic candidates from compatible supplier profiles, source splits, routes, inventory transfers, production resequencing, and eligible deferrals. It simulates every candidate across 31 daily states, rejects hard violations, scores the survivors under Service First, Cost Guard, Balanced, or Resilience weights, and breaks ties by a stable action signature.

The simulator enforces:

- integer non-negative inventory;
- lot and supplier availability;
- transport timing;
- daily plant capacity;
- product/factory compatibility;
- component/product compatibility;
- protected Tier-1 orders;
- human order locks;
- the hard rule that Voltra V-2170 cells can never supply ORION-X.

Displayed revenue, service, cost, concentration, risk, emissions, action, and delay metrics are derived from that state. Risk and emissions are visibly labeled simplified synthetic planning indicators.

## Approval, commit, verification, and rollback

`stage_plan` opens a focused review with current hashes, costs, revenue, service, delayed orders, compatibility, human locks, assumptions, action evidence, and reversibility. No operational state changes at staging.

After direct UI approval, `apply_plan` creates a checkpoint first, validates the exact current transaction, applies actions idempotently, and updates the live graph. `verify_plan` compares actual metrics with the simulated promise and rechecks every hard constraint. `rollback_plan` restores the exact operational snapshot while retaining both execution and rollback in the append-only audit trail.

In the verified featured run after the Apex lock:

- $26.56M revenue is protected;
- 93.4% of computed exposure is recovered;
- incremental cost is $258,849;
- 23 of 24 orders are on time;
- one lower-priority order is delayed;
- Apex arrives at T+1;
- hard violations are zero;
- there is exactly one human approval and one rollback checkpoint.

## Causal Proof

BRANCHLINE contains no embedded LLM. Explanations are generated from simulation evidence and recovery actions. Causal Proof distinguishes observations, actions, and counterfactuals and highlights the corresponding entities in the graph. For the featured plan it explains the Nori outage, ORION thermal rule, Voltra rejection, compatible capacity, Helix allocation, inventory transfer, Apex protection, and the order that would otherwise retain the delay.

## Potential impact

The target user is an operations or supply-chain planning lead at a mid-sized manufacturer. BRANCHLINE demonstrates how a real product could unify planning semantics without removing human authority. The same architecture could later connect to authenticated ERP, TMS, WMS, supplier, and production systems with server-side policies and durable audit storage.

No time-saved, click-reduction, accuracy, or ROI claim is made because those outcomes were not benchmarked.

## Creativity and ambition

BRANCHLINE treats possible futures as first-class spatial objects. Human intent is a live graph constraint. Capabilities enter and leave the agent’s world as preconditions change. A committed branch physically becomes the current reality, and rollback visibly reverses it.

This is not a dashboard with a chatbot attached. It is one operational world with a human interface and an agent interface.

## Testing

No credentials are required for the live app.

**Live:** https://trybranchline.vercel.app/?fresh=1

**Local:**

```bash
npm install
npm run verify
npm run test:e2e
npm run capture
```

Verified automated coverage includes 23 domain/WebMCP tests and 5 Chromium E2E tests. The browser suite executes the canonical flow through a test-only `document.modelContext` lifecycle mock, checks dynamic registration and approval gating, asserts no console/page errors, validates escaped malicious-looking alerts, and tests 1024×768, 1440×900, and 1920×1080 layouts.

The production application does not ship that mock. A real submission recording should use a current compatible Site-tools browser agent. Full judge instructions: `submission/testing-instructions.md`.

## Synthetic-data disclosure

**Synthetic operational twin. No real orders, purchases, shipments, or production systems are changed.**

Every company, supplier, customer, product, route, order, cost, reliability value, and disruption is fictional. BRANCHLINE is a credible interaction and simulation demonstration, not production-certified supply-chain software.
