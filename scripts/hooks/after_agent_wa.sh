#!/usr/bin/env bash
# ============================================================================
# AfterAgent Hook — wa-bridge-extract
# ============================================================================
# Extracts agent response, writes to outbox, and checks inbox for Sprint Mode
# continuation. Uses deny/retry mechanism to re-prompt the agent.
#
# Contract (discovered):
#   stdin:  {"session_id", "transcript_path", "cwd", "hook_event_name",
#            "timestamp", "prompt", "prompt_response", "stop_hook_active"}
#   stdout: {} or {"decision": "deny", "reason": "..."}
#   stderr: logging only
#
# Sprint Mode: If new unread messages exist in inbox after writing the
# response, output decision=deny with reason=messages to trigger a new
# agent turn automatically.
#
# Golden Rule: stdout MUST contain only pure JSON.
# ============================================================================

set -euo pipefail

HOOK_DIR="${GEMINI_PROJECT_DIR:-.}/.gemini"
DEBUG_FILE="$HOOK_DIR/after_agent_debug.json"
OUTBOX="$HOOK_DIR/wa_outbox.json"
INBOX="$HOOK_DIR/wa_inbox.json"
STOP_FLAG="$HOOK_DIR/wa_stop_signal"

# Read full stdin payload
INPUT=$(cat)

# --- Debug: dump raw payload ---
echo "$INPUT" | jq '.' > "$DEBUG_FILE" 2>/dev/null || echo "$INPUT" > "$DEBUG_FILE"
echo "[wa-bridge] AfterAgent payload dumped ($(echo "$INPUT" | wc -c | tr -d ' ') bytes)" >&2

# --- Extract response text ---
RESPONSE=$(echo "$INPUT" | jq -r '
  (.prompt_response? // "⚠️ No response captured")
  | if type == "object" or type == "array" then tostring else . end
' 2>/dev/null) || RESPONSE="⚠️ jq extraction failed"

# Take the LAST 1500 chars — prompt_response contains all model output
# (thinking traces + tool calls + final answer). The actual response is at the end.
SUMMARY=$(echo "$RESPONSE" | tail -c 1500)
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
MSG_ID="resp_$(date +%s)"

echo "[wa-bridge] Writing response to outbox ($MSG_ID)" >&2

# --- Write to outbox (atomic) ---
if [ -f "$OUTBOX" ]; then
  jq --arg id "$MSG_ID" --arg ts "$TIMESTAMP" --arg txt "$SUMMARY" \
    '.messages += [{"id": $id, "timestamp": $ts, "from": "agent", "text": $txt, "sent": false}]' \
    "$OUTBOX" > "${OUTBOX}.tmp" && mv "${OUTBOX}.tmp" "$OUTBOX"
else
  jq -n --arg id "$MSG_ID" --arg ts "$TIMESTAMP" --arg txt "$SUMMARY" \
    '{"messages": [{"id": $id, "timestamp": $ts, "from": "agent", "text": $txt, "sent": false}]}' > "$OUTBOX"
fi

# --- Sprint Mode: check for continuation ---

# If STOP signal was set by BeforeAgent, do NOT continue
if [ -f "$STOP_FLAG" ]; then
  echo "[wa-bridge] STOP flag detected — ending sprint" >&2
  rm -f "$STOP_FLAG"
  jq -n '{}'
  exit 0
fi

# Check inbox for new unread messages
if [ -f "$INBOX" ] && command -v jq &>/dev/null; then
  UNREAD=$(jq -r '.messages[]? | select(.read == false) | .text' "$INBOX" 2>/dev/null)

  if [ -n "$UNREAD" ]; then
    # Mark messages as read
    jq '.messages[] |= (if .read == false then .read = true else . end)' "$INBOX" > "${INBOX}.tmp" && mv "${INBOX}.tmp" "$INBOX"

    # Check for STOP in new messages
    if echo "$UNREAD" | grep -qi "STOP"; then
      echo "[wa-bridge] STOP in new messages — ending sprint" >&2
      jq -n '{}'
      exit 0
    fi

    # Sprint continue: deny response to trigger re-prompt with new messages
    echo "[wa-bridge] 🔄 Sprint continue — re-prompting with ${#UNREAD} chars" >&2
    NEXT_PROMPT="📱 New Telegram messages received. Process them:\n$UNREAD"
    jq -n --arg reason "$NEXT_PROMPT" '{"decision": "deny", "reason": $reason}'
    exit 0
  fi
fi

# No new messages — end turn normally
echo "[wa-bridge] No new messages — turn complete" >&2
jq -n '{}'
