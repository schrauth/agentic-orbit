#!/usr/bin/env node
// Agentic Orbit guard hook for GitHub Copilot. Opt-in by contract (ADR-010):
//   - it denies a tool call only when an explicit guard rule matches;
//   - it answers allow otherwise, in doubt, and on any malformed payload;
//   - it never throws and always exits 0 within milliseconds — Copilot counts a crashed
//     command hook as a denial, the inverse of the observer's fail-safe;
//   - on a denial it appends one compact JSON line of METADATA ONLY to the same events
//     file the observer writes: the event, the ids, the tool's name, the rule's marker and
//     `status: "blocked"`. No command lines, no paths, no file contents, no prompt text.

'use strict'

var MAX_WAIT_MS = 250 // if no stdin arrives, the call said nothing: allow and exit 0

var EDIT_TOOLS = {
  edit_file: true,
  create_file: true,
  apply_patch: true,
  insert_edit_into_existing_file: true,
  insert_content: true,
  replace_file_content: true,
  write_to_file: true,
}

// The protected directory, matched on a normalized path. A case variant is the same directory
// on the systems this runs on, so it is denied as well.
var AGENTS_DIR = /(^|\/)\.github\/agents(\/|$)/i

// Commands that run another command: the one that counts is the one they run. The same shape the
// map's shell classifier uses, kept small here so the guard stays a standalone script.
var WRAPPERS = {
  sudo: { takes: ['-u', '-g', '-p', '-h', '-C', '-D', '-R', '-T', '-U', '-r', '-t'] },
  doas: { takes: ['-u', '-C'] },
  env: { takes: ['-u', '-C'] },
  time: {},
  timeout: { takes: ['-s', '-k'], skip: 1 },
  nohup: {},
  nice: { takes: ['-n'] },
  ionice: { takes: ['-c', '-n'] },
  stdbuf: { takes: ['-i', '-o', '-e'] },
  caffeinate: { takes: ['-t', '-w'] },
  command: { asks: ['-v', '-V'] },
  exec: { takes: ['-a'] },
  xargs: { takes: ['-n', '-I', '-P', '-L', '-d', '-E', '-s', '-a', '-J', '-R'] },
}
var ASSIGNMENT = /^[A-Za-z_]\w*=/

var answered = false
var done = false

function exit0() {
  process.exit(0)
}

function answer(decision) {
  if (answered) return
  answered = true
  process.stdout.write(JSON.stringify(decision))
}

function allowJson() {
  answer({ permissionDecision: 'allow' })
}

function denyJson(reason) {
  answer({ permissionDecision: 'deny', permissionDecisionReason: reason })
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

function str(v) {
  return typeof v === 'string' ? v : ''
}

function short(v, max) {
  if (typeof v !== 'string') return ''
  var clean = v.replace(/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]+/g, ' ').trim()
  return clean.length > max ? clean.slice(0, max) : clean
}

// Some hosts wrap the one call of the event in an array; the first entry is read the same way.
function firstCall(input) {
  var call = Array.isArray(input.toolCalls) && input.toolCalls.length > 0 ? input.toolCalls[0] : undefined
  return call !== null && typeof call === 'object' ? call : {}
}

function argsOf(input) {
  var call = firstCall(input)
  var args = input.tool_input || input.toolInput || input.toolArgs || input.input || input.arguments || call.args
  return args !== null && typeof args === 'object' ? args : {}
}

function toolOf(input) {
  var call = firstCall(input)
  return str(input.tool_name) || str(input.toolName) || str(input.tool) || str(input.name) || str(call.name)
}

function callIdOf(input) {
  var call = firstCall(input)
  return str(input.tool_use_id) || str(input.callId) || str(input.call_id) || str(input.toolCallId) || str(input.id) || str(call.id)
}

// An agent identity is observed, not contractually guaranteed: when it is absent the git rule
// fails open and the main chat keeps its Git rights.
function agentIdOf(input) {
  var call = firstCall(input)
  var args = argsOf(input)
  return (
    str(input.agent_id) ||
    str(input.agentId) ||
    str(input.subagent_id) ||
    str(call.agent_id) ||
    str(call.agentId) ||
    str(args.agent_id) ||
    str(args.agentId)
  )
}

function commandOf(input) {
  var args = argsOf(input)
  return str(input.command) || str(input.command_line) || str(input.commandLine) || str(args.command) || str(args.command_line) || str(args.commandLine)
}

function pathsOf(input) {
  var args = argsOf(input)
  var out = []
  var keys = ['file_path', 'filePath', 'path', 'notebook_path', 'notebookPath', 'absolute_path']
  for (var i = 0; i < keys.length; i++) {
    var direct = str(input[keys[i]]) || str(args[keys[i]])
    if (direct !== '') out.push(direct)
  }
  var edits = input.edits || args.edits || input.edit || args.edit
  if (Array.isArray(edits)) {
    for (var j = 0; j < edits.length; j++) {
      var edit = edits[j]
      if (edit === null || typeof edit !== 'object') continue
      var path = str(edit.file_path) || str(edit.filePath) || str(edit.path)
      if (path !== '') out.push(path)
    }
  }
  return out
}

function carriesEdits(input) {
  var args = argsOf(input)
  var edits = input.edits || args.edits || input.edit || args.edit
  return Array.isArray(edits) && edits.length > 0
}

function underAgents(path) {
  var text = String(path).replace(/\\/g, '/')
  var absolute = text.charAt(0) === '/' || /^[A-Za-z]:\//.test(text) ? text : require('path').resolve(process.cwd(), text).replace(/\\/g, '/')
  return AGENTS_DIR.test(absolute)
}

// The classifier's edit tools, plus any name shaped like an edit so an alias cannot slip past.
function isEditTool(tool) {
  var name = String(tool).toLowerCase()
  return EDIT_TOOLS[name] === true || /(^|_)(edit|write|create|replace|insert|patch)(_|$)/.test(name)
}

function agentsEdit(input) {
  if (!isEditTool(toolOf(input)) && !carriesEdits(input)) return false
  return pathsOf(input).some(underAgents)
}

/** The words of each command in a shell line, leading assignments taken off; quotes stay. */
function segments(command) {
  return command
    .split(/&&|\|\||;|\||\n|\$\(|`|\(|\)/)
    .map(function (part) {
      return part.match(/(?:[^\s"']|"[^"]*"?|'[^']*'?)+/g) || []
    })
    .map(function (words) {
      var i = 0
      while (i < words.length && ASSIGNMENT.test(words[i])) i++
      return words.slice(i)
    })
    .filter(function (words) {
      return words.length > 0
    })
}

/** A command's own name: no quotes and no folder before it; a Windows program loses its ending. */
function base(word) {
  var name = String(word || '').replace(/["']/g, '').replace(/\\/g, '/').split('/').pop() || ''
  return /\.(?:exe|cmd|bat)$/i.test(name) ? name.replace(/\.(?:exe|cmd|bat)$/i, '').toLowerCase() : name
}

function pastFlags(words, takes) {
  var i = 0
  while (i < words.length && words[i].charAt(0) === '-') {
    var flag = words[i]
    i += takes.indexOf(flag) >= 0 ? 2 : 1
  }
  return words.slice(i)
}

function unwrap(words) {
  var rest = words
  for (var depth = 0; depth < 6; depth++) {
    var wrapper = WRAPPERS[base(rest[0]).toLowerCase()]
    if (wrapper === undefined) break
    if (wrapper.asks !== undefined && wrapper.asks.indexOf(rest[1]) >= 0) break
    rest = pastFlags(rest.slice(1), wrapper.takes || [])
    var i = 0
    while (i < rest.length && ASSIGNMENT.test(rest[i])) i++
    rest = rest.slice(i + (wrapper.skip || 0))
  }
  return rest
}

// Only a call that carries an agent identity loses its Git rights; the main chat keeps them.
function gitFromSubagent(input) {
  if (agentIdOf(input) === '') return false
  var command = commandOf(input)
  if (command === '') return false
  return segments(command).some(function (words) {
    var rest = unwrap(words)
    return rest.length > 0 && base(rest[0]).toLowerCase() === 'git'
  })
}

function decide(input) {
  if (agentsEdit(input)) {
    return {
      marker: 'guard: agents-protected',
      reason: "Agentic Orbit guard: .github/agents/ is change-protected; edits need the user's explicit approval (D-004).",
    }
  }
  if (gitFromSubagent(input)) {
    return {
      marker: 'guard: git-monopoly',
      reason: 'Agentic Orbit guard: only the Version Control Agent runs git; a subagent call must not (project Git rule).',
    }
  }
  return undefined
}

// One names-only line. The wire has no free-text error field, so the existing `description`
// carries the guard's own marker; the applier reads only `status` and the tool name.
function report(input, marker) {
  var line = {
    v: 1,
    event: 'errorOccurred',
    ts: Date.now(),
    callId: short(callIdOf(input), 64),
    agentId: short(agentIdOf(input), 64),
    tool: short(toolOf(input), 64),
    description: marker,
    status: 'blocked',
  }
  for (var key in line) {
    if (line[key] === undefined || line[key] === '') delete line[key]
  }
  try {
    require('fs').appendFileSync(outputPath(), JSON.stringify(line) + '\n', { mode: 0o600 })
  } catch (e) {
    // The map goes without the line; the denial still stands.
  }
}

function main(buffer) {
  if (done) return
  done = true
  try {
    var input = {}
    try {
      var parsed = JSON.parse(buffer.length > 0 ? buffer.toString('utf8') : '{}')
      if (Array.isArray(parsed)) parsed = parsed.length > 0 ? parsed[0] : {}
      if (parsed !== null && typeof parsed === 'object') input = parsed
    } catch (e) {
      input = {}
    }
    var verdict = decide(input)
    if (verdict === undefined) {
      allowJson()
    } else {
      denyJson(verdict.reason)
      try {
        report(input, verdict.marker)
      } catch (e) {
        // A witness that cannot write must not turn a denial into a crash.
      }
    }
  } catch (e) {
    allowJson()
  }
  exit0()
}

var chunks = []
var size = 0
try {
  process.stdin.on('data', function (chunk) {
    chunks.push(chunk)
    size += chunk.length
    if (size > 1024 * 1024) main(Buffer.concat(chunks)) // an event larger than a megabyte is not one to read
  })
  process.stdin.on('end', function () {
    main(Buffer.concat(chunks))
  })
  process.stdin.on('error', function () {
    main(Buffer.concat(chunks))
  })
  setTimeout(function () {
    main(Buffer.concat(chunks))
  }, MAX_WAIT_MS)
} catch (e) {
  main(Buffer.from(''))
}
