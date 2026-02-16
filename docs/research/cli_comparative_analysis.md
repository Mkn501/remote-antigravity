# Comprehensive CLI Agent Comparison: Gemini CLI vs. Claude Code vs. Kilo CLI

**Date:** 2026-02-16
**Status:** Draft / Research
**Context:** "Remote Antigravity" Project

## 1. Executive Summary

This report compares three leading CLI-based AI agents to determine the optimal tooling strategy for the "Remote Antigravity" project.
*   **Gemini CLI:** The current incumbent. A robust, Google-ecosystem-native generalist with a huge context window and high performance-to-cost ratio.
*   **Claude Code:** Anthropic's specialized "coding agent" (Claude 3.7 Sonnet), offering deep reasoning for complex refactoring and a unique terminal-to-web workflow ("Teleporting").
*   **Kilo CLI:** A flexible, model-agnostic local agent (formerly Kilocode) that prioritizes zero-config setup and broad model support (including local/free models).

**Verdict:** **Gemini CLI remains the best "Operating System"** for the project's chat loop due to speed and cost, but **Claude Code should be integrated as a specialized "Skill"** for heavy coding tasks. Kilo CLI is a strong backup for offline/local-only scenarios but lacks the ecosystem integration required for our primary workflow.

---

## 2. Feature Comparison Matrix

| Feature | Gemini CLI | Claude Code | Kilo CLI |
| :--- | :--- | :--- | :--- |
| **Core Model** | **Gemini 2.0 Flash / Pro** | **Claude 3.7 Sonnet** | **Model Agnostic** (Gemini, Claude, GPT-4, Local LLMs via Ollama) |
| **Primary Strength** | **Long Context & Speed**. Can ingest entire codebases (1M+ tokens) cheaply. | **Deep Reasoning & "Dev" UX**. Specialized for complex refactoring and test-driven dev. | **Flexibility & Privacy**. Runs anywhere, supports local models, zero-config. |
| **Context Awareness** | `GEMINI.md`, `memory-bank/` (Convention), Project-wide scanning. | `CLAUDE.md`, Hierarchical context, Native session persistence. | Git Root detection, `.kilo/` config, auto-discovery. |
| **Tooling / Skills** | **Native Tools** (Google Search, Shell, File). Custom "Skills" via TS/JS. | **MCP Support** (Model Context Protocol). Custom slash commands. | **MCP Support**. Native support for Model Context Protocol servers. |
| **Connectivity** | **Google Cloud / Vertex AI**. Deep integration with Google services. | **Anthropic API**. Requires API key or Pro subscription. | **BYO Keys / Local**. Connects to anything (OpenAI, Anthropic, Ollama, etc.). |
| **Cost** | **Low / Free Tier**. Generous free tier, very cheap input tokens. | **High**. Claude 3.7 Sonnet is premium priced. | **Variable**. Free with local models; user pays for API calls otherwise. |
| **UX / Interface** | **Chat-Centric**. Focus on conversation & command execution. | **Task-Centric**. "Agentic" loop (Plan -> Act -> Verify). Web UI "Teleport". | **Hybrid**. TUI (Terminal UI) + CLI commands. |

---

## 3. Deep Dive Analysis

### A. Gemini CLI (The Incumbent)
**Role:** The "Brain" and "Orchestrator".
*   **Pros:**
    *   **Context Window:** The 1M-2M token window allows it to read the *entire* project history and documentation in every request without sophisticated RAG, making it unmatched for "awareness".
    *   **Speed:** Gemini Flash 2.0 is exceptionally fast, critical for a chat-based interface where user latency matters.
    *   **Ecosystem:** First-party access to Google Search and other Google tools is a unique advantage.
*   **Cons:**
    *   **Coding Precision:** While good, it sometimes lags behind Claude 3.7 Sonnet in complex, multi-file refactoring logic where "thinking" time is high.
    *   **Agent Loop:** Less autonomous "looping" capabilities out-of-the-box compared to Claude Code's specialized agent loop.

### B. Claude Code (The Specialist)
**Role:** The "Senior Engineer" Sub-Agent.
*   **Pros:**
    *   **Coding Intelligence:** Claude 3.7 Sonnet is widely considered the SOTA for coding tasks. It excels at adhering to complex architectural patterns (like our `memory-bank`).
    *   **Teleporting:** The ability to start a session in the CLI and seamlessly continue it in a web browser (and vice versa) is a game-changer for debugging complex issues.
    *   **Verification:** Has a built-in "Act -> Verify" loop where it runs tests to confirm its own changes.
*   **Cons:**
    *   **Cost:** Running this for every trivial chat interaction (e.g., "What time is it?") would be prohibitively expensive.
    *   **Latency:** Slower than Gemini Flash for simple queries.

### C. Kilo CLI (The Universal Adapter)
**Role:** The "Local/Offline" Backup.
*   **Pros:**
    *   **Zero Lock-in:** You are not tied to any single provider. If Google goes down, Kilo works with OpenAI or local Llama 3 models.
    *   **Privacy:** Can run entirely offline with local models (e.g., via Ollama), ensuring no code leaves the machine.
    *   **MCP First:** Built from the ground up around the Model Context Protocol, making it highly extensible with standard tools.
*   **Cons:**
    *   **Complexity:** "Jack of all trades, master of none". Requires more configuration to get the specific high-performance experience of Gemini or Claude.
    *   **Context Limit:** Limited by the context window of the underlying model (often 8k-128k for local/standard models), far less than Gemini's 1M+.

---

## 4. Architecture Recommendation: The "Hybrid" Bridge

We should **not** perform a full migration away from Gemini CLI. Instead, we should adopt a **Hybrid Architecture** where Gemini CLI acts as the Operating System, dispatching specialized tasks to Claude Code.

### Proposed Workflow
1.  **User (Telegram):** Sends message -> `watcher.sh` -> **Gemini CLI**.
2.  **Gemini CLI:** Analyzes request.
    *   *Case A (General):* "Update the README." -> **Gemini executes directly.**
    *   *Case B (Complex):* "Refactor the entire `bot.js` module to use TS." -> **Gemini delegates.**
3.  **Delegation:** Gemini calls a custom tool `run_claude_task`:
    ```bash
    claude -p "Refactor bot.js to TypeScript. adhere to memory-bank/techContext.md"
    ```
4.  **Result:** Claude Code executes the refactor (potentially interacting with the user if needed, or running autonomously) and returns the result.
5.  **Gemini CLI:** Summarizes the work and reports back to Telegram.

### Action Plan
1.  **Keep** Gemini CLI as the primary interface in `start.sh` and `watcher.sh`.
2.  **Install** Claude Code (`npm install -g @anthropic-ai/claude-code`) on the host machine.
3.  **Create** a Gemini Tool/Skill (`skills/claude-bridge.js`) to invoke `claude` commands safely.
4.  **Update** `AGENTS.md` to reflect this hierarchy.
