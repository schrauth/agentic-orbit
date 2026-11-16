// The extension's settings, read into the plain shape the shared `setupFrom` turns into a `Setup`:
// one place that knows every setting's name and default, and nothing else.
import * as vscode from 'vscode'

/** Every `agenticOrbit.*` setting the map reads, with its default — the raw shape `setupFrom` takes. */
export function config(): Record<string, unknown> {
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
