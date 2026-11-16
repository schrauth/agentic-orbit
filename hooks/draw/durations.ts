// The times the drawing lives by: how long each thing holds, and how long it takes to fade.
// One module so the fade helpers, the board and the scene read the same numbers.
/** How long a subagent's planet keeps circling after its loop is over, and how long it then takes to go out. */
export const AGENT_HOLD_MS = 60_000
export const AGENT_FADE_MS = 20_000
/** A leg of the route stays for a while after it was drawn, then fades: the route shows where the work is going, and the spokes keep where it went. */
export const TRAIL_HOLD_MS = 40_000
export const TRAIL_FADE_MS = 20_000
