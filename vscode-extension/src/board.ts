// The map's state: one board, entries begun and finished,
// counts, faults, agents, context. Nothing here touches VS Code; it is plain state in the extension host.
import type { Board, Entry, StationId, Status } from '../../types'
import { clean } from '../../hooks/classify'

const KEEP = 80
const CREW = 12

export type BeginOptions = {
  station: StationId
  label: string
  from?: Entry['from']
  status?: Status
  agentId?: string
  mark?: Entry['mark']
  /** Adds nothing to the station's count: a second view of something already counted. */
  uncounted?: boolean
  startedAt?: number
  endedAt?: number
  patch?: Partial<Pick<Board, 'model' | 'step' | 'switchedAt'>>
}

const newId = (now: number): string => `${now.toString(36)}${Math.random().toString(36).slice(2, 7)}`

/** The newest rows, and beside them every background task still going, however long ago it started. */
const kept = (entries: Entry[]): Entry[] => {
  const from = entries.length - KEEP
  return from <= 0 ? entries : entries.filter((e, i) => i >= from || (e.status === 'run' && e.task !== undefined))
}

const isFault = (status: Status): boolean => status === 'err' || status === 'block'

const oneMore = (faults: Board['faults'], station: StationId): Board['faults'] => ({ ...faults, [station]: (faults?.[station] ?? 0) + 1 })

export function emptyBoard(): Board {
  return { entries: [], counts: {} }
}

/** One action starts: its row opens, its station counts one more unless it is only a second view of one. */
export function begin(board: Board, start: BeginOptions, now: number): { board: Board; id: string } {
  const entry: Entry = {
    id: newId(now),
    station: start.station,
    label: clean(start.label),
    from: start.from ?? 'core',
    startedAt: start.startedAt ?? now,
    status: start.status ?? 'run',
    ...(start.status !== undefined ? { endedAt: start.endedAt ?? now } : {}),
    ...(start.agentId !== undefined ? { agentId: start.agentId } : {}),
    ...(start.mark !== undefined ? { mark: start.mark } : {}),
  }
  const next: Board = {
    ...board,
    ...start.patch,
    entries: kept([...board.entries, entry]),
    counts: start.uncounted ? board.counts : { ...board.counts, [entry.station]: (board.counts[entry.station] ?? 0) + 1 },
    // A subagent's own calls start from the agents station; the agent itself circles there while it works.
    ...(entry.agentId !== undefined && !(board.agents ?? []).includes(entry.agentId)
      ? { agents: [...(board.agents ?? []), entry.agentId].slice(-CREW) }
      : {}),
  }
  return { board: next, id: entry.id }
}

/** An action ends: its row closes, as a fault when it failed or was stopped. */
export function finish(board: Board, id: string | undefined, status: Status, now: number, patch?: Pick<Board, 'context'>): Board {
  if (id === undefined) return board
  const open = board.entries.find(e => e.id === id && e.status === 'run')
  if (open === undefined) return board
  return {
    ...board,
    ...patch,
    entries: board.entries.map(e => (e === open ? { ...e, status, endedAt: now } : e)),
    ...(isFault(status) ? { faults: oneMore(board.faults, open.station) } : {}),
  }
}

/** The call started work that goes on after it answered: its row stays open under the task's id. */
export function background(board: Board, id: string | undefined, task: string): Board {
  if (id === undefined) return board
  return { ...board, entries: board.entries.map(e => (e.id === id && e.status === 'run' ? { ...e, task } : e)) }
}

/** A background task ended: its row closes, as a fault when the task failed. */
export function settle(board: Board, task: string, status: Status, now: number): Board {
  const open = board.entries.find(e => e.task === task && e.status === 'run')
  if (open === undefined) return board
  return {
    ...board,
    entries: board.entries.map(e => (e === open ? { ...e, status, endedAt: now } : e)),
    ...(isFault(status) ? { faults: oneMore(board.faults, open.station) } : {}),
  }
}

/** A subagent's loop is over: it leaves the agents station, and a call of its that never reported back is settled. */
export function agentDone(board: Board, agentId: string, now: number): Board {
  return {
    ...board,
    agents: (board.agents ?? []).filter(id => id !== agentId),
    entries: board.entries.map(x =>
      x.status === 'run' && (x.agentId === agentId || x.task === agentId) ? { ...x, status: 'ok' as const, endedAt: now } : x,
    ),
  }
}

/** The turn is over: every call of the main loop that never reported back is settled, and nothing counts as a fault of it. */
export function sweepOpen(board: Board, now: number): Board {
  return {
    ...board,
    entries: board.entries.map(x =>
      x.status === 'run' && x.from === 'core' && x.task === undefined ? { ...x, status: 'ok' as const, endedAt: now } : x,
    ),
  }
}

/** A new message clears what went wrong on the way to the last answer. */
export function clearFaults(board: Board): Board {
  return board.faults === undefined ? board : { ...board, faults: {} }
}

/** A model request returned how many prompt tokens it saw: the ring around the centre, 0 to 100. */
export function withContext(board: Board, promptTokens: number, limit: number): Board {
  const percent = Math.max(0, Math.min(100, (promptTokens / Math.max(1, limit)) * 100))
  return { ...board, context: percent }
}
