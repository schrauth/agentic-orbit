# App-First — Implementation Plan

How the browser app becomes the product and the VS Code extension retires. This plan is written
against the repository state at `HEAD` after the standalone host landed (ADR-006's state); file
links cite the tree as it is today, and tasks name the moves explicitly.

## Executive summary

The pivot is **subtraction plus a move, not a rebuild**. Everything that makes the map work is
already IDE-independent and already runs outside VS Code:

- **The app exists.** [standalone/](../../standalone) owns the full pipeline today: the CLI door
  ([cli.ts](../../standalone/cli.ts)), the event→board core ([server.ts](../../standalone/server.ts)),
  the SSE face ([http.ts](../../standalone/http.ts)), and the live page
  ([main.ts](../../standalone/main.ts)). It binds loopback only and needs no VS Code API.
- **The core the app reaches for lives one package over.** The VS-Code-free modules under
  `vscode-extension/src/` — `hookWatcher` (90 lines), `eventApplier` (147), `eventWriter` (15),
  `proxy` (197), `board` (157), `classifyCopilot` (149), `hookManifest` (23), `webview/render`
  (75) — are imported by the app with plain relative paths. They move home; their contents do not
  change.
- **The hook script is the privacy-reviewed artifact.**
  [agentic-orbit-hook.js](../../vscode-extension/res/agentic-orbit-hook.js) moves byte-identical.
- **The pins already exist.** [paths.test.cjs](../../vscode-extension/test/paths.test.cjs),
  [quality.test.cjs](../../vscode-extension/test/quality.test.cjs) and
  [proxy.test.cjs](../../vscode-extension/test/proxy.test.cjs) pin the surviving core's behavior.
  They are adopted, not rewritten.

What dies is glue and nothing else: [extension.ts](../../vscode-extension/src/extension.ts),
[panel.ts](../../vscode-extension/src/panel.ts), [config.ts](../../vscode-extension/src/config.ts),
[proxyCommand.ts](../../vscode-extension/src/proxyCommand.ts),
[installHooks.ts](../../vscode-extension/src/installHooks.ts), `webview/main.ts` — about 300 lines
— plus the 18-setting surface in `vscode-extension/package.json` and the committed `.vsix`. The
wire contract (the `v: 1` JSONL events of ADR-001/002, the `Board` type, ADR-007's
telemetry-as-event) does not change at all.

What is explicitly **out of scope**: multi-host event adapters on the producer side (the hook
manifest stays Copilot's format), any `v: 2` event format, publishing/packaging of the app, and
version numbers (release chores for the Version Control Agent).

Estimated scope: 8 tasks, 4 of them substantive; every task lands and verifies on its own.

## Design decisions this plan builds on

1. **The app is the one product package, named `app/`.** The directory rename says what it
   became; the package inside takes the product name `agentic-orbit`. [demo/](../../demo) stays a
   workshop package exactly as it is; [hooks/](../../hooks) and [types/](../../types) stay the
   shared sources both packages include. No new `core/` package: with the extension gone the app
   is the only real consumer of the core modules, and a package needs a second consumer to earn
   its own directory. The demo keeps its existing cross-package import pattern
   (`../app/…` where it said `../vscode-extension/src/…`).
2. **The core moves flat into the package root.** The app keeps its current layout (sources at
   package root, no `src/` layer): the eight moved modules land beside `server.ts` and `cli.ts`,
   with one rename — `webview/render.ts` becomes `app/render.ts`, because there is no webview and
   no reason to keep a one-file directory.
3. **Tests are adopted through the existing bundle surface.** The app's tests require
   `out/test-entry.js`, the esbuild bundle [test-entry.ts](../../standalone/test-entry.ts) builds.
   It grows to export the full pinned surface (the modules plus the `hooks/` helpers the old
   tests pin), so the adopted tests change their `require` lines and nothing else. This keeps one
   build pipeline (esbuild) instead of adding `tsc` output the extension needed.
4. **M-001's lesson transfers to the app's page.** The served page is a classic `<script>`-loaded
   IIFE bundle with no module loader, exactly the failure mode M-001 recorded for the webview.
   The bundle test survives, re-pointed: `out/web/bundle.js` must contain no `require(` and no
   `import`, and must wire its `EventSource` — the page's lifeline where the webview's was
   `message`.
5. **The producer side stays Copilot's.** The app is IDE-independent (no VS Code API, no
   settings surface, no webview), and its event source remains the Copilot workspace hook. A
   second producer (Claude Code or another host) is a small, separate future plan — this one does
   not design for it (keep-it-simple).
6. **The record first.** ADR-008 records the pivot; ADR-005 and ADR-006 get status annotations
   (ADR-005's bundling rule now lives on in the app's page; ADR-006's "mirrors the extension"
   premise is retired with the extension). Status changes go through the Memory & ADR agent, per
   the project rule; history is never rewritten.

---

## Phase 1 — The record of the pivot

### - [ ] Task 1.1: Record ADR-008 and the status of ADR-005/006

- **Problem:** The pivot inverts ADR-006's premise ("the standalone host mirrors the extension
  host"; "nothing in the shipped extension changes") and retires ADR-005's subject. Future rounds
  must not read a stale register and rebuild the extension.
- **Affected files:** [ADR.md](../ADR.md) (new ADR-008; status lines on ADR-005 and ADR-006),
  [DECISION_LOG.md](../DECISION_LOG.md) (one entry: the decision to drop the extension, taken
  2026-11-17).
- **Target state:** ADR-008 states: the browser app (`app/`, package `agentic-orbit`) is the
  product; the VS Code extension retires; the core modules move into the app; the wire contract
  (JSONL `v: 1`, `Board`) is frozen; the hook script moves byte-identical; the demo remains a
  workshop package; the producer side stays Copilot's hook manifest. ADR-005 is marked superseded
  with the note that its rule now applies to the app's served bundle; ADR-006 is marked retired
  by ADR-008. Written through the Memory & ADR agent.
- **Verification:** The entries exist; no other ADR contradicts them; ADR-001 through ADR-004 and
  ADR-007 are untouched (their subjects — the fail-safe hook, names-only labels, `hooks/` purity,
  the loopback proxy, telemetry-as-event — all survive unchanged).

## Phase 2 — The package becomes the app

### - [ ] Task 2.1: Rename `standalone/` to `app/`, take the product name

- **Problem:** The product cannot be called "standalone" once it is the only face; and every
  path, job and doc that says `standalone` is a place this rename must reach now, not later.
- **Affected files:** `git mv standalone app` (all of it: sources, `index.html`, `main.css`,
  `test/`, `test-entry.ts`, `.gitignore`, `tsconfig.json`); [app/package.json](../../standalone/package.json)
  (`"name": "agentic-orbit"`, description: the live map of the agent's work, served on loopback —
  no "ships nothing in the extension" clause anymore); [check.yml](../../.github/workflows/check.yml)
  (the `standalone` job becomes `app`, `working-directory: app`); [README.md](../../README.md)
  (every `cd standalone` and standalone-doc link); [CONTRIBUTING.md](../../CONTRIBUTING.md) (the
  third gate's directory); [PRIVACY.md](../../PRIVACY.md) and [SECURITY.md](../../SECURITY.md)
  (the sentence naming the `standalone/` path); [docs/usage.md](../../docs/usage.md) and
  [development.md](../../docs/development.md) (links and `cd standalone` lines);
  `git mv docs/standalone.md docs/app.md` with the README link updated (content rewrite is
  Task 5.2). The cross-package reference the build carries — copying the hook script from
  `../vscode-extension/res/` — **stays as it is** until Task 3.1 moves the file.
- **Target state:** No live path, job, doc or link says `standalone`; the three CI jobs still pass
  because nothing else changed; the app's flags, ports and behavior are untouched.
- **Verification:** `cd app && npm ci && npm test` green; `cd demo && npm ci && npm run
  typecheck` green; `grep -rn "standalone" README.md CONTRIBUTING.md PRIVACY.md SECURITY.md docs/
  .github/` finds only historical prose in the plans/ register and CHANGELOG history; the CI YAML
  job list reads `extension`, `demo`, `app`.

## Phase 3 — The core moves home; the extension retires

### - [ ] Task 3.1: Move the core into `app/`, delete `vscode-extension/` — one atomic commit

- **Problem:** The app still reaches into a package this pivot deletes, and the extension cannot
  survive its own core being taken. These two edits have no green intermediate state — they are
  one commit.
- **Affected files:** Moves, contents unchanged:
  `vscode-extension/src/hookWatcher.ts` → `app/hookWatcher.ts`; `eventApplier.ts`,
  `eventWriter.ts`, `proxy.ts`, `board.ts`, `classifyCopilot.ts`, `hookManifest.ts` likewise →
  `app/`; `vscode-extension/src/webview/render.ts` → `app/render.ts`;
  `vscode-extension/res/agentic-orbit-hook.js` → `app/res/agentic-orbit-hook.js`
  **byte-identical**. Re-points: [app/server.ts](../../standalone/server.ts),
  [app/cli.ts](../../standalone/cli.ts), [app/main.ts](../../standalone/main.ts),
  [app/test-entry.ts](../../standalone/test-entry.ts) (`../vscode-extension/src/x` → `./x`,
  `…/webview/render` → `./render`); [app/package.json](../../standalone/package.json) build
  script (copy the hook script from local `res/`, drop the `../vscode-extension/res` copy);
  [app/tsconfig.json](../../standalone/tsconfig.json) (drop the `../vscode-extension/src/…`
  includes; keep `*.ts`, `../hooks`, `../types/index.d.ts`); [demo/engine.ts](../../demo/engine.ts),
  [demo/main.ts](../../demo/main.ts), [demo/tsconfig.json](../../demo/tsconfig.json)
  (`../vscode-extension/src/…` → `../app/…`, render → `../app/render`). Deletions, the whole of
  `vscode-extension/`: `src/{extension,panel,config,proxyCommand,installHooks}.ts`,
  `src/webview/main.ts`, `package.json`, `tsconfig.json`, `README.md`,
  `agentic-orbit-0.3.0.vsix`, `test/{paths,quality,proxy}.test.cjs` (adopted back in Task 4.1),
  `out/`, `node_modules/`. CI: [check.yml](../../.github/workflows/check.yml) drops the
  `extension` job and its comment line gains the new truth (the app's tests run, the demo
  typechecks) — the app job stays `typecheck` until Task 6.1. This repository's own
  `.github/hooks/` stays: it is the dev-time producer that feeds the events file the app reads.
- **Target state:** `grep -rn "vscode-extension"` finds only the frozen records (`.spec/` history,
  CHANGELOG history); the app is self-contained; the demo builds from `../app` and `../hooks`.
- **Verification:** `cd app && npm ci && npm run typecheck && npm test` green (the app's own
  server tests); `cd demo && npm ci && npm run typecheck` green; `grep -rn "vscode-extension"
  --exclude-dir=node_modules --exclude-dir=out .` shows only `.spec/` and CHANGELOG history; the
  hook script in `app/res/` is byte-identical to the deleted one (`shasum` before and after the
  move, recorded in the commit message).
- **Note for the Builder:** Between this commit and Task 4.1 the adopted pins are absent from the
  tree. Land 4.1 immediately after; do not interleave other work.

## Phase 4 — Adopt the pins

### - [ ] Task 4.1: The extension's test suite, adopted into the app

- **Problem:** The deleted tests pin behavior that survives (classification, parsing, the
  parked-name lifecycle, the writer, board transitions, the manifest, the proxy's body handling,
  the module-free page bundle). Losing them is losing the project's memory.
- **Affected files:** [app/test-entry.ts](../../standalone/test-entry.ts) grows to export the
  pinned surface: `eventsFileFor`, `parseEvents`, `applyHookEvent`, `emptyState`,
  `modelStepEvent`, `appendEvent` (now local), `classifyCopilot` (local), `setupFrom`,
  `classifyShell`, `projectView`, `foldRows`, `routeOf` (from `../hooks/…`), `emptyBoard`,
  `transitionBoard`, `HOOK_EVENTS`, `hookJson`, `startProxy`. New files, bodies carried over with
  only their `require` lines changed to `../out/test-entry.js`:
  `app/test/paths.test.cjs` (from `vscode-extension/test/paths.test.cjs`),
  `app/test/quality.test.cjs` (from `quality.test.cjs` — its last test rewritten: `out/web/
  bundle.js` must contain no `require(` and no `import` statement, and must wire
  `new EventSource`; skip with the same "run the build first" note when `out/` is missing),
  `app/test/proxy.test.cjs` (from `proxy.test.cjs`, body unchanged). `app/package.json`'s `test`
  script already runs `npm run build && node --test test/*.test.cjs` — it picks the new files up
  without change.
- **Target state:** `cd app && npm test` runs the app's server tests plus the three adopted files;
  every assertion that pinned surviving behavior pins it again, against the moved modules.
- **Verification:** `cd app && npm test` green end to end; each adopted group proven red once by a
  spot-revert during development (not committed): a classify mapping, the parked-name order, the
  manifest shape, the oversized-proxy round trip, the bundle rule.

## Phase 5 — The story told

### - [ ] Task 5.1: README — the app is the product

- **Problem:** The README still teaches two faces; one is gone.
- **Affected files:** [README.md](../../README.md).
- **Target state:** The "Run the standalone map" section becomes "Run the map" (drop the
  "no VS Code extension install required" clause — there is none to install); the "Use the VS
  Code extension" section is deleted with its install steps; *Learn more* points at
  [docs/app.md](../../docs/app.md), [docs/usage.md](../../docs/usage.md) and
  [docs/development.md](../../docs/development.md); the one-line pitch says a browser app, not
  an extension.
- **Verification:** The README's commands, run as written on this machine, produce a serving host
  and a live page; every link resolves.

### - [ ] Task 5.2: The docs — app, usage, development

- **Problem:** usage.md still speaks of a panel and `agenticOrbit.*` settings; development.md
  still builds an extension; app.md (moved in Task 2.1) still frames the app as the map
  "without VS Code".
- **Affected files:** [docs/usage.md](../../docs/usage.md), [docs/app.md](../../docs/app.md),
  [docs/development.md](../../docs/development.md).
- **Target state:** usage.md drops every `agenticOrbit.<key>` mention in favor of the config-file
  keys (`memoryServers`, `memoryCommands`, `memoryPaths`, `language`, … — the list `--config`
  takes) and drops panel-only wording; app.md tells the whole door story (flags, config keys,
  loopback, the page's behavior) as the product doc; development.md's "Build and test the
  extension" becomes "Build and test the app" (`cd app && npm ci && npm test`), the smoke-script
  and browser-demo sections stay as they are.
- **Verification:** Read-through: every sentence is true of the app and of nothing that was
  deleted; the smoke commands in development.md run as written
  (`AGENTIC_ORBIT_EVENTS_FILE=/tmp/… scripts/smoke-test.sh` against a running host lights the
  page); cross-links resolve.

### - [ ] Task 5.3: The standing pages and the wording sweep

- **Problem:** CONTRIBUTING, PRIVACY, SECURITY and the PR template are contracts and must stay
  true; the moved code's comments still speak of "the extension" and "the webview".
- **Affected files:** [CONTRIBUTING.md](../../CONTRIBUTING.md) (the one-line pitch; the gates
  list becomes two packages — `cd app && npm ci && npm test`, `cd demo && npm ci && npm run
  typecheck`; the *Words* section: one more language is one more `text.ts` table and one more
  value of the `language` config key, no VS Code setting); [PRIVACY.md](../../PRIVACY.md) (every
  "the extension" clause becomes the app or the hook; the VS-Code-store sentence about the folded
  pane is deleted — the app keeps no state between sessions; the `classifyCopilot` path in the
  labels section follows the move); [SECURITY.md](../../SECURITY.md) (same re-truthing); the PR
  template's first checkbox becomes `cd app && npm ci && npm test`; the final template line drops
  "the extension"; comment sweep in `app/` sources: `server.ts`'s and `cli.ts`'s headers, the
  `hookWatcher.ts` deactivation note, `render.ts`'s references — "the extension" becomes "the
  app", "the webview" becomes "the page" — comments only, no code change;
  [CHANGELOG.md](../../CHANGELOG.md) gets the pivot as the headline Unreleased entry (the
  extension retires; the browser app is the product; core modules moved into the app).
- **Target state:** A contributor reads one product story everywhere; every privacy and security
  sentence is true of the tree as it stands.
- **Verification:** `grep -rn -i "extension" README.md CONTRIBUTING.md PRIVACY.md SECURITY.md
  docs/ .github/pull_request_template.md` returns nothing (CHANGELOG and `.spec/` history
  excepted); `cd app && npm test` still green after the comment sweep (proof the sweep touched
  comments only).

## Phase 6 — CI's final shape

### - [ ] Task 6.1: The app job runs the tests

- **Problem:** The app's CI job still only typechecks, because its tests were adopted only in
  Phase 4; and the workflow's comment still narrates three packages.
- **Affected files:** [check.yml](../../.github/workflows/check.yml),
  [CONTRIBUTING.md](../../CONTRIBUTING.md) (the gates list, if 5.3's wording needs the final
  job shape).
- **Target state:** Two jobs: `app` (`npm ci && npm test`, working directory `app`) and `demo`
  (`npm ci && npm run typecheck`); the header comment names exactly those two.
- **Verification:** YAML lints; the job list matches CONTRIBUTING's gates; on the pull request,
  both jobs green — the app job's log shows the server tests and the three adopted files running.

---

## Guard-rails for the implementer

- **The wire contract is frozen.** The `v: 1` JSONL event lines (ADR-001, ADR-002), the `Board`
  type and ADR-007's telemetry-as-event do not change in this plan. If a task seems to need an
  event shape change, stop and bring it to the Architect.
- **The hook script moves byte-identical.** It is the privacy-reviewed artifact; a "small
  improvement" while moving is a review evasion. `shasum` before and after, recorded in the
  commit message.
- **`hooks/` stays pure** (ADR-003): nothing in `hooks/` imports from `app/`, and `hooks/` never
  learns about a server or a page.
- **No new dependency, no new build pipeline.** The app keeps esbuild + `tsc -p .` for
  typecheck; tests keep requiring the one `out/test-entry.js` bundle. A temptation toward `tsc`
  per-module output, `ws`, `express` or a runner framework is a design smell here.
- **Behavior parity is the acceptance bar.** Same flags (`--workspace`, `--events-file`,
  `--port`, `--config`, `--install-hooks`, `--proxy`, `--proxy-port`), same defaults (8318/8317),
  same loopback-only binds, same reconnect-and-snapshot behavior. The rename changes where the
  code lives, not what it does.
- **History is never rewritten.** Old plans, ADR bodies and CHANGELOG entries stay as written;
  only the Memory & ADR agent appends status annotations (Task 1.1) and only CHANGELOG gains new
  entries.
- **`.github/agents/` is untouched** — verified: no agent definition references the extension or
  VS Code.
- **Each task lands as its own atomic commit** through the Version Control Agent, its
  verification in the message, a CHANGELOG bullet where a person sees the difference. Task 3.1
  and Task 4.1 land back-to-back with nothing between.
- **Fail-safe both ways, unchanged:** the host survives a malformed events file forever; the page
  survives a malformed frame and keeps drawing; the hook never blocks the agent.
