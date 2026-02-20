#!/bin/bash
# ============================================================================
# Remote Antigravity — Start All Services (v3 Modular Bot)
# ============================================================================
# Usage: ./start_v3.sh
#   Starts bot_v3 + watcher in background. Logs to .gemini/
#   Run ./start_v3.sh stop   to kill everything
#   Run ./start_v3.sh status to check
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BOT_DIR="$SCRIPT_DIR/scripts/bot"
WATCHER="$SCRIPT_DIR/scripts/watcher.sh"
LOG_DIR="$SCRIPT_DIR/.gemini"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

status() {
    echo ""
    if pgrep -f "bot_v3.js" > /dev/null 2>&1; then
        echo -e "  🤖 Bot:     ${GREEN}Running${NC} (PID $(pgrep -f 'bot_v3.js' | head -1))"
    else
        echo -e "  🤖 Bot:     ${RED}Stopped${NC}"
    fi
    if pgrep -f "watcher.sh" > /dev/null 2>&1; then
        echo -e "  👁️  Watcher:  ${GREEN}Running${NC} (PID $(pgrep -f 'watcher.sh' | head -1))"
    else
        echo -e "  👁️  Watcher:  ${RED}Stopped${NC}"
    fi
    echo ""
}

stop_all() {
    echo "🛑 Stopping services..."
    pkill -f "bot_v3.js" 2>/dev/null && echo "  ✅ Bot stopped" || echo "  ⚪ Bot was not running"
    pkill -f "watcher.sh" 2>/dev/null && echo "  ✅ Watcher stopped" || echo "  ⚪ Watcher was not running"
    # Clean up stale lock to prevent false alerts on next start
    rm -f "$LOG_DIR/wa_session.lock" 2>/dev/null
}

case "${1:-start}" in
    stop)
        stop_all
        ;;
    status)
        echo "📊 Service Status:"
        status
        ;;
    start)
        echo "🚀 Starting Remote Antigravity (v3)..."

        # Check prerequisites
        if [ ! -f "$BOT_DIR/.env" ]; then
            echo -e "${RED}❌ Missing $BOT_DIR/.env${NC}"
            echo "   Copy .env.example to .env and fill in your values."
            exit 1
        fi

        if ! command -v gemini &> /dev/null; then
            if command -v kilo &> /dev/null; then
                echo -e "${YELLOW}⚠️  Gemini CLI not found, but Kilo CLI is available${NC}"
                echo "   Use /backend in Telegram to switch to Kilo."
            else
                echo -e "${RED}❌ No CLI backend found (need gemini or kilo)${NC}"
                echo "   Gemini: https://github.com/google-gemini/gemini-cli"
                echo "   Kilo:   npm install -g @kilocode/cli"
                exit 1
            fi
        fi

        # Kill existing instances (both v1 and v3)
        pkill -f "bot_v3.js" 2>/dev/null
        pkill -f "bot.js" 2>/dev/null
        pkill -f "watcher.sh" 2>/dev/null
        sleep 1

        # Always run from main branch
        CURRENT_BRANCH=$(git -C "$SCRIPT_DIR" branch --show-current 2>/dev/null)
        if [ "$CURRENT_BRANCH" != "main" ]; then
            echo -e "  ${YELLOW}⚠️  On branch '$CURRENT_BRANCH' — switching to main${NC}"
            git -C "$SCRIPT_DIR" checkout main 2>/dev/null
        fi

        # Rotate logs — diagnosis reads last 30 lines, stale entries cause false reports
        TIMESTAMP=$(date +%Y%m%d-%H%M%S)
        [ -f "$LOG_DIR/bot.log" ] && mv "$LOG_DIR/bot.log" "$LOG_DIR/bot.log.$TIMESTAMP" 2>/dev/null
        [ -f "$LOG_DIR/watcher.log" ] && mv "$LOG_DIR/watcher.log" "$LOG_DIR/watcher.log.$TIMESTAMP" 2>/dev/null

        # Start bot (v3 modular entry point)
        echo "  🤖 Starting bot_v3..."
        cd "$BOT_DIR" && node bot_v3.js >> "$LOG_DIR/bot.log" 2>&1 &
        BOT_PID=$!
        cd "$SCRIPT_DIR"

        # Start watcher
        echo "  👁️  Starting watcher..."
        bash "$WATCHER" >> "$LOG_DIR/watcher.log" 2>&1 &
        WATCHER_PID=$!

        sleep 2

        # Verify
        if kill -0 $BOT_PID 2>/dev/null && kill -0 $WATCHER_PID 2>/dev/null; then
            echo -e "\n${GREEN}✅ All services running!${NC}"
            echo "   Bot PID:     $BOT_PID"
            echo "   Watcher PID: $WATCHER_PID"
            echo ""
            echo "   Logs: $LOG_DIR/bot.log"
            echo "         $LOG_DIR/watcher.log"
            echo ""
            echo -e "   ${YELLOW}./start_v3.sh status${NC}  — check status"
            echo -e "   ${YELLOW}./start_v3.sh stop${NC}    — stop everything"
        else
            echo -e "\n${RED}❌ Something failed to start. Check logs:${NC}"
            echo "   tail -20 $LOG_DIR/bot.log"
            echo "   tail -20 $LOG_DIR/watcher.log"
            exit 1
        fi
        ;;
    *)
        echo "Usage: ./start_v3.sh [start|stop|status]"
        ;;
esac
