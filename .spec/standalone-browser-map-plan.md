# Standalone Browser Map — Implementation Plan

How to show the map outside the VS Code extension, in a separate browser window, fed by the real
hook events. This plan is written against the repository state after the 0.3.0 cleanup sweep
(HEAD `08e6444`); line numbers cite that state, and where earlier tasks shift lines, re-locate the
cited symbol instead of the number.

## Executive summary & what the ground already covers

The heavy pieces of this feature already exist and are already VS Code-free:

- **The event source.** [hookWatcher.ts](../vscode-extension/src/hookWatcher.ts) needs no `vscode`
  import: `eventsFileFor` (line 11) turns a workspace path into the hook's `$TMPDIR` events file,
  `parseEvents` (line 17) turns appended bytes into `HookEvent`s, `watchEvents` (line 38) tails the
  file live and never throws. A Node process outside VS Code can use it unchanged.
- **The event → board translation.** [eventApplier.ts](../vscode-extension/src/eventApplier.ts)
  (`emptyState` line 21, `applyHookEvent` line 40) is the shared, VS Code-free translation the
  extension host and the demo already share.
- **The context window.** [proxy.ts](../vscode-extension/src/proxy.ts) imports only `http`/`https`;
  `startProxy` (line 52) hands back `{ model, promptTokens }` per request. A standalone process can
  run it as-is.
- **The drawing.** The demo page already renders the real map in a plain browser page
  ([demo/main.ts](../demo/main.ts), `renderView` from
  [render.ts](../vscode-extension/src/webview/render.ts)) — but from **fake** events on a **fake
  clock** ([demo/engine.ts](../demo/engine.ts)).

What is missing is the seam between the two: a small Node host process that reads the **real**
events file and serves the page, and a page mode that renders a **live** board instead of a
scenario. No contract in [types/index.d.ts](../types/index.d.ts) has to change: `HookEvent`,
`Board`, `Setup` already describe everything that crosses the new boundary.

**The shape of the answer:** a new top-level package `standalone/` — a Node host that mirrors what
[extension.ts](../vscode-extension/src/extension.ts) does (own the `ApplierState`, apply events,
apply proxy telemetry, publish the board), plus a page that mirrors [demo/main.ts](../demo/main.ts)
(own nothing but the drawing, on the panel's one-second beat). Between them, one plain
**Server-Sent-Events** stream that pushes whole `Board` snapshots — no new runtime dependency, the
same no-dependency style the proxy keeps (`ws` is not needed; the page never talks back anything
the server must persist).

Estimated scope: ~6 focused tasks, none of them touching shipped extension code except reading
shared modules; every task lands on its own and is verified on its own.

## Design decisions this plan builds on

1. **The server owns the board.** Exactly as [extension.ts](../vscode-extension/src/extension.ts)
   owns the state in a VS Code session (lines 26–41), the standalone host holds one
   `ApplierState`, applies every event and telemetry item, and publishes whole `Board` snapshots.
   The page stays a renderer — the same split the webview keeps (ADR-005's spirit, in a browser).
2. **SSE, not WebSocket.** The stream is one-directional: board snapshots, board snapshots, board
   snapshots. `EventSource` reconnects on its own, and a reconnect simply receives the current
   snapshot — idempotent by construction, no replay protocol needed.
3. **Loopback only.** The host binds `127.0.0.1`, serves the page and the stream to the same
   machine, reads the same names-only JSONL the extension reads, and writes nothing anywhere.
   The privacy surface of [PRIVACY.md](../PRIVACY.md) grows by nothing.
4. **`standalone/` ships nothing.** Like [demo/](../demo), it is a workshop package: private,
   never packaged into the `.vsix`, invisible to the extension's build.
5. **Hooks are a prerequisite, not a feature here.** The watched workspace needs
   `.github/hooks/` installed (the extension's command, or the new host's own flag — Task 2.3).
   Installing them is already solved by [hookManifest.ts](../vscode-extension/src/hookManifest.ts).

---

## Phase 1 — Groundwork: the package and the record of the decision

### - [ ] Task 1.1: Record ADR-006 — the standalone host mirrors the extension host

- **Problem:** The standalone browser window is a durable architecture addition: a second host for
  the same shared translation, with a server-owned board and an SSE publish channel. It deserves
  a recorded decision so the boundary is not later "simplified" into a page that classifies events
  itself, or a server that sends raw content.
- **Betroffene Dateien:** [ADR.md](ADR.md) (new entry); optionally one line in
  [DECISION_LOG.md](DECISION_LOG.md).
- **Zielzustand:** ADR-006 states: a `standalone/` package may reuse `hooks/`, `types/` and the
  VS Code-free modules under `vscode-extension/src/` (`hookWatcher`, `proxy`, `eventApplier`,
  `board`, `classifyCopilot`, `webview/render`); the host owns the `ApplierState` and publishes
  `Board` snapshots over SSE; the page renders only; the server binds loopback only; nothing in
  the shipped extension changes.
- **Verifikation:** The entry exists and names the reusable-module list; no other ADR contradicts
  it. (Through the Memory & ADR agent, per the project rule.)

### - [ ] Task 1.2: Scaffold the `standalone/` package

- **Problem:** There is no package yet, and its build must see the shared sources the same way the
  demo's does — via path includes, not copies.
- **Betroffene Dateien:** new `standalone/package.json`, new `standalone/tsconfig.json`, modeled on
  [demo/package.json](../demo/package.json) and [demo/tsconfig.json](../demo/tsconfig.json)
  (include `*.ts`, `../hooks`, `../types/index.d.ts`, and the VS Code-free
  `../vscode-extension/src/{board,classifyCopilot,eventApplier,hookWatcher,proxy,hookManifest}.ts`,
  `../vscode-extension/src/webview/render.ts`); new `standalone/.gitignore`
  (`node_modules/`, `bundle.js`, `out/`).
- **Zielzustand:** `cd standalone && npm install && npm run typecheck` passes against an empty
  `main.ts`. Scripts: `typecheck`, `build` (esbuild, like demo's), `start`
  (`node out/server.js`), `test` (added in Phase 4).
- **Verifikation:** `npm run typecheck` clean; `npm ls` shows only `esbuild` + `typescript` as
  devDependencies (no new runtime dependencies).

## Phase 2 — The host process

### - [ ] Task 2.1: The event→board core of the host

- **Problem:** Something outside VS Code must do what [extension.ts](../vscode-extension/src/extension.ts)
  does inside it: resolve the events file, tail it, apply each event, own the state.
- **Betroffene Dateien:** new `standalone/server.ts`; reuses
  [hookWatcher.ts](../vscode-extension/src/hookWatcher.ts) (`eventsFileFor`, `watchEvents`),
  [eventApplier.ts](../vscode-extension/src/eventApplier.ts) (`emptyState`, `applyHookEvent`),
  [setup.ts](../hooks/setup.ts) (`setupFrom`).
- **Zielzustand:** `serve(options)` with options `{ workspace?: string; eventsFile?: string; port:
  number; setup: Record<string, unknown> }`:
  - the file is `eventsFileFor(workspace, eventsFile)` — one code path with the extension;
  - on each event: `applyHookEvent(state, e, setupFrom(options.setup), Date.now())`, then
    `publish()` — exactly [extension.ts:36–41](../vscode-extension/src/extension.ts)'s shape;
  - `publish()` is a pure in-process callback (no HTTP yet — that is 2.2): the board snapshot
    handler gets registered by the caller. This keeps the core testable without sockets.
- **Verifikation:** A unit test (Phase 4) can drive `serve`'s core with a temp JSONL and see boards;
  until then, `npm run typecheck` and a manual run against a temp file prove the wiring.

### - [ ] Task 2.2: The HTTP face: the page, the stream, the loopback bind

- **Problem:** The browser needs a URL to load and a channel that pushes each new board without a
  polling protocol.
- **Betroffene Dateien:** extends `standalone/server.ts`; new `standalone/sse.ts` if the
  connection bookkeeping grows past ~60 lines.
- **Zielzustand:** A plain `http.createServer` on `127.0.0.1`:
  - `GET /` → serves `index.html` + the esbuild bundle + `main.css` (static, from `out/`);
  - `GET /events` → `Content-Type: text/event-stream`, sends `event: board` with the current
    `Board` JSON immediately on connect (the snapshot covers reconnects), then on every
    `publish()`;
  - a one-second interval that re-sends while any entry `status === 'run'` — the same heartbeat
    the panel keeps ([panel.ts:41–44](../vscode-extension/src/panel.ts)) so clock hands and fades
    advance without an event;
  - anything else → 404. The server writes no logs, keeps no request state, sends nothing off
    this machine.
- **Verifikation:** `curl -N http://127.0.0.1:<port>/events` shows one `event: board` frame per
  publish and per heartbeat; `GET /` returns the page; a non-loopback bind is not offered (no
  `--host` flag exists).

### - [ ] Task 2.3: The CLI door: flags, config file, proxy

- **Problem:** A person must be able to point the host at a workspace, tune the `Setup`, and get
  the context window too — without VS Code's settings surface.
- **Betroffene Dateien:** extends `standalone/server.ts`; reuses
  [proxy.ts](../vscode-extension/src/proxy.ts) (`startProxy`, line 52) and the telemetry shape of
  [extension.ts:43–59](../vscode-extension/src/extension.ts) (`modelStep` via `transitionBoard`,
  `shortModel`, `contextWindowLimit`).
- **Zielzustand:** `standalone/server.ts` parses:
  - `--workspace <path>` **or** `--events-file <path>` (exactly one; error message says so);
  - `--port <n>` (default `8318` — one past the proxy's);
  - `--config <file>`: a JSON file whose keys are `setupFrom`'s (`language`, `coreName`, `layout`,
    `motion`, `pace`, `theme`, `background`, `colors`, `memoryServers`, `memoryCommands`,
    `memorySubcommands`, `memoryPaths`, `memoryLabels`, `contextWindowLimit`) — the same raw shape
    [config.ts](../vscode-extension/src/config.ts) builds from VS Code's settings; unknown keys
    are ignored with a warning to stderr, never fatal;
  - `--install-hooks <dir>`: writes `.github/hooks/` into the given workspace using
    [hookManifest.ts](../vscode-extension/src/hookManifest.ts) data and the same copy step
    [installHooks.ts](../vscode-extension/src/installHooks.ts) performs — so a machine without the
    extension can still light the map;
  - `--proxy <targetBaseUrl>` and `--proxy-port <n>`: starts the shared proxy and feeds its
    telemetry into the same board the events drive.
  On startup the console prints one line — where the page is, which file is watched — and nothing
  else. `process.on('SIGINT')` closes watcher, proxy and server.
- **Verifikation:** `node out/server.js --workspace /some/path` starts, prints the URL, serves the
  page; `--install-hooks` produces the same two files the extension's command produces;
  `--config` with a typo key warns and continues; `--help` prints the flags.

## Phase 3 — The live page

### - [ ] Task 3.1: The page shell

- **Problem:** The demo's shell fits, but it must lose the scenario/clock workshop controls and
  gain a live-connection state.
- **Betroffene Dateien:** new `standalone/index.html`, `standalone/main.css`, modeled on
  [demo/index.html](../demo/index.html) and [demo/main.css](../demo/main.css).
- **Zielzustand:** The same map frame and the pane controls that make sense live: zoom buttons,
  fold/restore, and a connection word (`live` / `waiting`) — the scenario select, play/pause,
  reset, speed and clock span stay in the demo, not here. Title: "Agentic Orbit — live map".
- **Verifikation:** The page loads from the server with no console errors; the workshop controls do
  not appear.

### - [ ] Task 3.2: The live renderer

- **Problem:** Nothing yet turns the SSE boards into a drawing outside VS Code.
- **Betroffene Dateien:** new `standalone/main.ts`, modeled on [demo/main.ts](../demo/main.ts)
  (drawing loop, `REDRAW_MS = 1000`, zoom ladder via `ZOOMS`, `projectView`) but replacing
  `FakeSession` + scenarios with the SSE stream.
- **Zielzustand:**
  - `new EventSource('/events')`; `addEventListener('board', …)` stores the newest snapshot;
  - the drawing loop reads `Date.now()` as the clock — no fake base
    ([demo/main.ts:15](../demo/main.ts)'s `BASE` is the demo's);
  - each frame renders with `renderView(projectView(…))` exactly as the demo's frame does;
  - on `error` (the server gone): mark `waiting`, keep the last board on screen — the map freezes
    gracefully, and `EventSource`'s auto-reconnect needs no code;
  - on reconnect the immediate snapshot replaces the frozen board whole.
- **Verifikation:** With the host running and
  `AGENTIC_ORBIT_EVENTS_FILE=<the watched file> scripts/smoke-test.sh` firing, every station of
  the smoke script lights in the browser window; killing the host shows `waiting`, restarting it
  resumes the same board.

## Phase 4 — Absicherung, tests, documentation

### - [ ] Task 4.1: Host tests on the critical paths

- **Problem:** The extension's tests pin its paths; the new host's paths are unpinned.
- **Betroffene Dateien:** new `standalone/test/server.test.cjs` (against `out/` compile, like
  [paths.test.cjs](../vscode-extension/test/paths.test.cjs)); `standalone/package.json` gains
  `"test": "npm run build && node --test test/*.test.cjs"` (build only the server for tests).
- **Zielzustand:** Tests that would fail on a revert of each behaviour:
  - the events-file resolution: `eventsFileFor` hash path and override (may re-use the cases
    already pinned in [paths.test.cjs](../vscode-extension/test/paths.test.cjs) as a template);
  - tail-and-apply: write lines to a temp JSONL while the core runs → the published boards show
    start and end of a call, a parked subagent name claimed in launch order;
  - the SSE face: one `http.get` against a free port — first frame is the snapshot, later frames
    arrive per publish and per heartbeat while an entry runs;
  - the CLI: bad flags exit non-zero with a message; `--config` typo key warns and keeps serving.
- **Verifikation:** `cd standalone && npm test` green; each of the four groups proven by a
  spot-revert to red once during development (not committed).

### - [ ] Task 4.2: CI gate for the standalone package

- **Problem:** CI runs the extension's tests and the demo's typecheck; a third package drifting
  silently would reopen the hole Task 4.2 of the cleanup plan closed.
- **Betroffene Dateien:** [check.yml](../.github/workflows/check.yml).
- **Zielzustand:** A third job `standalone`: `npm ci && npm run typecheck` (tests stay local until
  the package proves stable on CI; the same two-gate rule the cleanup set, applied to the third
  package).
- **Verifikation:** The two existing jobs unchanged; YAML lints; the job's commands match
  CONTRIBUTING's list.

### - [ ] Task 4.3: Documentation brought along

- **Problem:** README, CONTRIBUTING, PRIVACY and SECURITY must say the new door exists — and that
  it opens nothing new.
- **Betroffene Dateien:** [README.md](../README.md) (a subsection under *Developing*, after the
  browser-demo paragraph: "The map in a plain browser window" — what it needs, the flags, one
  example line), [CONTRIBUTING.md](../CONTRIBUTING.md) (the standalone typecheck joins the gates
  list), [PRIVACY.md](../PRIVACY.md) (one sentence: the standalone host reads the same names-only
  file, binds loopback, writes nothing), [SECURITY.md](../SECURITY.md) (the loopback-only server
  joins the proxy in the first bullet), [CHANGELOG.md](../CHANGELOG.md) (Unreleased bullets per
  task, one for the feature as a whole).
- **Zielzustand:** A reader can go from the README to a live browser map without reading source;
  the privacy and security pages stay truthful without new caveats — because there are none:
  no new data is read, kept, or sent.
- **Verifikation:** The README example commands, run as written, work; the settings-table claim
  (18 settings) is checked against `package.json` once more if `--config`'s key list is shown.

---

## Guard-rails for the implementer

- **`hooks/` stays pure** (ADR-003): no import from `standalone/` into `hooks/`, and nothing in
  `hooks/` learns about a server.
- **The shipped extension changes not at all** — except that its VS Code-free modules gain a second
  consumer. If a change to `hookWatcher`, `proxy` or `eventApplier` seems needed, it must be
  justified on its own and keep the extension's tests green.
- **No new runtime dependency.** SSE is `http`; the server is `http`; the page is `EventSource`.
  A temptation toward `ws`, `express` or `chokidar` is a design smell here, not a shortcut.
- **Fail-safe both ways:** the host must survive a malformed events file forever (the watcher
  already does), and the page must survive a malformed frame (skip it, keep drawing).
- **Content never crosses the wire** — there is none to cross: the board carries names and
  figures only, and the events file is the same names-only JSONL. No new file is read, none is
  written, nothing leaves the machine.
- **Each task lands as its own atomic commit** with its verification in the message, a CHANGELOG
  bullet where it touches what a person sees, and Git work through the Version Control Agent.
