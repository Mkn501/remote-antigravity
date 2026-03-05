# Active Context

## Next Session Goal
- [ ] Continue dogfooding the submodule-aware watcher via Telegram on real station tasks
- [ ] Consider bot.js refactoring (P0: duplicate `/kill` handler, broad `pkill`)

## Current Focus
- [x] **Session 2026-03-05**: Multi-project routing fix + submodule-aware commits.
- **Status**: All 9 tasks implemented and verified E2E via Telegram. 156/156 tests pass.
  - P-005 Project-Aware Dispatch: 4 tasks (watcher stamps + reads `project` in dispatch)
  - P-006 Submodule-Aware Commit: 5 tasks (inside-out commit, mirrored branches)
  - Fixed unbound `SESSION_NAME` variable bug during live testing

## Open Work Items
- P0: Duplicate `/kill` handler, broad `pkill`, undefined `PROJECT_DIR` (bot_refactoring_spec.md)
- P1: Shell injection fix, consistent state access, duplicate import
- P3: bot.js modular split → then test refactoring
- Feature: Parallel Dispatch (To Do)
- Reliability: Flash + Sandbox replace errors (Research)

## Recent Changes
- Implemented project-aware dispatch (P-005): `watcher.sh` stamps originating project, `bot_v2.js` carries it in dispatch, watcher reads from dispatch instead of state.
- Implemented submodule-aware commits (P-006): `commit_with_submodules()` and `setup_submodule_branches()` handle nested repos like `core/`.
- Both features verified E2E via Telegram on station (submodule) and main (no submodule) projects.

<details><summary>Older Sessions</summary>

- **2026-03-01**: Investigated dispatch routing bug; wrote spec + 4 work orders.
- **2026-02-20 (PM)**: Merge & Code Review. Created refactoring specs for bot.js + bot.test.js.
- **2026-02-20 (AM)**: Self-healing stabilization (diagnosis, auto-fix, log rotation, branch guards).
- **2026-02-18**: E2E Fixes & Plan Mode.
- **2026-02-17**: Regression tests (45 tests), prompt fixes, Kilo CLI research.

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
| 11 | **Monolithic files are AI-hostile** — Gemini CLI deleted Phase 4 handlers because it couldn't reason about 1,373-line bot.js. |
| 12 | **Test helpers must never diverge from production** — bot.test.js had its own `atomicWrite()` that did double-write. |
| 13 | **Use `${VAR:-}` for optional shell variables** — `set -u` (strict mode) causes crashes on unset vars in function args. |
