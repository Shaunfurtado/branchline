# Verified release report

Verified on **2026-08-28** against the repository state packaged with this report.

## Release commands

| Command | Result |
|---|---|
| `npm run typecheck` | Passed, strict TypeScript compilation with no diagnostics. |
| `npm run lint` | Passed custom source/release checks. |
| `npm run test` | Passed **23/23** Node tests; 0 failed, skipped, or cancelled. |
| `npm run check:tools` | Passed; exactly **14** tools, 4,870 total schema bytes, 20-character longest tool name. |
| `npm run build` | Passed; static production output generated in `dist/`. |
| `npm run verify:build` | Passed; **89 files**, **599.3 KiB** total, **283.9 KiB** JavaScript. |
| `npm run test:e2e` | Passed **5/5** Chromium tests in 23.42 seconds. |
| `npm run capture` | Passed; seven 1600×900 release screenshots regenerated. |

`npm run verify` completed successfully as one chained release gate.

## Deterministic featured outcome

The featured NoriCell shock was recalculated from scenario data during tests:

- 16 affected orders;
- 2 critically constrained plants;
- $28.43M exposed revenue;
- 48,300-cell near-term shortfall.

The tested post-lock balanced recovery protects the Apex Health order, keeps hard compatibility violations at zero, delays one lower-priority order, protects $26.56M (93.4%) of computed exposure, and commits at $258,849 incremental cost in the captured run.

## Native WebMCP verification boundary

The production source contains direct native registration in `src/webmcp/registry.ts`:

```ts
await document.modelContext.registerTool(toolDefinitions[name], {
  signal: controller.signal,
});
```

The automated Chromium suite injects a **test-only** `document.modelContext` before application code, then exercises actual production definitions through registration, `getTools()`, `toolchange`, AbortController unregistration, execution cancellation, and dynamic phase changes. The mock is absent from `dist/` and is explicitly labeled in the developer lab.

The available system browser was Chromium 144.0.0.0 and reported:

```json
{
  "hasModelContext": false,
  "registerType": "undefined"
}
```

Therefore, no external native Site-tools/agent run is claimed. That final recording requires a currently compatible browser/account rollout.

## Browser and UI verification

The E2E suite exercised:

- the full shock → branch → human intent → stale → re-simulate → stage → approve → apply → verify → explain → rollback sequence;
- `apply_plan` absent before UI approval and registered after approval;
- shared-state invalidation and immediate capability revocation;
- 1024×768, 1440×900, and 1920×1080 viewport containment;
- keyboard dismissal, reduced-motion behavior, untrusted-alert escaping, and absence of page/console errors.

Seven 1600×900 captures were inspected after the final build. Review confirmed a legible shock cascade, spatially distinct futures, clear gold human intent and stale treatment, an explicit approval boundary, a strong verification state, readable Causal Proof, and visible rollback restoration.

## Header verification

The production server returned:

```text
Origin-Agent-Cluster: ?1
Permissions-Policy: tools=(self)
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
```

Equivalent Vercel, Netlify, and `_headers` configurations are included.

## Publication status

No Vercel, Netlify, GitHub CLI/token, YouTube, or Google upload credentials were present. The connected GitHub integration exposed existing-repository operations but no repository-creation action, and no accessible repository named `branchline` existed. No live application, public repository, or video URL is claimed.
