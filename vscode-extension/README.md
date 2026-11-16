# Agentic Orbit for VS Code

A live map of GitHub Copilot's work, drawn beside your editor. The map shows names,
stations, timings and figures — not prompt or tool content. The drawing, classification
and text engine is shared with the standalone browser host.

## Install

Install the packaged extension:

```bash
code --install-extension agentic-orbit-<version>.vsix --force
```

In the project you want to watch:

1. Run **Agentic Orbit: Install Workspace Hooks** from the command palette.
2. Start a **new** Copilot session so it loads the hooks.
3. Run **Agentic Orbit: Open** to open the map beside the active editor.

The context-window ring is optional and needs the loopback proxy. Run **Agentic Orbit: Start Loopback Proxy**, or enable `agenticOrbit.proxy.enabled`.

## Commands

- **Agentic Orbit: Open** — open the map panel.
- **Agentic Orbit: Install Workspace Hooks** — install the project hooks.
- **Agentic Orbit: Start Loopback Proxy** — start the optional local proxy.

For the station guide, settings, hook and proxy details, see the [user guide](https://github.com/schrauth/agentic-orbit/blob/main/docs/usage.md). For data handling, see the [privacy policy](https://github.com/schrauth/agentic-orbit/blob/main/PRIVACY.md).

## Build from source

```bash
npm ci
npm test
npm run package
```
