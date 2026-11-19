#!/usr/bin/env bash
# Agentic Orbit smoke test: fires harmless, synthetic events of each kind through the real
# hook script, so every station lights up on the map in a controlled way. Three subagents
# run at once, so their planets circle the Agents station together.
#
#   - Nothing is read, written or sent: the events carry names and figures only.
#   - Open the map first (Agentic Orbit: Open); each pulse appears as it fires.
#
# Usage:  scripts/smoke-test.sh          (from anywhere; the script finds the repo itself)

set -euo pipefail
cd "$(dirname "$0")/.."

HOOK=.github/hooks/agentic-orbit-hook.js
if [ ! -f "$HOOK" ]; then
  echo "✕ $HOOK is missing — run 'Agentic Orbit: Install Workspace Hooks' first."
  exit 1
fi

# The guard is opt-in; the rehearsal still runs against the real script from the app's source
# when the workspace has not installed it.
GUARD=.github/hooks/agentic-orbit-guard.js
if [ ! -f "$GUARD" ]; then
  GUARD=app/res/agentic-orbit-guard.js
fi

events_file() {
  # The hook honours the same variable, so both agree on where the lines go.
  if [ -n "${AGENTIC_ORBIT_EVENTS_FILE:-}" ]; then
    printf '%s' "$AGENTIC_ORBIT_EVENTS_FILE"
    return
  fi
  local key dir
  key=$(printf '%s' "$PWD" | shasum -a 1 | cut -c1-12)
  dir="${TMPDIR:-/tmp}"; dir="${dir%/}"
  printf '%s/agentic-orbit-%s.jsonl' "$dir" "$key"
}

FILE=$(events_file)
BEFORE=$(wc -l < "$FILE" 2>/dev/null || echo 0)

# fire <event> <json> — one line into the event file, then a beat to watch the pulse.
# stdout is dropped: the allow JSON answers Copilot, not the terminal.
fire() {
  printf '%s' "$2" | node "$HOOK" "event=$1" > /dev/null
  sleep 1
}

# guard <json> — one preToolUse payload through the real guard script; its allow/deny JSON is dropped.
guard() {
  printf '%s' "$1" | node "$GUARD" > /dev/null
  sleep 1
}

echo "Events file: $FILE"
echo "Lines before: ${BEFORE}"
echo
echo "The map shows, one after the other:"
echo

echo "— Session starts (model set)"
fire sessionStart '{"model":"gpt-5.2"}'

echo "— Your message                           → You"
fire userPromptSubmitted '{}'

echo "1. View a file                           → Files (smoke/README.md)"
fire preToolUse  '{"tool_name":"view","tool_use_id":"t1","tool_input":{"file_path":"/tmp/smoke/README.md"}}'
fire postToolUse '{"tool_name":"view","tool_use_id":"t1"}'

echo "2. Shell without network                 → Shell (date)"
fire preToolUse  '{"tool_name":"bash","tool_use_id":"t2","tool_input":{"command":"date"}}'
fire postToolUse '{"tool_name":"bash","tool_use_id":"t2"}'

echo "3. File command                          → Files (cat)"
fire preToolUse  '{"tool_name":"bash","tool_use_id":"t3","tool_input":{"command":"cat package.json"}}'
fire postToolUse '{"tool_name":"bash","tool_use_id":"t3"}'

echo "4. Network command                       → Network (curl)"
fire preToolUse  '{"tool_name":"bash","tool_use_id":"t4","tool_input":{"command":"curl -I https://example.com"}}'
fire postToolUse '{"tool_name":"bash","tool_use_id":"t4"}'

echo "5. Web fetch                             → Network (example.com)"
fire preToolUse  '{"tool_name":"webfetch","tool_use_id":"t5","tool_input":{"url":"https://example.com/docs"}}'
fire postToolUse '{"tool_name":"webfetch","tool_use_id":"t5"}'

echo "6. A skill runs                           → Skills (commit)"
fire preToolUse  '{"tool_name":"skill","tool_use_id":"t6","tool_input":{"skill":"commit"}}'
fire postToolUse '{"tool_name":"skill","tool_use_id":"t6"}'

echo "7. Subagents at once                      → Agents: three planets circle together"
fire preToolUse  '{"tool_name":"task","tool_use_id":"t7a","agent_id":"a1","description":"research","tool_input":{"description":"research"}}'
fire preToolUse  '{"tool_name":"task","tool_use_id":"t7b","agent_id":"a2","description":"write texts","tool_input":{"description":"write texts"}}'
fire preToolUse  '{"tool_name":"task","tool_use_id":"t7c","agent_id":"a3","description":"compare","tool_input":{"description":"compare"}}'
fire postToolUse '{"tool_name":"task","tool_use_id":"t7a","agent_id":"a1"}'
fire postToolUse '{"tool_name":"task","tool_use_id":"t7b","agent_id":"a2"}'
fire postToolUse '{"tool_name":"task","tool_use_id":"t7c","agent_id":"a3"}'

echo "8. A failed call                          → red, until the next message"
fire preToolUse  '{"tool_name":"bash","tool_use_id":"t8","tool_input":{"command":"date"}}'
fire postToolUse '{"tool_name":"bash","tool_use_id":"t8","error":true}'

echo "9. A guard refuses an edit                → Hooks (red, edit_file)"
fire preToolUse  '{"tool_name":"edit_file","tool_use_id":"t9","tool_input":{"file_path":".github/agents/builder.md"}}'
guard            '{"tool_name":"edit_file","tool_use_id":"t9","tool_input":{"file_path":".github/agents/builder.md"}}'

echo "— Subagents done                          → planets fade one after another"
fire agentStop '{"agent_id":"a1"}'
fire agentStop '{"agent_id":"a2"}'
fire agentStop '{"agent_id":"a3"}'

echo "— Answer ready                            → wide ring"
fire agentStop '{}'

AFTER=$(wc -l < "$FILE")
echo
echo "Lines after: ${AFTER} (expected: $((BEFORE + 28)))"
if [ "$AFTER" -ge "$((BEFORE + 28))" ]; then
  echo "✓ All events written. Panel open? Then every station should have lit up."
else
  echo "✕ Lines are missing — the hook did not write every event."
  exit 1
fi
