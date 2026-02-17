# Builder-Ready Planning Workflow

**Date:** 2026-02-17
**Status:** Draft — For Review
**Context:** Tiered Model Routing / Multi-Builder Parallelism
**Depends On:** [tiered_model_routing_spec.md](tiered_model_routing_spec.md), [backend_agnostic_watcher_spec.md](backend_agnostic_watcher_spec.md)

---

## Problem

The current `/plan_feature` workflow produces tasks that assume the executing model has **equal reasoning ability** to the planning model. Example:

> "Add run_agent() function to watcher.sh"

This forces a mid-tier execution model to **reason about** scope, file structure, function signatures, and edge cases — work the planning model should have done. The result: mid-tier models produce vague or incorrect code.

## Goal

Upgrade the planning workflow so that a **top-tier model plans once**, and **mid-tier models execute mechanically** — via Jules, Kilo CLI, or Antigravity.

### Principle

> *"The planning model's job is to eliminate reasoning for the execution model."*

---

## The Architect → Builder Pattern

```
🧠 Pro 3.0 (Architect)
│   /plan_feature "Add OAuth2 support"
│   Output: N work orders + Execution Plan Summary
│
│   📋 Propose → 👤 Approve/Override → ⚡ Execute
│
├──→ ⚡ Jules (GitHub)       ──→ PR (async, parallel)
├──→ ⚡ Kilo CLI (Local)     ──→ commit on branch (parallel)
└──→ ⚡ Antigravity (IDE)    ──→ direct edit (sequential)
```

### Lifecycle: Propose → Approve → Execute

The architect (Pro 3.0) produces work orders with **tier recommendations** (top/mid/free) — not specific platforms or models. The user then maps tiers to concrete platforms and models.

> [!IMPORTANT]
> **No tasks execute until the user approves the Execution Plan.** This is the cost control gate.

#### Path A: Telegram (Remote, Parallel)

Uses a **Default + Override** pattern to minimize user interactions:

**Step 1 — Choose default platform (applies to all tasks):**
```
📋 Execution Plan (3 tasks)
Default platform: [Gemini CLI] [Kilo] [Jules]
```

**Step 2 — Choose default model (filtered by platform):**
```
📋 Default model for Gemini CLI:
[Pro 3.0] [Flash 2.5] [Flash Lite]
```

**Step 3 — Confirm or override individual tasks:**
```
✅ All 3 tasks → Gemini CLI: Flash 2.5
1. Add config      ⚡ Flash 2.5
2. Token refresh   ⚡ Flash 2.5
3. Integration test ⚡ Flash 2.5

[🚀 Execute All] [✏️ Override Task] [🔄 Re-plan]
```

**Override flow** (only if needed):
```
User taps "✏️ Override Task"

Bot: Which task?
[1. Add config] [2. Token refresh] [3. Integration]

User taps "3"

Bot: Task 3 — Platform: [Gemini CLI] [Kilo] [Jules]
User taps "Gemini CLI"

Bot: Task 3 — Model: [Pro 3.0] [Flash 2.5] [Flash Lite]
User taps "Pro 3.0"

Bot: ✅ Updated:
1. Add config      ⚡ Gemini: Flash 2.5
2. Token refresh   ⚡ Gemini: Flash 2.5
3. Integration test 🧠 Gemini: Pro 3.0

[🚀 Execute All] [✏️ Override Task]
```

| Scenario | Taps |
|---|---|
| All same platform + model | **3** |
| Override 1 task | **7** |
| All different (rare) | **7+** |

The watcher dispatches tasks per the confirmed assignments.

**Platform → Model Registry** (configured in `bot.js`):
```javascript
const PLATFORM_MODELS = {
  'gemini': ['gemini-3-pro-preview', 'gemini-2.5-flash', 'gemini-2.0-flash-lite'],
  'kilo':   ['glm-5', 'glm-4.7', 'minimax-m2.1', 'deepseek-v3', 'qwen3-coder'],
  'jules':  []  // no model choice, GitHub-managed
};
```

#### Path B: IDE / Antigravity (Local, Sequential)

The user reads the spec with work orders, then **manually** invokes:

1. Pick a task from the plan
2. Run `/implement_task` — Antigravity executes with the architect's proposed model (or the user's own choice)
3. Review the result
4. Pick next task, repeat

The user IS the orchestrator — no platform/model decision tree needed because the IDE agent's model is configured at the IDE level.

> [!NOTE]
> Antigravity is **IDE-only**. It does not appear as an option on Telegram.

### Execution Plan Summary (Architect Output)

The architect produces this table as the final output of every `/plan_feature`:

```markdown
## Execution Plan

| # | Task | Tier | Parallel? | Deps |
|---|---|---|---|---|
| 1 | Add OAuth config to config.js | ⚡ Mid | ✅ | — |
| 2 | Token refresh in auth.js | ⚡ Mid | ✅ | — |
| 3 | Integration test (needs 1+2) | 🧠 Top | ❌ | 1, 2 |

> Cost is estimated after platform+model selection.
> On Telegram: assign platforms and models via buttons.
> In IDE: use /implement_task per task sequentially.
```

> [!NOTE]
> The architect outputs **tiers**, not costs. Cost estimation happens after the user selects a platform+model combination, since the same tier maps to different prices on different platforms.

---

## Work Order Format (Required Per Task)

Every task in a spec must include these fields:

```markdown
### Task N: [Verb] [noun] in [file]
- **File(s):** exact/path/to/file.js (lines ~80-95)
- **Action:** Add | Modify | Delete | Refactor
- **Signature:** functionName(input: Type) → output: Type
- **Scope Boundary:** ONLY modify [file]. Do NOT touch [other files].
- **Dependencies:** None | Requires Task N-1 complete
- **Parallel:** Yes | No (with reason)
- **Acceptance:** `npm test` passes | specific test command
- **Tier:** 🧠 Top | ⚡ Mid | 🆓 Free (architect's recommendation)
- **Difficulty:** 1-10
```

### Key Constraints
- Each task touches **≤ 3 source files + 1 test file**
- If a task requires 4+ source files → **split it** or escalate to top-tier
- Function signatures are **mandatory** for logic tasks — for UI/styling tasks, use CSS selectors or component names instead
- Scope boundaries are **mandatory** — prevents mid-tier scope creep
- All file paths must be **explicit** — builders don't search, they go straight to the file

---

## Artifacts to Update

### 1. SOP (Federated Model)

**Location:** Knowledge item `federated_vibe_coding_sop`

**Change:** Add "Builder-Ready Output Standard" principle:
- Plans must produce parallelizable work orders in a universal format
- Planning model eliminates reasoning for execution model
- Task granularity rule: ≤ 3 source files + 1 test file per task
- Same work order format works for Jules, Kilo CLI, and Antigravity
- **Propose → Approve → Execute** lifecycle: no tasks execute without user confirmation

---

### 2. `/plan_feature` Workflow

**Location:** `.agent/workflows/plan_feature.md` (all projects)

**Changes to Phase 3 (Task Generation):**

Current task format:
```markdown
- [ ] [Category] Description [Difficulty: X/10]
  - Files: file1.py, file2.tsx
  - Verification: `pytest tests/test_xxx.py -v`
```

Upgraded to work order format:
```markdown
- [ ] [Category] [Verb] [noun] in [file] [Difficulty: X/10]
  - **File(s):** exact/path (lines ~N-M)
  - **Signature:** funcName(params) → returnType
  - **Scope:** ONLY [file], do NOT modify [other]
  - **Tier:** 🧠 Top | ⚡ Mid | 🆓 Free
  - **Parallel:** Yes/No
  - **Acceptance:** exact test command
```

**New Phase 3.5: Dependency Graph**

After task generation, output:
```
Task 1 ──┐
Task 2 ──┼──→ Task 5 (needs 1+2) ──→ Task 6
Task 3 ──┘
Task 4 (independent)
```

**New Phase 4: Execution Plan Summary & User Approval**

After dependency graph, produce the Execution Plan Summary table (see above). On Telegram, the plan triggers the Default + Override inline button flow. In IDE, the user reviews and manually invokes `/implement_task` per task.

---

### 3. Spec Template

**Location:** `docs/specs/_TEMPLATE.md` (all projects)

**Changes:**
- Add "Work Order" section template with required fields (including Tier)
- Add "Dependency Graph" section (mermaid or ASCII)
- Add "Execution Plan Summary" section template (the approval table)
- Add "Parallelism Notes" section: which tasks are safe to run simultaneously

---

### 4. `/implement_task` Workflow

**Location:** `.agent/workflows/implement_task.md` (all projects)

**Changes:**
- Expect work order as input, not free-form description
- Remove "research phase" (architect already did this)
- Add guard: "If scope boundary is violated, STOP and report"
- Add guard: "If task is unclear, STOP and request re-plan"

---

### 5. Project Template

**Location:** `/Users/mkn501/Library/CloudStorage/GoogleDrive-ngcapinv@gmail.com/Meine Ablage/antigravity project template`

**Changes:**
- Update `docs/specs/_TEMPLATE.md` with work order format + Execution Plan Summary
- Update `.agent/workflows/plan_feature.md` with Phase 3.5 + Phase 4 (Approval Gate)
- Update `.agent/workflows/implement_task.md` with work order expectations
- Bump `TEMPLATE_VERSION`

---

### 6. Jules Handoff Alignment

The existing Jules handoff template (`_JULES_HANDOFF_TEMPLATE.md`) already enforces most work order fields (Mission, Files, Code Anchors, Guardrails, Verification). The upgrade formalizes this pattern for **all** execution — not just Jules.

> [!NOTE]
> The Jules handoff template is the **proof of concept** for builder-ready tasks. This spec generalizes it to all execution models (Jules, Kilo CLI, Antigravity).

---

## Implementation Phasing

### Phase 1 (Now): Gemini CLI (Sequential) + Jules (Parallel)

The current watcher dispatches tasks **sequentially** through Gemini CLI. Jules can be dispatched **in parallel** via GitHub MCP. Phase 1 implements:
- Work order format in specs and workflows
- Tier recommendations from architect
- Telegram approval flow (Default + Override)
- **Gemini CLI dispatch:** one task at a time via `gemini --model <selected>`
- **Jules dispatch:** Gemini CLI uses GitHub MCP to create an Issue with the work order → Jules picks it up automatically

**Jules prerequisites** (project must satisfy all):
- [x] Project hosted on GitHub
- [x] `AGENTS.md` in repo root (already in project template)
- [x] Gemini CLI has GitHub MCP configured (to create issues)

**In IDE (Antigravity):** Jules dispatch is native — create GitHub Issue directly.

### Phase 2 (Future): Multi-Platform Parallel Execution

Requires:
- [ ] Kilo CLI installed and configured (`kilo run --auto` verified)
- [ ] Watcher refactored for parallel Kilo dispatch (branch-per-task, multi-lock)
- [ ] Merge conflict resolution strategy

```bash
# Phase 2: Future parallel mode in watcher.sh
if [ "$IS_PARALLEL" = true ]; then
    for TASK in "${PARALLEL_TASKS[@]}"; do
        kilo run --auto --model "$MID_MODEL" "$TASK" &
        PIDS+=($!)
    done
    for PID in "${PIDS[@]}"; do
        wait $PID || FAILURES+=($PID)
    done
fi
```

### Rollback Strategy (Phase 2)

Each parallel builder runs on a **separate git branch** (`kilo/task-1`, `jules/task-2`). If one fails, its branch is discarded. Successful branches merge sequentially.

### Progress Reporting

The watcher reports per-task progress to Telegram:
```
⚡ Task 1/3 ✅ done
⚡ Task 2/3 🔄 running...
⚡ Task 3/3 ⏳ queued
```

---

## State Schema Extension

The Telegram approval flow requires persisting the execution plan in `state.json`:

```json
{
  "model": "gemini-3-pro-preview",
  "activeProject": "/path/to/project",
  "executionPlan": {
    "status": "pending_approval",
    "tasks": [
      {
        "id": 1,
        "description": "Add OAuth config",
        "tier": "mid",
        "platform": null,
        "model": null,
        "parallel": true,
        "deps": []
      },
      {
        "id": 2,
        "description": "Integration test",
        "tier": "top",
        "platform": null,
        "model": null,
        "parallel": false,
        "deps": [1]
      }
    ],
    "defaultPlatform": null,
    "defaultModel": null
  }
}
```

The bot populates `platform` and `model` per task as the user makes selections. Once all tasks have assignments, `status` changes to `approved` and the watcher dispatches.

---

## Migration Path

| Phase | Scope | Effort |
|---|---|---|
| 1. Update spec template | `_TEMPLATE.md` in this project | 30 min |
| 2. Update `plan_feature.md` | `.agent/workflows/` in this project | 1 hour |
| 3. Update `implement_task.md` | `.agent/workflows/` in this project | 30 min |
| 4. Propagate to project template | `antigravity project template/` | 30 min |
| 5. Update SOP knowledge item | Knowledge base | 30 min |
| 6. Test with real feature | Use tiered routing on next feature | 1 session |

---

## Resolved Decisions

| # | Question | Decision |
|---|---|---|
| 1 | File limit per task | **≤ 3 source files + 1 test file** — covers most real patterns without being restrictive |
| 2 | Signature format for UI tasks | **CSS selectors / component names** instead of function signatures |
| 3 | Dependency graph location | **In the spec** — part of the work order output |
| 4 | Orchestration | **Watcher-managed** — already handles lifecycle, no new daemon |
| 5 | Rollback | **Branch-per-builder** (Phase 2) — discard failed branches, merge successful ones |
| 6 | Builder/model assignment | **Architect proposes tiers**, user maps to platform+model via 2-step decision tree |
| 7 | Auto-assignment heuristic | **No** — architect recommends tiers only, user decides platform+model (knows their budget/availability) |
| 8 | Override UX | **Inline buttons** — Default + Override pattern, no free text parsing |
| 9 | Cost estimation | **Deferred to post-selection** — cost depends on platform+model, calculated after user chooses |
| 10 | Phasing | **Phase 1**: Gemini CLI (sequential) + Jules (parallel via GitHub MCP). **Phase 2**: Kilo CLI parallel |

## Open Questions

1. **Merge conflict resolution** (Phase 2) — When parallel branches conflict, auto-resolve or escalate to top-tier model?
2. **Platform availability detection** — Bot should verify prerequisites before showing platform options (e.g., check GitHub remote exists for Jules, check Kilo CLI installed for Kilo). Exact detection logic TBD during implementation.
