# Project Core Guidelines & Architecture Rules

## Git
Only the Version Control Agent may run Git commands or change Git state. Other agents must not inspect Git status, diffs, history, branches, or perform Git operations.

## Agent Definitions
Do not create or modify files in `.github/agents/` without the user's explicit prior approval. First present the proposed changes and wait for approval.

## Decision Log
Before work that depends on prior project agreements, consult the relevant recent entries in [.spec/DECISION_LOG.md](../.spec/DECISION_LOG.md). Add only important, cross-chat decisions; do not log routine implementation changes or conversation transcripts.

## Execution
1. Check the relevant `.spec/` files before implementation changes that affect their contracts.
2. Run the configured type checks, linting, and tests for changed code.
3. Before coding, consult only the relevant entries in `.spec/MISTAKES.md` using its change-area index; do not read the full file by default.
4. Record durable architectural decisions in `.spec/ADR.md`; skip routine implementation choices.
