// The panel beside the editor: it owns the webview and sends it the map, drawn by the mod's own drawing,
// every time the board changes and once a second while something runs, so the map's own animations carry on.
import * as vscode from 'vscode'
import type { Board } from '../../types'
import { MAP_ASPECT, STATIONS, describeNow, drawMap, foldRows, formatMs, nowParts } from '../../hooks/map'
import { setupFrom } from '../../hooks/setup'
import type { Setup } from '../../hooks/setup'

/** The widths, in CSS pixels, the map may be drawn at; past the last it is as wide as the pane. */
const ZOOMS = [160, 200, 240, 280, 340, 400]
const LONG_LABEL = 28
/** A label longer than this may not fit the pane, so its row gets a control that opens it. */

type RowView = {
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

export class LotMapPanel {
  private readonly panel: vscode.WebviewPanel
  private readonly setup: Setup
  private board: Board
  private minimized = false
  private zoom: number | undefined
  private timer: NodeJS.Timeout | undefined
  private disposed = false

  constructor(
    extensionUri: vscode.Uri,
    board: Board,
    options: () => Record<string, unknown>,
    onMessage?: (m: { type: string; by?: number; value?: boolean }) => void,
  ) {
    this.board = board
    this.setup = setupFrom(options())
    this.panel = vscode.window.createWebviewPanel('lotMap', this.setup.t.title, vscode.ViewColumn.Beside, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'out', 'vscode-extension', 'src', 'webview')],
    })
    this.panel.webview.html = this.html(this.panel.webview, extensionUri)
    this.panel.webview.onDidReceiveMessage(m => onMessage?.(m as { type: string }))
    this.panel.onDidDispose(() => {
      this.disposed = true
      if (this.timer !== undefined) clearInterval(this.timer)
    })
    // Once a second while something runs, so the map's clock hands and fades carry on by themselves.
    this.timer = setInterval(() => {
      if (!this.disposed && this.board.entries.some(e => e.status === 'run')) this.send()
    }, 1000)
    this.send()
  }

  reveal(): void {
    if (this.disposed) return
    this.panel.reveal()
    this.send()
  }

  /** The board changed: the map is drawn anew. */
  update(board: Board): void {
    this.board = board
    this.send()
  }

  setMinimized(value: boolean): void {
    this.minimized = value
    this.send()
  }

  dispose(): void {
    this.panel.dispose()
  }

  /** One step of zoom out (-1) or in (+1) from a width; the last width is the pane's whole width. */
  zoomStep(by: -1 | 1): void {
    const at = this.zoom === undefined ? ZOOMS.length : ZOOMS.indexOf(this.zoom)
    this.zoom = ZOOMS[Math.min(ZOOMS.length, Math.max(0, (at < 0 ? ZOOMS.length : at) + by))]
    this.send()
  }

  private send(): void {
    if (this.disposed) return
    const now = Date.now()
    const { t } = this.setup
    const board = this.board

    // How long each answer took, from the person's message to it.
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

    const svg = this.minimized ? '' : drawMap(board, now, this.setup)
    const width = this.zoom
    this.panel.webview.postMessage({
      type: 'view',
      svg,
      alt: `${t.title}. ${describeNow(board, t)}`,
      nowline: `${now2.what}${meter === '' ? '' : `   ${meter}`}`,
      counts,
      rows,
      hidden: this.minimized,
      width,
      aspect: MAP_ASPECT,
    })
  }

  private html(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const base = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'out', 'vscode-extension', 'src', 'webview'))
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; img-src ${webview.cspSource} data:; script-src ${webview.cspSource};">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${base}/main.css">
</head>
<body>
<div id="map"></div>
<div id="nowline"></div>
<div id="counts"></div>
<div id="buttons"></div>
<div id="feed"></div>
<script src="${base}/main.js"></script>
</body>
</html>`
  }
}

/** `gpt-4.1-mini` reads shorter here; the mod's own shortener knows Claude's names, this one the rest. */
function shortOf(model: string): string {
  return model.length <= 14 ? model : `${model.slice(0, 13)}…`
}
