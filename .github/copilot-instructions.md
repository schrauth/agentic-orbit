# Project Core Guidelines & Architecture Rules

## Git
Only the Version Control Agent may run Git commands or change Git state. Other agents must not inspect Git status, diffs, history, branches, or perform Git operations.

## Agent Definitions
Do not create or modify files in `.github/agents/` without the user's explicit prior approval. First present the proposed changes and wait for approval.

## Specs
Before work that depends on prior agreements, consult only the relevant `.spec/` entries: recent decisions in [DECISION_LOG.md](../.spec/DECISION_LOG.md), durable decisions in [ADR.md](../.spec/ADR.md), the change-area entries in [MISTAKES.md](../.spec/MISTAKES.md), and, for implementation work, the plan in [.spec/plans/](../.spec/plans/) that covers it — never read a full file by default. Record durable architectural decisions in the ADR register and important cross-chat decisions in the decision log; skip routine implementation choices and conversation transcripts.

## Execution
Run the configured type checks, linting, and tests for changed code.
