// The live page: it holds nothing but the drawing. The board arrives whole from the host over the
// event stream, and every frame renders it the same way the panel beside the editor does. The
// side menu tunes the looks here on the page — they override what the host's setup says.
import { setupFrom, type Setup } from '../hooks/setup'
import { LANGUAGES } from '../hooks/text'
import { projectView } from '../hooks/view'
import type { ViewProjection } from '../types'
import { renderView } from '../vscode-extension/src/webview/render'

/** How often the map is redrawn while it runs: the panel keeps the same beat. */
const REDRAW_MS = 1000

const state: { setup?: Setup; board?: Parameters<typeof projectView>[0]; clock: number; minimized: boolean } = {
  clock: 0,
  minimized: false,
}
let lastDrawn = -1

/** The setup as the host sent it, and the parts the person retuned on this page — the page's
 *  choices win until the person makes another, whatever setup a reconnect brings. */
const rawSetup: Record<string, unknown> = {}
const overrides: Partial<Record<'theme' | 'layout' | 'motion' | 'pace' | 'language', string>> = {}

/** The word that says whether the host's stream is flowing; the map freezes gracefully when it does not. */
function markConnection(live: boolean): void {
  const el = document.getElementById('connection')
  if (el === null) return
  el.textContent = live ? 'live' : 'waiting'
  el.className = live ? 'live' : 'waiting'
}

/** The one parsed frame, or nothing: a malformed frame is skipped and the map keeps drawing. */
function parseFrame(data: string): unknown {
  try {
    return JSON.parse(data)
  } catch {
    return undefined
  }
}

/* The rolling log: unlike the panel's folded feed, every call gets its own line, console style.
 *  A running call shows a live line the moment it starts; when it ends, the same line gets its
 *  verdict and duration instead of a second one. Lines are never replaced or folded — the only
 *  thing that leaves the log is age: the oldest lines drop off past a thousand. */
const MAX_LOG_LINES = 1000
const logged = new Map<string, HTMLDivElement>()

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch)
}

const clockOf = (at: number): string => {
  const d = new Date(at)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

function renderLog(): void {
  const log = document.getElementById('log')
  if (log === null || state.board === undefined) return
  const t = state.setup?.t
  if (t === undefined) return
  for (const entry of state.board.entries) {
    let line = logged.get(entry.id)
    if (line === undefined) {
      line = document.createElement('div')
      logged.set(entry.id, line)
      log.appendChild(line)
      while (log.children.length > MAX_LOG_LINES) {
        const oldest = log.firstElementChild
        if (oldest === null) break
        for (const [id, el] of logged) {
          if (el === oldest) {
            logged.delete(id)
            break
          }
        }
        log.removeChild(oldest)
      }
    }
    const running = entry.status === 'run'
    const took = entry.endedAt === undefined ? '…' : `${Math.max(0, entry.endedAt - entry.startedAt)}ms`
    const mark = entry.mark === 'switch' ? '◆' : entry.mark === 'done' ? '●' : running ? '●' : entry.status === 'ok' ? '·' : '✕'
    line.className = `logline${entry.status === 'err' || entry.status === 'block' ? ' err' : entry.mark !== undefined || running ? ' link' : ''}`
    line.innerHTML = `<span class="stamp">${escapeHtml(clockOf(entry.startedAt))}</span><span class="mark">${mark}</span><span class="where">${escapeHtml(t.stations[entry.station])}</span><span class="what">${escapeHtml(entry.label)}</span><span class="howlong">${escapeHtml(took)}</span>`
  }
}

/** Builds the setup from the host's words and the header's, and makes the page follow its theme. */
function applySetup(): void {
  state.setup = setupFrom({ ...rawSetup, ...overrides })
  document.documentElement.dataset.theme = state.setup.theme
  syncHeader()
  render(true)
}

/** The menu says what is in force: the setup's own values, defaults included, so no field is blank. */
function syncHeader(): void {
  const s = state.setup
  if (s === undefined) return
  const language = { ...rawSetup, ...overrides }.language
  const shown = { theme: s.theme, layout: s.layout, motion: s.motion, pace: s.pace, language: String(language ?? 'en') }
  for (const id of ['theme', 'layout', 'motion', 'pace', 'language'] as const) {
    const el = document.getElementById(id)
    if (el instanceof HTMLSelectElement && el.value !== shown[id]) el.value = shown[id]
  }
}

/** The one setup frame, before the first board: the words and colors the person set on the host.
 *  A malformed one is skipped and the defaults take its place — the map draws either way. */
function takeSetup(raw: unknown): void {
  for (const key of Object.keys(rawSetup)) delete rawSetup[key]
  if (raw !== undefined && typeof raw === 'object' && raw !== null) {
    Object.assign(rawSetup, raw as Record<string, unknown>)
  }
  applySetup()
}

function render(force: boolean): void {
  if (!force && state.clock - lastDrawn < REDRAW_MS && lastDrawn >= 0) return
  lastDrawn = state.clock
  if (state.board === undefined || state.setup === undefined) return
  const view: ViewProjection = projectView(state.board, Date.now(), state.setup, {
    hidden: state.minimized,
  })
  renderView(view, {
    show: () => {
      state.minimized = false
      render(true)
    },
    zoomOut: () => render(true),
    zoomIn: () => render(true),
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
  renderLog() // every call keeps its own line: the log only ever grows
  lastDrawn = -1 // a board landed: the map is drawn now, whatever the beat says
  markConnection(true)
})
stream.onopen = () => markConnection(true)
// The host gone: the map freezes on its last board, the word turns, and the stream reconnects itself.
stream.onerror = () => markConnection(false)

// The side menu: the three bars on the right edge open it, the scrim or the Escape key closes it.
{
  const button = document.getElementById('menubtn')
  const scrim = document.getElementById('scrim')
  const setMenu = (open: boolean): void => {
    document.body.classList.toggle('menu-open', open)
    if (button !== null) button.setAttribute('aria-expanded', String(open))
  }
  if (button !== null) button.onclick = () => setMenu(!document.body.classList.contains('menu-open'))
  if (scrim !== null) scrim.onclick = () => setMenu(false)
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') setMenu(false)
  })
}

// The menu's options: whatever the person picks here wins over the host's setup words, and holds
// across reconnects until the person picks again. syncHeader leaves an override alone — the select
// shows the host's choice only where the person has not made one.
{
  const language = document.getElementById('language')
  if (language instanceof HTMLSelectElement) {
    for (const l of LANGUAGES) language.add(new Option(l, l))
  }
  for (const id of ['theme', 'layout', 'motion', 'pace', 'language'] as const) {
    const el = document.getElementById(id)
    if (el instanceof HTMLSelectElement) {
      el.onchange = () => {
        overrides[id] = el.value
        applySetup()
      }
    }
  }
}

function frame(): void {
  state.clock = Date.now()
  render(false)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
