// The standalone host: it does outside the editor what the extension host does inside it —
// resolves the hook's events file, tails it, applies every event through the shared translation,
// and owns the one board state the map is drawn from. Nothing it shows is content.
// The core of this file is plain and testable; the HTTP face and the CLI door live in their own modules.
import { watchEvents } from '../vscode-extension/src/hookWatcher'
import type { HookEvent } from '../vscode-extension/src/hookWatcher'
import { applyHookEvent, emptyState } from '../vscode-extension/src/eventApplier'
import type { ApplierState } from '../vscode-extension/src/eventApplier'
import { transitionBoard } from '../vscode-extension/src/board'
import { setupFrom } from '../hooks/setup'
import type { Setup } from '../hooks/setup'
import { shortModel } from '../hooks/classify'
import type { Board } from '../types'

/** The setup the person set for the host: the same raw shape `setupFrom` takes from VS Code's settings. */
export type HostSetup = Record<string, unknown> & { contextWindowLimit?: number }

export type CoreOptions = { eventsFile: string; setup: HostSetup }

/** Everything the host holds: the board state, and the handles to feed it and to stop it. */
export type Host = {
  board: () => Board
  setup: () => Setup
  onBoard: (listener: (board: Board) => void) => void
  /** What the loopback proxy measured: a model step and how full the context window is. */
  telemetry: (tel: { model: string; promptTokens: number }) => void
  close: () => void
}

/**
 * The event → board core: one state, one watcher, one publisher. The events file is resolved and
 * tailed exactly as the extension resolves and tails it (`eventsFileFor`, then `watchEvents`), every
 * event applied exactly as the extension applies it (`applyHookEvent`, the shared translation), and
 * every change handed to whoever listens. No HTTP here — the caller wires the publishing.
 */
export function serveCore(options: CoreOptions): Host {
  let state: ApplierState = emptyState()
  const listeners = new Set<(board: Board) => void>()
  const setup = () => setupFrom(options.setup)

  const publish = (): void => {
    for (const listener of listeners) listener(state.board)
  }

  /** What the loopback proxy measured: a model step and how full the context window is. */
  const onTelemetry = (tel: { model: string; promptTokens: number }): void => {
    const limit = typeof options.setup.contextWindowLimit === 'number' ? options.setup.contextWindowLimit : 128000
    const step = (state.board.step ?? 0) + 1
    const s = setup()
    state.board = transitionBoard(
      state.board,
      {
        type: 'modelStep',
        model: tel.model,
        step,
        label: `${shortModel(tel.model) || tel.model || 'model'} · ${s.t.step(step)}`,
        promptTokens: tel.promptTokens,
        limit,
      },
      Date.now(),
    ).board
    publish()
  }

  const watcher = watchEvents(options.eventsFile, (e: HookEvent) => {
    applyHookEvent(state, e, setup(), Date.now())
    publish()
  })

  return {
    board: () => state.board,
    setup,
    onBoard: listener => {
      listeners.add(listener)
    },
    telemetry: tel => {
      const limit = typeof options.setup.contextWindowLimit === 'number' ? options.setup.contextWindowLimit : 128000
      const step = (state.board.step ?? 0) + 1
      const s = setup()
      state.board = transitionBoard(
        state.board,
        {
          type: 'modelStep',
          model: tel.model,
          step,
          label: `${shortModel(tel.model) || tel.model || 'model'} · ${s.t.step(step)}`,
          promptTokens: tel.promptTokens,
          limit,
        },
        Date.now(),
      ).board
      publish()
    },
    close: () => {
      watcher.close()
    },
  }
}
