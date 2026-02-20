<!-- TASK_SCHEMA:
  Category: [Bug], [Feature], [Infra], [Research], [Docs], [Security], [Release], [UX], [Architecture]
  Topic: Optional sub-area (e.g., [Hooks], [Bot], [WhatsApp])
  Difficulty: 1 (Trivial) to 10 (Expert/Arch Change)
  Jules: [Jules: Yes] if atomic, deterministic, and testable (see plan_feature.md)
-->
# Tasks - Antigravity Tasks

## In Progress

- [ ] -

## To Do

- [ ] [Feature] [Bot] Implement `/ping` command [Ref: docs/specs/ping_command_spec.md] [Difficulty: 1]
  - **Summary:** Adds a simple connectivity check command that replies "pong".
  - **File(s):** scripts/bot/commands/general.js
  - **Action:** Add `registerCommand(/^\/ping/, ...)` handler.
  - **Signature:** `(msg) => Promise<void>`
  - **Scope Boundary:** ONLY modify general.js.
  - **Dependencies:** None
  - **Parallel:** Yes
  - **Acceptance:** `/ping` returns "pong".
  - **Tier:** ⚡ Mid
- [ ] [Feature] [Testing] Add `/ping` regression test [Ref: docs/specs/ping_command_spec.md] [Difficulty: 1]
  - **Summary:** Verifies `/ping` command validation and response.
  - **File(s):** scripts/bot/bot_test_v3.js
  - **Action:** Add test case for `/ping`.
  - **Signature:** `await test('/ping replies pong', ...)`
  - **Scope Boundary:** ONLY modify bot_test_v3.js.
  - **Dependencies:** Requires `/ping` command.
  - **Acceptance:** `node scripts/bot/bot_test_v3.js` passes.
  - **Tier:** ⚡ Mid
- [ ] [Feature] [Bot] Add dispatch mode field and Auto-Run button [Ref: docs/specs/parallel_kilo_dispatch_spec.md] [Difficulty: 2]
  - **Summary:** Adds `mode` field to dispatch JSON and "🚀 Auto-Run" button in plan review.
  - **File(s):** scripts/bot/bot.js (lines ~525-540, ep_execute handler)
  - **Action:** Add `mode` parameter to `writeDispatch()` call; add auto-run button.
  - **Scope Boundary:** ONLY modify bot.js. Do NOT touch watcher.sh.
  - **Acceptance:** `npm test` passes; dispatch JSON has `mode` field.
- [ ] [Feature] [Watcher] Implement auto-continue dispatch mode [Ref: docs/specs/parallel_kilo_dispatch_spec.md] [Difficulty: 3]
  - **Summary:** Skip step-through pause when dispatch mode is `auto`.
  - **File(s):** scripts/watcher.sh (lines ~787-810, continue-wait section)
  - **Action:** Read `.mode` from dispatch JSON; if `auto`, skip `wa_dispatch_continue.json` wait.
  - **Scope Boundary:** ONLY modify watcher.sh. Do NOT touch bot.js.
  - **Dependencies:** Requires dispatch mode field (Task above).
  - **Acceptance:** `bash -n watcher.sh` passes.
- [ ] [Feature] [Testing] Add auto-continue regression tests [Ref: docs/specs/parallel_kilo_dispatch_spec.md] [Difficulty: 2]
  - **Summary:** Behavioral tests for dispatch mode field and auto-continue logic.
  - **File(s):** scripts/bot/bot.test.js
  - **Action:** Add tests verifying mode field and watcher auto-continue behavior.
  - **Scope Boundary:** ONLY modify bot.test.js.
  - **Dependencies:** Requires auto-continue implementation.
  - **Acceptance:** `npm test` passes with new tests.
- [ ] [Feature] [Watcher] Implement parallel dispatch with git worktrees [Ref: docs/specs/parallel_kilo_dispatch_spec.md] [Difficulty: 7]
  - **Summary:** Run independent Kilo tasks in parallel worktrees, merge results.
  - **File(s):** scripts/watcher.sh (new `dispatch_parallel()` function)
  - **Action:** Add parallel dispatch function with worktree create/run/merge/cleanup.
  - **Scope Boundary:** ONLY modify watcher.sh. Do NOT touch bot.js.
  - **Dependencies:** Requires auto-continue mode.
  - **Acceptance:** `bash -n watcher.sh` passes; E2E test passes.
- [ ] [Feature] [Testing] Add parallel dispatch E2E + regression tests [Ref: docs/specs/parallel_kilo_dispatch_spec.md] [Difficulty: 4]
  - **Summary:** Worktree lifecycle, parallel merge, and conflict detection tests.
  - **File(s):** scripts/bot/bot.test.js, scripts/bot/test_kilo_e2e.sh
  - **Action:** Add worktree lifecycle test, parallel merge test, conflict detection test.
  - **Dependencies:** Requires parallel dispatch implementation.
  - **Acceptance:** `npm test` passes; `bash test_kilo_e2e.sh` passes.
- [ ] [Research] [Reliability] Investigate Flash + Sandbox replace errors on large files [Ref: docs/retrospectives/2026-02-18_telegram_plan_mode_and_model_reliability.md] [Difficulty: 3]
- [ ] [Security] [Bot] Remove duplicate `/kill` handler (SEC-4, P0) [Ref: docs/specs/bot_refactoring_spec.md] [Difficulty: 1]
- [ ] [Security] [Bot] Fix overly broad `pkill` patterns in `/kill` (SEC-2, P0) [Ref: docs/specs/bot_refactoring_spec.md] [Difficulty: 1]
- [ ] [Bug] [Bot] Fix undefined `PROJECT_DIR` in `/apply_fix` and `/discard_fix` (MAINT-4, P0) [Ref: docs/specs/bot_refactoring_spec.md] [Difficulty: 1]
- [ ] [Security] [Bot] Add branch name sanitization in `/apply_fix` (SEC-1, P1) [Ref: docs/specs/bot_refactoring_spec.md] [Difficulty: 1]
- [ ] [Bug] [Bot] Remove duplicate dotenv import (MAINT-2, P1) [Ref: docs/specs/bot_refactoring_spec.md] [Difficulty: 1]
- [ ] [Bug] [Bot] Use `getState()` consistently — replace raw JSON.parse in `/autofix` (MAINT-3, P1) [Ref: docs/specs/bot_refactoring_spec.md] [Difficulty: 1]
- [ ] [Bug] [Testing] Fix stale BOT_COMMANDS in test (8 vs 18 actual) [Ref: docs/specs/bot_test_refactoring_spec.md] [Difficulty: 1]
- [ ] [Bug] [Testing] Fix atomicWrite divergence in bot.test.js [Ref: docs/specs/bot_test_refactoring_spec.md] [Difficulty: 1]

## Backlog

- [ ] [Architecture] [Bot] Modular bot.js refactor (12 modules) [Ref: docs/specs/bot_refactoring_spec.md] [Difficulty: 7]
- [ ] [Architecture] [Testing] Migrate to node:test runner + tiered test files [Ref: docs/specs/bot_test_refactoring_spec.md] [Difficulty: 5]
- [ ] Replace inline Gemini invocation with `run_agent()` [Difficulty: 4]
- [ ] Generalize prompt tool references (generic tool names) [Difficulty: 2]
- [ ] Update `/help`, `/status`, BOT_COMMANDS [Difficulty: 2]
- [ ] Update systemPatterns.md (architecture diagram + P-005) [Difficulty: 2]

## Done

- [x] [Feature] [Watcher] Backend-agnostic CLI support (Gemini + Kilo) [Ref: docs/specs/backend_agnostic_watcher_spec.md] [Difficulty: 4] - COMPLETED 2026-02-20
- [x] Extend regression test suite (12 new tests for backend abstraction) [Difficulty: 4] - COMPLETED 2026-02-20
- [x] Update cli_comparative_analysis.md with Kilo headless findings [Difficulty: 2] - COMPLETED 2026-02-20
- [x] [Feature] [Bot] Implement `/version` command handler [Ref: docs/specs/telegram_version_command_spec.md] [Difficulty: 2] - COMPLETED 2026-02-20
- [x] **Summary:** Adds a command to display the current bot version and process uptime.
- [x] **File(s):** scripts/bot/bot.js
- [x] **Action:** Add `bot.onText(/\/version/, ...)` handler.
- [x] **Signature:** `(msg) => Promise<void>`
- [x] **Scope Boundary:** ONLY modify bot.js. Do NOT touch other handlers.
- [ ] **Dependencies:** None
- [ ] **Parallel:** Yes
- [x] **Acceptance:** `/version` returns "🤖 wa-bridge vX.Y.Z" and "⏱️ Uptime: ...".
- [ ] **Tier:** ⚡ Mid
- [x] [Feature] [Bot] Add regression test for `/version` command [Ref: docs/specs/telegram_version_command_spec.md] [Difficulty: 2] - COMPLETED 2026-02-20
- [x] **Summary:** Ensures the /version command returns the expected format and doesn't crash.
- [x] **File(s):** scripts/bot/bot.test.js
- [x] **Action:** Add a test case that mocks the message and asserts the response.
- [x] **Signature:** `await test('/version command returns version and uptime', ...)`
- [x] **Scope Boundary:** ONLY modify bot.test.js.
- [ ] **Dependencies:** None
- [ ] **Parallel:** Yes
- [x] **Acceptance:** `npm test` passes.
- [ ] **Tier:** ⚡ Mid
- [x] [Feature] [Bot] Implement `/restart` command [Ref: docs/specs/self_healing_spec.md] [Difficulty: 3] - COMPLETED 2026-02-20
  - **Summary:** Telegram command to kill watcher, clear stale lock, spawn new watcher, report diagnostics.
  - **File(s):** scripts/bot/bot.js (new handler)
  - **Action:** Add `/restart` handler with watcher kill, lock cleanup, log tail, watcher spawn.
  - **Scope Boundary:** ONLY modify bot.js. Do NOT touch watcher.sh.
  - **Acceptance:** `npm test` passes; `/restart` in Telegram restarts watcher.
- [x] [Feature] [Testing] Add `/restart` regression tests [Ref: docs/specs/self_healing_spec.md] [Difficulty: 2] - COMPLETED 2026-02-20
  - **Summary:** Tests for restart handler, lock cleanup, BOT_COMMANDS update.
  - **File(s):** scripts/bot/bot.test.js
  - **Dependencies:** Requires `/restart` command.
  - **Acceptance:** `npm test` passes with new tests.
- [x] [Feature] [Infra] Create external watchdog script + launchd plist [Ref: docs/specs/self_healing_spec.md] [Difficulty: 4] - COMPLETED 2026-02-20
  - **Summary:** Independent process that monitors bot + watcher PIDs, auto-restarts on crash.
  - **File(s):** scripts/watchdog.sh (NEW), com.antigravity.watchdog.plist (NEW)
  - **Action:** Create health check script with restart loop guard (max 3/hour). Create launchd plist.
  - **Scope Boundary:** ONLY create new files. Do NOT modify existing scripts.
  - **Acceptance:** `bash -n watchdog.sh` passes.
- [x] [Feature] [Bot] Add `/watchdog` status command + tests [Ref: docs/specs/self_healing_spec.md] [Difficulty: 3] - COMPLETED 2026-02-20
  - **Summary:** Shows watchdog status (last restart, restart count, uptime) in Telegram.
  - **File(s):** scripts/bot/bot.js, scripts/bot/bot.test.js
  - **Dependencies:** Requires watchdog script.
  - **Acceptance:** `npm test` passes; `/watchdog` shows status in Telegram.
- [x] [Feature] [Infra] Add LLM diagnosis trigger to watchdog [Ref: docs/specs/self_healing_spec.md] [Difficulty: 5] - COMPLETED 2026-02-20
  - **Summary:** Watchdog detects ≥2 crashes/hour, spawns Kilo CLI to diagnose from logs, reports to Telegram.
  - **File(s):** scripts/watchdog.sh (existing), scripts/diagnose_prompt.txt (NEW)
  - **Action:** Add crash count check, build diagnosis prompt from log tails, spawn `kilo run --auto`.
  - **Scope Boundary:** ONLY modify watchdog.sh and create diagnose_prompt.txt. Do NOT touch bot.js.
  - **Acceptance:** `bash -n watchdog.sh` passes; diagnosis trigger logic present.
- [x] [Feature] [Bot] Add `/diagnose` manual trigger command [Ref: docs/specs/self_healing_spec.md] [Difficulty: 3] - COMPLETED 2026-02-20
  - **Summary:** Telegram command to manually trigger LLM diagnosis from watcher + bot logs.
  - **File(s):** scripts/bot/bot.js (new handler)
  - **Action:** Add `/diagnose` handler: collects last 30 lines of logs, writes diagnosis prompt to inbox.
  - **Scope Boundary:** ONLY modify bot.js. Do NOT touch watcher.sh or watchdog.sh.
  - **Acceptance:** `npm test` passes; `/diagnose` in Telegram triggers LLM analysis.
- [x] [Feature] [Testing] Add Phase 3 diagnosis regression tests [Ref: docs/specs/self_healing_spec.md] [Difficulty: 2] - COMPLETED 2026-02-20
  - **Summary:** Tests for /diagnose handler, BOT_COMMANDS, watchdog diagnosis trigger, dedup guard.
  - **File(s):** scripts/bot/bot.test.js
  - **Dependencies:** Requires diagnosis trigger + /diagnose command.
  - **Acceptance:** `npm test` passes with new tests.
- [x] [Security] [Watcher] Quote `$MODEL_FLAG` or add model allowlist validation [Difficulty: 1] - COMPLETED 2026-02-20
- [x] [Bug] [Watcher] Fix false-positive rate limit detection — check exit code not stderr grep [Ref: docs/retrospectives/2026-02-18_telegram_plan_mode_and_model_reliability.md] [Difficulty: 2] - COMPLETED 2026-02-20
- [x] [Feature] [Hooks] Create BeforeAgent hook script for inbox injection [Ref: docs/specs/hook_bridge_spec.md] [Difficulty: 3] - COMPLETED 2026-02-15
- [x] [Feature] [Hooks] Create AfterAgent hook script for outbox writing [Ref: docs/specs/hook_bridge_spec.md] [Difficulty: 3] - COMPLETED 2026-02-15
- [x] [Feature] [Bot] Implement Telegram message listener bot [Ref: docs/specs/hook_bridge_spec.md] [Difficulty: 5] - COMPLETED 2026-02-15
- [x] [Infra] [Config] Create .gemini/settings.json hook configuration [Ref: docs/specs/hook_bridge_spec.md] [Difficulty: 2] - COMPLETED 2026-02-15
- [x] [Feature] [Bot] Implement outbox poller and message sender [Ref: docs/specs/hook_bridge_spec.md] [Difficulty: 4] - COMPLETED 2026-02-15
- [x] [Docs] Write setup and usage guide [Ref: docs/specs/hook_bridge_spec.md] [Difficulty: 2] - COMPLETED 2026-02-15
- [x] [Feature] [Sprint] Implement Sprint Mode with stop signal protocol [Ref: docs/specs/hook_bridge_spec.md] [Difficulty: 6] - COMPLETED 2026-02-15
- [x] [Research] [Platform] Evaluate Telegram vs WhatsApp for simplicity and reliability [Difficulty: 3] - COMPLETED 2026-02-15
- [x] [Feature] [Multi-Project] Implement `/project`, `/add`, `/list` and `watcher.sh` context switching - COMPLETED 2026-02-15
- [x] [Infra] [Hooks] Implement Wrapper Script strategy for spaced paths - COMPLETED 2026-02-15
- [x] [Feature] [Watcher] File-based session history (`session_history.txt`) - COMPLETED 2026-02-16
- [x] [Feature] [Bot] `/model` command with inline keyboard for model selection - COMPLETED 2026-02-16
- [x] [Feature] [Bot] `/project` command with inline keyboard for project selection - COMPLETED 2026-02-16
- [x] [Infra] `start.sh` one-script launcher with start/stop/status - COMPLETED 2026-02-16
- [x] [Security] Security review with OpenClaw.ai comparison - COMPLETED 2026-02-16
- [x] [Docs] README rewrite with architecture, commands, and startup instructions - COMPLETED 2026-02-16
- [x] [Implementation] Propose improvements to pr_check.md for project branches
- [x] [Research] Analyze current pr_check.md workflow
- [x] [Analysis] Evaluate multi-project branch validation requirements
- [x] [Docs] Update documentation_system_map.md for new workflows
- [x] [SOP] Synchronize workstation_sop.md with project template
- [x] [Workflow] Refactor pr_check.md to validation-only
- [x] [Workflow] Create merge_changes.md global workflow
- [x] [Bug] [Watcher] Fix plan mode auto-clear on dispatch approval [Difficulty: 2] - COMPLETED 2026-02-18
- [x] [Bug] [Bot] Fix ep_next→ep_continue callback mismatch [Difficulty: 1] - COMPLETED 2026-02-18
- [x] [Feature] [Testing] Add callback mismatch regression test [Difficulty: 2] - COMPLETED 2026-02-18
- [x] [Feature] [Testing] Expand regression suite to 99 tests [Difficulty: 3] - COMPLETED 2026-02-18
- [x] [Feature] [Planning] Update spec template (_TEMPLATE.md v2.0) with §9-12: Work Orders, Dependency Graph, Execution Plan, Parallelism [Ref: builder_ready_planning_spec.md] [Difficulty: 3]
- [x] [Feature] [Planning] Update plan_feature.md workflow with Phase 3.5 (Dependency Graph) + Phase 4 (Execution Plan & Approval Gate) [Ref: builder_ready_planning_spec.md] [Difficulty: 5]
- [x] [Feature] [Planning] Update implement_task.md workflow with 4 execution guards (Scope, Signature, Boundary, Unclear Task) [Ref: builder_ready_planning_spec.md] [Difficulty: 3]
- [x] [Feature] [Planning] Propagate spec template + workflow changes to antigravity project template [Ref: builder_ready_planning_spec.md] [Difficulty: 2]
- [x] [Feature] [Planning] Add Builder-Ready Output Standard to SOP (workstation_sop.md v3.1) [Ref: builder_ready_planning_spec.md] [Difficulty: 3]
- [x] [Feature] [Planning] Validate builder-ready workflow with real feature dispatch (/version command) [Ref: builder_ready_planning_spec.md] [Difficulty: 2]
- [x] Add `get_backend()` + `run_agent()` abstraction to watcher.sh [Difficulty: 5]
- [x] Add `/backend` command to bot.js with inline keyboard [Difficulty: 4]
- [x] Add callback handler for backend selection [Difficulty: 3]
- [x] [Security] [Bot] Add CHAT_ID check to callback_query handler [Difficulty: 1] - COMPLETED 2026-02-20
- [x] [Docs] [Bot] Critical review specs: bot_refactoring_spec.md + bot_test_refactoring_spec.md - COMPLETED 2026-02-20
- [x] [Infra] [Git] Merge telegram/active, delete destructive session branch, cleanup remotes - COMPLETED 2026-02-20

## Deleted

- [ ] ->
