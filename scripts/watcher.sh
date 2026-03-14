#!/usr/bin/env bash
# ============================================================================
# Inbox Watcher — Daemon that triggers Agent CLI on new messages
# ============================================================================
# Features:
#   - Backend abstraction: routes to Gemini CLI or Kilo CLI via state.json
#   - Persistent branch: uses telegram/active for conversation continuity
#   - /new command: archives old branch, starts fresh from main
#   - Conversation history: includes last 5 exchanges in prompt
#   - Model selection: reads from state.json
#   - YOLO mode: auto-approves all tool calls (safe due to branch isolation)
#   - Hooks workaround: temporarily disables settings.json to prevent
#     a Gemini CLI bug where BeforeAgent hooks break built-in tools
#   - Response capture: extracts <<<TELEGRAM>>>...<<<END>>> from stdout
#     and writes to outbox (replaces AfterAgent hook for watcher sessions)
# ============================================================================

set -euo pipefail

# Source .env for API keys (needed for Kilo CLI backend)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/bot/.env"
if [ -f "$ENV_FILE" ]; then
    # Export only API key variables (skip comments and non-key lines)
    while IFS='=' read -r key value; do
        case "$key" in
            \#*|"") continue ;;  # skip comments and empty lines
            *_API_KEY|*_PROJECT_DIR|*_BOT_TOKEN|*_CHAT_ID)
                export "$key=$value"
                ;;
        esac
    done < "$ENV_FILE"
    # Map KILO_API_KEY to OPENROUTER_API_KEY for Kilo CLI
    if [ -n "${KILO_API_KEY:-}" ] && [ -z "${OPENROUTER_API_KEY:-}" ]; then
        export OPENROUTER_API_KEY="$KILO_API_KEY"
    fi
fi

CENTRAL_PROJECT_DIR="${GEMINI_PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
DOT_GEMINI="$CENTRAL_PROJECT_DIR/.gemini"
INBOX="$DOT_GEMINI/wa_inbox.json"
OUTBOX="$DOT_GEMINI/wa_outbox.json"
STATE_FILE="$DOT_GEMINI/state.json"
LOCK_FILE="$DOT_GEMINI/wa_session.lock"
PLAN_MODE_FILE="$DOT_GEMINI/wa_plan_mode"

POLL_INTERVAL=3
COOLDOWN=10
DEFAULT_MODEL="gemini-2.5-flash"  # Fast + cheap, tasks get tier-appropriate models anyway

echo "👁️  Inbox watcher started"
echo "   HQ:      $CENTRAL_PROJECT_DIR"
echo "   Inbox:   $INBOX"
echo "   State:   $STATE_FILE"
echo ""

cleanup() {
    rm -f "$LOCK_FILE"
    echo "👋 Watcher stopped"
    # Notify Telegram that watcher has stopped
    python3 -c "
import json, datetime
msg = {'timestamp': datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
       'text': '🔴 Watcher stopped. Agent is no longer running.',
       'sent': False}
try:
    with open('$GEMINI_DIR/wa_outbox.json') as f: d = json.load(f)
except: d = {'messages': []}
d['messages'].append(msg)
with open('$GEMINI_DIR/wa_outbox.json', 'w') as f: json.dump(d, f, indent=2)
" 2>/dev/null
    exit 0
}
trap cleanup SIGINT SIGTERM

# --- Helper: Write response to outbox ---
write_to_outbox() {
    local text="$1"
    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local msg_id="resp_$(date +%s)"

    if [ -f "$OUTBOX" ]; then
        jq --arg id "$msg_id" --arg ts "$timestamp" --arg txt "$text" \
            '.messages += [{"id": $id, "timestamp": $ts, "from": "agent", "text": $txt, "sent": false}]' \
            "$OUTBOX" > "${OUTBOX}.tmp" && mv "${OUTBOX}.tmp" "$OUTBOX"
    else
        jq -n --arg id "$msg_id" --arg ts "$timestamp" --arg txt "$text" \
            '{"messages": [{"id": $id, "timestamp": $ts, "from": "agent", "text": $txt, "sent": false}]}' > "$OUTBOX"
    fi
}

# --- Helper: Write document attachment to outbox ---
write_to_outbox_file() {
    local filepath="$1"
    local caption="$2"
    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local msg_id="doc_$(date +%s)"

    if [ -f "$OUTBOX" ]; then
        jq --arg id "$msg_id" --arg ts "$timestamp" --arg fp "$filepath" --arg cap "$caption" \
            '.messages += [{"id": $id, "timestamp": $ts, "from": "agent", "type": "document", "filePath": $fp, "caption": $cap, "sent": false}]' \
            "$OUTBOX" > "${OUTBOX}.tmp" && mv "${OUTBOX}.tmp" "$OUTBOX"
    else
        jq -n --arg id "$msg_id" --arg ts "$timestamp" --arg fp "$filepath" --arg cap "$caption" \
            '{"messages": [{"id": $id, "timestamp": $ts, "from": "agent", "type": "document", "filePath": $fp, "caption": $cap, "sent": false}]}' > "$OUTBOX"
    fi
}

# --- Helper: Write text with inline keyboard to outbox ---
write_to_outbox_with_markup() {
    local text="$1"
    local markup_json="$2"  # JSON string for reply_markup
    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local msg_id="btn_$(date +%s)"

    if [ -f "$OUTBOX" ]; then
        jq --arg id "$msg_id" --arg ts "$timestamp" --arg txt "$text" --argjson rm "$markup_json" \
            '.messages += [{"id": $id, "timestamp": $ts, "from": "agent", "text": $txt, "reply_markup": $rm, "sent": false}]' \
            "$OUTBOX" > "${OUTBOX}.tmp" && mv "${OUTBOX}.tmp" "$OUTBOX"
    else
        jq -n --arg id "$msg_id" --arg ts "$timestamp" --arg txt "$text" --argjson rm "$markup_json" \
            '{"messages": [{"id": $id, "timestamp": $ts, "from": "agent", "text": $txt, "reply_markup": $rm, "sent": false}]}' > "$OUTBOX"
    fi
}

# --- Helper: Get active backend from state.json ---
get_backend() {
    jq -r '.backend // "gemini"' "$STATE_FILE" 2>/dev/null || echo "gemini"
}

# --- Helper: Run agent CLI with backend abstraction ---
# Usage: run_agent "prompt" "model" "project_dir" [extra_flags...]
# Sets AGENT_OUTPUT and AGENT_STDERR_CONTENT in caller scope
#
# Kilo session env vars (optional, Kilo-only — ignored by Gemini path):
#   KILO_SESSION_ID   — session ID to resume (uses --session <id>)
#   KILO_AGENT        — agent name to use (uses --agent <name>)
#
# Return contract (set after call):
#   AGENT_OUTPUT           — raw stdout (all backends)
#   AGENT_STDERR_CONTENT   — raw stderr (all backends)
#   AGENT_EXIT_CODE        — exit code (all backends)
#   KILO_SESSION_ID_OUT    — session ID from JSON output (Kilo only, empty for Gemini)
#   KILO_RESPONSE_TEXT     — extracted text from JSON events (Kilo only, empty for Gemini)
#   KILO_COST              — cost from step_finish event (Kilo only, empty for Gemini)
#   KILO_TOKENS            — total tokens from step_finish event (Kilo only, empty for Gemini)
run_agent() {
    local prompt="$1"
    local model="$2"
    local project_dir="$3"
    shift 3
    local extra_flags=("$@")
    local backend
    backend=$(get_backend)

    local AGENT_STDERR_FILE
    AGENT_STDERR_FILE=$(mktemp)
    local AGENT_STDOUT_FILE
    AGENT_STDOUT_FILE=$(mktemp)
    local AGENT_EXIT_CODE_FILE
    AGENT_EXIT_CODE_FILE=$(mktemp)

    # Reset Kilo-specific return vars
    KILO_SESSION_ID_OUT=""
    KILO_RESPONSE_TEXT=""
    KILO_COST=""
    KILO_TOKENS=""

    case "$backend" in
        kilo)
            # Build label for status message
            local agent_label="${KILO_AGENT:+ [${KILO_AGENT}]}"
            local session_label="${KILO_SESSION_ID:+ (resuming)}"
            write_to_outbox "🧠 Running Kilo CLI ($model)${agent_label}${session_label}..."
            local KILO_ARGS=(run --auto)

            # --- Session resume flags (env var driven) ---
            if [ -n "${KILO_SESSION_ID:-}" ]; then
                KILO_ARGS+=("--session" "$KILO_SESSION_ID")
            fi
            if [ -n "${KILO_AGENT:-}" ]; then
                KILO_ARGS+=("--agent" "$KILO_AGENT")
            fi

            # Always use --format json when session mode is active
            # (session mode = KILO_SESSION_ID set OR new session being created)
            if [ -n "${KILO_SESSION_ID:-}" ] || [ -n "${KILO_AGENT:-}" ]; then
                KILO_ARGS+=("--format" "json")
            fi

            if [ -n "$model" ]; then
                KILO_ARGS+=("--model" "$model")
            fi
            KILO_ARGS+=(${extra_flags[@]+"${extra_flags[@]}"})
            KILO_ARGS+=("$prompt")
            (
                cd "$project_dir" || exit 1
                # kilo run requires a TTY for output — script provides a pseudo-terminal
                if script -q /dev/null kilo "${KILO_ARGS[@]}" >"$AGENT_STDOUT_FILE" 2>"$AGENT_STDERR_FILE"; then
                    echo 0 > "$AGENT_EXIT_CODE_FILE"
                else
                    echo $? > "$AGENT_EXIT_CODE_FILE"
                fi
            ) || true
            ;;
        gemini|*)
            write_to_outbox "🧠 Running Gemini CLI ($model)..."
            local GEMINI_ARGS=("--model" "$model")
            GEMINI_ARGS+=(${extra_flags[@]+"${extra_flags[@]}"})
            GEMINI_ARGS+=("--yolo" "-p" "$prompt")
            # Temporarily disable hooks (Gemini CLI bug workaround)
            local TARGET_SETTINGS="$project_dir/.gemini/settings.json"
            local SETTINGS_BACKED_UP=false
            if [ -f "$TARGET_SETTINGS" ]; then
                mv "$TARGET_SETTINGS" "${TARGET_SETTINGS}.watcher-bak"
                SETTINGS_BACKED_UP=true
            fi
            (
                cd "$project_dir" || exit 1
                if gemini "${GEMINI_ARGS[@]}" >"$AGENT_STDOUT_FILE" 2>"$AGENT_STDERR_FILE"; then
                    echo 0 > "$AGENT_EXIT_CODE_FILE"
                else
                    echo $? > "$AGENT_EXIT_CODE_FILE"
                fi
            ) || true
            # Restore hooks immediately
            if [ "$SETTINGS_BACKED_UP" = true ] && [ -f "${TARGET_SETTINGS}.watcher-bak" ]; then
                mv "${TARGET_SETTINGS}.watcher-bak" "$TARGET_SETTINGS"
            fi
            ;;
    esac

    # Export results to caller scope
    AGENT_OUTPUT=$(cat "$AGENT_STDOUT_FILE" 2>/dev/null || echo "")
    AGENT_STDERR_CONTENT=$(cat "$AGENT_STDERR_FILE" 2>/dev/null || echo "")
    AGENT_EXIT_CODE=$(cat "$AGENT_EXIT_CODE_FILE" 2>/dev/null || echo "1")

    # --- Kilo JSON output parsing (only when --format json was used) ---
    if [ "$backend" = "kilo" ] && { [ -n "${KILO_SESSION_ID:-}" ] || [ -n "${KILO_AGENT:-}" ]; }; then
        # Extract session ID (consistent across all events)
        KILO_SESSION_ID_OUT=$(echo "$AGENT_OUTPUT" | jq -r 'select(.sessionID != null) | .sessionID' 2>/dev/null | head -1)
        # Extract text parts (concatenate all text events)
        KILO_RESPONSE_TEXT=$(echo "$AGENT_OUTPUT" | jq -r 'select(.type == "text") | .part.text' 2>/dev/null | tr -d '\n')
        # Extract cost and tokens from step_finish event
        KILO_COST=$(echo "$AGENT_OUTPUT" | jq -r 'select(.type == "step_finish") | .part.cost' 2>/dev/null | tail -1)
        KILO_TOKENS=$(echo "$AGENT_OUTPUT" | jq -r 'select(.type == "step_finish") | .part.tokens.total' 2>/dev/null | tail -1)
    fi

    # Append stderr to session log
    cat "$AGENT_STDERR_FILE" >> "$DOT_GEMINI/wa_session.log" 2>/dev/null || true
    rm -f "$AGENT_STDOUT_FILE" "$AGENT_STDERR_FILE" "$AGENT_EXIT_CODE_FILE"
}

while true; do
    if [ -f "$INBOX" ] && command -v jq &>/dev/null; then
        UNREAD_COUNT=$(jq '[.messages[]? | select(.read == false)] | length' "$INBOX" 2>/dev/null || echo "0")

        if [ "$UNREAD_COUNT" -gt 0 ] && [ ! -f "$LOCK_FILE" ]; then
            ACTIVE_PROJECT=$(jq -r '.activeProject // empty' "$STATE_FILE" 2>/dev/null || echo "$CENTRAL_PROJECT_DIR")
            
            if [ -z "$ACTIVE_PROJECT" ] || [ ! -d "$ACTIVE_PROJECT" ]; then
                echo "⚠️  Active project not found: '$ACTIVE_PROJECT'. Falling back to HQ."
                ACTIVE_PROJECT="$CENTRAL_PROJECT_DIR"
            fi

            MODEL_FLAG=""
            SELECTED_MODEL=$(jq -r '.model // empty' "$STATE_FILE" 2>/dev/null || echo "")
            
            # Validate model name (allow alphanumeric, dots, hyphens, underscores, slashes, colons)
            if [ -n "$SELECTED_MODEL" ] && [[ ! "$SELECTED_MODEL" =~ ^[a-zA-Z0-9._:/-]+$ ]]; then
                 echo "⚠️  Invalid model name in state.json: '$SELECTED_MODEL'. Ignoring."
                 SELECTED_MODEL=""
            fi

            # Extract unread message text BEFORE marking as read
            # (Since hooks are disabled, we inject messages directly into the prompt)
            USER_MESSAGES=$(jq -r '[.messages[] | select(.read == false) | .text] | join("\n")' "$INBOX" 2>/dev/null || echo "")

            # Check for session lifecycle commands
            IS_NEW_SESSION=false
            IS_SHUTDOWN=false
            IS_PLAN_FEATURE=false
            if echo "$USER_MESSAGES" | grep -qi "^/new"; then
                IS_NEW_SESSION=true
                USER_MESSAGES=$(echo "$USER_MESSAGES" | sed 's|^/new[[:space:]]*||i')
            fi
            if echo "$USER_MESSAGES" | grep -qi "^/startup"; then
                IS_NEW_SESSION=true  # /startup always starts a fresh branch
            fi
            if echo "$USER_MESSAGES" | grep -qi "^/shutdown"; then
                IS_SHUTDOWN=true  # /shutdown archives branch after running
            fi
            if echo "$USER_MESSAGES" | grep -qi "^/plan_feature\|^/plan "; then
                IS_PLAN_FEATURE=true
            fi
            # Detect diagnosis prompts (from /diagnose or watchdog auto-trigger)
            IS_DIAGNOSIS=false
            if echo "$USER_MESSAGES" | head -1 | grep -q "^You are a"; then
                IS_DIAGNOSIS=true
            fi
            # Auto-detect plan mode: if .wa_plan_mode marker exists, we're still in planning
            PLAN_MODE_FILE="$DOT_GEMINI/wa_plan_mode"
            if [ -f "$PLAN_MODE_FILE" ] && [ "$IS_PLAN_FEATURE" = false ]; then
                IS_PLAN_FEATURE=true
                echo "🔒 Plan mode active (from previous /plan_feature) — no code changes allowed" >&2
            fi

            # Tiered model routing (backend-aware)
            CURRENT_BACKEND=$(get_backend)
            case "$CURRENT_BACKEND" in
                kilo)
                    ROUTINE_MODEL="openrouter/minimax/minimax-m2.5"
                    PLANNING_MODEL="openrouter/z-ai/glm-5"
                    FALLBACK_MODEL="openrouter/z-ai/glm-4.7-flash"
                    ;;
                gemini|*)
                    ROUTINE_MODEL="gemini-2.5-flash"
                    PLANNING_MODEL="gemini-2.5-flash"  # Flash for testing speed
                    FALLBACK_MODEL="gemini-2.5-pro"  # Pro 3 → Pro 2.5 fallback
                    ;;
            esac

            # --- Kilo session lifecycle: load existing session ---
            KILO_SESSION_ID=""
            KILO_AGENT=""
            if [ "$CURRENT_BACKEND" = "kilo" ]; then
                # /startup always starts a fresh session — clear any stale ID
                if [ "$IS_NEW_SESSION" = true ]; then
                    jq '.kiloSessionId = null | .kiloSessionStartedAt = null' "$STATE_FILE" > "${STATE_FILE}.tmp" 2>/dev/null && mv "${STATE_FILE}.tmp" "$STATE_FILE"
                    echo "🔄 Kilo session cleared for fresh start" >&2
                else
                    # Resume existing session if available
                    KILO_SESSION_ID=$(jq -r '.kiloSessionId // empty' "$STATE_FILE" 2>/dev/null || echo "")
                    if [ -n "$KILO_SESSION_ID" ]; then
                        echo "🔗 Resuming Kilo session: ${KILO_SESSION_ID:0:20}..." >&2
                    fi
                fi

                # --- Agent-per-role routing (Kilo only) ---
                # Maps workflow commands to SOP agents (system prompt + permissions)
                case "$USER_MESSAGES" in
                    /startup*|/shutdown*)
                        KILO_AGENT="sop-coordinator"
                        jq '.lastCommand = "startup"' "$STATE_FILE" > "${STATE_FILE}.tmp" 2>/dev/null && mv "${STATE_FILE}.tmp" "$STATE_FILE"
                        ;;
                    /plan_feature*|/plan*)
                        KILO_AGENT="sop-planner"
                        jq '.lastCommand = "plan_feature"' "$STATE_FILE" > "${STATE_FILE}.tmp" 2>/dev/null && mv "${STATE_FILE}.tmp" "$STATE_FILE"
                        ;;
                    /pr_check*)
                        KILO_AGENT="sop-auditor"
                        jq '.lastCommand = "pr_check"' "$STATE_FILE" > "${STATE_FILE}.tmp" 2>/dev/null && mv "${STATE_FILE}.tmp" "$STATE_FILE"
                        ;;
                    /implement_task*)
                        KILO_AGENT="sop-developer"
                        jq '.lastCommand = "implement_task"' "$STATE_FILE" > "${STATE_FILE}.tmp" 2>/dev/null && mv "${STATE_FILE}.tmp" "$STATE_FILE"
                        ;;
                    *)
                        # Smart fallback: if last command was plan_feature and no spec exists yet,
                        # this is a clarification reply — keep routing to sop-planner
                        LAST_CMD=$(jq -r '.lastCommand // empty' "$STATE_FILE" 2>/dev/null || echo "")
                        HAS_SPEC=$(jq -r '.executionPlan.specRef // empty' "$STATE_FILE" 2>/dev/null || echo "")
                        if [ "$LAST_CMD" = "plan_feature" ] && [ -z "$HAS_SPEC" ]; then
                            KILO_AGENT="sop-planner"
                            echo "🧠 Planning clarification — routing to sop-planner" >&2
                        else
                            KILO_AGENT="sop-developer"
                        fi
                        ;;
                esac
                echo "🎭 Kilo agent: $KILO_AGENT" >&2
            fi
            case "$USER_MESSAGES" in
                /startup*|/shutdown*)
                    ACTIVE_MODEL="$ROUTINE_MODEL"
                    echo "⚡ Using $ROUTINE_MODEL for routine workflow" >&2
                    ;;
                /plan_feature*|/plan*)
                    ACTIVE_MODEL="$PLANNING_MODEL"
                    echo "🧠 Using $PLANNING_MODEL for planning workflow" >&2
                    ;;
                *)
                    if [ "$IS_DIAGNOSIS" = true ]; then
                        ACTIVE_MODEL="$ROUTINE_MODEL"
                        echo "⚡ Using $ROUTINE_MODEL for diagnosis (fast + reliable)" >&2
                    elif [ "$IS_PLAN_FEATURE" = true ]; then
                        # Plan refinement: use user-selected model (they're actively iterating)
                        ACTIVE_MODEL="${SELECTED_MODEL:-$PLANNING_MODEL}"
                        echo "🧠 Using $ACTIVE_MODEL for plan refinement" >&2
                    else
                        ACTIVE_MODEL="${SELECTED_MODEL:-$DEFAULT_MODEL}"
                    fi
                    ;;
            esac

            # Mark messages as read
            jq '.messages[] |= (if .read == false then .read = true else . end)' "$INBOX" > "${INBOX}.tmp" && mv "${INBOX}.tmp" "$INBOX"

            echo "📬 $(date +%H:%M:%S) | $UNREAD_COUNT msg(s) → Launching in: $(basename "$ACTIVE_PROJECT")"
            MSG_PREVIEW=$(echo "$USER_MESSAGES" | head -1 | cut -c1-60)
            # Echo message preview (skip system/diagnosis prompts)
            if ! echo "$USER_MESSAGES" | head -1 | grep -q "^You are a"; then
                write_to_outbox "📥 Message received: $MSG_PREVIEW"
            fi
            echo "$$" > "$LOCK_FILE"

            (
                cd "$ACTIVE_PROJECT"
                export HOOK_BRIDGE_DIR="$CENTRAL_PROJECT_DIR"

                ORIGINAL_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
                ACTIVE_BRANCH="telegram/active"

                if git rev-parse --git-dir >/dev/null 2>&1; then
                    # Always start from main for branch operations
                    git checkout -f main 2>/dev/null || true

                    BRANCH_EXISTS=$(git branch --list "$ACTIVE_BRANCH" 2>/dev/null | wc -l | tr -d ' ')

                    if [ "$IS_NEW_SESSION" = true ] && [ "$BRANCH_EXISTS" -gt 0 ]; then
                        # Preserve old session branch with timestamp
                        SESSION_NAME="telegram/session-$(date +%Y%m%d-%H%M%S)"
                        git branch -m "$ACTIVE_BRANCH" "$SESSION_NAME" 2>/dev/null || true
                        echo "📌 Saved previous session → $SESSION_NAME" >&2
                        BRANCH_EXISTS=0
                    fi

                    if [ "$BRANCH_EXISTS" -gt 0 ]; then
                        # Continue on existing branch
                        git checkout -f "$ACTIVE_BRANCH" 2>/dev/null || true
                        echo "🔄 Continuing on branch: $ACTIVE_BRANCH" >&2
                    else
                        # Delete any remnant of old branch (in case rename failed)
                        git branch -D "$ACTIVE_BRANCH" 2>/dev/null || true
                        # Create fresh branch from main (already on main)
                        git checkout -b "$ACTIVE_BRANCH" 2>/dev/null || true
                        echo "🌿 Created branch: $ACTIVE_BRANCH (from main)" >&2
                        # Clear session history for new branch
                        rm -f "$ACTIVE_PROJECT/.gemini/session_history.txt"
                        # Write plan mode marker for /plan_feature runs
                        if [ "$IS_PLAN_FEATURE" = true ]; then
                            echo "plan_feature" > "$PLAN_MODE_FILE"
                            # Clear stale dispatch + execution plan from previous sessions
                            rm -f "$DOT_GEMINI/wa_dispatch.json" "$DOT_GEMINI/wa_dispatch_continue.json"
                            python3 -c "import json; f='$ACTIVE_PROJECT/.gemini/state.json'; s=json.load(open(f)); s.pop('executionPlan',None); json.dump(s,open(f,'w'),indent=2)" 2>/dev/null || true
                            echo "🔒 Plan mode marker set (stale dispatch cleared)" >&2
                        fi
                    fi
                fi

                # Append user message to session history file
                SESSION_HISTORY="$ACTIVE_PROJECT/.gemini/session_history.txt"
                echo "[$(date +%H:%M)] USER: $USER_MESSAGES" >> "$SESSION_HISTORY"
                echo "---" >> "$SESSION_HISTORY"

                # --- Workflow command detection ---
                WORKFLOWS_DIR="$HOME/.gemini/antigravity/global_workflows"
                WORKFLOW_CMD=$(echo "$USER_MESSAGES" | head -1 | grep -oE '^/[a-z_-]+' | sed 's|^/||')
                WORKFLOW_FILE="$WORKFLOWS_DIR/${WORKFLOW_CMD}.md"
                WORKFLOW_CONTENT=""

                if [ -n "$WORKFLOW_CMD" ] && [ "$WORKFLOW_CMD" != "new" ] && [ -f "$WORKFLOW_FILE" ]; then
                    # Strip YAML frontmatter (--- ... ---) and read workflow
                    WORKFLOW_CONTENT=$(awk 'BEGIN{skip=0} /^---$/{skip++; next} skip<2{next} {print}' "$WORKFLOW_FILE")
                    # Extract extra args after the command (e.g., "/startup quick" → "quick")
                    EXTRA_ARGS=$(echo "$USER_MESSAGES" | head -1 | sed "s|^/${WORKFLOW_CMD}[[:space:]]*||")
                    echo "⚡ Workflow detected: /$WORKFLOW_CMD" >&2
                    write_to_outbox "⚡ Running workflow: /$WORKFLOW_CMD"

                    ARGS_SECTION=""
                    if [ -n "$EXTRA_ARGS" ]; then
                        ARGS_SECTION="
User specified: $EXTRA_ARGS"
                    fi

                    TELEGRAM_PROMPT="⚡ Execute this workflow:
$WORKFLOW_CONTENT
$ARGS_SECTION
---"
                    # Backend-specific context instructions
                    if [ "$CURRENT_BACKEND" != "kilo" ] || [ -z "${KILO_SESSION_ID:-}${KILO_AGENT:-}" ]; then
                        # Gemini or non-session Kilo: inject session_history and reply file instructions
                        TELEGRAM_PROMPT="$TELEGRAM_PROMPT
Conversation history for this session is in: .gemini/session_history.txt
Read it first for context on what has been discussed so far.
---"
                    fi
                    TELEGRAM_PROMPT="$TELEGRAM_PROMPT
You have FULL tool access: use your available file, shell, and search tools directly.
Do NOT say tools are unavailable — they ARE available. Use them directly.
CRITICAL RULES:
- NEVER delete, rename, or move any files unless the user explicitly asked you to.
- For ANY research task, ALWAYS use web search to get current data. Never rely solely on training data.
- Follow instructions LITERALLY. If the workflow says 'plan' or 'spec', produce ONLY the document — do NOT implement.
Execute the workflow above step by step."
                    if [ "$CURRENT_BACKEND" = "kilo" ] && [ -n "${KILO_SESSION_ID:-}${KILO_AGENT:-}" ]; then
                        TELEGRAM_PROMPT="$TELEGRAM_PROMPT
OUTPUT FORMAT (critical — your reply goes directly to the user's phone via Telegram):
- Plain text only — NO markdown headers (##), NO bold (**text**), NO code blocks
- Use emoji for structure: 📊 for status, ✅ for done, ⚡ for active, 🎯 for next
- Use bullet points (•) for lists
- Be concise — phone screens are small"
                    else
                        TELEGRAM_PROMPT="$TELEGRAM_PROMPT
When done, write a short Telegram-friendly reply to the file: .gemini/telegram_reply.txt
Rules for the reply file:
- Use plain text with emoji for structure
- Use bullet points (•) for lists
- No markdown headers or code blocks
- Be concise but complete — include all important information
- This file gets sent directly to the user's phone"
                    fi
                else
                    # Normal message (no workflow)
                    PLAN_GUARD=""
                    if [ "$IS_PLAN_FEATURE" = true ]; then
                        # Find the active spec file for context
                        ACTIVE_SPEC=$(python3 -c "import json; s=json.load(open('$STATE_FILE')); print(s.get('executionPlan',{}).get('specRef',''))" 2>/dev/null || echo "")
                        [ -z "$ACTIVE_SPEC" ] && ACTIVE_SPEC=$(cd "$ACTIVE_PROJECT" && find docs/specs -name "*.md" -not -name "_*" -type f 2>/dev/null | sort -t/ -k3 | tail -1)
                        SPEC_HINT=""
                        [ -n "$ACTIVE_SPEC" ] && SPEC_HINT="
- The ACTIVE spec file is: $ACTIVE_SPEC — this is the ONLY spec you should edit."
                        PLAN_GUARD="
⛔ CRITICAL: PLANNING MODE IS ACTIVE.
- You are refining an existing plan.${SPEC_HINT}
- Read the spec file, update it per the user's feedback below.
- You MUST NOT write any application code (.js, .py, .sh, etc). Only update specs, tasks, and documentation.
- Do NOT touch any other spec files — only the active spec listed above.
- After updating the spec, write a short summary of changes to .gemini/telegram_reply.txt
- If the user says 'looks good' or similar approval, just acknowledge — do NOT implement anything.
"
                    fi
                    TELEGRAM_PROMPT="📱 Telegram message from the user:
$USER_MESSAGES
---"
                    # Backend-specific context instructions
                    if [ "$CURRENT_BACKEND" != "kilo" ] || [ -z "${KILO_SESSION_ID:-}${KILO_AGENT:-}" ]; then
                        TELEGRAM_PROMPT="$TELEGRAM_PROMPT
Conversation history for this session is in: .gemini/session_history.txt
Read it first for context on what has been discussed so far.
---"
                    fi
                    TELEGRAM_PROMPT="$TELEGRAM_PROMPT
${PLAN_GUARD}
You have FULL tool access: use your available file, shell, and search tools directly.
Do NOT say tools are unavailable — they ARE available. Use them directly.
CRITICAL RULES:
- NEVER delete, rename, or move any files unless the user explicitly asked you to.
- For ANY research task, ALWAYS use web search to get current data. Never rely solely on training data.
- Follow the user's request EXACTLY as stated. If they ask for a spec, plan, or analysis, produce ONLY that document — do NOT implement or write code.
- Only write code if the user explicitly asks you to implement, build, or code something."
                    if [ "$CURRENT_BACKEND" = "kilo" ] && [ -n "${KILO_SESSION_ID:-}${KILO_AGENT:-}" ]; then
                        TELEGRAM_PROMPT="$TELEGRAM_PROMPT
OUTPUT FORMAT (critical — your reply goes directly to the user's phone via Telegram):
- Plain text only — NO markdown headers (##), NO bold (**text**), NO code blocks
- Use emoji for structure: 📊 for status, ✅ for done, ⚡ for active, 🎯 for next
- Use bullet points (•) for lists
- Be concise — phone screens are small"
                    else
                        TELEGRAM_PROMPT="$TELEGRAM_PROMPT
When done, write a short Telegram-friendly reply to the file: .gemini/telegram_reply.txt
Rules for the reply file:
- Use plain text with emoji for structure
- Use bullet points (•) for lists
- No markdown headers or code blocks
- Be concise but complete — include all important information
- This file gets sent directly to the user's phone"
                    fi
                fi

                # Create timestamp marker for spec file detection
                # (must be before run_agent so spec files created during session are newer)
                touch "$DOT_GEMINI/.wa_session_start"

                # Run agent via backend abstraction
                # Kilo session env vars are set by lifecycle block above (line ~340)
                # For Gemini, KILO_SESSION_ID and KILO_AGENT are empty (no-op in run_agent)
                export KILO_SESSION_ID KILO_AGENT
                run_agent "$TELEGRAM_PROMPT" "$ACTIVE_MODEL" "$ACTIVE_PROJECT"

                # --- Kilo session lifecycle: store session ID ---
                if [ "$CURRENT_BACKEND" = "kilo" ] && [ -n "$KILO_SESSION_ID_OUT" ]; then
                    jq --arg sid "$KILO_SESSION_ID_OUT" --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
                        '.kiloSessionId = $sid | .kiloSessionStartedAt = (if .kiloSessionStartedAt then .kiloSessionStartedAt else $ts end)' \
                        "$STATE_FILE" > "${STATE_FILE}.tmp" 2>/dev/null && mv "${STATE_FILE}.tmp" "$STATE_FILE"
                    # Update env var for fallback retry (if needed)
                    KILO_SESSION_ID="$KILO_SESSION_ID_OUT"
                    echo "📌 Kilo session stored: ${KILO_SESSION_ID_OUT:0:20}..." >&2
                fi

                # Detect rate limit / quota errors
                RATE_LIMITED=false
                if [ "${AGENT_EXIT_CODE:-0}" -ne 0 ] && echo "$AGENT_STDERR_CONTENT" | grep -qiE '429|rate.limit|quota|resource.exhausted|too.many.requests'; then
                    RATE_LIMITED=true
                    write_to_outbox "⚠️ Rate limit hit on $ACTIVE_MODEL."
                    echo "⚠️  Rate limit detected for $ACTIVE_MODEL" >&2
                fi

                # --- Kilo session-aware error recovery (WO-SES-4) ---
                SESSION_RECOVERED=false
                if [ "$CURRENT_BACKEND" = "kilo" ] && [ "${AGENT_EXIT_CODE:-0}" -ne 0 ] && [ -n "${KILO_SESSION_ID:-}" ]; then
                    # Check if session is expired/invalid (not a rate limit)
                    if [ "$RATE_LIMITED" = false ]; then
                        write_to_outbox "⚠️ Session expired or invalid. Starting fresh session..."
                        echo "⚠️  Kilo session expired — clearing and retrying" >&2
                        # Clear stale session
                        KILO_SESSION_ID=""
                        export KILO_SESSION_ID
                        jq '.kiloSessionId = null | .kiloSessionStartedAt = null' "$STATE_FILE" > "${STATE_FILE}.tmp" 2>/dev/null && mv "${STATE_FILE}.tmp" "$STATE_FILE"
                        # Retry with fresh session
                        run_agent "$TELEGRAM_PROMPT" "$ACTIVE_MODEL" "$ACTIVE_PROJECT"
                        SESSION_RECOVERED=true
                        # Store new session if recovery succeeded
                        if [ -n "$KILO_SESSION_ID_OUT" ]; then
                            jq --arg sid "$KILO_SESSION_ID_OUT" --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
                                '.kiloSessionId = $sid | .kiloSessionStartedAt = $ts' \
                                "$STATE_FILE" > "${STATE_FILE}.tmp" 2>/dev/null && mv "${STATE_FILE}.tmp" "$STATE_FILE"
                            KILO_SESSION_ID="$KILO_SESSION_ID_OUT"
                            write_to_outbox "✅ New session created after recovery."
                        fi
                    fi
                fi

                # Fallback retry: if rate limited + no output, retry with fallback model
                if [ "$RATE_LIMITED" = true ] && [ -z "$AGENT_OUTPUT" ] && [ "$ACTIVE_MODEL" != "$FALLBACK_MODEL" ] && [ "$ACTIVE_MODEL" != "$ROUTINE_MODEL" ]; then
                    write_to_outbox "🔄 Retrying with $FALLBACK_MODEL..."
                    echo "🔄 Falling back to $FALLBACK_MODEL" >&2
                    ACTIVE_MODEL="$FALLBACK_MODEL"
                    # Keep session alive during rate limit fallback
                    run_agent "$TELEGRAM_PROMPT" "$FALLBACK_MODEL" "$ACTIVE_PROJECT"
                    if echo "$AGENT_STDERR_CONTENT" | grep -qiE '429|rate.limit|quota|resource.exhausted'; then
                        write_to_outbox "❌ $FALLBACK_MODEL also rate limited. Try again later."
                        echo "❌ Fallback also rate limited" >&2
                    else
                        write_to_outbox "✅ $FALLBACK_MODEL succeeded."
                    fi
                fi

                # Save diagnosis output to file for auto-fix trigger
                if [ "$IS_DIAGNOSIS" = true ] && [ -n "$AGENT_OUTPUT" ]; then
                    echo "$AGENT_OUTPUT" > "$DOT_GEMINI/diagnosis_output.txt"
                    echo "📋 $(date +%H:%M:%S) | Diagnosis output saved to diagnosis_output.txt"
                fi

                # Read Telegram reply — Kilo uses JSON response, Gemini uses reply file
                REPLY_FILE="$ACTIVE_PROJECT/.gemini/telegram_reply.txt"
                TELEGRAM_RESPONSE=""
                if [ "$CURRENT_BACKEND" = "kilo" ] && [ -n "$KILO_RESPONSE_TEXT" ]; then
                    # Kilo session mode: use parsed JSON text directly
                    TELEGRAM_RESPONSE="$KILO_RESPONSE_TEXT"
                elif [ -f "$REPLY_FILE" ]; then
                    TELEGRAM_RESPONSE=$(cat "$REPLY_FILE")
                    rm -f "$REPLY_FILE"
                fi
                if [ -z "$TELEGRAM_RESPONSE" ]; then
                    TELEGRAM_RESPONSE=$(echo "$AGENT_OUTPUT" | tail -c 500)
                fi

                # If still empty, report error
                if [ -z "$TELEGRAM_RESPONSE" ] || [ ${#TELEGRAM_RESPONSE} -lt 5 ]; then
                    BACKEND_LABEL=$(get_backend)
                    TELEGRAM_RESPONSE="⚠️ $BACKEND_LABEL CLI produced no output.\nModel: $ACTIVE_MODEL\nCheck rate limits or try /model to switch."
                    echo "⚠️  Empty output from agent CLI ($ACTIVE_MODEL)" >&2
                fi

                # Append agent reply to session history
                echo "[$(date +%H:%M)] AGENT: $TELEGRAM_RESPONSE" >> "$SESSION_HISTORY"
                echo "---" >> "$SESSION_HISTORY"

                # Commit changes on branch
                if git rev-parse --git-dir >/dev/null 2>&1; then
                    if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
                        # Exclude runtime files from commit
                        git reset HEAD -- .gemini/wa_session.lock 2>/dev/null || true
                        git checkout -- .gemini/wa_session.lock 2>/dev/null || true

                        # Plan mode enforcement: revert any code file changes
                        if [ "$IS_PLAN_FEATURE" = true ]; then
                            CODE_FILES=$(git diff --name-only --cached -- '*.js' '*.mjs' '*.cjs' '*.jsx' '*.py' '*.sh' '*.ts' '*.tsx' '*.css' '*.html' 2>/dev/null)
                            UNSTAGED_CODE=$(git diff --name-only -- '*.js' '*.mjs' '*.cjs' '*.jsx' '*.py' '*.sh' '*.ts' '*.tsx' '*.css' '*.html' 2>/dev/null)
                            ALL_CODE="$CODE_FILES$UNSTAGED_CODE"
                            if [ -n "$ALL_CODE" ]; then
                                echo "🔒 Plan mode: reverting code file changes:" >&2
                                echo "$ALL_CODE" | sort -u | while read -r f; do
                                    git checkout HEAD -- "$f" 2>/dev/null || true
                                    echo "   ↩️  $f" >&2
                                done
                                write_to_outbox "🔒 Plan mode: code changes blocked (spec-only mode)"
                            fi
                        fi

                        git add -A 2>/dev/null
                        git reset HEAD -- .gemini/wa_session.lock 2>/dev/null || true
                        git commit -m "telegram: session $(date +%Y%m%d-%H%M%S)" 2>/dev/null || true
                        echo "💾 Changes committed on: $ACTIVE_BRANCH" >&2
                        write_to_outbox "💾 Changes committed"
                    else
                        echo "📭 No changes made" >&2
                    fi

                    # /plan_feature: send spec file + auto-load execution plan
                    if [ "$IS_PLAN_FEATURE" = true ]; then
                        # Find the newest spec file created during this session
                        SPEC_MARKER="$DOT_GEMINI/.wa_session_start"
                        SPEC_FILE=$(cd "$ACTIVE_PROJECT" && find docs/specs -name "*.md" -not -name "_*" -newer "$SPEC_MARKER" 2>/dev/null | head -1)
                        rm -f "$SPEC_MARKER"
                        if [ -n "$SPEC_FILE" ]; then
                            # Copy as .txt for Telegram readability (.md not rendered in Telegram)
                            SPEC_BASENAME=$(basename "$SPEC_FILE" .md)
                            SPEC_TXT="/tmp/${SPEC_BASENAME}.txt"
                            cp "$ACTIVE_PROJECT/$SPEC_FILE" "$SPEC_TXT"
                            write_to_outbox_file "$SPEC_TXT" "📎 Plan spec — review and reply with feedback, or /review_plan to approve"
                            echo "📎 Spec file queued: $SPEC_FILE" >&2
                            SPEC_QUEUED=true
                        else
                            echo "⚠️  No spec file found after plan_feature run" >&2
                            SPEC_QUEUED=false
                        fi

                        # Auto-load execution plan from antigravity_tasks.md
                        # Always reload on initial /plan_feature, skip only on refinements if plan exists
                        TASKS_FILE="$ACTIVE_PROJECT/antigravity_tasks.md"
                        IS_INITIAL_PLAN=$(echo "$USER_MESSAGES" | grep -qi "^/plan_feature\|^/plan " && echo "yes" || echo "no")
                        PLAN_EXISTS=$(python3 -c "import json; s=json.load(open('$STATE_FILE')); print('yes' if s.get('executionPlan',{}).get('status') else 'no')" 2>/dev/null || echo "no")
                        if [ -f "$TASKS_FILE" ] && [ -n "$SPEC_FILE" ] && { [ "$IS_INITIAL_PLAN" = "yes" ] || [ "$PLAN_EXISTS" = "no" ]; }; then
                            python3 -c "
import json, re, sys

tasks_path = sys.argv[1]
state_path = sys.argv[2]
spec_ref = sys.argv[3]

# Read current backend from state (create if missing)
import os
os.makedirs(os.path.dirname(state_path), exist_ok=True)
if not os.path.exists(state_path):
    with open(state_path, 'w') as f:
        json.dump({}, f)
with open(state_path) as f:
    cur_state = json.load(f)
backend = cur_state.get('backend', 'gemini')

# Backend-aware tier defaults
TIER_MAP = {
    'gemini': {'top': ('gemini', 'gemini-2.5-pro'), 'mid': ('gemini', 'gemini-2.5-flash'), 'free': ('gemini', 'gemini-2.0-flash-lite')},
    'kilo':   {'top': ('kilo', 'openrouter/z-ai/glm-5'), 'mid': ('kilo', 'openrouter/minimax/minimax-m2.5'), 'free': ('kilo', 'openrouter/z-ai/glm-4.7-flash')}
}
tier_defaults = TIER_MAP.get(backend, TIER_MAP['gemini'])

# Read tasks file and find To Do items matching this spec
with open(tasks_path) as f:
    content = f.read()

# Parse To Do items with the spec ref (flexible: matches full path or just basename)
# Handles both: [Cat] [Topic] desc  AND  [Cat] TASK-ID: desc
spec_basename = os.path.basename(spec_ref)
pattern = r'- \[[ ]\] \[([^\]]+)\] (.+?) \[Ref: [^\]]*' + re.escape(spec_basename) + r'[^\]]*\] \[Difficulty: (\d+)(?:/\d+)?\]'
matches = re.findall(pattern, content)

# Also pick up trivial tasks with [Ref: n/a...] — agent skips spec for trivial work
if not matches or spec_ref in ('n/a', ''):
    na_pattern = r'- \[[ ]\] \[([^\]]+)\] (.+?) \[Ref: n/a[^\]]*\] \[Difficulty: (\d+)(?:/\d+)?\]'
    na_matches = re.findall(na_pattern, content)
    if na_matches:
        matches = na_matches
        spec_ref = 'n/a'

if not matches:
    sys.exit(0)

tasks = []
for i, (cat, desc, diff) in enumerate(matches, 1):
    tier = 'mid' if int(diff) <= 5 else 'top'
    plat, model = tier_defaults.get(tier, tier_defaults['mid'])
    tasks.append({
        'id': i,
        'description': desc.strip(),
        'summary': f'{cat}',
        'difficulty': int(diff),
        'tier': tier,
        'platform': plat,
        'model': model,
        'parallel': False,
        'deps': list(range(1, i)) if i > 1 else [],
        'status': 'pending'
    })

# Load state and write execution plan
if not os.path.exists(state_path):
    state = {}
else:
    with open(state_path) as f:
        state = json.load(f)

state['executionPlan'] = {
    'status': 'pending_review',
    'specRef': spec_ref,
    'tasks': tasks
}

with open(state_path, 'w') as f:
    json.dump(state, f, indent=2)

print(f'Loaded {len(tasks)} tasks into execution plan')
" "$TASKS_FILE" "$STATE_FILE" "$SPEC_FILE" 2>&1 || true
                            echo "📋 Execution plan auto-loaded into state.json" >&2
                            # Exit planning mode — spec created, future messages go to sop-developer
                            jq '.lastCommand = "plan_complete"' "$STATE_FILE" > "${STATE_FILE}.tmp" 2>/dev/null && mv "${STATE_FILE}.tmp" "$STATE_FILE"
                        fi
                    fi

                    # /shutdown → switch to main, keep branch for review/merge
                    # Otherwise: STAY on telegram/active for next session
                    if [ "$IS_SHUTDOWN" = true ]; then
                        git checkout -f main 2>/dev/null || true
                        echo "🏁 Session closed — branch '$ACTIVE_BRANCH' ready for review" >&2
                        write_to_outbox "🏁 Session closed — branch ready for review"
                        # Clear Kilo session on shutdown
                        if [ "$CURRENT_BACKEND" = "kilo" ]; then
                            jq '.kiloSessionId = null | .kiloSessionStartedAt = null' "$STATE_FILE" > "${STATE_FILE}.tmp" 2>/dev/null && mv "${STATE_FILE}.tmp" "$STATE_FILE"
                            echo "🔒 Kilo session cleared on shutdown" >&2
                        fi
                    fi
                fi

                # Pass response to parent shell
                echo "$TELEGRAM_RESPONSE" > "$DOT_GEMINI/.wa_last_response"
                # Mark plan_feature runs so parent skips raw relay — ONLY if spec was actually queued
                if [ "$IS_PLAN_FEATURE" = true ] && [ "${SPEC_QUEUED:-false}" = true ]; then
                    touch "$DOT_GEMINI/.wa_plan_feature_run"
                fi
            ) || true

            # Write response to outbox (skip for plan_feature — spec file + auto-trigger handle it)
            if [ -f "$DOT_GEMINI/.wa_plan_feature_run" ]; then
                rm -f "$DOT_GEMINI/.wa_plan_feature_run" "$DOT_GEMINI/.wa_last_response"
                echo "📋 Plan feature output handled via spec file + auto-trigger" >&2
            elif [ -f "$DOT_GEMINI/.wa_last_response" ]; then
                LAST_RESPONSE=$(cat "$DOT_GEMINI/.wa_last_response")
                if [ -n "$LAST_RESPONSE" ]; then
                    write_to_outbox "$LAST_RESPONSE"
                fi
                rm -f "$DOT_GEMINI/.wa_last_response"
            fi

            rm -f "$LOCK_FILE"
            echo "✅ $(date +%H:%M:%S) | Session complete — cooling down ${COOLDOWN}s"
            sleep "$COOLDOWN"
        fi
    fi

    # =========================================================================
    # DISPATCH EXECUTION — Run approved tasks from wa_dispatch.json
    # =========================================================================
    DISPATCH_FILE="$DOT_GEMINI/wa_dispatch.json"
    CONTINUE_FILE="$DOT_GEMINI/wa_dispatch_continue.json"

    if [ -f "$DISPATCH_FILE" ] && [ ! -f "$LOCK_FILE" ] && command -v jq &>/dev/null; then
        # Block dispatch when plan mode is active — UNLESS dispatch was explicitly approved via /review_plan
        if [ -f "$PLAN_MODE_FILE" ]; then
            DISPATCH_STATUS_CHECK=$(jq -r '.status // empty' "$DISPATCH_FILE" 2>/dev/null || echo "")
            if [ "$DISPATCH_STATUS_CHECK" = "approved" ]; then
                # Approval received — clear plan mode so execution can proceed
                rm -f "$PLAN_MODE_FILE"
                echo "🔓 Plan mode cleared — dispatch approved, starting execution" >&2
            else
                : # Skip dispatch — plan mode active, waiting for approval
            fi
        fi
        if [ ! -f "$PLAN_MODE_FILE" ]; then
        DISPATCH_STATUS=$(jq -r '.status // empty' "$DISPATCH_FILE" 2>/dev/null || echo "")

        if [ "$DISPATCH_STATUS" = "approved" ]; then
            # Get total task count and find next pending task
            TASK_COUNT=$(jq '.tasks | length' "$DISPATCH_FILE" 2>/dev/null || echo "0")
            NEXT_TASK_JSON=$(jq -r '[.tasks[] | select(.taskStatus == "pending" or .taskStatus == null)] | first // empty' "$DISPATCH_FILE" 2>/dev/null || echo "")

            if [ -n "$NEXT_TASK_JSON" ] && [ "$NEXT_TASK_JSON" != "null" ]; then
                TASK_ID=$(echo "$NEXT_TASK_JSON" | jq -r '.id')
                TASK_DESC=$(echo "$NEXT_TASK_JSON" | jq -r '.description')
                TASK_MODEL=$(echo "$NEXT_TASK_JSON" | jq -r '.model // "gemini-2.5-flash"')
                TASK_SUMMARY=$(echo "$NEXT_TASK_JSON" | jq -r '.summary // empty')
                TASK_DEPS=$(echo "$NEXT_TASK_JSON" | jq -r '[.deps[]?] | join(", ")')

                # Check if dependencies are complete
                DEPS_MET=true
                if [ -n "$TASK_DEPS" ]; then
                    for DEP_ID in $(echo "$NEXT_TASK_JSON" | jq -r '.deps[]?' 2>/dev/null); do
                        DEP_STATUS=$(jq -r --argjson id "$DEP_ID" '.tasks[] | select(.id == $id) | .taskStatus // "pending"' "$DISPATCH_FILE" 2>/dev/null || echo "pending")
                        if [ "$DEP_STATUS" != "done" ]; then
                            DEPS_MET=false
                            break
                        fi
                    done
                fi

                if [ "$DEPS_MET" = false ]; then
                    echo "⏳ Task $TASK_ID waiting on deps: $TASK_DEPS" >&2
                else
                    # Lock + mark task as running
                    echo $$ > "$LOCK_FILE"
                    jq --argjson id "$TASK_ID" '(.tasks[] | select(.id == $id)).taskStatus = "running"' "$DISPATCH_FILE" > "${DISPATCH_FILE}.tmp" && mv "${DISPATCH_FILE}.tmp" "$DISPATCH_FILE"

                    COMPLETED_COUNT=$(jq '[.tasks[] | select(.taskStatus == "done")] | length' "$DISPATCH_FILE" 2>/dev/null || echo "0")
                    write_to_outbox "🔨 Task $TASK_ID/$TASK_COUNT: $TASK_DESC
⚙️ Model: $TASK_MODEL
📊 Progress: $COMPLETED_COUNT/$TASK_COUNT done"

                    echo "🔨 $(date +%H:%M:%S) | Dispatch: Task $TASK_ID — $TASK_DESC ($TASK_MODEL)" >&2

                    # Resolve active project
                    ACTIVE_PROJECT=$(jq -r '.activeProject // empty' "$STATE_FILE" 2>/dev/null || echo "$CENTRAL_PROJECT_DIR")
                    if [ -z "$ACTIVE_PROJECT" ] || [ ! -d "$ACTIVE_PROJECT" ]; then
                        ACTIVE_PROJECT="$CENTRAL_PROJECT_DIR"
                    fi

                    # Build the task prompt — inject spec ref and scope boundary
                    TASK_SPEC_REF=$(python3 -c "import json; s=json.load(open('$STATE_FILE')); print(s.get('executionPlan',{}).get('specRef',''))" 2>/dev/null || echo "")
                    TASK_SCOPE=$(python3 -c "
import re, sys
desc = sys.argv[1]
with open(sys.argv[2]) as f: content = f.read()
# Find the task line matching this description
escaped = re.escape(desc[:40])
block_match = re.search(r'- \[[ ]\].*?' + escaped + r'.*?\n((?:  - \*\*.*?\n)*)', content)
if block_match:
    block = block_match.group(1)
    scope = re.search(r'\*\*Scope Boundary:\*\*\s*(.+)', block)
    files = re.search(r'\*\*File\(s\):\*\*\s*(.+)', block)
    sig = re.search(r'\*\*Signature:\*\*\s*(.+)', block)
    if scope: print(f'SCOPE: {scope.group(1).strip()}')
    if files: print(f'FILES: {files.group(1).strip()}')
    if sig: print(f'SIGNATURE: {sig.group(1).strip()}')
" "$TASK_DESC" "$ACTIVE_PROJECT/antigravity_tasks.md" 2>/dev/null || echo "")

                    TASK_PROMPT="🔨 Execute this implementation task:

Task $TASK_ID: $TASK_DESC"
                    if [ -n "$TASK_SUMMARY" ] && [ "$TASK_SUMMARY" != "null" ]; then
                        TASK_PROMPT="$TASK_PROMPT
Context: $TASK_SUMMARY"
                    fi
                    if [ -n "$TASK_SPEC_REF" ]; then
                        TASK_PROMPT="$TASK_PROMPT
Spec: $TASK_SPEC_REF — read this file FIRST for detailed requirements, signatures, and acceptance criteria."
                    fi
                    if [ -n "$TASK_SCOPE" ]; then
                        TASK_PROMPT="$TASK_PROMPT
$TASK_SCOPE"
                    fi
                    TASK_PROMPT="$TASK_PROMPT

Instructions:
- This is a single atomic task — implement ONLY what is described above
- Do NOT implement other tasks or make unrelated changes
- Do NOT modify files outside the scope boundary listed above
- Run tests after implementation to verify
- Write a brief completion report — plain text with emoji, NO markdown headers or bold
  TO: .gemini/telegram_reply.txt
---
You have FULL tool access: use your available file, shell, and search tools directly.
Do NOT say tools are unavailable — they ARE available. Use them directly.
CRITICAL: Follow the task description EXACTLY. Implement only this specific task."

                    # Run agent via backend abstraction (--sandbox only for Gemini)
                    EXTRA_FLAGS=()
                    if [ "$(get_backend)" != "kilo" ]; then
                        EXTRA_FLAGS+=("--sandbox")
                    fi
                    # For Kilo: always use sop-developer for implementation dispatch
                    if [ "$(get_backend)" = "kilo" ]; then
                        KILO_AGENT="sop-developer"
                    fi
                    run_agent "$TASK_PROMPT" "$TASK_MODEL" "$ACTIVE_PROJECT" ${EXTRA_FLAGS[@]+"${EXTRA_FLAGS[@]}"}

                    # Check for errors
                    TASK_ERROR=""
                    if [ "${AGENT_EXIT_CODE:-0}" -ne 0 ] && echo "$AGENT_STDERR_CONTENT" | grep -qiE '429|rate.limit|quota|resource.exhausted|too.many.requests'; then
                        TASK_ERROR="Rate limit hit on $TASK_MODEL"
                    fi

                    # Read reply file
                    REPLY_FILE="$ACTIVE_PROJECT/.gemini/telegram_reply.txt"
                    TASK_REPORT=""
                    if [ -f "$REPLY_FILE" ]; then
                        TASK_REPORT=$(cat "$REPLY_FILE")
                        rm -f "$REPLY_FILE"
                    fi
                    if [ -z "$TASK_REPORT" ]; then
                        TASK_REPORT=$(echo "$AGENT_OUTPUT" | tail -c 500)
                    fi

                    # Mark task as done in dispatch
                    if [ -n "$TASK_ERROR" ]; then
                        jq --argjson id "$TASK_ID" --arg err "$TASK_ERROR" \
                            '(.tasks[] | select(.id == $id)).taskStatus = "error" | (.tasks[] | select(.id == $id)).error = $err' \
                            "$DISPATCH_FILE" > "${DISPATCH_FILE}.tmp" && mv "${DISPATCH_FILE}.tmp" "$DISPATCH_FILE"
                    else
                        jq --argjson id "$TASK_ID" \
                            '(.tasks[] | select(.id == $id)).taskStatus = "done"' \
                            "$DISPATCH_FILE" > "${DISPATCH_FILE}.tmp" && mv "${DISPATCH_FILE}.tmp" "$DISPATCH_FILE"
                    fi

                    # Also update state.json executionPlan
                    if [ -f "$STATE_FILE" ]; then
                        jq --argjson id "$TASK_ID" --arg status "$([ -n "$TASK_ERROR" ] && echo "error" || echo "done")" \
                            'if .executionPlan then (.executionPlan.tasks[] | select(.id == $id)).taskStatus = $status else . end' \
                            "$STATE_FILE" > "${STATE_FILE}.tmp" && mv "${STATE_FILE}.tmp" "$STATE_FILE"
                    fi

                    # Commit changes
                    (
                        cd "$ACTIVE_PROJECT" || exit 1
                        if git rev-parse --git-dir >/dev/null 2>&1; then
                            if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
                                git add -A 2>/dev/null
                                git commit -m "dispatch: task $TASK_ID — $TASK_DESC" 2>/dev/null || true
                                echo "💾 Task $TASK_ID committed" >&2
                            fi
                        fi
                    ) || true

                    # Check if all tasks are done
                    DONE_COUNT=$(jq '[.tasks[] | select(.taskStatus == "done")] | length' "$DISPATCH_FILE" 2>/dev/null || echo "0")
                    ERROR_COUNT=$(jq '[.tasks[] | select(.taskStatus == "error")] | length' "$DISPATCH_FILE" 2>/dev/null || echo "0")
                    REMAINING=$((TASK_COUNT - DONE_COUNT - ERROR_COUNT))

                    if [ "$REMAINING" -eq 0 ]; then
                        # All tasks complete!
                        jq '.status = "completed"' "$DISPATCH_FILE" > "${DISPATCH_FILE}.tmp" && mv "${DISPATCH_FILE}.tmp" "$DISPATCH_FILE"
                        if [ -f "$STATE_FILE" ]; then
                            jq 'if .executionPlan then .executionPlan.status = "completed" else . end' \
                                "$STATE_FILE" > "${STATE_FILE}.tmp" && mv "${STATE_FILE}.tmp" "$STATE_FILE"
                        fi

                        SUMMARY="✅ All $TASK_COUNT tasks complete!"
                        if [ "$ERROR_COUNT" -gt 0 ]; then
                            SUMMARY="⚠️ Dispatch finished: $DONE_COUNT done, $ERROR_COUNT errors"
                        fi
                        write_to_outbox "$SUMMARY

📋 Last task report:
$TASK_REPORT"
                        echo "✅ $(date +%H:%M:%S) | All dispatch tasks complete" >&2
                    else
                        # More tasks remain — send report and wait for continue signal
                        STATUS_LINE="✅ Task $TASK_ID done ($DONE_COUNT/$TASK_COUNT)"
                        if [ -n "$TASK_ERROR" ]; then
                            STATUS_LINE="❌ Task $TASK_ID error: $TASK_ERROR ($DONE_COUNT/$TASK_COUNT)"
                        fi

                        STEP_MARKUP='{"inline_keyboard":[[{"text":"▶️ Next Task","callback_data":"ep_continue"},{"text":"🛑 Stop","callback_data":"ep_stop"}]]}'
                        write_to_outbox_with_markup "$STATUS_LINE

📋 Report:
$TASK_REPORT" "$STEP_MARKUP"
                        echo "⏸️ $(date +%H:%M:%S) | Task $TASK_ID done, waiting for continue signal" >&2

                        # Wait for continue signal (bot writes wa_dispatch_continue.json)
                        while [ ! -f "$CONTINUE_FILE" ]; do
                            # Check if dispatch was stopped (status changed)
                            CURRENT_STATUS=$(jq -r '.status // empty' "$DISPATCH_FILE" 2>/dev/null || echo "")
                            if [ "$CURRENT_STATUS" = "stopped" ] || [ "$CURRENT_STATUS" = "completed" ]; then
                                echo "🛑 Dispatch stopped by user" >&2
                                break
                            fi
                            sleep "$POLL_INTERVAL"
                        done

                        # Consume continue signal
                        rm -f "$CONTINUE_FILE"
                    fi

                    rm -f "$LOCK_FILE"
                    echo "✅ $(date +%H:%M:%S) | Task $TASK_ID session complete" >&2
                fi
            fi
        fi
        fi # plan mode guard
    fi

    sleep "$POLL_INTERVAL"
done
