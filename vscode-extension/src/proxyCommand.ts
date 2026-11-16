// The Start Proxy command: it brings up the loopback proxy that measures the context window, on
// the operator's say-so and pointed at the on-prem LLM they configured. The telemetry it measures
// is handed to the extension's state through the callback it is given.
import * as vscode from 'vscode'
import { startProxy } from './proxy'
import type { ProxyServer } from './proxy'

/** Bring up the proxy if it is configured, close any earlier one first, and report either way. */
export async function startProxyCommand(onTelemetry: (tel: { model: string; promptTokens: number }) => void): Promise<ProxyServer | undefined> {
  const c = vscode.workspace.getConfiguration('agenticOrbit')
  const port = c.get('proxy.port', 8317)
  const target = c.get('proxy.targetBaseUrl', '')
  if (typeof target !== 'string' || target === '') {
    void vscode.window.showWarningMessage('Agentic Orbit: set agenticOrbit.proxy.targetBaseUrl to your on-prem LLM first (e.g. https://llm.internal/v1).')
    return undefined
  }
  try {
    const proxy = await startProxy(port, target, onTelemetry)
    void vscode.window.showInformationMessage(
      `Agentic Orbit: proxy listening on http://127.0.0.1:${proxy.port}/v1 — point your custom model's base URL at it.`,
    )
    return proxy
  } catch (err) {
    void vscode.window.showErrorMessage(`Agentic Orbit: the proxy could not start (${String(err)}).`)
    return undefined
  }
}
