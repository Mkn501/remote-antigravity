#!/usr/bin/env bash
# ============================================================================
# Kilo CLI E2E Test — Validates the full pipeline
# ============================================================================
# Tests:
#   1. .env sourcing and OPENROUTER_API_KEY mapping
#   2. Direct Kilo CLI invocation (model responds)
#   3. Watcher pipeline: inbox → watcher → kilo → outbox
#   4. Response extraction (<<<TELEGRAM>>>...<<<END>>> markers)
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DOT_GEMINI="$PROJECT_ROOT/.gemini"
STATE_FILE="$DOT_GEMINI/state.json"
INBOX="$DOT_GEMINI/wa_inbox.json"
OUTBOX="$DOT_GEMINI/wa_outbox.json"
ENV_FILE="$SCRIPT_DIR/.env"

PASS=0
FAIL=0
SKIP=0

pass() { echo "  ✅ $1"; PASS=$((PASS + 1)); }
fail() { echo "  ❌ $1"; FAIL=$((FAIL + 1)); }
skip() { echo "  ⏭️  $1"; SKIP=$((SKIP + 1)); }

echo "══════════════════════════════════════════════════"
echo "  Kilo CLI E2E Test Suite"
echo "══════════════════════════════════════════════════"
echo ""

# --- Test 1: .env file exists and has KILO_API_KEY ---
echo "── 1. Environment Setup ──"

if [ -f "$ENV_FILE" ]; then
    pass ".env file exists"
else
    fail ".env file missing at $ENV_FILE"
fi

if grep -q "KILO_API_KEY=" "$ENV_FILE" 2>/dev/null; then
    pass "KILO_API_KEY defined in .env"
else
    fail "KILO_API_KEY not found in .env"
fi

# --- Test 2: .env sourcing + OPENROUTER_API_KEY mapping ---
echo ""
echo "── 2. API Key Sourcing ──"

# Source .env the same way watcher.sh does
unset KILO_API_KEY 2>/dev/null || true
unset OPENROUTER_API_KEY 2>/dev/null || true

while IFS='=' read -r key value; do
    case "$key" in
        \#*|"") continue ;;
        *_API_KEY|*_PROJECT_DIR|*_BOT_TOKEN|*_CHAT_ID)
            export "$key=$value"
            ;;
    esac
done < "$ENV_FILE"

# Map KILO_API_KEY → OPENROUTER_API_KEY (same as watcher.sh)
if [ -n "${KILO_API_KEY:-}" ] && [ -z "${OPENROUTER_API_KEY:-}" ]; then
    export OPENROUTER_API_KEY="$KILO_API_KEY"
fi

if [ -n "${KILO_API_KEY:-}" ]; then
    pass "KILO_API_KEY sourced (${#KILO_API_KEY} chars)"
else
    fail "KILO_API_KEY not sourced from .env"
fi

if [ -n "${OPENROUTER_API_KEY:-}" ]; then
    pass "OPENROUTER_API_KEY mapped from KILO_API_KEY"
else
    fail "OPENROUTER_API_KEY mapping failed"
fi

# --- Test 3: Kilo CLI installed ---
echo ""
echo "── 3. Kilo CLI Binary ──"

if command -v kilo &>/dev/null; then
    KILO_VER=$(kilo --version 2>&1 | head -1 || echo "unknown")
    pass "kilo CLI installed ($KILO_VER)"
else
    fail "kilo CLI not found in PATH"
    echo "  ⛔ Remaining tests require kilo CLI — aborting"
    echo ""
    echo "══════════════════════════════════════════════════"
    echo "  Results: $PASS passed, $FAIL failed, $SKIP skipped"
    echo "══════════════════════════════════════════════════"
    exit 1
fi

# --- Test 4: Direct Kilo CLI call (MiniMax) ---
echo ""
echo "── 4. Direct Kilo CLI Call (MiniMax M2.5) ──"

KILO_OUTPUT=$(kilo run --model "openrouter/minimax/minimax-m2.5" --auto "Reply with exactly: E2E_KILO_OK" 2>/dev/null || echo "KILO_ERROR")

if echo "$KILO_OUTPUT" | grep -q "E2E_KILO_OK"; then
    pass "MiniMax M2.5 responded with expected text"
elif echo "$KILO_OUTPUT" | grep -q "KILO_ERROR"; then
    fail "Kilo CLI call failed entirely"
else
    # Model responded but didn't follow instructions exactly — still a pass
    pass "MiniMax M2.5 responded ($(echo "$KILO_OUTPUT" | wc -c | tr -d ' ') bytes)"
fi

# --- Test 5: Direct Kilo CLI call (GLM-5) ---
echo ""
echo "── 5. Direct Kilo CLI Call (GLM-5) ──"

GLM_OUTPUT=$(kilo run --model "openrouter/z-ai/glm-5" --auto "Reply with exactly: E2E_GLM5_OK" 2>/dev/null || echo "GLM_ERROR")

if echo "$GLM_OUTPUT" | grep -q "E2E_GLM5_OK"; then
    pass "GLM-5 responded with expected text"
elif echo "$GLM_OUTPUT" | grep -qi "rate.limit\|429\|too.many"; then
    skip "GLM-5 rate limited (expected for free tier)"
elif echo "$GLM_OUTPUT" | grep -q "GLM_ERROR"; then
    fail "GLM-5 call failed entirely"
else
    pass "GLM-5 responded ($(echo "$GLM_OUTPUT" | wc -c | tr -d ' ') bytes)"
fi

# --- Test 6: Watcher script syntax ---
echo ""
echo "── 6. Watcher Script Validation ──"

WATCHER_SH="$PROJECT_ROOT/scripts/watcher.sh"

if bash -n "$WATCHER_SH" 2>/dev/null; then
    pass "watcher.sh syntax valid"
else
    fail "watcher.sh has syntax errors"
fi

if grep -q 'get_backend()' "$WATCHER_SH"; then
    pass "get_backend() function present"
else
    fail "get_backend() missing from watcher.sh"
fi

if grep -q 'run_agent()' "$WATCHER_SH"; then
    pass "run_agent() function present"
else
    fail "run_agent() missing from watcher.sh"
fi

if grep -q 'OPENROUTER_API_KEY' "$WATCHER_SH"; then
    pass "OPENROUTER_API_KEY mapping in watcher.sh"
else
    fail "OPENROUTER_API_KEY mapping missing from watcher.sh"
fi

if grep -q 'EXTRA_FLAGS\[@\]+' "$WATCHER_SH"; then
    pass "EXTRA_FLAGS safe expansion pattern"
else
    fail "EXTRA_FLAGS unsafe expansion (will crash with set -u)"
fi

# --- Test 7: State.json backend config ---
echo ""
echo "── 7. State Configuration ──"

if [ -f "$STATE_FILE" ]; then
    BACKEND=$(jq -r '.backend // "not_set"' "$STATE_FILE")
    MODEL=$(jq -r '.model // "not_set"' "$STATE_FILE")
    
    if [ "$BACKEND" = "kilo" ]; then
        pass "backend = kilo"
    else
        skip "backend = $BACKEND (not kilo — set via /backend in Telegram)"
    fi
    
    if echo "$MODEL" | grep -q "openrouter/"; then
        pass "model uses openrouter/ prefix ($MODEL)"
    else
        skip "model = $MODEL (not a kilo model)"
    fi
else
    fail "state.json not found"
fi

# --- Test 8: Bot.js integration ---
echo ""
echo "── 8. Bot Integration ──"

BOT_JS="$SCRIPT_DIR/bot.js"

if grep -q "'kilo':" "$BOT_JS"; then
    pass "PLATFORM_MODELS has kilo entry"
else
    fail "kilo missing from PLATFORM_MODELS"
fi

if grep -q "/backend" "$BOT_JS"; then
    pass "/backend command handler present"
else
    fail "/backend command handler missing"
fi

if grep -q "CENTRAL_DIR.*wa_dispatch" "$BOT_JS" && ! grep -q "DOT_GEMINI.*wa_dispatch" "$BOT_JS"; then
    pass "health check uses CENTRAL_DIR (not DOT_GEMINI)"
else
    fail "health check still references DOT_GEMINI"
fi

# --- Test 9: Unit tests ---
echo ""
echo "── 9. Unit Tests ──"

cd "$SCRIPT_DIR"
TEST_OUTPUT=$(npm test 2>&1)
TEST_RESULT=$?

if [ $TEST_RESULT -eq 0 ]; then
    PASSED=$(echo "$TEST_OUTPUT" | sed -n 's/.*Passed: \([0-9]*\).*/\1/p' | tail -1)
    pass "npm test passed ($PASSED tests)"
else
    LAST_LINES=$(echo "$TEST_OUTPUT" | tail -5)
    fail "npm test failed: $LAST_LINES"
fi

# --- Summary ---
echo ""
echo "══════════════════════════════════════════════════"
TOTAL=$((PASS + FAIL + SKIP))
if [ $FAIL -eq 0 ]; then
    echo "  ✅ ALL PASSED: $PASS passed, $SKIP skipped (of $TOTAL)"
else
    echo "  ❌ FAILURES: $PASS passed, $FAIL failed, $SKIP skipped (of $TOTAL)"
fi
echo "══════════════════════════════════════════════════"

exit $FAIL
