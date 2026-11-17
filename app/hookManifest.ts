// The hooks manifest Copilot reads: which events the map listens to, and the one command that
// reports each. Kept as plain data so a test can pin it; the wiring stays with the installer.
export const HOOK_EVENTS = [
  'sessionStart',
  'userPromptSubmitted',
  'preToolUse',
  'postToolUse',
  'postToolUseFailure',
  'agentStop',
  'errorOccurred',
] as const

/** The manifest text Copilot reads: version 1, each event a command hook that runs on every shell. */
export function hookJson(hookTarget: string): string {
  // Copilot's hook names differ from the wire events in one place:
  // its postToolUseFailure is reported as the wire's errorOccurred.
  const wireEvent: Record<string, string> = { postToolUseFailure: 'errorOccurred' }
  const hook = {
    version: 1,
    hooks: Object.fromEntries(HOOK_EVENTS.map(event => [event, [{ type: 'command', command: `node ${hookTarget} event=${wireEvent[event] ?? event}` }]])),
  }
  return `${JSON.stringify(hook, null, 2)}\n`
}
