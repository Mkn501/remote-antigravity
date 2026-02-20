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

# --- LLM Self-Diagnosis (Phase 3) ---
# If ≥2 crashes this hour and no diagnosis pending, spawn LLM to analyze logs
CRASH_COUNT=$(grep -c "$HOUR" "$RESTART_TRACKER" 2>/dev/null || echo "0")
DIAGNOSIS_PENDING="$GEMINI_DIR/diagnosis_pending"

if [ "$CRASH_COUNT" -ge 2 ] && ! [ -f "$DIAGNOSIS_PENDING" ]; then
    log "🔍 Repeated crashes ($CRASH_COUNT) — triggering LLM diagnosis"
    touch "$DIAGNOSIS_PENDING"

    # Collect diagnostic context
    WATCHER_TAIL=$(tail -50 "$GEMINI_DIR/watcher.log" 2>/dev/null || echo "(no log)")
    BOT_TAIL=$(tail -50 "$GEMINI_DIR/bot.log" 2>/dev/null || echo "(no log)")

    # Build diagnosis prompt
    PROMPT_TEMPLATE=""
    if [ -f "$SCRIPT_DIR/diagnose_prompt.txt" ]; then
        PROMPT_TEMPLATE=$(cat "$SCRIPT_DIR/diagnose_prompt.txt")
    else
        PROMPT_TEMPLATE="You are a systems reliability engineer. The Antigravity bot/watcher system has crashed multiple times in the last hour. Analyze the logs below and:

1. Identify the ROOT CAUSE of the crash
2. Determine if it is a code bug, config issue, or external failure
3. Suggest a specific fix (file + line if possible)
4. Rate severity: CRITICAL / HIGH / MEDIUM / LOW

Do NOT modify any files. Output your analysis as plain text."
    fi

    PROMPT="$PROMPT_TEMPLATE

=== WATCHER LOG (last 50 lines) ===
$WATCHER_TAIL

=== BOT LOG (last 50 lines) ===
$BOT_TAIL"

    # Read active backend from state.json
    BACKEND=$(python3 -c "import json; print(json.load(open('$GEMINI_DIR/state.json')).get('backend','gemini'))" 2>/dev/null || echo "gemini")
    MODEL=$(python3 -c "import json; print(json.load(open('$GEMINI_DIR/state.json')).get('model',''))" 2>/dev/null || echo "")

    # Spawn diagnosis via active backend (fire-and-forget)
    if [ "$BACKEND" = "kilo" ]; then
        source "$SCRIPT_DIR/bot/.env" 2>/dev/null
        [ -n "${KILO_API_KEY:-}" ] && export OPENROUTER_API_KEY="$KILO_API_KEY"
        kilo run --auto ${MODEL:+--model "$MODEL"} "$PROMPT" \
            >"$GEMINI_DIR/diagnosis_output.txt" 2>&1 &
    else
        gemini -p "$PROMPT" \
            >"$GEMINI_DIR/diagnosis_output.txt" 2>&1 &
    fi
    log "✅ Diagnosis spawned via $BACKEND (PID $!)"
fi


# --- Phase 4: Auto-Fix & Hot-Deploy ---
# If auto_fix_enabled + diagnosis found CRITICAL/HIGH + diagnosis file exists:
# create hotfix branch from main, spawn CLI to fix, run tests, ask permission.
# NEVER auto-merges — user must send /apply_fix to deploy.
if [ -f "$DIAGNOSIS_PENDING" ] && [ -f "$GEMINI_DIR/diagnosis_output.txt" ] && [ -s "$GEMINI_DIR/diagnosis_output.txt" ]; then
    AUTO_FIX=$(python3 -c "import json; print(json.load(open('$GEMINI_DIR/state.json')).get('auto_fix_enabled', False))" 2>/dev/null || echo "False")
    SEVERITY=$(grep -oE "CRITICAL|HIGH" "$GEMINI_DIR/diagnosis_output.txt" | head -1)

    if [ "$AUTO_FIX" = "True" ] && [ -n "$SEVERITY" ]; then
        log "🔧 Auto-fix triggered (severity: $SEVERITY) — preparing hotfix"
        HOTFIX_BRANCH="hotfix/auto-$(date +%s)"
        cd "$PROJECT_DIR" || exit 0
        git checkout -b "$HOTFIX_BRANCH" main 2>/dev/null || { log "❌ Auto-fix: could not create hotfix branch"; exit 0; }

        DIAGNOSIS=$(cat "$GEMINI_DIR/diagnosis_output.txt")
        FIX_PROMPT="Fix a bug in the Antigravity bot. Apply the MINIMAL change. Do NOT refactor. Do NOT change test files.
Diagnosis:
$DIAGNOSIS"

        if [ "$BACKEND" = "kilo" ]; then
            source "$SCRIPT_DIR/bot/.env" 2>/dev/null
            [ -n "${KILO_API_KEY:-}" ] && export OPENROUTER_API_KEY="$KILO_API_KEY"
            kilo run --auto ${MODEL:+--model "$MODEL"} "$FIX_PROMPT" >"$GEMINI_DIR/autofix_output.txt" 2>&1
        else
            gemini -p "$FIX_PROMPT" >"$GEMINI_DIR/autofix_output.txt" 2>&1
        fi

        cd "$BOT_DIR" && npm test >"$GEMINI_DIR/autofix_test.log" 2>&1
        TEST_EXIT=$?
        cd "$PROJECT_DIR"

        if [ $TEST_EXIT -eq 0 ]; then
            DIFF_SUMMARY=$(git diff main --stat 2>/dev/null | tail -5)
            log "✅ Hotfix ready ($HOTFIX_BRANCH) — awaiting user approval"
            python3 -c "
import json, datetime, sys
msg = {'timestamp': datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
       'text': '🔧 Hotfix ready (${SEVERITY}):\n${DIFF_SUMMARY}\n\nTests: PASSED ✅\nBranch: ${HOTFIX_BRANCH}\n\nSend /apply_fix to deploy or /discard_fix to discard.',
       'sent': False}
try:
    with open('$GEMINI_DIR/wa_outbox.json') as f: d = json.load(f)
except: d = {'messages': []}
d['messages'].append(msg)
with open('$GEMINI_DIR/wa_outbox.json', 'w') as f: json.dump(d, f, indent=2)
" 2>/dev/null
        else
            git checkout main 2>/dev/null && git branch -D "$HOTFIX_BRANCH" 2>/dev/null
            log "❌ Auto-fix failed tests — hotfix discarded"
            python3 -c "
import json, datetime
msg = {'timestamp': datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
       'text': '❌ Auto-fix failed tests. Manual fix needed.\nSee: .gemini/autofix_test.log',
       'sent': False}
try:
    with open('$GEMINI_DIR/wa_outbox.json') as f: d = json.load(f)
except: d = {'messages': []}
d['messages'].append(msg)
with open('$GEMINI_DIR/wa_outbox.json', 'w') as f: json.dump(d, f, indent=2)
" 2>/dev/null
        fi
    fi
fi
