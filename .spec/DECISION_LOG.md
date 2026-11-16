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
- **D-006 (2026-11-16, Task 1.4 of `.spec/cleanup-and-quality-plan.md`, branch `cleanup-and-quality-plan`):** The parked background-task experiment was dropped: `background()`/`settle()` deleted from `vscode-extension/src/board.ts` (never called) and `Entry.task` removed from `types/index.d.ts` (never writable at runtime), with its readers in `kept()`/`agentDone()`/`sweepOpen()` and `hooks/draw.ts` `isThinking()` simplified; the unrelated park/claim/unpark `parkedNames` feature stays live.
  Affects: `types/index.d.ts`, `vscode-extension/src/board.ts`, `hooks/draw.ts`. Recorded by: Memory & ADR Agent.
- **D-007 (2026-11-16, Task 1.7 of `.spec/cleanup-and-quality-plan.md`):** The `Board` contract sheds its four never-written fields `pushed`, `open`, `minimized`, `zoom` — the panel keeps its own `minimized`/`zoom` instance fields plus globalState and the demo its own view-state object, neither going through `Board`; `draw.ts`'s pushed/asked split (which could only ever render its fallback) now shows the plain count, and consumers wanting view state carry it themselves.
  Affects: `types/index.d.ts` (`Board`), `hooks/draw.ts`, view-state consumers (vscode-extension panel, `demo/`). Recorded by: Memory & ADR Agent.
- **D-008 (2026-11-16, Task 3.1 of `.spec/cleanup-and-quality-plan.md`):** The event → board translation (park/unpark of subagent names, classifyCopilot dispatch, `transitionBoard` calls) moved from `vscode-extension/src/extension.ts` into the new VS Code-free `vscode-extension/src/eventApplier.ts` (exports `ApplierState`, `emptyState`, `applyHookEvent`, per ADR-003); the extension host forwards every hook event through it and the demo's `FakeSession` delegates `apply()` to the same function, so the demo now replays the host's translation exactly — parked subagent names included, which its former local copy never had; to let the demo import the applier without the host's Node-only watcher, the `HookEvent` wire type moved to `types/index.d.ts` (`hookWatcher` re-exports it, no consumer changes).
  Affects: `vscode-extension/src/eventApplier.ts` (new), `vscode-extension/src/extension.ts`, `vscode-extension/src/hookWatcher.ts`, `types/index.d.ts`, `demo/engine.ts`, `demo/tsconfig.json`. Recorded by: Memory & ADR Agent.
