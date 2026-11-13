# Agentic Orbit for VS Code

The live activity map of the [lot-map](../README.md) engine, drawn beside your editor while
GitHub Copilot works. Three commands, everything local, nothing about your code or your prompts
ever leaves the machine — the map shows names, stations, timings and figures only.

## Install

- **From the .vsix:** `code --install-extension agentic-orbit-0.1.0.vsix`
- **Commands:** `Agentic Orbit: Open` (the panel, beside the active editor), `Agentic Orbit: Install Workspace Hooks`, `Agentic Orbit: Start Proxy`.

## How it sees Copilot work

Two decoupled sources, both optional:

**1. Workspace hooks** (`Agentic Orbit: Install Workspace Hooks` writes `.github/hooks/agentic-orbit-hook.js`
and `.github/hooks/agentic-orbit.json` into the open project). Each hook call appends one compact JSON
line to a file in the OS temp folder — metadata only: tool name, ids, timings, status. The
extension watches that file and turns the lines into map events. The hook is fail-safe by
design: it always exits `0` within milliseconds and answers `preToolUse` with a valid allow JSON,
even when the extension is not running, so the agent is never blocked.

Tool mapping: file tools → *Files*, `run_in_terminal` → *Shell*, `runSubagent` → *Agents*,
`run_skill` → *Skills*, `fetch_webpage`/`web_search` → *Web*, `mcp__…` → *Memory* or *Web*
(see `agenticOrbit.memoryServers`), everything else → the model.

**2. The loopback proxy** (optional, for the context-window ring). Point your custom model's
base URL at `http://127.0.0.1:8317/v1` (see settings) and the proxy forwards every request to
your on-prem LLM unchanged — streamed, unbuffered — while reading only `usage.prompt_tokens`
from the stream (fallback: a character-based estimate). The ring turns amber at 70 %, red at 90 %.

## Settings

| Setting | Default | Meaning |
| --- | --- | --- |
| `agenticOrbit.proxy.enabled` | `false` | Start the proxy on activation |
| `agenticOrbit.proxy.port` | `8317` | Loopback port |
| `agenticOrbit.proxy.targetBaseUrl` | — | Your on-prem LLM base URL, e.g. `https://llm.internal/v1` |
| `agenticOrbit.contextWindowLimit` | `128000` | Tokens the ring is full at |
| `agenticOrbit.hookEventsFile` | — | Override where hook events are read from |
| `agenticOrbit.layout` | `you-top` | `you-top` / `you-bottom` |
| `agenticOrbit.language` | `en` | Map texts |
| `agenticOrbit.theme` | `auto` | `auto` / `dark` / `light` |
| `agenticOrbit.motion` | `full` | Animation level |
| `agenticOrbit.memoryServers` | `["memory"]` | MCP servers whose tools read as Memory |

## Build

```bash
npm install
npm run compile   # tsc + webview assets
npm run package   # → agentic-orbit-x.y.z.vsix
```

The drawing, classification and text modules come from the upstream `hooks/` folder unchanged;
only this folder knows about VS Code.
