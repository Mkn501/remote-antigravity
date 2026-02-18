# Retrospective: Telegram Plan Mode & Model Reliability

**Date**: 2026-02-18
**Topic**: `telegram_plan_mode_and_model_reliability`
**Tags**: `telegram`, `regression`, `gemini-cli`, `testing`

## Context
Goal was to fix the "dispatch blocked" issue where `wa_plan_mode` prevented task execution even after approval. We implemented an auto-clear mechanism. During E2E testing, we discovered several other issues impacting reliability.

## Key Learnings

### 1. Plan Mode Auto-Clear Design
**Problem**: The `wa_plan_mode` marker (used to block code edits during planning) persisted after approval, blocking the dispatch loop forever.
**Fix**: Watcher now checks `wa_dispatch.json` status. If `status=approved`, it automatically deletes `wa_plan_mode` before the main dispatch loop runs.
**Validation**: Added regression test `mock flow: approved dispatch auto-clears plan mode marker`.

### 2. Button Callback Mismatch (Silent Failure)
**Problem**: The "▶️ Next Task" button in Telegram was unresponsive.
**Root Cause**: `watcher.sh` was sending `callback_data: "ep_next"`, but `bot.js` only had a handler for `"ep_continue"`.
**Fix**: Updated watcher to send `ep_continue`.
**Prevention**: Added a regression test that parses `watcher.sh` STEP_MARKUP and verifies every callback key exists in `bot.js`.

### 3. False Positive Rate Limit Detection
**Problem**: Tasks were marked as `error` incorrectly.
**Analysis**: The watcher greps stderr for keywords like `rate.limit` or `resource.exhausted`. Gemini CLI often hits a brief rate limit, prints a warning to stderr, **retries successfully** (after ~2ms), and completes the task. The watcher sees the stderr warning and flags it as a failure despite success (exit code 0).
**resolution**: Need to check exit code first, or grep only for *fatal* errors. (Deferred to next session).

### 4. Model Behavior: Test vs Implementation
**Observation**: When asked to "Implement /version handler in bot.js", Gemin Pro sometimes writes **tests** in `bot.test.js` instead of the implementation, even when the prompt explicitly says `FILES: scripts/bot/bot.js`.
**Mitigation**: Stronger prompt instructions or post-run scope verification.

### 5. Flash + Sandbox Reliability
**Observation**: `gemini-2.5-flash` with `--sandbox` struggled with `replace` operations on large files (`bot.js` ~1000 lines), failing repeatedly with `could not find string to replace`.
**Verdict**: Flash is fast but less reliable for precise code editing in large files compared to Pro.

## Action Items
- [ ] Fix false-positive rate limit detector (check exit code 0).
- [ ] Add post-dispatch scope verification (revert files not in `FILES:`).
- [ ] Consider defaulting to Pro for implementation tasks involving large files.
