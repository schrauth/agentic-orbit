const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const { classifyShell } = require('../out/hooks/classify.js')
const { projectView } = require('../out/hooks/view.js')
const { setupFrom } = require('../out/hooks/setup.js')
const { emptyBoard, transitionBoard } = require('../out/vscode-extension/src/board.js')
const { HOOK_EVENTS, hookJson } = require('../out/vscode-extension/src/hookManifest.js')

test('shell classification keeps wrappers, nested network calls, and PowerShell file commands', () => {
  const setup = setupFrom()

  assert.equal(classifyShell('sudo env MODE=1 timeout 5 curl -I https://example.com', 'fetch', setup).station, 'web')
  assert.equal(classifyShell('echo "$(curl -I https://example.com)"', 'fetch', setup).station, 'web')
  assert.equal(classifyShell('Get-Content .\\README.md', '', setup, true).station, 'files')
})

test('board transitions preserve call counts, errors, and turn completion', () => {
  let board = transitionBoard(emptyBoard(), { type: 'prompt', label: 'new message' }, 1000).board
  const started = transitionBoard(board, { type: 'entryStarted', start: { station: 'files', label: 'README.md' } }, 1100)
  board = transitionBoard(started.board, { type: 'entryFinished', id: started.id, status: 'err' }, 1300).board
  board = transitionBoard(board, { type: 'turnFinished', label: 'answer ready', status: 'ok', mark: 'done' }, 2000).board

  assert.equal(board.counts.files, 1)
  assert.equal(board.faults?.files, 1)
  assert.equal(board.entries.find(entry => entry.id === started.id)?.status, 'err')
  assert.equal(board.entries.at(-1)?.mark, 'done')
})

test('view projection includes feed rows, counts, and the shared drawing', () => {
  const setup = setupFrom({ language: 'en' })
  let board = transitionBoard(emptyBoard(), { type: 'prompt', label: setup.t.newMessage }, 1000).board
  const started = transitionBoard(board, { type: 'entryStarted', start: { station: 'files', label: 'README.md' } }, 1100)
  board = transitionBoard(started.board, { type: 'entryFinished', id: started.id, status: 'ok' }, 1300).board

  const view = projectView(board, 1400, setup)
  assert.equal(view.type, 'view')
  assert.ok(view.rows.some(row => row.label === 'README.md'))
  assert.match(view.counts, /Files 1/)
  assert.match(view.svg, /<svg/)
})

test('hook manifest lists every event exactly once and parses as JSON', () => {
  const manifest = hookJson('.github/hooks/agentic-orbit-hook.js')
  const parsed = JSON.parse(manifest)

  assert.equal(parsed.version, 1)
  assert.deepEqual(Object.keys(parsed.hooks), [...HOOK_EVENTS])
  for (const event of HOOK_EVENTS) {
    const entries = parsed.hooks[event]
    assert.equal(entries.length, 1, `${event} must appear exactly once`)
    assert.equal(entries[0].type, 'command')
  }
})

// M-001 / ADR-005: the panel loads this file as a classic <script src>, where
// `require` and `import` do not exist. It must be the esbuild bundle, not the
// tsc CommonJS emission, and must actually wire the message listener.
const webviewMainPath = path.join(__dirname, '..', 'out', 'vscode-extension', 'src', 'webview', 'main.js')
const webviewMainMissing = !fs.existsSync(webviewMainPath)

test('shipped webview main.js is a self-contained bundle (no require/import)', {
  skip: webviewMainMissing ? `out/vscode-extension/src/webview/main.js is missing — run 'npm run compile' first` : false,
}, () => {
  const main = fs.readFileSync(webviewMainPath, 'utf8')

  assert.ok(!main.includes('require('), 'main.js must not contain require( — it is a classic script in the webview (M-001)')
  assert.ok(!/(^|\W)import\s*[({'"]/.test(main), 'main.js must not contain import statements (M-001)')
  assert.match(main, /addEventListener\(['"]message['"]/, 'main.js must register the message listener')
})
