import type { ViewProjection } from '../types'

export type RenderActions = {
  show: () => void
  zoomOut: () => void
  zoomIn: () => void
  hide: () => void
}

let expanded: string | undefined

export function renderView(view: ViewProjection, actions: RenderActions): void {
  const map = document.getElementById('map')
  const feed = document.getElementById('feed')
  const nowline = document.getElementById('nowline')
  const buttons = document.getElementById('buttons')
  const counts = document.getElementById('counts')
  if (map === null || feed === null || nowline === null || buttons === null || counts === null) return

  if (view.hidden) {
    map.innerHTML = ''
    feed.innerHTML = ''
    nowline.textContent = ''
    buttons.innerHTML = `<button id="show" class="btn" title="${escapeHtml(view.labels.showMap)}" aria-label="${escapeHtml(view.labels.showMap)}">▢</button>`
    bind('show', actions.show)
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
  counts.textContent = view.counts
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
  bind('zoom-out', actions.zoomOut)
  bind('zoom-in', actions.zoomIn)
  bind('hide', actions.hide)

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

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch)
}
