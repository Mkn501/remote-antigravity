#!/usr/bin/env bash
# ============================================================================
# Inbox Watcher — Daemon that triggers Gemini CLI on new messages
# ============================================================================
# Polls wa_inbox.json for unread messages. When found, starts a Gemini CLI
# session in headless mode (-p) to process them. The hooks handle the rest:
#   - BeforeAgent injects inbox messages
#   - AfterAgent checks for new messages and re-prompts (Sprint loop)
#
# Usage:
#   ./scripts/watcher.sh          # Run in foreground
#   nohup ./scripts/watcher.sh &  # Run as daemon
#
# Requires: gemini CLI in PATH, jq
# ============================================================================

set -euo pipefail

PROJECT_DIR="${GEMINI_PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
INBOX="$PROJECT_DIR/.gemini/wa_inbox.json"
POLL_INTERVAL=3  # seconds
COOLDOWN=10      # seconds after a session ends before checking again
LOCK_FILE="$PROJECT_DIR/.gemini/wa_session.lock"

echo "👁️  Inbox watcher started"
echo "   📂 Project: $PROJECT_DIR"
echo "   📥 Inbox:   $INBOX"
echo "   ⏱️  Poll:    ${POLL_INTERVAL}s"
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
            echo "📬 $(date -u +%H:%M:%S) | $UNREAD_COUNT unread message(s) — starting Gemini session..."

            # Create lock to prevent concurrent sessions
            echo "$$" > "$LOCK_FILE"

            # Run Gemini CLI in headless mode
            # The BeforeAgent hook will inject the inbox messages
            # The AfterAgent hook will continue looping if new messages arrive
            (
                cd "$PROJECT_DIR"
                gemini -p "You have new messages from the user via Telegram. Read them from your BeforeAgent hook context and respond helpfully. Keep responses concise." 2>>"$PROJECT_DIR/.gemini/wa_session.log"
            ) || true

            # Session ended — remove lock
            rm -f "$LOCK_FILE"
            echo "✅ $(date -u +%H:%M:%S) | Session complete — cooling down ${COOLDOWN}s"
            sleep "$COOLDOWN"
        fi
    fi

    sleep "$POLL_INTERVAL"
done
