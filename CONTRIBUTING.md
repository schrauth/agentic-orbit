# Contributing

Thank you for taking the time to help.

## The project in one line

A VS Code extension that draws a live map of GitHub Copilot's work. It never blocks the agent, never sends anything anywhere, and never shows content — only names.

## Before you send a change

- `cd vscode-extension && npm ci && npm run compile` passes with no errors.
- Nothing new reaches the network, reads files outside its own workspace hook file, or starts processes other than the hook it installs.
- A label never holds content: a file keeps the last two parts of its path, a web address its host, a shell command its description or name.
- The hook script stays fail-safe: it always exits `0` within milliseconds, whatever it is handed, and answers `preToolUse` with a valid allow JSON, even when the extension is not running.

## Words

Labels and rows live in `hooks/text.ts`. A new language is one more table there and one more value of `agenticOrbit.language`.

## Sending

Open a pull request against `main`. Say what changed and why, and what you did not check.
