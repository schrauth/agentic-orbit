// Appends what the map's own instruments measure to the hook's events file: the proxy's
// model steps, in the same compact line format the workspace hook writes. Never throws
// and never waits — a failed append degrades to a still map, never a broken answer.
import * as fs from 'fs'
import type { HookEvent } from '../../types'

/** One model request the loopback proxy measured: its model's name, and how many prompt tokens it carried. */
export function modelStepEvent(tel: { model: string; promptTokens: number }): HookEvent {
  return { v: 1, event: 'modelStep', ts: Date.now(), model: tel.model, promptTokens: tel.promptTokens }
}

/** Appends one event line without waiting and without ever throwing: the map's fail-safe rule (ADR-001). */
export function appendEvent(file: string, e: HookEvent): void {
  fs.appendFile(file, `${JSON.stringify(e)}\n`, { mode: 0o600 }, () => undefined)
}
