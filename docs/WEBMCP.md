# WebMCP implementation

## Standards basis

Implementation was checked against the current official references on 2026-08-28:

- OpenAI Site tools: <https://developers.openai.com/codex/webmcp>
- Chrome WebMCP overview: <https://developer.chrome.com/docs/ai/webmcp>
- Chrome Imperative API: <https://developer.chrome.com/docs/ai/webmcp/imperative-api>
- Chrome best practices: <https://developer.chrome.com/docs/ai/webmcp/best-practices>
- Chrome secure tools guidance: <https://developer.chrome.com/docs/ai/webmcp/secure-tools>
- W3C proposal repository: <https://github.com/webmachinelearning/webmcp>

The API is experimental. BRANCHLINE feature-detects it and does not ship a production polyfill.

```ts
const supported =
  typeof document.modelContext?.registerTool === "function";
```

## Native registration

Native calls remain explicit in `src/webmcp/registry.ts`:

```ts
const controller = new AbortController();
await document.modelContext.registerTool(
  toolDefinitions[name],
  { signal: controller.signal },
);
```

Each tool definition includes:

- a stable semantic name;
- concise title and description;
- strict JSON Schema input;
- `readOnlyHint`;
- `untrustedContentHint`;
- an execution function accepting the browser-provided cancellation signal.

The registry owns one `AbortController` per active tool. Aborting that controller unregisters the capability. An execution’s separate `signal` is checked by handlers and the planner/simulator.

## Tool inventory

| Name | Annotation | Availability | Visible effect |
|---|---|---|---|
| `get_ops_snapshot` | read-only | Always | Full-twin scan sweep |
| `inspect_entity` | read-only | Always | Focuses entity and opens inspector |
| `trace_impact` | read-only | Always | Violet causal pulse and numbered path |
| `list_constraints` | read-only | Always | Shared-context scan |
| `find_substitutes` | read-only | Always | Candidate suppliers and ghost routes |
| `read_external_alerts` | read-only + untrusted | Always | Unverified-evidence notice |
| `create_branch` | stateful artifact | Disrupted, not executed | Future ribbon sprouts from present |
| `simulate_branch` | stateful artifact | Branch exists | Ribbon extends through day 30 |
| `compare_branches` | read-only | Two current simulations | Opens Branchspace |
| `explain_tradeoff` | read-only | Current simulation exists | Enters Causal Proof |
| `stage_plan` | stateful | Valid current simulation, no staged plan | Opens human approval surface |
| `apply_plan` | consequential | Current exact human approval | Future collapses into reality |
| `verify_plan` | read-only | Executed plan | Teal verification scan and evidence |
| `rollback_plan` | stateful | Executed plan + checkpoint | Timeline rewind and exact restore |

## Lifecycle reconciliation

`desiredToolNames(state)` is the single capability policy. The registry subscribes to store changes and reconciles only when the desired set changes.

```text
healthy                    6 read tools
active disruption          + create_branch
one branch                 + simulate_branch
one current simulation     + explain_tradeoff + stage_plan
two current simulations    + compare_branches
staged, unapproved         apply_plan absent
human-approved, current    + apply_plan
executed                   + verify_plan + rollback_plan
context changed            stale/revoke/unregister immediately
```

The Capability Dock renders `registeredNames`, not a fictional static list. When `getTools()` exists, BRANCHLINE also mirrors the native discovered set. `toolchange` causes a reconciliation refresh.

Duplicate registrations are prevented by the controller map. Development lifecycle cleanup aborts all active controllers. If a precondition changes while registration is in flight, the new controller is immediately aborted.

## Shared handler wrapper

Every invocation runs through `invokeTool`:

1. create an invocation and correlation ID;
2. record `started` activity;
3. validate the JSON-like input against the strict runtime schema;
4. validate phase and domain preconditions;
5. emit a tool-specific visual event;
6. call the shared store/domain method;
7. wait through two animation frames so visible state catches up;
8. record `completed`, `error`, or `cancelled` with duration;
9. return a compact structured envelope.

Expected domain failures are returned rather than thrown. Cancellation and unexpected programming failures may throw.

## Output envelope

```ts
interface ToolSuccess<T> {
  ok: true;
  code: "OK";
  summary: string;
  state_version: number;
  context_version: number;
  data: T;
  affected_ids?: string[];
  next_tools?: string[];
}

interface ToolFailure {
  ok: false;
  code:
    | "INVALID_INPUT"
    | "NOT_FOUND"
    | "WRONG_PHASE"
    | "STALE_BRANCH"
    | "CONSTRAINT_VIOLATION"
    | "APPROVAL_REQUIRED"
    | "STALE_APPROVAL"
    | "ALREADY_APPLIED"
    | "NO_CHECKPOINT"
    | "CANCELLED"
    | "INTERNAL_ERROR";
  summary: string;
  recoverable: boolean;
  state_version: number;
  context_version: number;
  details?: Record<string, unknown>;
  next_tools?: string[];
}
```

Lists are capped. IDs and summaries are compact. `npm run check:tools` enforces the exact 14 names, name/metadata budgets, serializable strict schemas, annotations, and object-schema closure.

## Human authority boundary

There is intentionally no `approve_plan` tool. `stage_plan` may only open the review surface. Approval is written by a direct human UI event and binds:

- plan ID;
- actor `human`;
- approval timestamp;
- context version;
- simulation hash;
- summary hash.

`apply_plan` is not registered until that record exists and remains current. If a human edits a constraint after approval, stale invalidation revokes the plan and aborts the registration.

## Test-only model context

`e2e/webmcp_mock.py` defines a lifecycle-faithful `document.modelContext` only through Playwright’s pre-page init script. It supports registration, AbortSignal unregistration, `getTools`, `executeTool`, and `toolchange`. It is never copied to `dist/` and the UI never labels it as a real external agent.

Browser E2E invokes the same registered definitions through `document.modelContext`, not by importing handlers directly. This verifies the native registration boundary while remaining honest that external ChatGPT-agent testing requires a compatible credentialed desktop environment.

## Progressive fallback

When unsupported:

- the command center is still fully operational;
- manual branch, simulation, approval, apply, verify, report, and rollback controls remain available;
- the command bar says site tools are unavailable;
- the Capability Dock explains the browser requirement;
- no fake connected state is shown.
