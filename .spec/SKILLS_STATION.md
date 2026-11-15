# Skills Station on Copilot

**Status:** Accepted — specced, not implemented. Written by the Architect on
2026-11-15 after the design discussion in chat; the person confirmed the
direction (reactive only, name unchanged). When implemented, this spec is
the record of what the Skills station means on Copilot.

**Requirement:** The Skills station should truthfully show Copilot's
extendable surface — skill invocations and tool discovery — as they happen.

## The fact that shapes everything

The station is fed by tool-call events alone (ADR-001: no new hook events,
no new data paths). The tool name Copilot actually sends for a skill
invocation is `skill`, with the argument `skill` holding the skill's name —
verified in this project's own session log on 2026-11-15: one call,
`skill` with `{skill: "troubleshoot"}`. None of the names the port listens
for (`run_skill`, `use_skill`, `list_skills`, `search_tools`) has appeared
in a real session; the first two are aliases kept defensively, the last two
are the only discovery calls mapped so far. As it stands, a skill
invocation falls through the classifier and pulses **Model**, not Skills.

The broader catalogue calls of the Claude Code original (plugins,
connectors, MCP registry) do not exist in Copilot's stream. The station
cannot show more than Copilot sends.

## Decisions

1. **Reactive only.** The station lights on real calls, nothing else. No
   presence or availability display: Copilot fires no hook for it, and a
   new data path (proxy extension or in-process reading) would exist only
   to make a station glow — against the keep-it-simple principle.
2. **The name stays "Skills"** in every language the map speaks.
3. **Coverage:** skill invocation (label = the skill's name, ADR-002) and
   discovery calls, as they appear in real sessions.

## The change

In `classifyCopilot.ts`, the Skills section gains the real name:

- `case 'skill':` — label `str(input.skill)` when present, else `t.skill`.
- `run_skill` / `use_skill` stay as defensive aliases (same label rule).
- `list_skills` / `search_tools` stay mapped to `t.loadingTools`.

No hook, schema, type, settings or README change: the station's row already
reads "skills and tool search", and `StationId` already carries `'skills'`.

## Acceptance criteria

- A `skill` invocation pulses the Skills station, labelled with the skill's
  name alone (ADR-002).
- The aliases classify the same way; a session without skill calls shows
  the station dark, as before.
- No new hook events, no event schema change, no settings surface change.
- Type checks of the extension and the demo (both compile the classifier)
  stay green.
