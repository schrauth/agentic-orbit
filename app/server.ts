// The app's host: it resolves the hook's events file, tails it, applies every event through the shared translation,
// and owns the one board state the map is drawn from. Nothing it shows is content.
// The core of this file is plain and testable; the HTTP face and the CLI door live in their own modules.
import { watchEvents } from './hookWatcher'
import type { HookEvent } from './hookWatcher'
import { applyHookEvent, emptyState } from './eventApplier'
import type { ApplierState } from './eventApplier'
import { modelStepEvent, appendEvent } from './eventWriter'
import { setupFrom } from '../hooks/setup'
import type { Setup } from '../hooks/setup'
import type { Board } from '../types'

/** The setup the person set for the host: the same raw shape `setupFrom` reads from the config file. */
export type HostSetup = Record<string, unknown> & { contextWindowLimit?: number }

export type CoreOptions = { eventsFile: string; setup: HostSetup }

/** Everything the host holds: the board state, and the handles to feed it and to stop it. */
export type Host = {
  board: () => Board
  setup: () => Setup
  /** The raw options the person set — the shape `setupFrom` takes, for the page's one setup frame. */
  rawSetup: () => HostSetup
  onBoard: (listener: (board: Board) => void) => void
  /** The proxy's measurement, appended to the events file as a `modelStep` line; the core's watcher applies it like any other event. */
  telemetry: (tel: { model: string; promptTokens: number }) => void
  close: () => void
}

/**
 * The event → board core: one state, one watcher, one publisher. The events file is resolved and
 * tailed through the shared helpers (`eventsFileFor`, then `watchEvents`), every
 * event applied through the shared translation (`applyHookEvent`), and
 * every change handed to whoever listens. No HTTP here — the caller wires the publishing.
 */
export function serveCore(options: CoreOptions): Host {
  let state: ApplierState = emptyState()
  const listeners = new Set<(board: Board) => void>()
  const setup = () => setupFrom(options.setup)

  const publish = (): void => {
    for (const listener of listeners) listener(state.board)
  }

  const watcher = watchEvents(options.eventsFile, (e: HookEvent) => {
    applyHookEvent(state, e, setup(), Date.now())
    publish()
  })

  return {
    board: () => state.board,
    setup,
    rawSetup: () => options.setup,
    onBoard: listener => {
      listeners.add(listener)
    },
    telemetry: tel => {
      appendEvent(options.eventsFile, modelStepEvent(tel))
    },
    close: () => {
      watcher.close()
    },
  }
}
