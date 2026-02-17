# Kilo CLI Investigation & Comparison Dimensions

This document outlines the dimensions for investigating the potential replacement of **Gemini CLI** with **Kilo CLI** (formerly Kilocode).

## Executive Summary

**Gemini CLI** is a Google-centric, high-performance CLI agent deeply integrated with the Gemini ecosystem.
**Kilo CLI** is a model-agnostic, agentic CLI tool with strong local context awareness and MCP support.

**Status:** Research complete (2026-02-17). Validated installation, headless mode, MCP integration, and model selection. Backend-agnostic watcher spec created.

> [!IMPORTANT]
> **Key Finding (2026-02-17)**: Kilo CLI v1.0.21 supports full headless mode via `kilo run --auto "prompt"`. This was previously missed in earlier research that relied on training data instead of web search. See [retrospective](../retrospectives/2026-02-17_kilo_cli_backend_abstraction.md).

## Investigation Findings (2026-02-16, Updated 2026-02-17)

### 1. Installation & Setup
*   **Method:** Node.js based. Installs via `npm install -g @kilocode/cli`.
*   **Zero-Config Start:** Works immediately without user-provided API keys.
*   **Default Model:** Uses `z-ai/glm-5:free` by default. Supports many other free models (Llama 3, Mistral, Gemma, etc.) out-of-the-box.
*   **Auth:** `kilo auth` command available for custom providers, but not required for basic usage.
*   **Config:** `~/.config/kilo/config.json` for global settings. Env vars via `KILO_API_KEY` or provider-specific (e.g., `ANTHROPIC_API_KEY`).

### 2. Context Awareness
*   **Project Root:** Automatically detects the Git root (`.git` folder) as the project context, even if run from a subdirectory.
*   **File Access:** Can list and read files in the project. Respects `.gitignore`.

### 3. Headless / Pipeline Mode (Confirmed 2026-02-17)

```bash
# One-shot headless execution (equivalent to gemini --yolo -p)
kilo run --auto "your prompt here"

# With model selection (provider/model format)
kilo run --auto --model "google/gemini-2.5-flash" "your prompt"

# With agent role selection
kilo run --auto --agent "developer" "your prompt"

# Machine-readable output
kilo run --auto --format json "your prompt"
```

*   **`--auto` flag**: Auto-approves all permissions — equivalent to Gemini's `--yolo`.
*   **`--model` flag**: Uses `provider/model` format (differs from Gemini's bare model names).
*   **`--agent` flag**: Can specify agent type (build, plan, developer).
*   **`--format json`**: Machine-readable output for pipeline integration.
*   **stdout capture**: Output goes to stdout, fully capturable in scripts.

### 4. MCP Integration (Model Context Protocol)
*   **Support:** Native support via `kilo mcp`.
*   **Auto-Discovery:** Automatically detected 11 existing MCP servers on the host system (e.g., `gptr-mcp`, `medium`, `crawl`, `raindrop-io`).
*   **Project Config:** `.kilocode/mcp.json` for per-project MCP server configuration.
*   **Web Search Gap:** No built-in web search — use [Tavily MCP](https://www.npmjs.com/package/@tavily/mcp) (free tier: 1000/month).

### 5. Comparison Dimensions

| Feature | Gemini CLI | Kilo CLI |
| :--- | :--- | :--- |
| **Foundation** | Google Gemini (2.5/3 Pro) | Model Agnostic (500+ models, 60+ providers) |
| **Context** | `GEMINI.md`, active scanning | Memory Bank, Git Root detection |
| **Agent Mode** | Generalist + Sub-agents | Explicit Agents (Code, Architect, etc.) |
| **Tools** | Native Tool Use (Google Search built-in) | MCP (Model Context Protocol) — web search via Tavily MCP |
| **Headless Mode** | `gemini --yolo -p "prompt"` | `kilo run --auto "prompt"` |
| **Model Flag** | `--model gemini-2.5-flash` | `--model google/gemini-2.5-flash` |
| **Cost** | Free tier (Gemini) | Free tier (Community models) + BYO Keys |
| **Ecosystem** | Google Cloud / Vertex AI | Open / Local / Multi-provider |

### 6. Capabilities Verified
*   `kilo run --auto "command"`: Executes headless, pipeline-ready. ✅
*   `kilo run --auto --model "provider/model" "command"`: Model selection in headless mode. ✅
*   `kilo models`: Lists available models (including free ones).
*   `kilo mcp list`: Lists active MCP servers.
*   `kilo [project]`: Launches a TUI (Terminal User Interface).

## Next Steps
1.  ✅ ~~Benchmark~~ — Completed. See [kilo_cli_benchmark.md](kilo_cli_benchmark.md).
2.  ✅ ~~Config Deep Dive~~ — `~/.config/kilo/config.json` global, `.kilocode/mcp.json` per-project.
3.  ✅ ~~Evaluate headless mode~~ — `kilo run --auto` confirmed via spike (2026-02-17).
4.  **Implement:** Backend-agnostic watcher. See [spec](../specs/backend_agnostic_watcher_spec.md).
