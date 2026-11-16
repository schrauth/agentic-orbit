// The panel beside the editor: it owns the webview and sends it the map, drawn by the extension's own drawing,
// every time the board changes and once a second while something runs, so the map's own animations carry on.
import * as vscode from 'vscode'
import type { Board } from '../../types'
import { projectView } from '../../hooks/view'
import { setupFrom } from '../../hooks/setup'
import type { Setup } from '../../hooks/setup'
import { LANGUAGES } from '../../hooks/text'

/** The widths, in CSS pixels, the map may be drawn at; past the last it is as wide as the pane. */
const ZOOMS = [180, 220, 260, 310, 370, 440, 530, 570, 620, 660]

export class AgenticOrbitPanel {
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
    this.panel = vscode.window.createWebviewPanel('agenticOrbit', 'Agentic Orbit', vscode.ViewColumn.Beside, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'out', 'vscode-extension', 'src', 'webview')],
    })
    this.panel.webview.html = this.html(this.panel.webview, extensionUri, options().language)
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

  /** One step of zoom out (-1) or in (+1) from a width; past the last step the map is as wide as the pane. */
  zoomStep(by: -1 | 1): void {
    const at = this.zoom === undefined ? ZOOMS.length : ZOOMS.indexOf(this.zoom)
    this.zoom = ZOOMS[Math.min(ZOOMS.length, Math.max(0, (at < 0 ? ZOOMS.length : at) + by))]
    this.send()
  }

  private send(): void {
    if (this.disposed) return
    this.panel.webview.postMessage(projectView(this.board, Date.now(), this.setup, { hidden: this.minimized, width: this.zoom }))
  }

  private html(webview: vscode.Webview, extensionUri: vscode.Uri, language: unknown): string {
    const base = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'out', 'vscode-extension', 'src', 'webview'))
    const lang = typeof language === 'string' && LANGUAGES.includes(language) ? language : 'en'
    return `<!DOCTYPE html>
<html lang="${lang}">
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
