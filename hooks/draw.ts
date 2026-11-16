// How the board is drawn: one SVG, the agent in the centre and a station for each kind of work.
// Nothing here touches the engine. The drawing lives in ./draw/, in modules by what they draw:
// the geometry every module shares, the times things hold and fade, the effects that fly along
// the spokes, the crew's seats, the main loop's route, and the scene that puts it all together.
// This file is the face the rest of the code knows; it only passes things on.
export { drawMap, MAP_WIDTH, MAP_ASPECT } from './draw/scene'
export { routeOf } from './draw/trail'
export { AGENT_HOLD_MS, AGENT_FADE_MS, TRAIL_HOLD_MS, TRAIL_FADE_MS } from './draw/durations'
