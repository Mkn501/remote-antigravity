#!/bin/bash
# =============================================================================
# watchdog.sh — Independent Health Monitor for Antigravity Bot + Watcher
# =============================================================================
# Runs independently (via launchd/cron) every 60 seconds.
# Checks if bot.js and watcher.sh are alive; restarts if not.
# Includes restart loop guard: max 3 restarts per hour.
#
# Install (macOS):
#   launchctl load com.antigravity.watchdog.plist
#
# Manual run:
#   bash scripts/watchdog.sh
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
GEMINI_DIR="$PROJECT_DIR/.gemini"
LOG="$GEMINI_DIR/watchdog.log"
BOT_DIR="$SCRIPT_DIR/bot"
WATCHER="$SCRIPT_DIR/watcher.sh"
RESTART_TRACKER="/tmp/ra-watchdog-restarts"

# Ensure log dir exists
mkdir -p "$GEMINI_DIR"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') | $1" >> "$LOG"; }

# --- Restart Loop Guard ---
# Max 3 restarts per hour to prevent crash loops
HOUR=$(date '+%Y-%m-%d-%H')
RESTART_COUNT=$(grep -c "$HOUR" "$RESTART_TRACKER" 2>/dev/null || echo "0")
if [ "$RESTART_COUNT" -ge 3 ]; then
    log "⛔ Restart limit reached ($RESTART_COUNT/3 this hour) — skipping"
    exit 0
fi

# --- Check Bot ---
if ! pgrep -f "node.*bot\.js" > /dev/null 2>&1; then
    log "❌ Bot down — restarting"
    echo "$HOUR" >> "$RESTART_TRACKER"
    cd "$BOT_DIR" && node bot.js >> "$GEMINI_DIR/bot.log" 2>&1 &
    log "✅ Bot started (PID $!)"
else
    # Only log 'healthy' once every 60 checks (~1 hour) to avoid log spam
    LINE_COUNT=$(wc -l < "$LOG" 2>/dev/null || echo "0")
    if [ $((LINE_COUNT % 60)) -eq 0 ]; then
        log "✅ Bot healthy"
    fi
fi

# --- Check Watcher ---
if ! pgrep -f "bash.*watcher\.sh" > /dev/null 2>&1; then
    log "❌ Watcher down — restarting"
    echo "$HOUR" >> "$RESTART_TRACKER"
    # Clean stale lock before restart
    rm -f "$GEMINI_DIR/wa_session.lock" 2>/dev/null
    bash "$WATCHER" >> "$GEMINI_DIR/watcher.log" 2>&1 &
    log "✅ Watcher started (PID $!)"
fi

# --- Cleanup old restart tracker entries (keep last 24 hours) ---
if [ -f "$RESTART_TRACKER" ]; then
    YESTERDAY=$(date -v-1d '+%Y-%m-%d' 2>/dev/null || date -d '1 day ago' '+%Y-%m-%d' 2>/dev/null || echo "")
    if [ -n "$YESTERDAY" ]; then
        grep "$(date '+%Y-%m-%d')" "$RESTART_TRACKER" > "${RESTART_TRACKER}.tmp" 2>/dev/null
        mv "${RESTART_TRACKER}.tmp" "$RESTART_TRACKER" 2>/dev/null || true
    fi
fi
