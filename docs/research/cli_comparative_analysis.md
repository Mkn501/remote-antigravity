# Comprehensive CLI Agent Comparison: Gemini CLI vs. Kilo CLI

**Date:** 2026-02-16 (Updated 2026-02-17)
**Status:** Complete
**Context:** "Remote Antigravity" Project

## 1. Executive Summary

This report compares two CLI-based AI agents to determine the optimal tooling strategy for the "Remote Antigravity" project.
*   **Gemini CLI:** The current primary backend. A robust, Google-ecosystem-native generalist with a huge context window, built-in Google Search, and high performance-to-cost ratio.
*   **Kilo CLI:** A flexible, model-agnostic local agent (formerly Kilocode) that supports 500+ models, headless pipeline mode (`kilo run --auto`), and MCP integration.

> [!NOTE]
> **Claude Code** was evaluated and excluded due to prohibitive cost for a chat loop. See archived analysis below.

**Verdict (Updated 2026-02-17):** **Gemini CLI remains the default backend** due to speed, built-in Google Search, and free tier. **Kilo CLI is now a first-class alternative backend** (not just a backup), switchable via `/backend` command. Both support headless mode for the watcher. See [backend-agnostic watcher spec](../specs/backend_agnostic_watcher_spec.md).

---

## 2. Feature Comparison Matrix

| Feature | Gemini CLI | Kilo CLI |
| :--- | :--- | :--- |
| **Core Model** | **Gemini 2.5 Flash / Pro** | **Model Agnostic** (500+ models: Gemini, Claude, GPT-4, local via Ollama) |
| **Primary Strength** | **Long Context & Speed**. 1M+ token window, built-in Google Search. | **Flexibility & Privacy**. Runs anywhere, any model, zero lock-in. |
| **Headless Mode** | `gemini --yolo -p "prompt"` | `kilo run --auto "prompt"` |
| **Model Flag** | `--model gemini-2.5-flash` (bare name) | `--model google/gemini-2.5-flash` (provider/model format) |
| **Context Awareness** | `GEMINI.md`, `memory-bank/` (Convention), Project-wide scanning. | Git Root detection, `.kilo/` config, auto-discovery. |
| **Tooling / Skills** | **Native Tools** (Google Search, Shell, File). Custom "Skills" via TS/JS. | **MCP Support**. Extensible via Model Context Protocol servers. |
| **Web Search** | ✅ Built-in Google Search | ⚠️ Requires [Tavily MCP](https://www.npmjs.com/package/@tavily/mcp) (free: 1000/month) |
| **Agent Roles** | Single generalist with sub-agents | `--agent` flag (developer, architect, build, plan) |
| **Cost** | **Low / Free Tier**. Generous free tier, very cheap input tokens. | **Variable**. Free with community/local models; user pays for API calls otherwise. |
| **UX / Interface** | Chat-Centric (conversation & command execution). | Hybrid: TUI + CLI + headless pipeline. |

---

## 3. Deep Dive Analysis

### A. Gemini CLI (Default Backend)
**Role:** The "Brain" and "Orchestrator".
*   **Pros:**
    *   **Context Window:** The 1M-2M token window allows it to read the *entire* project history and documentation in every request without sophisticated RAG.
    *   **Speed:** Gemini Flash 2.5 is exceptionally fast, critical for a chat-based interface where user latency matters.
    *   **Ecosystem:** First-party access to Google Search and other Google tools is a unique advantage for research tasks.
*   **Cons:**
    *   **Coding Precision:** While good, it sometimes lags behind Claude 3.7 Sonnet in complex, multi-file refactoring logic.
    *   **Agent Loop:** Less autonomous "looping" capabilities out-of-the-box compared to dedicated coding agents.
    *   **Lock-in:** Tied to Google Gemini models only.

### B. Kilo CLI (Alternative Backend)
**Role:** The "Swiss Army Knife" — model-flexible alternative.
*   **Pros:**
    *   **Zero Lock-in:** Not tied to any single provider. If Google goes down, Kilo works with OpenAI, Anthropic, or local models.
    *   **Privacy:** Can run entirely offline with local models (e.g., via Ollama), ensuring no code leaves the machine.
    *   **MCP First:** Built from the ground up around the Model Context Protocol, making it highly extensible.
    *   **Headless Mode:** `kilo run --auto` enables full pipeline/CI/CD integration, equivalent to Gemini's `--yolo -p`.
    *   **Agent Roles:** `--agent developer` or `--agent architect` for task-specific behavior.
*   **Cons:**
    *   **No Built-in Web Search:** Requires Tavily MCP or similar for research tasks.
    *   **Model Format:** Uses `provider/model` format — abstraction layer needed for watcher.sh.
    *   **Default Model Speed:** Free default model (`z-ai/glm-5`) is too slow for real-time chat (~18-43s per task).

<details>
<summary>C. Claude Code (Excluded — Cost Prohibitive)</summary>

**Role:** Would serve as "Senior Engineer" sub-agent.
*   **Pros:** Claude 3.7 Sonnet is widely considered SOTA for coding tasks. "Teleporting" CLI-to-web feature. Built-in verification loop.
*   **Cons:** Running this for every chat interaction is prohibitively expensive. Slower than Gemini Flash for simple queries. Requires paid subscription.
*   **Decision:** Excluded from active integration. Could be reconsidered for specific high-value tasks in the future.
</details>

---

## 4. Architecture: Backend-Agnostic Watcher

Instead of a Gemini-only or hybrid delegation model, we implement a **switchable backend** architecture:

```
User (Telegram) → watcher.sh → run_agent() → Gemini CLI (default)
                                             → Kilo CLI (alternative)
```

### How It Works
1.  **User (Telegram):** Sends message → `watcher.sh`.
2.  **watcher.sh:** Reads `state.json` for `backend` field (default: `gemini`).
3.  **`run_agent()`:** Routes to the configured backend:
    *   `gemini`: `gemini --yolo -p "$PROMPT"` (with hooks workaround)
    *   `kilo`: `kilo run --auto "$PROMPT"` (no hooks workaround needed)
4.  **Backend switching:** Via `/backend` Telegram command (inline keyboard).

### Why Not Delegation?
The original plan (Gemini delegates to Claude Code) was abandoned because:
- Claude Code is too expensive for every interaction.
- Kilo CLI can use the *same* Gemini models, making delegation unnecessary.
- A switchable backend is simpler and more maintainable than sub-agent orchestration.

### Implementation
See [backend_agnostic_watcher_spec.md](../specs/backend_agnostic_watcher_spec.md) for full spec with 9 sub-tasks.
