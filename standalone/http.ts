// The host's HTTP face: it serves the page, and one Server-Sent-Events stream that pushes whole
// board snapshots — the current one the moment a browser connects, then every new one, and once a
// second while something runs so the map's own animations carry on. It binds 127.0.0.1 only:
// nothing this host has ever leaves the machine. No logs, no request state, no other files served.
import * as http from 'http'
import * as fs from 'fs'
import * as path from 'path'
import type { Host } from './server'
import type { Board } from '../types'

/** One connected browser: its response, still living until it closes. */
type Client = { write: (frame: string) => void; close: () => void }

const PAGE_DIR = path.join(__dirname, 'web')

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
}

/** The board as one SSE frame. */
const frame = (board: Board): string => `event: board\ndata: ${JSON.stringify(board)}\n\n`

/**
 * The whole face: `GET /` serves the page from the directory the build filled, `GET /events` opens
 * the stream with the current board snapshot (a reconnect picks up where the host is), anything
 * else is a 404. The heartbeat re-sends while an entry runs, on the panel's own beat.
 */
export function serveHttp(host: Host, port: number, onPageDir?: string): { close: () => void; url: string } {
  const dir = onPageDir ?? PAGE_DIR
  const clients = new Set<Client>()

  const publish = (board: Board): void => {
    const text = frame(board)
    for (const client of clients) {
      try {
        client.write(text)
      } catch {
        clients.delete(client) // the browser went away; the next write would only throw again
      }
    }
  }

  const server = http.createServer((req, res) => {
    const url = req.url ?? '/'
    if (url === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      })
      const client: Client = {
        write: text => res.write(text),
        close: () => {
          clients.delete(client)
          try {
            res.end()
          } catch {
            // already gone
          }
        },
      }
      clients.add(client)
      res.on('close', () => clients.delete(client))
      // The snapshot first: whatever a browser missed while it was away, it has now.
      res.write(frame(host.board()))
      return
    }
    const file = url === '/' ? '/index.html' : url
    const resolved = path.normalize(path.join(dir, file))
    if (!resolved.startsWith(dir)) {
      res.writeHead(403)
      res.end()
      return
    }
    fs.readFile(resolved, (err, data) => {
      if (err !== null) {
        res.writeHead(404)
        res.end()
        return
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(resolved)] ?? 'application/octet-stream' })
      res.end(data)
    })
  })

  // The heartbeat: while something runs, the stream ticks once a second, as the panel does.
  const timer = setInterval(() => {
    if (host.board().entries.some(e => e.status === 'run')) publish(host.board())
  }, 1000)

  host.onBoard(publish)

  // Loopback only: the host serves the same machine, never the network.
  server.listen(port, '127.0.0.1')

  return {
    close: () => {
      clearInterval(timer)
      for (const client of clients) client.close()
      clients.clear()
      server.close()
    },
    get url(): string {
      return `http://127.0.0.1:${port}/`
    },
  }
}
