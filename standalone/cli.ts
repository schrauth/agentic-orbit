// The CLI door: flags in, one host process out. It resolves what to watch, tunes the setup the way
// VS Code's settings would, and starts the core and its HTTP face — plus, on request, the shared
// loopback proxy that measures the context window. The console gets one startup line and nothing
// else; the page is where the story is told.
import * as fs from 'fs'
import * as path from 'path'
import { eventsFileFor } from '../vscode-extension/src/hookWatcher'
import { hookJson } from '../vscode-extension/src/hookManifest'
import { startProxy } from '../vscode-extension/src/proxy'
import type { ProxyServer } from '../vscode-extension/src/proxy'
import { serveCore } from './server'
import type { HostSetup } from './server'
import { serveHttp } from './http'
import { listenHttp } from './http'

/** Every key the config file may carry: the same raw shape config.ts builds from VS Code's settings. */
const CONFIG_KEYS = new Set([
  'language',
  'coreName',
  'layout',
  'motion',
  'pace',
  'theme',
  'background',
  'colors',
  'memoryServers',
  'memoryCommands',
  'memorySubcommands',
  'memoryPaths',
  'memoryLabels',
  'contextWindowLimit',
])

const HELP = `Agentic Orbit — the live map in a plain browser window.

  node server.js --workspace <path>        whose events to watch (its .jsonl follows from it)
  node server.js --events-file <path>      or the events file itself — exactly one of the two
  --port <n>                               where the page is served (default 8318, loopback only)
  --config <file>                          a JSON with the setup keys (language, coreName, layout,
                                           motion, pace, theme, background, colors, memoryServers,
                                           memoryCommands, memorySubcommands, memoryPaths,
                                           memoryLabels, contextWindowLimit)
  --install-hooks <dir>                    write .github/hooks/ into the workspace and exit
  --proxy <targetBaseUrl>                  also start the loopback proxy for the context window
  --proxy-port <n>                         where the proxy listens (default 8317)
`

type Args = {
  workspace?: string
  eventsFile?: string
  port: number
  config?: string
  installHooks?: string
  proxy?: string
  proxyPort: number
  help: boolean
}

/** One flag and its value from the list, or a complaint that ends the process. */
const value = (args: string[], flag: string, at: number): string => {
  if (at >= args.length || args[at].startsWith('--')) {
    process.stderr.write(`${flag} needs a value\n`)
    process.exit(2)
  }
  return args[at]
}

function parseArgs(argv: string[]): Args {
  const args: Args = { port: 8318, proxyPort: 8317, help: false }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    if (flag === '--help') args.help = true
    else if (flag === '--workspace') args.workspace = value(argv, flag, ++i)
    else if (flag === '--events-file') args.eventsFile = value(argv, flag, ++i)
    else if (flag === '--port') args.port = Number(value(argv, flag, ++i))
    else if (flag === '--config') args.config = value(argv, flag, ++i)
    else if (flag === '--install-hooks') args.installHooks = value(argv, flag, ++i)
    else if (flag === '--proxy') args.proxy = value(argv, flag, ++i)
    else if (flag === '--proxy-port') args.proxyPort = Number(value(argv, flag, ++i))
    else {
      process.stderr.write(`unknown flag: ${flag}\n${HELP}`)
      process.exit(2)
    }
  }
  return args
}

/** The config file: known keys become the setup, unknown ones warn on stderr and are dropped. */
function setupFromConfig(file: string): HostSetup {
  const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    process.stderr.write(`--config: not a JSON object: ${file}\n`)
    process.exit(2)
  }
  const setup: HostSetup = {}
  for (const [key, value] of Object.entries(parsed)) {
    if (CONFIG_KEYS.has(key)) setup[key] = value
    else process.stderr.write(`--config: unknown key "${key}" ignored\n`)
  }
  return setup
}

/** The same two files the extension's Install Workspace Hooks command writes: the script, the manifest. */
function installHooksInto(dir: string): void {
  const hooks = path.join(dir, '.github', 'hooks')
  fs.mkdirSync(hooks, { recursive: true })
  fs.copyFileSync(path.join(__dirname, 'res', 'agentic-orbit-hook.js'), path.join(hooks, 'agentic-orbit-hook.js'))
  fs.writeFileSync(path.join(hooks, 'hooks.json'), hookJson('.github/hooks/agentic-orbit-hook.js'))
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    process.stdout.write(HELP)
    return
  }
  if (args.installHooks !== undefined) {
    installHooksInto(args.installHooks)
    process.stdout.write(`hooks written to ${path.join(args.installHooks, '.github', 'hooks')} — the event file is watched; nothing leaves this machine.\n`)
    return
  }

  if ((args.workspace !== undefined) === (args.eventsFile !== undefined)) {
    process.stderr.write('exactly one of --workspace and --events-file is required\n')
    process.exit(2)
  }
  if (!Number.isInteger(args.port) || args.port < 1 || args.port > 65535) {
    process.stderr.write('--port: not a port number\n')
    process.exit(2)
  }
  const setup = args.config !== undefined ? setupFromConfig(args.config) : {}

  const eventsFile = args.eventsFile !== undefined ? args.eventsFile : eventsFileFor(args.workspace ?? '')
  const host = serveCore({ eventsFile, setup })
  let proxy: ProxyServer | undefined
  if (args.proxy !== undefined) {
    proxy = await startProxy(args.proxyPort, args.proxy, host.telemetry)
  }
  // The port only answers once it is bound: the startup line tells the truth, or it waits.
  const face = await listenHttp(host, args.port)
  process.stdout.write(`http://127.0.0.1:${args.port}/ — watching ${eventsFile}\n`)

  process.on('SIGINT', () => {
    face.close()
    proxy?.close()
    host.close()
    process.exit(0)
  })
}

void main()
