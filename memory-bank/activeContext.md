# Active Context

## Next Session Goal
- [ ] Apply security fixes: CHAT_ID check on callback queries, quote `$MODEL_FLAG` in watcher.sh.

## Current Focus
- [x] **Session 2026-02-16 (PM)**: Refactored PR Check/Merge workflows, added version footers, synced template.
- **Status**: All workflow docs updated, template synced, CHANGELOG updated to v2.0.0. Task board cleaned.

## Open Work Items
- Security: CHAT_ID callback auth (In Progress)
- Security: `$MODEL_FLAG` quoting (To Do)
- Research: Claude Code vs Gemini CLI analysis (Backlog)
- Research: Kilo CLI vs Gemini CLI analysis (Backlog)

## Recent Changes
- Refactored `/pr_check` to validation-only with Tiered Rigour and programmatic state gate (2026-02-16).
- Created `/merge_changes` workflow with rollback playbook and conflict handling (2026-02-16).
- Added Document Version footers to all 12 versioned files (2026-02-16).
- Extended `/init_project` A3 with comprehensive version drift detection (2026-02-16).
- Updated template CHANGELOG to v2.0.0 (2026-02-16).

<details><summary>Older Sessions</summary>

- **2026-02-16 (AM)**: Conversation history refactor, model/project selection UI, security review, README rewrite, startup script.
- **2026-02-15**: Initial build — hooks, bot, sprint mode, multi-project support.

</details>

## Lessons Learned

| # | Lesson |
|---|--------|
| 1 | Auth every Telegram handler — callback queries need CHAT_ID check too |
| 2 | Use `readJsonSafe`/`atomicWrite` helpers, not raw `fs` calls in bot |
| 3 | Quote all shell variables sourced from JSON files |
| 4 | Never combine validation ("should we?") with execution ("do it") in the same workflow |
| 5 | Version footers on docs enable programmatic drift detection between projects and template |
