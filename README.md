# Agentic Orbit

You ever wondered what your multiagent setup is doing in the background?

A live map of GitHub Copilot's work: tool calls, model steps and agents pulse from the centre to their stations. It runs as a browser app on your machine, beside any editor.

![Agentic Orbit showing a map and call log in the Fraunhofer light theme](docs/agenticorbit_main.png)

*Agentic Orbit showing a map and call log in the Fraunhofer light theme.*

Inspired from [lot-map](https://github.com/alexeyw/lot-map) by Aleksei Volodin.

## Run the map

Watch a real Copilot session in a browser window of its own. The host reads the workspace hook's events file and binds to your machine only.

```bash
cd app
npm install
npm run build
npm start -- --workspace <path-to-the-project-being-watched>
```

Open <http://127.0.0.1:8318>. The project needs the workspace hooks installed. To install them from the app, run `npm start -- --install-hooks <path-to-the-project>` once, then start a new Copilot session and run the host command above.

Copilot is the one producer today: the map reads the events its workspace hook writes. The app itself runs beside any editor, but no other agent host's hook exists — wiring one up is future work, not a flag.

- Keep the map full-size on a second screen or shared display.
- See every call in a console-style log, with timestamp, station, label and duration.
- Tune palette, layout, motion, pace, language and log size while the session runs.

See the [App guide](docs/app.md) for all options and details.

## Learn more

- [User guide: stations, map, hooks and settings](docs/usage.md)
- [Browser app guide](docs/app.md)
- [Development and visual previews](docs/development.md)
- [Privacy](PRIVACY.md)
- [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)

## License

[MIT](LICENSE)
