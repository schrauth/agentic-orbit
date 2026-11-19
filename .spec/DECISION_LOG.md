# Decision Log

A short, append-only log of important, cross-chat decisions, so a new
conversation can pick up where the last one ended without re-litigating.

## What belongs here

**Log it** when a decision:
- changes a shared contract: `types/index.d.ts`, the hook event schema,
  the settings surface, or a module boundary;
- changes a hard rule: privacy (labels), fail-safe hook, allowed reach;
- changes shipped behavior users depend on (settings defaults, station
  meanings, install steps);
- was made by the Architect or agreed with the user, and future chats
  must not silently undo it.

**Do not log** routine work: bug fixes, refactors inside one module,
wording, visuals, build chores, or conversation transcripts. Those go to
CHANGELOG, code or MISTAKES.md as appropriate.

## Entry format

```markdown
- **D-NNN (YYYY-MM-DD):** One-sentence decision.
  Affects: <contracts/modules>. Recorded by: <agent/user>.
```

Numbering: `D-001`, `D-002`, … newest last.

---

- **D-001 (2026-11-14, seeded from project docs):** Shell commands are
  classified by their *name*, not their side effects; wrappers (`sudo`,
  `env`, `timeout`, …) are transparent. Affects: `hooks/` classification,
  README station table. Recorded by: Architect.
- **D-002 (2026-11-14, seeded from project docs):** The **Hooks** and
  **Memory** stations stay dark until a real event reaches them — no
  synthetic firing, and both stay outside the smoke test. Affects: map
  drawing, `scripts/smoke-test.sh`, README. Recorded by: Architect.
- **D-003 (2026-11-14, seeded from project docs):** Model steps are
  excluded from the route legs, or every leg would pass through the
  **Model** station. Affects: `hooks/` route drawing. Recorded by: Architect.
- **D-004 (2026-11-15, agreed with the user):** The agent definitions in
  `.github/agents/` are generic and belong to the repository; they are
  tracked, not ignored, and stay change-protected by
  `.github/copilot-instructions.md`. Affects: `.gitignore`,
  `.github/agents/`, CONTRIBUTING. Recorded by: Builder (user approval given).
- **D-005 (2026-11-15):** Shared state contracts are now centralized (`ViewProjection`/`ViewRow` and `BoardEntryStart`/`BoardTransition` in `types/index.d.ts`), with a pure projection in `hooks/view.ts` and a VS Code-free `transitionBoard` reducer in `vscode-extension/src/board.ts`; hook parsing, demo clock/scenario logic, and parked subagent-name correlation remain caller-owned responsibilities. Affects: `types/index.d.ts`, `hooks/view.ts`, `vscode-extension/src/board.ts`, caller integration points. Recorded by: Builder.
- **D-006 (2026-11-16, Task 1.4 of `.spec/plans/cleanup-and-quality-plan.md`, branch `cleanup-and-quality-plan`):** The parked background-task experiment was dropped: `background()`/`settle()` deleted from `vscode-extension/src/board.ts` (never called) and `Entry.task` removed from `types/index.d.ts` (never writable at runtime), with its readers in `kept()`/`agentDone()`/`sweepOpen()` and `hooks/draw.ts` `isThinking()` simplified; the unrelated park/claim/unpark `parkedNames` feature stays live.
  Affects: `types/index.d.ts`, `vscode-extension/src/board.ts`, `hooks/draw.ts`. Recorded by: Memory & ADR Agent.
- **D-007 (2026-11-16, Task 1.7 of `.spec/plans/cleanup-and-quality-plan.md`):** The `Board` contract sheds its four never-written fields `pushed`, `open`, `minimized`, `zoom` — the panel keeps its own `minimized`/`zoom` instance fields plus globalState and the demo its own view-state object, neither going through `Board`; `draw.ts`'s pushed/asked split (which could only ever render its fallback) now shows the plain count, and consumers wanting view state carry it themselves.
  Affects: `types/index.d.ts` (`Board`), `hooks/draw.ts`, view-state consumers (vscode-extension panel, `demo/`). Recorded by: Memory & ADR Agent.
- **D-008 (2026-11-16, Task 3.1 of `.spec/plans/cleanup-and-quality-plan.md`):** The event → board translation (park/unpark of subagent names, classifyCopilot dispatch, `transitionBoard` calls) moved from `vscode-extension/src/extension.ts` into the new VS Code-free `vscode-extension/src/eventApplier.ts` (exports `ApplierState`, `emptyState`, `applyHookEvent`, per ADR-003); the extension host forwards every hook event through it and the demo's `FakeSession` delegates `apply()` to the same function, so the demo now replays the host's translation exactly — parked subagent names included, which its former local copy never had; to let the demo import the applier without the host's Node-only watcher, the `HookEvent` wire type moved to `types/index.d.ts` (`hookWatcher` re-exports it, no consumer changes).
  Affects: `vscode-extension/src/eventApplier.ts` (new), `vscode-extension/src/extension.ts`, `vscode-extension/src/hookWatcher.ts`, `types/index.d.ts`, `demo/engine.ts`, `demo/tsconfig.json`. Recorded by: Memory & ADR Agent.
- **D-009 (2026-11-16):** ADR-006 records the standalone browser host — server-owned board, SSE on loopback, `hooks/` purity untouched.
  Affects: `standalone/` (new), `vscode-extension/src/` VS Code-free modules (`hookWatcher`, `proxy`, `eventApplier`, `board`, `classifyCopilot`, `webview/render`), `hooks/`, `types/index.d.ts`. Recorded by: Memory & ADR Agent.
- **D-010 (2026-11-16, agreed with the user):** Implementation plans become a first-class Architect duty: plan-worthy requests get a plan in `.spec/plans/` before implementation (shape per `.spec/plans/README.md`); the Builder works them task by task and ticks a task only after its verification passed, reporting deviations to the Architect instead of silently deviating. Plans live apart from the durable registers; the existing plans moved to `.spec/plans/`.
  Affects: `.github/agents/architect.md`, `.github/agents/builder.md`, `.github/copilot-instructions.md`, `.spec/plans/` (new). Recorded by: Architect (user approval given).
- **D-011 (2026-11-16, ADR-007, plan `.spec/plans/model-step-events-plan.md`):** Proxy telemetry is persisted as a `modelStep` line in the shared events file and applied by every consumer through `applyHookEvent`; hosts append the line instead of applying telemetry directly (collapsing the duplicated host-side `modelStep` builders in `vscode-extension/src/extension.ts`, `standalone/server.ts` and `demo/engine.ts`), and `sessionStart` now also sets `board.model` from its `model` field so the name shows before the first proxy request. `proxy.ts`, `board.ts` and the `BoardTransition` shape are unchanged.
  Affects: `types/index.d.ts` (`HookEvent.promptTokens`), `hooks/setup.ts` (`Setup.contextWindowLimit`), `vscode-extension/src/eventApplier.ts`, `vscode-extension/src/eventWriter.ts` (new), `vscode-extension/src/extension.ts`, `vscode-extension/src/config.ts`, `standalone/server.ts`, `demo/engine.ts`, `PRIVACY.md`. Recorded by: Architect.
- **D-012 (2026-11-17):** The VS Code extension is dropped entirely; the browser host (renamed `standalone/` → `app/`, package `agentic-orbit`) is the product, IDE-independent. Extensions for IDEs may later embed the web app, but none ships now.
  Affects: package layout, module homes (core modules move into `app/`), docs, CI. Recorded by: Architect (user decision).
- **D-013 (2026-11-17, agreed with the user):** Concurrent sessions in one workspace stop sharing a board: the host keeps one state per session id (ADR-009), the merged workspace view becomes a derived projection, and the page can switch between merged and a focused single-session view with a session dock at runtime. Sessions are named without touching privacy — hue, start clock, model and last activity — get no end event claims (retention window plus manual dismiss), and proxy context that cannot be attributed is drawn as shared. Plan: `.spec/plans/multi-session-boards-plan.md`; ADR-009.
  Affects: `types/index.d.ts` (`Entry.sessionId`, `Board.contextShared`, `SessionSummary`), `app/sessions.ts` (new), `app/server.ts`, `app/http.ts`, `app/main.ts`, `hooks/` (draw, text), docs. Recorded by: Architect.
- **D-014 (2026-11-17, agreed with the user):** No privacy surface changes ship with the multi-session work: no typed session names on the page, PRIVACY.md untouched. Sessions are identified by hue, start clock, model and last activity only — data the map already observes. If session names are ever wanted, the PRIVACY.md sentence about page-kept storage comes first, never after. Affects: `.spec/plans/multi-session-boards-plan.md` (Task 3.3 scoped to log dots; former Task 4.3 dropped). Recorded by: Architect.
- **D-015 (2026-11-17, agreed with the user):** The Skills station stays, and its label gap closes: the hook event schema gains an optional `skill` field carrying only the name of a skill call (never its text), `eventApplier` forwards it to `classifyCopilot`, and the row shows the name with the generic `t.skill` word as fallback; the four Claude Code relic tool names (`run_skill`, `use_skill`, `list_skills`, `search_tools`) are removed from the classifier, the `loadingTools` strings leave all seven language tables, and the smoke test fires the real `skill` tool.
  Affects: `types/index.d.ts` (`HookEvent.skill`), `app/res/agentic-orbit-hook.js`, `app/eventApplier.ts`, `app/classifyCopilot.ts`, `hooks/text.ts`, `scripts/smoke-test.sh`, PRIVACY.md, docs. Recorded by: Builder (user approval given).
- **D-016 (2026-11-18, repo review, branch `review/app-typecheck-ci`):** The hook's line stops carrying locations. `HookEvent` gains `fileTail` (a file's last two path parts) and `urlHost` (an address's host), and the hook writes those instead of the full `filePath` and `url`; the two old fields stay as deprecated read-only members so events files written before the change still render, and the classifier reduces either spelling. The proxy keeps at most the last 64 KB of an answer for its `usage` search, where a non-streaming answer used to be accumulated whole. In the same pass ADR-003 was rewritten in place — same number, same status, same rule; only its paths and module names were brought up to ADR-008's layout — and the change-area index in MISTAKES.md was repaired to name areas that exist. The review's plans under `.spec/review/` were deleted after implementation (8 of 9 implemented; `module-boundary-layering-plan` was not taken on); this entry and the CHANGELOG are the record that survives them.
  Affects: `types/index.d.ts` (`HookEvent.fileTail`, `HookEvent.urlHost`), `app/` (`res/agentic-orbit-hook.js`, `classifyCopilot`, `eventApplier`, `proxy`, `hookWatcher`, `render`, `main`, `index.html`, `main.css`, `package.json`, `tsconfig.json`, `test/`), `hooks/setup.ts`, `hooks/view.ts`, `demo/`, `.github/ISSUE_TEMPLATE/`, PRIVACY.md, SECURITY.md, CONTRIBUTING.md, docs/usage.md, CHANGELOG.md, `.spec/ADR.md`, `.spec/MISTAKES.md`. Recorded by: Builder (user approval given).
  Left open for the Architect: a memory file more than one level under a configured `memoryPaths` entry (`.memory/sub/plan.md`) no longer reaches the Memory station, because `fileTail` keeps two path parts — one level (`.memory/plan.md`) still does. Keeping that station needs a third path part, which is a contract decision.
- **D-017 (2026-11-19, plan `.spec/plans/guard-hooks-plan.md`):** The Hooks station is fed by two opt-in guards installed with `--install-hooks <dir> --guard`: the agent-definitions guard denies edits under `.github/agents/` (reads stay allowed), the Git-monopoly guard denies a subagent's `git` command (the main chat keeps Git rights; an absent identity fails open). A denial is an `errorOccurred` line with the existing dormant `status: 'blocked'` field — no new event type and no new content fields; `BoardTransition.failure` gains an optional `status` defaulting to `'err'`, and a blocked line closes the open call at the Hooks station (or lands there alone), fault-counted and alarm-drawn. The guard is fail-open in doubt and always exits `0`, because Copilot counts a crashed command hook as a denial; its manifest pins `timeoutSec: 5`, and a timeout falls through to the normal permission flow. The observer keeps ADR-001's fail-safe; ADR-010 records the deliberate exception.
  Affects: `types/index.d.ts` (`BoardTransition.failure.status`), `app/board.ts`, `app/eventApplier.ts`, `app/hookManifest.ts`, `app/cli.ts`, `app/res/agentic-orbit-guard.js` (new), `app/package.json`, `scripts/smoke-test.sh`, `docs/usage.md`, `docs/app.md`, README.md, PRIVACY.md, SECURITY.md, CONTRIBUTING.md, CHANGELOG.md. Recorded by: Builder (user approval given).
- **D-018 (2026-11-19, user decision):** The app stops shipping guards. `--guard`, `guardJson`, `app/res/agentic-orbit-guard.js`, its build copy and the two hardcoded rules are removed; the installer writes only the observer. The visualization contract stays: `HookEvent.status` and `BoardTransition.failure.status` keep `'blocked'`, and `eventApplier` still closes the open call at the Hooks station (or lands there alone). This repository's two guards continue as local, untracked files under `.github/hooks/`. D-017 is superseded; ADR-010 is superseded by ADR-011; the old plan `.spec/plans/guard-hooks-plan.md` is deleted.
  Affects: `app/cli.ts`, `app/hookManifest.ts`, `app/test-entry.ts`, `app/package.json`, `app/res/`, `app/test/`, `scripts/smoke-test.sh`, README.md, `docs/`, PRIVACY.md, SECURITY.md, CONTRIBUTING.md, CHANGELOG.md, `.spec/ADR.md`, `.spec/MISTAKES.md`. Recorded by: Builder (user approval given).
