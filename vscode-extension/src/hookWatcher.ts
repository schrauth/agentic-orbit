// Reads the hook's JSON event lines live: the file is watched, the lines parsed, the map told.
// Nothing here blocks the agent; a malformed line is skipped, a missing file is waited for.
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as crypto from 'crypto'

/** One compact metadata line, as the hook writes it. Unknown events are ignored by the caller. */
export type HookEvent = {
  v?: number
  event?: string
  ts?: number
  session?: string
  callId?: string
  agentId?: string
  tool?: string
  model?: string
  status?: string
  error?: boolean
  aborted?: boolean
  description?: string
  commandName?: string
  filePath?: string
  url?: string
}

export function eventsFileFor(workspace: string, override?: string): string {
  if (override !== undefined && override !== '') return override
  const key = crypto.createHash('sha1').update(workspace).digest('hex').slice(0, 12)
  return path.join(os.tmpdir(), `agentic-orbit-${key}.jsonl`)
}

/** Reads the lines the watcher has not read yet. A line that is not one JSON object is dropped, never an error. */
export function parseEvents(buffer: string): HookEvent[] {
  const out: HookEvent[] = []
  for (const line of buffer.split('\n')) {
    const text = line.trim()
    if (text === '') continue
    try {
      const parsed: unknown = JSON.parse(text)
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) out.push(parsed as HookEvent)
    } catch {
      // A half-written line from the hook appending as we read: it comes whole with the next change.
    }
  }
  return out
}

/**
 * Watches the hook's file from its end, and hands every new event to `onEvent`.
 * The watcher holds the file open between sessions' writes: fs.watch fires again on the next append.
 * Closed when the extension deactivates; errors are reported once and then only watched around.
 */
export function watchEvents(file: string, onEvent: (e: HookEvent) => void): { close: () => void } {
  let offset = fs.existsSync(file) ? fs.statSync(file).size : 0
  const read = (): void => {
    try {
      const size = fs.statSync(file).size
      if (size <= offset) {
        if (size < offset) offset = size // the file was truncated or written anew
        return
      }
      const fd = fs.openSync(file, 'r')
      try {
        const length = size - offset
        const buffer = Buffer.alloc(length)
        fs.readSync(fd, buffer, 0, length, offset)
        offset = size
        for (const e of parseEvents(buffer.toString('utf8'))) onEvent(e)
      } finally {
        fs.closeSync(fd)
      }
    } catch {
      // The file vanished for a moment, or a read raced with the hook's append: the next change catches up.
    }
  }
  let timer: NodeJS.Timeout | undefined
  const fire = (): void => {
    if (timer !== undefined) return
    timer = setTimeout(() => {
      timer = undefined
      read()
    }, 40)
  }
  let watcher: fs.FSWatcher | undefined
  try {
    watcher = fs.watch(path.dirname(file), (_kind, name) => {
      if (name === path.basename(file)) fire()
    })
  } catch {
    watcher = undefined
  }
  const poll = setInterval(() => {
    if (!fs.existsSync(file)) return
    fire()
    if (watcher === undefined) return
    clearInterval(poll)
  }, 2000)
  return {
    close: () => {
      clearInterval(poll)
      if (timer !== undefined) clearTimeout(timer)
      watcher?.close()
    },
  }
}
