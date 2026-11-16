// The scene itself: one map, the agent in the centre and a station for each kind of work.
// Nothing here touches the engine.
import type { Board, Entry } from '../../types'
import { shortModel, modelFamily } from '../classify'
import { DARK, LIGHT, lightRules } from '../palette'
import type { Palette } from '../palette'
import { STATIONS } from '../setup'
import type { Setup } from '../setup'
import type { Strings } from '../text'
import { W, H, CX, CY, NODE, CORE, HUB, MAP_WIDTH, MAP_ASPECT, aside, clock, edge, indexOf, n1, orbitDot, orbitLap, place, PLANET, INNER_SEATS } from './geometry'
import type { Point } from './geometry'
import { agentFadeGroup, beam, orbitBeam, pulse, ripple } from './effects'
import { seatCrew, seatOf, seatShare, seatAngle, orbitRing, CREW_HUES, planet } from './crew'
import { isThinking, trail } from './trail'
import { AGENT_HOLD_MS, AGENT_FADE_MS } from './durations'

export { MAP_WIDTH, MAP_ASPECT }

const FONT = 'font-family="SF Mono, ui-monospace, Menlo, monospace"'

const PULSE_MS = 950
const RIPPLE_MS = 540
const GLOW_MS = 3800
const ALARM_MS = 6000
const SWITCH_MS = 8000
const DONE_MS = 1250
/** How slowly the thinking ring breathes around the core: a rhythm of its own, far from any call's beat. */
const THINK_MS = 5000

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
    // The glyphs were drawn for a 24-radius tile and ride the tile's size.
    `<path transform="translate(${x} ${y}) scale(${n1(NODE / 24)})" d="${s.icon}" fill="none" stroke="${glyphColor}" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<text x="${x}" y="${n1(p.y + NODE + 16)}" text-anchor="middle" ${FONT} font-size="14" ${rim} fill="${isLit || isAlarm ? c.bone : c.ash}">${names[s.id]}</text>`

  if (count > 0) {
    // Memory shows what was asked for; the pushed/asked split never had a writer.
    over += `<text x="${x}" y="${n1(p.y + NODE + 31)}" text-anchor="middle" ${FONT} font-size="11.5" ${rim} fill="${c.dim}">${count}</text>`
  }

  // Top right: how many run at once. Top left: what went wrong since the last message, until the next one.
  const corner = NODE * 0.74
  if (running.length > 1) {
    over +=
      `<circle cx="${n1(p.x + corner)}" cy="${n1(p.y - corner)}" r="10" fill="${c.raised}" stroke="${color}" stroke-width="1"/>` +
      `<text x="${n1(p.x + corner)}" y="${n1(p.y - corner + 3.5)}" text-anchor="middle" ${FONT} font-size="10.5" fill="${hot}">×${running.length}</text>`
  }
  const faults = board.faults?.[s.id] ?? 0
  if (faults > 0) {
    over +=
      `<circle cx="${n1(p.x - corner)}" cy="${n1(p.y - corner)}" r="9" fill="${c.red}"/>` +
      `<text x="${n1(p.x - corner)}" y="${n1(p.y - corner + 3.8)}" text-anchor="middle" ${FONT} font-size="11" font-weight="700" fill="${c.ground}">${faults > 99 ? '99+' : faults}</text>`
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
    const seat = seatOf(e.agentId)
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
      const seat = seatOf(e.agentId)
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
    const seat = seatOf(seatAgent.id)
    if (seat === undefined) return
    const ring = seat.ring
    const age = seatAgent.goneAt === undefined ? -1 : now - seatAgent.goneAt
    const hue = c[CREW_HUES[seat.hue] ?? 'crew0']
    const spin = `${n1(agentsAt.x)} ${n1(agentsAt.y)}`
    // The fade is written into the drawing, so a planet goes out on time even when nothing redraws the map —
    // and mid-fade, the group already sits at the opacity the fade has really reached.
    const fade = agentFadeGroup(age)
    // An inner ring belongs to the one planet on it, so it fades together with that planet.
    // The outer ring belongs to everyone seated on it: it is drawn once and stays while any of them is there.
    if (ring < INNER_SEATS) {
      body += `${fade.open}${orbitRing(ring, agentsAt, c)}`
    } else {
      if (!outerRingDrawn) {
        body += orbitRing(ring, agentsAt, c)
        outerRingDrawn = true
      }
      body += fade.open
    }
    // Standing still, each keeps its own place on its ring.
    if (isStill) {
      const still = orbitDot(ring, agentsAt, seatShare(seat) * 2 * Math.PI)
      body += `${planet(still, c, hue, age < 0, true)}${fade.close}`
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
      `${planet(seatPoint, c, hue, age < 0, false)}</g>${fade.close}`
  })

  // The legend in the corner below: each hue with the name of the agent whose planet wears it,
  // fading out together with the planet it explains, so nothing outlives what it stood for.
  // Only the short description a subagent was started with; never anything of its prompt.
  if (crew.length > 0) {
    const legendX = 24
    const legendBottom = H - 18 // high enough for the widest crew, clear of the lowest planet
    crew.forEach(seatAgent => {
      const seat = seatOf(seatAgent.id)
      if (seat === undefined) return
      const age = seatAgent.goneAt === undefined ? -1 : now - seatAgent.goneAt
      const hue = c[CREW_HUES[seat.hue] ?? 'crew0']
      const fade = agentFadeGroup(age)
      const y = legendBottom - (crew.length - 1 - crew.indexOf(seatAgent)) * 16
      const name = (seatAgent.name ?? setup.t.subagent).length > 28 ? `${(seatAgent.name ?? setup.t.subagent).slice(0, 27)}…` : seatAgent.name ?? setup.t.subagent
      body += `${fade.open}<circle cx="${legendX}" cy="${n1(y - 4)}" r="5" fill="${hue}"/>` +
        `<text x="${legendX + 13}" y="${n1(y)}" ${FONT} font-size="12" fill="${c.ash}">${escapeXml(name)}</text>${fade.close}`
    })
  }

  body += drawn.map(d => d.over).join('')

  // A name longer than three letters shrinks to stay inside the circle.
  const coreName = board.model === undefined ? setup.core : modelFamily(board.model)
  const coreSize = Math.min(21, 77 / (0.75 * coreName.length))

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
      `<text x="${CX}" y="${n1(CY - 21)}" text-anchor="middle" ${FONT} font-size="9.5" fill="${c.dim}">${full}%</text>`
  }

  const switchAge = board.switchedAt === undefined ? Infinity : now - board.switchedAt
  const isSwitching = switchAge >= 0 && switchAge < SWITCH_MS
  // The core names the family of the model at work; before the first request it is the core the person set.
  body += `<text x="${CX}" y="${CY + (board.model === undefined ? 6 : 1)}" text-anchor="middle" ${FONT} font-size="${n1(coreSize)}" letter-spacing="${n1(coreSize * 0.147)}" fill="${c.bone}">${escapeXml(coreName)}</text>`
  if (board.model !== undefined) {
    body += `<text x="${CX}" y="${n1(CY + 21)}" text-anchor="middle" ${FONT} font-size="11" fill="${isSwitching ? c.hot : c.ash}">${escapeXml(shortModel(board.model))}</text>`
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
