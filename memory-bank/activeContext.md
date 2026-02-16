# Active Context

## Next Session Goal
- [ ] Apply security fixes: CHAT_ID check on callback queries, quote `$MODEL_FLAG` in watcher.sh.

## Current Focus
- [x] **Session 2026-02-16**: Conversation history refactor, model/project selection UI, security review, README rewrite, startup script.
- **Status**: All features committed and tested. Security review complete with OpenClaw comparison.

## Recent Changes
- Replaced outbox-based history with file-based `session_history.txt` (2026-02-15).
- Added `/model` command with inline keyboard for 4 Gemini models (2026-02-16).
- Added `/project` command with inline keyboard for project switching (2026-02-16).
- Conducted security review — documented in retrospective with OpenClaw.ai comparison (2026-02-16).
- Rewrote README.md with full architecture, setup, and startup instructions (2026-02-16).
- Created `start.sh` one-script launcher with start/stop/status (2026-02-16).

## Lessons Learned

| # | Lesson |
|---|--------|
| 1 | Auth every Telegram handler — callback queries need CHAT_ID check too |
| 2 | Use `readJsonSafe`/`atomicWrite` helpers, not raw `fs` calls in bot |
| 3 | Quote all shell variables sourced from JSON files |
