// How the board is drawn: one SVG, the agent in the centre and a station for each kind of work.
// Nothing here touches the engine.
import type { Board, Entry, StationId } from '../types'
import { shortModel, modelFamily } from './classify'
import { DARK, LIGHT, lightRules } from './palette'
import type { Palette } from './palette'
import { STATIONS } from './setup'
import type { Setup } from './setup'
import type { Strings } from './text'

const W = 900
const H = 845
/** The width the map is drawn at, in CSS pixels, for the pane to scale it to. */
export const MAP_WIDTH = W
/** Height over width of the drawing, for a surface that sizes it itself. */
export const MAP_ASPECT = H / W
const CX = 450
const CY = 412
const RX = 248
const RY = 237
/** The agents station sits far out beyond the ring, so the wide orbits of its planets never touch its neighbours. */
const AGENT_RX = 322
const AGENT_RY = 324
const NODE = 24
const CORE = 44
/** A subagent's planet: smaller than a station, big enough for a glyph of its own. */
const PLANET = 10.5
/** A subagent's orbit around the agents station: the innermost ring's reach, and the step between the rings. */
const ORBIT_FIRST = 55
const ORBIT_STEP = 14
/** How many rings close to the station seat one subagent each; every subagent beyond them shares the outer ring. */
const INNER_SEATS = 5
/** The outer ring's reach: one step past the last inner ring, still clear of the map's rim in both layouts. */
const ORBIT_OUTER = 125
/** The places the outer ring hands out: with the five inner rings, a seat for every subagent the board keeps. */
const OUTER_SLOTS = 7
/** How long a subagent's planet keeps circling after its loop is over, and how long it then takes to go out. */
export const AGENT_HOLD_MS = 60_000
export const AGENT_FADE_MS = 20_000
/** One lap of a planet around the agents station: the innermost ring is the slowest, each one a little faster;
 * the outer ring, farthest out, takes the longest of all. */
const orbitLap = (ring: number): number => (ring >= INNER_SEATS ? 42_000 : 34_000 - ring * 3_500)
/** Where spokes and pulses meet the core: outside the context ring. */
const HUB = CORE + 8

const FONT = 'font-family="SF Mono, ui-monospace, Menlo, monospace"'

const PULSE_MS = 950
const RIPPLE_MS = 540
const GLOW_MS = 3800
const ALARM_MS = 6000
const SWITCH_MS = 8000
const DONE_MS = 1250
/** How slowly the thinking ring breathes around the core: a rhythm of its own, far from any call's beat. */
const THINK_MS = 5000
const TRAIL_STOPS = 7
/** A leg of the route stays for a while after it was drawn, then fades: the route shows where the work is going, and the spokes keep where it went. */
export const TRAIL_HOLD_MS = 40_000
export const TRAIL_FADE_MS = 20_000

type Point = { x: number; y: number }
/** The angle of place `i` on a ring turned `shift` places. */
const turn = (i: number, shift: number): number => ((i + shift) * 2 * Math.PI) / STATIONS.length
const at = (a: number, f = 1, own?: { rx: number; ry: number }): Point => ({ x: CX + (own?.rx ?? RX) * f * Math.sin(a), y: CY - (own?.ry ?? RY) * f * Math.cos(a) })
const place = (i: number, shift: number): Point => at(turn(i, shift), 1, STATIONS[i]?.id === 'agents' ? { rx: AGENT_RX, ry: AGENT_RY } : undefined)
const indexOf = (id: StationId): number => STATIONS.findIndex(s => s.id === id)

const n1 = (v: number): string => (Math.round(v * 10) / 10).toString()
/** A moment on the drawing's own clock, which starts at zero each time it is drawn; a past moment is negative. */
const clock = (ms: number): string => `${(ms / 1000).toFixed(3)}s`

/** Where a thing is in its fade at this moment: the opacity it truly sits at, and the piece of the fade
 * still ahead of it. Both are written into the drawing as it stands, so a redraw never flashes the
 * thing back to full strength for the one frame before the animation takes over — the same cure the
 * planet's place on its orbit got. The fade never begins in the past; mid-fade, what remains of it
 * runs from the opacity it has reached down to zero, in the time it has left. */
function fadeAt(age: number, holdMs: number, fadeMs: number): { opacity: number; begin: number; dur: number } {
  if (age < holdMs) return { opacity: 1, begin: holdMs - age, dur: fadeMs }
  const remain = Math.max(0, holdMs + fadeMs - age)
  return { opacity: remain / fadeMs, begin: 0, dur: remain }
}

/** Where a straight line from `from` to `to` meets the circle of radius `r` around `from`. */
function edge(from: Point, to: Point, r: number): Point {
  const d = Math.hypot(to.x - from.x, to.y - from.y) || 1
  return { x: from.x + ((to.x - from.x) * r) / d, y: from.y + ((to.y - from.y) * r) / d }
}

/** The same line moved sideways, so that several pulses on one spoke fly side by side. */
function aside(a: Point, b: Point, off: number): [Point, Point] {
  const d = Math.hypot(b.x - a.x, b.y - a.y) || 1
  const dx = (-(b.y - a.y) * off) / d
  const dy = ((b.x - a.x) * off) / d
  return [{ x: a.x + dx, y: a.y + dy }, { x: b.x + dx, y: b.y + dy }]
}

/** A subagent's own orbit: the inner rings one step apart, the outer ring a stretch beyond the last of them. */
const orbitRadius = (ring: number): number => (ring < INNER_SEATS ? ORBIT_FIRST + ring * ORBIT_STEP : ORBIT_OUTER)
/** The seat a subagent holds while it is on the map: its ring, its place on that ring, and the hue its planet wears. */
type Seat = { ring: number; slot: number; hue: number }
/** The seats subagents hold, kept from one drawing to the next: a planet keeps its ring, its place on it and its
 * hue for as long as it is on the map, whatever else the crew does. Keyed by the agent's id. */
const seats = new Map<string, Seat>()
/** How many hues have been handed out past the last free one, for a crew too large for all-distinct hues. */
let hueHandouts = 0
/** Give each subagent on the map its seat, and take back the seats of those that have fully faded out:
 * the first five the inner rings, one each, the rest a place on the outer ring. A seat becomes free only
 * once its holder is gone from the map, and a holder of the outer ring never moves inward. */
function seatCrew(crew: readonly { id: string }[]): void {
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
/** A seat's fixed share of its ring: the inner rings spread their five places evenly, the outer ring its seven.
 * The share is the seat's own, not the crew's: a planet keeps it whatever else joins or leaves. */
const seatShare = (seat: Seat): number => (seat.ring < INNER_SEATS ? (seat.ring + 0.5) / INNER_SEATS : (seat.slot + 0.5) / OUTER_SLOTS)
/** The angle a seat's planet is at on its ring at a given moment, as the drawing's own clock sees it:
 * the same phase the ring's own rotation is in, so what rides the planet meets it exactly. */
const seatAngle = (seat: Seat, when: number, lap: number): number => {
  const phase = (((((when + seatShare(seat) * lap) % lap) + lap) % lap) / lap) * 2 * Math.PI
  return seat.ring % 2 === 0 ? phase : -phase
}
/** The point on its ring a subagent's planet sits at. */
const orbitDot = (ring: number, base: Point, angle: number): Point => ({ x: base.x + orbitRadius(ring) * Math.sin(angle), y: base.y - orbitRadius(ring) * Math.cos(angle) })
/** The drawn ring of one subagent's orbit, dashed like the core's contours, but firm enough to read as a path. */
const orbitRing = (ring: number, base: Point, c: Palette): string =>
  `<circle cx="${n1(base.x)}" cy="${n1(base.y)}" r="${n1(orbitRadius(ring))}" fill="none" stroke="${c.line}" stroke-width="2" stroke-dasharray="3 5.5" opacity=".8"/>`
/** The palette places a subagent's planet can wear, handed out one each while the crew is small enough. */
const CREW_HUES: (keyof Palette)[] = ['crew0', 'crew1', 'crew2', 'crew3', 'crew4', 'crew5']
/** A subagent's planet: a node in the stations' own shape, filled with the hue of its seat,
 * with a small ring that reads the same from any side, drawn on the ground it stands out from.
 * While its agent works, a halo of its own hue pulses around it; a planet lately over sits still. */
const planet = (p: Point, c: Palette, hue: string, isWorking: boolean, isStill: boolean): string => {
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

/** A pulse with a short tail behind it. A hollow one is a signal nobody asked for. */
function pulse(a: Point, b: Point, color: string, age: number, radius: number, isHollow: boolean, pulseMs: number): string {
  // A negative begin carries on where the last drawing left off, so a redraw never restarts a flight.
  const path = `M${n1(a.x)} ${n1(a.y)}L${n1(b.x)} ${n1(b.y)}`
  let out = ''
  for (let k = isHollow ? 0 : 2; k >= 0; k--) {
    const timing = `begin="${clock(k * 45 - age)}" dur="${clock(pulseMs)}" fill="freeze"`
    const peak = n1(1 - 0.36 * k)
    const paint = isHollow ? `fill="none" stroke="${color}" stroke-width="1.4"` : `fill="${color}"`
    out +=
      `<circle r="${n1(radius * (1 - 0.27 * k))}" ${paint} opacity="0">` +
      `<animateMotion path="${path}" ${timing}/>` +
      `<animate attributeName="opacity" values="${peak};${peak};0" keyTimes="0;.82;1" ${timing}/>` +
      `</circle>`
  }
  return out
}

/** A ring that spreads from where a pulse lands, at the moment it lands. */
function ripple(p: Point, r: number, color: string, age: number, rippleMs: number, pulseMs: number): string {
  const timing = `begin="${clock(pulseMs - age)}" dur="${clock(rippleMs)}" fill="freeze"`
  return (
    `<circle cx="${n1(p.x)}" cy="${n1(p.y)}" r="${r}" fill="none" stroke="${color}" stroke-width="1.2" opacity="0">` +
    `<animate attributeName="r" values="${r};${r + 12}" ${timing}/>` +
    `<animate attributeName="opacity" values=".7;0" ${timing}/></circle>`
  )
}

function beam(a: Point, b: Point, color: string, age: number, isDashed: boolean, glowMs: number): string {
  return (
    `<line x1="${n1(a.x)}" y1="${n1(a.y)}" x2="${n1(b.x)}" y2="${n1(b.y)}" stroke="${color}" stroke-width="1.4"${isDashed ? ' stroke-dasharray="3 4"' : ''} opacity="0">` +
    `<animate attributeName="opacity" values=".75;0" begin="${clock(-age)}" dur="${clock(glowMs / 2)}" fill="freeze"/></line>`
  )
}

/** A beam whose near end rides a planet: the line is sampled along the orbit while the beam lives,
 * so it follows the planet instead of hanging where the planet was when the drawing was made.
 * A leg of the planet's own lap, walked between the beam's first and last moment. */
function orbitBeam(
  lap: number,
  phaseAt: (when: number) => Point,
  b: Point,
  color: string,
  age: number,
  isDashed: boolean,
  glowMs: number,
): string {
  const life = glowMs / 2
  const steps = 16
  const from = -age
  const to = from + life
  const xs: string[] = []
  const ys: string[] = []
  for (let s = 0; s <= steps; s++) {
    const p = phaseAt(from + (s * life) / steps)
    xs.push(n1(p.x))
    ys.push(n1(p.y))
  }
  return (
    `<line x1="${xs[0]}" y1="${ys[0]}" x2="${n1(b.x)}" y2="${n1(b.y)}" stroke="${color}" stroke-width="1.4"${isDashed ? ' stroke-dasharray="3 4"' : ''} opacity="0">` +
    `<animate attributeName="x1" values="${xs.join(';')}" begin="${clock(from)}" dur="${clock(life)}" fill="freeze"/>` +
    `<animate attributeName="y1" values="${ys.join(';')}" begin="${clock(from)}" dur="${clock(life)}" fill="freeze"/>` +
    `<animate attributeName="opacity" values=".75;0" begin="${clock(from)}" dur="${clock(life)}" fill="freeze"/></line>`
  )
}

/** How far from the core a leg bends, by how many stations apart its ends are: far enough in to clear the labels under the nodes, far enough out to clear the core. */
const BEND = [0.5, 0.5, 0.4, 0.45, 0.55, 0.75]

/** The way from one station to another: a curve through the room between the core and the ring. */
function leg(i: number, j: number, shift: number): { path: string; end: Point } {
  const n = STATIONS.length
  let steps = (((j - i) % n) + n) % n
  if (steps > n / 2) steps -= n
  const bend = at(turn(i + steps / 2, shift), BEND[Math.abs(steps)] ?? 0.5)
  const a = edge(place(i, shift), bend, NODE + 4)
  const b = edge(place(j, shift), bend, NODE + 4)
  return { path: `M${n1(a.x)} ${n1(a.y)}Q${n1(bend.x)} ${n1(bend.y)} ${n1(b.x)} ${n1(b.y)}`, end: b }
}

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
 * and a background task runs on without its caller, so neither counts against it. */
function isThinking(entries: readonly Entry[]): boolean {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]
    if (e.station === 'you' && e.from === 'core' && (e.mark === 'done' || e.status === 'err')) return false
    if (e.status === 'run' && e.agentId === undefined && e.task === undefined) return false
    if (e.station === 'you' && e.from === 'inbound' && e.mark === undefined) return true
  }
  return false
}

function trail(entries: readonly Entry[], now: number, c: Palette, isStill: boolean, shift: number): string {
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

type Scene = { entries: Entry[]; board: Board; now: number; c: Palette; names: Strings['stations']; isStill: boolean; shift: number }

function station(s: (typeof STATIONS)[number], i: number, { entries, board, now, c, names, isStill, shift }: Scene): { under: string; over: string } {
  const p = place(i, shift)
  const x = n1(p.x)
  const y = n1(p.y)
  const count = board.counts[s.id] ?? 0
  const own = entries.filter(e => e.station === s.id)
  const running = own.filter(e => e.status === 'run')
  const latest = own.length > 0 ? own[own.length - 1] : undefined
  const since = latest === undefined ? Infinity : now - (latest.endedAt ?? latest.startedAt)
  const alarm = own.filter(e => e.status === 'block' || e.status === 'err').pop()
  const alarmAge = alarm === undefined ? Infinity : now - (alarm.endedAt ?? alarm.startedAt)
  const isAlarm = alarmAge < ALARM_MS
  const isLit = running.length > 0 || since < GLOW_MS
  const [main, hot] = s.id === 'memory' ? [c.mem, c.memHot] : [c.accent, c.hot]
  const color = isAlarm ? c.red : main
  const fade = isAlarm ? alarmAge : since
  const span = isAlarm ? ALARM_MS : GLOW_MS

  let under = ''
  if (isLit || isAlarm) {
    under +=
      running.length > 0 && !isAlarm
        ? `<circle cx="${x}" cy="${y}" r="${NODE + 10}" fill="${color}" opacity=".16"/>`
        : `<circle cx="${x}" cy="${y}" r="${NODE + 10}" fill="${color}" opacity="0">` +
          `<animate attributeName="opacity" values=".3;0" begin="${clock(-fade)}" dur="${clock(span)}" fill="freeze"/></circle>`
  }
  if (running.length > 0) {
    const elapsed = now - Math.min(...running.map(e => e.startedAt))
    const beat = `begin="${clock(-(elapsed % 1600))}" dur="1.6s" repeatCount="indefinite"`
    // The beat is a ring that spreads: with reduced motion the steady halo and the clock hands say the same.
    if (!isStill) {
      under +=
        `<circle cx="${x}" cy="${y}" r="${NODE}" fill="none" stroke="${color}" stroke-width="1.3">` +
        `<animate attributeName="r" values="${NODE};${NODE + 16}" ${beat}/>` +
        `<animate attributeName="opacity" values=".9;0" ${beat}/></circle>`
    }
    // Two hands of a clock around the node: the inner one goes round in a minute, the outer one in ten.
    const hand = (r: number, width: number, lapMs: number, isOnce: boolean): string =>
      `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${hot}" stroke-width="${width}" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1" transform="rotate(-90 ${x} ${y})">` +
      `<animate attributeName="stroke-dashoffset" values="1;0" begin="${clock(-(isOnce ? Math.min(elapsed, lapMs) : elapsed % lapMs))}" dur="${clock(lapMs)}" ${isOnce ? 'fill="freeze"' : 'repeatCount="indefinite"'}/></circle>`
    under += hand(NODE + 4.5, 2.4, 60_000, false) + hand(NODE + 9, 1.3, 600_000, true)
  }

  // A lit node wears a ring of its color while something runs; afterwards the ring fades back to the resting line.
  const lit = `<circle cx="${x}" cy="${y}" r="${NODE}" fill="none" stroke="${color}" stroke-width="1.2"`
  const cooling =
    running.length > 0
      ? `${lit}/>`
      : isLit || isAlarm
        ? `${lit} opacity="0"><animate attributeName="opacity" values="1;0" begin="${clock(-fade)}" dur="${clock(span)}" fill="freeze"/></circle>`
        : ''
  const glyphColor = isAlarm ? c.red : isLit ? hot : s.id === 'memory' && count > 0 ? main : c.ash
  // The words stand on a rim of the ground's own color, so a line that passes behind them never strikes them through.
  const rim = `paint-order="stroke" stroke="${c.ground}" stroke-width="3.5" stroke-linejoin="round"`
  let over =
    `<circle cx="${x}" cy="${y}" r="${NODE}" fill="${c.raised}" stroke="${c.line}" stroke-width="1.2"/>${cooling}` +
    `<path transform="translate(${x} ${y})" d="${s.icon}" fill="none" stroke="${glyphColor}" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<text x="${x}" y="${n1(p.y + NODE + 15)}" text-anchor="middle" ${FONT} font-size="12.5" ${rim} fill="${isLit || isAlarm ? c.bone : c.ash}">${names[s.id]}</text>`

  if (count > 0) {
    // Memory keeps two counts: what was asked for, and what a hook brought down unasked.
    const pushed = s.id === 'memory' ? Math.min(count, board.pushed ?? 0) : 0
    const asked = count - pushed
    const figures =
      pushed === 0 ? String(count) : `${asked > 0 ? `${asked} ` : ''}<tspan fill="${main}">↓${pushed}</tspan>`
    over += `<text x="${x}" y="${n1(p.y + NODE + 30)}" text-anchor="middle" ${FONT} font-size="10.5" ${rim} fill="${c.dim}">${figures}</text>`
  }

  // Top right: how many run at once. Top left: what went wrong since the last message, until the next one.
  const corner = NODE * 0.74
  if (running.length > 1) {
    over +=
      `<circle cx="${n1(p.x + corner)}" cy="${n1(p.y - corner)}" r="9" fill="${c.raised}" stroke="${color}" stroke-width="1"/>` +
      `<text x="${n1(p.x + corner)}" y="${n1(p.y - corner + 3.2)}" text-anchor="middle" ${FONT} font-size="9.5" fill="${hot}">×${running.length}</text>`
  }
  const faults = board.faults?.[s.id] ?? 0
  if (faults > 0) {
    over +=
      `<circle cx="${n1(p.x - corner)}" cy="${n1(p.y - corner)}" r="8.2" fill="${c.red}"/>` +
      `<text x="${n1(p.x - corner)}" y="${n1(p.y - corner + 3.4)}" text-anchor="middle" ${FONT} font-size="10" font-weight="700" fill="${c.ground}">${faults > 99 ? '99+' : faults}</text>`
  }
  return { under, over }
}


export function drawMap(board: Board, now: number, setup: Setup): string {
  const c: Palette = { ...(setup.theme === 'light' ? LIGHT : DARK), ...setup.colors }
  // How many places the ring is turned. The stations keep their order, so the far side of the person is always the network.
  const shift = setup.layout === 'you-bottom' ? STATIONS.length / 2 : 0
  const core: Point = { x: CX, y: CY }
  const recent = board.entries.slice(-40)
  // With reduced motion nothing flies, spreads or spins. A call still shows: its spoke flashes and fades, its station
  // lights and cools, the route gets its leg; those only change their opacity. The clock hands stay, as slow as a clock's.
  const isStill = setup.motion === 'reduced'
  // At slow pace every exchange of data takes twice as long to fly, spread and fade.
  const isSlow = setup.pace === 'slow'
  const pulseMs = isSlow ? 2 * PULSE_MS : PULSE_MS
  const rippleMs = isSlow ? 2 * RIPPLE_MS : RIPPLE_MS
  const glowMs = isSlow ? 2 * GLOW_MS : GLOW_MS
  const doneMs = isSlow ? 2 * DONE_MS : DONE_MS
  const thinkMs = isSlow ? 2 * THINK_MS : THINK_MS
  const flights = isStill ? [] : recent.filter(e => now - e.startedAt < pulseMs + rippleMs).slice(-14)
  const returns = isStill ? [] : recent.filter(e => e.endedAt !== undefined && e.from !== 'inbound' && now - e.endedAt < pulseMs + rippleMs).slice(-14)
  const beams = recent.filter(e => now - e.startedAt < glowMs / 2).slice(-10)
  const anyRunning = recent.some(e => e.status === 'run')
  // The main loop thinks while none of its calls is open and no answer has arrived since the message.
  const thinking = isThinking(board.entries)
  const agentsAt = place(indexOf('agents'), shift)
  /** The subagents that get a planet of their own: those at work, and those whose stay is not yet up.
   * Each holds the seat it was given — an inner ring of its own, or a place on the outer one — and
   * keeps it for as long as it is on the map: a planet never slides to another seat when the crew changes. */
  const crew = (board.agents ?? []).filter(s => s.goneAt === undefined || now - s.goneAt < AGENT_HOLD_MS + AGENT_FADE_MS)
  seatCrew(crew)
  const isBad = (e: Entry): boolean => e.status === 'block' || e.status === 'err'
  const tone = (e: Entry): [string, string] => (e.station === 'memory' ? [c.mem, c.memHot] : [c.accent, c.hot])

  // Without its ground the map keeps the rim around its words, in the ground's color: a faint halo on a surface of another shade.
  let body = setup.background === 'transparent' ? '' : `<rect width="${W}" height="${H}" rx="12" fill="${c.ground}"/>`

  // Contours around the core.
  for (const [rx, ry] of [[82, 77], [129, 121], [176, 164]]) {
    body += `<ellipse cx="${CX}" cy="${CY}" rx="${rx}" ry="${ry}" fill="none" stroke="${c.line}" stroke-width=".7" opacity=".45" stroke-dasharray="2 5"/>`
  }

  // Spokes first, then whatever flies along them, then the nodes on top.
  // A spoke wears in with use: by the end of a session the map shows where the work went.
  STATIONS.forEach((s, i) => {
    const p = place(i, shift)
    const a = edge(core, p, HUB)
    const b = edge(p, core, NODE)
    const worn = Math.min(1, Math.log2(1 + (board.counts[s.id] ?? 0)) / 7)
    const line = `<line x1="${n1(a.x)}" y1="${n1(a.y)}" x2="${n1(b.x)}" y2="${n1(b.y)}" stroke-width="${n1(1 + 2.6 * worn)}" stroke-linecap="round"`
    body += `${line} stroke="${c.spoke}"/>`
    if (worn > 0) body += `${line} stroke="${s.id === 'memory' ? c.mem : c.accent}" opacity="${n1(worn * 0.55)}"/>`
  })

  const scene: Scene = { entries: recent, board, now, c, names: setup.t.stations, isStill, shift }
  const drawn = STATIONS.map((s, i) => station(s, i, scene))
  body += drawn.map(d => d.under).join('')
  body += trail(recent, now, c, isStill, shift)

  /** Where a subagent's flight leaves from: its own point on its ring while it circles the agents station.
   * An agent the drawing gives no seat to, and one whose loop is over, leave from the station itself. */
  const agentFrom = (e: Entry): Point => {
    const seat = seats.get(e.agentId ?? '')
    if (seat === undefined) return agentsAt
    const ring = seat.ring
    if (isStill) return orbitDot(ring, agentsAt, seatShare(seat) * 2 * Math.PI)
    // The phase the ring's rotation is in at this moment, as the drawing's own clock sees it.
    const lap = orbitLap(ring)
    return orbitDot(ring, agentsAt, seatAngle(seat, now, lap))
  }
  /** The two ends of an entry's spoke: where it starts (the core or the subagent's orbit) and its own station. */
  const ends = (e: Entry): [Point, Point] => {
    const p = place(indexOf(e.station), shift)
    const start = e.from === 'agents' ? agentFrom(e) : core
    return [edge(start, p, e.from === 'agents' ? PLANET + 2 : HUB), edge(p, start, NODE)]
  }
  /** Pulses that share a spoke and a moment fly in lanes, five apart. */
  const lane = (list: Entry[], e: Entry): number => {
    const peers = list.filter(x => x.station === e.station && x.from === e.from)
    return (peers.indexOf(e) - (peers.length - 1) / 2) * 5
  }

  for (const e of beams) {
    const [a, b] = ends(e)
    const isBadBeam = isBad(e)
    // A beam whose end rides a planet follows it along its orbit; everything else is nailed where it started.
    // Standing still, the planet is parked: the beam simply leaves from where it sits.
    if (!isStill && e.from === 'agents') {
      const seat = seats.get(e.agentId ?? '')
      if (seat !== undefined) {
        const lap = orbitLap(seat.ring)
        // The rotation is already mid-lap at drawing time; the beam must sample it at absolute moments, as agentFrom does.
        body += orbitBeam(lap, when => orbitDot(seat.ring, agentsAt, seatAngle(seat, now + when, lap)), b, isBadBeam ? c.red : tone(e)[0], now - e.startedAt, false, glowMs)
        continue
      }
    }
    body += beam(a, b, isBadBeam ? c.red : tone(e)[0], now - e.startedAt, e.from === 'inbound', glowMs)
  }
  for (const e of flights) {
    const [a, b] = aside(...ends(e), lane(flights, e))
    const age = now - e.startedAt
    const color = e.status === 'block' ? c.red : tone(e)[1]
    if (e.from === 'inbound') {
      body += pulse(b, a, color, age, 3.8, true, pulseMs) + ripple(core, HUB - 2, color, age, rippleMs, pulseMs)
    } else {
      body += pulse(a, b, color, age, 3.8, false, pulseMs) + ripple(place(indexOf(e.station), shift), NODE, color, age, rippleMs, pulseMs)
    }
  }
  for (const e of returns) {
    const [a, b] = aside(...ends(e), lane(returns, e))
    body += pulse(b, a, e.status === 'ok' ? c.ash : c.red, now - (e.endedAt as number), 2.6, false, pulseMs)
  }

  // Each subagent circles the agents station as a planet of its own, on the ring its seat holds:
  // the first five a ring each close to the station, the rest a place on the outer ring. A seat is
  // held until its planet is gone from the map, so a subagent never slides to another place when
  // the crew changes. One whose loop is over keeps its place for a while yet, then fades out on
  // its own, even when nothing redraws the map. The orbits lie under the station's words, whose rim
  // keeps a line that crosses them from striking them through.
  let outerRingDrawn = false
  crew.forEach(seatAgent => {
    const seat = seats.get(seatAgent.id)
    if (seat === undefined) return
    const ring = seat.ring
    const age = seatAgent.goneAt === undefined ? -1 : now - seatAgent.goneAt
    const hue = c[CREW_HUES[seat.hue] ?? 'crew0']
    const spin = `${n1(agentsAt.x)} ${n1(agentsAt.y)}`
    // The fade is written into the drawing, so a planet goes out on time even when nothing redraws the map —
    // and mid-fade, the group already sits at the opacity the fade has really reached.
    const fading = age >= 0 ? fadeAt(age, AGENT_HOLD_MS, AGENT_FADE_MS) : undefined
    const out = fading === undefined ? '' : `<animate attributeName="opacity" values="${n1(fading.opacity)};0" begin="${clock(fading.begin)}" dur="${clock(fading.dur)}" fill="freeze"/>`
    const hold = out === '' ? '' : `<g opacity="${n1(fading?.opacity ?? 1)}">${out}`
    const shut = out === '' ? '' : '</g>'
    // An inner ring belongs to the one planet on it, so it fades together with that planet.
    // The outer ring belongs to everyone seated on it: it is drawn once and stays while any of them is there.
    if (ring < INNER_SEATS) {
      body += `${hold}${orbitRing(ring, agentsAt, c)}`
    } else {
      if (!outerRingDrawn) {
        body += orbitRing(ring, agentsAt, c)
        outerRingDrawn = true
      }
      body += hold
    }
    // Standing still, each keeps its own place on its ring.
    if (isStill) {
      const still = orbitDot(ring, agentsAt, seatShare(seat) * 2 * Math.PI)
      body += `${planet(still, c, hue, age < 0, true)}${shut}`
      return
    }
    const lap = orbitLap(ring)
    // The angle the seat's rotation is in at this moment, the same phase the beam riders sample.
    // It is written into the group as it stands, so the planet sits mid-lap even in the frame before
    // the animation takes over: a redraw never flashes it back to the top of its orbit.
    const theta = (seatAngle(seat, now, lap) * 180) / Math.PI
    const seatPoint = orbitDot(ring, agentsAt, 0)
    body +=
      `<g transform="rotate(${n1(theta)} ${spin})"><animateTransform attributeName="transform" type="rotate" from="${n1(theta)} ${spin}" to="${n1(theta + (ring % 2 === 0 ? 360 : -360))} ${spin}" begin="0s" dur="${clock(lap)}" repeatCount="indefinite"/>` +
      `${planet(seatPoint, c, hue, age < 0, false)}</g>${shut}`
  })

  // The legend in the corner below: each hue with the name of the agent whose planet wears it,
  // fading out together with the planet it explains, so nothing outlives what it stood for.
  // Only the short description a subagent was started with; never anything of its prompt.
  if (crew.length > 0) {
    const legendX = 24
    const legendBottom = H - 18
    crew.forEach(seatAgent => {
      const seat = seats.get(seatAgent.id)
      if (seat === undefined) return
      const age = seatAgent.goneAt === undefined ? -1 : now - seatAgent.goneAt
      const hue = c[CREW_HUES[seat.hue] ?? 'crew0']
      const fading = age >= 0 ? fadeAt(age, AGENT_HOLD_MS, AGENT_FADE_MS) : undefined
      const out = fading === undefined ? '' : `<animate attributeName="opacity" values="${n1(fading.opacity)};0" begin="${clock(fading.begin)}" dur="${clock(fading.dur)}" fill="freeze"/>`
      const hold = out === '' ? '' : `<g opacity="${n1(fading?.opacity ?? 1)}">${out}`
      const shut = out === '' ? '' : '</g>'
      const y = legendBottom - (crew.length - 1 - crew.indexOf(seatAgent)) * 16
      const name = (seatAgent.name ?? setup.t.subagent).length > 28 ? `${(seatAgent.name ?? setup.t.subagent).slice(0, 27)}…` : seatAgent.name ?? setup.t.subagent
      body += `${hold}<circle cx="${legendX}" cy="${n1(y - 4)}" r="5" fill="${hue}"/>` +
        `<text x="${legendX + 13}" y="${n1(y)}" ${FONT} font-size="11" fill="${c.ash}">${escapeXml(name)}</text>${shut}`
    })
  }

  body += drawn.map(d => d.over).join('')

  // A name longer than three letters shrinks to stay inside the circle.
  const coreName = board.model === undefined ? setup.core : modelFamily(board.model)
  const coreSize = Math.min(18.5, 68 / (0.75 * coreName.length))

  // The core breathes at rest and quickens while something runs.
  const period = anyRunning ? 1800 : 5400
  const breath = `begin="${clock(-(now % period))}" dur="${clock(period)}" repeatCount="indefinite"`
  // While the main loop thinks, a ring of its own breathes around the core, at its own slow pace.
  // Standing still, the ring rests at one size; the core's rim takes the accent, as it does for a call.
  const ponder = `begin="${clock(-(now % thinkMs))}" dur="${clock(thinkMs)}" repeatCount="indefinite"`
  const pondering = thinking
    ? isStill
      ? `<circle cx="${CX}" cy="${CY}" r="${CORE + 9.5}" fill="none" stroke="${c.accent}" stroke-width="1.5" opacity=".38"/>`
      : `<circle cx="${CX}" cy="${CY}" r="${CORE + 9.5}" fill="none" stroke="${c.accent}" stroke-width="1.5" opacity="0">` +
        `<animate attributeName="r" values="${CORE + 7};${CORE + 16};${CORE + 7}" ${ponder}/>` +
        `<animate attributeName="opacity" values=".16;.5;.16" ${ponder}/></circle>`
    : ''
  body +=
    pondering +
    (isStill
      ? `<circle cx="${CX}" cy="${CY}" r="${CORE + 9}" fill="${c.accent}" opacity="${anyRunning ? '.16' : '.08'}"/>`
      : `<circle cx="${CX}" cy="${CY}" r="${CORE + 7}" fill="${c.accent}" opacity=".08">` +
        `<animate attributeName="r" values="${CORE + 3};${CORE + 14};${CORE + 3}" ${breath}/>` +
        `<animate attributeName="opacity" values=".05;${anyRunning ? '.24' : '.12'};.05" ${breath}/></circle>`) +
    `<circle cx="${CX}" cy="${CY}" r="${CORE}" fill="${c.raised}" stroke="${anyRunning || thinking ? c.accent : c.line}" stroke-width="1.3"/>`

  // The context window as a ring around the core: it fills as the session goes and empties at a compaction.
  if (board.context !== undefined) {
    const full = Math.max(0, Math.min(100, Math.round(board.context)))
    const ring = `cx="${CX}" cy="${CY}" r="${CORE + 5.5}" fill="none" stroke-width="2.4"`
    body +=
      `<circle ${ring} stroke="${c.line}" opacity=".7"/>` +
      `<circle ${ring} stroke="${full >= 90 ? c.red : full >= 70 ? c.accent : c.ash}" pathLength="100" stroke-dasharray="${full} 100" transform="rotate(-90 ${CX} ${CY})"/>` +
      `<text x="${CX}" y="${n1(CY - 21)}" text-anchor="middle" ${FONT} font-size="8.5" fill="${c.dim}">${full}%</text>`
  }

  const switchAge = board.switchedAt === undefined ? Infinity : now - board.switchedAt
  const isSwitching = switchAge >= 0 && switchAge < SWITCH_MS
  // The core names the family of the model at work; before the first request it is the core the person set.
  body += `<text x="${CX}" y="${CY + (board.model === undefined ? 6 : 1)}" text-anchor="middle" ${FONT} font-size="${n1(coreSize)}" letter-spacing="${n1(coreSize * 0.147)}" fill="${c.bone}">${escapeXml(coreName)}</text>`
  if (board.model !== undefined) {
    body += `<text x="${CX}" y="${n1(CY + 19)}" text-anchor="middle" ${FONT} font-size="10" fill="${isSwitching ? c.hot : c.ash}">${escapeXml(shortModel(board.model))}</text>`
  }

  // A changed model rings at the core and at its station for a few seconds.
  if (isSwitching && !isStill) {
    const model = place(indexOf('model'), shift)
    const laps = Math.ceil((SWITCH_MS - switchAge) / 1600)
    for (const [p, r] of [[core, CORE], [model, NODE]] as const) {
      const ringing = `begin="${clock(-(switchAge % 1600))}" dur="1.6s" repeatCount="${laps}" fill="freeze"`
      body +=
        `<circle cx="${n1(p.x)}" cy="${n1(p.y)}" r="${r}" fill="none" stroke="${c.bone}" stroke-width="1.4" opacity="0">` +
        `<animate attributeName="r" values="${r};${r + 29}" ${ringing}/>` +
        `<animate attributeName="opacity" values=".7;0" ${ringing}/></circle>`
    }
  }

  // The answer leaves the core as one wide ring.
  const done = recent.filter(e => e.mark === 'done').pop()
  if (done !== undefined && now - done.startedAt < doneMs && !isStill) {
    const leaving = `begin="${clock(done.startedAt - now)}" dur="${clock(doneMs)}" fill="freeze"`
    body +=
      `<circle cx="${CX}" cy="${CY}" r="${CORE}" fill="none" stroke="${c.bone}" stroke-width="1.7" opacity="0">` +
      `<animate attributeName="r" values="${CORE};${CORE + 42}" ${leaving}/>` +
      `<animate attributeName="opacity" values=".6;0" ${leaving}/></circle>`
  }

  // Twice the viewBox, so the picture fills whatever room the pane gives it.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W * 2}" height="${H * 2}">${setup.theme === 'auto' ? lightRules(setup.colors) : ''}${body}</svg>`
}

function escapeXml(text: string): string {
  return text.replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c] as string)
}
