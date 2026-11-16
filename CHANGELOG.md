# Changelog

## Unreleased

- The repository sheds its ballast: stale build artifacts and tool state (`.DS_Store`, an old packaged `.vsix`, the `.kiro/` directory) are gone from the working tree, and `.kiro/` is ignored so it never comes back.
- The map's options no longer carry the retired terminal renderer's settings: `textSize`, `terminalView` and `cellShape` are gone from the shared `Setup`, which now holds only what the map reads.
- The shared helpers shed four exports nothing called anymore: `firstLine` and `memoryIds` from `classify`, `taskOf` and `taskNotice` from `feed`, along with their detour through the `map` re-export hub.
- Twelve words the map never shows are gone from all seven language tables — the ones only the retired terminal panels ever read — and the tables' header no longer speaks of a manifest called `plugin.json`.
- The background-task experiment that never ran is gone: `background()`, `settle()` and every read of an `Entry.task` that no code could ever write, including the shared contract's field.
- The `map` hub that only handed its neighbors' exports on is deleted; the demo's engine now reads `shortModel` straight from `classify`.
- The `HookEvent` type no longer claims fields the hook never writes: `command` and `promptTokens` are gone; the wire format's real fields stay.
- The panel class carries the project's own name now: `LotMapPanel` is `AgenticOrbitPanel`, the last "mod" wordings say "extension", and the issue template's security link finally points at this repository instead of its terminal ancestor.
- The smoke test and the subagent storm speak English end to end, and both scripts now honor `AGENTIC_ORBIT_EVENTS_FILE` so a run never scribbles into the live event log.
- Both `tsconfig.json` files include whole directories instead of every file by name, so a new hook or source file joins the build without a config edit.
- Micro-hygiene: a stray space leaves a proxy string comparison, the file watcher's reader is a `const`, and the counts row lookup is null-checked like its siblings instead of asserted.
- The `Board` contract sheds four fields no code ever wrote — `pushed`, `open`, `minimized`, `zoom` — and the memory legend shows the plain asked-for count instead of a pushed/asked split that could never appear.
- The zoom ladder lives in one place now: `hooks/view.ts` exports the ten widths, and the panel and the demo both read them there.
- The demo's language selector reads `LANGUAGES` from the shared text module, so adding a language means adding a table — the selector follows on its own.
- Settings now reach an open map: the panel builds its setup per send instead of freezing the first one, the extension builds one per hook event, and a settings change pokes the open panel so labels and theme switch live.
- The now-line meter is built once: `hooks/view.ts` renders what `nowParts` already computes instead of rebuilding the same string with a second, subtly different model-shortening rule.
- The hooks manifest lives in its own module as named, testable data; `installHooks` just writes it, and a test pins every event's presence.

- The event → board translation lives in one shared, VS Code-free module — `vscode-extension/src/eventApplier.ts` — so the demo now replays exactly what the extension host performs, parking subagent names included; the `HookEvent` wire type moved to the shared `types` so the demo can read it without the host's Node-only watcher.

- The 634-line `hooks/draw.ts` is split into six modules under `hooks/draw/` — the geometry every drawing shares, the times things hold and fade, the effects that fly along the spokes, the crew's seats, the main loop's route, and the scene that puts it all together — with `hooks/draw.ts` itself kept as the one face the rest of the code knows. A pure move: every line of drawing logic is unchanged, and the SVG the map renders is byte-for-byte what it was.

- The demo's five hand-written scenarios — a calm turn, a storm of subagents, a subagent project, a run of errors and refusals, a context that fills up — moved into their own `demo/scenarios.ts`; the engine keeps the fake clock and the shared translation, and the demo page now reads the scenarios straight from the module that owns them.

- The extension's front door is a table of contents again: reading the settings, installing the hooks and starting the proxy each live in their own module — `config.ts`, `installHooks.ts`, `proxyCommand.ts` — and `extension.ts` is down to the wiring: the three commands, the watcher, and the state the map is drawn from.

- The README was brought back in step with the extension as it is: the subagents' seats (five inner rings and one wide outer ring they share), the `coreName`, `background` and `colors` settings, the proxy command, and the three screenshots that had no place in it yet. What the hook pipeline does not report yet — the Browser station, the Hooks station, memory a hook brought unasked, calls that outlive their turn — now says so plainly instead of describing it as though it happened.

- The project's own agents are now part of the repository: the five generic definitions under `.github/agents/` — Architect, Builder, Memory & ADR, Reviewer and Version Control — are tracked instead of ignored, so a fresh clone carries the team that works on it.
- Real Copilot calls are paired up again: the telemetry hook now reads the call id, the tool name and the agent id from both the flat and the array shape the host sends, and takes a tool call's short description from its arguments where the host puts it. Tool rows close when their call ends instead of lingering. A spawning subagent's planet keeps its true name after all: a launch parks the description under its call id, the child's first own call claims the oldest parked name in launch order, a failed launch hands its name back, and the end of the turn clears whatever was never claimed.
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
