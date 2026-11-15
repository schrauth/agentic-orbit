export type StationId =
  | 'you' | 'model' | 'memory' | 'files' | 'shell'
  | 'web' | 'browser' | 'agents' | 'skills' | 'hooks'

export type Status = 'run' | 'ok' | 'err' | 'block'

/** One action on the map. Labels carry names and record numbers, never the text of a memory. */
export type Entry = {
  id: string
  station: StationId
  label: string
  /** Where the pulse starts: the core, the agents station, or the station itself (a signal coming in). */
  from: 'core' | 'agents' | 'inbound'
  startedAt: number
  endedAt?: number
  status: Status
  /** The subagent whose loop made the call; absent for the main loop. */
  agentId?: string
  /** The background task the call started; the row stays open until that task reports back. */
  task?: string
  /** A moment the map marks: the model changed, or the answer is ready. */
  mark?: 'switch' | 'done'
}

export type Board = {
  entries: Entry[]
  counts: Partial<Record<StationId, number>>
  model?: string
  step?: number
  /** How many of the memory station's count a hook brought unasked. */
  pushed?: number
  /** Errors and refusals per station since the person's last message. */
  faults?: Partial<Record<StationId, number>>
  /** The subagents' seats around the agents station: those still at work, and those lately over, kept until their stay is up.
   * A seat carries the short name the agent was started with; never anything of its prompt. */
  agents?: { id: string; name?: string; goneAt?: number }[]
  /** How full the context window is, 0 to 100. */
  context?: number
  /** When the model last changed. */
  switchedAt?: number
  /** The row of the feed the person opened to read whole: its entry's id. */
  open?: string
  /** The editor's pane folded to its line of now; kept between sessions as well. */
  minimized?: boolean
  /** How wide the editor draws the map, in CSS pixels; absent, as wide as the pane. Kept between sessions as well. */
  zoom?: number
}

export type BoardEntryStart = {
  station: StationId
  label: string
  from?: Entry['from']
  status?: Status
  agentId?: string
  /** The short name the subagent was started with; its prompt is content. */
  agentName?: string
  mark?: Entry['mark']
  uncounted?: boolean
  startedAt?: number
  endedAt?: number
  patch?: Partial<Pick<Board, 'model' | 'step' | 'switchedAt'>>
}

export type BoardTransition =
  | { type: 'reset' }
  | { type: 'prompt'; label: string }
  | { type: 'entryStarted'; start: BoardEntryStart }
  | { type: 'entryFinished'; id?: string; status: Status }
  | { type: 'failure'; id?: string; station: StationId; label: string }
  | { type: 'agentFinished'; agentId: string }
  | { type: 'turnFinished'; label: string; status: 'ok' | 'err'; mark?: 'done' }
  | { type: 'modelStep'; model: string; step: number; label: string; promptTokens: number; limit: number }

export type BoardTransitionResult = { board: Board; id?: string }

export type ViewRow = {
  id: string
  mark: string
  station: string
  label: string
  times: number
  took: string
  color: 'link' | 'fg' | 'err'
  dim: boolean
  isLong: boolean
}

export type ViewProjection = {
  type: 'view'
  svg: string
  alt: string
  nowline: string
  counts: string
  rows: ViewRow[]
  hidden: boolean
  width?: number
  mapWidth: number
  aspect: number
  labels: { zoomOut: string; zoomIn: string; hideMap: string; showMap: string }
}
