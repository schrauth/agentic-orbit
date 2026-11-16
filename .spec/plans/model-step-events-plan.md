# Model Steps Through the Events File — Implementation Plan

How the proxy's telemetry stops being a private side channel of whichever host owns the
proxy, and becomes what it always should have been: one more line in the shared events
file, applied by every consumer through the shared translation. This fixes the parity
defect — the standalone map shows no model pulses and never the model's name, while the
extension map shows both. This plan is written against branch `standalone-browser-map`
(23 commits ahead of main, working tree clean); line numbers cite that state, and where
earlier tasks shift lines, re-locate the cited symbol instead of the number.

## Executive summary & what the ground already covers

The two maps are already in sync for everything except model steps, because everything
else flows through one file and one translation, and model steps do not:

- **The one stream that works.** The hook appends compact lines to a file in `os.tmpdir()`
  ([agentic-orbit-hook.js](../../vscode-extension/res/agentic-orbit-hook.js), line 132:
  `fs.appendFileSync(outputPath(), JSON.stringify(line) + '\n', { mode: 0o600 })`).
  Both hosts tail it with the same VS Code-free `watchEvents`
  ([hookWatcher.ts](../../vscode-extension/src/hookWatcher.ts), 40ms debounce;
  `parseEvents` drops torn lines) and apply every line with the same shared
  `applyHookEvent` ([eventApplier.ts](../../vscode-extension/src/eventApplier.ts)).
- **The private channel that does not.** The proxy measures `{model, promptTokens}` per
  request ([proxy.ts](../../vscode-extension/src/proxy.ts), `onTelemetry` at line 136)
  and hands it to a callback. The extension host applies it directly to its own board
  ([extension.ts](../../vscode-extension/src/extension.ts), `onProxyTelemetry` at line
  43) — never to the file. The standalone host does the same, twice over
  ([server.ts](../../standalone/server.ts): the local `onTelemetry` at ~48 and the
  returned `Host.telemetry` at ~79 — the same block duplicated), and its callback is
  wired only to its own `--proxy` ([cli.ts](../../standalone/cli.ts), line 137). A
  model's base URL points at one proxy only, so when the extension's proxy is active the
  standalone never sees telemetry at all. The demo has a third copy of the same
  builder ([demo/engine.ts](../../demo/engine.ts), `telemetry` at line 61).
- **What that leaves broken.** `board.model` is set only by the `modelStep` transition
  ([board.ts](../../vscode-extension/src/board.ts), lines 148–151); `sessionStart` reads
  `e.model` only into `lastModel` for switch marks. So the standalone's
  `board.model === undefined` and the status line omits the model
  ([feed.ts](../../hooks/feed.ts), `nowParts`: `board.model === undefined … ? ''`).
- **Almost everything needed is already built.** The `modelStep` `BoardTransition` and
  the board's handling of it exist and stay unchanged. The hook script already writes a
  `promptTokens` field when a host hands it one (line 66 of the hook); only the
  `HookEvent` type lacks the field. `watchEvents` already tolerates racing reads.

The change: a new tiny VS-Code-free writer appends a `{event: 'modelStep', model,
promptTokens}` line; `applyHookEvent` gains the `modelStep` case (and `sessionStart` sets
`board.model`); the extension host, the standalone host and the demo each shrink to
"append the line" (or, in the demo's case, "feed the same event shape") — the three
duplicated builders disappear, and every consumer, present and future, gets model steps
from the file it already tails.

Estimated scope: 8 small tasks across 3 phases; every task lands on its own, commits on
its own, and is verified on its own.

## Design decisions this plan builds on

1. **Persist the telemetry as an event (ADR-007).** The events file is the single source
   of truth for the map; a second telemetry channel (an extra socket, an SSE side
   frame, a shared in-process bus) was rejected because it would add a transport, still
   require both hosts to listen twice, fix nothing for replay (the demo, future
   recorders), and leave the events file an incomplete record of the session. The
   events-file approach deletes code instead of adding a channel.
2. **The line's exact shape.** `{ v: 1, event: 'modelStep', ts: Date.now(), model,
   promptTokens }` — the same compact style the hook writes (`HookEvent` in
   [types/index.d.ts](../../types/index.d.ts); only the `promptTokens` field is new).
   `model` is the name the request carried, `promptTokens` the figure the proxy measured.
   No session, call or agent ids: the proxy cannot know them.
3. **Hosts append, the shared translation applies.** `proxy.ts` is untouched — it keeps
   its `onTelemetry` callback, and the request/answer stream it forwards stays byte-for-
   byte unchanged. What changes is what a host does with the callback: append the line,
   let its own watcher apply it ~40ms later. The ~40ms debounce is accepted: it is the
   same latency every hook event already has, model requests are seconds apart, and the
   webview redraws on its own 1s beat anyway.
4. **`sessionStart` also names the model.** When the hook's `sessionStart` line carries
   `e.model`, the applier now sets `board.model` from it (in addition to the existing
   switch-mark logic), so the map names the model before the first proxy request — the
   standalone's status line becomes correct even with no proxy running at all.
5. **The step counter keeps its semantics — and gains parity.** `board.step` stays
   "how many model requests this session showed", still reset by `sessionStart`'s
   `reset`. It is now counted in the one shared applier instead of in three private
   copies, so both hosts derive it from the same stream. Previously each host counted
   only its own proxy's requests; now each counts every proxy's — same stream, same
   number, by construction.
6. **Privacy stays inside the recorded rules.** The line carries a name and a figure —
   exactly what the map already displays (ADR-002: names and figures, never content) —
   into the same machine-local, `0600` temporary file the hook already writes model
   names into (`sessionStart` carries `model`). One sentence in
   [PRIVACY.md](../../PRIVACY.md) becomes false and is corrected: the proxy section says
   "It writes nothing"; it now appends this one figures-only line.
7. **The limit rides on `Setup`.** The `modelStep` transition needs the context-window
   limit; the applier already receives the `Setup`, so the limit becomes a `Setup` field
   (`setupFrom` default `128000`, the value all three hosts already default to) rather
   than a fifth parameter to `applyHookEvent`. `Setup` is "what the person set" — the
   limit is a setting.

---

## Phase 1 — The contract and the shared translation

### - [x] Task 1.1: `HookEvent` carries `promptTokens`

- **Problem:** The proxy's measured token count has no field on the shared wire type, so
  no event line can carry it and no reader can type-check it.
- **Affected files:** [types/index.d.ts](../../types/index.d.ts)
- **Target state:** In `HookEvent`, after `url?: string`, add:

  ```ts
  /** What one model request carried, in prompt tokens — the figure the loopback proxy measured. */
  promptTokens?: number
  ```

  Update the type's leading comment to say the lines are written by the workspace hook
  *and, for `modelStep` lines, by the loopback proxy's telemetry. No other change: `event`
  stays a free string (unknown events are dropped by the reader), so no event-name union
  is introduced and the hook script needs nothing new.
- **Verification:** `cd vscode-extension && npm run compile` (the `HookEvent` re-export in
  `hookWatcher.ts` and every consumer must still type-check); `grep -n "promptTokens"
  types/index.d.ts` shows the field.

### - [x] Task 1.2: `Setup` carries the context-window limit

- **Problem:** The `modelStep` transition needs the context-window limit, but `Setup` —
  the one object the applier receives — does not carry it; the three hosts read it from
  three private places (extension: `getConfiguration` in `onProxyTelemetry`; standalone:
  `options.setup.contextWindowLimit` with a local fallback; demo: the `CONTEXT_LIMIT`
  const).
- **Affected files:** [hooks/setup.ts](../../hooks/setup.ts),
  [vscode-extension/src/config.ts](../../vscode-extension/src/config.ts),
  [demo/engine.ts](../../demo/engine.ts) (`demoSetup` only)
- **Target state:**
  - `Setup` gains a field (place it after `pace`):

    ```ts
    /** How many prompt tokens the context window holds; the ring around the centre is drawn against it. */
    contextWindowLimit: number
    ```

  - `setupFrom` fills it:
    `contextWindowLimit: typeof options.contextWindowLimit === 'number' && options.contextWindowLimit > 0 ? options.contextWindowLimit : 128000`
  - [config.ts](../../vscode-extension/src/config.ts) adds the key so the extension's
    settings flow in: `contextWindowLimit: c.get('contextWindowLimit', 128000)`.
  - `demoSetup` passes `contextWindowLimit: CONTEXT_LIMIT` (the existing const,
    `128000`); the standalone already passes its whole raw setup through `setupFrom`, so
    it needs nothing here.
- **Verification:** `cd vscode-extension && npm test` (compiles and runs all extension
  tests); `cd demo && npm run typecheck`. The existing
  `setupFrom()`-default test surface is untouched — the new field has a default.

### - [x] Task 1.3: `applyHookEvent` translates `modelStep`; `sessionStart` names the model

- **Problem:** The event → board translation does not know `modelStep`, so every host
  builds the transition itself — the three duplicated blocks this plan removes. And
  `board.model` is never set from `sessionStart`, so the model's name is missing until
  the first proxy request.
- **Affected files:** [vscode-extension/src/eventApplier.ts](../../vscode-extension/src/eventApplier.ts),
  [vscode-extension/test/quality.test.cjs](../../vscode-extension/test/quality.test.cjs)
- **Target state:**
  - In `applyHookEvent`, inside the existing `case 'sessionStart'` block, within the
    `if (e.model !== undefined)` branch, add the board patch before the switch-mark
    logic (the switch-mark semantics stay byte-identical):

    ```ts
    s.board = { ...s.board, model: e.model }
    ```

  - Add a new case before `default` (mirroring exactly what the three host blocks build
    today, so board behavior is unchanged):

    ```ts
    case 'modelStep': {
      const step = (s.board.step ?? 0) + 1
      s.board = transitionBoard(
        s.board,
        {
          type: 'modelStep',
          model: e.model ?? '',
          step,
          label: `${shortModel(e.model ?? '') || e.model || 'model'} · ${setup.t.step(step)}`,
          promptTokens: e.promptTokens ?? 0,
          limit: setup.contextWindowLimit,
        },
        now,
      ).board
      break
    }
    ```

  - `board.ts`'s existing `modelStep` transition is **not** touched.
  - In `quality.test.cjs`, extend the transition test with an applier-level assertion
    (the file already requires `applyHookEvent`/`emptyState` in
    `paths.test.cjs`; add it there or in `quality.test.cjs`, following the file that
    already imports the applier): apply
    `{ event: 'sessionStart', model: 'gpt-5.2' }` and assert `state.board.model === 'gpt-5.2'`;
    then apply `{ event: 'modelStep', model: 'gpt-5.2', promptTokens: 12800 }` with a
    setup whose limit is `128000` and assert `board.step === 1`,
    `Math.round(board.context) === 10`, and a finished `model`-station entry exists.
- **Verification:** `cd vscode-extension && npm test` — the new assertions fail if the
  case or the patch were reverted, and the whole suite stays green.

---

## Phase 2 — One stream for every consumer

### - [x] Task 2.1: The event writer

- **Problem:** Nothing appends events from the host side; the hook script's
  `appendFileSync` lives inside `.github/hooks/` (change-protected) and inside the
  shipped resource copy, which must not be touched for this.
- **Affected files:** [vscode-extension/src/eventWriter.ts](../../vscode-extension/src/eventWriter.ts) (new),
  [vscode-extension/test/paths.test.cjs](../../vscode-extension/test/paths.test.cjs)
- **Target state:** A new, VS-Code-free module (`fs` only, no `vscode` import — ADR-003):

  ```ts
  // Appends what the map's own instruments measure to the hook's events file: the proxy's
  // model steps, in the same compact line format the workspace hook writes. Never throws
  // and never waits — a failed append degrades to a still map, never a broken answer.
  import * as fs from 'fs'
  import type { HookEvent } from '../../types'

  /** One model request the loopback proxy measured: its model's name, and how many prompt tokens it carried. */
  export function modelStepEvent(tel: { model: string; promptTokens: number }): HookEvent {
    return { v: 1, event: 'modelStep', ts: Date.now(), model: tel.model, promptTokens: tel.promptTokens }
  }

  /** Appends one event line without waiting and without ever throwing: the map's fail-safe rule (ADR-001). */
  export function appendEvent(file: string, e: HookEvent): void {
    fs.appendFile(file, `${JSON.stringify(e)}\n`, { mode: 0o600 }, () => undefined)
  }
  ```

  Notes for the implementer: `fs.appendFile` opens with `O_APPEND`, so the line lands as
  one `write` — the same single-write guarantee the hook's `appendFileSync` gives; a torn
  line read by a racing watcher is already dropped by `parseEvents`. The error callback
  swallows: telemetry must never disturb the host.
- **Verification:** Add a test to `paths.test.cjs` (it already tests the watcher/parser
  pair): `appendEvent(tmpFile, modelStepEvent({ model: 'm', promptTokens: 5 }))`, wait
  ~100ms, read the file, `JSON.parse` the line back and assert the round-trip; also
  assert that `appendEvent` into a non-existent directory does not throw. `cd
  vscode-extension && npm test`.

### - [x] Task 2.2: The extension host appends, its watcher applies

- **Problem:** `onProxyTelemetry` in [extension.ts](../../vscode-extension/src/extension.ts)
  (line 43) builds and applies the transition itself — the map's one private path — and
  reads the limit from configuration a second time.
- **Affected files:** [vscode-extension/src/extension.ts](../../vscode-extension/src/extension.ts)
- **Target state:**
  - Hoist the watched file to module scope: `let eventsFile: string | undefined`,
    assigned in `startHookWatcher` where the local `file` is computed today.
  - Replace the body of `onProxyTelemetry` with the append:

    ```ts
    /** What the proxy measured: one more line in the shared events file — the watcher applies it like any other event. */
    function onProxyTelemetry(tel: { model: string; promptTokens: number }): void {
      if (eventsFile !== undefined) appendEvent(eventsFile, modelStepEvent(tel))
    }
    ```

  - Delete the now-unused `transitionBoard` and `shortModel` imports and the `t` helper
    if nothing else uses it (check before removing). `startProxyCommand` keeps its
    callback signature; nothing else in the file changes.
- **Verification:** `cd vscode-extension && npm test`. Manual smoke (optional, needs a
  model pointed at the proxy): with the proxy running and the map open, a request makes
  the model pulse appear within the same beat as the tool pulses, and
  `~/.config`-free inspection of the events file shows the `modelStep` line.

### - [x] Task 2.3: The standalone host appends, its watcher applies

- **Problem:** [server.ts](../../standalone/server.ts) duplicates the model-step builder
  twice (the local `onTelemetry` at ~48 and the returned `Host.telemetry` at ~79), and
  applies telemetry privately, so the standalone map misses every model step the
  extension's proxy measures.
- **Affected files:** [standalone/server.ts](../../standalone/server.ts),
  [standalone/test/server.test.cjs](../../standalone/test/server.test.cjs)
- **Target state:**
  - Delete the local `onTelemetry` block; the `transitionBoard` and `shortModel` imports
    go with it.
  - The `Host.telemetry` method becomes the append (the `Host` interface keeps the
    method — [cli.ts](../../standalone/cli.ts) keeps wiring it to `startProxy`
    unchanged; update only its doc comment: *"The proxy's measurement, appended to the
    events file as a `modelStep` line; the core's watcher applies it like any other event."*):

    ```ts
    telemetry: tel => {
      appendEvent(options.eventsFile, modelStepEvent(tel))
    },
    ```

  - `serveCore`'s board now changes only through the watcher; the standalone test that
    calls `core.telemetry(...)` and reads the next board synchronously must wait for the
    round-trip instead: poll the collected boards (the test already collects them) with
    a ~2s timeout until a board with `step === stepBefore + 1` and `context > 0`
    arrives, then assert on it. Keep the assertion strength identical.
- **Verification:** `cd standalone && npm test` (builds, typechecks, runs the host suite);
  the updated test fails if telemetry were applied privately again (a private apply
  publishes immediately — the test then still passes, so additionally assert the line is
  in the file: after the stepped board arrives, read the events file and assert it
  contains `"event":"modelStep"`).

### - [x] Task 2.4: The demo replays the real shape

- **Problem:** The demo's `FakeSession.telemetry`
  ([demo/engine.ts](../../demo/engine.ts), line 61) is a third copy of the model-step
  builder, so the demo's scenario replay diverges from what hosts really do once hosts
  go through the event.
- **Affected files:** [demo/engine.ts](../../demo/engine.ts),
  [demo/main.ts](../../demo/main.ts) (only if the call site simplifies)
- **Target state:**
  - `FakeEvent` gains `promptTokens?: number` (after `url?`).
  - `FakeSession.telemetry` becomes a thin delegate so `main.ts`'s call site stays as is:

    ```ts
    /** What the loopback proxy would have measured: the same `modelStep` line a host appends, replayed. */
    telemetry(model: string, promptTokens: number, at: number, setup: Setup): void {
      this.apply({ event: 'modelStep', model, promptTokens }, at, setup)
    }
    ```

  - Delete the private `transitionBoard`/`shortModel`-using body (remove those imports
    only if nothing else in `engine.ts` uses them); the `CONTEXT_LIMIT` const stays (it
    now feeds `demoSetup`'s `contextWindowLimit` from Task 1.2).
- **Verification:** `cd demo && npm run typecheck && npm run build`; open the demo page
  and confirm the scenarios still show model pulses and the context ring (the "context"
  scenario is the quick check).

---

## Phase 3 — The written record

### - [ ] Task 3.1: PRIVACY.md and CHANGELOG.md tell the new truth

- **Problem:** [PRIVACY.md](../../PRIVACY.md) says of the proxy "It writes nothing"
  (line 28) — after this change it appends one figures-only line to the machine-local
  events file. The project's rule is that the privacy record names everything that is
  written, and where.
- **Affected files:** [PRIVACY.md](../../PRIVACY.md), [CHANGELOG.md](../../CHANGELOG.md)
- **Target state:** In PRIVACY.md's proxy section, correct the sentence to state: the
  proxy appends one compact line per model request — the model's name and the prompt
  token count, the same figures the map shows — to the same machine-local temporary
  file the workspace hook writes; it still writes nothing anywhere else, keeps nothing
  between requests, and still reads no text of the stream into memory beyond the token
  figures it extracts. Check the "kept nowhere" sentence about the model's name (line
  23) for consistency and adjust it to the events-file reality if it now overstates.
  Add the fix under the standalone/map parity entry in [CHANGELOG.md](../../CHANGELOG.md)
  following the file's existing entry style.
- **Verification:** Read both changed passages against ADR-002 (names and figures
  only) and ADR-007 — every claim in PRIVACY.md must be true of the code as it now is.

---

## Guard-rails for the implementer

- **`proxy.ts` is frozen for this change.** Its callback contract, forwarding, and
  "reads only figures" story stay exactly as they are; the append happens in the hosts'
  callbacks, never inside the proxy. `board.ts` and the `BoardTransition` shape are
  equally frozen — only *who builds* the `modelStep` transition moves, into the applier.
- **`eventApplier.ts` and `eventWriter.ts` stay VS Code-free** (ADR-003): `fs` and the
  shared modules only — never `vscode`, never the host's panel or configuration.
- **Do not touch the hook.** `.github/hooks/agentic-orbit-hook.js`,
  `vscode-extension/res/agentic-orbit-hook.js` (verified identical), and
  `hookManifest.ts` stay as they are: `modelStep` is *not* a hook event, so it must not
  appear in the manifest (the quality test pins every event listed exactly once).
  `.github/agents/` is change-protected and needs nothing here.
- **Fail-safe everywhere:** `appendEvent` never throws and never blocks the answer
  path; a missing or unwritable events file costs a still map, nothing more
  (ADR-001's spirit, extended to the proxy side).
- **No behavior change in the board**: the label text, the step counting, the context
  math, and the switch-mark logic are reproduced verbatim in the applier — the
  verification of Tasks 1.3 and 2.3 exists to catch any drift.
- **Commits**: one atomic commit per task, task checkbox ticked only after that task's
  verification passed. Deviations come back to the Architect, never silently into code.
