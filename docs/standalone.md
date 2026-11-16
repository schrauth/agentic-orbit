# Standalone browser map

The standalone host shows the same live map as the VS Code panel in a browser window, without VS Code. It watches the workspace hook's events file and serves the page on loopback only.

## Quick start

```bash
cd standalone
npm install
npm run build
npm start -- --workspace <path-to-the-project-being-watched>
```

Open <http://127.0.0.1:8318>. The watched project needs the workspace hooks installed. To install them from the standalone package:

```bash
npm start -- --install-hooks <path-to-the-project>
```

That command writes `.github/hooks/` into the project and exits. Start a new Copilot session so it loads the hooks, then start the host with `--workspace`.

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

The config file uses the setup keys shared with the extension: `language`, `coreName`, `layout`, `motion`, `pace`, `theme`, `background`, `colors`, `memoryServers`, `memoryCommands`, `memorySubcommands`, `memoryPaths`, `memoryLabels`, and `contextWindowLimit`. Without a config file, the palette defaults to dark and the memory servers to `["memory"]`.

## Using the page

The page reconnects if the host restarts and keeps the last board while waiting. The map scales to the browser window. On a wide window, a console-style event log sits beside the map; on a narrow one, it moves below. The log shows each call separately with a timestamp, station, label and duration, follows new events while scrolled to the bottom, and holds 50–500 lines (100 by default).

The top bar opens a side panel for palette, layout, motion, pace, language and log size. The host's setup is the starting point; changes made on the page take precedence after you make them.

The running host reads the events file and binds `127.0.0.1`; it writes nothing. The `--install-hooks` option is separate and intentionally writes hook files into the selected workspace. See the [privacy policy](../PRIVACY.md) for the details of what those hooks record.

For a deterministic map preview with synthetic events, use the [browser demo](./development.md#browser-demo).
