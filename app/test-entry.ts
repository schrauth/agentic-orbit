// The test door: what the app's tests may reach — the event→board core with its classification,
// the writer, the manifest, the proxy, the HTTP face, and the events-file resolution the CLI
// leans on. Nothing else of the app is importable in tests.
export { serveCore } from './server'
export { serveHttp, listenHttp } from './http'
export { eventsFileFor, parseEvents } from './hookWatcher'
export { applyHookEvent, emptyState } from './eventApplier'
export { modelStepEvent, appendEvent } from './eventWriter'
export { classifyCopilot } from './classifyCopilot'
export { emptyBoard, transitionBoard } from './board'
export { HOOK_EVENTS, hookJson } from './hookManifest'
export { startProxy } from './proxy'
export { setupFrom } from '../hooks/setup'
export { classifyShell } from '../hooks/classify'
export { projectView } from '../hooks/view'
export { foldRows, nowParts, describeNow } from '../hooks/feed'
export { routeOf } from '../hooks/draw'
