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
            if [ -n "$SELECTED_MODEL" ]; then
                MODEL_FLAG="--model $SELECTED_MODEL"
            fi

            # Extract unread message text BEFORE marking as read
            # (Since hooks are disabled, we inject messages directly into the prompt)
            USER_MESSAGES=$(jq -r '[.messages[] | select(.read == false) | .text] | join("\n")' "$INBOX" 2>/dev/null || echo "")

            # Check for /new command — archive current branch and start fresh
            IS_NEW_SESSION=false
            if echo "$USER_MESSAGES" | grep -qi "^/new"; then
                IS_NEW_SESSION=true
                # Strip the /new command from the message (keep any text after it)
                USER_MESSAGES=$(echo "$USER_MESSAGES" | sed 's|^/new[[:space:]]*||i')
            fi

            # Mark messages as read
            jq '.messages[] |= (if .read == false then .read = true else . end)' "$INBOX" > "${INBOX}.tmp" && mv "${INBOX}.tmp" "$INBOX"

            echo "📬 $(date +%H:%M:%S) | $UNREAD_COUNT msg(s) → Launching in: $(basename "$ACTIVE_PROJECT")"
            echo "$$" > "$LOCK_FILE"

            (
                cd "$ACTIVE_PROJECT"
                export HOOK_BRIDGE_DIR="$CENTRAL_PROJECT_DIR"

                ORIGINAL_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
                ACTIVE_BRANCH="telegram/active"

                if git rev-parse --git-dir >/dev/null 2>&1; then
                    BRANCH_EXISTS=$(git branch --list "$ACTIVE_BRANCH" 2>/dev/null | wc -l | tr -d ' ')

                    if [ "$IS_NEW_SESSION" = true ] && [ "$BRANCH_EXISTS" -gt 0 ]; then
                        # Archive the old branch with timestamp
                        ARCHIVE_NAME="telegram/archive-$(date +%Y%m%d-%H%M%S)"
                        git branch -m "$ACTIVE_BRANCH" "$ARCHIVE_NAME" 2>/dev/null || true
                        echo "📦 Archived branch → $ARCHIVE_NAME" >&2
                        BRANCH_EXISTS=0
                    fi

                    if [ "$BRANCH_EXISTS" -gt 0 ]; then
                        # Continue on existing branch
                        git checkout "$ACTIVE_BRANCH" 2>/dev/null || true
                        echo "🔄 Continuing on branch: $ACTIVE_BRANCH" >&2
                    else
                        # Create new branch from main
                        git checkout main 2>/dev/null || true
                        git checkout -b "$ACTIVE_BRANCH" 2>/dev/null || true
                        echo "🌿 Created branch: $ACTIVE_BRANCH (from main)" >&2
                    fi
                fi

                # Build conversation history from recent outbox messages
                HISTORY=""
                if [ -f "$OUTBOX" ]; then
                    HISTORY=$(jq -r '
                        [.messages[-5:][]] |
                        map("[\(.from)]: \(.text)") |
                        join("\n---\n")
                    ' "$OUTBOX" 2>/dev/null || echo "")
                fi

                HISTORY_SECTION=""
                if [ -n "$HISTORY" ]; then
                    HISTORY_SECTION="
📜 Recent conversation history:
$HISTORY
---"
                fi

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

                    ARGS_SECTION=""
                    if [ -n "$EXTRA_ARGS" ]; then
                        ARGS_SECTION="
User specified: $EXTRA_ARGS"
                    fi

                    TELEGRAM_PROMPT="⚡ Execute this workflow:
$WORKFLOW_CONTENT
$ARGS_SECTION
$HISTORY_SECTION
---
You have FULL tool access: use write_file to create/edit files, run_shell_command for shell commands, read_file to read files.
Do NOT say tools are unavailable — they ARE available. Use them directly.
Execute the workflow above step by step. Then write a Telegram-friendly summary.
Place this summary between the markers <<<TELEGRAM>>> and <<<END>>>.
Rules for the Telegram summary:
- Use plain text with emoji for structure
- Use bullet points (•) for lists
- No markdown headers or code blocks
- Be concise but complete — include all important information
- This is the ONLY part that gets sent to the user's phone"
                else
                    # Normal message (no workflow)
                    TELEGRAM_PROMPT="📱 Telegram message from the user:
$USER_MESSAGES
$HISTORY_SECTION
---
You have FULL tool access: use write_file to create/edit files, run_shell_command for shell commands, read_file to read files.
Do NOT say tools are unavailable — they ARE available. Use them directly.
Execute the user's request above. Then write a Telegram-friendly summary.
Place this summary between the markers <<<TELEGRAM>>> and <<<END>>>.
Rules for the Telegram summary:
- Use plain text with emoji for structure
- Use bullet points (•) for lists
- No markdown headers or code blocks
- Be concise but complete — include all important information
- This is the ONLY part that gets sent to the user's phone"
                fi

                # Temporarily disable hooks (Gemini CLI bug workaround)
                TARGET_SETTINGS="$ACTIVE_PROJECT/.gemini/settings.json"
                SETTINGS_BACKED_UP=false
                if [ -f "$TARGET_SETTINGS" ]; then
                    mv "$TARGET_SETTINGS" "${TARGET_SETTINGS}.watcher-bak"
                    SETTINGS_BACKED_UP=true
                fi

                GEMINI_OUTPUT=$(gemini $MODEL_FLAG --yolo -p "$TELEGRAM_PROMPT" 2>>"$DOT_GEMINI/wa_session.log") || true

                # Restore hooks immediately
                if [ "$SETTINGS_BACKED_UP" = true ] && [ -f "${TARGET_SETTINGS}.watcher-bak" ]; then
                    mv "${TARGET_SETTINGS}.watcher-bak" "$TARGET_SETTINGS"
                fi

                # Extract <<<TELEGRAM>>>...<<<END>>> response
                TELEGRAM_RESPONSE=""
                if echo "$GEMINI_OUTPUT" | grep -q "<<<TELEGRAM>>>"; then
                    TELEGRAM_RESPONSE=$(echo "$GEMINI_OUTPUT" | sed -n '/<<<TELEGRAM>>>/,/<<<END>>>/p' | grep -v '<<<TELEGRAM>>>' | grep -v '<<<END>>>')
                fi
                if [ -z "$TELEGRAM_RESPONSE" ]; then
                    TELEGRAM_RESPONSE=$(echo "$GEMINI_OUTPUT" | tail -c 1500)
                fi

                # Commit changes on branch
                if git rev-parse --git-dir >/dev/null 2>&1; then
                    if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
                        git add -A 2>/dev/null
                        git commit -m "telegram: session $(date +%Y%m%d-%H%M%S)" 2>/dev/null || true
                        echo "💾 Changes committed on: $ACTIVE_BRANCH" >&2
                    else
                        echo "📭 No changes made" >&2
                    fi
                    git checkout "$ORIGINAL_BRANCH" 2>/dev/null || true
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
