// The live page: it holds nothing but the drawing. The board arrives whole from the host over the
// event stream, and every frame renders it the same way the panel beside the editor does.
import { setupFrom } from '../hooks/setup'
import { ZOOMS, projectView } from '../hooks/view'
import type { ViewProjection } from '../types'
import { renderView } from '../vscode-extension/src/webview/render'

/** How often the map is redrawn while it runs: the panel keeps the same beat. */
const REDRAW_MS = 1000

const state: { setup?: ReturnType<typeof setupFrom>; board?: Parameters<typeof projectView>[0]; clock: number; zoom: number; minimized: boolean } = {
  clock: 0,
  zoom: ZOOMS.length,
  minimized: false,
}
let lastDrawn = -1

/** The word that says whether the host's stream is flowing; the map freezes gracefully when it does not. */
function markConnection(live: boolean): void {
  const el = document.getElementById('connection')
  if (el === null) return
  el.textContent = live ? 'live' : 'waiting'
  el.className = live ? 'live' : 'waiting'
}

/** One parsed frame, or nothing: a malformed frame is skipped and the map keeps drawing. */
function parseFrame(data: string): unknown {
  try {
    return JSON.parse(data)
  } catch {
    return undefined
  }
}

/** The one setup frame, before the first board: the words and colors the person set on the host.
 *  A malformed one is skipped and the defaults take its place — the map draws either way. */
function takeSetup(raw: unknown): void {
  state.setup = setupFrom(
    raw !== undefined && typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {},
  )
  const theme = state.setup.theme
  document.documentElement.dataset.theme = theme
  render(true)
}

function render(force: boolean): void {
  if (!force && state.clock - lastDrawn < REDRAW_MS && lastDrawn >= 0) return
  lastDrawn = state.clock
  if (state.board === undefined || state.setup === undefined) return
  const view: ViewProjection = projectView(state.board, Date.now(), state.setup, {
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

const stream = new EventSource('/events')
stream.addEventListener('setup', e => {
  takeSetup(parseFrame(e.data))
  markConnection(true)
})
stream.addEventListener('board', e => {
  const board = parseFrame(e.data)
  if (board === undefined) return
  state.board = board as Parameters<typeof projectView>[0]
  if (state.setup === undefined) takeSetup(undefined) // the setup frame was lost: the defaults draw
  lastDrawn = -1 // a board landed: the map is drawn now, whatever the beat says
  markConnection(true)
})
stream.onopen = () => markConnection(true)
// The host gone: the map freezes on its last board, the word turns, and the stream reconnects itself.
stream.onerror = () => markConnection(false)

function frame(): void {
  state.clock = Date.now()
  render(false)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
