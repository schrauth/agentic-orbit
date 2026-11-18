// The proxy's body handling: bodies over the old 8 MB cap must arrive at the upstream whole and
// byte-identical, not silently truncated — a corrupted request with a correct-looking
// Content-Length is the worst failure mode a proxy can have.
const assert = require('node:assert/strict')
const http = require('node:http')
const { test } = require('node:test')

const { startProxy } = require('../out/test-entry.js')

/** One round trip through the proxy: the fake upstream records what it received, the client sees the answer. */
function roundTrip(proxy, path, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port: proxy.port, path, method: 'POST', headers: { 'content-type': 'application/json' } },
      res => {
        res.resume()
        res.on('end', () => resolve())
      },
    )
    req.on('error', reject)
    req.end(body)
  })
}

/** The same round trip, keeping what the client received. */
function roundTripAnswer(proxy, path, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port: proxy.port, path, method: 'POST', headers: { 'content-type': 'application/json' } },
      res => {
        const chunks = []
        res.on('data', chunk => chunks.push(chunk))
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      },
    )
    req.on('error', reject)
    req.end(body)
  })
}

test('the proxy forwards an oversized body whole and byte-identical', async () => {
  // A body past the old 8 MB cap: nine megabytes of the same character.
  const big = 'a'.repeat(9 * 1024 * 1024)
  const received = []
  let seen = 0
  const upstream = http.createServer((req, res) => {
    assert.equal(req.method, 'POST')
    req.on('data', chunk => {
      seen += chunk.length
      received.push(chunk)
    })
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end('{}')
    })
  })
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve))
  const upstreamPort = upstream.address().port

  const telemetry = []
  const proxy = await startProxy(0, `http://127.0.0.1:${upstreamPort}/v1`, tel => telemetry.push(tel))
  try {
    await roundTrip(proxy, '/v1/chat/completions', big)
    assert.equal(seen, big.length, 'the upstream must receive exactly the bytes that were sent')
    assert.equal(Buffer.concat(received).toString('utf8'), big, 'the body must be byte-identical')
    assert.equal(telemetry.length, 0, 'a body with no JSON shape is forwarded unmeasured')
  } finally {
    proxy.close()
    upstream.close()
  }
})

test('a large non-streaming answer is read for its usage at its end, and reaches the client whole', async () => {
  // Two megabytes of answer text, with `usage` where a server puts it: last. The proxy keeps only
  // the tail of what it reads, so this figure can only be found if the tail is kept.
  const filler = 'x'.repeat(2 * 1024 * 1024)
  const answer = `{"choices":[{"message":{"content":"${filler}"}}],"usage":{"prompt_tokens":4321}}`
  const body = JSON.stringify({ model: 'llama-3', messages: [{ content: 'hello' }] })
  const upstream = http.createServer((req, res) => {
    req.resume()
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(answer)
    })
  })
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve))
  const upstreamPort = upstream.address().port

  const telemetry = []
  const proxy = await startProxy(0, `http://127.0.0.1:${upstreamPort}/v1`, tel => telemetry.push(tel))
  try {
    const seen = await roundTripAnswer(proxy, '/v1/chat/completions', body)
    assert.equal(seen, answer, 'reading the answer for a figure must not change what the client receives')
    assert.equal(telemetry.length, 1)
    assert.equal(telemetry[0].promptTokens, 4321, 'the usage block at the answer\'s end is still found')
  } finally {
    proxy.close()
    upstream.close()
  }
})

test('the proxy forwards a small chat body whole and reports its model', async () => {
  const body = JSON.stringify({ model: 'llama-3', messages: [{ content: 'hello' }] })
  let upstreamBody = ''
  const upstream = http.createServer((req, res) => {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => {
      upstreamBody = Buffer.concat(chunks).toString('utf8')
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end('{}')
    })
  })
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve))
  const upstreamPort = upstream.address().port

  const telemetry = []
  const proxy = await startProxy(0, `http://127.0.0.1:${upstreamPort}/v1`, tel => telemetry.push(tel))
  try {
    await roundTrip(proxy, '/v1/chat/completions', body)
    assert.equal(upstreamBody, body, 'the small body must arrive byte-identical too')
    assert.equal(telemetry.length, 1)
    assert.equal(telemetry[0].model, 'llama-3')
  } finally {
    proxy.close()
    upstream.close()
  }
})
