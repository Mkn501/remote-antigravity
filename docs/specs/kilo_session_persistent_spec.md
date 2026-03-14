# Session-Persistent Kilo Architecture

## Executive Summary & Goals

Replace the stateless single-shot `kilo run --auto` invocation pattern with session-persistent architecture using Kilo CLI 7.0.46's `--session`/`--continue` flags. Each Telegram session (startup → messages → shutdown) becomes a single Kilo conversation with true LLM context persistence. Agent-per-role routing replaces manual model switching.

**Goals:**
1. True conversation continuity — `/startup` context persists into `/plan_feature` and beyond
2. Adopt existing SOP agent roles (`sop-coordinator`, `sop-planner`, `sop-developer`, `sop-auditor`) with model-per-agent
3. Replace text scraping with `--format json` structured output
4. Simplify watcher **Kilo path only** by removing manual model routing and text scraping — Gemini path must remain unchanged

## Technical Design

### Validated Capabilities (Spike Results)

Kilo CLI 7.0.46 supports:
- `--continue` — resume last session ✅ (validated: "Remember 42" → "42")
- `--session <id>` — resume specific session by ID ✅
- `--format json` — structured output events with `type`, `text`, `cost`, `tokens` ✅
- `--agent <name>` — custom agent with system prompt + permissions ✅ (validated: `--agent` and `--model` are independent — `--model` sets LLM, `--agent` sets prompt/permissions)
- `--fork` — branch session (for context overflow) ✅ (validated: returns new session ID with context from original preserved)

### Session Lifecycle

```
/startup                    /shutdown
   │                            │
   ▼                            ▼
┌─────────────────────────────────────────┐
│         KILO SESSION (ses_xxx)          │
│                                         │
│  Turn 1: /startup (sop-coordinator)     │
│  Turn 2: user message (sop-developer)   │
│  Turn 3: /plan_feature (sop-planner)    │
│  Turn 4: user feedback (sop-developer)  │
│  Turn N: /shutdown (sop-coordinator)    │
│                                         │
│  All turns share conversation context   │
└─────────────────────────────────────────┘
```

### Agent-Per-Role Routing

> **Source of Truth**: Agent roles and system prompts are defined in
> [workstation_sop.md §6](file:///Users/mkn501/Library/CloudStorage/GoogleDrive-ngcapinv@gmail.com/Meine%20Ablage/antigravity%20project%20template/docs/standards/workstation_sop.md).
> Do NOT reinvent — adopt as-is.

| SOP Agent | Role | Model | Watcher Routing |
|---|---|---|---|
| `sop-coordinator` | Triage & delegation | `anthropic/claude-sonnet-4-6` | `/startup`, `/shutdown` |
| `sop-planner` | Specs & task breakdown | `anthropic/claude-opus-4-6-thinking` | `/plan_feature` |
| `sop-developer` | Execute ONE task | `anthropic/claude-sonnet-4-6` | `/implement_task`, regular |
| `sop-auditor` | Code review & PR | `anthropic/claude-opus-4-6-thinking` | `/pr_check` |

> ⚠️ **Cost Warning**: `sop-planner` and `sop-auditor` use `claude-opus-4-6-thinking`, which is significantly more expensive than `claude-sonnet-4-6`. Current watcher uses Sonnet for all Kilo tasks. This is an intentional upgrade — monitor usage after rollout.

### Response Parsing (JSON)

```bash
# Extract text from JSON events
RESPONSE=$(echo "$OUTPUT" | jq -r 'select(.type == "text") | .part.text')
COST=$(echo "$OUTPUT" | jq -r 'select(.type == "step_finish") | .part.cost')
TOKENS=$(echo "$OUTPUT" | jq -r 'select(.type == "step_finish") | .part.tokens.total')
SESSION_ID=$(echo "$OUTPUT" | jq -r '.sessionID' | head -1)
```

## ⚠️ Gemini Backend Compatibility (Hard Constraint)

> **ALL changes in this spec are Kilo-only.** The Gemini CLI backend must remain fully functional and unchanged.

Every code change must be guarded by the existing `case "$CURRENT_BACKEND"` structure (already present at line ~277 in `watcher.sh`). Specifically:

| Mechanism | Current State (Both Backends) | Kilo After This Spec | Gemini After This Spec |
|---|---|---|---|
| Response extraction | Both use `telegram_reply.txt` written by agent | `--format json` → `jq` (skip reply file) | `telegram_reply.txt` (unchanged) |
| Session context | Both use `session_history.txt` + prompt injection | `--session` (real LLM persistence); `session_history.txt` kept as audit-only log, **not** injected into prompt | `session_history.txt` injected into prompt (unchanged) |
| Model routing | Both use `case "$CURRENT_BACKEND"` with `PLANNING_MODEL`/`ROUTINE_MODEL` | `--agent` flag (agent-per-role) replaces model vars | `PLANNING_MODEL`/`ROUTINE_MODEL` (unchanged) |
| Execution Plan table | Inline Python `TIER_MAP` in `/plan_feature` auto-load block (both backends) | Agents handle tier routing (but `TIER_MAP` stays — Gemini still uses it) | `TIER_MAP` (unchanged) |
| Prompt content | Hand-crafted instruction blocks with reply-file instructions | Minimal (session has context, no reply-file instructions) | Full prompt with reply-file instructions (unchanged) |

**Test gate:** After every work order, verify Gemini path still works: `./start.sh stop && backend=gemini ./start.sh start` → send test message → confirm `telegram_reply.txt` response.

## Edge Cases

| Scenario | Decision | Action |
|---|---|---|
| Session expired/corrupted | Auto-recover | Clear stale ID, start new session, notify user |
| Rate limit (429) | Keep session | Retry same session with fallback model |
| Context window full | Fork | `--fork` creates branch session, store new ID |
| Crash (no /shutdown) | Fresh start | `/startup` always creates new session |
| Project switch | Close + new | Close current session, start new in target dir |
| Watcher restart | Resume | Session ID in `state.json` survives restarts |

## Retrospective-Informed Risks

Scanned `retro_index.md` tags: `kilo`, `proxy`, `gemini-cli`, `testing`.

### From [kilo_cli_antigravity_claude_proxy](file:///Users/mkn501/Library/CloudStorage/GoogleDrive-ngcapinv@gmail.com/Meine%20Ablage/remote%20antigravity/docs/retrospectives/2026-03-05_kilo_cli_antigravity_claude_proxy.md) (2026-03-05)
- ❌ **Anti-Pattern**: Kilo CLI produces zero output without TTY → must keep `script -q /dev/null` wrapper
- ❌ **Anti-Pattern**: Kilo config schema changed between versions → validate `--session` works on 7.0.46 first
- ✅ **Proven Pattern**: E2E validation via Telegram before declaring done

### From [kilo_cli_backend_abstraction](file:///Users/mkn501/Library/CloudStorage/GoogleDrive-ngcapinv@gmail.com/Meine%20Ablage/remote%20antigravity/docs/retrospectives/2026-02-17_kilo_cli_backend_abstraction.md) (2026-02-17)
- ❌ **Anti-Pattern**: Never trust AI research without web search — verify `--session` behavior with actual testing
- ✅ **Proven Pattern**: Backend-agnostic `run_agent()` function — maintain this abstraction

---

## Work Orders

### WO-SES-0: Sync Kilo Agent Configs

- **Summary:** Update existing Kilo agent configs to use anthropic proxy models and sync system prompts from workstation_sop.md §6.
- **File(s):** `~/.config/kilo/` agent config files
- **Action:** Modify
- **Scope Boundary:** ONLY modify Kilo agent configs. Do NOT touch watcher.sh or bot.
- **Dependencies:** None
- **Parallel:** ✅ Yes
- **Acceptance:** `kilo agent list` shows all 4 agents with correct models
- **Tier:** 🆓 Free
- **Difficulty:** 2/10

### S-SES-1: Spike — Validate `--session` + `--agent` + `--fork` Together

- **Summary:** Verify that `--session`, `--agent`, and `--fork` flags work together (agent switch mid-session preserves context; fork creates viable branch session).
- **File(s):** None (manual test)
- **Action:** Research
- **Scope Boundary:** No code changes. Test only.
- **Dependencies:** WO-SES-0
- **Parallel:** ❌ No (blocks all subsequent work)
- **Acceptance:**
  - 3-turn test: (1) start session with agent A, (2) resume with agent B, (3) verify context from turn 1 is available
  - `--agent` + `--model` conflict test: pass both, document which wins
  - `--fork` test: (1) fill session context, (2) `--fork` → verify new session ID returned with context preserved
- **Tier:** 🆓 Free
- **Difficulty:** 2/10

### WO-SES-1: Refactor `run_agent()` for Session Resume + JSON

- **Summary:** Modify `run_agent()` to accept session ID and agent name, use `--session`/`--continue`, output `--format json`, and parse response via jq.
- **File(s):** `scripts/watcher.sh` — the `run_agent()` function (starts at `run_agent() {`)
- **Action:** Modify
- **Signature:** Use env vars to avoid positional-arg fragility:
  ```bash
  # New params passed via env (Kilo-only, ignored by Gemini path):
  KILO_SESSION_ID="ses_xxx" KILO_AGENT="sop-planner" \
    run_agent "prompt" "model" "project_dir" [extra_flags...]
  ```
- **Return Contract:** `run_agent()` currently exports `AGENT_OUTPUT`, `AGENT_STDERR_CONTENT`, `AGENT_EXIT_CODE`. Add:
  - `KILO_SESSION_ID_OUT` — session ID extracted from JSON output (for caller to store in `state.json`)
  - `KILO_RESPONSE_TEXT` — extracted text from JSON events
  - `KILO_COST` / `KILO_TOKENS` — cost and token usage from `step_finish` event
- **Scope Boundary:** ONLY modify `run_agent()` function. Do NOT touch model routing or workflow detection. **Also update the dispatch loop caller** (at the `run_agent` call inside the dispatch block) to pass env vars correctly — the positional API must stay backwards-compatible.
- **⚠️ Backend Guard:** New env vars (`KILO_SESSION_ID`, `KILO_AGENT`, `--format json`) apply ONLY inside the `kilo)` case. The `gemini|*)` case must remain unchanged.
- **Dependencies:** S-SES-1
- **Parallel:** ❌ No (core function, all others depend on it)
- **Acceptance:** `bash -n scripts/watcher.sh` passes; manual test with env vars resumes session
- **Tier:** ⚡ Mid
- **Difficulty:** 5/10

### WO-SES-2: Session Lifecycle in Watcher Main Loop

- **Summary:** Add session creation on `/startup`, session resume on subsequent messages, session close on `/shutdown`. Store session ID in `state.json`.
- **File(s):** `scripts/watcher.sh` — main message-handling subshell (starts at `cd "$ACTIVE_PROJECT"`) and dispatch loop (starts at `# DISPATCH EXECUTION`)
- **Action:** Modify
- **Scope Boundary:** ONLY modify the main loop and dispatch loop session management. Do NOT touch `run_agent()`.
- **⚠️ Backend Guard:** Session lifecycle (`kiloSessionId`) only activates when `backend=kilo`. Gemini path skips session management entirely.
- **`state.json` Schema Update:**
  ```json
  {
    "kiloSessionId": "ses_abc123",  // null when no active session
    "kiloSessionStartedAt": "2026-03-11T21:00:00Z",  // for staleness detection
    "backend": "kilo",
    "model": "...",
    "activeProject": "..."
  }
  ```
- **Session ID Lifecycle:**
  1. `/startup` → `run_agent()` returns `KILO_SESSION_ID_OUT` → write to `state.json.kiloSessionId`
  2. Subsequent messages → read `kiloSessionId` from `state.json` → pass via `KILO_SESSION_ID` env var
  3. `/shutdown` → set `kiloSessionId` to `null` in `state.json`
  4. Missing/corrupt `state.json` → treat as no session (create new)
- **Dependencies:** WO-SES-1
- **Parallel:** ❌ No
- **Acceptance:** E2E: `/startup` creates session → message resumes → `/shutdown` clears. `jq .kiloSessionId state.json` shows/clears correctly.
- **Tier:** ⚡ Mid
- **Difficulty:** 4/10

### WO-SES-3: Agent Routing in Workflow Detection

- **Summary:** Replace the Kilo branch of the existing `case "$CURRENT_BACKEND"` model routing with `--agent` flag selection based on workflow command.
- **File(s):** `scripts/watcher.sh` — the `case "$CURRENT_BACKEND"` block and `case "$USER_MESSAGES"` routing (in the message-handling section)
- **Action:** Modify
- **Scope Boundary:** ONLY modify the Kilo branch of the existing `case "$CURRENT_BACKEND"` routing. Do NOT touch `run_agent()`. The Gemini branch (`gemini|*)`) and its `PLANNING_MODEL`/`ROUTINE_MODEL`/`SELECTED_MODEL` routing must remain intact.
- **Dependencies:** WO-SES-1, WO-SES-2
- **Parallel:** ❌ No
- **Acceptance:** Watcher log shows `--agent sop-planner` for `/plan_feature`, `--agent sop-coordinator` for `/startup`
- **Tier:** ⚡ Mid
- **Difficulty:** 3/10

### WO-SES-4: Edge Case Handlers

- **Summary:** Implement session recovery (expired session → auto-create new), rate limit fallback, and context overflow fork.
- **File(s):** `scripts/watcher.sh` — error handling in the caller blocks (after `run_agent` calls in both message loop and dispatch loop)
- **Action:** Modify
- **Scope Boundary:** ONLY modify error handling after `run_agent()` calls. Add session-aware recovery logic to the existing rate-limit/fallback block.
- **Dependencies:** WO-SES-1, WO-SES-2
- **Parallel:** ✅ Yes (with WO-SES-3)
- **Acceptance:** Simulate expired session (invalid ID) → verify auto-recovery + user notification in outbox
- **Tier:** ⚡ Mid
- **Difficulty:** 4/10

### WO-SES-5: Streamline Kilo Prompt Path (Conditional Branching)

- **Summary:** For Kilo backend only: strip `telegram_reply.txt` write-instructions and `session_history.txt` read-instructions from prompts (Kilo session handles context natively). The files themselves remain — Gemini still uses them, and `session_history.txt` is kept as a human-readable audit log (still appended to, just not injected into Kilo prompts).
- **File(s):** `scripts/watcher.sh` — the prompt-building blocks (workflow prompt starting at `TELEGRAM_PROMPT=` and normal-message prompt) and reply-file reading block (at `REPLY_FILE=`)
- **Action:** Modify (conditional branching, NOT deletion)
- **Scope Boundary:** Add `if [ "$CURRENT_BACKEND" = "kilo" ]` guards around prompt sections. Do NOT delete shared mechanisms. Specifically:
  - Kilo prompt: remove "Conversation history for this session is in: .gemini/session_history.txt" line (session has native context)
  - Kilo prompt: remove "write a short Telegram-friendly reply to .gemini/telegram_reply.txt" instructions (response comes from JSON output)
  - Kilo reply: skip `telegram_reply.txt` reading, use `KILO_RESPONSE_TEXT` from `run_agent()` instead
  - Keep appending to `session_history.txt` for audit (line 368-370) for both backends
- **⚠️ Backend Guard:** `telegram_reply.txt`, `session_history.txt`, and `TIER_MAP` must ALL remain for Gemini. Only the Kilo prompt path is streamlined.
- **Dependencies:** WO-SES-1, WO-SES-2, WO-SES-3
- **Parallel:** ❌ No (touches same file)
- **Acceptance:** Kilo path: no `telegram_reply.txt` in prompt, no `session_history.txt` in prompt. Gemini path: both still in prompt. `bash -n watcher.sh` passes.
- **Tier:** ⚡ Mid
- **Difficulty:** 4/10

### WO-SES-6: Update Tests

- **Summary:** Update bot_test_v3.js to test session-persistent behavior: session ID in state.json, agent routing, JSON response parsing.
- **File(s):** `scripts/bot/bot_test_v3.js` (new test block ~line 1080+), `scripts/bot/registries.js` (remove TIER_DEFAULTS if unused)
- **Action:** Modify
- **Scope Boundary:** ONLY modify test file and registries. Do NOT touch watcher.
- **Dependencies:** WO-SES-5
- **Parallel:** ❌ No
- **Acceptance:** `node bot_test_v3.js` — all tests pass, including new session-persistence tests
- **Tier:** ⚡ Mid
- **Difficulty:** 3/10

### WO-SES-7: Update systemPatterns.md + Docs

- **Summary:** Add Pattern P-008 (Session-Persistent Kilo) to systemPatterns.md. Update architecture diagram. Update kilo_model_configuration.md guide.
- **File(s):** `memory-bank/systemPatterns.md`, `docs/guides/kilo_model_configuration.md`
- **Action:** Modify
- **Scope Boundary:** ONLY modify docs. Do NOT touch code.
- **Dependencies:** WO-SES-5
- **Parallel:** ✅ Yes (with WO-SES-6)
- **Acceptance:** Pattern P-008 exists in systemPatterns.md; architecture diagram updated
- **Tier:** 🆓 Free
- **Difficulty:** 1/10

---

## Dependency Graph

```
WO-SES-0 (agent configs) ──→ S-SES-1 (spike: --session + --agent)
                                     │
                                     ▼
                              WO-SES-1 (refactor run_agent)
                                     │
                                     ▼
                              WO-SES-2 (session lifecycle)
                                     │
                              ┌──────┴──────┐
                              ▼             ▼
                       WO-SES-3        WO-SES-4
                     (agent routing)  (edge cases)
                              │             │
                              └──────┬──────┘
                                     ▼
                               WO-SES-5 (streamline prompts)
                                     │
                              ┌──────┴──────┐
                              ▼             ▼
                       WO-SES-6        WO-SES-7
                       (tests)         (docs)
```

---

## Execution Plan

| # | Task | Summary | Diff | Tier | ∥? | Deps |
|---|---|---|---|---|---|---|
| 0 | WO-SES-0 Agent config sync | Update 4 Kilo agents to anthropic models | 2/10 | 🆓 Free | ✅ | — |
| 1 | S-SES-1 Session+Agent+Fork spike | Validate --session + --agent + --fork work together | 2/10 | 🆓 Free | ❌ | 0 |
| 2 | WO-SES-1 Refactor run_agent | Add session ID (env var), JSON output, agent flag, return contract | 5/10 | ⚡ Mid | ❌ | 1 |
| 3 | WO-SES-2 Session lifecycle | /startup creates, messages resume, /shutdown closes, state.json schema | 4/10 | ⚡ Mid | ❌ | 2 |
| 4 | WO-SES-3 Agent routing | Replace Kilo branch of model routing with --agent flag | 3/10 | ⚡ Mid | ✅ | 3 |
| 5 | WO-SES-4 Edge case handlers | Session recovery, rate limit, fork | 4/10 | ⚡ Mid | ✅ | 3 |
| 6 | WO-SES-5 Streamline prompts | Conditional branching: strip reply-file + history from Kilo prompts | 3/10 | ⚡ Mid | ❌ | 4,5 |
| 7 | WO-SES-6 Update tests | New session-persistence test block | 3/10 | ⚡ Mid | ✅ | 6 |
| 8 | WO-SES-7 Docs update | P-008 in systemPatterns, guide update | 1/10 | 🆓 Free | ✅ | 6 |

---

## Implementation Difficulty Summary

| Task | Component | Difficulty | Tier | Parallel? |
|---|---|---|---|---|
| WO-SES-0 | Kilo config | 2/10 | 🆓 Free | ✅ |
| S-SES-1 | Spike | 2/10 | 🆓 Free | ❌ |
| WO-SES-1 | watcher.sh (run_agent) | 5/10 | ⚡ Mid | ❌ |
| WO-SES-2 | watcher.sh (main loop) | 4/10 | ⚡ Mid | ❌ |
| WO-SES-3 | watcher.sh (routing) | 3/10 | ⚡ Mid | ✅ |
| WO-SES-4 | watcher.sh (error handling) | 4/10 | ⚡ Mid | ✅ |
| WO-SES-5 | watcher.sh (prompt branching) | 3/10 | ⚡ Mid | ❌ |
| WO-SES-6 | bot_test_v3.js | 3/10 | ⚡ Mid | ✅ |
| WO-SES-7 | docs | 1/10 | 🆓 Free | ✅ |

**Overall Score**: (2+2+5+4+3+4+3+3+1) / 9 = 3.0 + 3 (risk modifiers) = **6.0/10 (Moderate)**

### Risk Factors
- [x] Touches test infrastructure → +1
- [x] Cross-layer (watcher + bot + agent configs) → +1
- [x] New architectural pattern (session persistence) → +1

---

## Testing Strategy

### Unit Tests (bot_test_v3.js)

New test block (`session-persistence`):
- [ ] state.json stores and retrieves `kiloSessionId` correctly
- [ ] Agent routing maps: `/startup` → `sop-coordinator`, `/plan_feature` → `sop-planner`
- [ ] JSON response parsing extracts `text`, `cost`, `tokens`
- [ ] Edge case: expired session ID → cleared from state
- [ ] Legacy mechanisms removed: no TIER_DEFAULTS for `kilo` in registries

**Verification:** `cd scripts/bot && node bot_test_v3.js`

### E2E Validation (Manual via Telegram)

1. Send `/startup` → verify session created, context report received
2. Send follow-up message → verify it references startup context
3. Send `/plan_feature` → verify it references both startup + follow-up
4. Send `/shutdown` → verify session closed, `kiloSessionId` cleared
5. Send message after shutdown → verify fresh session created

### Regression

- [ ] All existing 156 tests pass after changes
- [ ] `/ping` still works (stateless, no session needed)
- [ ] `/model` command still changes model for regular messages
- [ ] Project switch preserves bot state
- [ ] Dispatch loop tasks execute correctly with session-aware `run_agent()`

### Gemini Backend Regression (Critical)

- [ ] Switch to Gemini backend → send message → `telegram_reply.txt` generated
- [ ] Gemini `/startup` → `session_history.txt` written and referenced in prompt
- [ ] Gemini `/plan_feature` → TIER_MAP generates execution plan table
- [ ] Gemini model routing uses `PLANNING_MODEL`/`ROUTINE_MODEL` (not agents)
- [ ] Gemini prompt still contains reply-file instructions + session_history reference

---

## Jules Eligibility

| Task | Jules Filter | Eligible? | Reason |
|---|---|---|---|
| WO-SES-0 | ≤3 files, deterministic | ✅ | Config-only, clear pass/fail |
| WO-SES-7 | ≤3 files, deterministic | ✅ | Docs-only, no code logic |
| WO-SES-6 | ≤3 files, clear tests | ⚠️ Maybe | Test additions, but needs context of new behavior |
| All others | Cross-file, needs testing | ❌ | Core watcher changes, need interactive debugging |

---

## Decisions

1. **Keep `session_history.txt`** as human-readable audit log (still appended to, but not injected into Kilo prompts).
2. **Same session for `/plan_feature`** — planning benefits from startup context. Use `--fork` if context overflows.
3. **Agent-per-tier-model** — use existing SOP agents from `workstation_sop.md §6`.
4. **Env vars for new params** — `KILO_SESSION_ID` and `KILO_AGENT` passed via env, not positional args, to maintain backwards-compatible `run_agent()` signature.
5. **Dispatch loop in scope** — both the main message loop and the dispatch execution loop call `run_agent()` and must be updated for session awareness.

---

## Rollback Strategy

If session persistence causes instability in production:

1. **Immediate**: Set `KILO_SESSION_ENABLED=false` in `.env` → watcher falls back to stateless `kilo run --auto` (current behavior)
2. **Implementation**: Add a guard at the top of session logic:
   ```bash
   KILO_SESSION_ENABLED=$(grep -s 'KILO_SESSION_ENABLED' "$ENV_FILE" | cut -d'=' -f2)
   if [ "${KILO_SESSION_ENABLED:-true}" = "false" ]; then
       # Skip session management, use stateless invocation
   fi
   ```
3. **No data loss**: `session_history.txt` is still written regardless, so audit trail is preserved

---

## Handoff Checklist

- [x] Spec document created
- [x] All tasks added as work orders with full format
- [x] Difficulty ratings and tier recommendations assigned
- [x] Overall difficulty calculated with risk modifiers (6.0/10)
- [x] Dependency graph produced
- [x] Execution Plan Summary table generated
- [ ] User approved the Execution Plan (approval gate)
- [x] Unit test plan documented
- [x] Regression suite reviewed
- [x] Jules-eligible tasks identified (WO-SES-0, WO-SES-7)
- [x] Relevant retrospectives reviewed (2 matched: kilo proxy, kilo backend)
- [x] Gemini backend compatibility reviewed — backend guards on all work orders
- [x] Dispatch loop included in scope (WO-SES-1, WO-SES-2)
- [x] Rollback strategy documented
- [x] Cost implications of Opus models flagged
