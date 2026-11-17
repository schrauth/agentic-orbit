// The fake backend of the browser demo: it replays made-up hook events through the same board and the
// same drawing the extension uses, so a design can be judged without installing anything.
// Nothing here ships in the extension, and nothing here reads a file, starts a process or sends anything.
// The events carry names and figures only, made up for the demo: no code, no prompts, no content.
import type { Board } from '../types'
import { setupFrom } from '../hooks/setup'
import type { Setup } from '../hooks/setup'
import { emptyBoard } from '../app/board'
import { applyHookEvent, emptyState } from '../app/eventApplier'
import type { ApplierState } from '../app/eventApplier'

/** What the workspace hook writes in one line; the demo's events have the same shape, with made-up values. */
export type FakeEvent = {
  event: string
  callId?: string
  agentId?: string
  tool?: string
  model?: string
  error?: boolean
  aborted?: boolean
  description?: string
  commandName?: string
  filePath?: string
  url?: string
  promptTokens?: number
}

/** One beat of a scenario: a hook event, a model step the proxy would have measured, or both, `at` ms after it starts. */
export type Step = { at: number; ev?: FakeEvent; tel?: { model: string; promptTokens: number } }
export type Scenario = { name: string; steps: Step[] }

/** The context window the demo assumes, like the extension's own default. */
const CONTEXT_LIMIT = 128000

const LONG_LABEL = 28

/** A turn of the demo clock. `at` is ms from the scenario's start; the absolute stamp is `base + at`. */
export class FakeSession {
  private readonly state: ApplierState = emptyState()

  constructor(private readonly base: number) {}

  /** The board the shared translation last produced — the same state the extension host keeps. */
  get board(): Board {
    return this.state.board
  }

  reset(): void {
    this.state.board = emptyBoard()
    this.state.open.clear()
    this.state.parked.clear()
    this.state.lastModel = undefined
  }

  /** One hook event, applied exactly as the extension host applies it: the same shared translation. */
  apply(e: FakeEvent, at: number, setup: Setup): void {
    applyHookEvent(this.state, e, setup, this.base + at)
  }

  /** What the loopback proxy would have measured: the same `modelStep` line a host appends, replayed. */
  telemetry(model: string, promptTokens: number, at: number, setup: Setup): void {
    this.apply({ event: 'modelStep', model, promptTokens }, at, setup)
  }
}

/** The options the demo's controls hold, made into the same `Setup` the extension makes of its own. */
export function demoSetup(options: { theme?: string; layout?: string; motion?: string; pace?: string; language?: string }): Setup {
  return setupFrom({
    language: options.language ?? 'en',
    theme: options.theme ?? 'dark',
    layout: options.layout ?? 'you-top',
    motion: options.motion ?? 'full',
    pace: options.pace ?? 'normal',
    coreName: 'AGENT',
    background: 'solid',
    contextWindowLimit: CONTEXT_LIMIT,
  })
}

