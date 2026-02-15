# System Patterns

## Architecture Overview

```mermaid
graph LR
    Phone["📱 Phone"] <-->|messages| Bot["🤖 Message Bot"]
    Bot -->|writes| Inbox["wa_inbox.json"]
    Bot <--|reads| Outbox["wa_outbox.json"]
    Inbox -->|BeforeAgent reads| CLI["🔧 Gemini CLI"]
    CLI -->|AfterAgent writes| Outbox
    CLI <-->|reads/writes| FS["📂 Shared Filesystem"]
    IDE["💻 IDE"] <-->|reads/writes| FS
```

## Named Patterns

| ID | Pattern | Description |
|----|---------|-------------|
| P-001 | **Message File Protocol** | JSON files as the message queue between bot and CLI hooks |
| P-002 | **Hook-Bridged I/O** | BeforeAgent for inbound injection, AfterAgent for outbound extraction |
| P-003 | **Shared Filesystem Sync** | CLI and IDE share memory-bank/ and tasks — no direct session link needed |
| P-004 | **Wrapper Script Hook** | Use `exec` wrappers to launch hooks in paths with spaces (Gemini CLI workaround) |

## Key Decisions
- **No OpenClaw**: Direct Gemini CLI hooks + lightweight bot, no gateway layer
- **File-based messaging**: JSON files over IPC/WebSocket for simplicity and debuggability

## Tech Stack
- Bot: Node.js (whatsapp-web.js or node-telegram-bot-api)
- Hooks: Bash scripts (POSIX-compatible, JSON stdout)
- CLI: Gemini CLI with hooks in .gemini/settings.json
