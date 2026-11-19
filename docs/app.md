# Browser app

Agentic Orbit is a browser app: a small Node host watches the workspace hook's events file and serves the live map on a page bound to your machine's loopback only. Nothing it shows is content — names, timings and figures. Today that hook is Copilot's — the observer; a project's own guard may add a blocked line. A second agent host's hook is future work, not configuration.

## Quick start

```bash
cd app
npm install
npm run build
npm start -- --workspace <path-to-the-project-being-watched>
```

Open <http://127.0.0.1:8318>. The watched project needs a producer for the events file: the workspace hooks below, or its own hook writing the same lines (see [Hooks for your project](./hooks.md)). To install the ready-made observer from the app package:

```bash
npm start -- --install-hooks <path-to-the-project>
```

That command writes `.github/hooks/` into the project and exits. The app ships no guard: policy hooks belong to the project, and a `preToolUse` guard can report a refusal that lights the Hooks station (see [Hooks for your project](./hooks.md#guards)). Start a new Copilot session so it loads the hooks, then start the host with `--workspace`.

You can instead point directly to an events file with `--events-file <path>`; provide exactly one of `--workspace` and `--events-file`.

## Options

| Option | Meaning |
| --- | --- |
| `--workspace <path>` | Workspace whose events file to watch; its file name is derived from the workspace path |
| `--events-file <path>` | Use this events file directly instead of deriving it from a workspace |
| `--port <n>` | Page port; default `8318`, bound to loopback only |
| `--config <file>` | Read initial map setup values from a JSON file |
| `--install-hooks <dir>` | Write `.github/hooks/` into that workspace and exit |
| `--proxy <baseUrl>` | Also start the loopback proxy for context-window telemetry |
| `--proxy-port <n>` | Proxy port; default `8317` |

The config file uses the setup keys: `language`, `coreName`, `layout`, `motion`, `pace`, `theme`, `background`, `colors`, `memoryServers`, `memoryCommands`, `memorySubcommands`, `memoryPaths`, `memoryLabels`, and `contextWindowLimit`. Their meaning is in the [user guide's setup table](./usage.md#setup). Without a config file, the palette defaults to dark and the memory servers to `["memory"]`.

## Using the page

The page reconnects if the host restarts and keeps the last board while waiting. The map scales to the browser window. On a wide window, a console-style event log sits beside the map; on a narrow one, it moves below. The log shows each call separately with a timestamp, station, label and duration, follows new events while scrolled to the bottom, and holds 50–500 lines (100 by default).

The top bar opens a side menu for palette, layout, motion, pace, language and log size. The host's setup is the starting point; changes made on the page take precedence after you make them.

The running host reads the events file and binds `127.0.0.1`; it writes nothing. The `--install-hooks` option is separate and intentionally writes hook files into the selected workspace. See the [privacy policy](../PRIVACY.md) for the details of what those hooks record.

For a deterministic map preview with synthetic events, use the [browser demo](./development.md#browser-demo).
