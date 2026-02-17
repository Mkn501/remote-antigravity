# Backend-Agnostic Watcher: Gemini CLI ↔ Kilo CLI

Make `watcher.sh` support both Gemini CLI and Kilo CLI as interchangeable backends, controlled via `state.json`. Claude Code is excluded (too expensive).

## User Review Required

> [!IMPORTANT]
> **Backend selection will be stored in `state.json`** alongside the existing `model` field. This means you can switch backends from Telegram via a new `/backend` command. Default remains `gemini`.

> [!WARNING]
> **Kilo CLI requires `npm install -g @kilocode/cli`** and API key configuration before it can be used. The bot will check for the binary and warn if not installed.

> [!NOTE]
> **Model format difference**: Gemini uses bare name (`gemini-2.5-flash`), Kilo uses `provider/model` format (`google/gemini-2.5-flash`). The `run_agent()` function must handle this mapping.

---

## Spike Results: Kilo CLI v1.0.21

✅ **Installed**: `/Users/mkn501/.nvm/versions/node/v22.14.0/bin/kilo` — v1.0.21

| Check | Result |
|---|---|
| `kilo run --auto "prompt"` | ✅ Confirmed — headless one-shot mode |
| `--model` flag | ✅ Uses `-m provider/model` format |
| `--agent` flag | ✅ Can specify agent type (build, plan) |
| `--format json` | ✅ Machine-readable output available |
| `--on-task-completed` | ✅ Post-task automation hook |
| stdout capture | ✅ Output goes to stdout (capturable) |
| `.kilo/` config needed | ⚠️ TBD during implementation — may need init |

---

## How Workflows Transfer Between Backends

### Why it "just works"

The watcher **does not** rely on the CLI agent "knowing" about workflows. It reads workflow files itself and stuffs the content into the prompt:

```bash
# watcher.sh reads the workflow file
WORKFLOW_CONTENT=$(cat "$WORKFLOWS_DIR/startup.md")

# Injects the ENTIRE text into the prompt
TELEGRAM_PROMPT="⚡ Execute this workflow:
$WORKFLOW_CONTENT
---
CRITICAL RULES: ..."

# Both backends receive the SAME prompt
gemini --yolo -p "$TELEGRAM_PROMPT"   # or:
kilo run --auto "$TELEGRAM_PROMPT"
```

The agent never "reads" workflow files — it just sees a text blob saying "do these steps." **Workflows, memory-bank, and the SOP all remain unchanged.**

### Tool Availability Gap

| Prompt instruction | Gemini CLI | Kilo CLI |
|---|---|---|
| "use web search" | ✅ `google_search` (built-in) | ⚠️ Needs MCP web search server |
| "use write_file" | ✅ Built-in | ✅ Built-in (same name) |
| "run shell command" | ✅ Built-in | ✅ Built-in (same name) |
| "read memory-bank/" | ✅ `read_file` | ✅ Built-in (same name) |

**Impact**: Research tasks via Kilo won't have web search unless an MCP server is configured. File/shell operations work identically.

### Optional: SOP Agent Roles (Future Enhancement)

The SOP defines 4 Kilo agent roles (Coordinator, Planner, Developer, Auditor). In VS Code, these are `.kilo/` config entries. For the headless watcher, the `--agent` flag could map to these:

```bash
kilo run --auto --agent "developer" "$TELEGRAM_PROMPT"
```

This is **not required** for the initial implementation — the watcher prompt already contains all necessary instructions inline. Agent roles can be added later for better context awareness.

---

## Proposed Changes

### Coupling Points Identified

| # | Gemini-Specific Code | Location | Change Required |
|---|---|---|---|
| 1 | `gemini "${GEMINI_ARGS[@]}"` binary call | [watcher.sh:229](file:///Users/mkn501/Library/CloudStorage/GoogleDrive-ngcapinv@gmail.com/Meine%20Ablage/remote%20antigravity/scripts/watcher.sh#L229) | Route to backend function |
| 2 | `--yolo -p` flags | [watcher.sh:218](file:///Users/mkn501/Library/CloudStorage/GoogleDrive-ngcapinv@gmail.com/Meine%20Ablage/remote%20antigravity/scripts/watcher.sh#L218) | Map to `--auto` for Kilo |
| 3 | `--model` flag format | [watcher.sh:82](file:///Users/mkn501/Library/CloudStorage/GoogleDrive-ngcapinv@gmail.com/Meine%20Ablage/remote%20antigravity/scripts/watcher.sh#L82) | Same for both (both support `--model`) |
| 4 | `settings.json` hook workaround | [watcher.sh:220-234](file:///Users/mkn501/Library/CloudStorage/GoogleDrive-ngcapinv@gmail.com/Meine%20Ablage/remote%20antigravity/scripts/watcher.sh#L220-L234) | **Skip for Kilo** (no hooks bug) |
| 5 | `Google Search tool` in prompt | [watcher.sh:205](file:///Users/mkn501/Library/CloudStorage/GoogleDrive-ngcapinv@gmail.com/Meine%20Ablage/remote%20antigravity/scripts/watcher.sh#L205) | Generalize tool names |
| 6 | `.gemini/` dir paths | Entire file | **Keep** — it's our working dir, not Gemini-specific |
| 7 | Status message `🧠 Running Gemini CLI...` | [watcher.sh:228](file:///Users/mkn501/Library/CloudStorage/GoogleDrive-ngcapinv@gmail.com/Meine%20Ablage/remote%20antigravity/scripts/watcher.sh#L228) | Dynamic per backend |

---

### Watcher

#### [MODIFY] [watcher.sh](file:///Users/mkn501/Library/CloudStorage/GoogleDrive-ngcapinv@gmail.com/Meine%20Ablage/remote%20antigravity/scripts/watcher.sh)

**1. Add backend detection function** (after `write_to_outbox`, ~line 58):

```bash
get_backend() {
    jq -r '.backend // "gemini"' "$STATE_FILE" 2>/dev/null || echo "gemini"
}

run_agent() {
    local prompt="$1"
    local backend
    backend=$(get_backend)

    case "$backend" in
        kilo)
            write_to_outbox "🧠 Running Kilo CLI..."
            AGENT_OUTPUT=$(kilo run --auto "$prompt" 2>>"$DOT_GEMINI/wa_session.log") || true
            ;;
        gemini|*)
            write_to_outbox "🧠 Running Gemini CLI..."
            # Temporarily disable hooks (Gemini CLI bug workaround)
            TARGET_SETTINGS="$ACTIVE_PROJECT/.gemini/settings.json"
            SETTINGS_BACKED_UP=false
            if [ -f "$TARGET_SETTINGS" ]; then
                mv "$TARGET_SETTINGS" "${TARGET_SETTINGS}.watcher-bak"
                SETTINGS_BACKED_UP=true
            fi
            AGENT_OUTPUT=$(gemini "${GEMINI_ARGS[@]}" 2>>"$DOT_GEMINI/wa_session.log") || true
            # Restore hooks
            if [ "$SETTINGS_BACKED_UP" = true ] && [ -f "${TARGET_SETTINGS}.watcher-bak" ]; then
                mv "${TARGET_SETTINGS}.watcher-bak" "$TARGET_SETTINGS"
            fi
            ;;
    esac
}
```

**2. Replace inline Gemini invocation** (~line 217-234):
- Remove the inline `GEMINI_ARGS+=(--yolo -p ...)` and `gemini` call
- Replace with: `run_agent "$TELEGRAM_PROMPT"`
- Move `GEMINI_OUTPUT` → `AGENT_OUTPUT` throughout

**3. Update prompt tool references**:
- Change `"Google Search tool"` → `"web search tool"` (Kilo uses MCP, not Google Search natively)
- Change `"use write_file, run_shell_command, read_file"` → `"use your available file and shell tools"` (tool names differ per backend)

**4. Handle `--model` flag per backend**:
- Gemini: `gemini --model "$SELECTED_MODEL" --yolo -p "$PROMPT"`
- Kilo: `kilo run --auto --model "$SELECTED_MODEL" "$PROMPT"` (both support `--model`)

---

### Bot

#### [MODIFY] [bot.js](file:///Users/mkn501/Library/CloudStorage/GoogleDrive-ngcapinv@gmail.com/Meine%20Ablage/remote%20antigravity/scripts/bot/bot.js)

**1. Add `/backend` command** (after `/model` command, ~line 199):

```javascript
const BACKEND_OPTIONS = [
    { id: 'gemini', label: '1️⃣ Gemini CLI', short: 'Gemini' },
    { id: 'kilo',   label: '2️⃣ Kilo CLI',   short: 'Kilo' },
];

bot.onText(/^\/backend$/, async (msg) => {
    if (String(msg.chat.id) !== String(CHAT_ID)) return;
    const state = readJsonSafe(STATE_FILE, {});
    const current = state.backend || 'gemini';

    await bot.sendMessage(CHAT_ID, `🔧 Select CLI Backend (current: ${current}):`, {
        reply_markup: {
            inline_keyboard: [BACKEND_OPTIONS.map(b => ({
                text: b.id === current ? `✅ ${b.label}` : b.label,
                callback_data: `backend:${b.id}`
            }))]
        }
    });
});
```

**2. Add callback handler** (inside existing `callback_query` handler):

```javascript
if (query.data?.startsWith('backend:')) {
    const backendId = query.data.split(':')[1];
    updateState(s => s.backend = backendId);
    await bot.answerCallbackQuery(query.id, { text: `Backend → ${backendId}` });
    // ... update inline keyboard
}
```

**3. Add `/backend` to BOT_COMMANDS list** and `/help` output.

**4. Add binary check to `/status` command**: Show which backend is active and whether the binary is installed.

---

### Docs

#### [MODIFY] [systemPatterns.md](file:///Users/mkn501/Library/CloudStorage/GoogleDrive-ngcapinv@gmail.com/Meine%20Ablage/remote%20antigravity/memory-bank/systemPatterns.md)

- Update architecture diagram: `CLI["🔧 Gemini CLI"]` → `CLI["🔧 Agent CLI (Gemini/Kilo)"]`
- Add pattern: `P-005 | Backend Abstraction | Watcher routes to Gemini or Kilo CLI via state.json backend field`
- Update Tech Stack section

#### [MODIFY] [cli_comparative_analysis.md](file:///Users/mkn501/Library/CloudStorage/GoogleDrive-ngcapinv@gmail.com/Meine%20Ablage/remote%20antigravity/docs/research/cli_comparative_analysis.md)

- Update Kilo CLI section with accurate headless capabilities (`kilo run --auto`)
- Remove Claude Code from recommended architecture (too expensive)
- Update verdict to reflect dual-backend support

---

## Implementation Difficulty Summary

| # | Task | Difficulty | Files |
|---|---|---|---|
| 1 | Add `get_backend()` + `run_agent()` to watcher.sh | 5/10 | watcher.sh |
| 2 | Replace inline Gemini invocation with `run_agent()` | 4/10 | watcher.sh |
| 3 | Generalize prompt tool references | 2/10 | watcher.sh |
| 4 | Add `/backend` command to bot.js | 4/10 | bot.js |
| 5 | Add callback handler for backend selection | 3/10 | bot.js |
| 6 | Update `/help`, `/status`, BOT_COMMANDS | 2/10 | bot.js |
| 7 | Update systemPatterns.md | 2/10 | systemPatterns.md |
| 8 | Update research doc | 2/10 | cli_comparative_analysis.md |
| 9 | Extend regression test suite | 4/10 | bot.test.js |

**Overall Score**: 3.1/10 + 1 (cross-layer watcher+bot) = **4.1/10 (Easy-Moderate)**

---

## Verification Plan

### Regression Test Extension ([bot.test.js](file:///Users/mkn501/Library/CloudStorage/GoogleDrive-ngcapinv@gmail.com/Meine%20Ablage/remote%20antigravity/scripts/bot/bot.test.js))

```bash
cd scripts/bot && npm test
```

Add a new **12. Backend Abstraction** test section:

#### 12a. Backend State Management (4 tests)

| Test | What it verifies |
|---|---|
| `state.backend defaults to 'gemini' when missing` | `get_backend()` returns `"gemini"` for empty state |
| `state.backend = 'kilo' persists correctly` | Round-trip write/read of backend field |
| `invalid backend falls back to gemini` | Unknown values like `"claude"` or `""` default to gemini |
| `backend change preserves other state fields` | Changing `backend` doesn't clobber `model`, `activeProject` |

#### 12b. Watcher Script Backend Compatibility (5 tests)

| Test | What it verifies |
|---|---|
| `watcher.sh contains run_agent function` | Script has the abstraction function |
| `watcher.sh handles gemini case` | `case` block includes `gemini\|*` branch |
| `watcher.sh handles kilo case` | `case` block includes `kilo` branch |
| `watcher.sh skips hooks workaround for kilo` | settings.json backup only in gemini branch |
| `watcher.sh uses backend-aware status messages` | No hardcoded `Running Gemini CLI` outside gemini branch |

#### 12c. Prompt Compatibility (3 tests)

| Test | What it verifies |
|---|---|
| `prompt uses generic tool names` | No `Google Search tool` reference — uses `web search` instead |
| `prompt uses generic file tool names` | No `write_file` / `read_file` — uses `your available tools` |
| `/backend` appears in BOT_COMMANDS` | New command is registered |

### Manual Verification (User)

1. **Start bot + watcher** with default `gemini` backend
2. Send a test message → verify `🧠 Running Gemini CLI...` status
3. Send `/backend` → verify inline keyboard appears with Gemini ✅ / Kilo
4. Select Kilo → verify `Backend → kilo` confirmation
5. Send `/status` → verify it shows `Backend: kilo`
6. *(Only if Kilo CLI installed)* Send a test message → verify `🧠 Running Kilo CLI...` status
7. Send `/backend` → switch back to Gemini → verify it works again
