# Comparison: Remote Antigravity vs. HKUDS/nanobot

**Date**: 2026-02-16
**Subject**: Comparative analysis of our current Telegram bridge ("Remote Antigravity") vs. [HKUDS/nanobot](https://github.com/HKUDS/nanobot).

## Executive Summary

**Remote Antigravity** is a specialized **interface layer** designed to bridge the Gemini CLI with Telegram. It is not an agent itself but a remote control for your existing workstation agent.

**HKUDS/nanobot** is a standalone, lightweight **autonomous agent** (Python-based) that runs its own reasoning loop, memory system, and tool execution. It is comparable to the Gemini CLI itself, rather than our bridge.

| Feature | Remote Antigravity (Ours) | HKUDS/nanobot |
| :--- | :--- | :--- |
| **Primary Role** | **Relay/Bridge** for Gemini CLI | **Standalone Agent** (OpenClaw alt) |
| **Architecture** | Node.js Bot + Bash Watcher + Gemini CLI | Monolithic Python Script (~4k LOC) |
| **Reasoning Engine** | Gemini CLI (stateless `-p` calls) | Internal Loop (LLM API calls) |
| **State/Memory** | Session files (`session_history.txt`) | Two-layer Grep-based Retrieval |
| **Multi-Platform** | Telegram (extensible via adapter) | Telegram, Slack, Discord, WeChat, etc. |
| **Complexity** | ~250 LOC (Bot) + Shell scripts | ~4,000 LOC (Core Agent) |
| **User Base** | Single-user (Private Tool) | General Purpose / Research |

## Detailed Analysis

### 1. Architecture & Design Philosophy

**Our Implementation (Remote Antigravity):**
- **Design:** "Federated" approach. The intelligence stays in the `gemini` CLI tool installed on your machine. The bot is merely a dumb pipe transmitting text to the CLI and returning stdout.
- **Advantage:** You keep using your established context, tools, and `memory-bank` without migration. It respects your existing `.gemini/` configuration.
- **Disadvantage:** Limited by the CLI's stateless nature (requires re-reading context every turn).

**HKUDS/nanobot:**
- **Design:** "All-in-one" Python agent. It handles the LLM API connection, prompt engineering, context management, and tool execution internally.
- **Advantage:** Optimized for speed and autonomy. It has a built-in "grep-based" memory system that might be faster than reading full context files.
- **Disadvantage:** It's a separate stack. Adopting it would mean replacing Gemini CLI or running two separate agents.

### 2. Capabilities

**Our Implementation:**
- Can execute *any* tool available to Gemini CLI (system management, file editing, MCP servers).
- Tightly integrated with the `antigravity` workflow (`/startup`, `/shutdown`, sprint mode).
- "Sprint Mode" is a unique feature tailored to your specific workflow.

**HKUDS/nanobot:**
- Has built-in tools for generic tasks (tmux, shell, file ops).
- Stronger focus on "Personal Assistant" tasks (email, market analysis) rather than deep software engineering cycles.
- Multi-platform support is superior out-of-the-box.

### 3. Recommendation

**Keep Remote Antigravity if:**
- Your primary goal is to control your *existing* dev environment and Gemini CLI session.
- You want to maintain the "Context-Driven" workflow (Memory Bank, etc.) without re-implementing it in a new agent.
- You prefer a lightweight Node.js/Bash glue layer over maintaining a Python agent.

**Explore nanobot if:**
- You want a secondary, lightweight agent for quick tasks (checking emails, simple queries) that doesn't need full project context.
- You are dissatisfied with Gemini CLI's performance/cost and want to build a custom Python-based agent.
- You need multi-platform support (e.g., control from Discord) immediately.

## Conclusion

They solve different problems. `nanobot` is a **replacement for Gemini CLI**, while `Remote Antigravity` is a **remote control for it**. Switching to nanobot would be a platform migration, not just a bot upgrade.
