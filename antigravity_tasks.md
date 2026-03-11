# Tasks - Antigravity Tasks

## In Progress

- [ ] [Feature] [Bot] Implement `/ping` command [Ref: docs/specs/ping_command_spec.md] [Difficulty: 1]

## To Do

- [ ] [Architecture] [Watcher] WO-SES-0: Sync Kilo agent configs — update `sop-coordinator`, `sop-planner`, `sop-developer`, `sop-auditor` to use anthropic proxy models + sync system prompts from `workstation_sop.md §6` [Ref: docs/specs/kilo_session_persistent_spec.md] [Difficulty: 2] [Jules: Yes]
- [ ] [Research] S-SES-1: Spike — validate `--session` + `--agent` flags work together (agent switch mid-session preserves context) [Ref: docs/specs/kilo_session_persistent_spec.md] [Difficulty: 2]
- [ ] [Architecture] [Watcher] WO-SES-1: Refactor `run_agent()` for session resume + JSON output in `scripts/watcher.sh` (lines ~135-220) [Ref: docs/specs/kilo_session_persistent_spec.md] [Difficulty: 5]
- [ ] [Architecture] [Watcher] WO-SES-2: Add session lifecycle management (create on /startup, resume on messages, close on /shutdown) in `scripts/watcher.sh` (lines ~340-500) [Ref: docs/specs/kilo_session_persistent_spec.md] [Difficulty: 4]
- [ ] [Architecture] [Watcher] WO-SES-3: Replace model routing with `--agent` flag selection in `scripts/watcher.sh` (lines ~275-310) [Ref: docs/specs/kilo_session_persistent_spec.md] [Difficulty: 3]
- [ ] [Architecture] [Watcher] WO-SES-4: Implement edge case handlers (expired session, rate limit, context overflow fork) [Ref: docs/specs/kilo_session_persistent_spec.md] [Difficulty: 4]
- [ ] [Architecture] [Watcher] WO-SES-5: Remove legacy mechanisms (telegram_reply.txt, TIER_MAP, text scraping) from `scripts/watcher.sh` [Ref: docs/specs/kilo_session_persistent_spec.md] [Difficulty: 3]
- [ ] [Feature] [Testing] WO-SES-6: Add session-persistence tests to `scripts/bot/bot_test_v3.js` [Ref: docs/specs/kilo_session_persistent_spec.md] [Difficulty: 3]
- [ ] [Docs] WO-SES-7: Add Pattern P-008 (Session-Persistent Kilo) to `memory-bank/systemPatterns.md` + update guide [Ref: docs/specs/kilo_session_persistent_spec.md] [Difficulty: 1] [Jules: Yes]

## Backlog

- [ ] [Feature] [Testing] Add `/ping` regression test [Ref: docs/specs/ping_command_spec.md] [Difficulty: 1]
- [ ] [Feature] [Bot] Add dispatch mode field and Auto-Run button [Ref: docs/specs/parallel_kilo_dispatch_spec.md] [Difficulty: 2]
- [ ] [Feature] [Watcher] Implement auto-continue dispatch mode [Ref: docs/specs/parallel_kilo_dispatch_spec.md] [Difficulty: 3]
- [ ] [Feature] [Testing] Add auto-continue regression tests [Ref: docs/specs/parallel_kilo_dispatch_spec.md] [Difficulty: 2]
- [ ] [Feature] [Watcher] Implement parallel dispatch with git worktrees [Ref: docs/specs/parallel_kilo_dispatch_spec.md] [Difficulty: 7]
- [ ] [Feature] [Testing] Add parallel dispatch E2E + regression tests [Ref: docs/specs/parallel_kilo_dispatch_spec.md] [Difficulty: 4]
- [ ] [Research] [Reliability] Investigate Flash + Sandbox replace errors on large files [Ref: docs/retrospectives/2026-02-18_telegram_plan_mode_and_model_reliability.md] [Difficulty: 3]
- [ ] [Feature] Integrate Claude Code CLI as a new backend option [Difficulty: 5]

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
- [x] [Feature] [Bot] Add regression test for `/version` command [Ref: docs/specs/telegram_version_command_spec.md] [Difficulty: 2] - COMPLETED 2026-02-20
- [x] [Feature] [Bot] Implement `/restart` command [Ref: docs/specs/self_healing_spec.md] [Difficulty: 3] - COMPLETED 2026-02-20
- [x] [Feature] [Testing] Add `/restart` regression tests [Ref: docs/specs/self_healing_spec.md] [Difficulty: 2] - COMPLETED 2026-02-20
- [x] [Feature] [Infra] Create external watchdog script + launchd plist [Ref: docs/specs/self_healing_spec.md] [Difficulty: 4] - COMPLETED 2026-02-20
- [x] [Feature] [Bot] Add `/watchdog` status command + tests [Ref: docs/specs/self_healing_spec.md] [Difficulty: 3] - COMPLETED 2026-02-20
- [x] [Feature] [Infra] Add LLM diagnosis trigger to watchdog [Ref: docs/specs/self_healing_spec.md] [Difficulty: 5] - COMPLETED 2026-02-20
- [x] [Feature] [Bot] Add `/diagnose` manual trigger command [Ref: docs/specs/self_healing_spec.md] [Difficulty: 3] - COMPLETED 2026-02-20
- [x] [Feature] [Testing] Add Phase 3 diagnosis regression tests [Ref: docs/specs/self_healing_spec.md] [Difficulty: 2] - COMPLETED 2026-02-20
- [x] [Security] [Watcher] Quote `$MODEL_FLAG` or add model allowlist validation [Difficulty: 1] - COMPLETED 2026-02-20
- [x] [Bug] [Watcher] Fix false-positive rate limit detection [Ref: docs/retrospectives/2026-02-18_telegram_plan_mode_and_model_reliability.md] [Difficulty: 2] - COMPLETED 2026-02-20
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
- [x] [Feature] [Planning] Update spec template (_TEMPLATE.md v2.0) with §9-12 [Ref: builder_ready_planning_spec.md] [Difficulty: 3]
- [x] [Feature] [Planning] Update plan_feature.md workflow with Phase 3.5 + Phase 4 [Ref: builder_ready_planning_spec.md] [Difficulty: 5]
- [x] [Feature] [Planning] Update implement_task.md workflow with 4 execution guards [Ref: builder_ready_planning_spec.md] [Difficulty: 3]
- [x] [Feature] [Planning] Propagate spec template + workflow changes to antigravity project template [Ref: builder_ready_planning_spec.md] [Difficulty: 2]
- [x] [Feature] [Planning] Add Builder-Ready Output Standard to SOP [Ref: builder_ready_planning_spec.md] [Difficulty: 3]
- [x] [Feature] [Planning] Validate builder-ready workflow with real feature dispatch [Ref: builder_ready_planning_spec.md] [Difficulty: 2]
- [x] Add `get_backend()` + `run_agent()` abstraction to watcher.sh [Difficulty: 5]
- [x] Add `/backend` command to bot.js with inline keyboard [Difficulty: 4]
- [x] Add callback handler for backend selection [Difficulty: 3]
- [x] [Security] [Bot] Add CHAT_ID check to callback_query handler [Difficulty: 1] - COMPLETED 2026-02-20
- [x] [Docs] [Bot] Critical review specs: bot_refactoring_spec.md + bot_test_refactoring_spec.md - COMPLETED 2026-02-20
- [x] [Infra] [Git] Merge telegram/active, delete destructive session branch, cleanup remotes - COMPLETED 2026-02-20
- [x] [Feature] E2E validation: Telegram → Kilo CLI → Claude via proxy → commit [Ref: docs/specs/kilo_antigravity_claude_proxy_spec.md] [Difficulty: 5]
- [x] [Infra] Add antigravity-claude-proxy lifecycle to start.sh [Ref: docs/specs/kilo_antigravity_claude_proxy_spec.md] [Difficulty: 3]
- [x] [Infra] Create Kilo CLI opencode.json with Anthropic provider → localhost:8080 [Ref: docs/specs/kilo_antigravity_claude_proxy_spec.md] [Difficulty: 2]
- [x] [Feature] [Bot] Add Claude model options to /model when backend=kilo [Ref: docs/specs/kilo_antigravity_claude_proxy_spec.md] [Difficulty: 4]
- [x] [Security] [Bot] Remove duplicate `/kill` handler (SEC-4, P0) [Ref: docs/specs/bot_refactoring_spec.md] [Difficulty: 1] - COMPLETED in bot_v2.js
- [x] [Security] [Bot] Fix overly broad `pkill` patterns in `/kill` (SEC-2, P0) [Ref: docs/specs/bot_refactoring_spec.md] [Difficulty: 1] - COMPLETED in bot_v2.js
- [x] [Bug] [Bot] Fix undefined `PROJECT_DIR` in `/apply_fix` and `/discard_fix` (MAINT-4, P0) [Ref: docs/specs/bot_refactoring_spec.md] [Difficulty: 1] - COMPLETED in bot_v2.js
- [x] [Security] [Bot] Add branch name sanitization in `/apply_fix` (SEC-1, P1) [Ref: docs/specs/bot_refactoring_spec.md] [Difficulty: 1] - COMPLETED in bot_v2.js
- [x] [Bug] [Bot] Remove duplicate dotenv import (MAINT-2, P1) [Ref: docs/specs/bot_refactoring_spec.md] [Difficulty: 1] - COMPLETED in bot_v2.js
- [x] [Bug] [Bot] Use `getState()` consistently (MAINT-3, P1) [Ref: docs/specs/bot_refactoring_spec.md] [Difficulty: 1] - COMPLETED in bot_v2.js
- [x] [Bug] [Testing] Fix stale BOT_COMMANDS in test [Ref: docs/specs/bot_test_refactoring_spec.md] [Difficulty: 1] - COMPLETED in bot_test_v2.js
- [x] [Bug] [Testing] Fix atomicWrite divergence in bot.test.js [Ref: docs/specs/bot_test_refactoring_spec.md] [Difficulty: 1] - COMPLETED in bot_test_v2.js
- [x] [Bug] [Routing] Add `project` to execution plan in watcher plan-creation [Ref: docs/specs/multi_project_routing_fix_spec.md] [Difficulty: 2]
- [x] [Bug] [Routing] Add `project` to `writeDispatch()` in bot [Ref: docs/specs/multi_project_routing_fix_spec.md] [Difficulty: 1]
- [x] [Bug] [Routing] Use dispatch `project` in watcher dispatch execution [Ref: docs/specs/multi_project_routing_fix_spec.md] [Difficulty: 2]
- [x] [Bug] [Routing] Add regression tests for project-aware dispatch [Ref: docs/specs/multi_project_routing_fix_spec.md] [Difficulty: 2]
