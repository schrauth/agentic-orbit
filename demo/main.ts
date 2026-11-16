// The demo page: a fake clock walks the chosen scenario's steps through the fake session, and the map is
// drawn from the same board and the same drawing the extension uses, on the same 1-second cadence the panel keeps.
// The words on the controls live here: the demo is a workshop, not a shipped surface.
import { FakeSession, SCENARIOS, demoSetup, scenarioEnd } from './engine'
import { ZOOMS, projectView } from '../hooks/view'
import type { ViewProjection } from '../types'
import { renderView } from '../vscode-extension/src/webview/render'

const BASE = 1_770_000_000_000
/** How often the map is redrawn while it runs: the panel keeps the same beat. */
const REDRAW_MS = 1000

type Options = { scenario: number; speed: number; playing: boolean; theme: 'dark' | 'light' | 'auto'; layout: 'you-top' | 'you-bottom'; motion: 'full' | 'reduced'; pace: 'normal' | 'slow'; language: string }

const state: Options & { clock: number; applied: number; zoom: number; minimized: boolean } = {
  scenario: 0,
  speed: 1,
  playing: true,
  theme: 'dark',
  layout: 'you-top',
  motion: 'full',
  pace: 'normal',
  language: 'en',
  clock: 0,
  applied: 0,
  zoom: ZOOMS.length,
  minimized: false,
}

const session = new FakeSession(BASE)
let lastDrawn = -1

const setup = () => demoSetup({ theme: state.theme, layout: state.layout, motion: state.motion, pace: state.pace, language: state.language })
const scenario = () => SCENARIOS[state.scenario] ?? SCENARIOS[0]

/** Back to the start of the scenario: the board emptied, the clock at zero. */
function reset(): void {
  session.reset()
  state.clock = 0
  state.applied = 0
  lastDrawn = -1
  render(true)
}

function playPause(): void {
  state.playing = !state.playing
  renderControls()
}

/** The clock moved: every step whose time has come is applied, and the map is redrawn on the panel's beat. */
function tick(dtReal: number): void {
  if (state.playing) state.clock += dtReal * state.speed
  const steps = scenario().steps
  while (state.applied < steps.length && steps[state.applied].at <= state.clock) {
    const step = steps[state.applied]
    const s = setup()
    if (step.ev !== undefined) session.apply(step.ev, step.at, s)
    if (step.tel !== undefined) session.telemetry(step.tel.model, step.tel.promptTokens, step.at, s)
    state.applied++
    lastDrawn = -1 // a step landed: the map is drawn now, whatever the beat says
  }
  const end = scenarioEnd(scenario())
  if (state.clock > end + 120_000) {
    state.clock = end + 120_000 // the long stay of the last planets is enough to watch; then the clock rests
    state.playing = false
    renderControls()
  }
  if (state.clock - lastDrawn >= REDRAW_MS || lastDrawn < 0) render(false)
}

function render(force: boolean): void {
  if (!force && state.clock - lastDrawn < REDRAW_MS && lastDrawn >= 0) return
  lastDrawn = state.clock
  const view: ViewProjection = projectView(session.board, BASE + state.clock, setup(), {
    width: state.zoom >= ZOOMS.length ? undefined : ZOOMS[state.zoom],
    hidden: state.minimized,
  })
  renderView(view, {
    show: () => {
      state.minimized = false
      render(true)
    },
    zoomOut: () => {
      state.zoom = Math.max(0, state.zoom - 1)
      render(true)
    },
    zoomIn: () => {
      state.zoom = Math.min(ZOOMS.length, state.zoom + 1)
      render(true)
    },
    hide: () => {
      state.minimized = true
      render(true)
    },
  })
}

/** The controls bar: the words on it are the demo's own, for it is a workshop and not a shipped surface. */
function renderControls(): void {
  const play = document.getElementById('play')!
  play.textContent = state.playing ? '❚❚ pause' : '▶ play'
  const clock = document.getElementById('clock')!
  const s = Math.floor(state.clock / 1000)
  clock.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} / ${Math.floor(scenarioEnd(scenario()) / 1000)}s${state.speed === 1 ? '' : `  ·  ${state.speed}×`}`
}

function wireControls(): void {
  const sel = <HTMLSelectElement>document.getElementById('scenario')!
  for (const [i, s] of SCENARIOS.entries()) sel.add(new Option(s.name, String(i)))
  sel.onchange = () => {
    state.scenario = Number(sel.value)
    reset()
  }

  const speed = <HTMLInputElement>document.getElementById('speed')!
  speed.oninput = () => {
    state.speed = Number(speed.value)
    renderControls()
  }

  document.getElementById('play')!.onclick = playPause
  document.getElementById('reset')!.onclick = reset

  const theme = <HTMLSelectElement>document.getElementById('theme')!
  theme.onchange = () => {
    state.theme = theme.value as Options['theme']
    document.documentElement.dataset.theme = state.theme
    render(true)
  }

  const layout = <HTMLSelectElement>document.getElementById('layout')!
  layout.onchange = () => {
    state.layout = layout.value as Options['layout']
    render(true)
  }

  const motion = <HTMLSelectElement>document.getElementById('motion')!
  motion.onchange = () => {
    state.motion = motion.value as Options['motion']
    render(true)
  }

  const pace = <HTMLSelectElement>document.getElementById('pace')!
  pace.onchange = () => {
    state.pace = pace.value as Options['pace']
    render(true)
  }

  const language = <HTMLSelectElement>document.getElementById('language')!
  for (const l of ['en', 'de', 'es', 'fr', 'it', 'pt', 'ru']) language.add(new Option(l, l))
  language.onchange = () => {
    state.language = language.value
    render(true)
  }

  document.getElementById('copy')!.onclick = () => {
    const text = JSON.stringify(session.board, null, 2)
    void navigator.clipboard?.writeText(text).catch(() => undefined)
    const board = document.getElementById('board-dump')!
    board.textContent = text
    board.hidden = false
  }

  document.getElementById('board-dump')!.onclick = e => {
    ;(e.currentTarget as HTMLElement).hidden = true
  }
}

let before = performance.now()
function frame(now: number): void {
  tick(Math.min(250, now - before))
  before = now
  renderControls()
  requestAnimationFrame(frame)
}

wireControls()
reset()
requestAnimationFrame(frame)
