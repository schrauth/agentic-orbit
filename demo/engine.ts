// The fake backend of the browser demo: it replays made-up hook events through the same board and the
// same drawing the extension uses, so a design can be judged without installing anything.
// Nothing here ships in the extension, and nothing here reads a file, starts a process or sends anything.
// The events carry names and figures only, made up for the demo: no code, no prompts, no content.
import type { Board } from '../types'
import { MAP_ASPECT, MAP_WIDTH, STATIONS, describeNow, drawMap, foldRows, formatMs, nowParts, shortModel } from '../hooks/map'
import { setupFrom } from '../hooks/setup'
import type { Setup } from '../hooks/setup'
import { agentDone, begin, clearFaults, emptyBoard, finish, sweepOpen, withContext } from '../vscode-extension/src/board'
import { classifyCopilot } from '../vscode-extension/src/classifyCopilot'

/** What the workspace hook writes in one line; the demo's events have the same shape, with made-up values. */
export type FakeEvent = {
  event: string
  callId?: string
  agentId?: string
  tool?: string
  model?: string
  error?: boolean
  aborted?: boolean
  description?: string
  commandName?: string
  filePath?: string
  url?: string
}

/** One beat of a scenario: a hook event, a model step the proxy would have measured, or both, `at` ms after it starts. */
export type Step = { at: number; ev?: FakeEvent; tel?: { model: string; promptTokens: number } }
export type Scenario = { name: string; steps: Step[] }

/** The context window the demo assumes, like the extension's own default. */
const CONTEXT_LIMIT = 128000

/** The widths, in CSS pixels, the map may be drawn at; the same ladder the panel uses. */
export const ZOOMS = [180, 220, 260, 310, 370, 440, 530, 570, 620, 660]
const LONG_LABEL = 28

/** A turn of the demo clock. `at` is ms from the scenario's start; the absolute stamp is `base + at`. */
export class FakeSession {
  board: Board = emptyBoard()
  private readonly open = new Map<string, string>()
  private lastModel: string | undefined

  constructor(private readonly base: number) {}

  reset(): void {
    this.board = emptyBoard()
    this.open.clear()
    this.lastModel = undefined
  }

  /** One hook event, applied exactly as the extension host applies it: the same switch, the same calls. */
  apply(e: FakeEvent, at: number, setup: Setup): void {
    const now = this.base + at
    switch (e.event) {
      case 'sessionStart': {
        this.board = emptyBoard()
        if (e.model !== undefined) {
          const before = this.lastModel
          this.lastModel = e.model
          if (before !== undefined && before !== e.model) {
            this.board = begin(this.board, { station: 'model', label: `${shortModel(before)} → ${shortModel(e.model)}`, status: 'ok', mark: 'switch', uncounted: true }, now).board
          }
        }
        break
      }
      case 'userPromptSubmitted': {
        this.board = clearFaults(this.board)
        this.board = begin(this.board, { station: 'you', label: setup.t.newMessage, from: 'inbound', status: 'ok' }, now).board
        break
      }
      case 'preToolUse': {
        const { station, label } = classifyCopilot(e.tool ?? '', { description: e.description, command: e.commandName, url: e.url, file_path: e.filePath }, setup)
        const started = begin(
          this.board,
          { station, label, ...(e.agentId !== undefined ? { from: 'agents' as const, agentId: e.agentId, ...(station === 'agents' ? { agentName: label } : {}) } : {}) },
          now,
        )
        this.board = started.board
        if (e.callId !== undefined) this.open.set(e.callId, started.id)
        break
      }
      case 'postToolUse': {
        const id = e.callId !== undefined ? this.open.get(e.callId) : undefined
        if (e.callId !== undefined) this.open.delete(e.callId)
        this.board = finish(this.board, id, e.error === true ? 'err' : 'ok', now)
        break
      }
      case 'agentStop': {
        if (e.agentId !== undefined) {
          this.board = agentDone(this.board, e.agentId, now)
        } else {
          this.board = sweepOpen(this.board, now)
          const aborted = e.aborted === true
          this.board = begin(this.board, { station: 'you', label: aborted ? setup.t.turnAborted : setup.t.answerReady, status: aborted ? 'err' : 'ok', ...(aborted ? {} : { mark: 'done' as const }) }, now).board
        }
        break
      }
      case 'errorOccurred': {
        const { station, label } = classifyCopilot(e.tool ?? '', { description: e.description, command: e.commandName, url: e.url, file_path: e.filePath }, setup)
        const id = e.callId !== undefined ? this.open.get(e.callId) : undefined
        if (e.callId !== undefined) this.open.delete(e.callId)
        if (id !== undefined) {
          this.board = finish(this.board, id, 'err', now)
        } else {
          this.board = begin(this.board, { station, label: e.tool ?? label, status: 'err', startedAt: now, endedAt: now }, now).board
        }
        break
      }
      default:
        return // An event the map does not know: dropped, never an error.
    }
  }

  /** What the loopback proxy would have measured: a model step and the context it saw. */
  telemetry(model: string, promptTokens: number, at: number, setup: Setup): void {
    const now = this.base + at
    const step = (this.board.step ?? 0) + 1
    const started = begin(this.board, { station: 'model', label: `${shortModel(model) || model || 'model'} · ${setup.t.step(step)}`, patch: { model, step } }, now)
    this.board = finish(withContext(started.board, promptTokens, CONTEXT_LIMIT), started.id, 'ok', now)
  }
}

// ---- the view the panel sends the webview -------------------------------------------------------------------

export type RowView = {
  id: string
  mark: string
  station: string
  label: string
  times: number
  took: string
  color: 'link' | 'fg' | 'err'
  dim: boolean
  isLong: boolean
}

export type View = {
  type: 'view'
  svg: string
  alt: string
  nowline: string
  counts: string
  rows: RowView[]
  hidden: boolean
  width?: number
  mapWidth: number
  aspect: number
  labels: { zoomOut: string; zoomIn: string; hideMap: string; showMap: string }
}

/** The same view model `panel.ts` sends: the drawing, the line of what runs now, the counts and the rows. */
export function buildView(board: Board, now: number, setup: Setup, width?: number, minimized = false): View {
  const { t } = setup

  const turnMs = new Map<string, number>()
  let askedAt: number | undefined
  for (const x of board.entries) {
    if (x.station === 'you' && x.from === 'inbound' && x.mark === undefined) askedAt = x.startedAt
    if (x.mark === 'done' && askedAt !== undefined) {
      turnMs.set(x.id, x.startedAt - askedAt)
      askedAt = undefined
    }
  }

  const rows: RowView[] = foldRows(board.entries, 16)
    .map(({ entry, times, tookMs }) => {
      const isSwitch = entry.mark === 'switch'
      const mark = isSwitch ? '◆' : entry.status === 'run' ? '●' : entry.status === 'ok' ? '·' : '✕'
      const whole = turnMs.get(entry.id)
      const took =
        entry.endedAt === undefined
          ? t.running
          : whole !== undefined && whole > 0
            ? formatMs(whole, t)
            : tookMs > 0
              ? formatMs(tookMs, t)
              : '—'
      return {
        id: entry.id,
        mark,
        station: t.stations[entry.station],
        label: entry.label,
        times,
        took: took === '—' ? '' : took,
        color: isSwitch || entry.status === 'run' ? ('link' as const) : entry.status === 'ok' ? ('fg' as const) : ('err' as const),
        dim: entry.status === 'ok' && !isSwitch,
        isLong: entry.label.length > LONG_LABEL,
      }
    })
    .reverse()

  const now2 = nowParts(board, t)
  const meter = [board.context === undefined ? '' : `${Math.round(board.context)}%`, board.model === undefined || now2.what.startsWith(t.stations.model) ? '' : shortOf(board.model)]
    .filter(Boolean)
    .join(' · ')
  const counts = STATIONS.filter(s => (board.counts[s.id] ?? 0) > 0)
    .map(s => `${t.stations[s.id]} ${board.counts[s.id]}`)
    .join(' · ')

  return {
    type: 'view',
    svg: minimized ? '' : drawMap(board, now, setup),
    alt: `${t.title}. ${describeNow(board, t)}`,
    nowline: `${now2.what}${meter === '' ? '' : `   ${meter}`}`,
    counts,
    rows,
    hidden: minimized,
    width,
    aspect: MAP_ASPECT,
    mapWidth: MAP_WIDTH,
    labels: { zoomOut: t.zoomOut, zoomIn: t.zoomIn, hideMap: t.hideMap, showMap: t.showMap },
  }
}

/** The rows under the map, as the webview renders them. */
export function rowsHtml(view: View): string {
  return view.rows
    .map(row => {
      const text = `${row.mark} ${row.station}  ${row.label}${row.times > 1 ? `  +${row.times - 1}` : ''}`
      const time = row.took !== '' ? `<span class="time">${escapeHtml(row.took)}</span>` : ''
      const cls = `row${row.dim ? ' dim' : ''}${row.color === 'err' ? ' err' : row.color === 'link' ? ' link' : ''}`
      return `<div class="${cls}"${row.isLong ? ` data-id="${escapeHtml(row.id)}" role="button" tabindex="0"` : ''}><span class="label">${escapeHtml(text)}</span>${time}</div>`
    })
    .join('')
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch)
}

/** The options the demo's controls hold, made into the same `Setup` the extension makes of its own. */
export function demoSetup(options: { theme?: string; layout?: string; motion?: string; pace?: string; language?: string }): Setup {
  return setupFrom({
    language: options.language ?? 'en',
    theme: options.theme ?? 'dark',
    layout: options.layout ?? 'you-top',
    motion: options.motion ?? 'full',
    pace: options.pace ?? 'normal',
    coreName: 'COPILOT',
    background: 'solid',
  })
}

/** `gpt-4.1-mini` reads shorter here; the same shortener the panel uses for the line of what runs now. */
function shortOf(model: string): string {
  return model.length <= 14 ? model : `${model.slice(0, 13)}…`
}

// ---- the scenarios -------------------------------------------------------------------------------------------

const ev = (at: number, event: string, extra: Partial<FakeEvent> = {}): Step => ({ at, ev: { event, ...extra } })
const tel = (at: number, model: string, promptTokens: number): Step => ({ at, tel: { model, promptTokens } })

/** A plain turn, the way most of them go: a read, a search, an edit, a test run, the answer. */
const calmTurn: Scenario = {
  name: 'A calm turn',
  steps: [
    ev(0, 'sessionStart', { model: 'gpt-5.2' }),
    ev(900, 'userPromptSubmitted'),
    tel(2200, 'gpt-5.2', 9_000),
    ev(2600, 'preToolUse', { tool: 'read_file', callId: 'c1', filePath: 'src/board.ts' }),
    ev(3400, 'postToolUse', { callId: 'c1' }),
    tel(3800, 'gpt-5.2', 15_000),
    ev(4200, 'preToolUse', { tool: 'web_search', callId: 'c2' }),
    ev(5600, 'postToolUse', { callId: 'c2' }),
    ev(6200, 'preToolUse', { tool: 'edit_file', callId: 'c3', filePath: 'src/board.ts' }),
    ev(7100, 'postToolUse', { callId: 'c3' }),
    tel(7800, 'gpt-5.2', 24_000),
    ev(8300, 'preToolUse', { tool: 'run_in_terminal', callId: 'c4', commandName: 'npm', description: 'run the tests' }),
    ev(11_500, 'postToolUse', { callId: 'c4' }),
    tel(12_400, 'gpt-5.2', 31_000),
    ev(13_000, 'preToolUse', { tool: 'read_file', callId: 'c5', filePath: 'hooks/draw.ts' }),
    ev(13_900, 'postToolUse', { callId: 'c5' }),
    ev(16_000, 'agentStop'),
    tel(16_400, 'gpt-5.2', 34_000),
  ],
}

/** Ten subagents in three overlapping waves, up to six alive at once: their planets circle the Agents station together. */
const subagentStorm: Scenario = {
  name: 'Subagent storm',
  steps: [
    ev(0, 'sessionStart', { model: 'gpt-5.2' }),
    ev(1000, 'userPromptSubmitted'),
    // Wave 1 — three planets lift off.
    ev(1200, 'preToolUse', { tool: 'task', callId: 's1t', agentId: 's1', description: 'gather sources' }),
    ev(1400, 'postToolUse', { callId: 's1t' }),
    ev(1600, 'preToolUse', { tool: 'task', callId: 's2t', agentId: 's2', description: 'build tables' }),
    ev(1800, 'postToolUse', { callId: 's2t' }),
    ev(2000, 'preToolUse', { tool: 'read_file', callId: 's1a', agentId: 's1', filePath: '/tmp/storm/sources.md' }),
    ev(2600, 'postToolUse', { callId: 's1a' }),
    ev(2400, 'preToolUse', { tool: 'task', callId: 's3t', agentId: 's3', description: 'read tests' }),
    ev(2600, 'postToolUse', { callId: 's3t' }),
    ev(2800, 'preToolUse', { tool: 'run_in_terminal', callId: 's2a', agentId: 's2', commandName: 'date', description: 'print the time' }),
    ev(3600, 'postToolUse', { callId: 's2a' }),
    // Wave 2 — three more; every orbit ring taken.
    ev(3200, 'preToolUse', { tool: 'task', callId: 's4t', agentId: 's4', description: 'scan images' }),
    ev(3400, 'postToolUse', { callId: 's4t' }),
    ev(3600, 'preToolUse', { tool: 'task', callId: 's5t', agentId: 's5', description: 'review texts' }),
    ev(3800, 'postToolUse', { callId: 's5t' }),
    ev(4000, 'preToolUse', { tool: 'read_file', callId: 's3a', agentId: 's3', filePath: '/tmp/storm/tests.spec.md' }),
    ev(4600, 'postToolUse', { callId: 's3a' }),
    ev(4400, 'preToolUse', { tool: 'task', callId: 's6t', agentId: 's6', description: 'compare numbers' }),
    ev(4600, 'postToolUse', { callId: 's6t' }),
    ev(4800, 'preToolUse', { tool: 'run_in_terminal', callId: 's4a', agentId: 's4', commandName: 'curl', description: 'ask a page for its headers' }),
    ev(5800, 'postToolUse', { callId: 's4a' }),
    ev(5200, 'preToolUse', { tool: 'read_file', callId: 's4b', agentId: 's4', filePath: '/tmp/storm/images.svg' }),
    ev(5600, 'postToolUse', { callId: 's4b' }),
    // Wave 3 — planets go, new ones come.
    ev(6000, 'agentStop', { agentId: 's1' }),
    ev(6200, 'preToolUse', { tool: 'read_file', callId: 's5a', agentId: 's5', filePath: '/tmp/storm/text.txt' }),
    ev(6800, 'postToolUse', { callId: 's5a' }),
    ev(6600, 'agentStop', { agentId: 's2' }),
    ev(6800, 'preToolUse', { tool: 'task', callId: 's7t', agentId: 's7', description: 'file notes' }),
    ev(7000, 'postToolUse', { callId: 's7t' }),
    ev(7200, 'preToolUse', { tool: 'run_in_terminal', callId: 's6a', agentId: 's6', commandName: 'date', description: 'print the time' }),
    ev(8000, 'postToolUse', { callId: 's6a', error: true }),
    ev(7600, 'agentStop', { agentId: 's3' }),
    ev(7800, 'preToolUse', { tool: 'read_file', callId: 's7a', agentId: 's7', filePath: '/tmp/storm/notes.md' }),
    ev(8300, 'postToolUse', { callId: 's7a' }),
    ev(8200, 'agentStop', { agentId: 's4' }),
    ev(8400, 'preToolUse', { tool: 'task', callId: 's8t', agentId: 's8', description: 'final polish' }),
    ev(8600, 'postToolUse', { callId: 's8t' }),
    ev(8800, 'agentStop', { agentId: 's5' }),
    ev(9000, 'preToolUse', { tool: 'run_in_terminal', callId: 's8a', agentId: 's8', commandName: 'cat', description: 'read the report' }),
    ev(9600, 'postToolUse', { callId: 's8a' }),
    ev(9400, 'agentStop', { agentId: 's6' }),
    ev(9600, 'preToolUse', { tool: 'task', callId: 's9t', agentId: 's9', description: 'collect reports' }),
    ev(9800, 'postToolUse', { callId: 's9t' }),
    ev(10_000, 'agentStop', { agentId: 's7' }),
    ev(10_200, 'preToolUse', { tool: 'read_file', callId: 's9a', agentId: 's9', filePath: '/tmp/storm/report.md' }),
    ev(10_800, 'postToolUse', { callId: 's9a' }),
    ev(10_600, 'agentStop', { agentId: 's8' }),
    ev(10_800, 'preToolUse', { tool: 'task', callId: 's10t', agentId: 's10', description: 'last round' }),
    ev(11_000, 'postToolUse', { callId: 's10t' }),
    ev(11_200, 'agentStop', { agentId: 's9' }),
    ev(11_400, 'preToolUse', { tool: 'run_in_terminal', callId: 's10a', agentId: 's10', commandName: 'date', description: 'print the time' }),
    ev(11_800, 'postToolUse', { callId: 's10a' }),
    ev(11_800, 'preToolUse', { tool: 'read_file', callId: 's10b', agentId: 's10', filePath: '/tmp/storm/round.md' }),
    ev(12_200, 'postToolUse', { callId: 's10b' }),
    ev(12_400, 'agentStop', { agentId: 's10' }),
    ev(13_000, 'agentStop'),
  ],
}

/** What goes wrong on the way to an answer: a failed command, a tool error, a question, an interrupted turn, then a clean one. */
const errorsAndRefusals: Scenario = {
  name: 'Errors and refusals',
  steps: [
    ev(0, 'sessionStart', { model: 'gpt-5.2' }),
    ev(800, 'userPromptSubmitted'),
    ev(2000, 'preToolUse', { tool: 'read_file', callId: 'e1', filePath: 'src/board.ts' }),
    ev(2700, 'postToolUse', { callId: 'e1' }),
    ev(4000, 'preToolUse', { tool: 'run_in_terminal', callId: 'e2', commandName: 'npm', description: 'run the build' }),
    ev(5600, 'postToolUse', { callId: 'e2', error: true }),
    ev(7000, 'preToolUse', { tool: 'fetch_webpage', callId: 'e3', url: 'https://example.com/docs' }),
    ev(8100, 'postToolUse', { callId: 'e3' }),
    ev(9500, 'errorOccurred', { tool: 'fetch_webpage', url: 'https://example.com/missing' }),
    ev(11_000, 'preToolUse', { tool: 'ask_followup_question', callId: 'e4' }),
    ev(11_600, 'postToolUse', { callId: 'e4' }),
    ev(13_000, 'agentStop', { aborted: true }),
    // A new message clears the faults; the next turn goes clean.
    ev(15_000, 'userPromptSubmitted'),
    ev(16_200, 'preToolUse', { tool: 'edit_file', callId: 'e5', filePath: 'src/board.ts' }),
    ev(17_000, 'postToolUse', { callId: 'e5' }),
    ev(18_200, 'preToolUse', { tool: 'run_in_terminal', callId: 'e6', commandName: 'npm', description: 'run the tests' }),
    ev(21_000, 'postToolUse', { callId: 'e6' }),
    ev(22_000, 'agentStop'),
  ],
}

/** The context window filling up over a long turn, until the ring around the centre is nearly whole. */
const contextFillsUp: Scenario = {
  name: 'Context fills up',
  steps: [
    ev(0, 'sessionStart', { model: 'gpt-5.2' }),
    ev(900, 'userPromptSubmitted'),
    tel(2400, 'gpt-5.2', 8_000),
    ev(2600, 'preToolUse', { tool: 'read_file', callId: 'x1', filePath: 'src/extension.ts' }),
    ev(3500, 'postToolUse', { callId: 'x1' }),
    tel(4000, 'gpt-5.2', 21_000),
    ev(4200, 'preToolUse', { tool: 'grep_search', callId: 'x2' }),
    ev(5000, 'postToolUse', { callId: 'x2' }),
    tel(5500, 'gpt-5.2', 37_000),
    ev(5700, 'preToolUse', { tool: 'read_file', callId: 'x3', filePath: 'src/panel.ts' }),
    ev(6600, 'postToolUse', { callId: 'x3' }),
    tel(7000, 'gpt-5.2', 52_000),
    ev(7200, 'preToolUse', { tool: 'web_search', callId: 'x4' }),
    ev(8300, 'postToolUse', { callId: 'x4' }),
    tel(8800, 'gpt-5.2', 68_000),
    tel(10_000, 'gpt-5.2', 81_000),
    ev(10_200, 'preToolUse', { tool: 'read_file', callId: 'x5', filePath: 'hooks/feed.ts' }),
    ev(11_000, 'postToolUse', { callId: 'x5' }),
    tel(11_500, 'gpt-5.2', 92_000),
    tel(13_000, 'gpt-5.2', 100_000),
    tel(14_500, 'gpt-5.2', 118_000),
    ev(15_000, 'agentStop'),
  ],
}

export const SCENARIOS: Scenario[] = [calmTurn, subagentStorm, errorsAndRefusals, contextFillsUp]

/** When a scenario is over — the last beat played, nothing to wait for but the planets' stay. */
export function scenarioEnd(s: Scenario): number {
  return s.steps.reduce((last, step) => Math.max(last, step.at), 0)
}
