# Tiered Model Routing Strategy

**Date:** 2026-02-17
**Status:** Draft — For Discussion
**Context:** Remote Antigravity / Backend-Agnostic Watcher
**Depends On:** [backend_agnostic_watcher_spec.md](backend_agnostic_watcher_spec.md)

---

## Concept

Route tasks to different LLM quality tiers based on task type, optimizing cost without sacrificing quality where it matters.

```
Planning (🧠 Top) → Coding (⚡ Mid) → Debug Start (⚡ Mid) → Debug Escalate (🧠 Top)
```

---

## Model Tiers

### 🧠 Tier 1 — Reasoning (Planning & Escalated Debugging)

High-stakes, low-volume. Needs broad reasoning, architecture awareness, tradeoff analysis.

| Model | Input/1M | Output/1M | Notes |
|---|---|---|---|
| Gemini 3 Pro | ~$1.25–$2.50 | ~$10–$15 | Best for Google ecosystem tasks |
| Claude Opus 4.6 | ~$5.00 | ~$15.00 | Best for complex refactoring |
| GLM-5 | TBD | TBD | Strong reasoning, early access via Nebius |

### ⚡ Tier 2 — Execution (Coding & First-Pass Debugging)

High-volume, well-scoped tasks. Code gen from clear specs.

| Model | Input/1M | Output/1M | Notes |
|---|---|---|---|
| DeepSeek-V3 | $0.14–$0.30 | $0.28–$0.45 | Best price/quality for code |
| Qwen3-Coder-480B | $0.40 | $1.80 | Large context, code-specialized |
| GLM-4.6 | ~$0.40 | ~$2.00 | Good generalist mid-tier |
| MiniMax M2.5 | TBD | TBD | Mid-tier, Kilo-native |
| Gemini 2.5 Flash | $0.15 | $0.60 | Fast, cheap, good enough for most code |

### 🆓 Tier 3 — Free (Trivial / Background Tasks)

Zero-cost for simple queries, summaries, formatting.

| Model | Cost | Notes |
|---|---|---|
| MiniMax M2.1 | Free (Kilo) | Slow, but works for non-urgent tasks |
| Gemini CLI free tier | Free (Google) | Current default, generous limits |

---

## Task-to-Tier Mapping

| Task Type | Tier | Rationale |
|---|---|---|
| Architecture / system design | 🧠 Top | Bad plans are expensive to fix |
| Spec writing / research | 🧠 Top | Needs broad knowledge + reasoning |
| Feature implementation | ⚡ Mid | Well-scoped from spec, pattern matching |
| Bug fix (first attempt) | ⚡ Mid | Most bugs are simple — try cheap first |
| Bug fix (escalated) | 🧠 Top | If mid-tier fails after 2 attempts, escalate |
| Tests / boilerplate | ⚡ Mid | Formulaic, doesn't need deep reasoning |
| README / docs | ⚡ Mid | Writing, not reasoning |
| Quick questions | 🆓 Free | Trivial queries |

---

## Cost Projection (~20 interactions/day)

| Phase | Calls/day | Tier | Daily | Monthly |
|---|---|---|---|---|
| Planning | 2 | 🧠 Top ($2.50/M) | ~$0.05 | ~$1.50 |
| Coding | 15 | ⚡ Mid ($0.30/M) | ~$0.04 | ~$1.20 |
| Debug (mid) | 2 | ⚡ Mid ($0.30/M) | ~$0.005 | ~$0.15 |
| Debug (escalated) | 1 | 🧠 Top ($2.50/M) | ~$0.025 | ~$0.75 |
| **Total** | **20** | | | **~$3.60/month** |

> [!NOTE]
> This is ~$3.60/month vs $0/month with Gemini CLI free tier. The value is **flexibility** (model choice, parallel agents, MCP), not cost savings.

---

## Implementation Options

### Option A: Manual (via `/model` command)

User manually switches model before each task. Already supported.

```
/model → Select Gemini 3 Pro → "Plan the caching module"
/model → Select DeepSeek-V3 → "Implement the cache per spec"
```

**Pros:** Simple, no new code. **Cons:** User burden, easy to forget.

### Option B: Keyword-Based Auto-Routing

Watcher detects task type from message keywords and selects tier automatically.

```bash
# In run_agent() or watcher.sh
case "$MSG" in
  plan*|design*|architect*|research*) MODEL="$TIER1_MODEL" ;;
  fix*|debug*|bug*)                   MODEL="$TIER2_MODEL" ;;  # start mid, escalate later
  *)                                  MODEL="$TIER2_MODEL" ;;
esac
```

**Pros:** Zero user friction. **Cons:** Keyword matching is fragile.

### Option C: Telegram Command Per Tier

New commands: `/plan`, `/code`, `/debug` that set the tier for the next message.

```
/plan Design the caching module      → routes to Tier 1
/code Implement the cache per spec   → routes to Tier 2
/debug Fix failing test              → routes to Tier 2 (auto-escalates on failure)
```

**Pros:** Explicit intent, no keyword guessing. **Cons:** New commands to learn.

---

## Debug Escalation Logic

```
User sends /debug "fix failing test"
  → Attempt 1: Tier 2 model
  → If test still fails (detected via exit code or response):
    → Attempt 2: Tier 1 model (auto-escalate)
    → Notify user: "🔄 Escalated to [Tier 1 model] for deeper analysis"
```

> [!IMPORTANT]  
> **Open question:** How to detect failure? Options:
> 1. Parse CLI exit code (reliable but limited)
> 2. Ask user for feedback ("Did this fix it? y/n")
> 3. Run tests automatically after fix (`--on-task-completed "npm test"`)

---

## Discussion Points

1. **Which Option (A/B/C)?** — Option C (`/plan`, `/code`, `/debug`) feels cleanest. Thoughts?
2. **Default tier?** — Should default be Mid (cost-optimized) or Top (quality-first)?
3. **Escalation automation** — Is auto-escalation worth building now, or start with manual?
4. **Model preferences** — Which specific models do you want for each tier?
5. **Kilo Pass?** — At ~$3.60/month, the $19/month Kilo Pass doesn't pay for itself. Skip it?
