import type { ViewProjection } from '../../../types'
import { renderView } from './render'

declare const acquireVsCodeApi: () => { postMessage: (m: unknown) => void }
const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : undefined

window.addEventListener('message', (e: MessageEvent) => {
  const message = e.data as ViewProjection
  if (message?.type !== 'view') return
  renderView(message, {
    show: () => vscode?.postMessage({ type: 'minimize', value: false }),
    zoomOut: () => vscode?.postMessage({ type: 'zoom', by: -1 }),
    zoomIn: () => vscode?.postMessage({ type: 'zoom', by: 1 }),
    hide: () => vscode?.postMessage({ type: 'minimize', value: true }),
  })
})
