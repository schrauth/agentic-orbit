# Changelog

## Unreleased

- The demo grows a second long example, **Subagent project**: a made-up working session of some two and a half minutes — the main agent reading and editing between its own model steps while a dozen subagents come and go in overlapping waves, one tripping over a page that will not answer, an answer, a follow-up, and a second crew taking the orbits the first have let go of.
- Subagents keep their seat in the sky: the first five circle the five inner orbits, everyone after that shares one wide outer orbit, and no planet ever slides to another place when the crew changes. A seat only opens up again once its planet has fully faded, and the ones on the outer orbit stay there until they go — the inner ones never call them back. When more than six agents crowd the map, their hues now start cycling instead of a color being taken from a planet that is still in the sky.
- A planet no longer blinks back to full strength while it fades out: mid-fade the drawing already sits at the opacity the fade has reached, the same cure the planet's place on its orbit got.
- The orbit paths read stronger, the whole map a good tenth larger, and the Agents station sits farther out with it. The legend under the map grew with the map.
- The map moves a bit slower: pulses, ripples, the station beat and the core's breath all take a little longer.
- The **You** station is now called **Operator** — in every language the map speaks.
- New setting `agenticOrbit.pace`: with `slow`, every flight, ripple and fade on the map takes twice as long. The demo carries a pace switch of its own beside the motion one.
- A planet no longer flashes back to the top of its orbit for a frame whenever the map is redrawn: the rotation now starts from the angle the orbit is really in, so the very first frame already shows the planet where it belongs.
- A browser demo under `demo/` runs the extension's own drawing on fake events, so the map's design can be worked on and judged without packaging and installing the extension. It ships nothing and changes nothing of the extension itself.
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
