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

## Comparison: OpenClaw.ai vs. This Setup

OpenClaw.ai has been heavily criticized by Sophos, Trend Micro, CrowdStrike, Kaspersky, and others for being a cybersecurity risk. This section maps their attack vectors against our setup.

### OpenClaw's "Lethal Trifecta" (per CrowdStrike)
1. **Deep system access** (files, shell, root)
2. **External communication** (can phone home)
3. **Processes untrusted content** (emails, websites, docs)

| Attack Vector | OpenClaw Risk | Our Setup | Why |
|---------------|--------------|-----------|-----|
| **Public exposure** | 1000s of instances publicly reachable on the internet | ❌ Not reachable | No server, no ports. Runs locally, no HTTP endpoint. Telegram bot polls — never listens. |
| **Remote Code Execution** | CVE-2026-25253 — one-click RCE via crafted URLs | ❌ Not applicable | No web server, no URL handler. Attack surface doesn't exist. |
| **Malicious plugins** | ClawHub marketplace distributes malicious "skills" that exfiltrate data | ❌ No marketplace | No plugin ecosystem. Gemini CLI uses only built-in tools + local MCP servers we control. |
| **Prompt injection** | Emails/websites embed instructions that hijack the agent | ⚠️ Partial risk | Agent only reads local project files + our prompts. Doesn't process emails or external URLs. Risk limited to tampered project files. |
| **Auth bypass** | Brute-force, default credentials, exposed APIs | ❌ Not applicable | No auth system to bypass. Single hardcoded CHAT_ID. Telegram handles auth. |
| **Data exfiltration** | Agent sends private data to external servers | ⚠️ `--yolo` risk | Gemini runs unrestricted and could theoretically make network calls. Mitigated by single-user scope. |
| **Credential storage** | Plaintext secrets in config files | ⚠️ `.env` on disk | `.env` has bot token in plaintext. Not in git, but readable on disk. Standard for local dev. |

### Key Architectural Differences

| Property | OpenClaw | Our Setup |
|----------|---------|-----------|
| **Network exposure** | HTTP server, publicly accessible | No server. Telegram polls, watcher polls local files. |
| **Multi-user** | Yes — shared instances | No — single CHAT_ID, single machine |
| **Plugin ecosystem** | ClawHub (untrusted third-party code) | None — only built-in Gemini tools + local MCP |
| **Input sources** | Emails, web, documents, APIs | Only Telegram messages from verified CHAT_ID |
| **Persistence** | Always-on server with credentials | Ephemeral `gemini -p` calls, stateless between messages |
| **Attack surface** | Web server + API + plugins + auth | Telegram API (managed by Telegram) + local file I/O |

### Bottom Line

Our setup avoids OpenClaw's three biggest problems:
1. **No network exposure** — nothing to scan, no ports, no URLs
2. **No plugin marketplace** — no supply chain attack vector
3. **No multi-user auth** — no credentials to brute-force

The shared risk is `--yolo` granting unrestricted agent access, but our attack surface is limited to Telegram CHAT_ID compromise (requires physical device access or Telegram session theft).

---

## Action Items

- [ ] Add CHAT_ID check to `callback_query` handler in `bot.js`
- [ ] Quote `$MODEL_FLAG` or add model allowlist validation in `watcher.sh`

---

## Lookup Tags

`security`, `telegram`, `gemini-cli`, `hooks`
