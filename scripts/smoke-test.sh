#!/usr/bin/env bash
# Agentic Orbit smoke test: fires harmless, synthetic events of each kind through the real
# hook script, so every reporting station lights up on the map in a controlled way.
# Four subagents arrive one after another and each makes a call of its own, so their
# planets gather around the Agents station and reach Files, Shell, Network and Memory.
# Two memory calls of the main agent light the Memory station too. The run takes about
# 70 seconds, with a beat between the steps.
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
# A file that is not there yet is the normal first run: zero lines, and no error about it.
BEFORE=0
if [ -f "$FILE" ]; then BEFORE=$(wc -l < "$FILE"); fi

# fire <event> <json> — one line into the event file, then a beat to watch the pulse.
# stdout is dropped: the allow JSON answers Copilot, not the terminal.
fire() {
  printf '%s' "$2" | node "$HOOK" "event=$1" > /dev/null
  sleep 1.5
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

echo "7. Memory search                          → Memory (search notes)"
fire preToolUse  '{"tool_name":"mcp__memory__search_notes","tool_use_id":"m1","tool_input":{"query":"smoke plan"}}'
fire postToolUse '{"tool_name":"mcp__memory__search_notes","tool_use_id":"m1"}'

echo "8. Memory write                           → Memory (write notes)"
fire preToolUse  '{"tool_name":"mcp__memory__write_notes","tool_use_id":"m2","tool_input":{"id":"smoke"}}'
fire postToolUse '{"tool_name":"mcp__memory__write_notes","tool_use_id":"m2"}'

echo "9. Subagents arrive one after another"
echo "   »research« starts                      → Agents: name parked"
fire preToolUse  '{"tool_name":"task","tool_use_id":"t7a","description":"research","tool_input":{"description":"research"}}'
echo "   »research« reads a file                → Agents: planet, Files: pulse"
fire preToolUse  '{"tool_name":"view","tool_use_id":"c1","agent_id":"a1","tool_input":{"file_path":"/tmp/smoke/research.md"}}'
fire postToolUse '{"tool_name":"view","tool_use_id":"c1","agent_id":"a1"}'
echo "   »research« asks the memory            → Agents: planet, Memory: pulse"
fire preToolUse  '{"tool_name":"mcp__memory__search_notes","tool_use_id":"c4","agent_id":"a1","tool_input":{"query":"smoke findings"}}'
fire postToolUse '{"tool_name":"mcp__memory__search_notes","tool_use_id":"c4","agent_id":"a1"}'

echo "   »write texts« starts                   → Agents: second name parked"
fire preToolUse  '{"tool_name":"task","tool_use_id":"t7b","description":"write texts","tool_input":{"description":"write texts"}}'
echo "   »write texts« runs a command          → Agents: planet, Shell: pulse"
fire preToolUse  '{"tool_name":"bash","tool_use_id":"c2","agent_id":"a2","tool_input":{"command":"date"}}'
fire postToolUse '{"tool_name":"bash","tool_use_id":"c2","agent_id":"a2"}'

echo "   »compare« starts                       → Agents: third name parked"
fire preToolUse  '{"tool_name":"task","tool_use_id":"t7c","description":"compare","tool_input":{"description":"compare"}}'
echo "   »compare« fetches a page              → Agents: planet, Network: pulse"
fire preToolUse  '{"tool_name":"webfetch","tool_use_id":"c3","agent_id":"a3","tool_input":{"url":"https://example.com/compare"}}'
fire postToolUse '{"tool_name":"webfetch","tool_use_id":"c3","agent_id":"a3"}'

echo "   »check sources« starts                 → Agents: fourth name parked"
fire preToolUse  '{"tool_name":"task","tool_use_id":"t7d","description":"check sources","tool_input":{"description":"check sources"}}'
echo "   »check sources« reads a file          → Agents: planet, Files: pulse"
fire preToolUse  '{"tool_name":"view","tool_use_id":"c5","agent_id":"a4","tool_input":{"file_path":"/tmp/smoke/sources.md"}}'
fire postToolUse '{"tool_name":"view","tool_use_id":"c5","agent_id":"a4"}'

fire postToolUse '{"tool_name":"task","tool_use_id":"t7a"}'
fire postToolUse '{"tool_name":"task","tool_use_id":"t7b"}'
fire postToolUse '{"tool_name":"task","tool_use_id":"t7c"}'
fire postToolUse '{"tool_name":"task","tool_use_id":"t7d"}'

echo "10. A failed call                         → red, until the next message"
fire preToolUse  '{"tool_name":"bash","tool_use_id":"t8","tool_input":{"command":"date"}}'
fire postToolUse '{"tool_name":"bash","tool_use_id":"t8","error":true}'

echo "11. A producer reports a refusal          → Hooks (red, edit_file)"
fire preToolUse  '{"tool_name":"edit_file","tool_use_id":"t9","tool_input":{"file_path":".github/agents/builder.md"}}'
fire errorOccurred '{"tool_name":"edit_file","tool_use_id":"t9","status":"blocked"}'

echo "— Subagents done                          → planets fade one after another"
fire agentStop '{"agent_id":"a1"}'
fire agentStop '{"agent_id":"a2"}'
fire agentStop '{"agent_id":"a3"}'
fire agentStop '{"agent_id":"a4"}'

echo "— Answer ready                            → wide ring"
fire agentStop '{}'

AFTER=$(wc -l < "$FILE")
echo
echo "Lines after: ${AFTER} (expected: $((BEFORE + 45)))"
if [ "$AFTER" -ge "$((BEFORE + 45))" ]; then
  echo "✓ All events written. Panel open? Then every reporting station should have lit up."
else
  echo "✕ Lines are missing — the hook did not write every event."
  exit 1
fi
