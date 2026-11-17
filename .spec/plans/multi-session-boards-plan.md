# Multi-Session Boards — Implementation Plan

How the map stops mixing every Copilot session in the workspace into one shared board,
and becomes one board per session with two runtime-switchable projections: a merged
workspace view and a focused single-session view with a session dock. Sessions get no
lifecycle claims — the dock ranks by recency and evicts by retention, and the one thing
the proxy cannot attribute is drawn as shared, not guessed. Written against the working
tree of 2026-11-17; tasks cite symbols, not line numbers, because earlier tasks shift
the lines of later ones.

## Executive summary & what the ground already covers

Today the whole pipeline assumes exactly one live session per workspace:

- **The one state.** [serveCore](../../app/server.ts) holds exactly one `ApplierState`
  and feeds every event line into it. [applyHookEvent](../../app/eventApplier.ts) has no
  session handling at all — the `session` field the hook writes
  ([agentic-orbit-hook.js](../../app/res/agentic-orbit-hook.js) writes
  `session: short(str(input.session_id) || str(input.sessionId))`, untruncated) is
  carried on every line and read by nothing (`e.session` has zero uses under `app/`).
- **What that corrupts.** A second session's `sessionStart` resets the board mid-turn of
  the first; its `agentStop` sweeps the first session's open calls through
  [sweepOpen](../../app/board.ts); its `userPromptSubmitted` clears the first session's
  parked names and faults; the shared `open` map is keyed by `callId` alone and is never
  cleared on reset.
- **Telemetry is unattributable.** [modelStepEvent](../../app/eventWriter.ts) writes no
  session id — the proxy cannot know it — and [withContext](../../app/board.ts) keeps
  one `Board.context`, so two sessions overwrite each other's context ring.
- **No session end exists.** [HOOK_EVENTS](../../app/hookManifest.ts) lists seven events;
  none says a session is gone. Host restart already wipes state
  ([watchEvents](../../app/hookWatcher.ts) starts at the file's end), so "forever" is
  bounded by host uptime in practice.
- **What is already built and reusable.** The shared translation
  ([eventApplier](../../app/eventApplier.ts)) and reducer
  ([board.ts](../../app/board.ts)) stay session-agnostic — demuxing happens *around*
  them. The crew hue cycle ([CREW_HUES](../../hooks/draw/crew.ts)) is the model for
  session colors. The page ([main.ts](../../app/main.ts)) already persists a choice in
  localStorage (log size) and already renders whole boards from SSE frames
  ([http.ts](../../app/http.ts): `setup`, then `board`, plus a 1s heartbeat while
  entries run). The demo feeds session-less events through the same applier, so it maps
  onto the implicit bucket unchanged.

The change: a host-free session registry keeps one `ApplierState` per session id; a
pure `mergeBoards` derives the workspace view; the HTTP face gains a host-wide view
choice and a dock-feeding `sessions` frame; the page gains the dock, the view toggle,
session hues in log and merged pulses, and honest "shared context" drawing. The events
file, the hook script and the hook manifest are untouched — no new observation of
content anywhere (the user has explicitly deferred any PRIVACY.md change).

Estimated scope: 11 tasks across 4 phases; every task lands, commits and verifies on
its own.

## Design decisions this plan builds on

1. **One `ApplierState` per session (ADR-009).** The registry keys states by the hook's
   `session` field. Events with no session id go to one implicit bucket, which keeps
   today's behavior for hosts that omit ids and keeps the demo untouched.
2. **The merged view is derived, not double-applied.** There is exactly one apply path
   per event; `mergeBoards` is a pure projection (entries interleaved by `startedAt`
   and capped, counts and faults summed, agent seats unioned). Cross-session resets,
   sweeps and parked-name collisions disappear by construction. With exactly one
   session, the merge returns that board unchanged, so the single-session map stays
   byte-identical to today.
3. **Resume continues the board.** `ApplierState` gains its `sessionId`; `sessionStart`
   resets only a state whose id differs (first sight), and continues one whose id
   matches (resume/compact). Today the map wrongly wipes the story on resume; per-session
   state fixes it for free.
4. **Views are host-wide projections, commanded by the page.** `POST /view {mode,
   focus}` sets merged or focus mode (a bare `GET /events` and host boot default to
   merged); `POST /dismiss` removes a session. The SSE stream gains one frame,
   `sessions`, carrying the summaries, the mode and the focus id; the `board` frame
   keeps carrying the one projected `Board`. The page persists its choice in
   localStorage and re-sends it on load. Two browser tabs share the host's view —
   one person, one machine; the last command wins.
5. **Focus is the page default, never auto-switching.** With more than one session the
   page shows the focused session plus the dock (the user chose view E); the drawer
   gains a view select; with one session both projections are identical and the dock
   and select hide. Focus picks the most recently active session at page load and then
   changes only when the person clicks a glyph.
6. **Names without touching privacy.** A session's identity is its hue
   (CREW_HUES cycled by a hash of the id — stable across restarts), its start clock,
   its model, and its *last activity* (the label of its newest entry — data the map
   already takes). The user deferred all privacy changes on 2026-11-17 (D-014): no
   typed session names ship, and nothing is kept on the page beyond today's choices.
   If names are ever wanted, the one PRIVACY.md sentence about page-kept storage comes
   first — never after.
7. **Retention, not lifecycle (ADR-009).** No glyph ever claims a session ended or is
   live; it claims "quiet since HH:MM". Constants in code: 30 minutes of quiet demote a
   glyph into the "+N older" chip, the dock keeps at most 8 sessions, eviction is
   quietest-first, and never touches a session with running entries or the focused
   one. The × dismisses host-side. Host restart wipes, as it already does.
8. **Honest attribution.** A `modelStep` is attributed only when exactly one session
   has an open turn (opened by `userPromptSubmitted` without agentId, closed by
   `agentStop` without one); otherwise it lands in the implicit bucket. When more than
   one session has a measured context, the merged ring draws dashed with no percentage
   and the meter says the shared word — the map marks what it cannot know.
9. **No new settings surface.** Retention constants and the dock capacity live in code;
   the config keys and their documented defaults are unchanged.

## Phase 1 — the contract and the per-session state

### Task 1.1 — entries carry their session; resume continues

**Problem:** `Entry` cannot say which session made it (log dots, merged tints), and
`sessionStart` resets the board even when the same session resumes.

**Affected files:** [types/index.d.ts](../../types/index.d.ts),
[eventApplier.ts](../../app/eventApplier.ts), [board.ts](../../app/board.ts)

**Target state:** `Entry` and `BoardEntryStart` gain optional `sessionId?: string`;
`applyHookEvent` stamps `e.session` onto every entry it starts and gains
`ApplierState.sessionId?: string`: a `sessionStart` whose `session` differs from (or is
absent on) the state resets as today, one that matches continues the board, clears
parked names (dead launches) and keeps the model-switch mark logic. `begin` passes
`sessionId` through. With session-less events nothing changes — the implicit path is
today's path.

**Verification**
- [ ] `cd app && npm run typecheck` passes
- [ ] `cd app && npm test` passes (existing suites unchanged)
- [ ] New cases in `test/sessions.test.cjs`: same-id `sessionStart` keeps entries,
  counts and seats; a differing id resets; a fresh state resets on first
  `sessionStart` (today's behavior)

### Task 1.2 — the session registry

**Problem:** Nothing owns "one state per session", open turns, or modelStep
attribution.

**Affected files:** new [sessions.ts](../../app/sessions.ts),
[eventApplier.ts](../../app/eventApplier.ts) (types only)

**Target state:** A host-free `SessionRegistry` (imports applier, board, types —
nothing of the host, per ADR-003): `Map<string, ApplierState>` plus the implicit `''`
bucket; `applyEvent(registry, e, setup, now)` routes by `e.session` and tracks per
session: `startedAt`, `lastEventAt`, `turnOpen` (set by a main-loop
`userPromptSubmitted`, cleared by an `agentStop` without `agentId`), and routes
`modelStep` to the single session with an open turn, else to the implicit bucket.
`summaries(registry, now)` returns `SessionSummary[]` (id, startedAt, lastEventAt,
lastActivity, model, context, running, turnOpen), newest lastEventAt first.

**Verification**
- [ ] `cd app && npm run typecheck` passes
- [ ] `test/sessions.test.cjs`: two interleaved scripts keep separate boards — no
  cross-reset, no cross-sweep, parked names stay per session; `modelStep` attributes
  to the one open turn, falls to the implicit bucket when two are open or none is;
  session-less events all land in the implicit bucket

### Task 1.3 — the merged board, derived

**Problem:** The workspace view must show every session honestly, without a second
apply path.

**Affected files:** [board.ts](../../app/board.ts),
[types/index.d.ts](../../types/index.d.ts)

**Target state:** Pure `mergeBoards(states: ApplierState[]): Board` — with one state,
the board itself; with several: entries interleaved by `startedAt` and capped at
`KEEP`, counts and faults summed per station, agent seats unioned by id,
`model` from the session with the newest `lastEventAt` that has one, `step` and
`switchedAt` undefined, `context` from the newest session with one and — when more
than one session has a context — `contextShared: true`. `Board` gains optional
`contextShared?: boolean`.

**Verification**
- [ ] `cd app && npm run typecheck` passes
- [ ] `test/sessions.test.cjs`: merged counts equal the sum; merged entries interleave
  by time and cap at 80; agents union; one session's context alone is not marked
  shared, two are; a single session's merge returns the identical board

## Phase 2 — the host serves projections

### Task 2.1 — serveCore on the registry

**Problem:** The host owns one board and cannot serve either projection.

**Affected files:** [server.ts](../../app/server.ts),
[sessions.ts](../../app/sessions.ts)

**Target state:** `serveCore` holds a registry, keeps a host-wide `view`
(`{mode: 'merged' | 'focus', sessionId?}`, default merged; focus falling back to
merged when its session is gone), and exposes `board()` as the projected board,
`sessions()`, `setView(view)`, `dismiss(id)` (registry drop, view fallback if the
focused one goes). Publishes the board *and* a `sessions` frame on every applied
event; the heartbeat ticks while the projected board has running entries. Proxy
telemetry appending stays as it is (ADR-007).

**Verification**
- [ ] `cd app && npm run typecheck` passes
- [ ] `test/server.test.cjs` additions: default view is merged; `setView` focus
  serves that session's board; dismissing the focused session falls back to merged;
  a session-less event stream behaves exactly as before (implicit bucket, merged
  view equals the old single board)

### Task 2.2 — the HTTP face: view, sessions, dismiss

**Problem:** The page can neither choose a view nor see the session list.

**Affected files:** [http.ts](../../app/http.ts)

**Target state:** `GET /events` unchanged except it opens with a `sessions` frame after
`setup`; `POST /view` (small JSON body: `mode`, optional `session`) calls
`host.setView`; `POST /dismiss` (body: `session`) calls `host.dismiss`; both answer
`204` and never throw out of the request. Loopback-only unchanged; no other route.

**Verification**
- [ ] `cd app && npm test` passes, including new cases: `/events` receives
  `setup`, then `sessions`, then `board`; `POST /view` flips the next published board;
  `POST /dismiss` drops the session from `sessions`; unknown bodies are ignored

## Phase 3 — the page: dock, toggle, session colors

### Task 3.1 — words for the dock

**Problem:** The dock's words do not exist in any of the seven languages.

**Affected files:** [text.ts](../../hooks/text.ts) (the `Strings` contract and all
seven languages)

**Target state:** New keys: the view select's two labels (merged, focus), `quietSince`
(as a clock word, e.g. "quiet since 23:41"), `older` (the "+N older" chip), `dismiss`
(the × tooltip), and the shared-context meter word (e.g. "shared"). All seven
languages filled in; no station, feed or existing key changes.

**Verification**
- [ ] `cd app && npm run typecheck` passes
- [ ] `cd app && npm test` passes (the existing language tests stay green)

### Task 3.2 — the dock and the view select

**Problem:** With several sessions, the page shows one story and cannot switch.

**Affected files:** [main.ts](../../app/main.ts),
[index.html](../../app/index.html), [main.css](../../app/main.css)

**Target state:** A dock bar under the map (hidden while at most one session exists):
one glyph per summary, ordered by lastEventAt — hue chip (CREW_HUES by id hash), label
(start clock, plus the model when known), subtitle
`lastActivity`, "quiet since HH:MM" when no entry runs, a × per glyph, and a "+N
older" chip for the quiet ones beyond the window. Clicking a glyph sets focus via
`POST /view`; the drawer gains a View select (merged/focus), shown only with more than
one session. The page persists `{mode, focusId}` in localStorage and re-sends it on
load; on a fresh load with no stored choice it takes focus on the most recently active
session. Focus never moves on its own. Dismissing posts and forgets the glyph.

**Verification**
- [ ] `cd app && npm test` passes
- [ ] Manual smoke: `cd app && npm start -- --events-file <a scripted jsonl>` with
  two session ids interleaved — dock shows both glyphs, clicking switches the map,
  the select and dock vanish when only one session remains in the file's tail

### Task 3.3 — log dots

**Problem:** Log lines cannot be told apart by session.

**Affected files:** [main.ts](../../app/main.ts),
[index.html](../../app/index.html), [main.css](../../app/main.css)

**Target state:** Every log line gains a leading dot in its session's hue (from the
entry's `sessionId`; entries without one keep today's line). No rename affordance
ships: session labels stay start clock + model + last activity, per D-014 —
[PRIVACY.md](../../PRIVACY.md) stays untouched.

**Verification**
- [ ] `cd app && npm test` passes
- [ ] Manual smoke as in 3.2: dots carry the sessions' hues; with one session the
  log is indistinguishable from today's

### Task 3.4 — merged tints and the honest shared ring

**Problem:** The merged view needs per-session pulses, and the context ring must not
pretend precision it has not.

**Affected files:** [scene.ts](../../hooks/draw/scene.ts),
[feed.ts](../../hooks/feed.ts), [view.ts](../../hooks/view.ts) (if the meter word
routes through it)

**Target state:** In the merged view an entry's pulse and clock rim use its session's
hue (CREW_HUES by `sessionId` hash) instead of the plain accent when a `sessionId` is
set; a session's own view keeps today's colors untouched. `contextShared` draws the
context ring dashed and replaces the meter's percentage with the shared word. A
single-session board draws exactly as before (no `sessionId`-less path changes, the
lone session's entries carry its id but the focused view never tints).

**Verification**
- [ ] `cd app && npm run typecheck` and `cd app && npm test` pass
- [ ] Manual smoke: two sessions with proxy-measured steps — merged ring dashed with
  the shared word; focus view shows the attributed ring with its percentage; with
  one session the map is indistinguishable from today's

## Phase 4 — retention, docs, changelog

### Task 4.1 — the retention policy

**Problem:** Without an end event, sessions would pile up in the dock and registry.

**Affected files:** [sessions.ts](../../app/sessions.ts),
[server.ts](../../app/server.ts)

**Target state:** Constants `SESSION_QUIET_MS = 30 * 60_000` and `DOCK_KEEP = 8`.
After each applied event the registry evicts: only sessions quiet past the window and
beyond capacity, quietest first, never one with running entries and never the
focused one. `summaries` marks quiet sessions (age beyond the window) so the page can
build the "+N older" chip without its own clock bookkeeping. `dismiss` and eviction
both drop the state; nothing is ever written back to the events file
([PRIVACY.md](../../PRIVACY.md) "deletes nothing" holds — retention is host memory
only).

**Verification**
- [ ] `test/sessions.test.cjs`: nine quiet sessions keep the eight quietest-recent;
  a running or focused session survives any pressure; a fresh event on an evicted id
  starts a clean board (a fresh state, not a resurrection)

### Task 4.2 — the docs

**Problem:** The user guide documents a one-session map.

**Affected files:** [usage.md](../../docs/usage.md), [README.md](../../README.md),
[CHANGELOG.md](../../CHANGELOG.md)

**Target state:** `usage.md` gains "Several sessions at once": the dock, the toggle,
the hues, the quiet wording, the retention window and capacity, and the honesty rules
(one ring shared when the proxy cannot attribute, no "session ended" claim anywhere).
`README.md` gains a sentence in its feature list. `CHANGELOG.md` gets the entry.

**Verification**
- [ ] The documented behavior matches the shipped constants and words exactly
  (window, capacity, "quiet since", shared ring); no other doc drift

## Guard-rails

- **The shared translation stays host-free (ADR-003).** `sessions.ts` imports
  `eventApplier`, `board` and `types` only; the demo keeps working unchanged
  (its session-less events take the implicit bucket and behave exactly as today).
- **The events file, hook script and hook manifest are untouched.** No wire change,
  no new telemetry channel (ADR-007's pattern holds: the proxy keeps only appending).
- **Single-session parity is the contract.** With one session every view, color and
  frame must be indistinguishable from today's app — the parity cases in Tasks 1.3
  and 2.1 exist to prove it, and any task that breaks them is wrong.
- **No lying states.** No glyph says "ended" or claims liveness; focus never
  auto-switches; a shared context shows no percentage. If a state cannot be known,
  it is drawn as unknown.
- **The page bundle ships module-free** (M-001's rule lives on in the app's bundle):
  new page code goes through the existing esbuild step; the compiled `out/web/bundle.js`
  must stay `require`-free.
- **The settings surface does not grow.** Retention and dock numbers are code
  constants; config keys and defaults are unchanged.
- **Agent seat union assumes host-unique agent ids** (true of Copilot today); if a
  future host reuses ids across sessions, revisit the union — note it then, not now.
- **Commits and Git stay with the Version Control Agent.** The Builder works tasks,
  ticks checkboxes, and reports deviations to the Architect — never silently into
  code.
