# Agentic Orbit

You ever wondered what your multiagent setup is doing in the background?

A live map of GitHub Copilot's work: tool calls, model steps and agents pulse from the centre to their stations. Use it beside your editor in VS Code, or run the same live map in a browser without VS Code.

![Agentic Orbit showing a map and call log in the Fraunhofer light theme](docs/agenticorbit_main.png)

*Agentic Orbit showing a map and call log in the Fraunhofer light theme.*

Inspired from [lot-map](https://github.com/alexeyw/lot-map) by Aleksei Volodin.

## Run the standalone map

Watch a real Copilot session in a browser window of its own — no VS Code extension install required. The host reads the workspace hook's events file and binds to your machine only.

```bash
cd standalone
npm install
npm run build
npm start -- --workspace <path-to-the-project-being-watched>
```

Open <http://127.0.0.1:8318>. The project needs the workspace hooks installed. To install them from Standalone, run `npm start -- --install-hooks <path-to-the-project>` once, then start a new Copilot session and run the host command above.

- Keep the map full-size on a second screen or shared display.
- See every call in a console-style log, with timestamp, station, label and duration.
- Tune palette, layout, motion, pace, language and log size while the session runs.

See the [Standalone guide](docs/standalone.md) for all options and details.

## Use the VS Code extension

Build and install the extension:

```bash
cd vscode-extension
npm install
npm run compile
npm run package
code --install-extension agentic-orbit-<version>.vsix --force
```

In the project you want to watch, run **Agentic Orbit: Install Workspace Hooks**, start a **new** Copilot session, then run **Agentic Orbit: Open**. The optional context-window ring needs **Agentic Orbit: Start Loopback Proxy**.

## Learn more

- [User guide: stations, map, hooks and settings](docs/usage.md)
- [Standalone browser host](docs/standalone.md)
- [Development and visual previews](docs/development.md)
- [Privacy](PRIVACY.md)
- [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)

## License

[MIT](LICENSE)
