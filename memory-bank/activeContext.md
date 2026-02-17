# Active Context

## Next Session Goal
- [ ] Implement backend-agnostic watcher [Ref: docs/specs/backend_agnostic_watcher_spec.md]

## Current Focus
- [x] **Session 2026-02-17**: Regression tests (45 tests), prompt fixes, Kilo CLI research + spike, backend-agnostic watcher spec.
- **Status**: Spec complete with 9 sub-tasks in backlog. Kilo CLI v1.0.21 confirmed with headless mode. Tavily MCP identified for web search gap.

## Open Work Items
- Security: CHAT_ID callback auth (In Progress)
- Security: `$MODEL_FLAG` quoting (To Do)
- Feature: Backend-agnostic watcher — Gemini + Kilo CLI (Backlog, spec'd)
- Infra: Configure Tavily MCP + API key for Kilo web search (Backlog)

## Recent Changes
- Built regression test suite: 45 tests, 11 categories (bot.test.js) (2026-02-17).
- Fixed watcher prompt: web search enforcement, literal instruction following (2026-02-17).
- Created backend-agnostic watcher spec with spike results (2026-02-17).
- Added Tavily MCP and secret management prerequisites to spec (2026-02-17).

<details><summary>Older Sessions</summary>

- **2026-02-16 (PM)**: Refactored PR Check/Merge workflows, added version footers, synced template.
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
| 6 | Never trust AI research without web search — Gemini CLI said Kilo had no headless mode; web search proved otherwise |
| 7 | Watcher architecture is naturally backend-agnostic — workflows are injected as text, not read by the CLI agent |
