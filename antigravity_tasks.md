# Tasks - Antigravity Tasks

<!-- TEMPLATE_VERSION: 2.0.0 -->
<!--
### Task Schema
Format: `- [ ] [Category] [Topic] Description [Ref: path/to/spec] [Difficulty: 1-10] [Jules: Yes]`

- **Category**: [Bug], [Feature], [Infra], [Research], [Docs], [Security], [Release], [UX], [Architecture]
- **Topic**: Optional sub-area (e.g., [Hooks], [Bot], [WhatsApp])
- **Difficulty**: 1 (Trivial) to 10 (Expert/Arch Change)
- **Jules**: [Jules: Yes] if atomic, deterministic, and testable (see plan_feature.md)
-->

## In Progress

- [ ] [Security] [Bot] Add CHAT_ID check to callback_query handler [Difficulty: 1]

## To Do

- [ ] [Security] [Watcher] Quote `$MODEL_FLAG` or add model allowlist validation [Difficulty: 1]

## Backlog

- [ ] [Feature] [Watcher] Backend-agnostic CLI support (Gemini + Kilo) [Ref: docs/specs/backend_agnostic_watcher_spec.md] [Difficulty: 4]
  - [ ] Add `get_backend()` + `run_agent()` abstraction to watcher.sh [Difficulty: 5]
  - [ ] Replace inline Gemini invocation with `run_agent()` [Difficulty: 4]
  - [ ] Generalize prompt tool references (generic tool names) [Difficulty: 2]
  - [ ] Add `/backend` command to bot.js with inline keyboard [Difficulty: 4]
  - [ ] Add callback handler for backend selection [Difficulty: 3]
  - [ ] Update `/help`, `/status`, BOT_COMMANDS [Difficulty: 2]
  - [ ] Update systemPatterns.md (architecture diagram + P-005) [Difficulty: 2]
  - [ ] Update cli_comparative_analysis.md with Kilo headless findings [Difficulty: 2]
  - [ ] Extend regression test suite (12 new tests for backend abstraction) [Difficulty: 4]

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

## Notes

## Deleted

- [ ] ->
