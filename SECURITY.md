# Security

- The app makes no network requests. The one exception is the loopback proxy, off by default: it listens on `127.0.0.1` only and forwards to the base URL you set yourself. The host adds no second exception: it serves the page on `127.0.0.1` only and reads one file — the events file the hook wrote.
- The hook the app installs into a workspace runs on tool calls. The observer reads one JSON payload from standard input, takes names, ids, figures and a reduced path or host from it, appends one JSON line to a file in the OS temp folder, and exits. It runs no commands of its own and reads no other files. The app installs no guard; a project's own `preToolUse` guard is outside the app and decides its own policy.
- The observer hook is fail-safe: it always exits `0` within milliseconds, and answers `preToolUse` with a valid allow JSON, whatever it is handed — even a broken payload, a missing temp folder or the app not running. A hook that crashed never blocks the agent.
- A project's own guard is deliberately different from the observer: it may deny a call. Write it so it denies only on an explicit rule match, answers allow in doubt, catches its own faults and always exits `0` — Copilot counts a crashed command hook as a denial. [Hooks for your project](docs/hooks.md#guards) shows the shape.
- The map and its rows show names only, never content; see [Privacy](PRIVACY.md) for exactly what is kept and where.

To report a vulnerability, please open an issue at https://github.com/schrauth/agentic-orbit/issues.
