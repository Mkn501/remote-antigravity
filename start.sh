#!/bin/bash
# ============================================================================
# Remote Antigravity — Start All Services
# ============================================================================
# Usage: ./start.sh
#   Starts bot + watcher in background. Logs to .gemini/
#   Run ./start.sh stop   to kill everything
#   Run ./start.sh status to check
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
    if pgrep -f "bot.js" > /dev/null 2>&1; then
        echo -e "  🤖 Bot:     ${GREEN}Running${NC} (PID $(pgrep -f 'bot.js' | head -1))"
    else
        echo -e "  🤖 Bot:     ${RED}Stopped${NC}"
    fi
    if pgrep -f "watcher.sh" > /dev/null 2>&1; then
        echo -e "  👁️  Watcher:  ${GREEN}Running${NC} (PID $(pgrep -f 'watcher.sh' | head -1))"
    else
        echo -e "  👁️  Watcher:  ${RED}Stopped${NC}"
    fi
    if command -v acc &> /dev/null && acc status 2>/dev/null | grep -q "active"; then
        echo -e "  🛸 Proxy:    ${GREEN}Running${NC}"
    else
        echo -e "  🛸 Proxy:    ${YELLOW}Not running${NC} (Claude models unavailable)"
    fi
    echo ""
}

stop_all() {
    echo "🛑 Stopping services..."
    pkill -f "bot.js" 2>/dev/null && echo "  ✅ Bot stopped" || echo "  ⚪ Bot was not running"
    pkill -f "watcher.sh" 2>/dev/null && echo "  ✅ Watcher stopped" || echo "  ⚪ Watcher was not running"
    # Stop antigravity-claude-proxy if running
    if command -v acc &> /dev/null; then
        acc stop 2>/dev/null && echo "  ✅ Proxy stopped" || echo "  ⚪ Proxy was not running"
    fi
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
        echo "🚀 Starting Remote Antigravity..."

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

        # Kill existing instances
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

        # Start bot
        echo "  🤖 Starting bot..."
        cd "$BOT_DIR" && node bot_v2.js >> "$LOG_DIR/bot.log" 2>&1 &
        BOT_PID=$!
        cd "$SCRIPT_DIR"

        # Start antigravity-claude-proxy (for Kilo CLI + Claude models)
        if command -v acc &> /dev/null; then
            if ! acc status 2>/dev/null | grep -q "active"; then
                echo "  🛸 Starting antigravity-claude-proxy..."
                PORT=3456 acc start 2>/dev/null
            else
                echo -e "  🛸 Proxy:    ${GREEN}Already running${NC}"
            fi
        else
            echo -e "  ${YELLOW}⚠️  antigravity-claude-proxy not installed (Claude models unavailable)${NC}"
        fi

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
            echo -e "   ${YELLOW}./start.sh status${NC}  — check status"
            echo -e "   ${YELLOW}./start.sh stop${NC}    — stop everything"
        else
            echo -e "\n${RED}❌ Something failed to start. Check logs:${NC}"
            echo "   tail -20 $LOG_DIR/bot.log"
            echo "   tail -20 $LOG_DIR/watcher.log"
            exit 1
        fi
        ;;
    *)
        echo "Usage: ./start.sh [start|stop|status]"
        ;;
esac
