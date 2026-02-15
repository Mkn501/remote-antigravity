#!/usr/bin/env bash
# ============================================================================
# AfterAgent Hook — wa-bridge-extract
# ============================================================================
# Spike RA-002: Dumps the full stdin payload to a debug file for contract
# discovery, then extracts a summary and writes it to wa_outbox.json.
#
# Contract:
#   stdin:  (TBD — this spike will discover the actual fields)
#   stdout: {"decision": "allow"} or {}
#   stderr: logging only
#
# Golden Rule: stdout MUST contain only pure JSON.
# ============================================================================

set -euo pipefail

HOOK_DIR="${GEMINI_PROJECT_DIR:-.}/.gemini"
DEBUG_FILE="$HOOK_DIR/after_agent_debug.json"
OUTBOX="$HOOK_DIR/wa_outbox.json"

# Read full stdin payload
INPUT=$(cat)

# --- Debug: dump raw payload for contract discovery ---
echo "$INPUT" | jq '.' > "$DEBUG_FILE" 2>/dev/null || echo "$INPUT" > "$DEBUG_FILE"
echo "[wa-bridge] AfterAgent payload dumped to $DEBUG_FILE ($(echo "$INPUT" | wc -c | tr -d ' ') bytes)" >&2

# --- Extract response text ---
# Official AfterAgent contract fields: prompt, prompt_response, stop_hook_active
RESPONSE=$(echo "$INPUT" | jq -r '
  (.prompt_response? // .response? // .turnResponse? // .text? //
   "⚠️ Could not extract response — check after_agent_debug.json for the actual schema.")
  | if type == "object" or type == "array" then tostring else . end
' 2>/dev/null) || RESPONSE="⚠️ jq extraction failed — check after_agent_debug.json"

# Truncate to 500 chars for messaging readability
SUMMARY=$(echo "$RESPONSE" | head -c 500)
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
MSG_ID="resp_$(date +%s)"

echo "[wa-bridge] Writing summary to outbox ($MSG_ID)" >&2

# Write to outbox (atomic write)
if [ -f "$OUTBOX" ]; then
  jq --arg id "$MSG_ID" --arg ts "$TIMESTAMP" --arg txt "$SUMMARY" \
    '.messages += [{"id": $id, "timestamp": $ts, "from": "agent", "text": $txt, "sent": false}]' \
    "$OUTBOX" > "${OUTBOX}.tmp" && mv "${OUTBOX}.tmp" "$OUTBOX"
else
  jq -n --arg id "$MSG_ID" --arg ts "$TIMESTAMP" --arg txt "$SUMMARY" \
    '{"messages": [{"id": $id, "timestamp": $ts, "from": "agent", "text": $txt, "sent": false}]}' > "$OUTBOX"
fi

echo "[wa-bridge] Done" >&2

# Return empty JSON (Interactive mode — no re-prompting)
jq -n '{"decision": "allow"}'
