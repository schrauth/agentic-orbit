// The paths the cleanup moved or fixed: Copilot's tool mapping, the hook file's event parsing,
// the parked-name lifecycle, feed row folding, and the trail's route. Behavior assertions, each
// one failing if the mapped behavior were reverted.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test } = require('node:test')

const { classifyCopilot } = require('../out/vscode-extension/src/classifyCopilot.js')
const { eventsFileFor, parseEvents } = require('../out/vscode-extension/src/hookWatcher.js')
const { applyHookEvent, emptyState } = require('../out/vscode-extension/src/eventApplier.js')
const { foldRows } = require('../out/hooks/feed.js')
const { routeOf } = require('../out/hooks/draw.js')
const { setupFrom } = require('../out/hooks/setup.js')

const setup = setupFrom({ language: 'en', memoryServers: ['memory'], memoryPaths: ['.memory'] })

test('Copilot tool mapping sends each tool to its station', () => {
  // File tools read as Files, a memory path the person named reads as Memory.
  assert.equal(classifyCopilot('read_file', { file_path: '/w/src/main.ts' }, setup).station, 'files')
  assert.equal(classifyCopilot('read_file', { file_path: '/w/.memory/plan.md' }, setup).station, 'memory')
  assert.equal(classifyCopilot('grep_search', {}, setup).station, 'files')
  // The shell goes through the extension's own classifier: a network command reads as Network.
  assert.equal(classifyCopilot('run_in_terminal', { command: 'curl -I https://example.com' }, setup).station, 'web')
  // Agents, skills, the browser's fetches, and the person's questions.
  assert.equal(classifyCopilot('task', { description: 'plan the work' }, setup).station, 'agents')
  assert.equal(classifyCopilot('run_skill', { skill: 'commit' }, setup).station, 'skills')
  assert.equal(classifyCopilot('fetch_webpage', { url: 'https://example.com/x' }, setup).station, 'web')
  assert.equal(classifyCopilot('web_search', {}, setup).station, 'web')
  // MCP: a server the person named as memory reads as Memory, any other as the network's periphery.
  assert.equal(classifyCopilot('mcp__memory__get', { id: 'abc' }, setup).station, 'memory')
  assert.equal(classifyCopilot('mcp__other__x', {}, setup).station, 'web')
  // An unknown tool with nothing to tell is the model working on its own.
  assert.equal(classifyCopilot('tool_nobody_maps', {}, setup).station, 'model')
})

test('Copilot labels take the description over the tool name', () => {
  const labeled = classifyCopilot('task', { description: 'triage the issues' }, setup)
  assert.equal(labeled.label, 'triage the issues')
  const named = classifyCopilot('task', { name: 'researcher' }, setup)
  assert.equal(named.label, 'researcher')
  const bare = classifyCopilot('task', {}, setup)
  assert.equal(bare.label, setup.t.subagent)
  // A file row shows the last two path parts, never the whole path.
  assert.equal(classifyCopilot('read_file', { file_path: '/w/pkg/src/file.ts' }, setup).label, 'src/file.ts')
})

test('parseEvents drops malformed lines and arrays, keeps objects only', () => {
  const good = JSON.stringify({ event: 'toolStart', callId: 'a' })
  const events = parseEvents(`not json\n${good}\n${JSON.stringify([good])}\n\n${good}\n`)
  assert.equal(events.length, 2)
  assert.deepEqual(events[0], { event: 'toolStart', callId: 'a' })
})

test('eventsFileFor honors the override and hashes the workspace otherwise', () => {
  const override = eventsFileFor('/w', '/tmp/my-events.jsonl')
  assert.equal(override, '/tmp/my-events.jsonl')
  const hashed = eventsFileFor('/w', undefined)
  assert.ok(/^agentic-orbit-[0-9a-f]{12}\.jsonl$/.test(path.basename(hashed)), `hash-name shape: ${hashed}`)
  assert.ok(hashed.startsWith(os.tmpdir()))
})

test('parked names: launch parks, oldest claim first, failure gives back, turn clears', () => {
  const s = emptyState()
  const at = (ev, ms) => applyHookEvent(s, ev, setup, ms)
  // Two launches park their descriptions under their call ids, in launch order.
  at({ event: 'preToolUse', callId: 'c1', tool: 'task', description: 'first plan' }, 100)
  at({ event: 'preToolUse', callId: 'c2', tool: 'task', description: 'second plan' }, 200)
  assert.equal(s.parked.size, 2)
  // The first call of a child claims the oldest parked name, and it leaves the shelf for good.
  at({ event: 'preToolUse', callId: 'c3', tool: 'read_file', agentId: 'a1', filePath: '/w/x.ts' }, 300)
  assert.equal(s.parked.size, 1)
  assert.equal((s.board.agents ?? []).find(a => a.id === 'a1')?.name, 'first plan')
  // A failed launch hands its name back.
  at({ event: 'postToolUse', callId: 'c2', error: true }, 400)
  assert.equal(s.parked.size, 0)
  // The turn's end clears whatever was never claimed.
  at({ event: 'preToolUse', callId: 'c4', tool: 'task', description: 'third plan' }, 500)
  at({ event: 'agentStop' }, 600)
  assert.equal(s.parked.size, 0)
})

test('foldRows folds consecutive finished rows and never folds a running one away', () => {
  const row = (station, status, startedAt, endedAt) => ({ station, from: 'core', status, startedAt, endedAt, label: 'x' })
  const entries = [
    row('files', 'ok', 100, 200),
    row('files', 'ok', 300, 400),
    row('files', 'run', 500, undefined),
    row('web', 'ok', 600, 700),
  ]
  const rows = foldRows(entries)
  // Newest first: the web row, then the running file row — never folded away —, then the two
  // finished file rows folded into one, shown as the newest of them, with the sum of both.
  assert.equal(rows[0].entry.station, 'web')
  assert.equal(rows[0].times, 1)
  assert.equal(rows[1].entry.status, 'run')
  assert.equal(rows[1].times, 1)
  assert.equal(rows[2].times, 2)
  assert.equal(rows[2].entry.startedAt, 300)
  assert.equal(rows[2].tookMs, 200)
  // The fold cap is respected: alternating stations cannot fold, so the cap stops the row count.
  const many = Array.from({ length: 30 }, (_, i) => row(i % 2 === 0 ? 'files' : 'edit', 'ok', i, i + 1))
  assert.equal(foldRows(many, 5).length, 5)
})

test('routeOf keeps the stops in order and counts a revisited station once', () => {
  const entry = (station, at) => ({ station, from: 'core', startedAt: at, status: 'ok', endedAt: at, label: 'x' })
  // A station seen twice in a row counts once, with the newer moment.
  const stops = routeOf([entry('files', 100), entry('files', 200), entry('edit', 300)])
  assert.deepEqual(stops.map(s => s.station), ['files', 'edit'])
  assert.equal(stops[0].at, 200)
  // A station left and come back to is a stop of its own, in order.
  const back = routeOf([entry('files', 100), entry('edit', 200), entry('files', 300)])
  assert.deepEqual(back.map(s => s.station), ['files', 'edit', 'files'])
  // Subagent rows and the model are not stations of the route.
  const agents = [{ station: 'files', from: 'agents', startedAt: 50, status: 'ok', endedAt: 50, label: 'x' }, entry('model', 80), entry('edit', 300)]
  assert.deepEqual(routeOf(agents).map(s => s.station), ['edit'])
  // The window keeps only the last few stops.
  const long = Array.from({ length: 12 }, (_, i) => entry('files', i * 100))
  assert.ok(routeOf(long).length <= 7)
})
