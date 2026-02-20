// ============================================================================
// registries.js — Model, platform, and tier configuration
// ============================================================================

const MODEL_OPTIONS = [
    { id: 'gemini-2.5-flash', label: '1️⃣ Flash', short: 'Flash' },
    { id: 'gemini-2.5-pro', label: '2️⃣ Pro', short: 'Pro' },
    { id: 'gemini-3-pro-preview', label: '3️⃣ Pro 3.0 Preview', short: 'Pro 3.0 Preview' },
    { id: 'gemini-2.0-flash-lite', label: '4️⃣ Flash Lite', short: 'Flash Lite' },
];

const PLATFORM_MODELS = {
    'gemini': [
        { id: 'gemini-2.5-flash', label: '⚡ Flash 2.5' },
        { id: 'gemini-2.5-pro', label: '🧠 Pro 2.5' },
        { id: 'gemini-3-pro-preview', label: '🧠 Pro 3.0' },
        { id: 'gemini-2.0-flash-lite', label: '🆓 Flash Lite' }
    ],
    'kilo': [
        { id: 'openrouter/z-ai/glm-5', label: '🧠 GLM-5' },
        { id: 'openrouter/minimax/minimax-m2.5', label: '⚡ MiniMax M2.5' },
        { id: 'openrouter/z-ai/glm-4.7-flash', label: '🆓 GLM-4.7 Flash' }
    ],
    'jules': []
};

const PLATFORM_LABELS = {
    'gemini': '💻 Gemini CLI',
    'kilo': '🧪 Kilo CLI',
    'jules': '🤖 Jules'
};

const BACKEND_OPTIONS = [
    { id: 'gemini', label: '💻 Gemini CLI', short: 'Gemini' },
    { id: 'kilo', label: '🧪 Kilo CLI', short: 'Kilo' }
];

const TIER_EMOJI = { 'top': '🧠', 'mid': '⚡', 'free': '🆓' };

const TIER_DEFAULTS = {
    gemini: {
        'top': { platform: 'gemini', model: 'gemini-2.5-pro' },
        'mid': { platform: 'gemini', model: 'gemini-2.5-flash' },
        'free': { platform: 'gemini', model: 'gemini-2.0-flash-lite' }
    },
    kilo: {
        'top': { platform: 'kilo', model: 'openrouter/minimax/minimax-m2.5' },
        'mid': { platform: 'kilo', model: 'openrouter/minimax/minimax-m2.5' },
        'free': { platform: 'kilo', model: 'openrouter/z-ai/glm-5' }
    }
};

function DIFFICULTY_LABEL(score) {
    if (!score) return '';
    if (score <= 2) return '⭐ Trivial';
    if (score <= 4) return '⭐⭐ Easy';
    if (score <= 6) return '⭐⭐⭐ Moderate';
    if (score <= 8) return '🔥 Hard';
    return '💀 Expert';
}

export {
    MODEL_OPTIONS, PLATFORM_MODELS, PLATFORM_LABELS,
    BACKEND_OPTIONS, TIER_EMOJI, TIER_DEFAULTS, DIFFICULTY_LABEL
};
