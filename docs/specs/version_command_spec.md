# Specification: /version Command with Uptime

> **Status**: ✅ Implemented (test needs update)
> **Owner**: Kilo (Planner)
> **Created**: 2026-02-19
> **Product**: Remote Antigravity
> **Priority**: P3 Low

## 1. Executive Summary
Add uptime tracking to the existing `/version` command in the Telegram bot. The bot already shows version, backend, and model info — we just need to add how long it's been running since startup.

## 2. Goals
1. Track bot start time on initialization
2. Display uptime in `/version` command output (e.g., "Uptime: 2h 34m")
3. Maintain backward compatibility with existing version output

### Non-Goals
- Tracking restarts separately (just total uptime since last start)
- Persisting uptime across bot restarts (not needed)

## 3. Technical Design
### 3.1 Components
- **bot.js**: Add `BOT_START_TIME` constant at top, update `/version` handler

### 3.2 Uptime Format
- < 1 minute: "just now"
- < 1 hour: "Xm"
- < 24 hours: "Xh Ym"
- >= 24 hours: "Xd Xh"

## 4. Spikes
None needed — trivial change with existing pattern.

## 5. Open Source & Commercialization Impact
- No new dependencies
- No licensing concerns

## 6. Implementation Phases
### Phase 1: Add uptime tracking
- Add `const BOT_START_TIME = Date.now();` at script init
- Update `/version` handler to calculate and display uptime

## 7. Security & Risks
- None — read-only command that only displays elapsed time

## 8. Testing

### 8.1 Unit Tests
- Existing test file: `scripts/bot/bot.test.js`
- **Gap found**: Test at line 587 does NOT include/assert uptime — needs update to add `⏱️ Uptime:` assertion

### 8.2 Regression Suite
- No existing tests affected

## 9. Work Orders

### Task 1: ✅ DONE — Add uptime tracking to bot.js
- **File(s):** `scripts/bot/bot.js` (lines 54, 56-66, 197-218)
- **Status:** Implemented
- **Evidence:** `BOT_START_TIME` constant, `formatUptime()` function, `/version` handler with uptime output

### Task 2: Update test to assert uptime
- **File(s):** `scripts/bot/bot.test.js` (lines 587-611)
- **Action:** Modify
- **Signature:** N/A (test assertion)
- **Scope Boundary:** ONLY modify bot.test.js. No other files.
- **Dependencies:** None
- **Parallel:** Yes
- **Acceptance:** Test asserts `⏱️ Uptime:` is present in output
- **Tier:** 🆓 Free
- **Difficulty:** 1/10

## 10. Dependency Graph
```
Task 1 (independent)
```

## 11. Execution Plan Summary

| # | Task | Tier | Parallel? | Deps |
|---|---|---|---|---|
| 1 | Add uptime tracking to /version | 🆓 Free | ✅ | — |

> **Overall Difficulty**: 1/10 (Trivial)

## 12. Jules-Eligibility
This task is trivial (1 file, 2 line changes) — can be delegated to Jules if desired.
