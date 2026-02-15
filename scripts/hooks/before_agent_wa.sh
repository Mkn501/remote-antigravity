#!/usr/bin/env bash
# ============================================================================
# BeforeAgent Hook — wa-bridge-inject
# ============================================================================
# Spike RA-001: Injects a hardcoded test string as additionalContext.
# Production: Will read from wa_inbox.json and inject unread messages.
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

# --- Spike Mode: hardcoded injection ---
# Uncomment the production block below when moving past the spike.

echo "[wa-bridge] BeforeAgent hook fired" >&2

# Check if inbox exists and has unread messages
if [ -f "$INBOX" ] && command -v jq &>/dev/null; then
  UNREAD=$(jq -r '.messages[]? | select(.read == false) | .text' "$INBOX" 2>/dev/null)

  if [ -n "$UNREAD" ]; then
    # Mark all as read (atomic write)
    jq '.messages[] |= (if .read == false then .read = true else . end)' "$INBOX" > "${INBOX}.tmp" && mv "${INBOX}.tmp" "$INBOX"

    # Detect STOP signal
    if echo "$UNREAD" | grep -qi "^STOP$"; then
      CONTEXT="⛔ STOP signal received from user. Complete your current action, write a final status update, and halt. Do not start any new tasks."
    else
      CONTEXT="📱 Remote messages via Telegram:\n$UNREAD"
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

# No inbox or no unread messages — inject spike test string
echo "[wa-bridge] No unread messages, injecting spike test string" >&2
jq -n '{
  "decision": "allow",
  "hookSpecificOutput": {
    "hookEventName": "BeforeAgent",
    "additionalContext": "🧪 [SPIKE RA-001] This message was injected by the BeforeAgent hook. If you can read this, the hook bridge is working correctly."
  }
}'
