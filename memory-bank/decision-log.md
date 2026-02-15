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
