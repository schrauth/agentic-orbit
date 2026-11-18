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

/** Poll until `ok()` holds. The watcher reads on a debounce, so every wait here is a poll, not a sleep. */
async function until(ok, what, ms = 3000) {
  for (let waited = 0; waited < ms; waited += 20) {
    if (ok()) return
    await new Promise(r => setTimeout(r, 20))
  }
  throw new Error(`timed out waiting for ${what}`)
}

/** A core tailing a fresh, empty events file, with the boards it published collected. */
function tailing(name) {
  const file = path.join(os.tmpdir(), `ao-${name}-${Date.now()}.jsonl`)
  fs.rmSync(file, { force: true })
  fs.writeFileSync(file, '')
  const boards = []
  const core = serveCore({ eventsFile: file, setup: SETUP })
  core.onBoard(board => boards.push(board))
  return { file, core, boards, stop: () => { core.close(); fs.rmSync(file, { force: true }) } }
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

test('a line the hook was still writing is not lost: its tail finishes it on the next read', async () => {
  const t = tailing('carry')
  try {
    // A first whole line proves the watcher is awake; a half line publishes nothing to wait for.
    fs.appendFileSync(t.file, line({ event: 'sessionStart' }))
    await until(() => t.boards.length >= 1, 'the watcher to read the first line')
    // The hook's line arrives in two writes, with the watcher reading between them: the first is not
    // one JSON object, and the offset must not move past it.
    fs.appendFileSync(t.file, '{"event":"preToolUse","callId":"c1","tool":"read_file","filePa')
    await new Promise(r => setTimeout(r, 200)) // longer than the watcher's debounce: it has read, and dropped nothing
    assert.equal(t.core.board().entries.length, 0, 'a half line is not an event yet')
    fs.appendFileSync(t.file, 'th":"/w/src/a.ts"}\n')
    await until(() => t.core.board().entries.length === 1, 'the finished line to become one row')
    const entries = t.core.board().entries
    assert.equal(entries.length, 1, 'the split line became exactly one event')
    assert.equal(entries[0].station, 'files')
    assert.equal(entries[0].label, 'src/a.ts')
  } finally {
    t.stop()
  }
})

test('two whole lines in one write become two events, in the order they were written', async () => {
  const t = tailing('two-lines')
  try {
    fs.appendFileSync(t.file, line({ event: 'preToolUse', callId: 'c1', tool: 'read_file', filePath: '/w/src/first.ts' }) + line({ event: 'preToolUse', callId: 'c2', tool: 'create_file', filePath: '/w/src/second.ts' }))
    await until(() => t.core.board().entries.length === 2, 'both lines to become rows')
    const labels = t.core.board().entries.map(e => e.label)
    assert.deepEqual(labels, ['src/first.ts', 'src/second.ts'])
  } finally {
    t.stop()
  }
})

test('a truncated events file is read again from its start, with nothing held over from before', async () => {
  const t = tailing('truncate')
  try {
    fs.appendFileSync(t.file, line({ event: 'sessionStart' }))
    await until(() => t.boards.length >= 1, 'the watcher to read the first line')
    // A half line is left in the carry, then the file is emptied: those bytes belong to no line of the new one.
    fs.appendFileSync(t.file, '{"event":"preToolUse","tool":"read_file"')
    await new Promise(r => setTimeout(r, 200)) // the watcher has read it and is holding its bytes
    fs.writeFileSync(t.file, '')
    await new Promise(r => setTimeout(r, 200)) // the watcher has seen the file shrink under its offset
    fs.appendFileSync(t.file, line({ event: 'preToolUse', callId: 'c1', tool: 'create_file', filePath: '/w/src/after.ts' }))
    await until(() => t.core.board().entries.length === 1, 'the line written after the truncation to become a row')
    // The half line did not survive to be spliced onto the new one: it would have made it unparsable.
    assert.equal(t.core.board().entries[0].label, 'src/after.ts')
    assert.equal(t.core.board().entries.length, 1)
  } finally {
    t.stop()
  }
})

test('the SSE face opens with the setup frame, then the snapshot, then every board', async () => {
  const file = path.join(os.tmpdir(), `ao-face-${Date.now()}.jsonl`)
  fs.rmSync(file, { force: true })
  fs.writeFileSync(file, '')
  const pageDir = path.join(os.tmpdir(), 'ao-face-page')
  fs.mkdirSync(pageDir, { recursive: true })
  fs.writeFileSync(path.join(pageDir, 'index.html'), '<html></html>')
  const core = serveCore({ eventsFile: file, setup: { language: 'en', coreName: 'TESTCORE', memoryServers: ['memory'], theme: 'fraunhofer' } })
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
  assert.equal(raw.theme, 'fraunhofer')
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

test('the page palette menu and styles expose Fraunhofer light', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8')
  const css = fs.readFileSync(path.join(__dirname, '..', 'main.css'), 'utf8')

  assert.match(html, /<option value="fraunhofer">Fraunhofer light<\/option>/)
  assert.match(css, /:root\[data-theme='fraunhofer'\]\s*\{\s*--fg: #1c3f52;\s*--bg: #f5f2ea;/)
})

test('the page has no controls of its own, and the workshop keeps its own', () => {
  const pageHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8')
  const pageCss = fs.readFileSync(path.join(__dirname, '..', 'main.css'), 'utf8')
  // In the browser the map scales with the window: no zoom, fold or show row, and no rule hiding one.
  assert.ok(!pageHtml.includes('id="buttons"'), 'the page shell must carry no button row')
  assert.ok(!/#buttons\s*\{/.test(pageCss), 'the page styles must hide no button row')
  // The bar's menu button wears the class the shared renderer's buttons wear: the class stays for it.
  assert.match(pageHtml, /id="menubtn" class="btn"/)
  assert.match(pageCss, /^\.btn \{/m)
  // The workshop is the surface that does have them, and the renderer is shared with it.
  const demoHtml = fs.readFileSync(path.join(__dirname, '..', '..', 'demo', 'index.html'), 'utf8')
  assert.ok(demoHtml.includes('id="buttons"'), 'the workshop keeps its own buttons')
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
  fs.writeFileSync(config, JSON.stringify({ language: 'en', theme: 'fraunhofer', speeed: 'turbo' }))
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
    const setupFrame = await withTimeout(new Promise((resolve, reject) => {
      let buf = ''
      const req = http.get(`http://127.0.0.1:${port}/events`, res => {
        res.on('data', chunk => {
          buf += chunk
          const end = buf.indexOf('\n\n')
          if (end >= 0) {
            req.destroy()
            resolve(buf.slice(0, end))
          }
        })
        res.on('error', reject)
      })
      req.on('error', reject)
    }), 5000, 'the configured setup frame')
    assert.match(setupFrame, /^event: setup\n/)
    assert.equal(JSON.parse(/^data: (.+)$/m.exec(setupFrame)[1]).theme, 'fraunhofer')
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
