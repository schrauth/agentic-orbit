// Which station a GitHub Copilot tool call belongs to and what to call it: a name, never content.
// Reuses the app's own shell classifier, so the same command line reads the same in the app and the demo.
import type { StationId } from '../types'
import { classifyShell, hostOf, isMemoryPath } from '../hooks/classify'
import type { Setup } from '../hooks/setup'

export type Classified = { station: StationId; label: string }

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

const lastTwo = (path: string): string =>
  path
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .slice(-2)
    .join('/')

/**
 * The files Copilot's tools touch, so a memory path the person named reads as Memory here as well.
 * `edit_file` carries them in `edits`; `run_in_terminal` commands are read by the shell classifier.
 * The hook writes `fileTail` alone — an already reduced name, which `lastTwo` leaves as it is.
 */
function filePathsOf(input: Record<string, unknown>): string[] {
  const out: string[] = []
  for (const key of ['fileTail', 'file_path', 'filePath', 'path', 'notebook_path', 'notebookPath', 'absolute_path']) {
    const v = input[key]
    if (typeof v === 'string') out.push(v)
  }
  const edits = input.edits ?? input.edit
  if (Array.isArray(edits)) {
    for (const e of edits) {
      const p = (e as Record<string, unknown> | null)?.file_path ?? (e as Record<string, unknown> | null)?.filePath
      if (typeof p === 'string') out.push(p)
    }
  }
  return out
}

/** The Memory station's row for an MCP tool: the label the setup names, and the id when it carries one. */
function memoryRow(name: string, input: Record<string, unknown>, setup: Setup): Classified {
  const id = typeof input.id === 'number' || (typeof input.id === 'string' && /^[\w-]{1,24}$/.test(input.id)) ? ` #${input.id}` : ''
  return { station: 'memory', label: (setup.memoryLabels.get(name) ?? name.replace(/_+/g, ' ')) + id }
}

/**
 * A tool of the GitHub Copilot agent, named as Copilot names it, mapped to a station of the map.
 *
 * The switch below answers to three kinds of name, and every `case` sits under the comment that says
 * which one it is. **Pinned** names are the ones this repository's tests, demo or docs actually feed
 * the classifier: a wrong mapping breaks a test. **Unpinned** names are answered for call shapes
 * nothing here feeds, so no test would notice if one were wrong — they are an open question, not a
 * promise, and the review's F-61 tracks whether they should stay. **MCP** names are read after the
 * switch, not inside it.
 */
export function classifyCopilot(tool: string, input: Record<string, unknown>, setup: Setup): Classified {
  const { t } = setup

  // Everything the shell runs goes through the app's own classifier: it knows the commands
  // that only work on files, the ones that reach the network, and the memory commands the person named.
  const shellLike = (): Classified => classifyShell(str(input.command), str(input.description) || str(input.explanation), setup)

  switch (tool) {
    // ---- Files ---------------------------------------------------------------------------------------------
    // Pinned: the file tools the demo and the tests feed.
    case 'read_file':
    case 'edit_file':
    case 'create_file':
    // Unpinned: Copilot-shaped names for the same work, and the file tools of other agent hosts.
    case 'list_code_usages':
    case 'list_dir':
    case 'file_search':
    case 'apply_patch':
    case 'insert_edit_into_existing_file':
    case 'readMultipleFiles':
    case 'insert_content':
    case 'replace_file_content':
    case 'write_to_file':
    case 'codebase':
    case 'search_codebase':
    case 'get_file_usages':
    case 'usages':
    case 'find_references':
    case 'directory_tree': {
      const path = filePathsOf(input).find(p => p !== '')
      return { station: path !== undefined && isMemoryPath(path, setup) ? 'memory' : 'files', label: path !== undefined ? lastTwo(path) : tool }
    }
    // Pinned: `grep_search`.
    case 'grep_search':
    // Unpinned: the bare `grep` and `search_files` other hosts send.
    case 'search_files':
    case 'grep':
      return { station: 'files', label: 'Grep' }
    // Unpinned: no test, demo row or document names `glob`, so nothing here would notice a wrong mapping.
    case 'glob':
      return { station: 'files', label: 'Glob' }
    // Pinned: `run_in_terminal`, whose command the app's own classifier reads.
    case 'run_in_terminal':
      return shellLike()

    // ---- Network and browser --------------------------------------------------------------------------------
    // Pinned: `fetch_webpage`.
    case 'fetch_webpage':
    // Unpinned: `webfetch`, another host's name for the same call.
    case 'webfetch': {
      // `urlHost` is the hook's reduction; a full `url` from an older events file is reduced here instead.
      const url = str(input.urlHost) || str(input.url)
      return { station: 'web', label: url !== '' ? hostOf(url) : t.webSearch }
    }
    // Unpinned: the plural call, whose shape no host this repository knows sends.
    case 'fetch_webpages': {
      const urls = Array.isArray(input.urls) ? input.urls : []
      const first = str(urls[0])
      return { station: 'web', label: urls.length > 1 ? `${hostOf(first)} +${urls.length - 1}` : first !== '' ? hostOf(first) : t.webSearch }
    }
    // Pinned: `web_search`.
    case 'web_search':
    // Unpinned: `search_localization_issues`.
    case 'search_localization_issues':
      return { station: 'web', label: t.webSearch }

    // ---- Agents ---------------------------------------------------------------------------------------------
    // Pinned: `runSubagent` and `task`.
    case 'runSubagent':
    case 'task':
    // Unpinned: the other hosts' spellings of a subagent call.
    case 'run_agent':
    case 'agent':
    case 'create_task':
      // Only the short description it was started with; its prompt is content.
      return { station: 'agents', label: str(input.description) || str(input.name) || t.subagent }
    // Unpinned: a backlog read, answered with its own name.
    case 'backlog':
      return { station: 'agents', label: tool }

    // ---- Skills ----------------------------------------------------------------------------------------------
    // Pinned: `skill` is Copilot's alone, and the only name this station answers to.
    case 'skill':
      return { station: 'skills', label: str(input.skill) !== '' ? str(input.skill) : t.skill }

    // ---- The person ------------------------------------------------------------------------------------------
    // Pinned: `ask_followup_question`, which the demo feeds.
    case 'ask_followup_question':
    // Unpinned: `ask_user_question`.
    case 'ask_user_question':
      return { station: 'you', label: t.questionForYou }
    // Unpinned: the two ways another host hands a file over.
    case 'send_to_user':
    case 'present_file_to_user':
      return { station: 'you', label: t.fileForYou }

    // ---- A model step, when the proxy reports it ----------------------------------------------------------------
    // Pinned: the proxy writes this name itself, so it is the app's own, not a host's.
    case 'chat_completions':
      return { station: 'model', label: str(input.model) || 'model' }
  }

  // MCP tools come as `mcp__<server>__<name>`. Only names, never what they carry.
  const nested = /^mcp__([^_].*?)__(.+)$/.exec(tool)
  if (nested !== null) {
    const [, server = '', name = ''] = nested
    if (setup.memoryServers.has(server)) return memoryRow(name, input, setup)
    return { station: 'web', label: `${server}: ${name.replace(/_+/g, ' ')}` }
  }
  // The flat `mcp_<server>_<name>` spelling: read as the person's memory when the server is one they
  // named as memory, and left to the network's periphery otherwise, where its name is all that shows.
  if (tool.startsWith('mcp_')) {
    const flat = tool.slice(4)
    const server = [...setup.memoryServers].find(s => flat === s || flat.startsWith(`${s}_`))
    if (server !== undefined) return memoryRow(flat.slice(server.length).replace(/^_+/, ''), input, setup)
    return { station: 'web', label: flat.replace(/_/g, ' ').slice(0, 40) }
  }

  // A tool whose arguments tell what it worked on: the file it names is Files, its command is the
  // shell classifier's to read, its address is Network. Only a tool with no such argument, and no
  // station the map knows, is the model working on its own.
  const filePath = str(input.fileTail) || str(input.file_path) || str(input.path)
  if (filePath !== '') return { station: isMemoryPath(filePath, setup) ? 'memory' : 'files', label: lastTwo(filePath) }
  if (str(input.command) !== '') return shellLike()
  const url = str(input.urlHost) || str(input.url) || str(input.uri)
  if (url !== '') return { station: 'web', label: hostOf(url) }

  // Anything else is the model working on its own: tools the map has no station for yet.
  return { station: 'model', label: tool }
}
