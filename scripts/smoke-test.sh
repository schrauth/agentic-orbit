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

echo "Event-Datei: $FILE"
echo "Zeilen vorher: ${BEFORE}"
echo
echo "Die Karte zeigt nacheinander:"
echo

echo "— Session startet (Modell gesetzt)"
fire sessionStart '{"model":"gpt-5.2"}'

echo "— Deine Nachricht                        → You"
fire userPromptSubmitted '{}'

echo "1. Datei ansehen                         → Files (smoke/README.md)"
fire preToolUse  '{"tool_name":"view","tool_use_id":"t1","tool_input":{"file_path":"/tmp/smoke/README.md"}}'
fire postToolUse '{"tool_name":"view","tool_use_id":"t1"}'

echo "2. Shell ohne Netz                       → Shell (date)"
fire preToolUse  '{"tool_name":"bash","tool_use_id":"t2","tool_input":{"command":"date"}}'
fire postToolUse '{"tool_name":"bash","tool_use_id":"t2"}'

echo "3. Datei-Kommando                        → Files (cat)"
fire preToolUse  '{"tool_name":"bash","tool_use_id":"t3","tool_input":{"command":"cat package.json"}}'
fire postToolUse '{"tool_name":"bash","tool_use_id":"t3"}'

echo "4. Netz-Kommando                         → Network (curl)"
fire preToolUse  '{"tool_name":"bash","tool_use_id":"t4","tool_input":{"command":"curl -I https://example.com"}}'
fire postToolUse '{"tool_name":"bash","tool_use_id":"t4"}'

echo "5. Webseiten-Abruf                       → Network (example.com)"
fire preToolUse  '{"tool_name":"webfetch","tool_use_id":"t5","tool_input":{"url":"https://example.com/docs"}}'
fire postToolUse '{"tool_name":"webfetch","tool_use_id":"t5"}'

echo "6. Skills / Toolsuche                    → Skills"
fire preToolUse  '{"tool_name":"search_tools","tool_use_id":"t6"}'
fire postToolUse '{"tool_name":"search_tools","tool_use_id":"t6"}'

echo "7. Subagents gleichzeitig                → Agents: drei Planeten kreisen zusammen"
fire preToolUse  '{"tool_name":"task","tool_use_id":"t7a","agent_id":"a1","description":"recherche","tool_input":{"description":"recherche"}}'
fire preToolUse  '{"tool_name":"task","tool_use_id":"t7b","agent_id":"a2","description":"texte schreiben","tool_input":{"description":"texte schreiben"}}'
fire preToolUse  '{"tool_name":"task","tool_use_id":"t7c","agent_id":"a3","description":"vergleichen","tool_input":{"description":"vergleichen"}}'
fire postToolUse '{"tool_name":"task","tool_use_id":"t7a","agent_id":"a1"}'
fire postToolUse '{"tool_name":"task","tool_use_id":"t7b","agent_id":"a2"}'
fire postToolUse '{"tool_name":"task","tool_use_id":"t7c","agent_id":"a3"}'

echo "8. Fehlgeschlagener Aufruf               → rot, bis zur nächsten Nachricht"
fire preToolUse  '{"tool_name":"bash","tool_use_id":"t8","tool_input":{"command":"date"}}'
fire postToolUse '{"tool_name":"bash","tool_use_id":"t8","error":true}'

echo "— Subagents fertig                      → Planeten verschwinden nacheinander"
fire agentStop '{"agent_id":"a1"}'
fire agentStop '{"agent_id":"a2"}'
fire agentStop '{"agent_id":"a3"}'

echo "— Antwort fertig                        → breiter Ring"
fire agentStop '{}'

AFTER=$(wc -l < "$FILE")
echo
echo "Zeilen nachher: ${AFTER} (erwartet: $((BEFORE + 26)))"
if [ "$AFTER" -ge "$((BEFORE + 26))" ]; then
  echo "✓ Alle Events geschrieben. Panel offen? Dann sollten alle Stationen geleuchtet haben."
else
  echo "✕ Es fehlen Zeilen — der Hook hat nicht jedes Event geschrieben."
  exit 1
fi
