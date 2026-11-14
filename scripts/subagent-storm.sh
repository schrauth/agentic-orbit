#!/usr/bin/env bash
# Agentic Orbit subagent storm: fires harmless, synthetic events through the real hook
# for about a minute — ten subagents in three overlapping waves, up to six alive at
# once, so their planets circle the Agents station together and hand over in flight.
#
#   - Nothing is read, written or sent: the events carry names and figures only.
#   - Open the map first (Agentic Orbit: Open); each pulse appears as it fires.
#   - The six orbit rings are the map's limit: the storm never keeps more than
#     six subagents alive, so every planet stays visible.
#
# Usage:  scripts/subagent-storm.sh         (from anywhere; the script finds the repo itself)

set -euo pipefail
cd "$(dirname "$0")/.."

HOOK=.github/hooks/agentic-orbit-hook.js
if [ ! -f "$HOOK" ]; then
  echo "✕ $HOOK fehlt — zuerst 'Agentic Orbit: Install Workspace Hooks' ausführen."
  exit 1
fi

events_file() {
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

# line <left> <right> — one step of the storm, the arrow always in the same column.
# printf pads by bytes, and a leading dash takes three of them but shows as one
# column, so dash lines get two bytes more padding to line up with the rest.
line() {
  local pad=46
  case "$1" in —*) pad=48 ;; esac
  printf "%-${pad}s → %s\n" "$1" "$2"
}

echo "Event-Datei: $FILE"
echo "Zeilen vorher: ${BEFORE}"
echo
echo "Rund eine Minute Subagent-Sturm. Die Karte zeigt:"
echo

echo "— Session startet (Modell gesetzt)"
fire sessionStart '{"model":"gpt-5.2"}'

line "— Deine Nachricht" "You"
fire userPromptSubmitted '{}'

echo
echo "Welle 1 — drei Planeten heben ab"
line "1. Quellen sichten" "Agents: Planet s1"
fire preToolUse  '{"tool_name":"task","tool_use_id":"s1t","agent_id":"s1","description":"quellen sichten","tool_input":{"description":"quellen sichten"}}'
fire postToolUse '{"tool_name":"task","tool_use_id":"s1t","agent_id":"s1"}'
line "2. Tabellen bauen" "Agents: Planet s2"
fire preToolUse  '{"tool_name":"task","tool_use_id":"s2t","agent_id":"s2","description":"tabellen bauen","tool_input":{"description":"tabellen bauen"}}'
fire postToolUse '{"tool_name":"task","tool_use_id":"s2t","agent_id":"s2"}'
line "   s1 liest eine Datei" "Files: Puls von Planet s1"
fire preToolUse  '{"tool_name":"view","tool_use_id":"s1a","agent_id":"s1","tool_input":{"file_path":"/tmp/storm/quellen.md"}}'
fire postToolUse '{"tool_name":"view","tool_use_id":"s1a","agent_id":"s1"}'
line "3. Tests lesen" "Agents: Planet s3"
fire preToolUse  '{"tool_name":"task","tool_use_id":"s3t","agent_id":"s3","description":"tests lesen","tool_input":{"description":"tests lesen"}}'
fire postToolUse '{"tool_name":"task","tool_use_id":"s3t","agent_id":"s3"}'
line "   s2 startet einen Befehl" "Shell: Puls von Planet s2"
fire preToolUse  '{"tool_name":"bash","tool_use_id":"s2a","agent_id":"s2","tool_input":{"command":"date"}}'
fire postToolUse '{"tool_name":"bash","tool_use_id":"s2a","agent_id":"s2"}'

echo
echo "Welle 2 — drei weitere, alle sechs Orbits besetzt"
line "4. Bilder sichten" "Agents: Planet s4"
fire preToolUse  '{"tool_name":"task","tool_use_id":"s4t","agent_id":"s4","description":"bilder sichten","tool_input":{"description":"bilder sichten"}}'
fire postToolUse '{"tool_name":"task","tool_use_id":"s4t","agent_id":"s4"}'
line "5. Texte bewerten" "Agents: Planet s5"
fire preToolUse  '{"tool_name":"task","tool_use_id":"s5t","agent_id":"s5","description":"texte bewerten","tool_input":{"description":"texte bewerten"}}'
fire postToolUse '{"tool_name":"task","tool_use_id":"s5t","agent_id":"s5"}'
line "   s3 liest eine Datei" "Files: Puls von Planet s3"
fire preToolUse  '{"tool_name":"view","tool_use_id":"s3a","agent_id":"s3","tool_input":{"file_path":"/tmp/storm/tests.spec.md"}}'
fire postToolUse '{"tool_name":"view","tool_use_id":"s3a","agent_id":"s3"}'
line "6. Zahlen vergleichen" "Agents: Planet s6 — sechs gleichzeitig"
fire preToolUse  '{"tool_name":"task","tool_use_id":"s6t","agent_id":"s6","description":"zahlen vergleichen","tool_input":{"description":"zahlen vergleichen"}}'
fire postToolUse '{"tool_name":"task","tool_use_id":"s6t","agent_id":"s6"}'
line "   s4 holt eine Seite" "Network: Puls von Planet s4"
fire preToolUse  '{"tool_name":"bash","tool_use_id":"s4a","agent_id":"s4","tool_input":{"command":"curl -I https://example.com"}}'
fire postToolUse '{"tool_name":"bash","tool_use_id":"s4a","agent_id":"s4"}'
line "   s4 sichtet ein Bild" "Files: Puls von Planet s4"
fire preToolUse  '{"tool_name":"view","tool_use_id":"s4b","agent_id":"s4","tool_input":{"file_path":"/tmp/storm/bild.svg"}}'
fire postToolUse '{"tool_name":"view","tool_use_id":"s4b","agent_id":"s4"}'

echo
echo "Welle 3 — Planeten gehen, neue kommen"
line "— s1 ist fertig" "Planet s1 verschwindet"
fire agentStop '{"agent_id":"s1"}'
line "   s5 liest eine Datei" "Files: Puls von Planet s5"
fire preToolUse  '{"tool_name":"view","tool_use_id":"s5a","agent_id":"s5","tool_input":{"file_path":"/tmp/storm/text.txt"}}'
fire postToolUse '{"tool_name":"view","tool_use_id":"s5a","agent_id":"s5"}'
line "— s2 ist fertig" "Planet s2 verschwindet"
fire agentStop '{"agent_id":"s2"}'
line "7. Notizen ordnen" "Agents: Planet s7"
fire preToolUse  '{"tool_name":"task","tool_use_id":"s7t","agent_id":"s7","description":"notizen ordnen","tool_input":{"description":"notizen ordnen"}}'
fire postToolUse '{"tool_name":"task","tool_use_id":"s7t","agent_id":"s7"}'
line "   s6 startet einen Befehl, er scheitert" "Shell, rot: Puls von Planet s6"
fire preToolUse  '{"tool_name":"bash","tool_use_id":"s6a","agent_id":"s6","tool_input":{"command":"date"}}'
fire postToolUse '{"tool_name":"bash","tool_use_id":"s6a","agent_id":"s6","error":true}'
line "— s3 ist fertig" "Planet s3 verschwindet"
fire agentStop '{"agent_id":"s3"}'
line "   s7 liest eine Datei" "Files: Puls von Planet s7"
fire preToolUse  '{"tool_name":"view","tool_use_id":"s7a","agent_id":"s7","tool_input":{"file_path":"/tmp/storm/notizen.md"}}'
fire postToolUse '{"tool_name":"view","tool_use_id":"s7a","agent_id":"s7"}'
line "— s4 ist fertig" "Planet s4 verschwindet"
fire agentStop '{"agent_id":"s4"}'
line "8. Feinschliff" "Agents: Planet s8"
fire preToolUse  '{"tool_name":"task","tool_use_id":"s8t","agent_id":"s8","description":"feinschliff","tool_input":{"description":"feinschliff"}}'
fire postToolUse '{"tool_name":"task","tool_use_id":"s8t","agent_id":"s8"}'
line "— s5 ist fertig" "Planet s5 verschwindet"
fire agentStop '{"agent_id":"s5"}'
line "   s8 liest per Shell eine Datei" "Files: Puls von Planet s8"
fire preToolUse  '{"tool_name":"bash","tool_use_id":"s8a","agent_id":"s8","tool_input":{"command":"cat /tmp/storm/bericht.md"}}'
fire postToolUse '{"tool_name":"bash","tool_use_id":"s8a","agent_id":"s8"}'
line "— s6 ist fertig" "Planet s6 verschwindet"
fire agentStop '{"agent_id":"s6"}'
line "9. Berichte sammeln" "Agents: Planet s9"
fire preToolUse  '{"tool_name":"task","tool_use_id":"s9t","agent_id":"s9","description":"berichte sammeln","tool_input":{"description":"berichte sammeln"}}'
fire postToolUse '{"tool_name":"task","tool_use_id":"s9t","agent_id":"s9"}'
line "— s7 ist fertig" "Planet s7 verschwindet"
fire agentStop '{"agent_id":"s7"}'
line "   s9 liest eine Datei" "Files: Puls von Planet s9"
fire preToolUse  '{"tool_name":"view","tool_use_id":"s9a","agent_id":"s9","tool_input":{"file_path":"/tmp/storm/bericht.md"}}'
fire postToolUse '{"tool_name":"view","tool_use_id":"s9a","agent_id":"s9"}'
line "— s8 ist fertig" "Planet s8 verschwindet"
fire agentStop '{"agent_id":"s8"}'
line "10. Letzte Runde" "Agents: Planet s10"
fire preToolUse  '{"tool_name":"task","tool_use_id":"s10t","agent_id":"s10","description":"letzte runde","tool_input":{"description":"letzte runde"}}'
fire postToolUse '{"tool_name":"task","tool_use_id":"s10t","agent_id":"s10"}'
line "— s9 ist fertig" "Planet s9 verschwindet"
fire agentStop '{"agent_id":"s9"}'
line "   s10 startet einen Befehl" "Shell: Puls von Planet s10"
fire preToolUse  '{"tool_name":"bash","tool_use_id":"s10a","agent_id":"s10","tool_input":{"command":"date"}}'
fire postToolUse '{"tool_name":"bash","tool_use_id":"s10a","agent_id":"s10"}'
line "   s10 liest eine Datei" "Files: Puls von Planet s10"
fire preToolUse  '{"tool_name":"view","tool_use_id":"s10b","agent_id":"s10","tool_input":{"file_path":"/tmp/storm/runde.md"}}'
fire postToolUse '{"tool_name":"view","tool_use_id":"s10b","agent_id":"s10"}'
line "— s10 ist fertig" "der letzte Planet verschwindet"
fire agentStop '{"agent_id":"s10"}'

echo
line "— Antwort fertig" "breiter Ring"
fire agentStop '{}'

AFTER=$(wc -l < "$FILE")
echo
echo "Zeilen nachher: ${AFTER} (erwartet: $((BEFORE + 57)))"
if [ "$AFTER" -ge "$((BEFORE + 57))" ]; then
  echo "✓ Alle 57 Events geschrieben — der Sturm ist durchgelaufen."
else
  echo "✕ Es fehlen Zeilen — der Hook hat nicht jedes Event geschrieben."
  exit 1
fi
