// The extension: it opens the map beside the editor, reads the workspace hook's event lines,
// measures the context window through the loopback proxy, and keeps the board the map is drawn from.
// Nothing it shows is content: names, stations, timings and figures only.
import * as path from 'path'
import * as vscode from 'vscode'
import { setupFrom } from '../../hooks/setup'
import type { Setup } from '../../hooks/setup'
import { shortModel } from '../../hooks/classify'
import { transitionBoard } from './board'
import { eventsFileFor, watchEvents } from './hookWatcher'
import type { HookEvent } from './hookWatcher'
import { hookJson } from './hookManifest'
import { startProxy } from './proxy'
import type { ProxyServer } from './proxy'
import { AgenticOrbitPanel } from './panel'
import { applyHookEvent, emptyState } from './eventApplier'
import type { ApplierState } from './eventApplier'

let panel: AgenticOrbitPanel | undefined
let watcher: { close: () => void } | undefined
let proxy: ProxyServer | undefined
/**
 * The board and everything the event translation carries between events: the calls still open,
 * the names parked for subagents not yet started, and the model the session last showed.
 */
let state: ApplierState = emptyState()

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
    // The manifest data lives in its own module; the watcher drops events the map does not know.
    const encoded = new TextEncoder().encode(hookJson('.github/hooks/agentic-orbit-hook.js'))
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
    vscode.commands.registerCommand('agenticOrbit.startProxy', startProxyCommand),
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
  if (vscode.workspace.getConfiguration('agenticOrbit').get<boolean>('proxy.enabled', false) === true) void startProxyCommand()
}

export function deactivate(): void {
  watcher?.close()
  proxy?.close()
}
