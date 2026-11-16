// The Install Workspace Hooks command: it writes the hook script and its manifest into the
// workspace's .github/hooks/, so the host's hook pipeline feeds the map. The manifest data lives in
// its own module; nothing here reads anything but the extension's own resources.
import * as path from 'path'
import * as vscode from 'vscode'
import { hookJson } from './hookManifest'

/** Write the hook script and the manifest that points the host at it into the open workspace. */
export async function installHooks(): Promise<void> {
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
