# Changelog

## 0.1.0

- The first release of Agentic Orbit: a VS Code extension that draws a live map of GitHub Copilot's work beside the editor — tool calls, subagents, skills and refusals as pulses between stations, with a feed of the last calls under it.
- Workspace hooks feed the map: `Agentic Orbit: Install Workspace Hooks` writes `.github/hooks/hooks.json` and the fail-safe hook script into the open project.
- An optional loopback proxy reads the token usage from your on-prem model's stream to fill the context-window ring.
- The drawing, classification and text engine was ported from the [lot-map](https://github.com/alexeyw/lot-map) project.
