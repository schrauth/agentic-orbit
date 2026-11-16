// The extension: it opens the map beside the editor, reads the workspace hook's event lines,
// measures the context window through the loopback proxy, and keeps the board the map is drawn from.
// Nothing it shows is content: names, stations, timings and figures only.
// This file is the front door: it wires the commands, the watcher and the proxy together; each
// concern lives in its own module — config, installHooks, proxyCommand, and the shared applier.
import * as vscode from 'vscode'
import { setupFrom } from '../../hooks/setup'
import type { Setup } from '../../hooks/setup'
import { shortModel } from '../../hooks/classify'
import { transitionBoard } from './board'
import { eventsFileFor, watchEvents } from './hookWatcher'
import type { HookEvent } from './hookWatcher'
import { AgenticOrbitPanel } from './panel'
import { applyHookEvent, emptyState } from './eventApplier'
import type { ApplierState } from './eventApplier'
import { config } from './config'
import { installHooks } from './installHooks'
import { startProxyCommand } from './proxyCommand'
import type { ProxyServer } from './proxy'

let panel: AgenticOrbitPanel | undefined
let watcher: { close: () => void } | undefined
let proxy: ProxyServer | undefined
/**
 * The board and everything the event translation carries between events: the calls still open,
 * the names parked for subagents not yet started, and the model the session last showed.
 */
let state: ApplierState = emptyState()

const t = (setup: Setup) => setup.t

/** The board changed: the map is redrawn, whether the panel is open or not; the state lives here. */
function publish(): void {
  if (panel !== undefined) panel.update(state.board)
}

/** How a hook event reads on the map: the shared translation applies it, the panel is told. */
function onHookEvent(e: HookEvent): void {
  applyHookEvent(state, e, setupFrom(config()), Date.now())
  publish()
}

function onProxyTelemetry(tel: { model: string; promptTokens: number }): void {
  const limit = vscode.workspace.getConfiguration('agenticOrbit').get('contextWindowLimit', 128000)
  const now = Date.now()
  const step = (state.board.step ?? 0) + 1
  state.board = transitionBoard(
    state.board,
    {
      type: 'modelStep',
      model: tel.model,
      step,
      label: `${shortModel(tel.model) || tel.model || 'model'} · ${t(setupFrom(config())).step(step)}`,
      promptTokens: tel.promptTokens,
      limit,
    },
    now,
  ).board
  publish()
}

/** Bring up the proxy the command starts, closing any earlier one first. */
async function startProxyWithState(): Promise<void> {
  proxy?.close()
  proxy = await startProxyCommand(onProxyTelemetry)
}

function startHookWatcher(): void {
  const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  if (workspace === undefined) return
  const override = vscode.workspace.getConfiguration('agenticOrbit').get('hookEventsFile', '')
  const file = eventsFileFor(workspace, typeof override === 'string' ? override : undefined)
  watcher?.close()
  watcher = watchEvents(file, onHookEvent)
}

export function activate(context: vscode.ExtensionContext): void {
  const openMap = (): void => {
    if (panel !== undefined) {
      panel.reveal()
      return
    }
    panel = new AgenticOrbitPanel(context.extensionUri, state.board, config, message => {
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
    vscode.commands.registerCommand('agenticOrbit.startProxy', () => void startProxyWithState()),
  )
  startHookWatcher()
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('agenticOrbit')) {
        startHookWatcher()
        // An open map reads the new settings on its next send: labels and theme switch live.
        panel?.refresh()
      }
    }),
  )
  if (vscode.workspace.getConfiguration('agenticOrbit').get<boolean>('proxy.enabled', false) === true) void startProxyWithState()
}

export function deactivate(): void {
  watcher?.close()
  proxy?.close()
}
