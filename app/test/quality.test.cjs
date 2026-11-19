const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const { classifyShell } = require('../out/test-entry.js')
const { projectView } = require('../out/test-entry.js')
const { setupFrom } = require('../out/test-entry.js')
const { emptyBoard, transitionBoard } = require('../out/test-entry.js')
const { HOOK_EVENTS, hookJson } = require('../out/test-entry.js')

test('shell classification keeps wrappers, nested network calls, and PowerShell file commands', () => {
  const setup = setupFrom()

  assert.equal(classifyShell('sudo env MODE=1 timeout 5 curl -I https://example.com', 'fetch', setup).station, 'web')
  assert.equal(classifyShell('echo "$(curl -I https://example.com)"', 'fetch', setup).station, 'web')
  assert.equal(classifyShell('Get-Content .\\README.md', '', setup, true).station, 'files')
})

test('Fraunhofer light theme selects its palette and keeps custom color overrides', () => {
  const setup = setupFrom({ theme: 'fraunhofer' })
  const svg = projectView(emptyBoard(), 1400, setup).svg

  assert.equal(setup.theme, 'fraunhofer')
  assert.match(svg, /rx="12" fill="#f5f2ea"/)
  assert.match(svg, /fill="#005b7f"/)
  assert.doesNotMatch(svg, /@media \(prefers-color-scheme: light\)/)

  const overridden = setupFrom({ theme: 'fraunhofer', colors: 'background=#123456' })
  assert.match(projectView(emptyBoard(), 1400, overridden).svg, /fill="#123456"/)
  assert.equal(setupFrom({ theme: 'dark' }).theme, 'dark')
  assert.equal(setupFrom({ theme: 'light' }).theme, 'light')
  assert.equal(setupFrom({ theme: 'not-a-theme' }).theme, 'auto')
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

test('a failure transition records the status it is given, and err without one', () => {
  const started = transitionBoard(emptyBoard(), { type: 'entryStarted', start: { station: 'hooks', label: 'edit_file' } }, 1000)
  const blocked = transitionBoard(started.board, { type: 'failure', id: started.id, station: 'hooks', label: 'edit_file', status: 'block' }, 1100).board
  assert.equal(blocked.entries.find(entry => entry.id === started.id)?.status, 'block')
  assert.equal(blocked.faults?.hooks, 1)

  const open = transitionBoard(emptyBoard(), { type: 'entryStarted', start: { station: 'files', label: 'README.md' } }, 1200)
  const failed = transitionBoard(open.board, { type: 'failure', id: open.id, station: 'files', label: 'README.md' }, 1300).board
  assert.equal(failed.entries.find(entry => entry.id === open.id)?.status, 'err')
  assert.equal(failed.faults?.files, 1)

  // Without an open entry the failure opens and closes its own row, blocked when asked.
  const alone = transitionBoard(emptyBoard(), { type: 'failure', station: 'hooks', label: 'run_in_terminal', status: 'block' }, 1400).board
  assert.equal(alone.entries.at(-1)?.status, 'block')
  assert.equal(alone.entries.at(-1)?.station, 'hooks')
  assert.equal(alone.faults?.hooks, 1)
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

// M-001 / ADR-005: the page loads this file as a classic <script src>, where
// `require` and `import` do not exist. It must be the esbuild bundle, not the
// tsc CommonJS emission, and must actually wire the event stream.
const bundlePath = path.join(__dirname, '..', 'out', 'web', 'bundle.js')
const bundleMissing = !fs.existsSync(bundlePath)

test('served page bundle is self-contained (no require/import) and wires the event stream', {
  skip: bundleMissing ? `out/web/bundle.js is missing — run 'npm run build' first` : false,
}, () => {
  const bundle = fs.readFileSync(bundlePath, 'utf8')

  assert.ok(!bundle.includes('require('), 'bundle.js must not contain require( — it is a classic script on the page (M-001)')
  assert.ok(!/(^|\W)import\s*[({'"]/.test(bundle), 'bundle.js must not contain import statements (M-001)')
  assert.match(bundle, /new EventSource/, 'bundle.js must wire the event stream')
})
