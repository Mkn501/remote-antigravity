# Technology Context

## Verified Stack
- Runtime: Node.js 22+
- Language: JavaScript (ESM) + Bash (POSIX)
- CLI: Gemini CLI (with hooks system)

## Key Dependencies
- `whatsapp-web.js` or `node-telegram-bot-api` (message platform adapter)
- Gemini CLI hooks (`BeforeAgent`, `AfterAgent`)

## Development Environment
- IDE: VS Code
- AI: Antigravity (Gemini CLI)
- OS: macOS

## Key Environment Variables
- `GEMINI_API_KEY` — Gemini CLI authentication
- `GEMINI_PROJECT_DIR` — Available in hook scripts automatically
- `TELEGRAM_BOT_TOKEN` — (if using Telegram) Bot API token
