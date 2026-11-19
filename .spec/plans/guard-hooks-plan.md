# Guard hooks: agent-modification and git-monopoly guards

## Executive summary

The **Hooks** station is wired but unreachable: `applyHookEvent` treats
every `errorOccurred` line as a station fault via classification and a
`failure` transition with hard-coded status `'err'`
([eventApplier.ts:135](../../app/eventApplier.ts), [board.ts:131](../../app/board.ts));
it never routes anything to the hooks station. The wire type already
carries an optional `status` field ([types/index.d.ts:17](../../types/index.d.ts))
and `Status` includes `'block'` ([types/index.d.ts:5](../../types/index.d.ts));
the scene already draws `'block'` entries as a red alarm
([scene.ts:41](../../hooks/draw/scene.ts)) and `isFault` already counts
them ([board.ts:30](../../app/board.ts)). The station can light the moment
a guard reports a blocked line — no drawing or text changes are needed.

The observer hook answers every `preToolUse` with `allow` (ADR-001) and
self-reports nothing about refusals; VS Code Copilot's hook pipeline
reports a denial to nobody (no inter-hook notification, `postToolUse` fires
only on success), so the only possible witness is the guard itself.

The producer side: `--install-hooks <dir>` copies the observer script and
writes `hooks.json` via `hookJson()`
([hookManifest.ts](../../app/hookManifest.ts), [cli.ts:104](../../app/cli.ts)).
Installed manifests under `.github/hooks/` are gitignored
([.gitignore](../../.gitignore)); the guard's source home is
`app/res/`, like the observer's. VS Code Copilot hooks: `deny` beats
`allow` (most restrictive wins), command hook errors count as `deny`
(fail-closed), timeouts fall through; `ask` is unreliable unattended —
official behavior, verified against the VS Code docs.

This plan dogfoods the project's own guard rules as two opt-in Copilot
pre-tool-use hooks:

1. **Agent-modification guard** — denies file-edit tool calls whose
   target resolves under `.github/agents/` (D-004's change protection,
   enforced instead of merely documented).
2. **Git-monopoly guard** — denies `git` shell commands issued by a
   subagent call (an agent identity is present in the payload); only the
   Version Control Agent runs Git, as `.github/copilot-instructions.md`
   already demands.

Each guard, when it denies, appends one `errorOccurred` line with
`status: 'blocked'` to the shared events file — guard and witness in one
script. `applyHookEvent` routes those lines to the hooks station. The
station lights only from real events, so D-002 stays true.

## Design decisions

- **Wire reuse, no new event type.** A blocked line is an `errorOccurred`
  event with `status: 'blocked'` — the dormant optional field already in
  the frozen wire contract (ADR-008 additive; D-015's `skill` field is the
  precedent). No new content fields; the label stays a tool name only
  (ADR-002).
- **Failure transitions gain an optional status.** `BoardTransition`'s
  `failure` case ([types/index.d.ts:82](../../types/index.d.ts)) gets
  `status?: Status`, defaulting to `'err'`; the guard path passes
  `'block'`. Existing behavior is unchanged when the field is absent.
- **Blocked lines go straight to the hooks station.** The guard is the
  classification: no classifier dispatch, no reconstructed input. The
  open `preToolUse` entry for the same call id (if any) closes as
  `'block'`, the entry unparks its subagent name, and the fault counts
  (isFault already includes `'block'`).
- **Guard = separate opt-in script, own manifest.** A standalone sibling
  of the observer (`app/res/agentic-orbit-guard.js`) plus `guardJson()`
  in [hookManifest.ts](../../app/hookManifest.ts); installed by an
  explicit `--guard` flag alongside `--install-hooks`. The observer stays
  untouched; most-restrictive-wins keeps its unconditional allow
  harmless. Opt-in only — this character change (observer of work to
  guard of rules) is never installed silently.
- **Inverted fail-safe.** A crashed command hook counts as `deny` in
  Copilot — the inverse of ADR-001. The guard therefore never crashes,
  denies only on an explicit rule match, allows when in doubt, and
  always exits `0` within milliseconds. ADR-010 amends ADR-001 to
  describe both shapes.
- **Deny with reason, not ask.** `ask` stalls unattended runs; a
  `permissionDecisionReason` string names the violated rule.
- **Guard 1 rule:** file-edit tools (the classifier's file-tool names
  plus a path fallback) with any target path resolving under
  `.github/agents/` — including every path in an `edits` array — are
  denied.
- **Guard 2 rule:** shell commands whose command name is `git`, only when
  the payload carries an agent identity (`agent_id`/`subagent_id`) —
  the main chat keeps its Git rights; a subagent call loses them. When
  the identity is absent the guard allows (fail-open on identity, since
  payload identity is not contractually guaranteed).
- **Self-report = one line, names only.** The blocked line carries the
  tool name, the guard's own marker as the error text (e.g. `guard:
  git-monopoly`), and `status: 'blocked'` — no command lines, no paths,
  no file contents on the wire beyond what the observer already writes.

## Phases

### Phase 1 — Contract: blocked status through the board

- [x] **Task 1.1 — Failure transition status**
  Problem: `transitionBoard`'s failure case hard-codes status `'err'`
  ([board.ts:131](../../app/board.ts)), so the guard path cannot record a
  blocked entry even though `Status` includes `'block'`.
  Affected files: [types/index.d.ts](../../types/index.d.ts)
  (`BoardTransition.failure` gains `status?: Status`),
  [board.ts](../../app/board.ts) (failure case uses the field, default
  `'err'`; `finish()` unchanged — it closes only `'run'` entries).
  Target state: a failure transition with `status: 'block'` produces an
  entry with status `'block'`, fault-counted, alarm-drawn; absent field
  behaves exactly as today.
  Verification: `cd app && npm run typecheck && npm test`; extend the
  `transitionBoard` tests in
  [quality.test.cjs](../../app/test/quality.test.cjs) with a
  `status: 'block'` failure case asserting the entry's status and the
  fault count.

- [x] **Task 1.2 — Applier routes blocked lines to the hooks station**
  Problem: the `errorOccurred` case
  ([eventApplier.ts:135](../../app/eventApplier.ts)) treats every line as
  a classified station fault with status `'err'`; it never reads
  `e.status` and nothing can reach the hooks station.
  Affected files: [eventApplier.ts](../../app/eventApplier.ts),
  [test-entry.ts](../../app/test-entry.ts) (already exported — no
  change expected), [paths.test.cjs](../../app/test/paths.test.cjs).
  Target state: an `errorOccurred` line with `status: 'blocked'`
  resolves the open entry via `s.open.get(e.callId)` (if present),
  deletes it, unparks the subagent name, and transitions
  `{ type: 'failure', id, station: 'hooks', label: e.tool ?? label,
  status: 'block' }`; lines without the field behave exactly as today.
  Blocked lines light the hooks station and count one fault, red alarm
  for its duration, feed row naming the tool only.
  Verification: `cd app && npm run typecheck && npm test`; extend
  [paths.test.cjs](../../app/test/paths.test.cjs) with two
  `applyHookEvent` cases: (a) a blocked line with a matching open
  preToolUse entry closes it as `'block'` at the hooks station,
  (b) a blocked line with no open entry still lands as a hooks-station
  fault with label fallback.

### Phase 2 — The guard script

- [x] **Task 2.1 — Guard script with both rules**
  Problem: no producer emits a blocked line, so the Phase 1 routing is
  untestable in production and the hooks station stays dark.
  Affected files: [app/res/agentic-orbit-guard.js](../../app/res/agentic-orbit-guard.js)
  (new; blueprint: [agentic-orbit-hook.js](../../app/res/agentic-orbit-hook.js)),
  [package.json](../../app/package.json) (build copy step gains the
  guard file, mirroring the observer's `out/res/` copy).
  Target state: a standalone script that reads one preToolUse payload
  from stdin, applies the two rules (`.github/agents/` path protection
  incl. `edits` array; git-command denial when an agent identity is
  present), answers `{"permissionDecision":"deny",
  "permissionDecisionReason":"..."}` on a match and
  `{"permissionDecision":"allow"}` otherwise, self-reports one
  `errorOccurred` line with `status: 'blocked'` to the same resolved
  events file (same `AGENTIC_ORBIT_EVENTS_FILE` handling, same
  validation, mode 0o600), never throws (top-level try/catch, in-doubt
  allow), always exits `0` within milliseconds. No classification, no
  station guessing — the label is the tool name.
  Verification: `cd app && npm run build`, then pipe crafted payloads
  through `node out/res/agentic-orbit-guard.js` in the style of
  [smoke-test.sh](../../scripts/smoke-test.sh): an edit targeting
  `.github/agents/builder.md` denies and appends a blocked line; a
  subagent `git commit` denies; a main-chat git command allows; an edit
  elsewhere allows; a malformed payload allows and exits 0.

### Phase 3 — Installer: opt-in guard manifest

- [x] **Task 3.1 — guardJson() and the --guard flag**
  Problem: the guard has no manifest and no install path; users cannot
  opt in.
  Affected files: [hookManifest.ts](../../app/hookManifest.ts)
  (`guardJson()` — a preToolUse command hook naming the guard script,
  sibling of `hookJson()`), [cli.ts](../../app/cli.ts)
  (`--guard` flag; `--install-hooks <dir>` additionally copies the guard
  script and writes the guard manifest when `--guard` is given),
  [quality.test.cjs](../../app/test/quality.test.cjs) (pins the guard
  manifest, `hookJson` precedent).
  Target state: `node out/server.js --install-hooks . --guard` installs
  observer plus guard into `.github/hooks/`; without `--guard` nothing
  changes. Guard manifest pins a short timeout (a slow guard is a
  denied call).
  Verification: `cd app && npm run typecheck && npm test`; then a manual
  install into a temp copy of this repo's `.github/hooks/` and an
  inspection of the written JSON.

### Phase 4 — Rehearsal, docs, registers

- [x] **Task 4.1 — Blocked-line rehearsal (D-002-conformant)**
  Problem: without a real denial the station's new path stays
  unverified end-to-end.
  Affected files: [smoke-test.sh](../../scripts/smoke-test.sh) (or a
  small scenario in [demo/scenarios.ts](../../demo/scenarios.ts) if
  that fits better — Builder's choice, report the pick).
  Target state: one extra rehearsal fires a guard payload through the
  real guard script (not the observer) and shows the hooks station
  lighting red in the running map — a real event from a real producer,
  so D-002 holds.
  Verification: run the rehearsal; the map shows a red hooks-station
  alarm and a feed row with the tool name; `cd app && npm test` stays
  green.
- [x] **Task 4.2 — Docs**
  Problem: docs say the hook pipeline reports no blocking event, so the
  hooks station is documented as permanently dark — now false.
  Affected files: [usage.md](../../docs/usage.md) (Hooks row and the
  fail-safe paragraph: guards are opt-in, deny on rule match, the map
  shows the blocked call), [README.md](../../README.md) (station table
  Hooks row), [PRIVACY.md](../../PRIVACY.md) (What it keeps: the guard
  writes one names-only blocked line on a denial; Faults: a blocked
  entry is deliberate, not an error), [CHANGELOG.md](../../CHANGELOG.md).
  Target state: docs describe the guard feature truthfully; PRIVACY.md
  wording covers the guard line explicitly.
  Verification: read-through; no broken relative links; `cd app && npm
  run typecheck && npm test` (guards against accidental code edits).
- [x] **Task 4.3 — Registers**
  Problem: the deliberate-block character change contradicts ADR-001's
  never-block wording and must not be decided silently; the decision is
  cross-chat relevant.
  Affected files: [ADR.md](../ADR.md) (ADR-010 amends ADR-001: guards
  block deliberately, opt-in only, the observer keeps its fail-safe),
  [DECISION_LOG.md](../DECISION_LOG.md) (D-017).
  Target state: both entries exist in the house format; ADR-001 gains a
  "amended by ADR-010" pointer.
  Verification: format matches the register templates; wording agreed
  with the Architect before landing.

## Guard-rails

- **A crashed guard blocks real work** (Copilot counts command hook
  errors as `deny`): top-level try/catch, in-doubt allow, no fs/network
  work beyond the one append, exit 0 within milliseconds.
- **Deny only on an explicit rule match.** New rules are a contract
  decision — the Builder does not invent rules; rule changes go back to
  the Architect.
- **Labels and lines stay names-only** (ADR-002): no command lines, no
  paths, no file content on the wire or the map — the guard's reason
  string names the rule, not the payload.
- **No new wire fields** beyond the dormant `status` the contract
  already has (ADR-008); the events file stays the only feed.
- **`hooks/` purity untouched** (ADR-003): the guard script lives in
  `app/res/`, not in `hooks/`.
- **The observer stays untouched** — most-restrictive-wins makes its
  unconditional allow harmless; do not add guard logic to it.
- **Opt-in only** — no install path writes the guard manifest unless
  `--guard` is given.
- **`.github/agents/` is not modified by this plan** (D-004); the guard
  only protects it.
- **Identity is not contractual**: agent_id/subagent_id in payloads is
  observed, not guaranteed — the git guard fails open when absent.
