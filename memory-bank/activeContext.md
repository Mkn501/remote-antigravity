# Active Context

## Next Session Goal
- [ ] **P1: Multi-project routing fix** — implement 4 tasks from `docs/specs/multi_project_routing_fix_spec.md` (Diff: 1.75/10)
  - Task 1: Stamp `project` in plan-creation (`watcher.sh` ~L588)
  - Task 2: Add `project` to `writeDispatch()` (`bot_v2.js` ~L350)
  - Task 3: Use dispatch `project` in watcher execution (`watcher.sh` ~L698)
  - Task 4: Add 2 regression tests (`bot_test_v2.js`)

## Current Focus
- [x] **Session 2026-02-20 (PM)**: Merge & Code Review.
- **Status**: Merged telegram/active, deleted destructive session branch, wrote critical review specs for bot.js and bot.test.js.

## Open Work Items
- P0: Duplicate `/kill` handler, broad `pkill`, undefined `PROJECT_DIR` (bot_refactoring_spec.md)
- P1: Shell injection fix, consistent state access, duplicate import
- P3: bot.js modular split → then test refactoring
- Feature: Parallel Dispatch (To Do)
- Reliability: Flash + Sandbox replace errors (Research)

## Recent Changes
- Merged `telegram/active` (task checkbox) to main, deleted destructive session branch.
- Created `docs/specs/bot_refactoring_spec.md` — 5 security, 5 maintainability, 5 refactoring findings.
- Created `docs/specs/bot_test_refactoring_spec.md` — stale test data, code duplication, grep-heavy tests.
- Self-healing system stabilized: diagnosis pipeline, auto-fix workflow, log rotation, branch guards.

<details><summary>Older Sessions</summary>

- **2026-02-20 (AM)**: Self-healing stabilization (diagnosis, auto-fix, log rotation, branch guards).
- **2026-02-18**: E2E Fixes & Plan Mode.
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
| 11 | **Monolithic files are AI-hostile** — Gemini CLI deleted Phase 4 handlers because it couldn't reason about 1,373-line bot.js. Smaller modules = safer AI edits. |
| 12 | **Test helpers must never diverge from production** — bot.test.js had its own `atomicWrite()` that did double-write instead of atomic rename, validating wrong code. |
