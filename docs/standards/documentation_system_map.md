# Documentation System Map

> **"You Are Here"** — How all SOPs, workflows, and templates connect.

---

## Global vs Local Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  GLOBAL (Shared across ALL workspaces)                          │
│                                                                 │
│  docs/roadmap/                  ← Cross-product dependency graph│
│    ├── index.md                    (Navigation hub)             │
│    ├── SOP_roadmap_updates.md      (Cross-reference rules)     │
│    ├── 4_products/*.md             (Every product's roadmap)   │
│    └── 4_products/_PRODUCT_ROADMAP_TEMPLATE.md                 │
│                                                                 │
│  ~/.gemini/antigravity/global_workflows/                        │
│    ├── startup.md / shutdown.md                                 │
│    ├── plan_feature.md / implement_task.md                      │
│    ├── pr_check.md / merge_changes.md                           │
│    ├── update_roadmap.md / init_project.md                      │
│    └── setup-mcp-tasks.md                                       │
├─────────────────────────────────────────────────────────────────┤
│  LOCAL (Per-workspace)                                          │
│                                                                 │
│  AGENTS.md                              ← Jules persistent ctx  │
│  docs/standards/workstation_sop.md      ← Lifecycle rules HERE  │
│  docs/standards/documentation_system_map.md  ← THIS FILE        │
│  docs/specs/_TEMPLATE.md                ← Feature specs HERE    │
│  docs/specs/_JULES_HANDOFF_TEMPLATE.md  ← Jules handoff docs    │
│  docs/retrospectives/_RETRO_TEMPLATE.md ← Retrospective format  │
│  docs/specs/<feature>_spec.md           ← Filled-in specs       │
│  memory-bank/                           ← This project's brain  │
│  antigravity_tasks.md                   ← This project's tasks  │
└─────────────────────────────────────────────────────────────────┘
```

---

## "I Want To…" Quick Reference

| I want to… | Do this |
|------------|---------|
| **Start a new project** | `/init_project` (Mode A) → scaffold from template |
| **Audit project compliance** | `/init_project` (Mode B) → check structure & content vs template |
| **Start my day** | `/startup` → loads `memory-bank/`, checks tasks |
| **Plan a new feature** | `/plan_feature` → creates spec from `_TEMPLATE.md`, generates tasks |
| **Add a new product** | `/update_roadmap` (Scenario 4) → copies `_PRODUCT_ROADMAP_TEMPLATE.md` |
| **Evaluate a feature idea** | `/update_roadmap` (Scenario 6) → full evaluation |
| **Change architecture** | `/update_roadmap` (Scenario 2) → check ripple map |
| **Implement a task** | `/implement_task` → pick from backlog, TDD cycle |
| **Review a PR** | `/pr_check` → Validation & Risk Report (Local PR or GitHub) |
| **Merge Changes** | `/merge_changes` → Execution & branch cleanup |
| **Delegate a task to Jules** | Fill `_JULES_HANDOFF_TEMPLATE.md` → GitHub Issue + `jules` label |
| **Write a retrospective** | Copy `_RETRO_TEMPLATE.md` → fill sections → update `retro_index.md` |
| **End my session** | `/shutdown` → sync memory bank, retrospective, commit |

---

## Flow: Feature → Ship

```
/startup → Load context, check tasks
    ↓
/plan_feature → Create spec, generate tasks
    ├── If roadmap affected → /update_roadmap
    └── Generate tasks
    ↓
/implement_task → TDD cycle (repeat per task)
    ↓
/pr_check → Validation & Risk Audit (Local PR or GitHub)
    ↓
/merge_changes → Final Execution & Cleanup
    ↓
/shutdown → Retrospective, sync, commit
```

---

## Document Inventory

### Hierarchy

> **Map** (this file) → **SOP** (constitution) → **Workflows** (operational steps) → **SYSTEM_GUIDE** (deep reference, template only)

### SOPs (Rules)

| Document | Scope | Purpose |
|----------|-------|---------|
| `docs/standards/workstation_sop.md` | Local | Constitution: roles, principles, philosophy. Points to workflows for steps. |
| `docs/roadmap/SOP_roadmap_updates.md` | Global | 6 scenarios for propagating roadmap changes |

### Templates

| Template | Location | When to Use |
|----------|----------|-------------|
| `docs/specs/_TEMPLATE.md` | Local | New feature specification |
| `docs/specs/_JULES_HANDOFF_TEMPLATE.md` | Local | Delegating a task to Jules (10-section handoff doc) |
| `docs/retrospectives/_RETRO_TEMPLATE.md` | Local | Post-session retrospective (Trial & Error format) |
| `docs/roadmap/4_products/_PRODUCT_ROADMAP_TEMPLATE.md` | Global | New product roadmap |
| `AGENTS.md` | **repo root** | Persistent context for Jules (architecture, standards, env setup) |
| `CHANGELOG.md` | **template** | System-level changelog and template versioning |

---
> **Document Version**: 2.0 | **Last Updated**: 2026-02-16 | **Change**: Added merge_changes.md, Local PR references, updated flow diagram.
