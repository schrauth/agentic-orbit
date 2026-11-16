// The crew's seats: the one owner of the mutable state a drawing keeps from one frame to the
// next — which subagent holds which ring, which place on it, and which hue. Nothing here touches the engine.
import type { Palette } from '../palette'
import { n1, INNER_SEATS, OUTER_SLOTS, orbitRadius, PLANET } from './geometry'
import type { Point } from './geometry'

/** The seat a subagent holds while it is on the map: its ring, its place on that ring, and the hue its planet wears. */
export type Seat = { ring: number; slot: number; hue: number }
/** The seats subagents hold, kept from one drawing to the next: a planet keeps its ring, its place on it and its
 * hue for as long as it is on the map, whatever else the crew does. Keyed by the agent's id. */
const seats = new Map<string, Seat>()
/** How many hues have been handed out past the last free one, for a crew too large for all-distinct hues. */
let hueHandouts = 0
/** Give each subagent on the map its seat, and take back the seats of those that have fully faded out:
 * the first four the inner rings, one each, the rest a place on the outer ring. A seat becomes free only
 * once its holder is gone from the map, and a holder of the outer ring never moves inward. */
export function seatCrew(crew: readonly { id: string }[]): void {
  const onMap = new Set(crew.map(s => s.id))
  for (const id of [...seats.keys()]) if (!onMap.has(id)) seats.delete(id)
  for (const agent of crew) {
    if (seats.has(agent.id)) continue
    const held = [...seats.values()]
    const ring = Array.from({ length: INNER_SEATS }, (_, r) => r).find(r => !held.some(s => s.ring === r))
    const slot = Array.from({ length: OUTER_SLOTS }, (_, t) => t).find(t => !held.some(s => s.ring === INNER_SEATS && s.slot === t)) ?? 0
    const hue = Array.from({ length: CREW_HUES.length }, (_, h) => h).find(h => !held.some(s => s.hue === h)) ?? hueHandouts++ % CREW_HUES.length
    seats.set(agent.id, { ring: ring ?? INNER_SEATS, slot, hue })
  }
}
/** The seat a subagent holds, if it is on the map. */
export function seatOf(id: string | undefined): Seat | undefined {
  return id === undefined ? undefined : seats.get(id)
}
/** A seat's fixed share of its ring: the inner rings spread their four places evenly, the outer ring its eight.
 * The share is the seat's own, not the crew's: a planet keeps it whatever else joins or leaves. */
export const seatShare = (seat: Seat): number => (seat.ring < INNER_SEATS ? (seat.ring + 0.5) / INNER_SEATS : (seat.slot + 0.5) / OUTER_SLOTS)
/** The angle a seat's planet is at on its ring at a given moment, as the drawing's own clock sees it:
 * the same phase the ring's own rotation is in, so what rides the planet meets it exactly. */
export const seatAngle = (seat: Seat, when: number, lap: number): number => {
  const phase = (((((when + seatShare(seat) * lap) % lap) + lap) % lap) / lap) * 2 * Math.PI
  return seat.ring % 2 === 0 ? phase : -phase
}
/** The drawn ring of one subagent's orbit, dashed like the core's contours, but firm enough to read as a path. */
export const orbitRing = (ring: number, base: Point, c: Palette): string =>
  `<circle cx="${n1(base.x)}" cy="${n1(base.y)}" r="${n1(orbitRadius(ring))}" fill="none" stroke="${c.line}" stroke-width="2" stroke-dasharray="3 5.5" opacity=".8"/>`
/** The palette places a subagent's planet can wear, handed out one each while the crew is small enough. */
export const CREW_HUES: (keyof Palette)[] = ['crew0', 'crew1', 'crew2', 'crew3', 'crew4', 'crew5']
/** A subagent's planet: a node in the stations' own shape, filled with the hue of its seat,
 * with a small ring that reads the same from any side, drawn on the ground it stands out from.
 * While its agent works, a halo of its own hue pulses around it; a planet lately over sits still. */
export const planet = (p: Point, c: Palette, hue: string, isWorking: boolean, isStill: boolean): string => {
  const halo =
    !isWorking
      ? ''
      : isStill
        ? `<circle cx="${n1(p.x)}" cy="${n1(p.y)}" r="${PLANET + 4}" fill="none" stroke="${hue}" stroke-width="1.2" opacity=".35"/>`
        : `<circle cx="${n1(p.x)}" cy="${n1(p.y)}" r="${PLANET + 1}" fill="none" stroke="${hue}" stroke-width="1.3" opacity="0">` +
          `<animate attributeName="r" values="${PLANET + 1};${PLANET + 6};${PLANET + 1}" dur="2.4s" repeatCount="indefinite"/>` +
          `<animate attributeName="opacity" values=".55;.12;.55" dur="2.4s" repeatCount="indefinite"/></circle>`
  return (
    `${halo}<circle cx="${n1(p.x)}" cy="${n1(p.y)}" r="${PLANET}" fill="${hue}" stroke="${c.line}" stroke-width="1.2"/>` +
    `<path transform="translate(${n1(p.x)} ${n1(p.y)})" d="M-2.8 0a2.8 2.8 0 1 0 5.6 0a2.8 2.8 0 1 0 -5.6 0" fill="none" stroke="${c.ground}" stroke-width="1.25" stroke-linecap="round"/>`
  )
}
