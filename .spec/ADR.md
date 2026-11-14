# Architecture Decision Records

A concise register of current, durable decisions. Merge, revise or remove
entries when that improves accuracy — Git keeps the edit history. Skip
routine implementation choices.

## Entry format

```markdown
### ADR-NNN: Title

**Status:** Accepted | Superseded by ADR-NNN | Reversed

**Decision:** One or two sentences — what we do, not how.

**Rationale:** Why, briefly. Include an alternative or consequence only
when it clarifies a real trade-off.
```

---

### ADR-001: The workspace hook is fail-safe

**Status:** Accepted

**Decision:** The installed hook always exits `0` within milliseconds and
answers `preToolUse` with a valid allow JSON, even when the extension is
not running.

**Rationale:** Observation must never block the agent. The hook is
decoupled from the extension: it only appends compact metadata lines to a
file in the OS temp folder, so any hook failure degrades to a still map,
never a blocked call.

### ADR-002: Labels carry names, never content

**Status:** Accepted

**Decision:** Every label on the map and in the feed holds a name only:
files keep the last two path parts, addresses keep the host alone, shell
commands keep the model's description or the command's name, searches and
memory calls keep the tool's name. Control characters are stripped. No
command lines, patterns, queries or written text are ever shown.

**Rationale:** The extension is handed full call inputs; showing any part
of that content would make the map a privacy hazard. Names are enough to
answer "where did the work go".

### ADR-003: hooks/ is a pure library with strict module boundaries

**Status:** Accepted

**Decision:** `hooks/` never imports from `vscode-extension/`, `vscode` or
any engine; `vscode-extension/src/board.ts` stays free of VS Code imports;
the webview (`vscode-extension/src/webview/`) imports nothing from the
extension host and communicates only through messages.

**Rationale:** The classification, drawing and wording logic must stay
testable and reusable outside the engine; the webview must stay sandbox-
safe. Contracts live in `types/index.d.ts` and the hook event schema, so
cross-module changes go through the Architect.

### ADR-004: The loopback proxy is the one network exception

**Status:** Accepted

**Decision:** The extension makes no network requests except the optional
loopback proxy, which listens on `127.0.0.1` only (default port `8317`,
disabled by default), forwards to `targetBaseUrl` unchanged and reads only
token usage from the stream.

**Rationale:** The context-window ring needs token counts the hooks cannot
provide. A strict loopback-only proxy keeps the no-network guarantee for
everything else.
