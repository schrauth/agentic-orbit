// One event → board translation, shared by the extension host and the browser demo: the demo
// replays exactly what the host performs, name parking included. VS Code-free by contract
// (ADR-003): this module imports the board, the classifier and the hooks, nothing of the host.
import type { Board, HookEvent } from '../types'
import { shortModel } from '../hooks/classify'
import { seated, transitionBoard, emptyBoard } from './board'
import { classifyCopilot } from './classifyCopilot'
import type { Setup } from '../hooks/setup'

/** The state the translation carries between events: the board, the calls still open,
 * the names parked for subagents not yet started, and the model the session last showed. */
export type ApplierState = {
  board: Board
  /** callId → the id of the entry the call started, while the call runs. */
  open: Map<string, string>
  /** callId → the parked label, matching the extension's parkedNames semantics. */
  parked: Map<string, string>
  lastModel?: string
}

export function emptyState(): ApplierState {
  return { board: emptyBoard(), open: new Map(), parked: new Map() }
}

/** The oldest parked name goes to the subagent that shows up next, and leaves the shelf for good. */
function takeParkedName(s: ApplierState): string | undefined {
  for (const [callId, name] of s.parked) {
    s.parked.delete(callId)
    return name
  }
  return undefined
}

/** A launch that failed never started a child: its name goes back to whoever launches next. */
function unparkName(s: ApplierState, callId: string | undefined): void {
  if (callId !== undefined) s.parked.delete(callId)
}

/** Apply one hook event to the state. Events the map does not know are dropped, never an error. */
export function applyHookEvent(s: ApplierState, e: HookEvent, setup: Setup, now: number): void {
  switch (e.event) {
    case 'sessionStart': {
      s.board = transitionBoard(s.board, { type: 'reset' }, now).board
      // A new session launches no one: names parked for the old one belong to no child here.
      s.parked.clear()
      if (e.model !== undefined) {
        const before = s.lastModel
        s.lastModel = e.model
        s.board = { ...s.board, model: e.model }
        if (before !== undefined && before !== e.model) {
          s.board = transitionBoard(
            s.board,
            { type: 'entryStarted', start: { station: 'model', label: `${shortModel(before)} → ${shortModel(e.model)}`, status: 'ok', mark: 'switch', uncounted: true } },
            now,
          ).board
        }
      }
      break
    }
    case 'userPromptSubmitted': {
      // A subagent's own prompt carries its agent id and must leave the parked names alone;
      // a message from the person themselves ends every launch of the turn before.
      if (e.agentId === undefined) s.parked.clear()
      s.board = transitionBoard(s.board, { type: 'prompt', label: setup.t.newMessage }, now).board
      break
    }
    case 'preToolUse': {
      const { station, label } = classifyCopilot(e.tool ?? '', { description: e.description, command: e.commandName, url: e.url, file_path: e.filePath }, setup)
      // A call that launches a subagent also names it: the short description only, its prompt is content.
      // The id the child circles under is its own session's, minted only when the child starts, so
      // the launch cannot carry it. The name waits under the launch call's id until the child's first
      // own call claims the oldest one. The claim runs before this event's own launch is parked, so
      // a child whose first call starts a grandchild takes its own name, not the grandchild's.
      const agentName = e.agentId !== undefined && !seated(s.board, e.agentId) ? takeParkedName(s) : undefined
      if (station === 'agents' && e.callId !== undefined && e.description !== undefined) {
        s.parked.set(e.callId, label)
      }
      const started = transitionBoard(
        s.board,
        {
          type: 'entryStarted',
          start: { station, label, ...(e.agentId !== undefined ? { from: 'agents' as const, agentId: e.agentId, ...(agentName !== undefined ? { agentName } : {}) } : {}) },
        },
        now,
      )
      s.board = started.board
      if (e.callId !== undefined && started.id !== undefined) s.open.set(e.callId, started.id)
      break
    }
    case 'postToolUse': {
      const id = e.callId !== undefined ? s.open.get(e.callId) : undefined
      if (e.callId !== undefined) s.open.delete(e.callId)
      // A launch that failed never started a child: its parked name goes back. A call that
      // ended well leaves the name where it is — the child may not have spoken yet.
      if (e.error === true) unparkName(s, e.callId)
      s.board = transitionBoard(s.board, { type: 'entryFinished', id, status: e.error === true ? 'err' : 'ok' }, now).board
      break
    }
    case 'agentStop': {
      if (e.agentId !== undefined) {
        s.board = transitionBoard(s.board, { type: 'agentFinished', agentId: e.agentId }, now).board
      } else {
        // The turn is over: whatever name no child ever claimed belongs to no one now.
        s.parked.clear()
        const aborted = e.aborted === true
        s.board = transitionBoard(
          s.board,
          {
            type: 'turnFinished',
            label: aborted ? setup.t.turnAborted : setup.t.answerReady,
            status: aborted ? 'err' : 'ok',
            ...(aborted ? {} : { mark: 'done' as const }),
          },
          now,
        ).board
      }
      break
    }
    case 'modelStep': {
      const step = (s.board.step ?? 0) + 1
      s.board = transitionBoard(
        s.board,
        {
          type: 'modelStep',
          model: e.model ?? '',
          step,
          label: `${shortModel(e.model ?? '') || e.model || 'model'} · ${setup.t.step(step)}`,
          promptTokens: e.promptTokens ?? 0,
          limit: setup.contextWindowLimit,
        },
        now,
      ).board
      break
    }
    case 'errorOccurred': {
      const { station, label } = classifyCopilot(e.tool ?? '', { description: e.description, command: e.commandName, url: e.url, file_path: e.filePath }, setup)
      const id = e.callId !== undefined ? s.open.get(e.callId) : undefined
      if (e.callId !== undefined) s.open.delete(e.callId)
      // The call failed, so the child it meant to start never came: its parked name goes back.
      unparkName(s, e.callId)
      s.board = transitionBoard(s.board, { type: 'failure', id, station, label: e.tool ?? label }, now).board
      break
    }
    default:
      return // An event the map does not know: dropped, never an error.
  }
}
