# Privacy

The app draws a live map of the work: which stations are used, when, for how long, and how the calls were named. This page says exactly what it observes, what it keeps, and where it goes.

## What it observes

To draw the map, the app's workspace hook is handed every tool call's whole input, including command lines and the text written to files, and the loopback proxy, when you turn it on, sees the model's request and response streams pass through unchanged. That is how a map that follows tool calls works; it is also the whole of what the app can see.

## What it takes from that

Names, and nothing else. The code that does so is `clean`, `hostOf` and `classifyShell` in `hooks/classify.ts`, and `classifyCopilot` in `app/classifyCopilot.ts`:

- a file: the last two parts of its path;
- a web address: the host alone, without a login, password, path or query;
- a shell command: the short description the model wrote for it, or the command's name, never the command line;
- a search, a memory call, a subagent: the tool's name, or the short description it was started with, never the pattern, the query or the text;
- a skill: its name, never the text it carried;
- a refused tool: its name, never the input that was refused.

Control characters are taken out of every label before it is drawn.

## What it keeps, and where

- The hook writes one compact JSON line per call, and every key in it is one of these: `v` (the line's format version), `event`, `tool`, `model`, `session`, `callId`, `agentId`, `ts`, `status`, `error`, `aborted`, `description`, `commandName`, `skill`, `fileTail` (a file's last two path parts), `urlHost` (an address's host), `promptTokens`. No key holds content. A project's own guard may write one more line of the same shape when it denies a call: the tool's name, `status: "blocked"`, and its own rule marker in `description` — never the command line, the path or the input it refused. The line goes to a file in the OS temp folder of the machine the session runs on. The app reads it from there and deletes nothing; the OS clears its temp folder on its own schedule. The path is `$TMPDIR/agentic-orbit-<hash of the workspace path>.jsonl`. The host binds `127.0.0.1` only, and writes nothing.
- The page keeps one choice between visits, in the browser's own local storage: how many lines its log holds. The model's name is read from the current session's events — and, when the proxy is on, written there as one more line — and kept nowhere else.
- Nothing else is written anywhere, and nothing is ever sent anywhere: the app makes no network requests and talks to no one.

## The proxy

The loopback proxy is off by default. When you turn it on, it listens on `127.0.0.1` only, forwards each request to the base URL you set and reads the token usage from the stream. Per model request it appends one compact line — the model's name and the prompt token count, the same figures the map shows — to the same machine-local temporary file the workspace hook writes. It writes nothing anywhere else and keeps nothing between requests. What it holds of the answer while it runs is bounded, and it holds no text of it once the request is done: it searches a `usage` block, keeping at most the last 64 KB of an answer for that search, and if it finds none it counts the request's own size instead. Request bodies are held whole while they are forwarded, because a body cut short would reach the model corrupted; a request is the person's own and the operator's own size bound.

## Faults

A fault in the app or the observer never reaches a tool call or a model turn: the observer always exits `0` and answers `preToolUse` with a valid allow JSON, whatever happens to it. A project's own guard is outside the app and may deny a call deliberately; write it so an accident never becomes a denial.
