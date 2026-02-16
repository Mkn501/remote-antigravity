# Kilo CLI Investigation & Comparison Dimensions

This document outlines the dimensions for investigating the potential replacement of **Gemini CLI** with **Kilo CLI** (formerly Kilocode).

## Executive Summary

**Gemini CLI** is a Google-centric, high-performance CLI agent deeply integrated with the Gemini ecosystem.
**Kilo CLI** is a model-agnostic, agentic CLI tool with strong local context awareness and MCP support.

**Status:** Initial research spikes completed (2026-02-16). Validated installation, zero-config usage, and MCP integration.

## Investigation Findings (2026-02-16)

### 1. Installation & Setup
*   **Method:** Node.js based. Installs via `npm install -g @kilocode/cli`.
*   **Zero-Config Start:** Works immediately without user-provided API keys.
*   **Default Model:** Uses `z-ai/glm-5:free` by default. Supports many other free models (Llama 3, Mistral, Gemma, etc.) out-of-the-box.
*   **Auth:** `kilo auth` command available for custom providers, but not required for basic usage.

### 2. Context Awareness
*   **Project Root:** Automatically detects the Git root (`.git` folder) as the project context, even if run from a subdirectory.
*   **File Access:** Can list and read files in the project. Respects `.gitignore`.

### 3. MCP Integration (Model Context Protocol)
*   **Support:** Native support via `kilo mcp`.
*   **Auto-Discovery:** Automatically detected 11 existing MCP servers on the host system (e.g., `gptr-mcp`, `medium`, `crawl`, `raindrop-io`).
*   **Ecosystem Divergence:** The MCP servers detected by Kilo (in `.../VS/mcp-servers/`) were **distinct** from those configured in `Claude Desktop` (in `.../Cline/MCP/`). This suggests Kilo uses a separate configuration source or environment (possibly related to `@opencode-ai` ecosystem).

### 4. Comparison Dimensions

| Feature | Gemini CLI | Kilo CLI |
| :--- | :--- | :--- |
| **Foundation** | Google Gemini (2.5/3 Pro) | Model Agnostic (60+ providers) |
| **Context** | `GEMINI.md`, active scanning | Memory Bank, Git Root detection |
| **Agent Mode** | Generalist + Sub-agents | Explicit Agents (Code, Architect, etc.) |
| **Tools** | Native Tool Use | MCP (Model Context Protocol) |
| **Cost** | Free tier (Gemini) | Free tier (Community models) + BYO Keys |
| **Ecosystem** | Google Cloud / Vertex AI | Open / Local / Multi-provider |

### 5. Capabilities Verified
*   `kilo run "command"`: Executes commands using an agent.
*   `kilo models`: Lists available models (including free ones).
*   `kilo mcp list`: Lists active MCP servers.
*   `kilo [project]`: Launches a TUI (Terminal User Interface).

## Next Steps
1.  **Benchmark:** Run a standard task (e.g., "Refactor module X") with Kilo CLI using the TUI mode.
2.  **Config Deep Dive:** Locate the exact configuration file Kilo uses to source the MCP servers (`.../VS/mcp-servers/`) to understand how to manage them.
3.  **Evaluate:** Compare results based on the dimensions above.
