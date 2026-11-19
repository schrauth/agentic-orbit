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

**Decision:** `hooks/` never imports from `app/` or any engine — it
imports `types/` and its own modules, and nothing else. `app/` may import
`hooks/`. The state module, [`app/board.ts`](../app/board.ts), imports
only `types/` and `hooks/`, never a host module (`server`, `http`, `cli`,
`proxy`, `hookWatcher`, `eventWriter`) and never the DOM. The page,
[`app/main.ts`](../app/main.ts), imports `hooks/` and `./render` and no
host module: it is handed a projection and draws it.

**Rationale:** The classification, drawing and wording logic must stay
testable and reusable outside the engine; the page must stay a renderer
that the workshop ([`demo/`](../demo/)) can share, with no way to reach
the host's state. Contracts live in [`types/index.d.ts`](../types/index.d.ts)
and the hook event schema, so cross-module changes go through the
Architect. The bundling half of this boundary is checked mechanically —
[`app/test/quality.test.cjs`](../app/test/quality.test.cjs) fails if the
page's bundle carries a `require`/`import` (M-001); the import direction
itself is a review rule with no automated check.

### ADR-004: The loopback proxy is the one network exception

**Status:** Accepted

**Decision:** The extension makes no network requests except the optional
loopback proxy, which listens on `127.0.0.1` only (default port `8317`,
disabled by default), forwards to `targetBaseUrl` unchanged and reads only
token usage from the stream.

**Rationale:** The context-window ring needs token counts the hooks cannot
provide. A strict loopback-only proxy keeps the no-network guarantee for
everything else.

### ADR-005: The webview ships as one bundled, module-free script

**Status:** Superseded by ADR-008 — its rule lives on in the app's served page bundle

**Decision:** The panel loads exactly one classic script,
`out/vscode-extension/src/webview/main.js`, built by bundling
`src/webview/main.ts` at compile time (the demo's esbuild pattern); the
shipped file must contain no `require` or `import`. Webview sources may
import shared modules such as `./render`, resolved by the bundler.

**Rationale:** The webview is a sandboxed browser page with no module
loader: `tsc`'s CommonJS output throws on its first line, the message
listener never registers and the panel stays blank (observed 2026-11-15
after the render split, see M-001). Bundling keeps `renderView` a shared
module for the demo while the extension ships a self-contained script.

### ADR-006: The standalone host mirrors the extension host

**Status:** Retired by ADR-008 — the mirrored extension no longer exists; the reuse rule it granted is now the app's own

**Decision:** A new top-level package `standalone/` shows the map outside
the VS Code extension, in a separate browser window, fed by the real hook
events. It reuses `hooks/`, `types/`, and the VS Code-free modules under
`vscode-extension/src/` (`hookWatcher`, `proxy`, `eventApplier`, `board`,
`classifyCopilot`, `webview/render`); it must not import any module that
imports `vscode`. The standalone host owns the board state, exactly as
the extension host does: one `ApplierState`, every hook event applied
through the shared `applyHookEvent`, proxy telemetry applied through
`transitionBoard`. The host publishes whole `Board` snapshots; the page
renders only and holds no event state — the same host/pane split the
webview keeps (ADR-005's spirit, in a plain browser). Transport is
Server-Sent Events over plain `http` on `127.0.0.1` only — no WebSocket,
no new runtime dependency; a reconnect receives the current snapshot and
is idempotent. `standalone/` ships nothing: like `demo/`, it is a
workshop package, never packaged into the `.vsix`, invisible to the
extension's build. Nothing in the shipped extension changes; its
VS Code-free modules merely gain a second consumer, and any change to
them must keep the extension's tests green.

**Rationale:** `hookWatcher`, `eventApplier` and `proxy` are already
VS Code-free; the demo already renders the real map in a browser. The
only missing piece is the seam between real events and a live page —
a second host, not a second engine.

**Consequences:** A third package to typecheck in CI; a second reader of
the events file (harmless: read-only tail); the page needs the server's
Setup once at connect, so the stream opens with a `setup` frame before
the first `board` frame.

---

### ADR-007: Proxy telemetry is an event like any other

**Status:** Accepted

**Decision:** What the loopback proxy measures — the model's name and a
request's prompt-token count — is appended to the shared, machine-local
events file as a `modelStep` line, and every consumer applies it through
the shared `applyHookEvent`. No host applies proxy telemetry directly;
hosts only append the line. `sessionStart` also sets `board.model` from
its `model` field, so the model's name shows before the first proxy
request.

**Rationale:** The events file is the one stream the map is drawn from;
telemetry was the only feed that bypassed it, which left the standalone
map without model pulses and the model's name. The new line carries names
and figures only (ADR-002), into the same temporary file the hook already
writes (ADR-001). Consequences: model steps inherit the watcher's ~40ms
debounce — the same latency every hook event already has — and the proxy
now appends this one figures-only line, where PRIVACY.md said it writes
nothing (corrected there); `proxy.ts` itself stays unchanged.

---

### ADR-008: The browser app is the product; the extension retires

**Status:** Accepted

**Decision:** The standalone host becomes the product package `app/`
(name `agentic-orbit`); the VS Code extension is retired and deleted
with its settings surface and `.vsix`. Its VS-Code-free core modules
(`hookWatcher`, `eventApplier`, `eventWriter`, `proxy`, `board`,
`classifyCopilot`, `hookManifest`, `render`) and the hook script move
into the app, contents unchanged. The wire contract — the `v: 1` JSONL
event lines, the `Board` type, telemetry-as-event — is frozen. The demo
stays a workshop package; the producer side stays Copilot's hook
manifest.

**Rationale:** The app already runs the full pipeline outside VS Code,
and the core was VS Code-free by design (ADR-006's list); dropping the
extension is subtraction plus a move, not a rebuild. Multi-host event
adapters remain a separate future effort; the JSONL contract stays so
one can be added without a v2.

### ADR-009: One board per session; views are projections; retention, not lifecycle

**Status:** Accepted

**Decision:** The host keeps one `ApplierState` per hook session id
(events without one share an implicit bucket); the merged workspace
view is derived from those states by a pure projection, and the focused
view shows one session's board — never a second apply path. The page
switches the host-wide view at runtime; no session end is ever claimed:
sessions are ranked by recency and evicted by a retention window, and
proxy-measured context that cannot be attributed to exactly one open
turn is drawn as shared, never guessed.

**Rationale:** Every concurrent-session defect of the one-board design
(cross-session resets, sweeps, parked-name collisions, one shared
context) comes from shared mutable state, not from the view; demuxing
fixes them by construction, and two projections over the same states
stay consistent by definition. Sessions have no end event, so the UI
must not claim one — recency ranking is the honest shape, bounded by
host restart as today. Plan: `.spec/plans/multi-session-boards-plan.md`.

### ADR-010: Guards block deliberately, opt-in only

**Status:** Superseded by ADR-011

**Decision:** Two opt-in workspace guards — the agent-definitions guard and the Git-monopoly guard — deny a tool call when an explicit project rule matches. They are installed only with `--install-hooks <dir> --guard`, answer allow in doubt, catch their own faults, always exit `0` within milliseconds, and report a denial as one names-only `errorOccurred` line with `status: 'blocked'`. The observer hook keeps ADR-001's unconditional fail-safe.

**Rationale:** The guards enforce rules the repository already documents (D-004's change protection and the Version Control Agent's Git monopoly). Copilot counts a crashed command hook as a denial — the inverse of the observer's fail-safe — so the guard fails open on anything but an explicit rule match. A timeout falls through to the normal permission flow; only a rule match denies. The Hooks station lights from a real event, so D-002 stays true.

### ADR-011: Guards are project-owned; the app only draws the refusal

**Status:** Accepted

**Decision:** The repository ships no guard engine and no guard rules. It keeps only the visualization contract: an `errorOccurred` line with `status: 'blocked'` closes the open call at the Hooks station (or lands there alone), fault-counted and alarm-drawn. Policy hooks belong to the project and are installed there; this repository's own guards stay local and untracked under `.github/hooks/`.

**Rationale:** The two guards encoded this repository's rules, not the product's. Shipping them invited foreign projects to install rules they do not need and put project-specific policy in the app's source. The visualization is the reusable part; a project can write its own `preToolUse` guard and report a denial through the same names-only line.
