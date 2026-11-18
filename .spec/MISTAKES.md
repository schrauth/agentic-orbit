# Mistakes Registry

Observed, reusable technical mistakes only — no invented, generic-process
or speculative rules. Before coding, consult only the entries for your
change area via the index below; do not read the full file by default.

## Entry format

```markdown
### M-NNN: One-line title

- **Area:** one or more from the index below
- **Symptom:** what went wrong, as observed
- **Cause:** the actual root cause
- **Rule:** the concrete preventive rule; reference the ADR or contract
  it supports, if any
```

Numbering: `M-001`, `M-002`, … in the order recorded. Never renumber,
merge or delete an entry without updating every reference to it.

## Change-area index

| Area | Covers | Entries |
| --- | --- | --- |
| `app/` | The host — `server`, `http`, `cli`, `proxy`, `eventApplier`, `board`, `classifyCopilot`, `hookWatcher`, `eventWriter`, `hookManifest` — and the page it serves, `main.ts` and `render.ts`, which ships as one classic script | M-001 |
| `app/res` | The installed hook and its manifest — `agentic-orbit-hook.js`, `hooks.json` — must stay fail-safe | — |
| `hooks/` | Pure library: classification, drawing, feed, wording (`text.ts`), the projection (`view.ts`) | — |
| `types` | Contracts in `types/index.d.ts`, and the hook event schema | — |
| `docs` | README, CONTRIBUTING, PRIVACY, SECURITY, CHANGELOG, `docs/` | — |
| `.spec/` | ADR, decision log, this register, plans, review | — |

### M-001: CommonJS `require` shipped into the webview's classic script

- **Area:** `app/`
- **Symptom:** The panel is completely blank; no console or test failure
  anywhere. Nothing renders, ever.
- **Cause:** Commit `35860be` split `webview/main.ts` into `main.ts` +
  `render.ts`, adding a runtime import. Under `"module": "commonjs"` the
  compiler emitted `require("./render")` into the classic
  `<script src="main.js">` the panel loads. `require` does not exist in a
  webview, so the script throws a `ReferenceError` on its first line —
  before the `message` listener registers — and the empty divs stay empty.
  Extension host, Node tests and the esbuild-bundled demo all worked,
  which is why it slipped through.
- **Rule:** The page's shipped script must be a single bundle containing
  no `require`/`import` (ADR-005). Type checks and Node-based tests never
  prove the page runs; treat the compiled `out/web/bundle.js` as the
  artifact to verify (guard test) and smoke-test the page after bundle
  build changes.
