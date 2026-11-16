// The map's geometry: where the stations sit, how the routes bend, and the small helpers every
// drawing module shares. Nothing here touches the engine.
import type { StationId } from '../../types'
import { STATIONS } from '../setup'

export const W = 900
export const H = 845
/** The width the map is drawn at, in CSS pixels, for the pane to scale it to. */
export const MAP_WIDTH = W
/** Height over width of the drawing, for a surface that sizes it itself. */
export const MAP_ASPECT = H / W
export const CX = 450
export const CY = 412
const RX = 248
const RY = 237
/** The agents station sits far out beyond the ring, so the wide orbits of its planets never touch its neighbours. */
const AGENT_RX = 322
const AGENT_RY = 324
export const NODE = 24
export const CORE = 44
/** A subagent's planet: smaller than a station, big enough for a glyph of its own. */
export const PLANET = 10.5
/** A subagent's orbit around the agents station: the innermost ring's reach, and the step between the rings. */
const ORBIT_FIRST = 55
const ORBIT_STEP = 14
/** How many rings close to the station seat one subagent each; every subagent beyond them shares the outer ring. */
export const INNER_SEATS = 5
/** The outer ring's reach: one step past the last inner ring, still clear of the map's rim in both layouts. */
const ORBIT_OUTER = 125
/** The places the outer ring hands out: with the five inner rings, a seat for every subagent the board keeps. */
export const OUTER_SLOTS = 7
/** Where spokes and pulses meet the core: outside the context ring. */
export const HUB = CORE + 8
/** One lap of a planet around the agents station: the innermost ring is the slowest, each one a little faster;
 * the outer ring, farthest out, takes the longest of all. */
export const orbitLap = (ring: number): number => (ring >= INNER_SEATS ? 42_000 : 34_000 - ring * 3_500)

export type Point = { x: number; y: number }
/** The angle of place `i` on a ring turned `shift` places. */
const turn = (i: number, shift: number): number => ((i + shift) * 2 * Math.PI) / STATIONS.length
const at = (a: number, f = 1, own?: { rx: number; ry: number }): Point => ({ x: CX + (own?.rx ?? RX) * f * Math.sin(a), y: CY - (own?.ry ?? RY) * f * Math.cos(a) })
export const place = (i: number, shift: number): Point => at(turn(i, shift), 1, STATIONS[i]?.id === 'agents' ? { rx: AGENT_RX, ry: AGENT_RY } : undefined)
export const indexOf = (id: StationId): number => STATIONS.findIndex(s => s.id === id)

export const n1 = (v: number): string => (Math.round(v * 10) / 10).toString()
/** A moment on the drawing's own clock, which starts at zero each time it is drawn; a past moment is negative. */
export const clock = (ms: number): string => `${(ms / 1000).toFixed(3)}s`

/** Where a straight line from `from` to `to` meets the circle of radius `r` around `from`. */
export function edge(from: Point, to: Point, r: number): Point {
  const d = Math.hypot(to.x - from.x, to.y - from.y) || 1
  return { x: from.x + ((to.x - from.x) * r) / d, y: from.y + ((to.y - from.y) * r) / d }
}

/** The same line moved sideways, so that several pulses on one spoke fly side by side. */
export function aside(a: Point, b: Point, off: number): [Point, Point] {
  const d = Math.hypot(b.x - a.x, b.y - a.y) || 1
  const dx = (-(b.y - a.y) * off) / d
  const dy = ((b.x - a.x) * off) / d
  return [{ x: a.x + dx, y: a.y + dy }, { x: b.x + dx, y: b.y + dy }]
}

/** A subagent's own orbit: the inner rings one step apart, the outer ring a stretch beyond the last of them. */
export const orbitRadius = (ring: number): number => (ring < INNER_SEATS ? ORBIT_FIRST + ring * ORBIT_STEP : ORBIT_OUTER)

/** The point on its ring a subagent's planet sits at. */
export const orbitDot = (ring: number, base: Point, angle: number): Point => ({ x: base.x + orbitRadius(ring) * Math.sin(angle), y: base.y - orbitRadius(ring) * Math.cos(angle) })

/** How far from the core a leg bends, by how many stations apart its ends are: far enough in to clear the labels under the nodes, far enough out to clear the core. */
const BEND = [0.5, 0.5, 0.4, 0.45, 0.55, 0.75]

/** The way from one station to another: a curve through the room between the core and the ring. */
export function leg(i: number, j: number, shift: number): { path: string; end: Point } {
  const n = STATIONS.length
  let steps = (((j - i) % n) + n) % n
  if (steps > n / 2) steps -= n
  const bend = at(turn(i + steps / 2, shift), BEND[Math.abs(steps)] ?? 0.5)
  const a = edge(place(i, shift), bend, NODE + 4)
  const b = edge(place(j, shift), bend, NODE + 4)
  return { path: `M${n1(a.x)} ${n1(a.y)}Q${n1(bend.x)} ${n1(bend.y)} ${n1(b.x)} ${n1(b.y)}`, end: b }
}
