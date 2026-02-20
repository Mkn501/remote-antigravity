# Remote Antigravity

**Version**: 0.2.0 (2026-02-16)  
**Source**: Antigravity Template v1.0.0

Remote Antigravity enables **Telegram-based control** of Antigravity development sessions. It bridges the Gemini CLI with a Telegram bot, allowing you to:

- Run your normal `startup → implement → shutdown` cycle from your phone
- Receive status updates on Telegram instead of the IDE
- Send instructions and steering commands remotely
- Switch between projects and AI models on the fly
- Optionally enable "Sprint Mode" for autonomous task execution

## Architecture

```
📱 Phone (Telegram)
    ↕  Telegram Bot API (polling)
🤖 Bot (scripts/bot/bot.js)
    ↕  reads/writes JSON files in .gemini/
👁️ Watcher (scripts/watcher.sh)
    ↕  polls inbox, launches Gemini CLI per message
🔧 Gemini CLI (stateless -p calls)
    ↕  reads AGENTS.md, memory-bank/, session_history.txt
📂 Project Filesystem
    ↕  all changes on telegram/active branch
💻 IDE (VS Code) — sees all file changes when you return
```

**Key design:** Each message triggers a fresh `gemini -p` call (stateless). Conversation context is maintained via `.gemini/session_history.txt` which Gemini reads as a file. Replies are written to `.gemini/telegram_reply.txt`.

## 🚀 Getting Started

### Prerequisites

- [Gemini CLI](https://github.com/google-gemini/gemini-cli) installed and authenticated
- [Node.js](https://nodejs.org/) v18+
- A Telegram bot token (from [@BotFather](https://t.me/BotFather))
- Your Telegram chat ID

### Setup

```bash
# 1. Install bot dependencies
cd scripts/bot
cp .env.example .env
# Edit .env — see variable descriptions below
npm install
cd ../..
```

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Token from [@BotFather](https://t.me/BotFather) — the bot's API key |
| `TELEGRAM_CHAT_ID` | Your personal chat ID — only messages from this ID are accepted |
| `GEMINI_PROJECT_DIR` | Absolute path to your default project root (where `.gemini/` lives). If left blank, defaults to the repo root. |

### Starting Everything

```bash
./start.sh          # Start bot + watcher in background
./start.sh status   # Check if running
./start.sh stop     # Stop everything
```

Logs are written to `.gemini/bot.log` and `.gemini/watcher.log`.

<details>
<summary>Manual start (alternative)</summary>

```bash
# Start the Telegram bot (background)
cd scripts/bot && node bot.js &
cd ../..

# Start the inbox watcher (background)
./scripts/watcher.sh &
```

</details>

## 📱 Bot Commands

### Workflow Commands (→ Gemini CLI)

| Command | Description |
|---------|-------------|
| `/startup` | Load project context, create fresh branch |
| `/shutdown` | Save state, close session branch |
| `/implement_task` | Implement an assigned task |
| `/plan_feature` | Plan a new feature |
| `/pr_check` | Check and merge PRs |
| `/update_roadmap` | Update roadmap docs |
| `/new` | Archive branch, start fresh |

### Bot Commands (instant)

| Command | Description |
|---------|-------------|
| `/help` | Show all commands |
| `/model` | Switch AI model (inline buttons) |
| `/backend` | Switch CLI backend (Gemini/Kilo) |
| `/project` | Switch active project (inline buttons) |
| `/status` | System status |
| `/version` | Bot version + uptime |
| `/sprint` | Sprint mode (autonomous) |
| `/stop` | Halt agent |
| `/restart` | Kill + restart watcher with diagnostics |
| `/watchdog` | Show watchdog status + restart history |
| `/clear_lock` | Clear stuck session lock |
| `/diagnose` | Trigger LLM crash diagnosis from logs |
| `/list` | List registered projects |
| `/add <name> <path>` | Register a new project |

## 📂 Structure

- `memory-bank/` — The project's brain (Context, Decisions, Patterns)
- `docs/standards/` — Contains the `workstation_sop.md`
- `docs/specs/` — Feature specifications
- `docs/retrospectives/` — Post-session learnings
- `scripts/bot/` — Telegram relay bot
- `scripts/watcher.sh` — Inbox watcher + Gemini CLI launcher
- `antigravity_tasks.md` — Task tracker (CLI-compatible)

## 🛡️ Self-Healing

Two recovery mechanisms protect against stuck or crashed processes:

### `/restart` Command (Telegram)
If the watcher is stuck but the bot is alive, send `/restart` from Telegram:
- Kills the watcher process
- Clears stale lock + dispatch continue signal
- Spawns a new watcher
- Shows last 10 lines of watcher.log as diagnostics

### Watchdog (External Process)
An independent script that runs every 60 seconds and auto-restarts bot or watcher if they crash.

```bash
# Install (one-time)
cp com.antigravity.watchdog.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.antigravity.watchdog.plist

# Check if running
launchctl list | grep antigravity

# Stop (keeps installed, stops running)
launchctl unload ~/Library/LaunchAgents/com.antigravity.watchdog.plist

# Uninstall completely
launchctl unload ~/Library/LaunchAgents/com.antigravity.watchdog.plist
rm ~/Library/LaunchAgents/com.antigravity.watchdog.plist
```

**Safety:** Max 3 restarts per hour to prevent crash loops. Logs at `.gemini/watchdog.log`.

## 🔒 Security

- Single-user design — hardcoded `CHAT_ID` filtering on all handlers
- No network exposure — no HTTP server, no open ports
- No plugin marketplace — only built-in Gemini tools + local MCP
- `.env` secrets excluded from git via `.gitignore`
- See `docs/retrospectives/2026-02-16_telegram_bot_security_review.md` for full audit

## 🔄 Updating

This project follows the Antigravity template. Run `/init_project` in audit mode to check compliance.
