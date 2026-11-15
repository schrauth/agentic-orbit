const assert = require('node:assert/strict')
const { test } = require('node:test')

const { classifyShell } = require('../out/hooks/classify.js')
const { projectView } = require('../out/hooks/view.js')
const { setupFrom } = require('../out/hooks/setup.js')
const { emptyBoard, transitionBoard } = require('../out/vscode-extension/src/board.js')

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
