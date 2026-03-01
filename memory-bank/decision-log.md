# Decision Log

## 001: Project Initialization
- **Context**: Setting up Remote Antigravity as a standalone project.
- **Decision**: Use Antigravity Template.
- **Consequences**: Standardized structure from day one.

## 002: No OpenClaw Dependency
- **Context**: Evaluated OpenClaw as a messaging gateway.
- **Decision**: Use direct Gemini CLI hooks + lightweight bot instead.
- **Rationale**: Simpler, fewer moving parts, no external gateway dependency.
- **Consequences**: Need to implement message relay bot from scratch, but it's ~50 lines of code.

## 003: File-Based Message Protocol
- **Context**: Need a communication channel between the message bot and Gemini CLI hooks.
- **Decision**: Use JSON files (`wa_inbox.json`, `wa_outbox.json`) as the message queue.
- **Rationale**: Hooks can only read stdin/write stdout. File-based protocol is debuggable, simple, and works with any hook language (bash, node, python).
- **Consequences**: Need file watching in the bot; potential race conditions (mitigated by atomic writes).

## 004: Wrapper Scripts for Hooks
- **Context**: Paths with spaces (e.g. `Google Drive`) break Gemini hook execution.
- **Decision**: Generate wrapper scripts in `~/.gemini/wa_bridge_wrappers/` for all hooks.
- **Rationale**: Isolates the hook runner from space-containing paths. Standardizes execution environment without relying on symlinks (which are resolved eagerly).
- **Consequences**: `setup_project.sh` must check/create `~/.gemini` directory structure. Hooks are indirect.

## 005: File-Based Session History
- **Context**: Injecting outbox history into prompts hit token limits and contaminated output.
- **Decision**: Store conversation history in `.gemini/session_history.txt`, referenced by Gemini as a file.
- **Rationale**: Decouples history from prompt engineering, supports longer conversations, Gemini reads the file itself.
- **Consequences**: History file must be cleared on new branch creation. Added to `.gitignore`.

## 006: Inline Keyboards for Model & Project Selection
- **Context**: Typing exact model IDs and project names is error-prone on mobile.
- **Decision**: Use Telegram inline keyboards with tap-to-select buttons for `/model` and `/project`.
- **Rationale**: Better UX, no typos, shows current selection with ✅ indicator.
- **Consequences**: Callback query handler needed — must include CHAT_ID auth check.

## 007: Accept `--yolo` Risk for Personal Use
- **Context**: Security review identified `--yolo` as auto-approving all Gemini tool calls.
- **Decision**: Accept the risk for single-user personal use.
- **Rationale**: Attack surface is limited to Telegram CHAT_ID compromise. No network exposure, no plugin marketplace, no multi-user auth.
- **T&E**: [Security review retrospective](../docs/retrospectives/2026-02-16_telegram_bot_security_review.md)
- **Key Lesson**: `--yolo` is a trust decision — acceptable for personal bots, never for shared/team setups.

## 008: Decoupled Validation and Merge Workflows (2026-02-16)
- **Decision**: Split `/pr_check` into validation-only and created a separate `/merge_changes` workflow.
- **Rationale**: Merging was buried inside the validation workflow, violating separation of concerns. The user must always retain final merge authority.
- **Outcome**: `/pr_check` produces a `.pr_check_result.json` state file; `/merge_changes` gates on that file. Rollback playbook and conflict handling added.
- **Key Lesson**: Validation and execution are separate trust boundaries — never combine "should we?" with "do it."

## 009: Project-Aware Dispatch (2026-03-01)
- **Decision**: Add `project` field to `wa_dispatch.json` at plan-approval; watcher reads it for dispatch execution instead of `state.activeProject`.
- **Rationale**: Dispatch tasks belong to the project they were planned for, not whichever project is currently active. Discovered when 3 dispatch runs silently committed nothing — CLI was in the wrong repo.
- **Outcome**: Pending implementation (see `docs/specs/multi_project_routing_fix_spec.md`).
- **T&E**: [Retrospective](../docs/retrospectives/2026-03-01_multi_project_dispatch_routing_bug.md)
- **Key Lesson**: Dispatch files must be self-contained — carry all routing info needed to execute, never rely on transient state.
