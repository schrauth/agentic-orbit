// The extension: it opens the map beside the editor, reads the workspace hook's event lines,
// measures the context window through the loopback proxy, and keeps the board the map is drawn from.
// Nothing it shows is content: names, stations, timings and figures only.
import * as path from 'path'
import * as vscode from 'vscode'
import type { Board, StationId } from '../../types'
import { setupFrom } from '../../hooks/setup'
import { shortModel } from '../../hooks/classify'
import { agentDone, begin, clearFaults, emptyBoard, finish, sweepOpen, withContext } from './board'
import { classifyCopilot } from './classifyCopilot'
import { eventsFileFor, watchEvents } from './hookWatcher'
import type { HookEvent } from './hookWatcher'
import { startProxy } from './proxy'
import type { ProxyServer } from './proxy'
import { LotMapPanel } from './panel'

let panel: LotMapPanel | undefined
let board: Board = emptyBoard()
let watcher: { close: () => void } | undefined
let proxy: ProxyServer | undefined
/** The rows opened by a call whose end has not been read yet, by the call's id. */
const open = new Map<string, string>()
let lastModel: string | undefined

function config(): Record<string, unknown> {
  const c = vscode.workspace.getConfiguration('agenticOrbit')
  const theme = c.get<string>('theme', 'auto')
  const kind = vscode.window.activeColorTheme.kind
  const isDark = kind === vscode.ColorThemeKind.Dark || kind === vscode.ColorThemeKind.HighContrast
  return {
    language: c.get('language', 'en'),
    coreName: c.get('coreName', 'COPILOT'),
    layout: c.get('layout', 'you-top'),
    motion: c.get('motion', 'full'),
    pace: c.get('pace', 'normal'),
    theme: theme === 'auto' ? (isDark ? 'dark' : 'light') : theme,
    background: c.get('background', 'solid'),
    colors: c.get('colors', ''),
    memoryServers: c.get('memoryServers', ['memory']),
    memoryCommands: c.get('memoryCommands', []),
    memorySubcommands: c.get('memorySubcommands', []),
    memoryPaths: c.get('memoryPaths', []),
    memoryLabels: c.get('memoryLabels', []),
  }
}

const t = () => setupFrom(config()).t

/** The board changed: the map is redrawn, whether the panel is open or not; the state lives here. */
function publish(): void {
  if (panel !== undefined) panel.update(board)
}

/** What a tool call reads as on the map: its station and its label, from the event's metadata only. */
function classifyEvent(e: HookEvent): { station: StationId; label: string } {
  return classifyCopilot(e.tool ?? '', { description: e.description, command: e.commandName, url: e.url, file_path: e.filePath }, setupFrom(config()))
}

/** How a hook event reads on the map. Only the six kinds the hook is told about; anything else is dropped. */
function onHookEvent(e: HookEvent): void {
  const now = Date.now()
  switch (e.event) {
    case 'sessionStart': {
      board = emptyBoard()
      if (e.model !== undefined) {
        const before = lastModel
        lastModel = e.model
        if (before !== undefined && before !== e.model) {
          board = begin(board, { station: 'model', label: `${shortModel(before)} → ${shortModel(e.model)}`, status: 'ok', mark: 'switch', uncounted: true }, now).board
        }
      }
      break
    }
    case 'userPromptSubmitted': {
      board = clearFaults(board)
      board = begin(board, { station: 'you', label: t().newMessage, from: 'inbound', status: 'ok' }, now).board
      break
    }
    case 'preToolUse': {
      const { station, label } = classifyEvent(e)
      // A call that launches a subagent also names it: the short description only, its prompt is content.
      const started = begin(
        board,
        { station, label, ...(e.agentId !== undefined ? { from: 'agents' as const, agentId: e.agentId, ...(station === 'agents' ? { agentName: label } : {}) } : {}) },
        now,
      )
      board = started.board
      if (e.callId !== undefined) open.set(e.callId, started.id)
      break
    }
    case 'postToolUse': {
      const id = e.callId !== undefined ? open.get(e.callId) : undefined
      if (e.callId !== undefined) open.delete(e.callId)
      board = finish(board, id, e.error === true ? 'err' : 'ok', now)
      break
    }
    case 'agentStop': {
      if (e.agentId !== undefined) {
        board = agentDone(board, e.agentId, now)
      } else {
        board = sweepOpen(board, now)
        const aborted = e.aborted === true
        board = begin(
          board,
          { station: 'you', label: aborted ? t().turnAborted : t().answerReady, status: aborted ? 'err' : 'ok', ...(aborted ? {} : { mark: 'done' as const }) },
          now,
        ).board
      }
      break
    }
    case 'errorOccurred': {
      const { station, label } = classifyEvent(e)
      const id = e.callId !== undefined ? open.get(e.callId) : undefined
      if (e.callId !== undefined) open.delete(e.callId)
      if (id !== undefined) {
        board = finish(board, id, 'err', now)
      } else {
        board = begin(board, { station, label: e.tool ?? label, status: 'err', startedAt: now, endedAt: now }, now).board
      }
      break
    }
    default:
      return // An event the map does not know: dropped, never an error.
  }
  publish()
}

function onProxyTelemetry(tel: { model: string; promptTokens: number }): void {
  const limit = vscode.workspace.getConfiguration('agenticOrbit').get('contextWindowLimit', 128000)
  const now = Date.now()
  const step = (board.step ?? 0) + 1
  const started = begin(board, { station: 'model', label: `${shortModel(tel.model) || tel.model || 'model'} · ${t().step(step)}`, patch: { model: tel.model, step } }, now)
  board = finish(withContext(started.board, tel.promptTokens, limit), started.id, 'ok', now)
  publish()
}

function startHookWatcher(): void {
  const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  if (workspace === undefined) return
  const override = vscode.workspace.getConfiguration('agenticOrbit').get('hookEventsFile', '')
  const file = eventsFileFor(workspace, typeof override === 'string' ? override : undefined)
  watcher?.close()
  watcher = watchEvents(file, onHookEvent)
}

async function installHooks(): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0]
  if (folder === undefined) {
    void vscode.window.showWarningMessage('Agentic Orbit: open a folder first, so the hooks have somewhere to live.')
    return
  }
  const dest = vscode.Uri.joinPath(folder.uri, '.github', 'hooks', 'agentic-orbit-hook.js')
  const configUri = vscode.Uri.joinPath(folder.uri, '.github', 'hooks', 'hooks.json')
  const source = vscode.Uri.file(path.join(vscode.extensions.getExtension('schrauth.agentic-orbit')?.extensionPath ?? '', 'res', 'agentic-orbit-hook.js'))
  try {
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(folder.uri, '.github', 'hooks'))
    await vscode.workspace.fs.copy(source, dest, { overwrite: true })
    // Copilot's hook file format: version must be the number 1, each entry a command hook
    // whose `command` runs on every shell. Events the map does not know are dropped by the watcher.
    const command = (event: string) =>
      `node .github/hooks/agentic-orbit-hook.js event=${event}`
    const hook = {
      version: 1,
      hooks: {
        sessionStart: [{ type: 'command', command: command('sessionStart') }],
        userPromptSubmitted: [{ type: 'command', command: command('userPromptSubmitted') }],
        preToolUse: [{ type: 'command', command: command('preToolUse') }],
        postToolUse: [{ type: 'command', command: command('postToolUse') }],
        postToolUseFailure: [{ type: 'command', command: command('errorOccurred') }],
        agentStop: [{ type: 'command', command: command('agentStop') }],
        errorOccurred: [{ type: 'command', command: command('errorOccurred') }],
      },
    }
    const encoded = new TextEncoder().encode(`${JSON.stringify(hook, null, 2)}\n`)
    await vscode.workspace.fs.writeFile(configUri, encoded)
    void vscode.window.showInformationMessage(
      'Agentic Orbit: hooks written to .github/hooks/. The event file is watched; nothing leaves this machine.',
    )
  } catch {
    void vscode.window.showErrorMessage('Agentic Orbit: the hook files could not be written.')
  }
}

async function startProxyCommand(): Promise<void> {
  const c = vscode.workspace.getConfiguration('agenticOrbit')
  const port = c.get('proxy.port', 8317)
  const target = c.get('proxy.targetBaseUrl', '')
  if (typeof target !== 'string' || target === '') {
    void vscode.window.showWarningMessage('Agentic Orbit: set agenticOrbit.proxy.targetBaseUrl to your on-prem LLM first (e.g. https://llm.internal/v1).')
    return
  }
  try {
    proxy?.close()
    proxy = await startProxy(port, target, onProxyTelemetry)
    void vscode.window.showInformationMessage(
      `Agentic Orbit: proxy listening on http://127.0.0.1:${proxy.port}/v1 — point your custom model's base URL at it.`,
    )
  } catch (err) {
    void vscode.window.showErrorMessage(`Agentic Orbit: the proxy could not start (${String(err)}).`)
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const openMap = (): void => {
    if (panel !== undefined) {
      panel.reveal()
      return
    }
    panel = new LotMapPanel(context.extensionUri, board, config, message => {
      if (message.type === 'minimize') {
        panel?.setMinimized(message.value === true)
        void context.globalState.update('agenticOrbit.minimized', message.value === true)
      } else if (message.type === 'zoom') {
        panel?.zoomStep(message.by === 1 ? 1 : -1)
      }
    })
    const kept = context.globalState.get<boolean | undefined>('agenticOrbit.minimized')
    if (kept === true) panel?.setMinimized(true)
  }
  context.subscriptions.push(
    vscode.commands.registerCommand('agenticOrbit.open', openMap),
    vscode.commands.registerCommand('agenticOrbit.installHooks', installHooks),
    vscode.commands.registerCommand('agenticOrbit.startProxy', startProxyCommand),
  )
  startHookWatcher()
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('agenticOrbit')) startHookWatcher()
    }),
  )
  if (vscode.workspace.getConfiguration('agenticOrbit').get<boolean>('proxy.enabled', false) === true) void startProxyCommand()
}

export function deactivate(): void {
  watcher?.close()
  proxy?.close()
}
