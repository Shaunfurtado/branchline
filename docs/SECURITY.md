# Security review

## Scope

BRANCHLINE is a synthetic, client-only demonstration. It has no real supplier, customer, payment, production, ERP, identity, or procurement connection. The security model nevertheless treats WebMCP as an action surface and applies explicit trust and lifecycle boundaries.

## Origin and browser policy

The application is intended for a top-level, origin-isolated document.

Configured headers:

```text
Origin-Agent-Cluster: ?1
Permissions-Policy: tools=(self)
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
```

The source does not set `document.domain`, does not use `Origin-Agent-Cluster: ?0`, and does not configure `exposedTo`. Tools therefore remain same-origin by default. No untested COOP/COEP requirement is added.

## Input validation

Every WebMCP tool has a JSON Schema and a second runtime validator in `src/webmcp/schemas.ts`.

Controls include:

- exact object shape with `additionalProperties: false`;
- required fields;
- bounded strings;
- bounded numbers and integers;
- explicit enums;
- bounded/unique arrays;
- nested object validation;
- no dynamic code evaluation;
- no unsafe unvalidated property traversal.

Expected errors return structured failure envelopes with recovery guidance. Domain methods independently validate entity existence, state phase, context currency, and invariants.

## External and untrusted content

`read_external_alerts` sets:

```ts
{
  readOnlyHint: true,
  untrustedContentHint: true,
}
```

Alerts are synthetic external evidence with a visible unverified label. Their text is returned as data and rendered through `escapeHtml`; no external alert is inserted as HTML. The test dataset includes malicious-looking HTML and instruction-like language. Tests assert that it remains visible text and creates no DOM element.

Tool output warns the agent to validate important claims using operational tools. External text cannot alter constraints, branch actions, approvals, or capability registration.

## Human approval

Consequential execution has two independent gates:

1. application policy: a current staged plan must have an exact human approval record;
2. capability policy: `apply_plan` is not registered before that record exists.

There is no approval tool, query parameter, debug endpoint, or hidden event that grants approval. The developer lab can invoke registered tools only; it cannot bypass registration policy or create approval.

Approval is revoked when the decision context changes. Apply revalidates context, simulation hash, summary hash, hard constraints, approval actor, and idempotence immediately before mutation.

## Transaction, verification, and rollback

Apply creates the rollback checkpoint before operational mutation. The committed action set is validated against:

- non-negative inventory;
- supplier and lot availability;
- factory capacity;
- product/factory compatibility;
- cell/product compatibility;
- Voltra-to-ORION prohibition;
- global protected tiers;
- human order locks;
- budget and branch constraints.

A second call for the same plan returns the prior committed transaction rather than applying twice. Verification compares simulated and actual metrics and reports all hard-constraint evidence. Rollback restores the exact checkpoint snapshot and appends a new audit event; it does not erase execution history.

## Registration lifecycle

One AbortController owns each registration. The desired capability set derives from current state. Obsolete tools are aborted before new ones are added. A tool whose preconditions change during asynchronous registration is immediately aborted. Registry shutdown aborts every tool and removes listeners.

This prevents stale `stage_plan` or `apply_plan` capabilities from remaining callable after a human changes shared context.

## Cancellation and reset

Execution receives the browser cancellation signal. Simulation checks abort state around candidate generation and cooperative yields. A cancelled run restores branch status without persisting a partial result. Scenario reset changes the reset token and reconstructs the base world, preventing in-flight work from committing into a new scenario.

## Rendering

The UI is generated from local typed state. Strings that may originate from tool input, branch names, rationales, errors, or external alerts are escaped at component boundaries. The root `innerHTML` assignment only receives those generated templates; lint requires an explicit safe-HTML annotation for assignments and rejects `dangerouslySetInnerHTML`.

No remote scripts, images, fonts, analytics, or post-load network calls are required.

## Secrets and privacy

- no OpenAI API key;
- no environment variables;
- no secret token;
- no real PII;
- no analytics or tracking;
- no consent-requiring telemetry;
- local storage contains only synthetic state and compact synthetic activity logs.

## Threats not claimed solved

This demonstration is not a production security certification. A production deployment connected to real systems would additionally require authentication, authorization, transaction signing, server-side invariant enforcement, tenant isolation, durable audit storage, integration-specific approvals, rate limiting, anti-replay controls, threat monitoring, and data governance.

## Verification evidence

- malicious alert rendering test;
- extra-property and malformed-schema tests;
- absent `apply_plan` before approval E2E assertion;
- stale-context revocation tests;
- idempotence/checkpoint/rollback tests;
- no browser console/page errors in canonical E2E;
- exact native registry lifecycle mock tests;
- header checks documented in `docs/TESTING.md`.
