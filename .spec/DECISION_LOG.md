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
