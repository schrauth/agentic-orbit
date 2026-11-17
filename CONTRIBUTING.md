# Contributing

Thank you for taking the time to help.

## The project in one line

A browser app that draws a live map of GitHub Copilot's work. It never blocks the agent, never sends anything anywhere, and never shows content — only names. Today only Copilot's workspace hook tells the map its story: the app runs beside any editor, but a second producer — another IDE's or agent host's hook — is future work.

## The agent team

The repository carries its own Copilot agents in [`.github/agents/`](.github/agents) — Architect, Builder, Memory & ADR, Reviewer and Version Control — each with its reach and limits written in its definition. They are part of the project: change them only with the user's explicit prior approval, as [`.github/copilot-instructions.md`](.github/copilot-instructions.md) requires.

## Before you send a change

- `cd app && npm ci && npm test` passes; this builds the app and runs its focused regression tests.
- `cd demo && npm ci && npm run typecheck` passes; the demo is built from the same shared `hooks/` code as the app, so this catches drift between them. CI runs both on every pull request and every push to `main`.
- Nothing new reaches the network, reads files outside its own workspace hook file, or starts processes other than the hook it installs.
- A label never holds content: a file keeps the last two parts of its path, a web address its host, a shell command its description or name.
- The hook script stays fail-safe: it always exits `0` within milliseconds, whatever it is handed, and answers `preToolUse` with a valid allow JSON, even when the app is not running.

## Words

Labels and rows live in `hooks/text.ts`. A new language is one more table there and one more value of the `language` config key.

## Sending

Open a pull request against `main`. Say what changed and why, and what you did not check.
