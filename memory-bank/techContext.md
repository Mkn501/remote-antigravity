# Technology Context

## Verified Stack
- Runtime: Node.js 22+
- Language: JavaScript (ESM) + Bash (POSIX)
- CLI: Gemini CLI (with hooks system)
- Platform: Telegram (via `node-telegram-bot-api`)

## Key Dependencies
- `node-telegram-bot-api` (messaging)
- `dotenv` (environment config)
- Gemini CLI hooks (`BeforeAgent`, `AfterAgent`)

## Development Environment
- IDE: VS Code
- AI: Antigravity (Gemini CLI)
- OS: macOS

## Key Environment Variables
- `GEMINI_API_KEY` — Gemini CLI authentication
- `GEMINI_PROJECT_DIR` — Set by watcher/hooks to identify target project
- `HOOK_BRIDGE_DIR` — Path to `remote antigravity` root (handles hooks)
- `TELEGRAM_BOT_TOKEN` — Bot API token
- `TELEGRAM_CHAT_ID` — Authorized user ID
