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
| `hooks/` | Pure library: classification, drawing, feed, wording (`text.ts`) | — |
| `vscode-extension/src/` | Extension host: `board.ts`, `classifyCopilot.ts`, `hookWatcher.ts`, `panel.ts`, proxy | — |
| `webview` | `vscode-extension/src/webview/` — message-only, no extension-host imports | — |
| `hook script` | Installed workspace hook (`vscode-extension/res/agentic-orbit-hook.js`, `hooks.json`) — must stay fail-safe | — |
| `types & settings` | `types/index.d.ts`, hook event schema, `vscode-extension/package.json` settings surface | — |
| `docs` | README, CONTRIBUTING, PRIVACY, CHANGELOG, `.spec/` | — |

*(No entries yet — this file starts empty by design.)*
