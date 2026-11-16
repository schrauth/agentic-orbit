// The loopback proxy: 127.0.0.1 only. It forwards /v1/chat/completions to the on-prem LLM
// unchanged and streams the answer through as it comes, so the person sees no delay.
// From the stream it takes only figures: the model's name and the prompt tokens of the request,
// never any text of it. What it learns it hands to the map as metadata.
import * as http from 'http'
import * as https from 'https'
import type { IncomingHttpHeaders } from 'http'

export type ProxyTelemetry = {
  model: string
  promptTokens: number
  at: number
}

export type ProxyServer = {
  port: number
  close: () => void
}

/** The tokens a request carries, counted without its text: roughly four characters each, as the map's estimate. */
function estimateTokens(body: string): number {
  try {
    const parsed: unknown = JSON.parse(body)
    if (typeof parsed !== 'object' || parsed === null) return 0
    const messages = (parsed as Record<string, unknown>).messages
    if (!Array.isArray(messages)) return 0
    let size = 0
    for (const message of messages) {
      if (typeof message !== 'object' || message === null) continue
      const content = (message as Record<string, unknown>).content
      if (typeof content === 'string') size += content.length
      else if (Array.isArray(content)) {
        for (const part of content) {
          const text = (part as Record<string, unknown> | null)?.text ?? (part as Record<string, unknown> | null)?.content
          if (typeof text === 'string') size += text.length
        }
      }
    }
    return Math.max(1, Math.round(size / 4))
  } catch {
    return 0
  }
}

const HOP_HEADERS = new Set(['host', 'connection', 'transfer-encoding', 'keep-alive', 'proxy-authorization', 'proxy-authenticate', 'content-length'])

/**
 * Starts the proxy. Every request path is forwarded; only `/v1/chat/completions` (and `/chat/completions`
 * when the target base URL already ends in `/v1`) is also measured. Non-streaming answers are counted
 * from their `usage` object, streaming ones from the `usage` some servers append to the last chunk.
 */
export function startProxy(port: number, targetBaseUrl: string, onTelemetry: (t: ProxyTelemetry) => void): Promise<ProxyServer> {
  const target = new URL(targetBaseUrl.endsWith('/') ? targetBaseUrl.slice(0, -1) : targetBaseUrl)
  const isTls = target.protocol === 'https:'
  const forward = isTls ? https.request : http.request
  const base = target.pathname.replace(/\/v1$/, '')

  const requestOptions = (req: http.IncomingMessage, url: string) => {
    const headers: IncomingHttpHeaders = { ...req.headers }
    for (const name of Object.keys(headers)) {
      if (HOP_HEADERS.has(name.toLowerCase())) delete headers[name]
    }
    return {
      hostname: target.hostname,
      port: target.port !== '' ? Number(target.port) : isTls ? 443 : 80,
      path: `${base}${url}`,
      method: req.method,
      headers: { ...headers, host: target.host },
    }
  }
  const responseHeaders = (answer: http.IncomingMessage): Record<string, string | string[]> => {
    const headers: Record<string, string | string[]> = {}
    for (const [name, value] of Object.entries(answer.headers)) {
      if (value !== undefined && !HOP_HEADERS.has(name.toLowerCase())) headers[name] = value
    }
    return headers
  }
  const forwardRequest = (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    payload: Buffer,
    url: string,
    onResponse: (answer: http.IncomingMessage) => void,
    onError: () => void,
  ): void => {
    const upstream = forward(requestOptions(req, url), onResponse)
    upstream.on('error', onError)
    upstream.end(payload)
  }

  const server = http.createServer((req, res) => {
    // Bodies are buffered whole, deliberately: dropping a chunk over a fixed size would forward a
    // corrupted request with a correct-looking Content-Length, silently. A large prompt is a
    // legitimate on-prem edge case, and the operator's own request bounds memory.
    const body: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      body.push(chunk)
    })
    req.on('end', () => {
      const payload = Buffer.concat(body)
      body.length = 0
      const isChat = req.url === '/v1/chat/completions' || req.url === '/chat/completions' || req.url === '/chat/completions/'
      if (!isChat) {
        pipe(req, res, payload, req.url ?? '/')
        return
      }
      let model = ''
      try {
        const parsed: unknown = JSON.parse(payload.toString('utf8'))
        if (typeof parsed === 'object' && parsed !== null) {
          const m = (parsed as Record<string, unknown>).model
          if (typeof m === 'string') model = m
        }
      } catch {
        // A body the proxy cannot read is forwarded as it came, unmeasured.
      }

      forwardRequest(
        req,
        res,
        payload,
        req.url ?? '/',
        answer => {
          const status = answer.statusCode ?? 502
          res.writeHead(status, responseHeaders(answer))
          // The stream goes through chunk by chunk: the person reads it as it arrives.
          // From it, figures only: the last chunk many servers append holds `usage`; a non-streaming
          // answer holds it whole. Without `usage`, the request's own size gives a close estimate.
          let rest = ''
          let counted = false
          const count = (): void => {
            if (counted) return
            counted = true
            const usage = /"usage"\s*:\s*\{[^}]*?"prompt_tokens"\s*:\s*(\d+)/.exec(rest)
            const tokens = usage !== null ? Number(usage[1]) : estimateTokens(payload.toString('utf8'))
            if (model !== '' || tokens > 0) onTelemetry({ model, promptTokens: tokens, at: Date.now() })
          }
          answer.on('data', (chunk: Buffer) => {
            res.write(chunk)
            if (counted || model === '') return
            const type = (answer.headers['content-type'] ?? '').toString()
            if (type.includes('application/json') && !type.includes('event-stream')) {
              // A whole JSON answer: its `usage` is counted once it has arrived.
              rest = `${rest}${chunk.toString('utf8')}`
              return
            }
            // Some servers append a final chunk with `usage`; the tail is kept to find it.
            rest = `${rest}${chunk.toString('utf8')}`.slice(-4096)
            const usage = /"usage"\s*:\s*\{[^}]*?"prompt_tokens"\s*:\s*(\d+)/.exec(rest)
            if (usage !== null) count()
          })
          answer.on('end', () => {
            count()
            res.end()
          })
          answer.on('error', () => res.end())
        },
        () => {
          if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: { message: 'agentic-orbit proxy: the on-prem LLM did not answer', type: 'proxy_target_unreachable' } }))
        },
      )
    })
    req.on('error', () => {
      if (!res.headersSent) res.writeHead(400)
      res.end()
    })
  })

  function pipe(req: http.IncomingMessage, res: http.ServerResponse, payload: Buffer, url: string): void {
    forwardRequest(
      req,
      res,
      payload,
      url,
      answer => {
        res.writeHead(answer.statusCode ?? 502, responseHeaders(answer))
        answer.pipe(res)
      },
      () => {
        if (!res.headersSent) res.writeHead(502)
        res.end()
      },
    )
  }

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => {
      const address = server.address()
      resolve({
        port: typeof address === 'object' && address !== null ? address.port : port,
        close: () => server.close(),
      })
    })
  })
}
