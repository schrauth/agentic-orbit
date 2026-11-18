// Reads the hook's JSON event lines live: the file is watched, the lines parsed, the map told.
// Nothing here blocks the agent; a malformed line is skipped, a missing file is waited for.
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as crypto from 'crypto'
import type { HookEvent } from '../types'

export type { HookEvent } from '../types'

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
      // Not one JSON object, so not an event: dropped here, never an error. A line the hook is still
      // writing does not reach this point — the watcher holds its bytes back until the line is whole.
    }
  }
  return out
}

/** How much of an unfinished line the watcher holds: a hook line runs to about a kilobyte, so this is
 * generous, and a writer that never finishes a line cannot make the watcher grow without end. */
const MAX_CARRY = 8192

/**
 * Watches the hook's file from its end, and hands every new event to `onEvent`.
 * The watcher holds the file open between sessions' writes: fs.watch fires again on the next append.
 * Closed when the host deactivates; errors are reported once and then only watched around.
 */
export function watchEvents(file: string, onEvent: (e: HookEvent) => void): { close: () => void } {
  let offset = fs.existsSync(file) ? fs.statSync(file).size : 0
  // The bytes of a line the hook was still writing when we last read. They are neither parsed nor dropped:
  // they wait here, as bytes, until the rest of the line arrives — so a character split across two reads
  // is decoded whole instead of as two replacement marks.
  let carry = Buffer.alloc(0)
  const read = (): void => {
    try {
      const size = fs.statSync(file).size
      if (size <= offset) {
        if (size < offset) {
          // The file was truncated or written anew: the bytes held belong to no line of this one.
          offset = size
          carry = Buffer.alloc(0)
        }
        return
      }
      const fd = fs.openSync(file, 'r')
      try {
        const length = size - offset
        const buffer = Buffer.alloc(length)
        fs.readSync(fd, buffer, 0, length, offset)
        const bytes = Buffer.concat([carry, buffer])
        // Only whole lines are handed on: everything up to the last newline is one, and what follows it
        // waits for the bytes that finish it. A buffer that ends in a newline holds nothing back.
        const end = bytes.lastIndexOf(0x0a)
        const whole = end < 0 ? '' : bytes.toString('utf8', 0, end + 1)
        carry = end < 0 ? Buffer.from(bytes) : Buffer.from(bytes.subarray(end + 1))
        if (carry.length > MAX_CARRY) carry = Buffer.alloc(0)
        // The offset covers the bytes read, never the line held back: that one is read again from `carry`.
        offset = size
        for (const e of parseEvents(whole)) onEvent(e)
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
