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
  echo "✕ $HOOK fehlt — zuerst 'Agentic Orbit: Install Workspace Hooks' ausführen."
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
echo "Welle 1 — drei Starts, drei Namen geparkt"
line "1. »Quellen sichten« startet" "Agents: Startpuls, noch kein Planet"
fire preToolUse  '{"tool_name":"task","tool_use_id":"s1t","description":"quellen sichten","tool_input":{"description":"quellen sichten"}}'
line "2. »Tabellen bauen« startet" "Agents: Startpuls, noch kein Planet"
fire preToolUse  '{"tool_name":"task","tool_use_id":"s2t","description":"tabellen bauen","tool_input":{"description":"tabellen bauen"}}'
line "3. »Tests lesen« startet" "Agents: Startpuls, noch kein Planet"
fire preToolUse  '{"tool_name":"task","tool_use_id":"s3t","description":"tests lesen","tool_input":{"description":"tests lesen"}}'
line "   quellen sichten liest eine Datei" "Agents: Planet »quellen sichten«, Files: Puls"
fire preToolUse  '{"tool_name":"view","tool_use_id":"s1a","agent_id":"s1","tool_input":{"file_path":"/tmp/storm/quellen.md"}}'
fire postToolUse '{"tool_name":"view","tool_use_id":"s1a","agent_id":"s1"}'
line "   tabellen bauen startet einen Befehl" "Agents: Planet »tabellen bauen«, Shell: Puls"
fire preToolUse  '{"tool_name":"bash","tool_use_id":"s2a","agent_id":"s2","tool_input":{"command":"date"}}'
fire postToolUse '{"tool_name":"bash","tool_use_id":"s2a","agent_id":"s2"}'
line "   tests lesen liest eine Datei" "Agents: Planet »tests lesen«, Files: Puls"
fire preToolUse  '{"tool_name":"view","tool_use_id":"s3a","agent_id":"s3","tool_input":{"file_path":"/tmp/storm/tests.spec.md"}}'
fire postToolUse '{"tool_name":"view","tool_use_id":"s3a","agent_id":"s3"}'

echo
echo "Welle 2 — drei weitere, alle sechs Orbits besetzt"
line "4. »Bilder sichten« startet" "Agents: Startpuls, noch kein Planet"
fire preToolUse  '{"tool_name":"task","tool_use_id":"s4t","description":"bilder sichten","tool_input":{"description":"bilder sichten"}}'
line "5. »Texte bewerten« startet" "Agents: Startpuls, noch kein Planet"
fire preToolUse  '{"tool_name":"task","tool_use_id":"s5t","description":"texte bewerten","tool_input":{"description":"texte bewerten"}}'
line "6. »Zahlen vergleichen« startet" "Agents: Startpuls, noch kein Planet"
fire preToolUse  '{"tool_name":"task","tool_use_id":"s6t","description":"zahlen vergleichen","tool_input":{"description":"zahlen vergleichen"}}'
line "   bilder sichten holt eine Seite" "Agents: Planet »bilder sichten«, Network: Puls"
fire preToolUse  '{"tool_name":"bash","tool_use_id":"s4a","agent_id":"s4","tool_input":{"command":"curl -I https://example.com"}}'
fire postToolUse '{"tool_name":"bash","tool_use_id":"s4a","agent_id":"s4"}'
line "   texte bewerten liest eine Datei" "Agents: Planet »texte bewerten«, Files: Puls"
fire preToolUse  '{"tool_name":"view","tool_use_id":"s5a","agent_id":"s5","tool_input":{"file_path":"/tmp/storm/text.txt"}}'
fire postToolUse '{"tool_name":"view","tool_use_id":"s5a","agent_id":"s5"}'
line "   zahlen vergleichen, der Befehl scheitert" "Agents: Planet »zahlen vergleichen«, Shell: rot"
fire preToolUse  '{"tool_name":"bash","tool_use_id":"s6a","agent_id":"s6","tool_input":{"command":"date"}}'
fire postToolUse '{"tool_name":"bash","tool_use_id":"s6a","agent_id":"s6","error":true}'
line "   bilder sichten sieht ein Bild" "Files: Puls von »bilder sichten«"
fire preToolUse  '{"tool_name":"view","tool_use_id":"s4b","agent_id":"s4","tool_input":{"file_path":"/tmp/storm/bild.svg"}}'
fire postToolUse '{"tool_name":"view","tool_use_id":"s4b","agent_id":"s4"}'

echo
echo "Welle 3 — Planeten gehen, neue kommen"
line "— quellen sichten ist fertig" "sein Planet verschwindet"
fire agentStop '{"agent_id":"s1"}'
line "   texte bewerten liest noch einmal" "Files: Puls von »texte bewerten«"
fire preToolUse  '{"tool_name":"view","tool_use_id":"s5b","agent_id":"s5","tool_input":{"file_path":"/tmp/storm/text.txt"}}'
fire postToolUse '{"tool_name":"view","tool_use_id":"s5b","agent_id":"s5"}'
line "— tabellen bauen ist fertig" "sein Planet verschwindet"
fire agentStop '{"agent_id":"s2"}'
line "7. »Notizen ordnen« startet" "Agents: Startpuls, noch kein Planet"
fire preToolUse  '{"tool_name":"task","tool_use_id":"s7t","description":"notizen ordnen","tool_input":{"description":"notizen ordnen"}}'
line "   zahlen vergleichen, ein Befehl misslingt" "Shell, rot: Puls von »zahlen vergleichen«"
fire preToolUse  '{"tool_name":"bash","tool_use_id":"s6b","agent_id":"s6","tool_input":{"command":"date"}}'
fire postToolUse '{"tool_name":"bash","tool_use_id":"s6b","agent_id":"s6","error":true}'
line "— tests lesen ist fertig" "sein Planet verschwindet"
fire agentStop '{"agent_id":"s3"}'
line "   notizen ordnen liest eine Datei" "Agents: Planet »notizen ordnen«, Files: Puls"
fire preToolUse  '{"tool_name":"view","tool_use_id":"s7a","agent_id":"s7","tool_input":{"file_path":"/tmp/storm/notizen.md"}}'
fire postToolUse '{"tool_name":"view","tool_use_id":"s7a","agent_id":"s7"}'
line "— bilder sichten ist fertig" "sein Planet verschwindet"
fire agentStop '{"agent_id":"s4"}'
line "8. »Feinschliff« startet" "Agents: Startpuls, noch kein Planet"
fire preToolUse  '{"tool_name":"task","tool_use_id":"s8t","description":"feinschliff","tool_input":{"description":"feinschliff"}}'
line "— texte bewerten ist fertig" "sein Planet verschwindet"
fire agentStop '{"agent_id":"s5"}'
line "   feinschliff liest per Shell eine Datei" "Agents: Planet »feinschliff«, Files: Puls"
fire preToolUse  '{"tool_name":"bash","tool_use_id":"s8a","agent_id":"s8","tool_input":{"command":"cat /tmp/storm/bericht.md"}}'
fire postToolUse '{"tool_name":"bash","tool_use_id":"s8a","agent_id":"s8"}'
line "— zahlen vergleichen ist fertig" "sein Planet verschwindet"
fire agentStop '{"agent_id":"s6"}'
line "9. »Berichte sammeln« — der Start misslingt" "Agents: Neutronenstern, der geparkte Name wird frei"
fire preToolUse  '{"tool_name":"task","tool_use_id":"s9t","description":"berichte sammeln","tool_input":{"description":"berichte sammeln"}}'
fire errorOccurred '{"tool_name":"task","tool_use_id":"s9t"}'
line "   der Start wird wiederholt" "Agents: Startpuls, der Name neu geparkt"
fire preToolUse  '{"tool_name":"task","tool_use_id":"s9t2","description":"berichte sammeln","tool_input":{"description":"berichte sammeln"}}'
line "— notizen ordnen ist fertig" "sein Planet verschwindet"
fire agentStop '{"agent_id":"s7"}'
line "   berichte sammeln liest eine Datei" "Agents: Planet »berichte sammeln«, Files: Puls"
fire preToolUse  '{"tool_name":"view","tool_use_id":"s9a","agent_id":"s9","tool_input":{"file_path":"/tmp/storm/bericht.md"}}'
fire postToolUse '{"tool_name":"view","tool_use_id":"s9a","agent_id":"s9"}'
line "— feinschliff ist fertig" "sein Planet verschwindet"
fire agentStop '{"agent_id":"s8"}'
line "10. »Letzte Runde« startet" "Agents: Startpuls, noch kein Planet"
fire preToolUse  '{"tool_name":"task","tool_use_id":"s10t","description":"letzte runde","tool_input":{"description":"letzte runde"}}'
line "— berichte sammeln ist fertig" "sein Planet verschwindet"
fire agentStop '{"agent_id":"s9"}'
line "   letzte runde startet einen Befehl" "Agents: Planet »letzte runde«, Shell: Puls"
fire preToolUse  '{"tool_name":"bash","tool_use_id":"s10a","agent_id":"s10","tool_input":{"command":"date"}}'
fire postToolUse '{"tool_name":"bash","tool_use_id":"s10a","agent_id":"s10"}'
line "   letzte runde liest eine Datei" "Files: Puls von »letzte runde«"
fire preToolUse  '{"tool_name":"view","tool_use_id":"s10b","agent_id":"s10","tool_input":{"file_path":"/tmp/storm/runde.md"}}'
fire postToolUse '{"tool_name":"view","tool_use_id":"s10b","agent_id":"s10"}'
line "— letzte runde ist fertig" "der letzte Planet verschwindet"
fire agentStop '{"agent_id":"s10"}'

echo
line "— Antwort fertig" "breiter Ring"
fire agentStop '{}'

AFTER=$(wc -l < "$FILE")
echo
echo "Zeilen nachher: ${AFTER} (erwartet: $((BEFORE + 53)))"
if [ "$AFTER" -ge "$((BEFORE + 53))" ]; then
  echo "✓ Alle 53 Events geschrieben — der Sturm ist durchgelaufen."
else
  echo "✕ Es fehlen Zeilen — der Hook hat nicht jedes Event geschrieben."
  exit 1
fi
