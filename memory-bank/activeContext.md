# Active Context

## Next Session Goal
- [ ] Fix false-positive rate limit detection (check exit code 0) [Ref: docs/retrospectives/2026-02-18_telegram_plan_mode_and_model_reliability.md]

## Current Focus
- [x] **Session 2026-02-18**: E2E Fixes & Plan Mode.
- **Status**: Plan mode auto-clear implemented, Next Task button fixed. Flash execution reliability identified as risk.

## Open Work Items
- Security: CHAT_ID callback auth (In Progress)
- Security: `$MODEL_FLAG` quoting (To Do)
- Reliability: Flash + Sandbox replace errors (To Do)
- Reliability: False-positive rate limit errors (To Do)

## Recent Changes
- Implemented plan mode auto-clear on dispatch approval (2026-02-18).
- Fixed callback mismatch (`ep_next` → `ep_continue`) (2026-02-18).
- Expanded regression suite to 99 tests (2026-02-18).
- Deleted `telegram/active` branch (failed Flash run cleanup).

<details><summary>Older Sessions</summary>

- **2026-02-17**: Regression tests (45 tests), prompt fixes, Kilo CLI research.
- **2026-02-16 (PM)**: Refactored PR Check/Merge workflows, added version footers, synced template.
- **2026-02-16 (AM)**: Conversation history refactor, model/project selection UI, security review.

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
| 8 | **Bot callbacks must match watcher data exactly** — simple string mismatch causes silent UI failures |
| 9 | **Flash + Sandbox struggles with large files** — `replace` tool often fails to find context in >1000 line files |
| 10 | **Gemini CLI Auto-Retry is Silent** — stderr warnings about rate limits don't mean failure if exit code is 0 |
