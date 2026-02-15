# AGENTS.md — Remote Antigravity

> This file is read by **Jules** (Google's async AI agent) on every task.
> It provides persistent project context so Jules can produce accurate PRs.

## Project Overview

Remote Antigravity is a bridge system that connects the Gemini CLI agent runtime with WhatsApp/Telegram messaging platforms. It enables remote, mobile-first control of Antigravity development sessions using the Gemini CLI hook system (`BeforeAgent`/`AfterAgent`) for bidirectional communication.

## Architecture

```
Phone (WhatsApp/Telegram)
  ↕ WhatsApp Web.js / Telegram Bot API
Message Bot (Node.js background process)
  ↕ reads/writes .gemini/wa_inbox.json / wa_outbox.json
Gemini CLI (hooks in .gemini/settings.json)
  ↕ BeforeAgent: inject inbox messages as additionalContext
  ↕ AfterAgent: write response summary to outbox
Shared Project Filesystem
  ↕ memory-bank/, antigravity_tasks.md, source code
IDE (VS Code) — file changes visible on return
```

### Named Patterns
- **Message File Protocol**: JSON files (`wa_inbox.json`, `wa_outbox.json`) as the message queue between bot and CLI hooks.
- **Hook-Bridged I/O**: Using `BeforeAgent` for inbound context injection and `AfterAgent` for outbound response extraction.

## Directory Structure

```
remote-antigravity/
├── scripts/
│   ├── hooks/
│   │   ├── before_agent_wa.sh   # Reads inbox, injects as additionalContext
│   │   └── after_agent_wa.sh    # Extracts response, writes to outbox
│   └── bot.js                   # Message platform listener/sender
├── docs/
├── memory-bank/
└── AGENTS.md                    # ← You are here
```

## Coding Standards

### Node.js (Message Bot)
- **Version**: Node 22+
- **Style**: ESM modules, async/await
- **Error handling**: try/catch with structured logging
- **Dependencies**: Minimal — whatsapp-web.js or node-telegram-bot-api only

### Bash (Hook Scripts)
- **Standard**: POSIX-compatible, BOM-less UTF-8
- **Golden Rule**: stdout MUST contain only pure JSON (no echo/print pollution)
- **Logging**: stderr only

### Testing
- **Framework**: Jest (Node.js), manual verification (hooks)
- **Location**: `tests/`
- **Run command**: `npm test`

## Environment Setup (for Jules VM)

```bash
# Install dependencies
npm install

# Run tests
npm test
```

## What NOT to Modify

Unless explicitly instructed:
- Gemini CLI core code (this project only writes hooks)
- Memory bank files (those are project-specific)
- CI/CD workflows
- Secrets / credentials

## Conventions for PRs

- **Commit style**: `feat:`, `fix:`, `chore:`, `docs:` prefixes
- **Scope**: Only modify files listed in the task
- **Dependencies**: Do NOT add new dependencies unless explicitly asked
- **Tests**: Every code change must include or update tests
