#!/usr/bin/env node
// Agentic Orbit telemetry hook for GitHub Copilot. Fail-safe by contract:
//   - always exits 0, within a few milliseconds, whether the extension runs or not;
//   - for preToolUse always prints a valid allow decision, so the agent is never blocked;
//   - on any error it writes nothing and stays silent;
//   - it appends one compact JSON line of METADATA ONLY (event, tool name, timings, status,
//     a short description, a command name) to a local file. No code, no prompt text,
//     no file contents, no query strings. Everything stays on this machine.

'use strict'

var MAX_WAIT_MS = 250 // if no stdin arrives, the event said enough: exit 0 without one

function exit0() {
  process.exit(0)
}

// The allow decision, printed before anything else can go wrong. A refusal shape is never produced.
// preToolUse hooks in Copilot are fail-closed on a crash or a non-zero exit: this hook always
// answers `permissionDecision: "allow"` and exits 0, so it never blocks a tool call.
function allowJson() {
  process.stdout.write(JSON.stringify({ permissionDecision: 'allow' }))
}

function outputPath() {
  if (process.env.AGENTIC_ORBIT_EVENTS_FILE && /^[\w./\\:-]{1,200}$/.test(process.env.AGENTIC_ORBIT_EVENTS_FILE)) {
    return process.env.AGENTIC_ORBIT_EVENTS_FILE
  }
  var os = require('os')
  var crypto = require('crypto')
  var workspace = process.env.AGENTIC_ORBIT_WORKSPACE || process.cwd()
  var key = crypto.createHash('sha1').update(workspace).digest('hex').slice(0, 12)
  return require('path').join(os.tmpdir(), 'agentic-orbit-' + key + '.jsonl')
}

// Only these fields are taken from the event, and only as names and figures. Everything else in it is content.
function oneLine(input, argv) {
  var event =
    argv.event ||
    input.event ||
    input.hook_event_name ||
    input.hookEventName ||
    (input.tool_name && input.tool_name === 'session' ? 'sessionStart' : '')
  // Some hosts wrap the one call of the event in an array; the first entry is read the same way.
  var call = {}
  if (Array.isArray(input.toolCalls) && input.toolCalls.length > 0 && typeof input.toolCalls[0] === 'object') {
    call = input.toolCalls[0]
  }
  var tool = str(input.tool_name) || str(input.toolName) || str(input.tool) || str(input.name) || str(call.name)
  var out = {
    v: 1,
    event: event,
    ts: Date.now(),
    workspace: undefined,
    session: short(str(input.session_id) || str(input.sessionId)),
    callId: short(str(input.tool_use_id) || str(input.callId) || str(input.call_id) || str(input.toolCallId) || str(input.id) || str(call.id), 64),
    agentId: short(str(input.agent_id) || str(input.agentId) || str(input.subagent_id), 64),
    tool: short(tool, 64),
    model: short(str(input.model) || str(input.model_name), 64),
    status: undefined,
    error: bool(input.error) || bool(input.isError) || bool(input.is_error),
    aborted: bool(input.aborted) || bool(input.isAborted),
    description: short(str(input.description) || str(input.explanation), 120),
    commandName: undefined,
    filePath: undefined,
    url: undefined,
    promptTokens: num(input.prompt_tokens) || num(input.promptTokens),
  }
    // The name of a shell command only: never its arguments, never its line.
    // Tool arguments usually sit in a nested object; both places are read.
  var args = input.tool_input || input.toolInput || input.toolArgs || input.input || input.arguments || call.args
  if (args === null || typeof args !== 'object') args = {}
  // The description of a tool call sits in its arguments, as the task tool carries it: the short
  // text a subagent was started with, which is the only name the map may show for it.
  if (!out.description) out.description = short(str(args.description), 120)
  var command = str(input.command) || str(input.command_line) || str(input.commandLine) || str(args.command)
  if (command !== '') out.commandName = short(firstWord(command), 40)
  var path = str(input.file_path) || str(input.filePath) || str(input.path) || str(args.file_path) || str(args.filePath) || str(args.path)
  if (path !== '') out.filePath = short(path, 160)
  var url = str(input.url) || str(input.uri) || str(args.url) || str(args.uri)
  if (url !== '') out.url = short(url, 160)
  var status = str(input.status) || str(input.result_status) || str(input.resultStatus)
  if (status !== '') out.status = short(status, 24)
  for (var key in out) {
    if (out[key] === undefined || out[key] === '') delete out[key]
  }
  return out
}

function firstWord(command) {
  var trimmed = command.trim().replace(/^[(`]'?/, '')
  return trimmed.split(/\s+/)[0] || trimmed.slice(0, 40)
}

function str(v) {
  return typeof v === 'string' ? v : ''
}
function bool(v) {
  return v === true
}
function num(v) {
  return typeof v === 'number' && isFinite(v) && v > 0 ? Math.round(v) : undefined
}
function short(v, max) {
  if (typeof v !== 'string') return ''
  // Control characters never reach the map; they are taken out here already.
  var clean = v.replace(/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]+/g, ' ').trim()
  return clean.length > max ? clean.slice(0, max) : clean
}

function main(buffer) {
  var input = {}
  try {
    input = JSON.parse(buffer.length > 0 ? buffer.toString('utf8') : '{}')
    if (typeof input !== 'object' || input === null) input = {}
  } catch (e) {
    input = {}
  }
  var argv = {}
  for (var i = 2; i < process.argv.length; i++) {
    var at = process.argv[i].indexOf('=')
    if (at > 0) argv[process.argv[i].slice(0, at)] = process.argv[i].slice(at + 1)
  }
  var line = oneLine(input, argv)
  var event = line.event
  if (event === 'preToolUse') allowJson()
  if (event === '' || event === undefined) exit0()
  try {
    var fs = require('fs')
    fs.appendFileSync(outputPath(), JSON.stringify(line) + '\n', { mode: 0o600 })
  } catch (e) {
    // The file cannot be written: the map goes without this event, and the agent goes on.
  }
  exit0()
}

var chunks = []
var size = 0
try {
  process.stdin.on('data', function (chunk) {
    chunks.push(chunk)
    size += chunk.length
    if (size > 1024 * 1024) exit0() // an event larger than a megabyte is not one to read
  })
  process.stdin.on('end', function () {
    main(Buffer.concat(chunks))
  })
  process.stdin.on('error', exit0)
  setTimeout(function () {
    main(Buffer.concat(chunks))
  }, MAX_WAIT_MS)
} catch (e) {
  exit0()
}
