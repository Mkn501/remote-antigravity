# Kilo Backend Model Configuration Guide

This document describes where Kilo model assignments are configured across the Remote Antigravity system.

## Configuration Locations

### 1. Available Models: `scripts/bot/registries.js`

**`PLATFORM_MODELS.kilo`** — the list shown when users type `/model` in Telegram:

```js
'kilo': [
    { id: 'anthropic/claude-opus-4-6-thinking', label: '🧠 Claude Opus 4.6 (Thinking)' },
    { id: 'anthropic/claude-sonnet-4-6', label: '⚡ Claude Sonnet 4.6' },
]
```

**`TIER_DEFAULTS.kilo`** — default model assigned per difficulty tier during `/plan_feature`:

```js
kilo: {
    'top': { platform: 'kilo', model: 'anthropic/claude-opus-4-6-thinking' },
    'mid': { platform: 'kilo', model: 'anthropic/claude-sonnet-4-6' },
    'free': { platform: 'kilo', model: 'anthropic/claude-sonnet-4-6' }
}
```

### 2. Tiered Routing: `scripts/watcher.sh` (line ~276)

Controls which model is used for specific workflow commands:

```bash
case "$CURRENT_BACKEND" in
    kilo)
        ROUTINE_MODEL="anthropic/claude-sonnet-4-6"   # /startup, /shutdown
        PLANNING_MODEL="anthropic/claude-sonnet-4-6"   # /plan_feature
        FALLBACK_MODEL="anthropic/claude-sonnet-4-6"   # error recovery
        ;;
esac
```

### 3. Execution Plan Builder: `scripts/watcher.sh` (line ~576)

Inline Python block that assigns models to tasks during `/plan_feature` based on difficulty:

```python
TIER_MAP = {
    'kilo': {
        'top': ('kilo', 'anthropic/claude-opus-4-6-thinking'),
        'mid': ('kilo', 'anthropic/claude-sonnet-4-6'),
        'free': ('kilo', 'anthropic/claude-sonnet-4-6')
    }
}
```

### 4. Kilo CLI Model Registry: `~/.config/kilo/opencode.json`

If a model name isn't in Kilo CLI's built-in registry, it must be registered here:

```json
{
    "provider": {
        "anthropic": {
            "options": {
                "baseURL": "http://localhost:3456/v1",
                "apiKey": "antigravity-proxy"
            },
            "models": {
                "claude-opus-4-6-thinking": {
                    "name": "Claude Opus 4.6 (Thinking)"
                }
            }
        }
    }
}
```

## Format Rules

- **Kilo CLI expects**: `provider/model` (e.g., `anthropic/claude-sonnet-4-6`)
- **3-part OpenRouter paths**: `openrouter/vendor/model` are normalized to `openrouter/model`
- **Proxy model names**: must match `/v1/models` output exactly — check with `curl http://localhost:3456/v1/models | jq '.data[].id'`

## Adding a New Model

1. Add to `PLATFORM_MODELS.kilo` in `registries.js` — makes it selectable via `/model`
2. If the model isn't in Kilo's built-in registry, add it to `opencode.json`
3. Optionally update `TIER_DEFAULTS` and watcher `TIER_MAP` if it should be a default
4. Run `node bot_test_v3.js` to verify tests pass
