// The paths the cleanup moved or fixed: Copilot's tool mapping, the hook file's event parsing,
// the parked-name lifecycle, feed row folding, the now-line's thinking words, and the trail's
// route. Behavior assertions, each one failing if the mapped behavior were reverted.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { test } = require('node:test')

const { classifyCopilot } = require('../out/test-entry.js')
const { eventsFileFor, parseEvents } = require('../out/test-entry.js')
const { applyHookEvent, emptyState } = require('../out/test-entry.js')
const { modelStepEvent, appendEvent } = require('../out/test-entry.js')
const { foldRows, nowParts, describeNow } = require('../out/test-entry.js')
const { routeOf } = require('../out/test-entry.js')
const { setupFrom } = require('../out/test-entry.js')

const setup = setupFrom({ language: 'en', memoryServers: ['memory'], memoryPaths: ['.memory'] })

test('Copilot tool mapping sends each tool to its station', () => {
  // File tools read as Files, a memory path the person named reads as Memory.
  assert.equal(classifyCopilot('read_file', { file_path: '/w/src/main.ts' }, setup).station, 'files')
  assert.equal(classifyCopilot('read_file', { file_path: '/w/.memory/plan.md' }, setup).station, 'memory')
  assert.equal(classifyCopilot('grep_search', {}, setup).station, 'files')
  // The shell goes through the app's own classifier: a network command reads as Network.
  assert.equal(classifyCopilot('run_in_terminal', { command: 'curl -I https://example.com' }, setup).station, 'web')
  // Agents, skills, the browser's fetches, and the person's questions.
  assert.equal(classifyCopilot('task', { description: 'plan the work' }, setup).station, 'agents')
  assert.equal(classifyCopilot('skill', { skill: 'commit' }, setup).station, 'skills')
  assert.equal(classifyCopilot('fetch_webpage', { url: 'https://example.com/x' }, setup).station, 'web')
  assert.equal(classifyCopilot('web_search', {}, setup).station, 'web')
  // MCP: a server the person named as memory reads as Memory, any other as the network's periphery.
  assert.equal(classifyCopilot('mcp__memory__get', { id: 'abc' }, setup).station, 'memory')
  assert.equal(classifyCopilot('mcp__other__x', {}, setup).station, 'web')
  // An unknown tool with nothing to tell is the model working on its own.
  assert.equal(classifyCopilot('tool_nobody_maps', {}, setup).station, 'model')
})

test('every station answers to the name its host really sends', () => {
  // One representative name per station, so a station cannot lose its whole vocabulary unnoticed.
  assert.equal(classifyCopilot('run_in_terminal', { command: 'ls -la' }, setup).station, 'files')
  assert.equal(classifyCopilot('create_file', { file_path: '/w/src/new.ts' }, setup).station, 'files')
  assert.equal(classifyCopilot('read_file', { file_path: '/w/src/main.ts' }, setup).station, 'files')
  assert.equal(classifyCopilot('grep_search', { query: 'x' }, setup).station, 'files')
  assert.equal(classifyCopilot('fetch_webpage', { url: 'https://example.com/a' }, setup).station, 'web')
  assert.equal(classifyCopilot('runSubagent', { description: 'look it up' }, setup).station, 'agents')
  assert.equal(classifyCopilot('mcp__memory__search', { query: 'x' }, setup).station, 'memory')
  // A name the table has never heard of still lands on a row, never on an exception.
  const unknown = classifyCopilot('some_unknown_tool', {}, setup)
  assert.equal(unknown.station, 'model')
  assert.equal(unknown.label, 'some_unknown_tool')
})

test('an MCP tool reads as memory in both spellings, and as the periphery otherwise', () => {
  // Nested and flat are the two shapes an MCP tool name arrives in; the person's memory server wins in both.
  assert.equal(classifyCopilot('mcp__memory__search', { query: 'x' }, setup).station, 'memory')
  assert.equal(classifyCopilot('mcp_memory_search', { query: 'x' }, setup).station, 'memory')
  // A server the person never named as memory keeps its own station and shows its own name.
  assert.equal(classifyCopilot('mcp__other__x', {}, setup).station, 'web')
  assert.equal(classifyCopilot('mcp_other_x', {}, setup).station, 'web')
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

test('a skill call shows its name; without one the row stays generic', () => {
  const s = emptyState()
  // The name the hook took from the call's input rides the line to the map: the row says which skill ran.
  applyHookEvent(s, { event: 'preToolUse', callId: 'sk1', tool: 'skill', skill: 'commit' }, setup, 100)
  assert.equal(s.board.entries.at(-1)?.station, 'skills')
  assert.equal(s.board.entries.at(-1)?.label, 'commit')
  // No name arrived: the row says what it was, but not which.
  applyHookEvent(s, { event: 'preToolUse', callId: 'sk2', tool: 'skill' }, setup, 200)
  assert.equal(s.board.entries.at(-1)?.label, setup.t.skill)
})

test('the hook takes the name of a skill call, and only that, into its line', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-skill-'))
  const file = path.join(dir, 'events.jsonl')
  const hook = path.join(__dirname, '..', 'res', 'agentic-orbit-hook.js')
  const run = spawnSync(process.execPath, [hook, 'event=preToolUse'], {
    input: JSON.stringify({ tool_name: 'skill', tool_use_id: 't1', tool_input: { skill: 'commit' } }),
    env: { ...process.env, AGENTIC_ORBIT_EVENTS_FILE: file },
    encoding: 'utf8',
    timeout: 5000,
  })
  // Fail-safe whatever happens: exit 0, the allow JSON answering Copilot.
  assert.equal(run.status, 0)
  assert.deepEqual(JSON.parse(run.stdout), { permissionDecision: 'allow' })
  const line = JSON.parse(fs.readFileSync(file, 'utf8').trim())
  // Metadata only: the event, the ids, the tool's name — and the skill's name, never its text.
  assert.deepEqual(Object.keys(line).sort(), ['aborted', 'callId', 'error', 'event', 'skill', 'tool', 'ts', 'v'])
  assert.equal(line.skill, 'commit')
  fs.rmSync(dir, { recursive: true, force: true })
})

test('the hook writes a file\'s last two parts and an address\'s host, and never a path or a query', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-tail-'))
  const file = path.join(dir, 'events.jsonl')
  const hook = path.join(__dirname, '..', 'res', 'agentic-orbit-hook.js')
  const run = spawnSync(process.execPath, [hook, 'event=preToolUse'], {
    input: JSON.stringify({
      tool_name: 'fetch_webpage',
      tool_use_id: 't1',
      tool_input: {
        file_path: '/Users/someone/private/project/src/deep/main.ts',
        url: 'https://user:pw@example.com/search?q=secret&token=abc#frag',
      },
    }),
    env: { ...process.env, AGENTIC_ORBIT_EVENTS_FILE: file },
    encoding: 'utf8',
    timeout: 5000,
  })
  assert.equal(run.status, 0)
  const raw = fs.readFileSync(file, 'utf8').trim()
  // Nothing above the file's own name, no query, no login: neither reaches the file at all.
  assert.ok(!raw.includes('Users/someone'), raw)
  assert.ok(!raw.includes('secret') && !raw.includes('token=') && !raw.includes('user:pw'), raw)
  const line = JSON.parse(raw)
  assert.equal(line.fileTail, 'deep/main.ts')
  assert.equal(line.urlHost, 'example.com')
  assert.equal(line.filePath, undefined)
  assert.equal(line.url, undefined)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('the hook writes no host for a value that is not one, and does not throw', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-nohost-'))
  const file = path.join(dir, 'events.jsonl')
  const hook = path.join(__dirname, '..', 'res', 'agentic-orbit-hook.js')
  const run = spawnSync(process.execPath, [hook, 'event=preToolUse'], {
    input: JSON.stringify({ tool_name: 'fetch_webpage', tool_use_id: 't1', tool_input: { url: 'not a url at all' } }),
    env: { ...process.env, AGENTIC_ORBIT_EVENTS_FILE: file },
    encoding: 'utf8',
    timeout: 5000,
  })
  assert.equal(run.status, 0)
  assert.deepEqual(JSON.parse(run.stdout), { permissionDecision: 'allow' })
  const line = JSON.parse(fs.readFileSync(file, 'utf8').trim())
  assert.equal(line.urlHost, undefined)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('a reduced event and a legacy event classify to the same row', () => {
  // An events file written before the hook reduced its payload still renders as it did.
  const rowOf = event => {
    const s = emptyState()
    applyHookEvent(s, event, setup, 200)
    return s.board.entries.at(-1)?.label
  }
  assert.equal(rowOf({ event: 'preToolUse', callId: 'c1', tool: 'read_file', fileTail: 'src/main.ts' }), rowOf({ event: 'preToolUse', callId: 'c1', tool: 'read_file', filePath: '/w/src/main.ts' }))
  assert.equal(rowOf({ event: 'preToolUse', callId: 'c2', tool: 'fetch_webpage', urlHost: 'example.com' }), rowOf({ event: 'preToolUse', callId: 'c2', tool: 'fetch_webpage', url: 'https://example.com/search?q=x' }))
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

test('a session reset forgets the calls the old session left open', () => {
  const s = emptyState()
  const at = (ev, ms) => applyHookEvent(s, ev, setup, ms)
  at({ event: 'sessionStart' }, 100)
  at({ event: 'preToolUse', callId: 'c1', tool: 'read_file', filePath: '/w/src/a.ts' }, 200)
  assert.equal(s.open.size, 1)
  // The reset ends the session that owned the call: nothing of it stays behind to be closed later.
  at({ event: 'sessionStart' }, 300)
  assert.equal(s.open.size, 0)
  assert.equal(s.board.entries.length, 0)
  // A late end for the old session's call closes no entry and records no fault.
  at({ event: 'postToolUse', callId: 'c1' }, 400)
  assert.equal(s.board.entries.length, 0)
  assert.equal(s.board.faults, undefined)
  // The id is free again: a call that reuses it opens its own row, and its end closes that row.
  at({ event: 'preToolUse', callId: 'c1', tool: 'create_file', filePath: '/w/src/b.ts' }, 500)
  const running = s.board.entries.filter(e => e.status === 'run')
  assert.equal(running.length, 1)
  assert.equal(running[0].label, 'src/b.ts')
  at({ event: 'postToolUse', callId: 'c1' }, 600)
  assert.equal(s.board.entries.filter(e => e.status === 'run').length, 0)
  assert.equal(s.board.entries.at(-1).status, 'ok')
})

test("a subagent's prompt is not the person's message: no row and no cleared fault", () => {
  const s = emptyState()
  const at = (ev, ms) => applyHookEvent(s, ev, setup, ms)
  // A call that failed leaves a fault on the Files station.
  at({ event: 'preToolUse', callId: 'c1', tool: 'read_file', filePath: '/w/src/a.ts' }, 100)
  at({ event: 'errorOccurred', callId: 'c1', tool: 'read_file', filePath: '/w/src/a.ts' }, 200)
  assert.equal(s.board.faults.files, 1)
  const rows = s.board.entries.length
  // A child agent's prompt is instruction, not a message from the person: it changes nothing at all.
  at({ event: 'userPromptSubmitted', agentId: 'a1' }, 300)
  assert.equal(s.board.faults.files, 1)
  assert.equal(s.board.entries.length, rows)
  assert.equal(s.board.entries.some(e => e.station === 'you'), false)
  // The person's own prompt still clears the fault and adds the row.
  at({ event: 'userPromptSubmitted' }, 400)
  assert.equal(s.board.faults.files, undefined)
  assert.equal(s.board.entries.at(-1).station, 'you')
  assert.equal(s.board.entries.at(-1).label, setup.t.newMessage)
})

test('the writer appends the line the hook could have written, and never throws', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-writer-'))
  const file = path.join(dir, 'events.jsonl')
  // The round trip: the event a proxy's telemetry becomes, appended as one line, read back whole.
  appendEvent(file, modelStepEvent({ model: 'm', promptTokens: 5 }))
  await new Promise(resolve => setTimeout(resolve, 100))
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n')
  assert.equal(lines.length, 1)
  assert.deepEqual(JSON.parse(lines[0]), { v: 1, event: 'modelStep', ts: JSON.parse(lines[0]).ts, model: 'm', promptTokens: 5 })
  // A file nowhere to be found costs a still map, never a crash.
  assert.doesNotThrow(() => appendEvent(path.join(dir, 'nowhere', 'events.jsonl'), modelStepEvent({ model: 'm', promptTokens: 5 })))
  fs.rmSync(dir, { recursive: true, force: true })
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

test('the now-line says the model thinks between the message and the answer', () => {
  const s = emptyState()
  const at = (ev, ms) => applyHookEvent(s, ev, setup, ms)
  // A session just begun, model named, nothing sent yet: the line rests.
  at({ event: 'sessionStart', model: 'gpt-5.2' }, 100)
  assert.equal(nowParts(s.board, setup.t).what, setup.t.idle)
  assert.equal(describeNow(s.board, setup.t), 'Nothing is running. · gpt 5.2')
  // The person's message opens the turn and no call is open yet — the same state that breathes
  // the centre — so the line says the model thinks, with the model's name kept at the right.
  at({ event: 'userPromptSubmitted' }, 200)
  const thinking = nowParts(s.board, setup.t)
  assert.equal(thinking.what, setup.t.thinking)
  assert.equal(thinking.meter, 'gpt 5.2')
  assert.equal(describeNow(s.board, setup.t), 'Thinking… · gpt 5.2')
  // An open call takes the words; the gaps between calls give them back.
  at({ event: 'preToolUse', callId: 'm1', tool: 'read_file', filePath: '/w/src/board.ts' }, 300)
  assert.equal(nowParts(s.board, setup.t).what, 'Files: src/board.ts')
  at({ event: 'postToolUse', callId: 'm1' }, 400)
  assert.equal(nowParts(s.board, setup.t).what, setup.t.thinking)
  // The finished turn ends the thinking; so does an aborted one.
  at({ event: 'agentStop' }, 500)
  assert.equal(nowParts(s.board, setup.t).what, setup.t.idle)
  at({ event: 'userPromptSubmitted' }, 600)
  assert.equal(nowParts(s.board, setup.t).what, setup.t.thinking)
  at({ event: 'agentStop', aborted: true }, 700)
  assert.equal(nowParts(s.board, setup.t).what, setup.t.idle)
})

test('sessionStart names the model; modelStep steps, rings the context and finishes its entry', () => {
  const s = emptyState()
  // The name arrives with the session, before any proxy request: the status line can show it.
  applyHookEvent(s, { event: 'sessionStart', model: 'gpt-5.2' }, setup, 100)
  assert.equal(s.board.model, 'gpt-5.2')
  // The proxy's measured line: one more step, the ring against the limit, a finished model entry.
  applyHookEvent(s, { event: 'modelStep', model: 'gpt-5.2', promptTokens: 12800 }, setup, 200)
  assert.equal(s.board.step, 1)
  assert.equal(Math.round(s.board.context ?? 0), 10)
  const entry = s.board.entries.find(e => e.station === 'model')
  assert.ok(entry !== undefined && entry.status === 'ok' && entry.endedAt !== undefined)
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
