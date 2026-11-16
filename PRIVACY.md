# Privacy

The extension draws a live map of the work: which stations are used, when, for how long, and how the calls were named. This page says exactly what it observes, what it keeps, and where it goes.

## What it observes

To draw the map, the extension's workspace hook is handed every tool call's whole input, including command lines and the text written to files, and the loopback proxy, when you turn it on, sees the model's request and response streams pass through unchanged. That is how an extension that follows tool calls works; it is also the whole of what the extension can see.

## What it takes from that

Names, and nothing else. The code that does so is `clean`, `hostOf` and `classifyShell` in `hooks/classify.ts`, and `classifyCopilot` in `vscode-extension/src/classifyCopilot.ts`:

- a file: the last two parts of its path;
- a web address: the host alone, without a login, password, path or query;
- a shell command: the short description the model wrote for it, or the command's name, never the command line;
- a search, a memory call, a subagent: the tool's name, or the short description it was started with, never the pattern, the query or the text.

Control characters are taken out of every label before it is drawn.

## What it keeps, and where

- The hook writes one compact JSON line per call — the event's name, the tool's name, ids, timings and status, no content — to a file in the OS temp folder of the machine the session runs on. The extension reads it from there and deletes nothing; the OS clears its temp folder on its own schedule. The path is `$TMPDIR/agentic-orbit-<hash of the workspace path>.jsonl`. The standalone host under `standalone/` reads that same names-only file the same way, binds `127.0.0.1` only, and writes nothing.
- The extension keeps one piece of state between sessions, in VS Code's own store for the extension: whether the pane is folded. The model's name is read from the current session's events and kept nowhere.
- Nothing else is written anywhere, and nothing is ever sent anywhere: the extension makes no network requests and talks to no one.

## The proxy

The loopback proxy is off by default. When you turn it on, it listens on `127.0.0.1` only, forwards each request to the base URL you set and reads the token usage from the stream. It writes nothing.

## Faults

A fault in the extension or its hook never reaches a tool call or a model turn: the hook always exits `0` and answers `preToolUse` with a valid allow JSON, whatever happens to it.
