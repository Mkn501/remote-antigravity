# Retrospective: Multi-Project Dispatch Routing Bug

**Date:** 2026-03-01
**Scope:** Multi-Project Support — Dispatch Execution
**Duration:** ~1h (investigation + planning)
**Severity:** High (Dispatch executing in wrong project)

---

## Context

After returning from a day where the Gemini CLI was running sessions via Telegram, the user expected 4 tasks to have been implemented across the session. Instead, only spec files were written with no actual code implementation.

---

## What Was Done

1. Checked git log on both `main` and `telegram/active` — no commits from today
2. Analyzed `watcher.log` — all sessions launched "in: zokai station"
3. Traced the dispatch flow through `watcher.sh`, `bot_v2.js`, and `helpers.js`
4. Identified root cause: dispatch loop reads `state.activeProject` at execution time, not plan time
5. Produced spec `docs/specs/multi_project_routing_fix_spec.md` with 4 work orders

---

## Trial & Error Log

### 1. "Wrong project selected" hypothesis

- **Expected**: User accidentally sent commands to the wrong project
- **Reality**: The watcher was correctly routing sessions to "zokai station" as the active project — this was the desired behavior. The bug is that dispatch tasks (which were for `remote-antigravity`) also ran in zokai station because both use the same `state.activeProject` lookup.
- **Resolution**: Distinguished session routing (always correct: go to active project) from dispatch routing (should go to **originating** project).

### 2. "Dispatch file missing" hypothesis

- **Expected**: Maybe `wa_dispatch.json` wasn't written
- **Reality**: `wa_dispatch.json` was present and had `status: completed` — the CLI ran 3 times but produced no file changes because it was looking in the wrong repo for `commands/general.js`.
- **Resolution**: Confirmed: correct file, wrong directory.

### 3. Architectural understanding

- **Expected**: The central HQ inbox/outbox design was the problem
- **Reality**: The centralized message queue is correct by design. The bug is only in the dispatch execution path (L697-701 in watcher.sh), which should read project from `wa_dispatch.json` rather than `state.json`.
- **Resolution**: Minimal fix — add `project` field to dispatch file, read it in the watcher execution loop.

---

## Root Cause

`wa_dispatch.json` has no record of which project spawned the tasks. The watcher dispatch loop re-reads `state.activeProject` at runtime, which may point to a different project than where the tasks were planned.

**Fix**: Add `project: <path>` to `wa_dispatch.json` at plan-approval time (via `writeDispatch()` in `bot_v2.js`). Stamp it at plan-creation time in `watcher.sh`. Watcher reads dispatch's `project` for execution.

---

## Lessons Learned

| # | Lesson | Detail |
|---|--------|--------|
| 1 | **Dispatch must be self-contained** | The dispatch file must carry all routing info needed to execute, not rely on transient state |
| 2 | **Silent empty commits = wrong directory** | If CLI runs but produces "no changes added to commit", first check `pwd` is correct |
| 3 | **Check watcher.log before assuming agent failure** | The dispatch ran 3x successfully — the failure was in routing, not execution |

---

## Files Changed / Artifacts

- `[NEW] docs/specs/multi_project_routing_fix_spec.md`
- `[MODIFIED] memory-bank/systemPatterns.md` — added P-005 Project-Aware Dispatch
- `[MODIFIED] memory-bank/activeContext.md` — next session goal updated

---

## Lookup Tags

`gemini-cli`, `multi-project`, `dispatch`, `routing`, `regression`
