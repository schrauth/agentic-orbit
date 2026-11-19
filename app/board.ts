// The map's state: one board, entries begun and finished,
// counts, faults, agents, context. Plain state in the host, shared with the demo.
import type { Board, BoardEntryStart, BoardTransition, BoardTransitionResult, Entry, StationId, Status } from '../types'
import { clean } from '../hooks/classify'
import { AGENT_FADE_MS, AGENT_HOLD_MS } from '../hooks/draw'

const KEEP = 80
/** How many seats the board keeps around the agents station: those at work and those lately over, until their stay is up. */
const CREW = 12

export type BeginOptions = BoardEntryStart

const newId = (now: number): string => `${now.toString(36)}${Math.random().toString(36).slice(2, 7)}`

/** When a seat's stay is up: held after its loop ended, then faded, then gone. */
const seatOver = (seat: { goneAt?: number }, now: number): boolean =>
  seat.goneAt === undefined ? false : now - seat.goneAt >= AGENT_HOLD_MS + AGENT_FADE_MS

/** Whether a subagent already has a seat under this id: one still held or one still fading counts alike. */
export function seated(board: Board, agentId: string): boolean {
  return (board.agents ?? []).some(seat => seat.id === agentId)
}

/** The newest rows. */
const kept = (entries: Entry[]): Entry[] => {
  const from = entries.length - KEEP
  return from <= 0 ? entries : entries.filter((e, i) => i >= from)
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
    // A seat that is still held keeps its place, so a subagent that starts again never gets a second seat;
    // the call that launched it tells its name, which later calls leave as it is. One back from its fade,
    // the seat starts over. Seats whose stay is up leave only as a new one takes its place,
    // for the board has no clock of its own.
    ...(entry.agentId !== undefined
      ? {
          agents: seated(board, entry.agentId)
            ? (board.agents ?? []).map(seat =>
                seat.id === entry.agentId && seat.goneAt !== undefined
                  ? { id: seat.id, ...(start.agentName !== undefined ? { name: start.agentName } : seat.name !== undefined ? { name: seat.name } : {}) }
                  : seat,
              )
            : [
                ...(board.agents ?? []).filter(seat => !seatOver(seat, now)),
                { id: entry.agentId, ...(start.agentName !== undefined ? { name: start.agentName } : {}) },
              ].slice(-CREW),
        }
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

/** An action that began at one station ends at another: the producer's verdict moves the row, renames it and counts the fault there. */
function finishAt(board: Board, id: string | undefined, status: Status, station: StationId, label: string, now: number): Board {
  if (id === undefined) return board
  const open = board.entries.find(e => e.id === id && e.status === 'run')
  if (open === undefined) return board
  return {
    ...board,
    entries: board.entries.map(e => (e === open ? { ...e, station, label: clean(label), status, endedAt: now } : e)),
    ...(isFault(status) ? { faults: oneMore(board.faults, station) } : {}),
  }
}

/** A subagent's loop is over: it keeps circling for a while yet, and a call of its that never reported back is settled. */
export function agentDone(board: Board, agentId: string, now: number): Board {
  return {
    ...board,
    agents: (board.agents ?? []).map(seat => (seat.id === agentId && seat.goneAt === undefined ? { ...seat, goneAt: now } : seat)),
    entries: board.entries.map(x => (x.status === 'run' && x.agentId === agentId ? { ...x, status: 'ok' as const, endedAt: now } : x)),
  }
}

/** The turn is over: every call of the main loop that never reported back is settled, and nothing counts as a fault of it. */
export function sweepOpen(board: Board, now: number): Board {
  return {
    ...board,
    entries: board.entries.map(x => (x.status === 'run' && x.from === 'core' ? { ...x, status: 'ok' as const, endedAt: now } : x)),
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

/** Apply one caller-normalized event to the board. Hook parsing and caller state stay outside this reducer. */
export function transitionBoard(board: Board, transition: BoardTransition, now: number): BoardTransitionResult {
  switch (transition.type) {
    case 'reset':
      return { board: emptyBoard() }
    case 'prompt':
      return { board: begin(clearFaults(board), { station: 'you', label: transition.label, from: 'inbound', status: 'ok' }, now).board }
    case 'entryStarted':
      return begin(board, transition.start, now)
    case 'entryFinished':
      return { board: finish(board, transition.id, transition.status, now) }
    case 'failure': {
      const status = transition.status ?? 'err'
      if (transition.id !== undefined) {
        // A producer's blocked verdict moves the row to the station that refused it; an error stays where it began.
        return { board: status === 'block' ? finishAt(board, transition.id, status, transition.station, transition.label, now) : finish(board, transition.id, status, now) }
      }
      const started = begin(board, { station: transition.station, label: transition.label, status, startedAt: now, endedAt: now }, now)
      // An explicit fault status counts; the absent field keeps the old no-entry behavior unchanged.
      return { board: transition.status !== undefined && isFault(status) ? { ...started.board, faults: oneMore(board.faults, transition.station) } : started.board }
    }
    case 'agentFinished':
      return { board: agentDone(board, transition.agentId, now) }
    case 'turnFinished':
      return {
        board: begin(
          sweepOpen(board, now),
          { station: 'you', label: transition.label, status: transition.status, ...(transition.mark === undefined ? {} : { mark: transition.mark }) },
          now,
        ).board,
      }
    case 'modelStep': {
      const started = begin(
        board,
        { station: 'model', label: transition.label, patch: { model: transition.model, step: transition.step } },
        now,
      )
      return { board: finish(withContext(started.board, transition.promptTokens, transition.limit), started.id, 'ok', now) }
    }
  }
}
