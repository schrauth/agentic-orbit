// The route the main loop's work takes from station to station: which stops it made, and the
// legs the drawing keeps of them. Nothing here touches the engine.
import type { Entry, StationId } from '../../types'
import type { Palette } from '../palette'
import { clock, indexOf, leg, n1 } from './geometry'
import { TRAIL_HOLD_MS, TRAIL_FADE_MS } from './durations'

const TRAIL_STOPS = 7

/** The stations the main loop went through, oldest first, a station visited twice in a row counted once. */
export function routeOf(entries: readonly Entry[], max = TRAIL_STOPS): { station: StationId; at: number }[] {
  const stops: { station: StationId; at: number }[] = []
  for (const e of entries) {
    if (e.from === 'agents' || e.station === 'model') continue
    const last = stops[stops.length - 1]
    if (last !== undefined && last.station === e.station) last.at = e.startedAt
    else stops.push({ station: e.station, at: e.startedAt })
  }
  return stops.slice(-max)
}

/** Whether the main loop is thinking, inferred from the gaps between the hook's events — the host fires
 * none while it thinks. Reading the entries from the end: a call of the main loop still open ends the
 * answer, and so does the row the bare `agentStop` leaves (the `done` mark, or an aborted turn's fault);
 * the person's message is where it begins. A subagent's rows carry its id and are not the main loop's,
 * so they do not count against it. */
export function isThinking(entries: readonly Entry[]): boolean {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]
    if (e.station === 'you' && e.from === 'core' && (e.mark === 'done' || e.status === 'err')) return false
    if (e.status === 'run' && e.agentId === undefined) return false
    if (e.station === 'you' && e.from === 'inbound' && e.mark === undefined) return true
  }
  return false
}

export function trail(entries: readonly Entry[], now: number, c: Palette, isStill: boolean, shift: number): string {
  const stops = routeOf(entries)
  let out = ''
  for (let k = 1; k < stops.length; k++) {
    const from = stops[k - 1]
    const to = stops[k]
    if (from === undefined || to === undefined) continue
    const { path, end } = leg(indexOf(from.station), indexOf(to.station), shift)
    const isHead = k === stops.length - 1
    const age = now - to.at
    if (age >= TRAIL_HOLD_MS + TRAIL_FADE_MS) continue
    const opacity = n1(0.12 + (0.5 * k) / (stops.length - 1))
    // The fading is written into the drawing, so a leg goes out on time even when nothing redraws the map.
    const fade = `<animate attributeName="opacity" values="${opacity};0" begin="${clock(TRAIL_HOLD_MS - age)}" dur="${clock(TRAIL_FADE_MS)}" fill="freeze"/>`
    // The newest leg draws itself; the rest are already there.
    const drawing = isHead && !isStill
      ? ` pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1"><animate attributeName="stroke-dashoffset" values="1;0" begin="${clock(to.at - now)}" dur=".5s" fill="freeze"/>`
      : '>'
    out += `<path d="${path}" fill="none" stroke="${c.trail}" stroke-width="${isHead ? 1.5 : 1.1}" stroke-linecap="round" opacity="${opacity}"${drawing}${fade}</path>`
    if (isHead) {
      out +=
        `<circle cx="${n1(end.x)}" cy="${n1(end.y)}" r="2.4" fill="${c.trail}" opacity="${isStill ? '.85' : '0'}">` +
        (isStill ? '' : `<animate attributeName="opacity" values="0;.85" begin="${clock(to.at - now + 400)}" dur=".15s" fill="freeze"/>`) +
        `<animate attributeName="opacity" values=".85;0" begin="${clock(TRAIL_HOLD_MS - age)}" dur="${clock(TRAIL_FADE_MS)}" fill="freeze"/></circle>`
    }
  }
  return out
}
