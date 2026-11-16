// The host's critical paths pinned: which events file the CLI watches, that the core tails and
// applies the real hook events onto published boards, that the SSE face opens with the setup frame
// and the snapshot and then carries every board, and that the CLI's door answers wrong feet with
// a message. Each test fails if the behavior it pins were reverted.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')
const { test } = require('node:test')

const { eventsFileFor, serveCore, listenHttp } = require('../out/test-entry.js')

const SETUP = { language: 'en', memoryServers: ['memory'], contextWindowLimit: 128000 }
const line = o => `${JSON.stringify(o)}\n`

/** A free port the test can listen on. */
function freePort() {
  return new Promise(resolve => {
    const server = http.createServer(() => undefined)
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port
      server.close(() => resolve(port))
    })
  })
}

/** Start the built CLI and wait for its one startup line; the child and its url come back. */
function startCli(args) {
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'out', 'server.js'), ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
  const started = new Promise(resolve => {
    let text = ''
    child.stdout.on('data', chunk => {
      text += chunk
      const url = /^http:\/\/127\.0\.0\.1:(\d+)\/\s—\swatching\s(\S+)/m.exec(text)
      if (url !== null) resolve({ child, url })
    })
  })
  return withTimeout(started, 5000, `the CLI to start: ${args.join(' ')}`)
}

test('eventsFileFor: the override wins, the workspace is hashed otherwise', () => {
  assert.equal(eventsFileFor('/w', '/tmp/my-events.jsonl'), '/tmp/my-events.jsonl')
  const hashed = eventsFileFor('/w')
  assert.ok(/^agentic-orbit-[0-9a-f]{12}\.jsonl$/.test(path.basename(hashed)), `hash-name shape: ${hashed}`)
  assert.ok(hashed.startsWith(os.tmpdir()))
})

/** A promise with a deadline: a waited-for frame that never comes fails the test, not the runner. */
function withTimeout(promise, ms, what) {
  let timer = setTimeout(() => {}, 0)
  const refuse = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out waiting for ${what}`)), ms)
  })
  return Promise.race([promise, refuse]).finally(() => clearTimeout(timer))
}

test('the core tails the events file and publishes the boards the events make', async () => {
  const file = path.join(os.tmpdir(), `ao-core-${Date.now()}.jsonl`)
  fs.rmSync(file, { force: true })
  fs.writeFileSync(file, '')
  const boards = []
  const core = serveCore({ eventsFile: file, setup: SETUP })
  try {
    core.onBoard(board => boards.push(board))
    assert.equal(core.board().entries.length, 0)
    // The core tails from the file's end: only what lands while it watches becomes a board.
    fs.appendFileSync(file, line({ event: 'sessionStart', at: Date.now() }))
    await new Promise(r => setTimeout(r, 150))
    assert.ok(boards.length >= 1, 'the first append published the session start')
    const before = boards.length
    fs.appendFileSync(file, line({ event: 'preToolUse', callId: 'c1', tool: 'task', description: 'first plan' }))
    fs.appendFileSync(file, line({ event: 'preToolUse', callId: 'c2', tool: 'task', description: 'second plan' }))
    fs.appendFileSync(file, line({ event: 'preToolUse', callId: 'c3', tool: 'read_file', agentId: 'a1', filePath: '/w/x.ts' }))
    await new Promise(r => setTimeout(r, 300))
    // The running call started, and the parked name was claimed by the child in launch order.
    const latest = boards[boards.length - 1]
    assert.ok(boards.length > before, 'the appended events published')
    assert.equal((latest.agents ?? []).find(a => a.id === 'a1')?.name, 'first plan')
    assert.equal(latest.entries.some(e => e.station === 'files' && e.status === 'run'), true)
    // Proxy telemetry becomes a model step on the same board — through the file, like every other event.
    const stepBefore = latest.step ?? 0
    core.telemetry({ model: 'gpt-5.2', promptTokens: 12000 })
    const stepped = await withTimeout(
      (async () => {
        for (let i = 0; i < 100; i++) {
          const b = boards[boards.length - 1]
          if (b !== undefined && (b.step ?? 0) === stepBefore + 1 && b.context !== undefined && b.context > 0) return b
          await new Promise(r => setTimeout(r, 20))
        }
        throw new Error('the modelStep line never became a board')
      })(),
      2000,
      'the telemetry round-trip through the events file',
    )
    assert.equal(stepped.step, stepBefore + 1)
    assert.ok(stepped.context !== undefined && stepped.context > 0)
    assert.ok(fs.readFileSync(file, 'utf8').includes('"event":"modelStep"'), 'the telemetry landed as a line in the file')
  } finally {
    // A failed assertion must not leave the watcher holding the suite open.
    core.close()
    fs.rmSync(file, { force: true })
  }
})

test('the SSE face opens with the setup frame, then the snapshot, then every board', async () => {
  const file = path.join(os.tmpdir(), `ao-face-${Date.now()}.jsonl`)
  fs.rmSync(file, { force: true })
  fs.writeFileSync(file, '')
  const pageDir = path.join(os.tmpdir(), 'ao-face-page')
  fs.mkdirSync(pageDir, { recursive: true })
  fs.writeFileSync(path.join(pageDir, 'index.html'), '<html></html>')
  const core = serveCore({ eventsFile: file, setup: { language: 'en', coreName: 'TESTCORE', memoryServers: ['memory'] } })
  const port = await freePort()
  const face = await listenHttp(core, port, pageDir)
  try {

  const frames = await withTimeout(new Promise((resolve, reject) => {
    const got = []
    const req = http.get(`http://127.0.0.1:${port}/events`, res => {
      let buf = ''
      res.on('data', chunk => {
        buf += chunk
        let at
        while ((at = buf.indexOf('\n\n')) >= 0) {
          got.push(buf.slice(0, at))
          buf = buf.slice(at + 2)
        }
        if (got.length >= 2) {
          req.destroy()
          resolve(got)
        }
      })
      res.on('error', reject)
    })
    req.on('error', reject)
  }), 5000, 'the setup frame and the first board')
  // The setup frame carries the person's raw setup; the board snapshot follows it, empty.
  assert.match(frames[0], /^event: setup\n/)
  const raw = JSON.parse(/^data: (.+)$/m.exec(frames[0])[1])
  assert.equal(raw.coreName, 'TESTCORE')
  assert.match(frames[1], /^event: board\n/)
  assert.equal(JSON.parse(/^data: (.+)$/m.exec(frames[1])[1]).entries.length, 0)

  // A second connection reads the frames as they come, including the publish a new event makes.
  const later = await withTimeout(new Promise((resolve, reject) => {
    const got = []
    const req = http.get(`http://127.0.0.1:${port}/events`, res => {
      let buf = ''
      res.on('data', chunk => {
        buf += chunk
        let at
        while ((at = buf.indexOf('\n\n')) >= 0) {
          got.push(buf.slice(0, at))
          buf = buf.slice(at + 2)
        }
        if (got.length >= 3) {
          req.destroy()
          resolve(got)
        }
      })
      res.on('error', reject)
    })
    req.on('error', reject)
    fs.appendFileSync(file, line({ event: 'preToolUse', callId: 'c1', tool: 'Bash', commandName: 'npm', description: 'install' }))
  }), 5000, 'the live board frames')
  const boards = later.filter(f => f.startsWith('event: board')).map(f => JSON.parse(/^data: (.+)$/m.exec(f)[1]))
  // The snapshot first, then the live board with the running call, then the heartbeat's beat.
  assert.equal(boards[0].entries.length, 0)
  assert.ok(boards.some(b => b.entries.some(e => e.station === 'shell' && e.status === 'run')))
  } finally {
    // A failed assertion must not leave the face and the watcher holding the suite open.
    face.close()
    core.close()
    fs.rmSync(file, { force: true })
  }
})

test('the CLI door: wrong feet are refused with a message, a config typo is not one', async () => {
  const server = path.join(__dirname, '..', 'out', 'server.js')
  for (const [args, message] of [
    [['--workspace', '/a', '--events-file', '/b'], 'exactly one of --workspace and --events-file'],
    [['--nope'], 'unknown flag: --nope'],
    [['--workspace'], '--workspace needs a value'],
  ]) {
    // The timeout guards the refusal itself: a host that started instead of refusing would hang.
    const run = spawnSync(process.execPath, [server, ...args], { encoding: 'utf8', timeout: 5000 })
    assert.notEqual(run.status, 0, `expected refusal: ${args.join(' ')}`)
    assert.ok(run.stderr.includes(message), `expected "${message}" on stderr, got: ${run.stderr.trim()}`)
  }
  // A typo key warns on stderr and the host serves anyway.
  const ws = path.join(os.tmpdir(), 'ao-cli-test-ws')
  fs.mkdirSync(ws, { recursive: true })
  const config = path.join(os.tmpdir(), 'ao-cli-test-config.json')
  fs.writeFileSync(config, JSON.stringify({ language: 'en', speeed: 'turbo' }))
  const port = await freePort()
  const { child } = await startCli(['--workspace', ws, '--config', config, '--port', String(port)])
  try {
    const warned = await new Promise(resolve => {
      let text = ''
      child.stderr.on('data', chunk => {
        text += chunk
        resolve(text.includes('unknown key "speeed"'))
      })
      setTimeout(() => resolve(text.includes('unknown key "speeed"')), 1000)
    })
    assert.ok(warned, 'the unknown key warned on stderr')
    await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/`, res => {
        assert.equal(res.statusCode, 200)
        res.destroy()
        resolve()
      }).on('error', reject)
    })
  } finally {
    // A failed assertion must not leave the host running: the suite would wait for it forever.
    child.kill('SIGINT')
    await new Promise(resolve => child.on('exit', resolve))
    fs.rmSync(config, { force: true })
  }
})
