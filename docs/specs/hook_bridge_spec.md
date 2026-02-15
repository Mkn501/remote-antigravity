# Specification: Gemini CLI Hook Bridge

> **Status**: Draft
> **Owner**: Minh (Mkn501)
> **Created**: 2026-02-15
> **Product**: Remote Antigravity
> **Priority**: P1 High

## 1. Executive Summary

The Hook Bridge enables bidirectional communication between a WhatsApp/Telegram messaging app and the Gemini CLI agent runtime. It uses the CLI's native `BeforeAgent` and `AfterAgent` hook system to inject inbound messages as agent context and extract outbound status updates — all via JSON files on the shared filesystem. This allows a developer to run their standard Antigravity workflows (`/startup`, `/implement_task`, `/shutdown`) remotely from their phone.

## 2. Goals

1. Replace the IDE chat window with WhatsApp/Telegram as the primary I/O channel for a Gemini CLI session.
2. Enable remote steering — send instructions and receive progress updates from a phone.
3. Support two operating modes: **Interactive** (wait for user input each turn) and **Sprint** (autonomous task loop with monitoring).
4. Keep the system lightweight: no external gateways, no OpenClaw, just hooks + a bot.

### Non-Goals
- Full IDE replacement (complex debugging, multi-file diffing still needs the IDE).
- Real-time streaming of agent output (WhatsApp/Telegram is message-based, not streaming).
- Multi-user support (single developer, single session).
- Shared conversation history between CLI and IDE sessions (sync is file-based only).

## 3. Technical Design

### 3.1 Components

| Component | Language | Responsibility |
|-----------|----------|----------------|
| **BeforeAgent Hook** | Bash | Reads `wa_inbox.json`, injects messages as `additionalContext` into the agent prompt |
| **AfterAgent Hook** | Bash | Extracts the agent's response summary, writes to `wa_outbox.json`. Optionally re-prompts for Sprint Mode |
| **Message Bot** | Node.js | Listens to WhatsApp/Telegram, writes to `wa_inbox.json`. Watches `wa_outbox.json` and sends responses back |
| **Config** | JSON | `.gemini/settings.json` hook registration |

### 3.2 System Diagram

```mermaid
sequenceDiagram
    participant Phone as 📱 Phone
    participant Bot as 🤖 Message Bot
    participant Inbox as wa_inbox.json
    participant CLI as 🔧 Gemini CLI
    participant Outbox as wa_outbox.json
    participant FS as 📂 Project Files

    Phone->>Bot: "Run /startup"
    Bot->>Inbox: Write message to inbox
    Note over CLI: BeforeAgent hook fires
    CLI->>Inbox: Read & clear inbox
    CLI->>CLI: Inject as additionalContext
    CLI->>FS: Execute workflow (read/write memory-bank)
    Note over CLI: AfterAgent hook fires
    CLI->>Outbox: Write response summary
    Bot->>Outbox: Detect new message
    Bot->>Phone: Send status update
```

### 3.3 Message File Protocol

#### `wa_inbox.json`
```json
{
  "messages": [
    {
      "id": "msg_001",
      "timestamp": "2026-02-15T14:30:00Z",
      "from": "user",
      "text": "Run /startup",
      "read": false
    }
  ]
}
```

#### `wa_outbox.json`
```json
{
  "messages": [
    {
      "id": "resp_001",
      "timestamp": "2026-02-15T14:30:15Z",
      "from": "agent",
      "text": "✅ Startup complete. Context loaded, 3 tasks in To Do. Next: implement ingestor pagination fix.",
      "sent": false
    }
  ]
}
```

**Rules:**
- BeforeAgent reads `wa_inbox.json`, marks messages as `"read": true`, returns content as `additionalContext`.
- AfterAgent writes to `wa_outbox.json` with `"sent": false`. Bot marks as `"sent": true` after delivery.
- Atomic writes: write to `.tmp` first, then `mv` to prevent partial reads.

### 3.4 Hook Configuration

```json
// .gemini/settings.json
{
  "hooks": [
    {
      "event": "BeforeAgent",
      "command": ["bash", "scripts/hooks/before_agent_wa.sh"]
    },
    {
      "event": "AfterAgent",
      "command": ["bash", "scripts/hooks/after_agent_wa.sh"]
    }
  ]
}
```

### 3.5 BeforeAgent Hook Contract

**Input** (stdin): JSON with `prompt` field containing the user's message.
**Output** (stdout): JSON with optional `additionalContext` field.

```bash
#!/usr/bin/env bash
# scripts/hooks/before_agent_wa.sh
# Reads wa_inbox.json, injects unread messages as additionalContext

INBOX="$GEMINI_PROJECT_DIR/.gemini/wa_inbox.json"

if [ ! -f "$INBOX" ]; then
  echo '{}'
  exit 0
fi

# Extract unread messages, format as context, mark as read
# (Full implementation uses jq for JSON manipulation)
UNREAD=$(jq -r '.messages[] | select(.read == false) | .text' "$INBOX" 2>/dev/null)

if [ -z "$UNREAD" ]; then
  echo '{}'
  exit 0
fi

# Mark all as read (atomic write)
jq '.messages[].read = true' "$INBOX" > "${INBOX}.tmp" && mv "${INBOX}.tmp" "$INBOX"

# Return as additionalContext
jq -n --arg ctx "WhatsApp messages:\n$UNREAD" '{"additionalContext": $ctx}'
```

### 3.6 AfterAgent Hook Contract

**Input** (stdin): JSON with `prompt_response` field containing the agent's full response.
**Output** (stdout): JSON (empty `{}` for Interactive mode, or `{"stop_hook_active": false}` for Sprint mode re-prompting).

```bash
#!/usr/bin/env bash
# scripts/hooks/after_agent_wa.sh
# Extracts response summary, writes to wa_outbox.json

OUTBOX="$GEMINI_PROJECT_DIR/.gemini/wa_outbox.json"

# Read the agent's response from stdin
INPUT=$(cat)
RESPONSE=$(echo "$INPUT" | jq -r '.prompt_response // empty')

if [ -z "$RESPONSE" ]; then
  echo '{}'
  exit 0
fi

# Truncate to ~500 chars for WhatsApp readability
SUMMARY=$(echo "$RESPONSE" | head -c 500)
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
MSG_ID="resp_$(date +%s)"

# Append to outbox (atomic write)
if [ -f "$OUTBOX" ]; then
  jq --arg id "$MSG_ID" --arg ts "$TIMESTAMP" --arg txt "$SUMMARY" \
    '.messages += [{"id": $id, "timestamp": $ts, "from": "agent", "text": $txt, "sent": false}]' \
    "$OUTBOX" > "${OUTBOX}.tmp" && mv "${OUTBOX}.tmp" "$OUTBOX"
else
  jq -n --arg id "$MSG_ID" --arg ts "$TIMESTAMP" --arg txt "$SUMMARY" \
    '{"messages": [{"id": $id, "timestamp": $ts, "from": "agent", "text": $txt, "sent": false}]}' > "$OUTBOX"
fi

echo '{}'
```

### 3.7 Operating Modes

| Mode | Behavior | AfterAgent Output |
|------|----------|-------------------|
| **Interactive** | Agent waits for next user message via WhatsApp. One turn per message. | `{}` (hook exits, CLI waits) |
| **Sprint** | Agent auto-continues to the next task after completing one. Sends status update, then re-prompts. | `{"stop_hook_active": false}` (triggers next turn) |

Sprint Mode is limited by:
- **Context window**: ~3-5 tasks before quality degrades.
- **Session lifespan**: Gemini CLI sessions are finite.
- **User can interrupt**: Send "STOP" via WhatsApp → BeforeAgent injects stop signal.

### 3.8 Message Bot (Node.js)

The bot has two responsibilities:
1. **Inbound**: Listen for WhatsApp/Telegram messages → write to `wa_inbox.json`
2. **Outbound**: Watch `wa_outbox.json` for new messages → send to WhatsApp/Telegram

**Platform recommendation**: Start with **Telegram Bot API** — simpler auth (token-based), no QR code maintenance, richer message formatting (Markdown).

**Minimal implementation** (~80 lines):
```js
// scripts/bot.js (pseudo-code outline)
import TelegramBot from 'node-telegram-bot-api';
import { watch, readFileSync, writeFileSync } from 'fs';

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const INBOX = '.gemini/wa_inbox.json';
const OUTBOX = '.gemini/wa_outbox.json';

// Inbound: Telegram → wa_inbox.json
bot.on('message', (msg) => {
  const inbox = JSON.parse(readFileSync(INBOX, 'utf8') || '{"messages":[]}');
  inbox.messages.push({
    id: `msg_${Date.now()}`,
    timestamp: new Date().toISOString(),
    from: 'user',
    text: msg.text,
    read: false
  });
  writeFileSync(INBOX, JSON.stringify(inbox, null, 2));
});

// Outbound: wa_outbox.json → Telegram
watch(OUTBOX, () => {
  const outbox = JSON.parse(readFileSync(OUTBOX, 'utf8'));
  const unsent = outbox.messages.filter(m => !m.sent);
  for (const msg of unsent) {
    bot.sendMessage(CHAT_ID, msg.text);
    msg.sent = true;
  }
  writeFileSync(OUTBOX, JSON.stringify(outbox, null, 2));
});
```

## 4. Spikes (Pre-Implementation Validation)

| Spike | Description | Effort | Deliverable |
|-------|-------------|--------|-------------|
| **RA-001** | Verify BeforeAgent `additionalContext` injection works end-to-end with Gemini CLI | 2h | Working hook that injects a hardcoded string, confirmed visible in agent prompt |
| **RA-002** | Verify AfterAgent can read `prompt_response` and extract meaningful summary | 2h | Working hook that writes agent response to a file |
| **RA-003** | Telegram Bot API round-trip: send message → write inbox → read outbox → reply | 3h | Working bot that echoes messages via the inbox/outbox file protocol |

## 5. Open Source & Commercialization Impact

### 5.1 Dependency License Audit

| Dependency | License | Commercial Use | Verdict |
|------------|---------|----------------|---------|
| `node-telegram-bot-api` | MIT | ✅ Unrestricted | ✅ Safe |
| `whatsapp-web.js` | Apache-2.0 | ✅ Unrestricted | ✅ Safe (but unofficial WhatsApp API) |
| `jq` (system) | MIT | ✅ Unrestricted | ✅ Safe |

### 5.2 Commercialization Questions
- [x] Can this code be open-sourced? **Yes** — no proprietary logic, just a bridge.
- [ ] Competitive moat? **No** — this is a developer tool, not a product feature.
- [x] Vendor lock-in? **No** — Telegram/WhatsApp are interchangeable; core is the hook protocol.

## 6. Implementation Phases

### Phase 1: Hook Scripts (MVP)
- **Objective**: Working BeforeAgent + AfterAgent hooks with file-based I/O.
- **Deliverables**: `scripts/hooks/before_agent_wa.sh`, `scripts/hooks/after_agent_wa.sh`, `.gemini/settings.json`
- **Effort**: 1d
- **Test**: Manually write to `wa_inbox.json`, run Gemini CLI, verify `wa_outbox.json` gets populated.

### Phase 2: Message Bot
- **Objective**: Telegram bot that relays messages to/from the JSON files.
- **Deliverables**: `scripts/bot.js`, `package.json`
- **Effort**: 1d
- **Test**: Send message on Telegram → see it in Gemini CLI context → get response on Telegram.

### Phase 3: End-to-End Integration
- **Objective**: Run a full `/startup` → `/implement_task` → `/shutdown` cycle via Telegram.
- **Deliverables**: Usage guide, tested workflow.
- **Effort**: 0.5d

### Phase 4: Sprint Mode (Optional)
- **Objective**: AfterAgent re-prompting for autonomous task execution with monitoring.
- **Deliverables**: Sprint mode flag in AfterAgent hook, STOP signal handling.
- **Effort**: 1d

## 7. Security & Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Telegram bot token leaked in repo | High | Store in `.env`, add to `.gitignore` |
| WhatsApp Web.js requires QR re-auth | Medium | Use Telegram instead (token-based, no QR) |
| File race conditions on inbox/outbox | Low | Atomic writes (write to `.tmp`, then `mv`) |
| Context window exhaustion in Sprint Mode | Medium | Limit to 3-5 tasks per sprint, send warning at 80% context usage |
| Agent quality degradation over long sessions | Medium | Monitor response quality, auto-stop if agent starts repeating |

## 8. Testing

### 8.1 Unit Tests

| Component | Test File | Key Cases |
|-----------|-----------|-----------|
| BeforeAgent hook | `tests/test_before_agent.sh` | Empty inbox, single message, multiple messages, malformed JSON |
| AfterAgent hook | `tests/test_after_agent.sh` | Empty response, long response truncation, outbox append |
| Message Bot | `tests/bot.test.js` | Inbound write, outbound watch, atomic write safety |

### 8.2 Regression Suite

- [ ] Hooks produce valid JSON on stdout (no echo pollution)
- [ ] Atomic writes don't corrupt files under concurrent access
- [ ] Bot reconnects after network interruption

### 8.3 Integration Considerations
- [ ] File encoding: UTF-8, no BOM (POSIX standard)
- [ ] `jq` availability: required on the host system
- [ ] Gemini CLI hook timeout: hooks must complete within the CLI's timeout window
