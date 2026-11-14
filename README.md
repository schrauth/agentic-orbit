# agentic-orbit

A live map of Copilot's work, in a pane beside your editor.

While GitHub Copilot works, every tool call, model step and skill sends a pulse from the centre to its station — so you see memory, files, shell, web and agents at work instead of reading a list of commands.

![The map during a work session](docs/demo.gif)

*A made-up session replayed through the extension's own drawing code. [Video (MP4)](docs/demo.mp4).*

## Install

Build and install the extension from the repository:

```bash
cd vscode-extension
npm install
npm run compile
npm run package
code --install-extension agentic-orbit-0.2.0.vsix --force
```

Then, in the folder you want to watch:

1. Run **Agentic Orbit: Install Workspace Hooks** from the command palette. This writes `.github/hooks/hooks.json` and `.github/hooks/agentic-orbit-hook.js` into the project.
2. Start a **new** Copilot session — hooks are loaded when a session starts.
3. Open the panel with **Agentic Orbit: Open**.

What each version changed is in [CHANGELOG.md](CHANGELOG.md).

## The stations

| Station | When it lights up |
| --- | --- |
| **You** | your messages, questions and files sent to you, the task list and the plan |
| **Model** | each model request |
| **Memory** | MCP servers you name in the settings, and shell commands or paths you name there — without any of these, the station stays dark |
| **Files** | file tools, and shell commands that work on files and nothing else — they read, search, move, delete or edit in place (`cat`, `grep`, `mv`, `rm`, `sed`, `tee`, `find … -delete`) |
| **Shell** | every other shell command |
| **Network** | web fetch and search, MCP servers, and shell commands known to reach the network: `curl`, `gh`, `ssh`, `rsync`, `git push`, `npm install`, `docker pull` and the like — also inside `$(…)` |
| **Browser** | browser tools |
| **Agents** | subagents; their own calls start from this station |
| **Skills** | skills and tool search |
| **Hooks** | hooks that refuse a call, ask for permission or take a moment — none is reported yet, so the station waits |

### Two stations that wait

**Memory** lights up only for what you name in the settings: an MCP server in `agenticOrbit.memoryServers` (only the server `memory` is named by default), a shell command in `agenticOrbit.memoryCommands`, or a path fragment in `agenticOrbit.memoryPaths`. Without a memory server or command, the station never lights — and nothing is lost, it simply has nothing to watch.

**Hooks** is drawn for guard hooks that intervene in a call — refusing it, asking for permission, or holding it up. The map can show such refusals in red, but the current extension's hook pipeline reports no blocking event, so nothing arrives at this station yet. It stays in place for the day one does.

These two, and their signals, also stay outside the smoke test for the same reason: there is nothing to fire at them.

### How shell commands are read

The stations go by the command's *name*, not by what it does:

- **Windows:** a PowerShell tool is read like Bash, with PowerShell's own names — `Get-Content` and `Select-String` light **Files**, `Invoke-WebRequest` lights **Network**. A program run by its full path is read by its name, also from a quoted path with a space, and `CURL.EXE` is `curl`.
- **Side effects don't count:** a script that opens a connection itself, such as `python -c "…"`, shows as **Shell**.
- **Wrappers are transparent:** a command behind `sudo`, `env`, `timeout`, `nohup`, `xargs` and the like is read as the command it runs, and `find … -exec` as the command it is told to run.
- **`npx`** counts as **Network** only with `-y`; without it, it mostly runs what is installed already.

## Reading the map

A pulse flies out when something starts and returns when it ends. Refusals and errors turn red.

### The route

A thin line joins the last few stations the main loop went through, in order, and its newest leg draws itself. A leg stays for 40 seconds and then fades over 20, so a minute after the work stops only the spokes are left — their thickness keeps where the work went. Model steps are left out, or every leg would pass through **Model**.

### Worn spokes

A spoke grows thicker and brighter the more its station is used, so at the end of a session the map shows where the work went.

### How long a call runs

Two clock hands grow around a station while a call runs: the inner one goes round in a minute, the outer one in ten.

### Background work

A command sent to the background stays lit on its station after the turn that started it is over — clock hands still growing — until the task reports that it ended. A task that failed leaves the red dot.

### Several calls at once

Calls that start together fly side by side, and the station carries their number, such as `×3`.

### Errors and refusals

A red dot with a count stays on a station from an error or a refusal until your next message.

### Memory

Memory has a colour of its own:

- a **solid pulse** is a memory call;
- a **hollow pulse on a dashed line** is what a hook brought unasked.

Under the station, the plain number counts the first and `↓` the second.

### The context window

The ring around the centre fills as the session goes, with the percentage above the name. It turns amber at 70% and red at 90%. Needs the loopback proxy; see [below](#how-it-sees-copilot-work).

### A change of model

The centre and the **Model** station ring for a few seconds, and the feed gets a row such as `gpt 5.2 → gpt 5.2 high`.

### Subagents

Each subagent still at work circles the **Agents** station as a small planet on a wide orbit of its own — one dashed ring per subagent, drawn around the station, which sits far out beyond the ring — and its calls start from there. Every planet wears a hue of its own, and the legend in the corner below names each color with the short description its subagent was started with; a subagent that is done keeps its planet for a minute before it fades.

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

### Screenshots

| At work | Subagents | A hook refuses |
| --- | --- | --- |
| ![At work](docs/map-working.png) | ![Subagents](docs/map-agents.png) | ![A hook refuses](docs/map-blocked.png) |

| A change of model | After the answer | Light colours |
| --- | --- | --- |
| ![A change of model](docs/map-switch.png) | ![After the answer](docs/map-after.png) | ![Light colours](docs/map-light.png) |

## How it sees Copilot work

Two decoupled sources, both optional:

### 1. Workspace hooks

**Agentic Orbit: Install Workspace Hooks** writes `.github/hooks/hooks.json` and `.github/hooks/agentic-orbit-hook.js` into the open project. Each hook call appends one compact JSON line to a file in the OS temp folder — metadata only: tool name, ids, timings, status. The extension watches that file and turns the lines into map events.

The hook is fail-safe by design: it always exits `0` within milliseconds and answers `preToolUse` with a valid allow JSON, even when the extension is not running, so the agent is never blocked.

### 2. The loopback proxy (optional, for the context-window ring)

Point your custom model's base URL at `http://127.0.0.1:8317/v1` (see [settings](#settings)). The proxy forwards every request to your on-prem LLM unchanged — streamed, unbuffered — while reading only the token usage from the stream.

## Settings

| Setting | Default | Meaning |
| --- | --- | --- |
| `agenticOrbit.proxy.enabled` | `false` | Start the proxy on activation |
| `agenticOrbit.proxy.port` | `8317` | Loopback port |
| `agenticOrbit.proxy.targetBaseUrl` | — | Your on-prem LLM base URL, e.g. `https://llm.internal/v1` |
| `agenticOrbit.contextWindowLimit` | `128000` | Tokens the ring is full at |
| `agenticOrbit.hookEventsFile` | — | Override where hook events are read from |
| `agenticOrbit.layout` | `you-top` | `you-top` / `you-bottom` |
| `agenticOrbit.language` | `en` | `en`, `ru`, `es`, `fr`, `de`, `it` or `pt` |
| `agenticOrbit.theme` | `auto` | `auto` / `dark` / `light` |
| `agenticOrbit.motion` | `full` | `full` / `reduced` |
| `agenticOrbit.memoryServers` | `["memory"]` | MCP servers whose tools read as Memory |
| `agenticOrbit.memoryCommands` | `[]` | Shell command names that read as Memory |
| `agenticOrbit.memorySubcommands` | `[]` | Shell subcommands that read as Memory |
| `agenticOrbit.memoryPaths` | `[]` | Path fragments: a file path holding one reads as Memory |
| `agenticOrbit.memoryLabels` | `[]` | Tool relabelings as `tool=name`, e.g. `mcp__wiki__search=wiki` |

## What it shows and what it keeps

- The extension makes **no network requests**, reads **no files of yours**, calls **no model** and adds **nothing** to the conversation.
- Its rows live only for the session.
- A fault on the map never reaches a tool call or a model turn.

The same on one page: [Privacy](PRIVACY.md).

### What a label holds

Like any extension that follows tool calls, it is handed every call's whole input, including command lines and the text written to files. It takes names from that and nothing else. **A label holds a name, never content:**

- a file — the last two parts of its path;
- a web address — the host alone, without a login, password, path or query; an address that can be read two ways shows only its scheme;
- a shell command — the short description the model wrote for it, or the command's name, never the command line;
- a search — the tool's name, never the pattern or the query;
- a memory call — the tool's name, never the text or the query;
- a subagent — the short description it was started with;
- a hook's refusal — the name of the tool it stopped.

Control characters are taken out of every label before it is drawn.

## Developing

```bash
cd vscode-extension
npm install
npm run compile   # tsc + webview assets
npm run package   # → agentic-orbit-x.y.z.vsix
```

`scripts/smoke-test.sh` fires made-up events through the real hook — no real file is read, written or fetched — so you can watch every station light up at once. For a longer look, `scripts/subagent-storm.sh` runs about a minute of made-up subagent traffic — up to six planets circling the Agents station in overlapping waves.

Words live in `hooks/text.ts`; a new language is one more table there. Before you send a change, read [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
