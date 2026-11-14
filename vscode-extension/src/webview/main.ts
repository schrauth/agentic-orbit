// The map in the webview: it renders what the extension host sends, and nothing else.
// All words and figures are computed there, from the mod's own text tables, so this file holds no strings of its own.
declare const acquireVsCodeApi: () => { postMessage: (m: unknown) => void }
const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : undefined

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

type ViewModel = {
  type: 'view'
  svg: string
  alt: string
  nowline: string
  counts: string
  rows: RowView[]
  hidden: boolean
  /** The width the map is drawn at, in CSS pixels; absent, as wide as the pane. */
  width?: number
  /** The width the map is drawn at by nature, in CSS pixels, for its widest default size. */
  mapWidth: number
  aspect: number
  /** The pane's buttons' names, sent by the extension host; the webview holds no words of its own. */
  labels: { zoomOut: string; zoomIn: string; hideMap: string; showMap: string }
}

let view: ViewModel | undefined
let expanded: string | undefined

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch)
}

function render(): void {
  if (view === undefined) return
  const map = document.getElementById('map')
  const feed = document.getElementById('feed')
  const nowline = document.getElementById('nowline')
  const buttons = document.getElementById('buttons')
  if (map === null || feed === null || nowline === null || buttons === null) return

  if (view.hidden) {
    map.innerHTML = ''
    feed.innerHTML = ''
    nowline.textContent = ''
    buttons.innerHTML = `<button id="show" class="btn" title="${escapeHtml(view.labels.showMap)}" aria-label="${escapeHtml(view.labels.showMap)}">▢</button>`
    bind('show', () => vscode?.postMessage({ type: 'minimize', value: false }))
    return
  }

  map.innerHTML = view.svg
  const svg = map.querySelector('svg')
  if (svg !== null) {
    svg.setAttribute('role', 'img')
    svg.setAttribute('aria-label', view.alt)
    svg.style.width = view.width === undefined ? '100%' : `${view.width}px`
    svg.style.maxWidth = view.width === undefined ? `${view.mapWidth}px` : '100%'
    svg.style.height = 'auto'
  }
  document.getElementById('counts')!.textContent = view.counts
  feed.innerHTML = view.rows
    .map(row => {
      const text = `${row.mark} ${row.station}  ${row.label}${row.times > 1 ? `  +${row.times - 1}` : ''}`
      const time = row.took !== '' ? `<span class="time">${escapeHtml(row.took)}</span>` : ''
      const cls = `row${row.dim ? ' dim' : ''}${row.color === 'err' ? ' err' : row.color === 'link' ? ' link' : ''}`
      return `<div class="${cls}"${row.isLong ? ` data-id="${escapeHtml(row.id)}" role="button" tabindex="0"` : ''}><span class="label">${escapeHtml(text)}</span>${time}</div>`
    })
    .join('')
  nowline.textContent = view.nowline
  buttons.innerHTML = `<button id="zoom-out" class="btn" title="${escapeHtml(view.labels.zoomOut)}" aria-label="${escapeHtml(view.labels.zoomOut)}">–</button><button id="zoom-in" class="btn" title="${escapeHtml(view.labels.zoomIn)}" aria-label="${escapeHtml(view.labels.zoomIn)}">+</button><button id="hide" class="btn" title="${escapeHtml(view.labels.hideMap)}" aria-label="${escapeHtml(view.labels.hideMap)}">×</button>`
  bind('zoom-out', () => vscode?.postMessage({ type: 'zoom', by: -1 }))
  bind('zoom-in', () => vscode?.postMessage({ type: 'zoom', by: 1 }))
  bind('hide', () => vscode?.postMessage({ type: 'minimize', value: true }))

  for (const row of feed.querySelectorAll<HTMLDivElement>('.row[data-id]')) {
    const toggle = () => {
      expanded = expanded === row.dataset.id ? undefined : row.dataset.id
      row.classList.toggle('open', expanded === row.dataset.id)
    }
    row.onclick = toggle
    row.onkeydown = e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        toggle()
      }
    }
  }
}

function bind(id: string, onPress: () => void): void {
  const el = document.getElementById(id)
  if (el !== null) el.onclick = onPress
}

window.addEventListener('message', (e: MessageEvent) => {
  const message = e.data as ViewModel
  if (message?.type !== 'view') return
  view = message
  render()
})
