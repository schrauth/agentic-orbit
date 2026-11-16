#!/usr/bin/env bash
# Agentic Orbit subagent storm: fires harmless, synthetic events through the real hook
# for about a minute — ten subagents in three overlapping waves, up to six alive at
# once, so their planets circle the Agents station together and hand over in flight.
#
#   - Nothing is read, written or sent: the events carry names and figures only.
#   - Open the map first (Agentic Orbit: Open); each pulse appears as it fires.
#   - The six orbit rings are the map's limit: the storm never keeps more than
#     six subagents alive, so every planet stays visible.
#   - The events carry the shape the host really sends: a launch names the subagent
#     but carries no id of it — the child's own calls bring that — so a planet shows
#     only once the child itself works, under the name its launch gave it. One launch
#     fails and is retried, as a failed start must hand its parked name back.
#
# Usage:  scripts/subagent-storm.sh         (from anywhere; the script finds the repo itself)

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
  sleep 1
}

# line <left> <right> — one step of the storm, the arrow always in the same column.
# printf pads by bytes, and a leading dash takes three of them but shows as one
# column, so dash lines get two bytes more padding to line up with the rest.
line() {
  local pad=46
  case "$1" in —*) pad=48 ;; esac
  printf "%-${pad}s → %s\n" "$1" "$2"
}

echo "Events file: $FILE"
echo "Lines before: ${BEFORE}"
echo
echo "A subagent storm of about a minute. The map shows:"
echo

echo "— Session starts (model set)"
fire sessionStart '{"model":"gpt-5.2"}'

line "— Your message" "You"
fire userPromptSubmitted '{}'

echo
echo "Wave 1 — three launches, three names parked"
line "1. »survey sources« launches" "Agents: start pulse, no planet yet"
fire preToolUse  '{"tool_name":"task","tool_use_id":"s1t","description":"survey sources","tool_input":{"description":"survey sources"}}'
line "2. »build tables« launches" "Agents: start pulse, no planet yet"
fire preToolUse  '{"tool_name":"task","tool_use_id":"s2t","description":"build tables","tool_input":{"description":"build tables"}}'
line "3. »read tests« launches" "Agents: start pulse, no planet yet"
fire preToolUse  '{"tool_name":"task","tool_use_id":"s3t","description":"read tests","tool_input":{"description":"read tests"}}'
line "   survey sources reads a file" "Agents: planet »survey sources«, Files: pulse"
fire preToolUse  '{"tool_name":"view","tool_use_id":"s1a","agent_id":"s1","tool_input":{"file_path":"/tmp/storm/quellen.md"}}'
fire postToolUse '{"tool_name":"view","tool_use_id":"s1a","agent_id":"s1"}'
line "   build tables runs a command" "Agents: planet »build tables«, Shell: pulse"
fire preToolUse  '{"tool_name":"bash","tool_use_id":"s2a","agent_id":"s2","tool_input":{"command":"date"}}'
fire postToolUse '{"tool_name":"bash","tool_use_id":"s2a","agent_id":"s2"}'
line "   read tests reads a file" "Agents: planet »read tests«, Files: pulse"
fire preToolUse  '{"tool_name":"view","tool_use_id":"s3a","agent_id":"s3","tool_input":{"file_path":"/tmp/storm/tests.spec.md"}}'
fire postToolUse '{"tool_name":"view","tool_use_id":"s3a","agent_id":"s3"}'

echo
echo "Wave 2 — three more, all six orbits taken"
line "4. »inspect images« launches" "Agents: start pulse, no planet yet"
fire preToolUse  '{"tool_name":"task","tool_use_id":"s4t","description":"inspect images","tool_input":{"description":"inspect images"}}'
line "5. »rate texts« launches" "Agents: start pulse, no planet yet"
fire preToolUse  '{"tool_name":"task","tool_use_id":"s5t","description":"rate texts","tool_input":{"description":"rate texts"}}'
line "6. »compare figures« launches" "Agents: start pulse, no planet yet"
fire preToolUse  '{"tool_name":"task","tool_use_id":"s6t","description":"compare figures","tool_input":{"description":"compare figures"}}'
line "   inspect images fetches a page" "Agents: planet »inspect images«, Network: pulse"
fire preToolUse  '{"tool_name":"bash","tool_use_id":"s4a","agent_id":"s4","tool_input":{"command":"curl -I https://example.com"}}'
fire postToolUse '{"tool_name":"bash","tool_use_id":"s4a","agent_id":"s4"}'
line "   rate texts reads a file" "Agents: planet »rate texts«, Files: pulse"
fire preToolUse  '{"tool_name":"view","tool_use_id":"s5a","agent_id":"s5","tool_input":{"file_path":"/tmp/storm/text.txt"}}'
fire postToolUse '{"tool_name":"view","tool_use_id":"s5a","agent_id":"s5"}'
line "   compare figures, the command fails" "Agents: planet »compare figures«, Shell: red"
fire preToolUse  '{"tool_name":"bash","tool_use_id":"s6a","agent_id":"s6","tool_input":{"command":"date"}}'
fire postToolUse '{"tool_name":"bash","tool_use_id":"s6a","agent_id":"s6","error":true}'
line "   inspect images views an image" "Files: pulse from »inspect images«"
fire preToolUse  '{"tool_name":"view","tool_use_id":"s4b","agent_id":"s4","tool_input":{"file_path":"/tmp/storm/bild.svg"}}'
fire postToolUse '{"tool_name":"view","tool_use_id":"s4b","agent_id":"s4"}'

echo
echo "Wave 3 — planets leave, new ones arrive"
line "— survey sources is done" "its planet fades"
fire agentStop '{"agent_id":"s1"}'
line "   rate texts reads once more" "Files: pulse from »rate texts«"
fire preToolUse  '{"tool_name":"view","tool_use_id":"s5b","agent_id":"s5","tool_input":{"file_path":"/tmp/storm/text.txt"}}'
fire postToolUse '{"tool_name":"view","tool_use_id":"s5b","agent_id":"s5"}'
line "— build tables is done" "its planet fades"
fire agentStop '{"agent_id":"s2"}'
line "7. »sort notes« launches" "Agents: start pulse, no planet yet"
fire preToolUse  '{"tool_name":"task","tool_use_id":"s7t","description":"sort notes","tool_input":{"description":"sort notes"}}'
line "   compare figures, a command fails" "Shell, red: pulse from »compare figures«"
fire preToolUse  '{"tool_name":"bash","tool_use_id":"s6b","agent_id":"s6","tool_input":{"command":"date"}}'
fire postToolUse '{"tool_name":"bash","tool_use_id":"s6b","agent_id":"s6","error":true}'
line "— read tests is done" "its planet fades"
fire agentStop '{"agent_id":"s3"}'
line "   sort notes reads a file" "Agents: planet »sort notes«, Files: pulse"
fire preToolUse  '{"tool_name":"view","tool_use_id":"s7a","agent_id":"s7","tool_input":{"file_path":"/tmp/storm/notizen.md"}}'
fire postToolUse '{"tool_name":"view","tool_use_id":"s7a","agent_id":"s7"}'
line "— inspect images is done" "its planet fades"
fire agentStop '{"agent_id":"s4"}'
line "8. »final polish« launches" "Agents: start pulse, no planet yet"
fire preToolUse  '{"tool_name":"task","tool_use_id":"s8t","description":"final polish","tool_input":{"description":"final polish"}}'
line "— rate texts is done" "its planet fades"
fire agentStop '{"agent_id":"s5"}'
line "   final polish reads a file via shell" "Agents: planet »final polish«, Files: pulse"
fire preToolUse  '{"tool_name":"bash","tool_use_id":"s8a","agent_id":"s8","tool_input":{"command":"cat /tmp/storm/bericht.md"}}'
fire postToolUse '{"tool_name":"bash","tool_use_id":"s8a","agent_id":"s8"}'
line "— compare figures is done" "its planet fades"
fire agentStop '{"agent_id":"s6"}'
line "9. »collect reports« — the launch fails" "Agents: neutron star, the parked name goes free"
fire preToolUse  '{"tool_name":"task","tool_use_id":"s9t","description":"collect reports","tool_input":{"description":"collect reports"}}'
fire errorOccurred '{"tool_name":"task","tool_use_id":"s9t"}'
line "   the launch is retried" "Agents: start pulse, the name parked anew"
fire preToolUse  '{"tool_name":"task","tool_use_id":"s9t2","description":"collect reports","tool_input":{"description":"collect reports"}}'
line "— sort notes is done" "its planet fades"
fire agentStop '{"agent_id":"s7"}'
line "   collect reports reads a file" "Agents: planet »collect reports«, Files: pulse"
fire preToolUse  '{"tool_name":"view","tool_use_id":"s9a","agent_id":"s9","tool_input":{"file_path":"/tmp/storm/bericht.md"}}'
fire postToolUse '{"tool_name":"view","tool_use_id":"s9a","agent_id":"s9"}'
line "— final polish is done" "its planet fades"
fire agentStop '{"agent_id":"s8"}'
line "10. »last round« launches" "Agents: start pulse, no planet yet"
fire preToolUse  '{"tool_name":"task","tool_use_id":"s10t","description":"last round","tool_input":{"description":"last round"}}'
line "— collect reports is done" "its planet fades"
fire agentStop '{"agent_id":"s9"}'
line "   last round runs a command" "Agents: planet »last round«, Shell: pulse"
fire preToolUse  '{"tool_name":"bash","tool_use_id":"s10a","agent_id":"s10","tool_input":{"command":"date"}}'
fire postToolUse '{"tool_name":"bash","tool_use_id":"s10a","agent_id":"s10"}'
line "   last round reads a file" "Files: pulse from »last round«"
fire preToolUse  '{"tool_name":"view","tool_use_id":"s10b","agent_id":"s10","tool_input":{"file_path":"/tmp/storm/runde.md"}}'
fire postToolUse '{"tool_name":"view","tool_use_id":"s10b","agent_id":"s10"}'
line "— last round is done" "the last planet fades"
fire agentStop '{"agent_id":"s10"}'

echo
line "— Answer ready" "wide ring"
fire agentStop '{}'

AFTER=$(wc -l < "$FILE")
echo
echo "Lines after: ${AFTER} (expected: $((BEFORE + 53)))"
if [ "$AFTER" -ge "$((BEFORE + 53))" ]; then
  echo "✓ All 53 events written — the storm ran through."
else
  echo "✕ Lines are missing — the hook did not write every event."
  exit 1
fi
