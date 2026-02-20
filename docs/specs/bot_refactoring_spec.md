# Bot.js Critical Review — Security, Maintainability & Refactoring Spec

> **Scope**: `scripts/bot/bot.js` (1,373 lines, 54 KB)
> **Date**: 2026-02-20
> **Status**: Analysis only — no implementation

---

## 1. Security Issues

### 🔴 SEC-1: Shell Injection in `/apply_fix` and `/discard_fix`
**Lines**: 1097, 1118
**Severity**: HIGH

The hotfix branch name is extracted from `git branch` output via regex, then interpolated directly into a shell command:
```javascript
execSync(`git checkout main && git merge ${hotfix} --no-edit`, { cwd: PROJECT_DIR });
```

If a branch named `hotfix/auto-123; rm -rf /` existed, the shell would execute the injected command. While the regex (`/hotfix\/auto-\d+/`) currently limits this to digits, the pattern is unsafe by design.

**Fix (two layers)**:

**Layer 1 — Validate before interpolation (P1, 3-line fix):**
```javascript
const hotfix = match[0].trim();
if (!/^hotfix\/auto-\d+$/.test(hotfix)) {
    await bot.sendMessage(CHAT_ID, '❌ Invalid branch name.');
    return;
}
```
This strict regex rejects anything that isn't exactly `hotfix/auto-<digits>`. Preserves full auto-fix functionality since the watchdog creates branches matching this exact pattern.

**Layer 2 — Eliminate shell interpolation entirely (P3, modular refactor):**
```javascript
// Instead of:
execSync(`git checkout main && git merge ${hotfix} --no-edit`);

// Use execFileSync (no shell at all):
import { execFileSync } from 'child_process';
execFileSync('git', ['checkout', 'main'], { cwd: PROJECT_DIR });
execFileSync('git', ['merge', hotfix, '--no-edit'], { cwd: PROJECT_DIR });
```
`execFileSync` passes arguments as an array directly to the process — shell metacharacters like `; rm -rf /` are treated as literal git arguments, not commands. Apply to all handlers: `/apply_fix`, `/discard_fix`, `/restart`, `/kill`.

---

### 🔴 SEC-2: Overly Broad `pkill` in `/kill`
**Lines**: 1130–1131

```javascript
execSync('pkill -f "kilo" 2>/dev/null || true');
execSync('pkill -f "gemini" 2>/dev/null || true');
```

`pkill -f "gemini"` matches *any* process containing "gemini" — including unrelated tools (e.g., the `gemini settings` command currently running, or other user processes). This can kill processes outside the bot's scope.

**Fix**: Use more specific patterns like `pkill -f "gemini -p"` or `pkill -f "node.*kilo"`, or better: track the spawned PID and kill by PID, not pattern.

---

### 🟡 SEC-3: No Input Sanitization on `/add` Path
**Lines**: 865–883

```javascript
bot.onText(/^\/add\s+(\S+)\s+(.+)/, async (msg, match) => {
    let path = match[2].trim();
    if (!isAbsolute(path)) {
        path = resolve(DEFAULT_PROJECT_DIR, path);
    }
```

The path is resolved and checked with `existsSync`, but there's no protection against path traversal (e.g., `/add test ../../../etc`). While `existsSync` prevents registering non-existent dirs, it doesn't validate that the path is within a safe boundary.

**Fix**: Validate the resolved path starts with an allowed prefix (e.g., the user's home directory or project root).

---

### 🟡 SEC-4: Duplicate `/kill` Handler
**Lines**: 776–791 AND 1126–1138

The `/kill` command handler is defined **twice** — identical code at two locations. Both will execute on a `/kill` message (node-telegram-bot-api fires all matching handlers). This means every `/kill` runs the pkill commands twice.

**Fix**: Remove the duplicate at lines 776–791.

---

### 🟢 SEC-5: CHAT_ID Auth is Consistent
Every command handler checks `String(msg.chat.id) !== String(CHAT_ID)`. The callback_query handler also checks at line 439. This is good — no auth gaps found.

---

## 2. Maintainability Issues

### 🔴 MAINT-1: Monolithic 1,373-Line File
The file contains **everything**: config, helpers, 25+ command handlers, model registries, execution plan logic, health checks, outbox relay, and error handling. This makes it:
- Hard to navigate (25+ `bot.onText` handlers scattered through 1,373 lines)
- Risky to edit (Gemini CLI deleted 70 lines because it couldn't reason about the full file)
- Impossible to unit test individual handlers

**Recommendation**: Extract into modules:

| Module | Lines | Contents |
|---|---|---|
| `config.js` | ~55 | Paths, constants, env loading |
| `state.js` | ~50 | `getState`, `updateState`, `readJsonSafe`, `atomicWrite` |
| `registries.js` | ~80 | Model/backend/tier registries |
| `commands/workflow.js` | ~80 | `/startup`, `/shutdown`, `/sprint`, `/stop`, `/new` |
| `commands/admin.js` | ~120 | `/status`, `/restart`, `/kill`, `/clear_lock`, `/watchdog` |
| `commands/model.js` | ~40 | `/model`, `/backend` |
| `commands/project.js` | ~60 | `/project`, `/add`, `/list` |
| `commands/healing.js` | ~80 | `/diagnose`, `/autofix`, `/apply_fix`, `/discard_fix` |
| `commands/plan.js` | ~350 | `/review_plan` + all `ep_*` callback handlers |
| `health.js` | ~80 | Health check interval, watcher monitoring |
| `relay.js` | ~100 | Outbox polling, `sendAsFile`, message relay |
| `bot.js` (main) | ~80 | Imports, bot init, startup notification, error handlers |

---

### 🟡 MAINT-2: Duplicate Import
**Lines**: 22 AND 38

```javascript
import 'dotenv/config';          // Line 22
import dotenv from 'dotenv';     // Line 38
dotenv.config({ path: ... });
```

`dotenv` is imported and configured twice. Line 22 loads from `process.cwd()/.env` and line 38 loads from `SCRIPT_DIR/.env`. The first load is unnecessary and may load the wrong `.env` if `cwd` differs from script dir.

**Fix**: Remove line 22. Keep only the explicit path-based import at line 38.

---

### 🟡 MAINT-3: Inconsistent State Access
Three different patterns are used to read `state.json`:

| Pattern | Used at | Risk |
|---|---|---|
| `getState()` | Lines 124, 207, 318, 445, 651, 800, 830, 860, 887 | ✅ Correct |
| `readJsonSafe(STATE_FILE, {})` | Lines 358, 380 | ⚠️ Missing defaults |
| `JSON.parse(readFileSync(STATE_FILE, 'utf8'))` | Line 1073 | ❌ Can throw |

The `/autofix` handler (line 1073) reads state with raw `JSON.parse` — no fallback, no error handling for missing file. The `/model` and `/backend` handlers use `readJsonSafe` with `{}` as fallback — missing `activeProject` and `projects` defaults.

**Fix**: Use `getState()` everywhere. It already provides safe defaults.

---

### 🟡 MAINT-4: `PROJECT_DIR` Undefined
**Lines**: 1090, 1097, 1098, 1111, 1118

The `/apply_fix` and `/discard_fix` handlers use `PROJECT_DIR` in `execSync({ cwd: PROJECT_DIR })`, but `PROJECT_DIR` is never defined. `PROJECT_ROOT` and `DEFAULT_PROJECT_DIR` exist, but not `PROJECT_DIR`. This means these commands will silently use `undefined` as cwd, falling back to `process.cwd()`.

**Fix**: Replace `PROJECT_DIR` with `DEFAULT_PROJECT_DIR` or `getState().activeProject`.

---

### 🟢 MAINT-5: Atomic Writes Are Well-Implemented
`atomicWrite()` at line 89 uses tmp+rename pattern. The outbox relay at line 1339 re-reads before writing to avoid race conditions with the watcher. This is correct.

---

## 3. Refactoring Opportunities

### REF-1: Config-Driven Model Registry
**Lines**: 229–277

Model IDs, labels, tier defaults, and platform mappings are hardcoded across 5 separate objects (`MODEL_OPTIONS`, `PLATFORM_MODELS`, `PLATFORM_LABELS`, `BACKEND_OPTIONS`, `TIER_DEFAULTS`). Adding a new model requires touching 3–5 places.

**Recommendation**: Single `models.json` config file:
```json
{
  "platforms": {
    "gemini": {
      "label": "💻 Gemini CLI",
      "models": [
        { "id": "gemini-2.5-flash", "label": "⚡ Flash 2.5", "tier": "mid" }
      ]
    }
  }
}
```

---

### REF-2: Centralize Auth Guard
Every handler repeats: `if (String(msg.chat.id) !== String(CHAT_ID)) return;`

**Recommendation**: Middleware-style wrapper:
```javascript
function authorized(handler) {
    return async (msg, ...args) => {
        if (String(msg.chat.id) !== String(CHAT_ID)) return;
        return handler(msg, ...args);
    };
}
bot.onText(/^\/help/, authorized(async (msg) => { ... }));
```

---

### REF-3: Extract Callback Query Router
**Lines**: 437–760 (323 lines!)

The single `bot.on('callback_query')` handler is a 323-line if/else chain with 12 branches. Each branch is a separate feature (model selection, backend selection, project switching, 8 execution plan states).

**Recommendation**: Route-based dispatch:
```javascript
const callbackHandlers = {
    'model:': handleModelCallback,
    'backend:': handleBackendCallback,
    'project:': handleProjectCallback,
    'ep_platform:': handleEpPlatform,
    // ...
};
```

---

### REF-4: Hardcoded Telegram Strings
All user-facing strings are inline. Changes to UX copy require editing handler code.

**Recommendation**: Extract to a `messages.js` constants file or i18n layer.

---

### REF-5: `BOT_COMMANDS` Array Is Fragile
**Line**: 899

```javascript
const BOT_COMMANDS = ['/stop', '/status', '/project', '/list', ... '/kill'];
```

This array must be manually kept in sync with actual handlers. Adding a command but forgetting to add it here means the message handler will forward it to the inbox — causing the watcher to run it as a Gemini prompt.

**Recommendation**: Auto-generate from registered handlers, or use a central command registry that both the handler and the filter reference.

---

## 4. Priority Matrix

| ID | Category | Severity | Effort | Priority |
|---|---|---|---|---|
| SEC-4 | Security | HIGH | Trivial | **P0** — remove duplicate `/kill` |
| SEC-2 | Security | HIGH | Low | **P0** — fix overly broad `pkill` |
| MAINT-4 | Bug | HIGH | Trivial | **P0** — `PROJECT_DIR` undefined |
| MAINT-2 | Maintainability | LOW | Trivial | **P1** — remove duplicate import |
| SEC-1 | Security | MEDIUM | Low | **P1** — sanitize branch names |
| MAINT-3 | Maintainability | MEDIUM | Low | **P1** — use `getState()` everywhere |
| REF-2 | Refactoring | LOW | Low | **P2** — centralize auth |
| REF-5 | Refactoring | MEDIUM | Low | **P2** — command registry |
| REF-1 | Refactoring | LOW | Medium | **P3** — config-driven models |
| MAINT-1 | Refactoring | HIGH | High | **P3** — modular architecture |
| REF-3 | Refactoring | LOW | Medium | **P3** — callback router |
| REF-4 | Refactoring | LOW | Medium | **P4** — string extraction |
| SEC-3 | Security | LOW | Low | **P4** — path traversal guard |

---

## 5. Recommended Execution Order

1. **Quick wins (P0)**: Fix duplicate `/kill`, broad `pkill`, undefined `PROJECT_DIR` — 3 trivial fixes, immediate security + stability improvement
2. **Consistency pass (P1)**: Duplicate import, branch sanitization, consistent state access — no architecture change needed
3. **Structure prep (P2)**: Auth wrapper + command registry — sets foundation for modular split
4. **Modular refactor (P3)**: Extract into ~12 modules — biggest effort, biggest reward. Should be done on a feature branch with full test coverage before and after.
5. **Polish (P4)**: String extraction, path guards — nice-to-have

> [!IMPORTANT]
> The modular refactor (MAINT-1 / P3) is the most impactful change. The current 1,373-line monolith is the root cause of the Gemini CLI destructive edits — the LLM couldn't reason about the full file and deleted Phase 4 handlers instead of fixing a variable name. Smaller files = better AI compatibility.
