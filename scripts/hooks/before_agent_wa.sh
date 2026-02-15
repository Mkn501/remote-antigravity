#!/usr/bin/env bash
# ============================================================================
# BeforeAgent Hook — wa-bridge-inject
# ============================================================================
# Reads wa_inbox.json and injects unread messages as additionalContext.
# Detects STOP signal to halt Sprint Mode.
#
# Contract:
#   stdin:  {"prompt": "..."}
#   stdout: {"decision": "allow", "hookSpecificOutput": {...}}
#   stderr: logging only
#
# Golden Rule: stdout MUST contain only pure JSON.
# ============================================================================

set -euo pipefail

HOOK_DIR="${GEMINI_PROJECT_DIR:-.}/.gemini"
INBOX="$HOOK_DIR/wa_inbox.json"

echo "[wa-bridge] BeforeAgent hook fired" >&2

# Check if inbox exists and has unread messages
if [ -f "$INBOX" ] && command -v jq &>/dev/null; then
  UNREAD=$(jq -r '.messages[]? | select(.read == false) | .text' "$INBOX" 2>/dev/null)

  if [ -n "$UNREAD" ]; then
    # Mark all as read (atomic write)
    jq '.messages[] |= (if .read == false then .read = true else . end)' "$INBOX" > "${INBOX}.tmp" && mv "${INBOX}.tmp" "$INBOX"

    # Detect STOP signal (exact match, case-insensitive)
    if echo "$UNREAD" | grep -qi "STOP"; then
      CONTEXT="⛔ STOP signal received from user. Complete your current action, write a final status update, and halt. Do not start any new tasks."
      # Write a stop flag file for AfterAgent to read
      echo "STOP" > "$HOOK_DIR/wa_stop_signal"
      echo "[wa-bridge] STOP signal detected" >&2
    else
      CONTEXT="📱 Remote messages via Telegram:\n$UNREAD"
      # Clear any lingering stop signal
      rm -f "$HOOK_DIR/wa_stop_signal"
    fi

    echo "[wa-bridge] Injecting ${#UNREAD} chars of context" >&2
    jq -n --arg ctx "$CONTEXT" '{
      "decision": "allow",
      "hookSpecificOutput": {
        "hookEventName": "BeforeAgent",
        "additionalContext": $ctx
      }
    }'
    exit 0
  fi
fi

# No inbox or no unread messages — allow turn without injection
echo "[wa-bridge] No unread messages" >&2
jq -n '{"decision": "allow"}'
