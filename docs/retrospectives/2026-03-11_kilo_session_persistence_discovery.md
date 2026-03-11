# Retrospective: Kilo CLI Session Persistence Discovery & Architecture Spec

**Date:** 2026-03-11  
**Scope:** Kilo CLI 7.0.46 capability audit, session resume spike, SOP-compliant architecture spec  
**Duration:** ~2 hours  
**Severity:** Low (research + planning, no production changes)

---

## Context

Investigating Kilo CLI session persistence as a replacement for the stateless single-shot invocation pattern. Triggered by debugging model selection issues where `/plan_feature` was using Opus Thinking instead of Sonnet, causing 25+ minute sessions.

## What Was Done

1. Fixed watcher.sh model routing for `/plan_feature` to always use PLANNING_MODEL, not SELECTED_MODEL
2. Discovered Kilo CLI 7.0.46 has `--session`, `--continue`, `--format json`, `--agent` capabilities
3. Upgraded Kilo CLI from 7.0.43 → 7.0.46
4. Spiked `kilo run --continue` — validated session resume works ("Remember 42" → "42" ✅)
5. Spiked `--session <id>` — validated explicit session resume ✅
6. Spiked `--format json` — validated structured output with type/text/cost/tokens ✅
7. Discovered template `workstation_sop.md` already defines 4 SOP agents with system prompts — aligned spec to use them
8. Created SOP-compliant spec with 9 work orders, dependency graph, testing strategy, Jules eligibility
9. Identified 3 Gemini compatibility risks and added backend guards to all work orders

---

## Trial & Error Log

### Attempt 1: Check if `/startup` persists context
- **Expected**: `/startup` loads context that subsequent messages can reference
- **Reality**: Each `kilo run --auto` is a fresh instance — `/startup` output is immediately lost
- **Resolution**: Use `--session` to maintain a persistent conversation across CLI invocations

### Attempt 2: Kilo upgrade
- **Expected**: `kilo upgrade` from 7.0.43 → latest
- **Reality**: Smooth upgrade to 7.0.46 via npm
- **Resolution**: No issues

### Attempt 3: Session resume spike
- **Expected**: `kilo run --continue` should recall context from previous session
- **Reality**: Worked perfectly — "42" recalled from previous turn
- **Resolution**: Validated `--continue`, `--session <id>`, and `--format json` all work

### Attempt 4: Agent naming
- **Expected**: Needed to create new `antigravity-*` agents
- **Reality**: Template's `workstation_sop.md` already defines `sop-coordinator`, `sop-planner`, `sop-developer`, `sop-auditor` with full system prompts
- **Resolution**: Adopt existing agent definitions, don't reinvent

### Attempt 5: Gemini compatibility
- **Expected**: Changes would be clean Kilo-only
- **Reality**: 3 shared mechanisms (telegram_reply.txt, session_history.txt, TIER_MAP) would break Gemini if removed
- **Resolution**: All changes must be backend-guarded; WO-SES-5 renamed from "Remove Legacy" to "Streamline Kilo Prompt Path"

---

## Key Takeaways

### Anti-Patterns Identified
- ❌ **Removing shared mechanisms without checking all backends** — telegram_reply.txt and session_history.txt are shared by Gemini and Kilo
- ❌ **Writing work orders as one-liners** — SOP requires full format with File(s), Scope, Deps, Acceptance, Tier
- ❌ **Inventing new patterns when template already defines them** — always check `workstation_sop.md` first

### Proven Patterns
- ✅ **Spike before spec** — 10-minute spike ("Remember 42") prevented hours of spec work on an unvalidated assumption
- ✅ **Template-first design** — reusing existing SOP agent definitions saved prompt engineering work
- ✅ **Backend guard as hard constraint** — making Gemini compatibility an explicit section prevented scope creep

---

## Relevant References

- Spec: `docs/specs/kilo_session_persistent_spec.md`
- Template SOP: `antigravity project template/docs/standards/workstation_sop.md` (§6)
- Previous retro: `docs/retrospectives/2026-03-05_kilo_cli_antigravity_claude_proxy.md`
