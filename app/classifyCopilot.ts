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
 */
function filePathsOf(input: Record<string, unknown>): string[] {
  const out: string[] = []
  for (const key of ['file_path', 'filePath', 'path', 'notebook_path', 'notebookPath', 'absolute_path']) {
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

/** A tool of the GitHub Copilot agent, named as Copilot names it, mapped to a station of the map. */
export function classifyCopilot(tool: string, input: Record<string, unknown>, setup: Setup): Classified {
  const { t } = setup

  // Everything the shell runs goes through the app's own classifier: it knows the commands
  // that only work on files, the ones that reach the network, and the memory commands the person named.
  const shellLike = (): Classified => classifyShell(str(input.command), str(input.description) || str(input.explanation), setup)

  switch (tool) {
    // ---- Files ---------------------------------------------------------------------------------------------
    case 'read_file':
    case 'readMultipleFiles':
    case 'insert_content':
    case 'insert_edit_into_existing_file':
    case 'replace_file_content':
    case 'apply_patch':
    case 'edit_file':
    case 'create_file':
    case 'write_to_file':
    case 'codebase':
    case 'search_codebase':
    case 'list_code_usages':
    case 'get_file_usages':
    case 'file_search':
    case 'usages':
    case 'find_references':
    case 'list_dir':
    case 'directory_tree': {
      const path = filePathsOf(input).find(p => p !== '')
      return { station: path !== undefined && isMemoryPath(path, setup) ? 'memory' : 'files', label: path !== undefined ? lastTwo(path) : tool }
    }
    case 'grep_search':
    case 'search_files':
    case 'grep':
      return { station: 'files', label: 'Grep' }
    case 'glob':
      return { station: 'files', label: 'Glob' }
    case 'run_in_terminal':
      return shellLike()

    // ---- Network and browser --------------------------------------------------------------------------------
    case 'fetch_webpage':
    case 'webfetch': {
      const url = str(input.url)
      return { station: 'web', label: url !== '' ? hostOf(url) : t.webSearch }
    }
    case 'fetch_webpages': {
      const urls = Array.isArray(input.urls) ? input.urls : []
      const first = str(urls[0])
      return { station: 'web', label: urls.length > 1 ? `${hostOf(first)} +${urls.length - 1}` : first !== '' ? hostOf(first) : t.webSearch }
    }
    case 'web_search':
    case 'search_localization_issues':
      return { station: 'web', label: t.webSearch }

    // ---- Agents ---------------------------------------------------------------------------------------------
    case 'runSubagent':
    case 'run_agent':
    case 'agent':
    case 'task':
    case 'create_task':
      // Only the short description it was started with; its prompt is content.
      return { station: 'agents', label: str(input.description) || str(input.name) || t.subagent }
    case 'backlog':
      return { station: 'agents', label: tool }

    // ---- Skills and knowledge --------------------------------------------------------------------------------
    case 'skill':
    case 'run_skill':
    case 'use_skill':
      return { station: 'skills', label: str(input.skill) !== '' ? str(input.skill) : t.skill }
    case 'list_skills':
    case 'search_tools':
      return { station: 'skills', label: t.loadingTools }

    // ---- The person ------------------------------------------------------------------------------------------
    case 'ask_followup_question':
    case 'ask_user_question':
      return { station: 'you', label: t.questionForYou }
    case 'send_to_user':
    case 'present_file_to_user':
      return { station: 'you', label: t.fileForYou }

    // ---- A model step, when the proxy reports it ----------------------------------------------------------------
    case 'chat_completions':
      return { station: 'model', label: str(input.model) || 'model' }
  }

  // MCP tools come as `mcp_<server>_<name>` or `server:tool`; only names, never what they carry.
  const colon = /^mcp__([^_].*?)__(.+)$/.exec(tool)
  if (colon !== null) {
    const [, server = '', name = ''] = colon
    if (setup.memoryServers.has(server)) {
      const id = typeof input.id === 'number' || (typeof input.id === 'string' && /^[\w-]{1,24}$/.test(input.id)) ? ` #${input.id}` : ''
      return { station: 'memory', label: (setup.memoryLabels.get(name) ?? name.replace(/_+/g, ' ')) + id }
    }
    return { station: 'web', label: `${server}: ${name.replace(/_+/g, ' ')}` }
  }
  if (tool.startsWith('mcp_')) return { station: 'web', label: tool.replace(/^mcp_/, '').replace(/_/g, ' ').slice(0, 40) }

  // A tool whose arguments tell what it worked on: the file it names is Files, its command is the
  // shell classifier's to read, its address is Network. Only a tool with no such argument, and no
  // station the map knows, is the model working on its own.
  const filePath = str(input.file_path) || str(input.path)
  if (filePath !== '') return { station: isMemoryPath(filePath, setup) ? 'memory' : 'files', label: lastTwo(filePath) }
  if (str(input.command) !== '') return shellLike()
  if (str(input.url) !== '' || str(input.uri) !== '') return { station: 'web', label: hostOf(str(input.url) || str(input.uri)) }

  // Anything else is the model working on its own: tools the map has no station for yet.
  return { station: 'model', label: tool }
}
