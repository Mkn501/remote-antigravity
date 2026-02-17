#!/usr/bin/env bash
# ============================================================================
# Inbox Watcher — Daemon that triggers Gemini CLI on new messages
# ============================================================================
# Features:
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

CENTRAL_PROJECT_DIR="${GEMINI_PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
DOT_GEMINI="$CENTRAL_PROJECT_DIR/.gemini"
INBOX="$DOT_GEMINI/wa_inbox.json"
OUTBOX="$DOT_GEMINI/wa_outbox.json"
STATE_FILE="$DOT_GEMINI/state.json"
LOCK_FILE="$DOT_GEMINI/wa_session.lock"

POLL_INTERVAL=3
COOLDOWN=10
DEFAULT_MODEL="gemini-3-pro-preview"  # CLI shorthand: gemini-3-pro

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

            # Tiered model routing: Flash for routine workflows, default for everything else
            ROUTINE_MODEL="gemini-2.5-flash"
            GEMINI_ARGS=()
            case "$USER_MESSAGES" in
                /startup*|/shutdown*)
                    ACTIVE_MODEL="$ROUTINE_MODEL"
                    echo "⚡ Using $ROUTINE_MODEL for routine workflow" >&2
                    ;;
                *)
                    ACTIVE_MODEL="${SELECTED_MODEL:-$DEFAULT_MODEL}"
                    ;;
            esac
            GEMINI_ARGS+=("--model" "$ACTIVE_MODEL")

            # Mark messages as read
            jq '.messages[] |= (if .read == false then .read = true else . end)' "$INBOX" > "${INBOX}.tmp" && mv "${INBOX}.tmp" "$INBOX"

            echo "📬 $(date +%H:%M:%S) | $UNREAD_COUNT msg(s) → Launching in: $(basename "$ACTIVE_PROJECT")"
            MSG_PREVIEW=$(echo "$USER_MESSAGES" | head -1 | cut -c1-60)
            write_to_outbox "📥 Message received: $MSG_PREVIEW"
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
---
Conversation history for this session is in: .gemini/session_history.txt
Read it first for context on what has been discussed so far.
---
You have FULL tool access: use write_file to create/edit files, run_shell_command for shell commands, read_file to read files.
Do NOT say tools are unavailable — they ARE available. Use them directly.
CRITICAL RULES:
- NEVER delete, rename, or move any files unless the user explicitly asked you to.
- For ANY research task, ALWAYS use web search (Google Search tool) to get current data. Never rely solely on training data.
- Follow instructions LITERALLY. If the workflow says 'plan' or 'spec', produce ONLY the document — do NOT implement.
Execute the workflow above step by step.
When done, write a short Telegram-friendly reply to the file: .gemini/telegram_reply.txt
Rules for the reply file:
- Use plain text with emoji for structure
- Use bullet points (•) for lists
- No markdown headers or code blocks
- Be concise but complete — include all important information
- This file gets sent directly to the user's phone"
                else
                    # Normal message (no workflow)
                    TELEGRAM_PROMPT="📱 Telegram message from the user:
$USER_MESSAGES
---
Conversation history for this session is in: .gemini/session_history.txt
Read it first for context on what has been discussed so far.
---
You have FULL tool access: use write_file to create/edit files, run_shell_command for shell commands, read_file to read files.
Do NOT say tools are unavailable — they ARE available. Use them directly.
CRITICAL RULES:
- NEVER delete, rename, or move any files unless the user explicitly asked you to.
- For ANY research task, ALWAYS use web search (Google Search tool) to get current data. Never rely solely on training data.
- Follow the user's request EXACTLY as stated. If they ask for a spec, plan, or analysis, produce ONLY that document — do NOT implement or write code.
- Only write code if the user explicitly asks you to implement, build, or code something.
When done, write a short Telegram-friendly reply to the file: .gemini/telegram_reply.txt
Rules for the reply file:
- Use plain text with emoji for structure
- Use bullet points (•) for lists
- No markdown headers or code blocks
- Be concise but complete — include all important information
- This file gets sent directly to the user's phone"
                fi

                # Finalize GEMINI_ARGS now that TELEGRAM_PROMPT is built
                GEMINI_ARGS+=("--yolo" "-p" "$TELEGRAM_PROMPT")

                # Temporarily disable hooks (Gemini CLI bug workaround)
                TARGET_SETTINGS="$ACTIVE_PROJECT/.gemini/settings.json"
                SETTINGS_BACKED_UP=false
                if [ -f "$TARGET_SETTINGS" ]; then
                    mv "$TARGET_SETTINGS" "${TARGET_SETTINGS}.watcher-bak"
                    SETTINGS_BACKED_UP=true
                fi

                write_to_outbox "🧠 Running Gemini CLI ($ACTIVE_MODEL)..."
                GEMINI_STDERR=$(mktemp)
                GEMINI_OUTPUT=$(gemini "${GEMINI_ARGS[@]}" 2> >(tee -a "$DOT_GEMINI/wa_session.log" > "$GEMINI_STDERR")) || true

                # Detect rate limit / quota errors
                STDERR_CONTENT=$(cat "$GEMINI_STDERR" 2>/dev/null || echo "")
                rm -f "$GEMINI_STDERR"
                if echo "$STDERR_CONTENT" | grep -qiE '429|rate.limit|quota|resource.exhausted|too.many.requests'; then
                    write_to_outbox "⚠️ Rate limit hit on $ACTIVE_MODEL. Try again in a few minutes or switch model with /model."
                    echo "⚠️  Rate limit detected for $ACTIVE_MODEL" >&2
                fi

                # Restore hooks immediately
                if [ "$SETTINGS_BACKED_UP" = true ] && [ -f "${TARGET_SETTINGS}.watcher-bak" ]; then
                    mv "${TARGET_SETTINGS}.watcher-bak" "$TARGET_SETTINGS"
                fi

                # Read Telegram reply from file (written by Gemini)
                REPLY_FILE="$ACTIVE_PROJECT/.gemini/telegram_reply.txt"
                TELEGRAM_RESPONSE=""
                if [ -f "$REPLY_FILE" ]; then
                    TELEGRAM_RESPONSE=$(cat "$REPLY_FILE")
                    rm -f "$REPLY_FILE"
                fi
                if [ -z "$TELEGRAM_RESPONSE" ]; then
                    TELEGRAM_RESPONSE=$(echo "$GEMINI_OUTPUT" | tail -c 500)
                fi

                # Append agent reply to session history
                echo "[$(date +%H:%M)] AGENT: $TELEGRAM_RESPONSE" >> "$SESSION_HISTORY"
                echo "---" >> "$SESSION_HISTORY"

                # Commit changes on branch
                if git rev-parse --git-dir >/dev/null 2>&1; then
                    if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
                        git add -A 2>/dev/null
                        git commit -m "telegram: session $(date +%Y%m%d-%H%M%S)" 2>/dev/null || true
                        echo "💾 Changes committed on: $ACTIVE_BRANCH" >&2
                        write_to_outbox "💾 Changes committed"
                    else
                        echo "📭 No changes made" >&2
                    fi

                    # /shutdown → switch to main, keep branch for review/merge
                    # Otherwise: STAY on telegram/active for next session
                    if [ "$IS_SHUTDOWN" = true ]; then
                        git checkout -f main 2>/dev/null || true
                        echo "🏁 Session closed — branch '$ACTIVE_BRANCH' ready for review" >&2
                        write_to_outbox "🏁 Session closed — branch ready for review"
                    fi
                fi

                # Pass response to parent shell
                echo "$TELEGRAM_RESPONSE" > "$DOT_GEMINI/.wa_last_response"
            ) || true

            # Write response to outbox
            if [ -f "$DOT_GEMINI/.wa_last_response" ]; then
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

    sleep "$POLL_INTERVAL"
done
