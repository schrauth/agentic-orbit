# Hooks for your project

Agentic Orbit does not need its own hook script in your project. It reads one events file, and any producer that appends the right lines to it can feed the map. This guide shows both ways: use the ready-made observer, or keep your own hooks and adapt their output.

## What the app reads

The host watches a JSONL file and draws one event per line:

- One JSON object per line, appended, never rewritten.
- Unknown events and malformed lines are dropped; they are not an error.
- The host starts at the end of an existing file, so it draws what happens from the moment it starts.
- The file lives at `$TMPDIR/agentic-orbit-<sha1(workspace)[:12]>.jsonl`, where `workspace` is the string given to `--workspace` — pass it absolutely.
- `AGENTIC_ORBIT_EVENTS_FILE` (hook side) and `--events-file` (app side) override that path. Set both to the same file to remove every path ambiguity.

The running host never writes into your project: it only reads this file and serves the page on loopback. `--install-hooks` is a separate command that writes the hook files and exits.

## Option A: use the ready-made observer

For a Copilot project without hooks, the shortest path is the observer that ships with the app:

```bash
cd app
npm start -- --install-hooks /absolute/path/to/the/project
```

That writes `.github/hooks/hooks.json` and `.github/hooks/agentic-orbit-hook.js` into the project and exits. Start a new Copilot session so it loads them, then watch the project:

```bash
npm start -- --workspace /absolute/path/to/the/project
```

Do **not** add `--guard` for a foreign project unless you want this repository's policy rules. The guards protect `.github/agents/` and the subagent Git monopoly; they are not part of the visualization contract. See [Guards](#guards) below.

If the project already has `.github/hooks/hooks.json`, back it up first: the installer overwrites it.

## Option B: keep your own hooks

Your hook only has to turn its host's payload into lines of this shape:

```json
{"v":1,"event":"preToolUse","ts":1795076813234,"session":"s1","callId":"t1","tool":"bash","commandName":"npm"}
{"v":1,"event":"postToolUse","ts":1795076813301,"session":"s1","callId":"t1"}
```

### The fields

| Field | Required | Meaning |
| --- | --- | --- |
| `v` | yes | Line format; must be `1`. |
| `event` | yes | One of the events below. |
| `ts` | recommended | Epoch milliseconds. |
| `session` | recommended | Groups the calls of one session into one board. |
| `callId` | for calls | Pairs `preToolUse` with its `postToolUse` or failure. |
| `agentId` | for subagents | The subagent whose loop made the call. Absent for the main loop. |
| `tool` | for calls | The tool's name, as the host spells it. |
| `description` | optional | A short name, never content; for a subagent launch it names the child. |
| `commandName` | optional | The first word of a shell command only. |
| `fileTail` | optional | The last two path parts only. |
| `urlHost` | optional | The address's host only. |
| `skill` | optional | The skill's name only. |
| `error` | optional | `true` on a failed `postToolUse`. |
| `aborted` | optional | `true` on an aborted turn. |
| `status` | optional | `"blocked"` for a deliberate guard refusal. |

No field carries prompt text, file contents, a full path, a command line or a query string. See [Privacy](../PRIVACY.md) for the complete list.

### The events

| `event` | When | What it draws |
| --- | --- | --- |
| `sessionStart` | A session begins. | Resets the board; `model` names it and shows a model switch when it changes. |
| `userPromptSubmitted` | The person sends a message. | An Operator row. Omit `agentId`: a subagent's prompt is not the person's. |
| `preToolUse` | A call starts. | A pulse to the station; `callId` and `tool` are the minimum. |
| `postToolUse` | A call ends. | The return pulse; `error: true` turns it red. |
| `errorOccurred` | A call fails. | A red failure at the call's station, or at Hooks when `status` is `"blocked"`. |
| `agentStop` | A subagent or the turn ends. | With `agentId`, the planet fades; without it, the answer ring. |
| `modelStep` | The optional proxy measures a request. | A step on the Model station and the context ring. |

Events the app does not know are dropped. A `preToolUse` without a matching end is swept when the turn ends.

### A manifest

Copilot loads every `*.json` under `.github/hooks/`. A full observer manifest looks like this:

```json
{
  "version": 1,
  "hooks": {
    "sessionStart": [{ "type": "command", "command": "node .github/hooks/my-hook.js event=sessionStart" }],
    "userPromptSubmitted": [{ "type": "command", "command": "node .github/hooks/my-hook.js event=userPromptSubmitted" }],
    "preToolUse": [{ "type": "command", "command": "node .github/hooks/my-hook.js event=preToolUse" }],
    "postToolUse": [{ "type": "command", "command": "node .github/hooks/my-hook.js event=postToolUse" }],
    "postToolUseFailure": [{ "type": "command", "command": "node .github/hooks/my-hook.js event=errorOccurred" }],
    "agentStop": [{ "type": "command", "command": "node .github/hooks/my-hook.js event=agentStop" }],
    "errorOccurred": [{ "type": "command", "command": "node .github/hooks/my-hook.js event=errorOccurred" }]
  }
}
```

### A minimal adapter

This Node script is a starting point, not the full observer. It reads Copilot's payload from stdin, answers every `preToolUse` with allow, and appends one line per call:

```js
#!/usr/bin/env node
const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')

let raw = ''
process.stdin.on('data', chunk => { raw += chunk })
process.stdin.on('end', () => {
  let payload = {}
  try { payload = JSON.parse(raw) } catch {}

  const event = (process.argv[2] || '').replace(/^event=/, '') ||
    payload.hook_event_name || payload.hookEventName || ''

  // Copilot counts a crashed preToolUse hook as a denial: answer first, always allow.
  if (event === 'preToolUse') {
    process.stdout.write(JSON.stringify({ permissionDecision: 'allow' }))
  }

  const input = payload.tool_input || payload.toolInput || {}
  const text = value => typeof value === 'string' ? value : ''
  const tail = value => value.replace(/\\/g, '/').split('/').filter(Boolean).slice(-2).join('/')
  const host = value => { try { return new URL(value).hostname } catch { return '' } }

  const command = text(input.command)
  const filePath = text(input.file_path) || text(input.filePath) || text(input.path)
  const url = text(input.url)
  const workspace = process.env.AGENTIC_ORBIT_WORKSPACE || process.cwd()
  const fileKey = crypto.createHash('sha1').update(workspace).digest('hex').slice(0, 12)
  const file = process.env.AGENTIC_ORBIT_EVENTS_FILE ||
    path.join(os.tmpdir(), 'agentic-orbit-' + fileKey + '.jsonl')

  const line = {
    v: 1,
    event,
    ts: Date.now(),
    session: text(payload.session_id) || text(payload.sessionId),
    callId: text(payload.tool_use_id) || text(payload.callId),
    agentId: text(payload.agent_id) || text(payload.agentId) || text(payload.subagent_id),
    tool: text(payload.tool_name) || text(payload.toolName),
    description: text(input.description) || text(payload.description),
    commandName: command ? command.trim().split(/\s+/)[0] : '',
    fileTail: filePath ? tail(filePath) : '',
    urlHost: url ? host(url) : '',
    skill: text(input.skill),
    error: payload.error === true || payload.isError === true ? true : undefined,
  }
  for (const k of Object.keys(line)) if (line[k] === '' || line[k] === undefined) delete line[k]
  try { fs.appendFileSync(file, JSON.stringify(line) + '\n', { mode: 0o600 }) } catch {}
  process.exit(0)
})
```

The observer in [app/res/agentic-orbit-hook.js](../app/res/agentic-orbit-hook.js) is the reference implementation; it handles more payload spellings and reduces paths and addresses before writing.

### Two rules that keep the agent working

1. **`preToolUse` must always allow and exit `0`.** Copilot treats a crash or a non-zero exit as a denial; a timeout falls through to the normal permission flow, but a crashed hook does not. Print `{"permissionDecision":"allow"}` before any work that can fail.
2. **Write names, never content.** One line holds metadata only; the map and the events file must never see prompts, code, command lines or full paths.

## Test the feed

Start the app on a scratch file:

```bash
node app/out/server.js --events-file /tmp/my-events.jsonl
```

Then append two lines while it runs:

```bash
printf '%s\n' '{"v":1,"event":"preToolUse","callId":"t1","tool":"bash","commandName":"npm"}' >> /tmp/my-events.jsonl
printf '%s\n' '{"v":1,"event":"postToolUse","callId":"t1"}' >> /tmp/my-events.jsonl
```

The map should show a Shell call that starts and finishes. If it stays dark, check:

- the app and the hook point at the same file (`--events-file` / `AGENTIC_ORBIT_EVENTS_FILE`);
- with `--workspace`, both sides hash the same absolute path;
- the line is one JSON object, not an array;
- `event` is one of the names above;
- the lines were appended after the host started.

## Guards

The `--guard` option installs the two guards this repository uses: an edit under `.github/agents/` is denied, and a subagent's `git` command is denied. They are policy, not plumbing. A foreign project usually wants neither.

If you want your own policy, write a `preToolUse` hook that returns `{"permissionDecision":"deny","permissionDecisionReason":"…"}` and appends a line with `status: "blocked"`:

```json
{"v":1,"event":"errorOccurred","callId":"t1","tool":"edit_file","status":"blocked"}
```

The app then lights the **Hooks** station red and names the tool. The reason string is for the agent, not the map; keep it a rule name, never the payload.
