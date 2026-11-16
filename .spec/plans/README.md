# Implementation Plans

Implementation plans live in this folder, apart from the durable records
(`ADR.md`, `MISTAKES.md`, `DECISION_LOG.md` one level up). A plan is a
working document with an end; the registers above stay for the project's
lifetime.

## Ownership

- The **Architect** writes and maintains plans. It records when reality
  diverges; a stale plan is a contract error.
- The **Builder** works the plan task by task and ticks a task's
  `- [ ]` checkbox only after that task's verification passed. Deviations
  from the plan go to the Architect, never silently into code.
- The **Memory & ADR Agent** never edits plans; durable decisions a plan
  produced go to `../ADR.md` and `../DECISION_LOG.md`.

## Naming

`<kebab-case-name>-plan.md`, e.g. `standalone-browser-map-plan.md`.

## Shape

1. An executive summary grounded in the current code: what the ground
   already covers, with file links.
2. The design decisions the plan builds on.
3. Phases of small tasks that each land and verify on their own. Every
   task carries **Problem**, **Affected files**, **Target state**,
   **Verification** — as a `- [ ]` checkbox.
4. Guard-rails for the implementer.
