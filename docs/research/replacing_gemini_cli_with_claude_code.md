# Claude Code Investigation & Comparison

This document outlines the investigation into replacing or augmenting **Gemini CLI** with **Claude Code CLI** (by Anthropic).

## Executive Summary

**Claude Code CLI** is a robust, "agentic" terminal tool powered by Claude 3.7 Sonnet. Unlike a simple API wrapper, it is a full-fledged agent designed to autonomously navigate files, run tests, and refactor code.

While it is a powerful tool for *interactive coding*, replacing Gemini CLI as the *backbone* of our `antigravity` system (which uses a specific hook-based message loop) would require significant architectural changes.

## Feature Comparison

| Feature | Gemini CLI | Claude Code CLI |
| :--- | :--- | :--- |
| **Core Model** | Gemini 2.5/3 Pro | Claude 3.7 Sonnet |
| **Primary Use** | Generalist Agent & Workflow Automation | Specialized "Pair Programmer" / Coding Agent |
| **Context System** | `GEMINI.md`, `memory-bank/` (Convention) | `CLAUDE.md` (Native), Hierarchical context |
| **Session State** | Checkpoints, `wa_session.lock` | Native persistence (`-c`, `-r <id>`), Web-to-CLI Teleport |
| **Connectivity** | Google Cloud / Vertex AI | Anthropic API |
| **Cost** | Free tier available / Google Cloud credits | Paid (Pro/Team subscription or API credits) |
| **Extensibility** | Python/JS Skills, Native Hooks | MCP (Model Context Protocol), Custom Slash Commands |

## Feasibility for "Remote Antigravity"

The current project relies on a specific "bridge" architecture (`hook_bridge_spec.md`) that assumes:
1.  A specific lifecycle (`BeforeAgent` -> Agent -> `AfterAgent`).
2.  Message passing via files (`wa_inbox.json`).

### Can Claude Code replace this?
*   **Yes, but with friction.**
*   **Session Management:** Claude Code supports persistent sessions via `claude --resume <id>`. We could map our `wa_session` IDs to Claude session IDs.
*   **Non-Interactive Mode:** We can use `claude -p "prompt"` for single-turn interactions, but we lose the "chat" state unless we manage the session ID carefully.
*   **Teleportation:** A unique feature where you can start a coding task in the terminal and "hand off" to the web UI (or vice versa). This is a *superpower* our current system lacks.

## Migration Strategy (Draft)

If we were to migrate, the steps would be:

1.  **Install:**
    ```bash
    npm install -g @anthropic-ai/claude-code
    # OR
    brew install --cask claude-code
    ```
2.  **Auth:** run `claude login`.
3.  **Context Migration:**
    *   Rename `GEMINI.md` -> `CLAUDE.md`.
    *   Convert `memory-bank/` references to be explicitly loaded or summarized in `CLAUDE.md`.
4.  **Wrapper Script (`watcher.sh` update):**
    *   Instead of `gemini run ...`, calls:
        ```bash
        claude --resume "antigravity_session" -p "$(cat incoming_message.txt)" > response.txt
        ```
    *   *Challenge:* Parsing Claude's output (which often includes rich terminal formatting/spinners) into a clean text format for Telegram is harder than Gemini CLI's cleaner stdout.

## Recommendation

**Verdict: Hybrid Approach Recommended.**

Do **NOT** replace Gemini CLI as the main "operating system" of the agent yet. The text-processing and general reasoning cost/performance ratio of Gemini is superior for the "Chat" layer.

**Instead, add Claude as a "Skill":**
1.  Keep Gemini CLI for the main loop (talking to Telegram, reading files, planning).
2.  Give Gemini a tool (`run_claude_agent`) that invokes `claude` for specific, deep coding tasks.
    *   *User:* "Refactor the entire auth module."
    *   *Gemini:* "That's a big task. I'll dispatch it to Claude." -> Runs `claude -p "Refactor auth..."` -> Returns result to user.

### Why?
*   **Cost Efficiency:** Don't pay Claude prices for saying "Hello" or summarizing logs.
*   **Specialization:** Let Claude do what it's best at (heavy coding loops) and Gemini do what it's best at (fast, long-context reasoning & orchestration).
