# Development

For contributor expectations and the full CI check list, see [CONTRIBUTING.md](../CONTRIBUTING.md).

## Build and test the extension

```bash
cd vscode-extension
npm install
npm run compile
npm test
npm run package
```

The smoke scripts send synthetic events through the real workspace hook. They append those events to the configured events file, but do not execute the command strings or access real project files. Set `AGENTIC_ORBIT_EVENTS_FILE` to an isolated path if you do not want them to appear in the current map.

```bash
AGENTIC_ORBIT_EVENTS_FILE=/tmp/agentic-orbit-smoke.jsonl scripts/smoke-test.sh
AGENTIC_ORBIT_EVENTS_FILE=/tmp/agentic-orbit-storm.jsonl scripts/subagent-storm.sh
```

The smoke test writes 26 events. The longer storm writes 45 events across seven subagents and takes about a minute, with varied simulated tool durations.

## Browser demo

Use the browser demo to inspect drawing and layout changes without installing the extension or producing live events:

```bash
cd demo
npm install
npm run watch     # builds and serves http://localhost:8000
```

It replays five synthetic scenarios: a calm turn, a ten-planet subagent storm, a long subagent project, errors and refusals, and a filling context window. Its clock can be paused, reset and run from 0.25× to 8×; theme, layout, motion, pace and language can be changed while it runs, and the board state can be copied as JSON.

The drawing uses the real shared code from `hooks/`; `demo/engine.ts` feeds synthetic events on a synthetic clock. The demo reads and writes no project events file and is not included in the extension package.

## Live browser map

To see real session activity in a browser without VS Code, use the [browser app](./app.md). Unlike the demo, it reads the events file written by the workspace hook.

Words and translations live in `hooks/text.ts`; adding a language means adding another table there.
