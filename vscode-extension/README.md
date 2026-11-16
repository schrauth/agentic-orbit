# Agentic Orbit for VS Code

A live map of GitHub Copilot's work, drawn beside your editor. Three commands, everything
local, nothing about your code or your prompts ever leaves the machine — the map shows
names, stations, timings and figures only. The drawing, classification and text engine
lives in the repository's [hooks/](../hooks) folder; only this folder knows about VS Code.

## Install

- **From the .vsix:** `code --install-extension agentic-orbit-<version>.vsix --force`
- **Commands:** `Agentic Orbit: Open` (the panel, beside the active editor), `Agentic Orbit: Install Workspace Hooks`, `Agentic Orbit: Start Proxy`.

## How it sees Copilot work

Two decoupled sources, both optional:

**1. Workspace hooks** (`Agentic Orbit: Install Workspace Hooks` writes `.github/hooks/agentic-orbit-hook.js`
and `.github/hooks/hooks.json` into the open project). Each hook call appends one compact JSON
line to a file in the OS temp folder — metadata only: tool name, ids, timings, status. The
extension watches that file and turns the lines into map events. The hook is fail-safe by
design: it always exits `0` within milliseconds and answers `preToolUse` with a valid allow JSON,
even when the extension is not running, so the agent is never blocked. Hooks are loaded when a
Copilot session starts, so install them first and then start a new session.

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
| `agenticOrbit.coreName` | `COPILOT` | What the circle in the middle of the map says, up to ten characters; once a model answers, its family stands there instead |
| `agenticOrbit.proxy.enabled` | `false` | Start the proxy on activation |
| `agenticOrbit.proxy.port` | `8317` | Loopback port |
| `agenticOrbit.proxy.targetBaseUrl` | — | Your on-prem LLM base URL, e.g. `https://llm.internal/v1` |
| `agenticOrbit.contextWindowLimit` | `128000` | Tokens the ring is full at |
| `agenticOrbit.hookEventsFile` | — | Override where hook events are read from; empty means `agentic-orbit-<workspace hash>.jsonl` in the OS temp folder |
| `agenticOrbit.layout` | `you-top` | `you-top` / `you-bottom` |
| `agenticOrbit.language` | `en` | `en`, `ru`, `es`, `fr`, `de`, `it` or `pt` |
| `agenticOrbit.theme` | `auto` | `auto` / `dark` / `light` |
| `agenticOrbit.background` | `solid` | `solid`, or `transparent`, which lets the panel behind the map show through |
| `agenticOrbit.colors` | — | Colours that replace the map's own, each written as `name=#rrggbb`, comma-separated. Names: `background`, `node`, `line`, `spoke`, `text`, `label`, `faint`, `accent`, `active`, `error`, `memory`, `memoryActive`, `route` |
| `agenticOrbit.motion` | `full` | `full` / `reduced` |
| `agenticOrbit.pace` | `normal` | `normal` / `slow`, which draws every data exchange at half speed |
| `agenticOrbit.memoryServers` | `["memory"]` | MCP servers whose tools read as Memory |
| `agenticOrbit.memoryCommands` | `[]` | Shell command names that read as Memory |
| `agenticOrbit.memorySubcommands` | `[]` | Shell subcommands that read as Memory |
| `agenticOrbit.memoryPaths` | `[]` | Path fragments: a file path holding one reads as Memory |
| `agenticOrbit.memoryLabels` | `[]` | Tool relabelings as `tool=name`, e.g. `mcp__wiki__search=wiki` |

## Build

```bash
npm install
npm run compile   # tsc + webview assets
npm run package   # → agentic-orbit-x.y.z.vsix
```
