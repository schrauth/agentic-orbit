// The test door: what the host tests may reach — the event→board core, its HTTP face, and the
// events-file resolution the CLI leans on. Nothing else of the host is importable in tests.
export { serveCore } from './server'
export { serveHttp, listenHttp } from './http'
export { eventsFileFor } from '../vscode-extension/src/hookWatcher'
