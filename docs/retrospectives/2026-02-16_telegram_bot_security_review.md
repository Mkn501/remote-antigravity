# Retrospective: Telegram Bot Security Review

**Date:** 2026-02-16  
**Scope:** Security audit of the Telegram bot + watcher infrastructure  
**Duration:** ~30 min  
**Severity:** Medium

---

## Context

After building and stabilizing the Telegram bot relay system (`bot.js` + `watcher.sh`), a security review was conducted to identify risks in the architecture before pushing to the public repo.

## What Was Done

1. Audited `.env` secret handling — verified not committed with real values
2. Checked chat ID filtering on all bot handlers
3. Analyzed shell injection vectors in `watcher.sh`
4. Reviewed `--yolo` mode implications
5. Verified `.gitignore` coverage for sensitive files
6. Checked GitHub repo visibility (public)

---

## Findings

### 🔴 1. `--yolo` Mode = Unrestricted Agent

- **Risk:** `gemini --yolo` auto-approves all tool calls. Anyone with chat access can execute arbitrary shell commands via Gemini.
- **Verdict:** Accepted risk for personal use. Only the owner's CHAT_ID can send commands.
- **Mitigation:** Physical device security is the trust boundary.

### 🟡 2. Callback Query Missing Auth Check

- **Risk:** The `callback_query` handler for `/model` and `/project` inline buttons doesn't verify `query.message.chat.id === CHAT_ID`.
- **Impact:** If someone discovers the bot username, they could send crafted callback data to switch models or projects.
- **Fix:** Add `if (String(query.message.chat.id) !== String(CHAT_ID)) return;` at top of callback handler.

### 🟡 3. Shell Injection via Unquoted `$MODEL_FLAG`

- **Risk:** `MODEL_FLAG="--model $SELECTED_MODEL"` is used unquoted in the `gemini` invocation. If `state.json` is tampered with, arbitrary shell commands could execute.
- **Fix:** Quote the variable or validate against an allowlist.

---

## Lessons Learned

| # | Lesson | Detail |
|---|--------|--------|
| 1 | **Auth every handler** | Telegram callback queries need the same CHAT_ID check as message handlers |
| 2 | **Quote shell variables** | Any variable sourced from a file (JSON, env) must be quoted when used in command invocations |
| 3 | **`--yolo` is a trust decision** | Acceptable for single-user personal bots, but must never be used in shared/team setups |

---

## Files Changed

- `[REVIEWED] scripts/bot/bot.js` — Callback query auth gap found
- `[REVIEWED] scripts/watcher.sh` — MODEL_FLAG injection and --yolo risk documented

---

## Action Items

- [ ] Add CHAT_ID check to `callback_query` handler in `bot.js`
- [ ] Quote `$MODEL_FLAG` or add model allowlist validation in `watcher.sh`

---

## Lookup Tags

`security`, `telegram`, `gemini-cli`, `hooks`
