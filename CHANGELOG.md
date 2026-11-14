# Changelog

## Unreleased

- Subagent planets turn much slower, their orbit rings sit closer together, and a subagent that is done keeps circling for a minute before a quiet fade.
- Each subagent's planet wears a hue of its own, and a legend under the map names every color with the short description its subagent was started with. The orbit paths read firmer, the planets are a touch smaller, and while an agent works its planet pulses in its own hue — a lingering one sits still.
- A beam that leaves a subagent's planet now truly rides it along its orbit (it had clung to the wrong phase of the lap), drawn from twice as many positions so it hugs the arc, and the innermost orbit moved farther out so nothing crowds the station.

## 0.2.0

- The **Agents** station now sits far out beyond the ring of stations, and each subagent still at work circles it as a small planet in the stations' own style — one wide dashed orbit per subagent, with a ring glyph that reads the same from any side.
- The map grew with it: the drawing is larger, so the wide orbits never touch the neighbouring stations or leave the picture.

## 0.1.0

- The first release of Agentic Orbit: a VS Code extension that draws a live map of GitHub Copilot's work beside the editor — tool calls, subagents, skills and refusals as pulses between stations, with a feed of the last calls under it.
- Workspace hooks feed the map: `Agentic Orbit: Install Workspace Hooks` writes `.github/hooks/hooks.json` and the fail-safe hook script into the open project.
- An optional loopback proxy reads the token usage from your on-prem model's stream to fill the context-window ring.
- The drawing, classification and text engine was ported from the [lot-map](https://github.com/alexeyw/lot-map) project.
