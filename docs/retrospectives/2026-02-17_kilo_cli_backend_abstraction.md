# Retrospective: Kilo CLI Research & Backend-Agnostic Watcher Design

**Date:** 2026-02-17  
**Scope:** CLI backend abstraction — replacing hardcoded Gemini CLI with switchable backends  
**Duration:** ~2 hours  
**Severity:** Medium

---

## Context

The existing `watcher.sh` was hardcoded to Gemini CLI. Earlier research (from Gemini CLI itself) had concluded Kilo CLI lacked headless mode, making it unsuitable. User reported two additional issues: (1) research output was outdated due to no web search usage, (2) CLI implemented code instead of producing specs when asked.

## What Was Done

1. Fixed watcher prompt: added rules for web search enforcement, literal instruction following, and code gating.
2. Built comprehensive regression test suite (45 tests, 11 categories) to validate bot and watcher behavior.
3. Re-researched Kilo CLI with web search — discovered `kilo run --auto` headless mode exists since CLI 1.0.
4. Ran spike: confirmed Kilo CLI v1.0.21 installed locally with full headless support.
5. Created backend-agnostic watcher spec (`docs/specs/backend_agnostic_watcher_spec.md`) with 9 sub-tasks.
6. Researched Tavily MCP for web search gap and documented secret management approach.

---

## Trial & Error Log

### 1. Outdated research from Gemini CLI

- **Expected:** Gemini CLI research tasks would use web search for current data.
- **Reality:** CLI relied on training data, producing outdated conclusions (e.g., "Kilo CLI has no headless mode").
- **Resolution:** Added explicit prompt rules: `For ANY research task, ALWAYS use web search (Google Search tool)`. Also added `Follow instructions LITERALLY` to prevent spec requests from being implemented.

### 2. Regression test `await import` in sync function

- **Expected:** `atomicWrite()` helper function would work with dynamic import.
- **Reality:** Used `const { renameSync } = await import('fs')` inside a non-async function — syntax error.
- **Resolution:** Removed the broken import line; function already had `writeFileSync` imported at module level.

---

## Lessons Learned

| # | Lesson | Detail |
|---|--------|--------|
| 1 | **Never trust AI research without web search** | Gemini CLI's training data said Kilo CLI had no headless mode — web search proved otherwise. Always enforce web search for research tasks. |
| 2 | **Watcher architecture is naturally backend-agnostic** | Workflows are injected into the prompt as text blobs — the CLI agent never reads workflow files. Swapping backends requires only changing the binary invocation, not the workflow system. |
| 3 | **Model format differs between CLIs** | Gemini uses bare names (`gemini-2.5-flash`), Kilo uses `provider/model` format (`google/gemini-2.5-flash`). Abstraction layer must handle mapping. |
| 4 | **MCP fills tool gaps** | Kilo CLI lacks built-in web search but supports MCP. Tavily MCP (`@tavily/mcp`) provides web search with a free tier (1000/month). |

---

## Files Changed

- `[MODIFIED] scripts/watcher.sh` — Added prompt rules for web search, literal following, code gating
- `[MODIFIED] scripts/bot/bot.test.js` — Complete rewrite: 45 tests across 11 categories
- `[MODIFIED] scripts/bot/package.json` — Added `test` script
- `[NEW] docs/specs/backend_agnostic_watcher_spec.md` — Full spec with spike results, workflow transfer explanation, Tavily MCP, secrets

---

## Action Items

- [ ] Implement backend-agnostic watcher (9 sub-tasks in `antigravity_tasks.md`)
- [ ] Configure Tavily MCP + get API key
- [ ] Apply security fixes: CHAT_ID callback auth, `$MODEL_FLAG` quoting

---

## Lookup Tags

`gemini-cli`, `testing`, `regression`, `kilo`
