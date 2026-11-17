# User guide

Agentic Orbit can show Copilot activity in the VS Code panel or in the browser app. This guide explains the map, its settings and where its events come from. For running the map outside VS Code, see the [App guide](./app.md).

## The stations

| Station | When it lights up |
| --- | --- |
| **Operator** | your messages, and the questions and files sent to you |
| **Model** | each model request the proxy measures, and tools the map knows no station for yet |
| **Memory** | MCP servers you name in the settings, and shell commands or paths you name there — without any of these, the station stays dark |
| **Files** | file tools, and shell commands that work on files and nothing else — they read, search, move, delete or edit in place (`cat`, `grep`, `mv`, `rm`, `sed`, `tee`, `find … -delete`) |
| **Shell** | every other shell command |
| **Network** | web fetch and search, MCP servers, and shell commands known to reach the network: `curl`, `gh`, `ssh`, `rsync`, `git push`, `npm install`, `docker pull` and the like — also inside `$(…)` |
| **Browser** | browser tools — none of Copilot's reaches this station yet, so it waits |
| **Agents** | subagents; their own calls start from this station |
| **Skills** | skills and tool search |
| **Hooks** | hooks that refuse a call, ask for permission or take a moment — none is reported yet, so the station waits |

### Memory is yours to name

**Memory** lights up only for what you name in the settings: an MCP server in `agenticOrbit.memoryServers` (only the server `memory` is named by default), a shell command in `agenticOrbit.memoryCommands`, or a path fragment in `agenticOrbit.memoryPaths`. Without a memory server or command, the station never lights — and nothing is lost, it simply has nothing to watch.

### What waits

A few things on the map are drawn and ready, but nothing reports them yet:

- **Browser** waits: no tool of Copilot's is read as this station, so pages Copilot fetches light **Network** instead.
- **Hooks** waits: it is drawn for guard hooks that intervene in a call — refusing it, asking for permission, or holding it up. The map can show such refusals in red, but the hook pipeline reports no blocking event, so nothing arrives at this station yet.
- **Memory has a second count** — a `↓` under the station, for what a hook put in front of the model unasked. No hook reports what it brought, so the `↓` never appears yet.
- **A call in the background** would keep its light and its clock hands after the turn that started it is over, until the task reports it ended. No event yet says which call that is, so every call ends when its turn does.

All of these stay outside the smoke test for the same reason: there is nothing to fire at them.

### How shell commands are read

The stations go by the command's *name*, not by what it does:

- **Windows:** a PowerShell tool is read like Bash, with PowerShell's own names — `Get-Content` and `Select-String` light **Files**, `Invoke-WebRequest` lights **Network**. A program run by its full path is read by its name, also from a quoted path with a space, and `CURL.EXE` is `curl`.
- **Side effects don't count:** a script that opens a connection itself, such as `python -c "…"`, shows as **Shell**.
- **Wrappers are transparent:** a command behind `sudo`, `env`, `timeout`, `nohup`, `xargs` and the like is read as the command it runs, and `find … -exec` as the command it is told to run.
- **`npx`** counts as **Network** only with `-y`; without it, it mostly runs what is installed already.

## Reading the map

A pulse flies out when something starts and returns when it ends. Refusals and errors turn red. Your own message comes the other way: a hollow pulse on a dashed line, from **Operator** to the centre.

### The route

A thin line joins the last few stations the main loop went through, in order, and its newest leg draws itself. A leg stays for 40 seconds and then fades over 20, so a minute after the work stops only the spokes are left — their thickness keeps where the work went. Model steps are left out, or every leg would pass through **Model**.

### Worn spokes

A spoke grows thicker and brighter the more its station is used, so at the end of a session the map shows where the work went.

### How long a call runs

Two clock hands grow around a station while a call runs: the inner one goes round in a minute, the outer one in ten.

### Several calls at once

Calls that start together fly side by side, and the station carries their number, such as `×3`.

### Errors and refusals

A red dot with a count stays on a station from an error or a refusal until your next message.

### Memory

A memory call flies as a **solid pulse** in a colour of its own, and the plain number under the station counts them.

### The context window

The ring around the centre fills as the session goes, with the percentage above the name. It turns amber at 70% and red at 90%. It needs the loopback proxy; see [How it sees Copilot work](#how-it-sees-copilot-work).

### A change of model

The centre and the **Model** station ring for a few seconds, and the feed gets a row such as `gpt 5.2 → gpt 5.2 high`.

### Subagents

Each subagent still at work circles the **Agents** station — which sits far out beyond the ring of stations — as a small planet on an orbit of its own, and its calls start from there. The first four hold the four inner rings, one planet each; every subagent after that takes a place on one wide outer ring they all share. A planet keeps its seat — its ring, its place on it and its colour — for as long as it is on the map, whatever the rest of the crew does, and a seat opens again only once its planet has fully faded. Every planet wears a hue of its own; when more than six agents crowd the map, the hues start again from the first. The legend in the corner below names each colour with the short description its subagent was started with. A subagent that is done keeps circling for a minute before it fades.

### The answer

One wide ring leaves the centre when the answer is ready.

### The feed below the map

Under the map are a line that says what runs now, and the last rows:

| Marker | Meaning |
| --- | --- |
| `●` | running |
| `·` | done |
| `✕` | failed or blocked |
| `◆` | a change of model |

Finished calls that follow one another at one station fold into one row, marked `+2` for the two it stands for besides the one named. Buttons at the end of the line zoom the map, fold the pane to that one line and bring the map back.

## How it sees Copilot work

Two decoupled sources are available:

### Workspace hooks

**Agentic Orbit: Install Workspace Hooks** writes `.github/hooks/hooks.json` and `.github/hooks/agentic-orbit-hook.js` into the open project. Each hook call appends one compact JSON line to a file in the OS temp folder — metadata only: the event, tool name, ids, timings, status, a short description, a command's name. The extension watches that file and turns the lines into map events: a session's start and its model, your messages, every tool call's start and end, failures, and the end of a turn.

The hook is fail-safe by design: it always exits `0` within milliseconds and answers `preToolUse` with a valid allow JSON, even when the extension is not running, so the agent is never blocked. Hooks are loaded when a Copilot session starts, so install them before starting a new session.

### The loopback proxy

The proxy is optional and supplies the context-window ring. Point your custom model's base URL at `http://127.0.0.1:8317/v1` (see [Settings](#settings)). It forwards every request to your on-prem LLM unchanged — streamed, unbuffered — while reading token usage from the stream and appending a `modelStep` line to the shared events file. Both the panel and the browser map show those model steps.

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
| `agenticOrbit.theme` | `auto` | `auto` / `dark` / `light` / `fraunhofer` (Fraunhofer light theme) |
| `agenticOrbit.background` | `solid` | `solid`, or `transparent`, which lets the panel behind the map show through |
| `agenticOrbit.colors` | — | Colours that replace the map's own, each written as `name=#rrggbb`, comma-separated. Names: `background`, `node`, `line`, `spoke`, `text`, `label`, `faint`, `accent`, `active`, `error`, `memory`, `memoryActive`, `route` |
| `agenticOrbit.motion` | `full` | `full` / `reduced` |
| `agenticOrbit.pace` | `normal` | `normal` / `slow`, which draws every data exchange at half speed |
| `agenticOrbit.memoryServers` | `["memory"]` | MCP servers whose tools read as Memory |
| `agenticOrbit.memoryCommands` | `[]` | Shell command names that read as Memory |
| `agenticOrbit.memorySubcommands` | `[]` | Shell subcommands that read as Memory |
| `agenticOrbit.memoryPaths` | `[]` | Path fragments: a file path holding one reads as Memory |
| `agenticOrbit.memoryLabels` | `[]` | Tool relabelings as `tool=name`, e.g. `mcp__wiki__search=wiki` |

The browser host accepts the same setup values through its config file, plus host-specific flags; see the [App guide](./app.md).

## Privacy

The map uses names and activity metadata, not prompt or tool content. See the [privacy policy](../PRIVACY.md) for what the hook and optional proxy observe and keep.
