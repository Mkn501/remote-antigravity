#!/usr/bin/env bash
# ============================================================================
# Inbox Watcher — Daemon that triggers Gemini CLI on new messages
# ============================================================================
# Polls wa_inbox.json for unread messages. When found, reads the active project
# from state.json and launches a Gemini CLI session in that directory.
#
# Sets HOOK_BRIDGE_DIR env var so hooks (running in target project) can find
# the central inbox/outbox in this project.
# ============================================================================

set -euo pipefail

# Central directory (where this script lives' parent)
CENTRAL_PROJECT_DIR="${GEMINI_PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
DOT_GEMINI="$CENTRAL_PROJECT_DIR/.gemini"
INBOX="$DOT_GEMINI/wa_inbox.json"
STATE_FILE="$DOT_GEMINI/state.json"
LOCK_FILE="$DOT_GEMINI/wa_session.lock"

POLL_INTERVAL=3
COOLDOWN=10

echo "👁️  Inbox watcher started"
echo "   HQ:      $CENTRAL_PROJECT_DIR"
echo "   Inbox:   $INBOX"
echo "   State:   $STATE_FILE"
echo ""

cleanup() {
    rm -f "$LOCK_FILE"
    echo "👋 Watcher stopped"
    exit 0
}
trap cleanup SIGINT SIGTERM

while true; do
    # Check for unread messages
    if [ -f "$INBOX" ] && command -v jq &>/dev/null; then
        UNREAD_COUNT=$(jq '[.messages[]? | select(.read == false)] | length' "$INBOX" 2>/dev/null || echo "0")

        if [ "$UNREAD_COUNT" -gt 0 ] && [ ! -f "$LOCK_FILE" ]; then
            # Read active project from state.json
            ACTIVE_PROJECT=$(jq -r '.activeProject // empty' "$STATE_FILE" 2>/dev/null || echo "$CENTRAL_PROJECT_DIR")
            
            if [ -z "$ACTIVE_PROJECT" ] || [ ! -d "$ACTIVE_PROJECT" ]; then
                echo "⚠️  Active project not found: '$ACTIVE_PROJECT'. Falling back to HQ."
                ACTIVE_PROJECT="$CENTRAL_PROJECT_DIR"
            fi

            echo "📬 $(date -u +%H:%M:%S) | $UNREAD_COUNT msg(s) → Launching in: $(basename "$ACTIVE_PROJECT")"

            # Create lock
            echo "$$" > "$LOCK_FILE"

            # Launch Gemini in target project
            # HOOK_BRIDGE_DIR points back to HQ so hooks can find inbox
            (
                cd "$ACTIVE_PROJECT"
                export HOOK_BRIDGE_DIR="$CENTRAL_PROJECT_DIR"
                gemini -p "You have new messages via Telegram. Read them from context and respond." 2>>"$DOT_GEMINI/wa_session.log"
            ) || true

            # Session ended
            rm -f "$LOCK_FILE"
            echo "✅ $(date -u +%H:%M:%S) | Session complete — cooling down ${COOLDOWN}s"
            sleep "$COOLDOWN"
        fi
    fi

    sleep "$POLL_INTERVAL"
done
