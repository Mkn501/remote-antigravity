# Remote Antigravity

**Version**: 0.1.0 (2026-02-15)
**Source**: Antigravity Template v1.0.0

Remote Antigravity enables **WhatsApp/Telegram-based control** of Antigravity development sessions. It bridges the Gemini CLI hook system with a messaging platform, allowing you to:

- Run your normal `startup → implement → shutdown` cycle from your phone
- Receive status updates on WhatsApp/Telegram instead of the IDE chat window
- Send instructions and steering commands remotely
- Optionally enable "Sprint Mode" for autonomous task execution with monitoring

## Architecture

```
📱 Phone (WhatsApp/Telegram)
    ↕ 
🤖 Message Bot (listener)
    ↕  reads/writes JSON message files
🔧 Gemini CLI (with hooks)
    ↕  BeforeAgent: injects WhatsApp messages as context
    ↕  AfterAgent: extracts responses to WhatsApp
📂 Shared Filesystem (memory-bank/, antigravity_tasks.md)
    ↕
💻 IDE (VS Code) — sees all file changes when you return
```

## Quick Start

1. Configure Gemini CLI hooks (`.gemini/settings.json`)
2. Start the message bot (`scripts/bot.js`)
3. Run a Gemini CLI session pointed at your project
4. Interact via WhatsApp/Telegram

## 📂 Structure

- `memory-bank/`: The project's brain (Context, Decisions, Patterns).
- `docs/standards/`: Contains the `workstation_sop.md`.
- `docs/specs/`: Feature specifications.
- `scripts/`: Hook scripts and message bot.
- `antigravity_tasks.md`: Task tracker (CLI-compatible).

## 🔄 Updating

This project follows the Antigravity template. Run `/init_project` in audit mode to check compliance.
