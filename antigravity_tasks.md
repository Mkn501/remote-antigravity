# Tasks - Antigravity Tasks

## In Progress

- [ ] [Security] [Bot] Add CHAT_ID check to callback_query handler [Difficulty: 1]

## To Do

- [ ] [Feature] [Watcher] Backend-agnostic CLI support (Gemini + Kilo) [Ref: docs/specs/backend_agnostic_watcher_spec.md] [Difficulty: 4]
- [ ] Extend regression test suite (12 new tests for backend abstraction) [Difficulty: 4]
- [ ] Update cli_comparative_analysis.md with Kilo headless findings [Difficulty: 2]
- [ ] **Category**: [Bug], [Feature], [Infra], [Research], [Docs], [Security], [Release], [UX], [Architecture]
- [ ] **Topic**: Optional sub-area (e.g., [Hooks], [Bot], [WhatsApp])
- [ ] **Difficulty**: 1 (Trivial) to 10 (Expert/Arch Change)
- [ ] **Jules**: [Jules: Yes] if atomic, deterministic, and testable (see plan_feature.md)
- [ ] ->
- [ ] [Feature] [Bot] Implement `/version` command handler [Ref: docs/specs/telegram_version_command_spec.md] [Difficulty: 2]
- [ ] **Summary:** Adds a command to display the current bot version and process uptime.
- [ ] **File(s):** scripts/bot/bot.js
- [ ] **Action:** Add `bot.onText(/\/version/, ...)` handler.
- [ ] **Signature:** `(msg) => Promise<void>`
- [ ] **Scope Boundary:** ONLY modify bot.js. Do NOT touch other handlers.
- [ ] **Dependencies:** None
- [ ] **Parallel:** Yes
- [ ] **Acceptance:** `/version` returns "🤖 wa-bridge vX.Y.Z" and "⏱️ Uptime: ...".
- [ ] **Tier:** ⚡ Mid
- [ ] [Feature] [Bot] Add regression test for `/version` command [Ref: docs/specs/telegram_version_command_spec.md] [Difficulty: 2]
- [ ] **Summary:** Ensures the /version command returns the expected format and doesn't crash.
- [ ] **File(s):** scripts/bot/bot.test.js
- [ ] **Action:** Add a test case that mocks the message and asserts the response.
- [ ] **Signature:** `await test('/version command returns version and uptime', ...)`
- [ ] **Scope Boundary:** ONLY modify bot.test.js.
- [ ] **Dependencies:** None
- [ ] **Parallel:** Yes
- [ ] **Acceptance:** `npm test` passes.
- [ ] **Tier:** ⚡ Mid
- [ ] [Security] [Watcher] Quote `$MODEL_FLAG` or add model allowlist validation [Difficulty: 1]
- [ ] [Bug] [Watcher] Fix false-positive rate limit detection — check exit code not stderr grep [Ref: docs/retrospectives/2026-02-18_telegram_plan_mode_and_model_reliability.md] [Difficulty: 2]
- [ ] [Research] [Reliability] Investigate Flash + Sandbox replace errors on large files [Ref: docs/retrospectives/2026-02-18_telegram_plan_mode_and_model_reliability.md] [Difficulty: 3]

## Backlog

- [ ] Replace inline Gemini invocation with `run_agent()` [Difficulty: 4]
- [ ] Generalize prompt tool references (generic tool names) [Difficulty: 2]
- [ ] Update `/help`, `/status`, BOT_COMMANDS [Difficulty: 2]
- [ ] Update systemPatterns.md (architecture diagram + P-005) [Difficulty: 2]

## Done

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

## Deleted

- [ ] ->
