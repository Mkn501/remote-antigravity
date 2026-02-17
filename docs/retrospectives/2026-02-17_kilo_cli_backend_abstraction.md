# Retrospective: Watcher Debugging & Backend-Agnostic Design

**Date:** 2026-02-17  
**Scope:** Watcher/bot debugging (Markdown crashes, progress notifications, heartbeat) + CLI backend abstraction  
**Duration:** ~4 hours  
**Severity:** Medium

---

## Context

Session started with debugging the live Gemini CLI watcher/bot system — bot was crashing on outbox writes, watcher lacked progress notifications, and Telegram API rejected Markdown-formatted messages. After stabilizing, moved to improving prompt quality and researching Kilo CLI as an alternative backend.

## What Was Done

1. **Bot debugging**: Fixed bot crash on outbox Markdown (`parse_mode: 'Markdown'` rejected by Telegram API for special characters). Stripped all `parse_mode` from bot messages.
2. **Watcher progress notifications**: Added 3-stage progress updates (📥 received → 🧠 running → ✅ done) so user sees real-time status in Telegram.
3. **Bot startup notification**: Bot now sends `🤖 Bot is online` on launch.
4. **Watcher heartbeat**: Health check via `pgrep -f watcher.sh` integrated into bot `/status` command.
5. **Global error handler**: Added `process.on('unhandledRejection')` to prevent silent bot crashes.
6. Fixed watcher prompt: added rules for web search enforcement, literal instruction following, and code gating.
7. Built comprehensive regression test suite (45 tests, 11 categories) to validate bot and watcher behavior.
8. Re-researched Kilo CLI with web search — discovered `kilo run --auto` headless mode exists since CLI 1.0.
9. Ran spike: confirmed Kilo CLI v1.0.21 installed locally with full headless support.
10. Created backend-agnostic watcher spec (`docs/specs/backend_agnostic_watcher_spec.md`) with 9 sub-tasks.
11. Researched Tavily MCP for web search gap and documented secret management approach.

---

## Trial & Error Log

### 1. Bot crash on Telegram Markdown parsing

- **Expected:** Sending `parse_mode: 'Markdown'` would render formatted messages.
- **Reality:** Telegram API rejected messages containing unescaped special characters (e.g., `_`, `*`, `[` in filenames or code output). Bot crashed with unhandled rejection.
- **Resolution:** Stripped ALL `parse_mode` from bot messages. Plain text with emoji is more reliable and sufficient for our use case. Added global `unhandledRejection` handler as safety net.

### 2. Watcher progress not visible to user

- **Expected:** User would know when Gemini CLI was processing their message.
- **Reality:** After sending a message, there was no feedback until the response arrived (could be 30-60s). User had no idea if it was received or stuck.
- **Resolution:** Added 3-stage progress notifications written to outbox by watcher.sh: `📥 Message received` → `🧠 Running Gemini CLI...` → response. Bot polls outbox and forwards each update.

### 3. Outdated research from Gemini CLI

- **Expected:** Gemini CLI research tasks would use web search for current data.
- **Reality:** CLI relied on training data, producing outdated conclusions (e.g., "Kilo CLI has no headless mode").
- **Resolution:** Added explicit prompt rules: `For ANY research task, ALWAYS use web search (Google Search tool)`. Also added `Follow instructions LITERALLY` to prevent spec requests from being implemented.

### 4. Regression test `await import` in sync function

- **Expected:** `atomicWrite()` helper function would work with dynamic import.
- **Reality:** Used `const { renameSync } = await import('fs')` inside a non-async function — syntax error.
- **Resolution:** Removed the broken import line; function already had `writeFileSync` imported at module level.

---

## Lessons Learned

| # | Lesson | Detail |
|---|--------|--------|
| 1 | **Never use `parse_mode: 'Markdown'` with dynamic content** | Telegram's Markdown parser is strict — unescaped `_`, `*`, `[` crash the API. Use plain text with emoji for reliability. |
| 2 | **Always add progress notifications for async operations** | Users need feedback within seconds. A 3-stage pattern (received → processing → done) prevents confusion and perceived hangs. |
| 3 | **Always add `unhandledRejection` handler** | A single Telegram API error crashed the entire bot silently. Global error handlers prevent this. |
| 4 | **Never trust AI research without web search** | Gemini CLI's training data said Kilo CLI had no headless mode — web search proved otherwise. Always enforce web search for research tasks. |
| 5 | **Watcher architecture is naturally backend-agnostic** | Workflows are injected into the prompt as text blobs — the CLI agent never reads workflow files. Swapping backends requires only changing the binary invocation, not the workflow system. |
| 6 | **Model format differs between CLIs** | Gemini uses bare names (`gemini-2.5-flash`), Kilo uses `provider/model` format (`google/gemini-2.5-flash`). Abstraction layer must handle mapping. |
| 7 | **MCP fills tool gaps** | Kilo CLI lacks built-in web search but supports MCP. Tavily MCP (`@tavily/mcp`) provides web search with a free tier (1000/month). |

---

## Files Changed

- `[MODIFIED] scripts/bot/bot.js` — Startup notification, heartbeat, progress notifications, stripped Markdown, global error handler
- `[MODIFIED] scripts/watcher.sh` — Progress notifications (3-stage), prompt rules for web search/literal following/code gating
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
