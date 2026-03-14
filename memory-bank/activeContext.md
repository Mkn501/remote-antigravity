# Active Context

## Next Session Goal
- [ ] Implement Session-Persistent Kilo Architecture — start with WO-SES-0 (agent config sync) then S-SES-1 (spike --session + --agent). Spec: `docs/specs/kilo_session_persistent_spec.md`

## Current Focus
- [x] **Session 2026-03-14**: Disabled Antigravity Claude Proxy to prevent account suspension.
  - Removed all Anthropic/Claude models from `registries.js`, `bot_v2.js`, `watcher.sh`, `start.sh`
  - Kilo backend now uses GLM-5 (top), MiniMax M2.5 (mid), GLM-4.7 Flash (free) via OpenRouter
  - Disabled proxy lifecycle (start/stop/status) in `start.sh`
  - Updated 8 regression tests in `bot_test_v3.js`, removed 1 stale test
  - All 160 tests pass

## Open Work Items
- P0: Duplicate `/kill` handler, broad `pkill`, undefined `PROJECT_DIR` (bot_refactoring_spec.md)
- ~~P0: Consolidate bot.js / bot_v2.js~~ — **RESOLVED** (bot.js archived, bot_v2.js is canonical)
- P1: Shell injection fix, consistent state access, duplicate import
- Feature: Tavily MCP for Kilo CLI web search
- Feature: Parallel Dispatch (To Do)

## Recent Changes
- Antigravity Claude Proxy permanently disabled — account suspension risk
- Kilo models switched to OpenRouter-only: GLM-5, MiniMax M2.5, GLM-4.7 Flash
- `start.sh` proxy lifecycle commented out
- Stale `slash_count` regression test removed

<details><summary>Older Sessions</summary>

- **2026-03-11**: Kilo CLI session persistence discovery. Upgraded 7.0.43→7.0.46. SOP-compliant spec (9 WOs).
- **2026-03-05 (PM)**: Kilo CLI + Antigravity Claude Proxy. Claude models via proxy :3456. Kilo v1→v7. TTY fix. E2E validated.
- **2026-03-05 (AM)**: Multi-project routing fix + submodule-aware commits. 9 tasks, 156 tests.
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
| 14 | **Kilo CLI requires TTY for output** — `kilo run --auto` silently hangs without a pseudo-terminal. Wrap with `script -q /dev/null`. |
| 15 | **Always check installed vs. latest CLI versions** — Kilo CLI was 6 major versions behind, causing silent config and output failures. |
