// The drawing's animated effects: the fades written into the SVG, and the pulses, ripples and
// beams that fly along the spokes. Nothing here touches the engine.
import { n1, clock } from './geometry'
import type { Point } from './geometry'
import { AGENT_HOLD_MS, AGENT_FADE_MS } from './durations'

/** Where a thing is in its fade at this moment: the opacity it truly sits at, and the piece of the fade
 * still ahead of it. Both are written into the drawing as it stands, so a redraw never flashes the
 * thing back to full strength for the one frame before the animation takes over — the same cure the
 * planet's place on its orbit got. The fade never begins in the past; mid-fade, what remains of it
 * runs from the opacity it has reached down to zero, in the time it has left. */
export function fadeAt(age: number, holdMs: number, fadeMs: number): { opacity: number; begin: number; dur: number } {
  if (age < holdMs) return { opacity: 1, begin: holdMs - age, dur: fadeMs }
  const remain = Math.max(0, holdMs + fadeMs - age)
  return { opacity: remain / fadeMs, begin: 0, dur: remain }
}

export function agentFadeGroup(age: number): { open: string; close: string } {
  if (age < 0) return { open: '', close: '' }
  const fade = fadeAt(age, AGENT_HOLD_MS, AGENT_FADE_MS)
  const animation = `<animate attributeName="opacity" values="${n1(fade.opacity)};0" begin="${clock(fade.begin)}" dur="${clock(fade.dur)}" fill="freeze"/>`
  return { open: `<g opacity="${n1(fade.opacity)}">${animation}`, close: '</g>' }
}

/** A pulse with a short tail behind it. A hollow one is a signal nobody asked for. */
export function pulse(a: Point, b: Point, color: string, age: number, radius: number, isHollow: boolean, pulseMs: number): string {
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
export function ripple(p: Point, r: number, color: string, age: number, rippleMs: number, pulseMs: number): string {
  const timing = `begin="${clock(pulseMs - age)}" dur="${clock(rippleMs)}" fill="freeze"`
  return (
    `<circle cx="${n1(p.x)}" cy="${n1(p.y)}" r="${r}" fill="none" stroke="${color}" stroke-width="1.2" opacity="0">` +
    `<animate attributeName="r" values="${r};${r + 12}" ${timing}/>` +
    `<animate attributeName="opacity" values=".7;0" ${timing}/></circle>`
  )
}

export function beam(a: Point, b: Point, color: string, age: number, isDashed: boolean, glowMs: number): string {
  return (
    `<line x1="${n1(a.x)}" y1="${n1(a.y)}" x2="${n1(b.x)}" y2="${n1(b.y)}" stroke="${color}" stroke-width="1.4"${isDashed ? ' stroke-dasharray="3 4"' : ''} opacity="0">` +
    `<animate attributeName="opacity" values=".75;0" begin="${clock(-age)}" dur="${clock(glowMs / 2)}" fill="freeze"/></line>`
  )
}

/** A beam whose near end rides a planet: the line is sampled along the orbit while the beam lives,
 * so it follows the planet instead of hanging where the planet was when the drawing was made.
 * A leg of the planet's own lap, walked between the beam's first and last moment. */
export function orbitBeam(
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
