import type { Board, ViewProjection, ViewRow } from '../types'
import { formatMs } from './classify'
import { MAP_ASPECT, MAP_WIDTH, drawMap } from './draw'
import { describeNow, foldRows, nowParts } from './feed'
import type { Setup } from './setup'
import { STATIONS } from './setup'

export type ViewOptions = { width?: number; hidden?: boolean }

/** The widths, in CSS pixels, the map may be drawn at; past the last it is as wide as the pane. */
export const ZOOMS: readonly number[] = [180, 220, 260, 310, 370, 440, 530, 570, 620, 660]

const LONG_LABEL = 28

const shortMeterModel = (model: string): string => (model.length <= 14 ? model : `${model.slice(0, 13)}…`)

/** Project board state into the message consumed by the extension panel and browser demo. */
export function projectView(board: Board, now: number, setup: Setup, options: ViewOptions = {}): ViewProjection {
  const { t } = setup
  const turnMs = new Map<string, number>()
  let askedAt: number | undefined
  for (const entry of board.entries) {
    if (entry.station === 'you' && entry.from === 'inbound' && entry.mark === undefined) askedAt = entry.startedAt
    if (entry.mark === 'done' && askedAt !== undefined) {
      turnMs.set(entry.id, entry.startedAt - askedAt)
      askedAt = undefined
    }
  }

  const rows: ViewRow[] = foldRows(board.entries, 16)
    .map(({ entry, times, tookMs }) => {
      const isSwitch = entry.mark === 'switch'
      const whole = turnMs.get(entry.id)
      const took =
        entry.endedAt === undefined
          ? t.running
          : whole !== undefined && whole > 0
            ? formatMs(whole, t)
            : tookMs > 0
              ? formatMs(tookMs, t)
              : '—'
      const color: ViewRow['color'] = isSwitch || entry.status === 'run' ? 'link' : entry.status === 'ok' ? 'fg' : 'err'
      return {
        id: entry.id,
        mark: isSwitch ? '◆' : entry.status === 'run' ? '●' : entry.status === 'ok' ? '·' : '✕',
        station: t.stations[entry.station],
        label: entry.label,
        times,
        took: took === '—' ? '' : took,
        color,
        dim: entry.status === 'ok' && !isSwitch,
        isLong: entry.label.length > LONG_LABEL,
      }
    })
    .reverse()

  const nowPartsValue = nowParts(board, t)
  const meter = [
    board.context === undefined ? '' : `${Math.round(board.context)}%`,
    board.model === undefined || nowPartsValue.what.startsWith(t.stations.model) ? '' : shortMeterModel(board.model),
  ]
    .filter(Boolean)
    .join(' · ')

  return {
    type: 'view',
    svg: options.hidden === true ? '' : drawMap(board, now, setup),
    alt: `${t.title}. ${describeNow(board, t)}`,
    nowline: `${nowPartsValue.what}${meter === '' ? '' : `   ${meter}`}`,
    counts: STATIONS.filter(station => (board.counts[station.id] ?? 0) > 0)
      .map(station => `${t.stations[station.id]} ${board.counts[station.id]}`)
      .join(' · '),
    rows,
    hidden: options.hidden === true,
    width: options.width,
    aspect: MAP_ASPECT,
    mapWidth: MAP_WIDTH,
    labels: { zoomOut: t.zoomOut, zoomIn: t.zoomIn, hideMap: t.hideMap, showMap: t.showMap },
  }
}
