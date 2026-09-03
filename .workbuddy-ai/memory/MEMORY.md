# BRANCHLINE project notes

## Design system (light editorial revamp, design/ux-revamp, 2026-08-29)

A previous dark treatment was rejected as "vibe-coded blueish slop". The
shipped design system on the branch tip is a **light editorial system**
inspired by clixfeed.in.

- `src/styles/tokens.css` — light color-scheme. Tinted warm-neutral
  paper/ink in OKLCH (no pure black/white, no gray). **Single brand
  accent = warm terracotta** (`--accent`, oklch 56% 0.15 42). Status
  semantics (healthy/warning/critical/agent/human/future) tuned for
  on-paper contrast. `--future` = terracotta (default/balanced lane),
  `--cyan` = calm teal (resilience lane only) — no bright cyan.
- `src/styles/global.css` — light editorial. Paper ground, ink type,
  hairline rules, refined components, no glow. The Causal Atlas is a
  paper-stage graph (white node fills, warm paper bg). Branchspace is
  a paper canvas with three ribbon-coloured futures. Primary buttons
  are ink (`--ink`); semantic actions use calm tinted fills.
- Typography: `index.html` loads **Fraunces** (display serif) and
  **Plus Jakarta Sans** (UI) from Google Fonts, with system fallback.
  `tokens.css` defines `--font-display` (Fraunces) and `--font-ui`.
  Fraunces is applied to wordmark-size / modal h2 / atlas h1 / tour h3.
- Every original CSS class selector is preserved (only values change),
  so functionality is untouched and `npm run typecheck` + `npm run test`
  (23/23) stay clean.
- **Do not reintroduce** dark backgrounds, cyan/blue accent as the
  primary, neon glows, or dense 7-9px micro-fonts. The brand accent is
  terracotta — keep it rare.

## WebMCP

- Native registration is in `src/webmcp/registry.ts` (WebMCPRegistry). It
  reconciles `desiredToolNames(state)` against the live native registry
  using `document.modelContext.registerTool` / `getTools`. Listens to
  `toolchange`. Falls back gracefully to local handlers when unsupported.
- Tool definitions + schemas: `src/webmcp/definitions.ts`, `schemas.ts`.
  Handlers: `handlers.ts` -> `invokeTool(name, input, signal)` -> calls
  `branchlineStore` commands and returns a compact `success/failure`
  envelope with `affected_ids` and `next_tools` for the agent.
- The human `?debug=1` opens the debug lab, which lets you exercise the
  same code path via local handlers (handy when a native WebMCP browser
  isn't available).

## Build

- Toolchain: Node 22+ (managed at
  `C:\Users\shaun\.workbuddy-ai\binaries\node\versions\22.22.2-1\node.exe`),
  TypeScript 5.8.3 from `vendor/typescript-5.8.3.tgz` (offline).
- Always build with safe-delete off: `CODEBUDDY_SAFE_DELETE_ENABLED=0
  npm run build`. The preview server (`python3 scripts/serve.py --root
  dist --port 4173`) holds `dist/` open, so kill it before rebuilding.
- `dist/` is git-ignored. Source-of-truth changes are in `src/`,
  `public/`, and the root `index.html`.

## Conventions

- Work on non-main branches for any visual/UX work to keep `main` clean.
  In this WorkBuddy sandbox, `git commit` writes the object but the branch
  ref is reverted between commands; write `.git/refs/heads/<branch>`
  directly to persist the branch (see user memory).
