# Retrospective: Kilo CLI + Antigravity Claude Proxy Integration

**Date:** 2026-03-05  
**Scope:** Integrating Kilo CLI with antigravity-claude-proxy to use Claude models via Antigravity subscription  
**Duration:** ~2.5 hours  
**Severity:** Medium

---

## Context

Goal was to route Kilo CLI through the user's existing Google Antigravity subscription to access Claude models (Sonnet 4.6, Opus 4.6) — no separate Anthropic API key needed. This required installing `antigravity-claude-proxy`, configuring Kilo CLI to point at it, updating the watcher/bot/start.sh, and validating E2E via Telegram.

## What Was Done

1. Installed `antigravity-claude-proxy` globally, started on port 3456, linked Google account via OAuth.
2. Created spec `docs/specs/kilo_antigravity_claude_proxy_spec.md` with 4 work orders.
3. Added P-006 (Submodule-Aware Commit) and P-007 (Antigravity Claude Proxy) to `systemPatterns.md`.
4. Struggled through 6 different `opencode.json` config schemas until finding the correct one.
5. Discovered `kilo run --auto` produces zero output — needed TTY via `script -q /dev/null`.
6. Discovered Kilo CLI v1.0.23 was massively outdated → upgraded to v7.0.38.
7. Fixed baseURL path (`/v1` suffix needed for `/messages` endpoint).
8. Wired everything: watcher TTY fix, bot_v2.js Claude models, start.sh proxy lifecycle.
9. Discovered `start.sh` was still launching `bot.js` instead of `bot_v2.js`.
10. E2E validated: Telegram → Kilo CLI → Claude Sonnet 4.6 → `test.txt` created and committed.

---

## Trial & Error Log

### 1. Wrong `opencode.json` config schema — `apiKey`/`baseUrl` at provider level

- **Expected:** `{ "provider": { "anthropic": { "apiKey": "...", "baseUrl": "..." } } }` would work.
- **Reality:** `Unrecognized keys: "apiKey", "baseUrl" provider.anthropic` — Kilo CLI rejected both keys.
- **Resolution:** Correct schema is `provider.anthropic.options.baseURL` and `provider.anthropic.options.apiKey` (nested inside `options`). Found after reading OpenCode official docs.

### 2. `kilo run --auto` hangs with zero output (all versions)

- **Expected:** `kilo run --auto -m kilo/kilo/auto-free "say hello"` would print response to stdout.
- **Reality:** Command hangs indefinitely. No output, no error, no logs (even with `--print-logs --log-level DEBUG`). Only config loading lines appear, then nothing. Tested with free models, Anthropic models, custom providers — all hung.
- **Resolution:** `kilo run` requires a pseudo-TTY for its output rendering. Wrapping with `script -q /dev/null kilo run ...` provides a TTY. This is a known issue mentioned on GitHub.

### 3. Kilo CLI v1.0.23 was 6 major versions behind

- **Expected:** Installed Kilo CLI would be current.
- **Reality:** v1.0.23 installed, latest was v7.0.38. The old version likely had different config parsing and the `--auto` bug was more severe.
- **Resolution:** `npm install -g @kilocode/cli@latest` → v7.0.38. Required a one-time DB migration (JSON sessions → SQLite).

### 4. Proxy `POST /messages` not found (wrong baseURL)

- **Expected:** `baseURL: "http://localhost:3456"` with Kilo sending to `{baseURL}/messages` → `localhost:3456/messages`.
- **Reality:** Error: `Endpoint POST /messages not found`. The proxy's Anthropic endpoint is at `/v1/messages`.
- **Resolution:** Change baseURL to `http://localhost:3456/v1` so Kilo's `/messages` resolves to `/v1/messages`.

### 5. Port 8080 conflict

- **Expected:** Default proxy port 8080 would be available.
- **Reality:** Port 8080 was already used by another project.
- **Resolution:** Restarted proxy with `PORT=3456 acc start`.

### 6. `start.sh` launching wrong bot file

- **Expected:** After editing `bot_v2.js` with Claude models, Telegram would show them.
- **Reality:** Only old OpenRouter models appeared (GLM-4.7, GLM-5, MiniMax).
- **Resolution:** `start.sh` L103 was `node bot.js` — changed to `node bot_v2.js`.

---

## Lessons Learned

| # | Lesson | Detail |
|---|--------|--------|
| 1 | **Kilo CLI requires TTY for output** | `kilo run --auto` produces zero output in non-TTY environments. Always wrap with `script -q /dev/null kilo ...` in headless/watcher contexts. |
| 2 | **OpenCode config is `options.baseURL`, not `baseURL`** | The provider config nests API settings inside `options: {}`. Direct keys at the provider level are rejected. Schema: `provider.{name}.options.{baseURL,apiKey}`. |
| 3 | **Always check installed vs. latest versions** | Kilo CLI was 6 major versions behind (1.0.23 vs 7.0.38). The version gap caused silent failures and missing features. |
| 4 | **Proxy baseURL needs the API version path** | Kilo's Anthropic SDK appends `/messages` to the baseURL. If the proxy serves at `/v1/messages`, the baseURL must include `/v1`. |
| 5 | **Verify which bot file is actually launched** | Having both `bot.js` and `bot_v2.js` causes confusion. `start.sh` was still running the old file. Always grep `start.sh` after adding features to the newer bot file. |
| 6 | **Test proxy APIs with curl first** | `curl -X POST http://localhost:3456/v1/messages` confirmed the proxy worked before Kilo integration. This isolated the problem to the Kilo CLI config. |

---

## Files Changed

- `[NEW] docs/specs/kilo_antigravity_claude_proxy_spec.md` — Full spec with 4 work orders
- `[NEW] ~/.config/kilo/opencode.json` — Kilo CLI Anthropic provider → proxy on :3456
- `[MODIFIED] scripts/watcher.sh` — TTY wrapper for kilo run (`script -q /dev/null`)
- `[MODIFIED] scripts/bot/bot_v2.js` — Claude Sonnet 4.6 + Opus 4.6 in PLATFORM_MODELS, top-tier default
- `[MODIFIED] start.sh` — Proxy lifecycle (acc start/stop), bot.js → bot_v2.js, proxy status check
- `[MODIFIED] memory-bank/systemPatterns.md` — P-006 + P-007 patterns

---

## Action Items

- [x] Install and configure antigravity-claude-proxy
- [x] Fix Kilo CLI `kilo run --auto` TTY issue
- [x] Wire proxy into start.sh lifecycle
- [x] Add Claude models to Telegram `/model` command
- [x] E2E validate via Telegram
- [ ] Consolidate `bot.js` and `bot_v2.js` into single file (deferred — see bot_refactoring_spec)
- [ ] Add Tavily MCP for web search when using Kilo backend

---

## Lookup Tags

`kilo`, `anthropic`, `proxy`, `config`, `telegram`
