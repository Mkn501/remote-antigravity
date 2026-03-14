// ============================================================================
// Telegram Relay Bot — wa-bridge (v2)
// ============================================================================
// Drop-in replacement for bot.js with all P0+P1 fixes from
// bot_refactoring_spec.md applied:
//   SEC-4:  Duplicate /kill handler removed
//   SEC-2:  Broad pkill → targeted killAgent() from shell.js
//   MAINT-4: PROJECT_DIR → DEFAULT_PROJECT_DIR
//   MAINT-2: Duplicate dotenv import removed
//   SEC-1:  Branch name sanitization via isValidHotfixBranch()
//   MAINT-3: Consistent getState() everywhere
//
// Relays messages between Telegram and Agent CLI (Gemini or Kilo) via JSON
// files (wa_inbox.json / wa_outbox.json).
//
// Commands:
//   /sprint        — Start Sprint Mode
//   /stop          — Send STOP signal
//   /status        — Check status
//   /review_plan   — Review & approve execution plan
//   /project <name> — Switch active project
//   /add <name> <path> — Register a new project
//   /list          — List available projects
//
// Usage:
//   1. Copy .env.example to .env and fill in values
//   2. npm install
//   3. npm start
// ============================================================================

// [MAINT-2 FIX] Removed duplicate `import 'dotenv/config'` — only load from script dir below
import TelegramBot from 'node-telegram-bot-api';
import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync, statSync, unlinkSync, createReadStream, openSync } from 'fs';
import { spawn } from 'child_process';
import { resolve, dirname, isAbsolute, join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { killAgent, isValidHotfixBranch, safeGit } from './shell.js';

// --- Config ---
// Resolve paths relative to this script file (scripts/bot/bot.js)
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
// Project root is two levels up from scripts/bot/
const PROJECT_ROOT = resolve(SCRIPT_DIR, '..', '..');

// Load .env from script dir
import dotenv from 'dotenv';
dotenv.config({ path: resolve(SCRIPT_DIR, '.env') });

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const DEFAULT_PROJECT_DIR = process.env.GEMINI_PROJECT_DIR || PROJECT_ROOT;

// Central storage (in remote antigravity)
const CENTRAL_DIR = resolve(DEFAULT_PROJECT_DIR, '.gemini');
const INBOX = resolve(CENTRAL_DIR, 'wa_inbox.json');
const OUTBOX = resolve(CENTRAL_DIR, 'wa_outbox.json');
const STATE_FILE = resolve(CENTRAL_DIR, 'state.json');
const DISPATCH_FILE = resolve(CENTRAL_DIR, 'wa_dispatch.json');

const POLL_INTERVAL_MS = 2000;
const MAX_MSG_LEN = 4096;

const BOT_START_TIME = Date.now();

function formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'just now';
    if (hours < 1) return `${minutes}m`;
    if (days < 1) return `${hours}h ${minutes % 60}m`;
    return `${days}d ${hours % 24}h`;
}

if (!TOKEN || !CHAT_ID) {
    console.error('❌ Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID in .env');
    process.exit(1);
}

// Ensure central dir exists
if (!existsSync(CENTRAL_DIR)) {
    mkdirSync(CENTRAL_DIR, { recursive: true });
}

// --- Helpers ---

function readJsonSafe(filePath, fallback) {
    try {
        return JSON.parse(readFileSync(filePath, 'utf8'));
    } catch {
        return fallback;
    }
}

function atomicWrite(filePath, data) {
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    const tmp = `${filePath}.tmp`;
    writeFileSync(tmp, JSON.stringify(data, null, 2));
    renameSync(tmp, filePath);
}

function writeToInbox(text) {
    const inbox = readJsonSafe(INBOX, { messages: [] });
    const entry = {
        id: `msg_${Date.now()}`,
        timestamp: new Date().toISOString(),
        from: 'user',
        text: text,
        read: false
    };
    inbox.messages.push(entry);
    atomicWrite(INBOX, inbox);
    return entry;
}

// Initialize State
if (!existsSync(STATE_FILE)) {
    const initialState = {
        activeProject: DEFAULT_PROJECT_DIR,
        projects: {
            "main": DEFAULT_PROJECT_DIR
        }
    };
    atomicWrite(STATE_FILE, initialState);
}

function getState() {
    return readJsonSafe(STATE_FILE, { activeProject: DEFAULT_PROJECT_DIR, projects: { "main": DEFAULT_PROJECT_DIR } });
}

function updateState(updater) {
    const state = getState();
    updater(state);
    atomicWrite(STATE_FILE, state);
    return state;
}

// --- Bot Init ---
const bot = new TelegramBot(TOKEN, { polling: true });
console.log('🤖 wa-bridge bot started');
console.log(`   📂 Default Project: ${DEFAULT_PROJECT_DIR}`);
console.log(`   📥 Inbox:   ${INBOX}`);
console.log(`   📤 Outbox:  ${OUTBOX}`);
console.log(`   💾 State:   ${STATE_FILE}`);
console.log(`   💬 Chat ID: ${CHAT_ID}`);
console.log('');

// --- Startup Notification ---
(async () => {
    try {
        const state = getState();
        const projectName = Object.entries(state.projects || {}).find(([, p]) => p === state.activeProject)?.[0] || 'unknown';
        console.log(`🔔 Sending startup notification to chat ${CHAT_ID}...`);
        const result = await bot.sendMessage(CHAT_ID, [
            '🟢 Bot Started',
            '📂 Project: ' + projectName,
            '⏰ ' + new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }),
            '',
            'Send /help for commands.'
        ].join('\n'));
        console.log(`🔔 Startup notification sent (msg_id: ${result.message_id})`);
    } catch (err) {
        console.error(`Startup notification failed: ${err.message}`);
    }
})();

// --- Commands ---

bot.onText(/^\/help/, async (msg) => {
    if (String(msg.chat.id) !== String(CHAT_ID)) return;
    const help = [
        '🤖 Antigravity Bot Commands',
        '',
        '⚡ Workflow Commands (→ Gemini CLI):',
        '/startup — Load project context, fresh branch',
        '/shutdown — Save state, close session branch',
        '/plan_feature — Plan a new feature',
        '/implement_task — Implement an assigned task',
        '/pr_check — Check and merge PRs',
        '/update_roadmap — Update roadmap docs',
        '/new — Archive branch, start fresh',
        '',
        '📋 Execution Plan:',
        '/review_plan — Review & approve execution plan',
        '',
        '🔧 Bot Commands (instant):',
        '/status — System status',
        '/stop — Halt agent',
        '/sprint — Sprint mode',
        '/project <name> — Switch project',
        '/list — List projects',
        '/version — Bot version info',
        '/help — This message',
        '/model — Switch AI model',
        '/backend — Switch CLI backend (Gemini/Kilo)',
        '/clear_lock — Clear stuck session lock',
        '/restart — Kill + restart watcher with diagnostics',
        '/watchdog — Watchdog status (restart history)',
        '/kill — Force-kill running agent immediately (no wait)',
        '/diagnose — Trigger LLM crash diagnosis from logs',
        '/autofix — Toggle auto-fix mode (prepare fix + ask permission)',
        '/apply_fix — Apply pending hotfix to main + restart',
        '/discard_fix — Discard pending hotfix branch',
    ].join('\n');
    await bot.sendMessage(CHAT_ID, help);
});

bot.onText(/^\/version/, async (msg) => {
    if (String(msg.chat.id) !== String(CHAT_ID)) return;
    const state = getState();
    const backend = state.backend || 'gemini';
    const model = state.model || '(default)';
    const backendLabel = BACKEND_OPTIONS.find(b => b.id === backend)?.short || backend;
    const modelEntry = PLATFORM_MODELS[backend]?.find(m => m.id === model);
    const modelLabel = modelEntry ? modelEntry.label : model;

    const uptime = formatUptime(Date.now() - BOT_START_TIME);

    const versionLines = [
        'ℹ️ wa-bridge Bot',
        `📦 Version: ${require('./package.json').version}`,
        `🔧 Backend: ${backendLabel}`,
        `🤖 Model: ${modelLabel}`,
        `⏱️ Uptime: ${uptime}`,
        `⏰ ${new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}`
    ].join('\n');

    await bot.sendMessage(CHAT_ID, versionLines);
});

// --- Model Selection ---
const MODEL_OPTIONS = [
    { id: 'gemini-2.5-flash', label: '1️⃣ Flash', short: 'Flash' },
    { id: 'gemini-2.5-pro', label: '2️⃣ Pro', short: 'Pro' },
    { id: 'gemini-3-pro-preview', label: '3️⃣ Pro 3.0 Preview', short: 'Pro 3.0 Preview' },
    { id: 'gemini-3.1-pro-preview', label: '4️⃣ Pro 3.1 Preview', short: 'Pro 3.1 Preview' },
    { id: 'gemini-2.0-flash-lite', label: '5️⃣ Flash Lite', short: 'Flash Lite' },
];

// --- Platform → Model Registry (for tiered execution) ---
const PLATFORM_MODELS = {
    'gemini': [
        { id: 'gemini-2.5-flash', label: '⚡ Flash 2.5' },
        { id: 'gemini-2.5-pro', label: '🧠 Pro 2.5' },
        { id: 'gemini-3-pro-preview', label: '🧠 Pro 3.0' },
        { id: 'gemini-3.1-pro-preview', label: '🧠 Pro 3.1' },
        { id: 'gemini-2.0-flash-lite', label: '🆓 Flash Lite' }
    ],
    'kilo': [
        { id: 'openrouter/z-ai/glm-5', label: '🧠 GLM-5' },
        { id: 'openrouter/minimax/minimax-m2.5', label: '⚡ MiniMax M2.5' },
        { id: 'openrouter/z-ai/glm-4.7-flash', label: '🆓 GLM-4.7 Flash' }
    ],
    'jules': [] // No model choice — GitHub-managed
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

// Planner suggestion: each tier maps to a default platform + model
const TIER_DEFAULTS = {
    gemini: {
        'top': { platform: 'gemini', model: 'gemini-2.5-pro' },
        'mid': { platform: 'gemini', model: 'gemini-2.5-flash' },
        'free': { platform: 'gemini', model: 'gemini-2.0-flash-lite' }
    },
    kilo: {
        'top': { platform: 'kilo', model: 'openrouter/z-ai/glm-5' },
        'mid': { platform: 'kilo', model: 'openrouter/minimax/minimax-m2.5' },
        'free': { platform: 'kilo', model: 'openrouter/z-ai/glm-4.7-flash' }
    }
};

// Difficulty score → display label
const DIFFICULTY_LABEL = (score) => {
    if (!score) return '';
    if (score <= 2) return '⭐ Trivial';
    if (score <= 4) return '⭐⭐ Easy';
    if (score <= 6) return '⭐⭐⭐ Moderate';
    if (score <= 8) return '🔥 Hard';
    return '💀 Expert';
};

// --- Execution Plan Helpers ---

function loadExecutionPlan() {
    const state = getState();
    return state.executionPlan || null;
}

function saveExecutionPlan(plan) {
    updateState(s => s.executionPlan = plan);
}

function formatExecutionPlan(plan) {
    const lines = [`📋 Execution Plan (${plan.tasks.length} tasks)\n`];
    for (const t of plan.tasks) {
        const tierEmoji = TIER_EMOJI[t.tier] || '❓';
        const modelEntry = PLATFORM_MODELS[t.platform]?.find(m => m.id === t.model);
        const modelLabel = modelEntry ? modelEntry.label : (t.model || (t.platform === 'jules' ? 'GitHub' : '—'));
        const diff = t.difficulty ? `  ${DIFFICULTY_LABEL(t.difficulty)} (${t.difficulty}/10)` : '';
        const deps = t.deps?.length ? `  deps: ${t.deps.join(', ')}` : '';
        lines.push(`${t.id}. ${t.description}  ${tierEmoji} ${modelLabel}${diff}${deps}`);
        if (t.summary) {
            lines.push(`   → ${t.summary}`);
        }
    }
    return lines.join('\n');
}

/** Apply tier-based defaults to tasks that have no platform/model assigned */
function applyTierDefaults(plan) {
    const state = getState();
    const backend = state.backend || 'gemini';
    const tierMap = TIER_DEFAULTS[backend] || TIER_DEFAULTS['gemini'];
    let applied = false;
    for (const t of plan.tasks) {
        if (!t.platform && tierMap[t.tier]) {
            t.platform = tierMap[t.tier].platform;
            t.model = tierMap[t.tier].model;
            applied = true;
        } else if (!t.platform) {
            // No tier match — use backend default model
            t.platform = backend;
            t.model = (PLATFORM_MODELS[backend] || [])[0]?.id || state.model;
            applied = true;
        }
    }
    if (applied && !plan.defaultPlatform) {
        plan.defaultPlatform = backend;
    }
    return applied;
}

function writeDispatch(plan) {
    const dispatch = {
        timestamp: new Date().toISOString(),
        status: 'approved',
        tasks: plan.tasks.map(t => ({
            id: t.id,
            description: t.description,
            platform: t.platform,
            model: t.model,
            parallel: t.parallel,
            deps: t.deps
        }))
    };
    atomicWrite(DISPATCH_FILE, dispatch);
}

bot.onText(/^\/model$/, async (msg) => {
    if (String(msg.chat.id) !== String(CHAT_ID)) return;
    const state = getState(); // [MAINT-3 FIX] was readJsonSafe(STATE_FILE, {})
    const backend = state.backend || 'gemini';
    const current = state.model || 'gemini-3-pro-preview';

    // Show models for the active backend
    const models = PLATFORM_MODELS[backend] || PLATFORM_MODELS['gemini'];
    const currentLabel = models.find(m => m.id === current)?.label || current;
    const backendLabel = BACKEND_OPTIONS.find(b => b.id === backend)?.short || backend;

    await bot.sendMessage(CHAT_ID, `🤖 Backend: ${backendLabel}\nCurrent model: ${currentLabel}${!state.model ? ' (default)' : ''}\nSelect a model:`, {
        reply_markup: {
            inline_keyboard: [models.map(m => ({
                text: m.id === current ? `✅ ${m.label}` : m.label,
                callback_data: `model:${m.id}`
            }))]
        }
    });
});

// --- Backend Selection ---
bot.onText(/^\/backend$/, async (msg) => {
    if (String(msg.chat.id) !== String(CHAT_ID)) return;
    const state = getState(); // [MAINT-3 FIX] was readJsonSafe(STATE_FILE, {})
    const current = state.backend || 'gemini';

    await bot.sendMessage(CHAT_ID, `🔧 Active backend: ${BACKEND_OPTIONS.find(b => b.id === current)?.label || current}\nSelect backend:`, {
        reply_markup: {
            inline_keyboard: [BACKEND_OPTIONS.map(b => ({
                text: b.id === current ? `✅ ${b.label}` : b.label,
                callback_data: `backend:${b.id}`
            }))]
        }
    });
});

// --- /review_plan Command: Start Execution Plan Approval ---

bot.onText(/^\/review_plan$/, async (msg) => {
    if (String(msg.chat.id) !== String(CHAT_ID)) return;
    const plan = loadExecutionPlan();

    if (!plan || !plan.tasks?.length) {
        await bot.sendMessage(CHAT_ID, '📋 No execution plan found.\n\nRun /plan_feature first — the architect will generate a plan and save it to state.json.\nThe plan will appear here automatically when ready.');
        return;
    }

    if (plan.status === 'approved') {
        await bot.sendMessage(CHAT_ID, `✅ Plan already approved.\n\n${formatExecutionPlan(plan)}\n\nThe watcher will dispatch automatically.`, {
            reply_markup: {
                inline_keyboard: [[{ text: '🔄 Re-plan', callback_data: 'ep_replan' }]]
            }
        });
        return;
    }

    if (plan.status === 'executing') {
        await bot.sendMessage(CHAT_ID, `⏳ Plan is executing...\n\n${formatExecutionPlan(plan)}`);
        return;
    }

    // Apply tier-based defaults (planner suggestions) if tasks are unassigned
    applyTierDefaults(plan);
    plan.status = 'confirming';
    saveExecutionPlan(plan);

    // Go straight to confirmation — 1-tap happy path
    await bot.sendMessage(CHAT_ID,
        formatExecutionPlan(plan) + '\n\n💡 Suggested by planner based on task tier.',
        {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🚀 Execute All', callback_data: 'ep_execute' }, { text: '✏️ Override Task', callback_data: 'ep_override' }],
                    [{ text: '🔄 Re-plan', callback_data: 'ep_replan' }]
                ]
            }
        }
    );
});

bot.on('callback_query', async (query) => {
    // Auth: only accept from configured chat
    if (String(query.message?.chat.id) !== String(CHAT_ID)) return;
    const chatId = query.message.chat.id;
    const msgId = query.message.message_id;

    if (query.data?.startsWith('model:')) {
        const modelId = query.data.replace('model:', '');
        const state = getState();
        const backend = state.backend || 'gemini';
        const models = PLATFORM_MODELS[backend] || PLATFORM_MODELS['gemini'];
        const modelInfo = models.find(m => m.id === modelId);
        if (!modelInfo) return;

        updateState(s => s.model = modelId);

        await bot.answerCallbackQuery(query.id, { text: `Switched to ${modelInfo.label}` });
        await bot.editMessageText(`🤖 Model switched to: ${modelInfo.label}`, { chat_id: chatId, message_id: msgId });
        console.log(`🤖 ${new Date().toISOString()} | Model → ${modelId}`);

    } else if (query.data?.startsWith('backend:')) {
        const backendId = query.data.replace('backend:', '');
        const backendInfo = BACKEND_OPTIONS.find(b => b.id === backendId);
        if (!backendInfo) return;

        // Switch backend and reset model to first model of that backend
        const models = PLATFORM_MODELS[backendId] || [];
        const defaultModel = models.length > 0 ? models[0].id : null;
        updateState(s => {
            s.backend = backendId;
            s.model = defaultModel;
        });

        const modelLabel = models.find(m => m.id === defaultModel)?.label || defaultModel || 'none';
        await bot.answerCallbackQuery(query.id, { text: `Switched to ${backendInfo.short}` });
        await bot.editMessageText(`🔧 Backend: ${backendInfo.label}\n🤖 Model: ${modelLabel}`, { chat_id: chatId, message_id: msgId });
        console.log(`🔧 ${new Date().toISOString()} | Backend → ${backendId}, Model → ${defaultModel}`);

    } else if (query.data?.startsWith('project:')) {
        const name = query.data.replace('project:', '');
        const state = getState();
        if (!state.projects[name]) return;

        updateState(s => s.activeProject = state.projects[name]);

        // Clear stale session files from new project to prevent context leakage
        const newProjectDir = state.projects[name];
        const dotGemini = resolve(newProjectDir, '.gemini');
        for (const staleFile of ['session_history.txt', 'telegram_reply.txt']) {
            const fp = resolve(dotGemini, staleFile);
            try { if (existsSync(fp)) unlinkSync(fp); } catch { /* ignore */ }
        }

        await bot.answerCallbackQuery(query.id, { text: `Switched to ${name}` });
        await bot.editMessageText(`📂 Switched to: ${name}`, { chat_id: chatId, message_id: msgId });
        console.log(`📂 ${new Date().toISOString()} | Project → ${name}`);

        // --- Execution Plan: Step 1 — Platform selected ---
    } else if (query.data?.startsWith('ep_platform:')) {
        const platform = query.data.replace('ep_platform:', '');
        const plan = loadExecutionPlan();
        if (!plan) return;

        plan.defaultPlatform = platform;

        // Jules has no model choice — skip to confirmation
        if (platform === 'jules') {
            plan.defaultModel = null;
            plan.tasks.forEach(t => { t.platform = 'jules'; t.model = null; });
            plan.status = 'confirming';
            saveExecutionPlan(plan);

            await bot.answerCallbackQuery(query.id, { text: 'Jules selected' });
            await bot.editMessageText(
                formatExecutionPlan(plan) + '\n\nAll tasks → Jules (GitHub)',
                {
                    chat_id: chatId, message_id: msgId,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🚀 Execute All', callback_data: 'ep_execute' }, { text: '✏️ Override Task', callback_data: 'ep_override' }],
                            [{ text: '🔄 Re-plan', callback_data: 'ep_replan' }]
                        ]
                    }
                }
            );
            return;
        }

        // Show Step 2: model selection
        plan.status = 'selecting_model';
        saveExecutionPlan(plan);

        const models = PLATFORM_MODELS[platform] || [];
        const modelButtons = models.map(m => ({
            text: m.label,
            callback_data: `ep_model:${m.id}`
        }));
        // Split into rows of 2
        const rows = [];
        for (let i = 0; i < modelButtons.length; i += 2) {
            rows.push(modelButtons.slice(i, i + 2));
        }

        await bot.answerCallbackQuery(query.id, { text: `${PLATFORM_LABELS[platform]}` });
        await bot.editMessageText(
            `📋 Default model for ${PLATFORM_LABELS[platform]}:`,
            { chat_id: chatId, message_id: msgId, reply_markup: { inline_keyboard: rows } }
        );

        // --- Execution Plan: Step 2 — Model selected ---
    } else if (query.data?.startsWith('ep_model:')) {
        const modelId = query.data.replace('ep_model:', '');
        const plan = loadExecutionPlan();
        if (!plan) return;

        plan.defaultModel = modelId;
        plan.tasks.forEach(t => { t.platform = plan.defaultPlatform; t.model = modelId; });
        plan.status = 'confirming';
        saveExecutionPlan(plan);

        const modelLabel = PLATFORM_MODELS[plan.defaultPlatform]?.find(m => m.id === modelId)?.label || modelId;

        await bot.answerCallbackQuery(query.id, { text: modelLabel });
        await bot.editMessageText(
            formatExecutionPlan(plan) + `\n\n✅ All tasks → ${PLATFORM_LABELS[plan.defaultPlatform]}: ${modelLabel}`,
            {
                chat_id: chatId, message_id: msgId,
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🚀 Execute All', callback_data: 'ep_execute' }, { text: '✏️ Override Task', callback_data: 'ep_override' }],
                        [{ text: '🔄 Re-plan', callback_data: 'ep_replan' }]
                    ]
                }
            }
        );

        // --- Execution Plan: Execute All (manual step-through) ---
    } else if (query.data === 'ep_execute') {
        const plan = loadExecutionPlan();
        if (!plan) return;

        plan.status = 'approved';
        // Mark all tasks as pending
        plan.tasks.forEach(t => { if (!t.taskStatus) t.taskStatus = 'pending'; });
        saveExecutionPlan(plan);
        writeDispatch(plan);

        await bot.answerCallbackQuery(query.id, { text: '🚀 Plan approved!' });
        await bot.editMessageText(
            `🚀 Plan Approved! (Step-through mode)\n\n${formatExecutionPlan(plan)}\n\n⏳ Watcher will run Task 1, then pause for your review.`,
            { chat_id: chatId, message_id: msgId }
        );
        console.log(`🚀 ${new Date().toISOString()} | Execution plan approved (${plan.tasks.length} tasks, step-through)`);

        // --- Execution Plan: Continue to next task ---
    } else if (query.data === 'ep_continue') {
        const plan = loadExecutionPlan();
        if (!plan) return;

        // Signal watcher to proceed: write continue file
        const continueFile = resolve(CENTRAL_DIR, 'wa_dispatch_continue.json');
        atomicWrite(continueFile, { timestamp: new Date().toISOString(), action: 'continue' });

        await bot.answerCallbackQuery(query.id, { text: '▶️ Continuing...' });
        await bot.editMessageText(
            `▶️ Continuing execution...\n\n${formatExecutionPlan(plan)}`,
            { chat_id: chatId, message_id: msgId }
        );
        console.log(`▶️ ${new Date().toISOString()} | Step-through: continue to next task`);

        // --- Execution Plan: Stop execution ---
    } else if (query.data === 'ep_stop') {
        const plan = loadExecutionPlan();
        if (!plan) return;

        plan.status = 'stopped';
        saveExecutionPlan(plan);
        // Clean up dispatch
        if (existsSync(DISPATCH_FILE)) {
            try { unlinkSync(DISPATCH_FILE); } catch { /* ignore */ }
        }

        await bot.answerCallbackQuery(query.id, { text: '🛑 Stopped' });
        await bot.editMessageText(
            `🛑 Execution stopped.\n\n${formatExecutionPlan(plan)}\n\nUse /review_plan to restart or 🔄 Re-plan.`,
            {
                chat_id: chatId, message_id: msgId,
                reply_markup: {
                    inline_keyboard: [[{ text: '🔄 Re-plan', callback_data: 'ep_replan' }]]
                }
            }
        );
        console.log(`🛑 ${new Date().toISOString()} | Execution stopped`);

        // --- Execution Plan: Override — show task list ---
    } else if (query.data === 'ep_override') {
        const plan = loadExecutionPlan();
        if (!plan) return;

        const taskButtons = plan.tasks.map(t => ({
            text: `${t.id}. ${t.description}`,
            callback_data: `ep_task:${t.id}`
        }));
        // One button per row
        const rows = taskButtons.map(b => [b]);

        await bot.answerCallbackQuery(query.id, { text: 'Select task to override' });
        await bot.editMessageText('✏️ Which task to override?', {
            chat_id: chatId, message_id: msgId,
            reply_markup: { inline_keyboard: rows }
        });

        // --- Execution Plan: Override — task selected, show platforms ---
    } else if (query.data?.startsWith('ep_task:')) {
        const taskId = parseInt(query.data.replace('ep_task:', ''), 10);
        const plan = loadExecutionPlan();
        if (!plan) return;

        const task = plan.tasks.find(t => t.id === taskId);
        if (!task) return;

        // Only show the active backend — don't mix backends
        const activeBackend = (getState().backend) || 'gemini';
        const platformButtons = [activeBackend].map(p => ({
            text: PLATFORM_LABELS[p] || p,
            callback_data: `ep_task_plat:${taskId}:${p}`
        }));

        await bot.answerCallbackQuery(query.id, { text: `Task ${taskId}` });
        await bot.editMessageText(
            `✏️ Task ${taskId}: ${task.description}\n\nPlatform:`,
            { chat_id: chatId, message_id: msgId, reply_markup: { inline_keyboard: [platformButtons] } }
        );

        // --- Execution Plan: Override — platform for task, show models ---
    } else if (query.data?.startsWith('ep_task_plat:')) {
        const [, taskIdStr, platform] = query.data.split(':');
        const taskId = parseInt(taskIdStr, 10);
        const plan = loadExecutionPlan();
        if (!plan) return;

        const task = plan.tasks.find(t => t.id === taskId);
        if (!task) return;

        task.platform = platform;

        // Jules — no model choice
        if (platform === 'jules') {
            task.model = null;
            plan.status = 'confirming';
            saveExecutionPlan(plan);

            await bot.answerCallbackQuery(query.id, { text: 'Jules' });
            await bot.editMessageText(
                `✅ Updated:\n\n${formatExecutionPlan(plan)}`,
                {
                    chat_id: chatId, message_id: msgId,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🚀 Execute All', callback_data: 'ep_execute' }, { text: '✏️ Override Task', callback_data: 'ep_override' }],
                            [{ text: '🔄 Re-plan', callback_data: 'ep_replan' }]
                        ]
                    }
                }
            );
            return;
        }

        saveExecutionPlan(plan);

        const models = PLATFORM_MODELS[platform] || [];
        const modelButtons = models.map(m => ({
            text: m.label,
            callback_data: `ep_task_model:${taskId}:${m.id}`
        }));
        const rows = [];
        for (let i = 0; i < modelButtons.length; i += 2) {
            rows.push(modelButtons.slice(i, i + 2));
        }

        await bot.answerCallbackQuery(query.id, { text: PLATFORM_LABELS[platform] });
        await bot.editMessageText(
            `✏️ Task ${taskId} — Model for ${PLATFORM_LABELS[platform]}:`,
            { chat_id: chatId, message_id: msgId, reply_markup: { inline_keyboard: rows } }
        );

        // --- Execution Plan: Override — model for task ---
    } else if (query.data?.startsWith('ep_task_model:')) {
        const [, taskIdStr, modelId] = query.data.split(':');
        const taskId = parseInt(taskIdStr, 10);
        const plan = loadExecutionPlan();
        if (!plan) return;

        const task = plan.tasks.find(t => t.id === taskId);
        if (!task) return;

        task.model = modelId;
        plan.status = 'confirming';
        saveExecutionPlan(plan);

        const modelLabel = PLATFORM_MODELS[task.platform]?.find(m => m.id === modelId)?.label || modelId;

        await bot.answerCallbackQuery(query.id, { text: modelLabel });
        await bot.editMessageText(
            `✅ Updated:\n\n${formatExecutionPlan(plan)}`,
            {
                chat_id: chatId, message_id: msgId,
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🚀 Execute All', callback_data: 'ep_execute' }, { text: '✏️ Override Task', callback_data: 'ep_override' }],
                        [{ text: '🔄 Re-plan', callback_data: 'ep_replan' }]
                    ]
                }
            }
        );

        // --- Execution Plan: Re-plan ---
    } else if (query.data === 'ep_replan') {
        updateState(s => { delete s.executionPlan; });
        // Clean up dispatch file if exists
        if (existsSync(DISPATCH_FILE)) {
            try { unlinkSync(DISPATCH_FILE); } catch { /* ignore */ }
        }

        await bot.answerCallbackQuery(query.id, { text: 'Plan cleared' });
        await bot.editMessageText(
            '🔄 Execution plan cleared.\n\nRun /plan_feature to generate a new plan.\nIt will appear here automatically when ready.',
            { chat_id: chatId, message_id: msgId }
        );
        console.log(`🔄 ${new Date().toISOString()} | Execution plan cleared`);
    }
});

bot.onText(/^\/sprint/, async (msg) => {
    if (String(msg.chat.id) !== String(CHAT_ID)) return;
    writeToInbox('🏃 Sprint Mode activated. Check your task list and process the highest priority task.');
    await bot.sendMessage(CHAT_ID, '🟢 Sprint Mode activated.\nSend messages anytime — they\'ll be picked up between turns.\nSend /stop to halt.');
    console.log(`🏃 ${new Date().toISOString()} | Sprint Mode activated`);
});

bot.onText(/^\/stop/, async (msg) => {
    if (String(msg.chat.id) !== String(CHAT_ID)) return;
    writeToInbox('STOP');
    await bot.sendMessage(CHAT_ID, '🔴 STOP signal sent.\nAgent will halt after completing current action.\nUse /kill to force-stop immediately.');
    console.log(`🛑 ${new Date().toISOString()} | STOP signal sent`);
});

// [SEC-4 FIX] Duplicate /kill handler removed. Single handler below at ~line 1126.

bot.onText(/^\/status/, async (msg) => {
    if (String(msg.chat.id) !== String(CHAT_ID)) return;
    const inboxData = readJsonSafe(INBOX, { messages: [] });
    const outboxData = readJsonSafe(OUTBOX, { messages: [] });
    const unread = inboxData.messages.filter(m => !m.read).length;
    const unsent = outboxData.messages.filter(m => !m.sent).length;
    const stopFlag = existsSync(resolve(CENTRAL_DIR, 'wa_stop_signal'));
    const state = getState();
    const plan = state.executionPlan;

    const statusLines = [
        '📊 Bridge Status',
        `📂 Active Project: ${state.activeProject}`,
        `🔧 Backend: ${BACKEND_OPTIONS.find(b => b.id === (state.backend || 'gemini'))?.label || state.backend || 'Gemini CLI'}`,
        `🤖 Model: ${state.model || '(default)'}`,
        `📥 Inbox: ${inboxData.messages.length} total, ${unread} unread`,
        `📤 Outbox: ${outboxData.messages.length} total, ${unsent} unsent`,
        `${stopFlag ? '🔴' : '🟢'} Stop signal: ${stopFlag ? 'ACTIVE' : 'clear'}`,
        `🤖 Bot: running`
    ];

    if (plan && plan.tasks?.length) {
        statusLines.push('');
        statusLines.push(`📋 Execution Plan: ${plan.status} (${plan.tasks.length} tasks)`);
        if (plan.defaultPlatform) {
            statusLines.push(`   Platform: ${PLATFORM_LABELS[plan.defaultPlatform] || plan.defaultPlatform}`);
        }
        if (plan.defaultModel) {
            statusLines.push(`   Model: ${plan.defaultModel}`);
        }
    }

    await bot.sendMessage(CHAT_ID, statusLines.join('\n'));
});

bot.onText(/^\/project$/, async (msg) => {
    if (String(msg.chat.id) !== String(CHAT_ID)) return;
    const state = getState();
    const projects = state.projects || {};
    const active = state.activeProject;

    const buttons = Object.entries(projects).map(([name, path]) => ({
        text: path === active ? `✅ ${name}` : name,
        callback_data: `project:${name}`
    }));

    // Split into rows of 2
    const rows = [];
    for (let i = 0; i < buttons.length; i += 2) {
        rows.push(buttons.slice(i, i + 2));
    }

    await bot.sendMessage(CHAT_ID, `📂 Active: ${Object.entries(projects).find(([, p]) => p === active)?.[0] || 'unknown'}\nSelect a project:`, {
        reply_markup: { inline_keyboard: rows }
    });
});

bot.onText(/^\/project\s+(.+)/, async (msg, match) => {
    if (String(msg.chat.id) !== String(CHAT_ID)) return;
    const name = match[1].trim();
    const state = getState();

    if (!state.projects[name]) {
        await bot.sendMessage(CHAT_ID, `❌ Project "${name}" not found.\nUse /project to see available or /add to register.`);
        return;
    }

    updateState(s => s.activeProject = state.projects[name]);
    await bot.sendMessage(CHAT_ID, `✅ Switched to project: ${name}\n${state.projects[name]}`);
    console.log(`📂 Switched to project: ${name} (${state.projects[name]})`);
});

bot.onText(/^\/add\s+(\S+)\s+(.+)/, async (msg, match) => {
    if (String(msg.chat.id) !== String(CHAT_ID)) return;
    const name = match[1].trim();
    let path = match[2].trim();

    // Resolve path relative to default project if not absolute
    if (!isAbsolute(path)) {
        path = resolve(DEFAULT_PROJECT_DIR, path);
    }

    if (!existsSync(path)) {
        await bot.sendMessage(CHAT_ID, `❌ Directory not found:\n${path}`);
        return;
    }

    updateState(s => s.projects[name] = path);
    await bot.sendMessage(CHAT_ID, `✅ Added project: ${name}\n${path}`);
    console.log(`➕ Added project: ${name} -> ${path}`);
});

bot.onText(/^\/list/, async (msg) => {
    if (String(msg.chat.id) !== String(CHAT_ID)) return;
    const state = getState();
    const list = Object.entries(state.projects)
        .map(([name, path]) => `- ${name}: ${path} ${state.activeProject === path ? '(ACTIVE)' : ''}`)
        .join('\n');

    await bot.sendMessage(CHAT_ID, `📂 Available Projects:\n${list}`);
});


// --- Inbound: Telegram → wa_inbox.json ---
bot.on('message', async (msg) => {
    // Skip bot-native commands (handled by their own handlers above)
    const BOT_COMMANDS = ['/stop', '/status', '/project', '/list', '/model', '/backend', '/add', '/help', '/version', '/sprint', '/review_plan', '/clear_lock', '/restart', '/watchdog', '/diagnose', '/autofix', '/apply_fix', '/discard_fix', '/kill'];
    if (msg.text && BOT_COMMANDS.some(cmd => msg.text.startsWith(cmd))) return;

    // Auth
    if (String(msg.chat.id) !== String(CHAT_ID)) return;

    if (!msg.text) return;

    writeToInbox(msg.text);

    // Acknowledge receipt
    try {
        await bot.sendMessage(CHAT_ID, '⏳ Processing...', { disable_notification: true });
    } catch (e) {
        console.error('Failed to send ack:', e.message);
    }

    const preview = msg.text.length > 80 ? msg.text.substring(0, 77) + '...' : msg.text;
    console.log(`📥 ${new Date().toISOString()} | ${preview}`);
});

// --- Health Check ---
const LOCK_FILE = resolve(CENTRAL_DIR, 'wa_session.lock');

bot.onText(/^\/clear_lock/, async (msg) => {
    if (String(msg.chat.id) !== String(CHAT_ID)) return;
    if (existsSync(LOCK_FILE)) {
        try {
            unlinkSync(LOCK_FILE);
            await bot.sendMessage(CHAT_ID, '✅ Lock file cleared manually.');
            console.log('🔓 Lock file cleared manually');
        } catch (err) {
            await bot.sendMessage(CHAT_ID, `❌ Failed to clear lock: ${err.message}`);
        }
    } else {
        await bot.sendMessage(CHAT_ID, 'ℹ️ No lock file found.');
    }
});

// --- /restart Command: Kill watcher, clear state, restart, report ---
const WATCHER_PATH = resolve(SCRIPT_DIR, '..', 'watcher.sh');
const WATCHER_LOG = resolve(CENTRAL_DIR, 'watcher.log');

bot.onText(/^\/restart/, async (msg) => {
    if (String(msg.chat.id) !== String(CHAT_ID)) return;
    await bot.sendMessage(CHAT_ID, '🔄 Restarting watcher...');
    console.log(`🔄 ${new Date().toISOString()} | /restart invoked`);

    // 1. Kill existing watcher
    let oldPid = 'unknown';
    try {
        oldPid = execSync('pgrep -f "watcher.sh"', { encoding: 'utf8', timeout: 3000 }).trim();
        execSync('pkill -f "watcher.sh"', { timeout: 3000 });
    } catch { /* no watcher running */ }

    // 2. Clear stale state
    const continueFile = resolve(CENTRAL_DIR, 'wa_dispatch_continue.json');
    [LOCK_FILE, continueFile].forEach(f => {
        try { if (existsSync(f)) unlinkSync(f); } catch { /* ignore */ }
    });

    // 3. Read last error from watcher log
    let logTail = '(no log available)';
    try {
        logTail = execSync(
            `tail -10 "${WATCHER_LOG}"`,
            { encoding: 'utf8', timeout: 3000 }
        ).trim();
    } catch { /* log file may not exist */ }

    // 4. Spawn new watcher
    let newPid = 'failed';
    try {
        const logFd = openSync(WATCHER_LOG, 'a');
        const watcher = spawn('bash', [WATCHER_PATH], {
            detached: true,
            stdio: ['ignore', logFd, logFd]
        });
        watcher.unref();
        newPid = watcher.pid;
    } catch (err) {
        await bot.sendMessage(CHAT_ID, `❌ Failed to start watcher: ${err.message}`);
        return;
    }

    // 5. Report
    const report = [
        `✅ Watcher restarted`,
        `   Old PID: ${oldPid || 'not running'}`,
        `   New PID: ${newPid}`,
        `🧹 Lock + continue signal cleared`,
        '',
        `📋 Last watcher log:`,
        logTail
    ].join('\n');
    await bot.sendMessage(CHAT_ID, report);
    console.log(`✅ ${new Date().toISOString()} | Watcher restarted (PID ${newPid})`);
});

// --- /watchdog Command: Show watchdog status and restart history ---
const WATCHDOG_LOG = resolve(CENTRAL_DIR, 'watchdog.log');
const RESTART_TRACKER = '/tmp/ra-watchdog-restarts';

bot.onText(/^\/watchdog/, async (msg) => {
    if (String(msg.chat.id) !== String(CHAT_ID)) return;

    const botAlive = true; // If we're responding, bot is alive
    const watcherAlive = isWatcherRunning();

    // Read restart count this hour
    let restartCount = 0;
    try {
        const hour = new Date().toISOString().slice(0, 13).replace('T', '-');
        const tracker = readFileSync(RESTART_TRACKER, 'utf8');
        restartCount = (tracker.match(new RegExp(hour.slice(0, 10), 'g')) || []).length;
    } catch { /* no tracker file */ }

    // Read last restart from watchdog log
    let lastRestart = 'never';
    try {
        const log = execSync(`grep -E "restarting|started" "${WATCHDOG_LOG}" | tail -1`,
            { encoding: 'utf8', timeout: 3000 }).trim();
        if (log) lastRestart = log.substring(0, 19); // timestamp
    } catch { /* no log */ }

    const status = [
        '🐕 Watchdog Status',
        '',
        `🤖 Bot: ${botAlive ? '✅ running' : '❌ down'}`,
        `👁️ Watcher: ${watcherAlive ? '✅ running' : '❌ down'}`,
        `🔄 Restarts today: ${restartCount}`,
        `📋 Last restart: ${lastRestart}`,
        '',
        `📂 Log: .gemini/watchdog.log`
    ].join('\n');
    await bot.sendMessage(CHAT_ID, status);
});

// --- /diagnose Command: Manual LLM crash diagnosis ---
bot.onText(/^\/diagnose/, async (msg) => {
    if (String(msg.chat.id) !== String(CHAT_ID)) return;

    // Collect last 30 lines of each log
    let wLog = '(empty)', bLog = '(empty)';
    try { wLog = execSync(`tail -30 "${WATCHER_LOG}"`, { encoding: 'utf8', timeout: 3000 }).trim(); } catch { }
    try { bLog = execSync(`tail -30 "${CENTRAL_DIR}/bot.log"`, { encoding: 'utf8', timeout: 3000 }).trim(); } catch { }

    const prompt = [
        'You are a systems reliability engineer. The Antigravity bot/watcher system',
        'may be experiencing issues. Analyze the logs below and:',
        '',
        '1. Identify the ROOT CAUSE of any errors or crashes',
        '2. Determine if it is a code bug, config issue, or external failure',
        '3. Suggest a specific fix (file + line if possible)',
        '4. Rate severity: CRITICAL / HIGH / MEDIUM / LOW',
        '',
        'Do NOT modify any files. Output your analysis as plain text.',
        '',
        '=== WATCHER LOG (last 30 lines) ===',
        wLog,
        '',
        '=== BOT LOG (last 30 lines) ===',
        bLog
    ].join('\n');

    await bot.sendMessage(CHAT_ID, '\uD83D\uDD0D Spawning diagnosis agent...');
    writeToInbox(prompt);
    console.log(`\uD83D\uDD0D ${new Date().toISOString()} | /diagnose triggered`);
});

// --- /autofix Command: Toggle auto-fix mode ---
// [MAINT-3 FIX] Use updateState() instead of raw JSON.parse/writeFileSync
bot.onText(/^\/autofix/, async (msg) => {
    if (String(msg.chat.id) !== String(CHAT_ID)) return;
    try {
        const newState = updateState(s => {
            s.auto_fix_enabled = !s.auto_fix_enabled;
        });
        const status = newState.auto_fix_enabled
            ? '🔧 Auto-fix ENABLED — bot will attempt to self-repair on CRITICAL/HIGH crashes'
            : '🔒 Auto-fix DISABLED — diagnosis only (read-only mode)';
        await bot.sendMessage(CHAT_ID, status);
        console.log(`🔧 ${new Date().toISOString()} | /autofix: ${newState.auto_fix_enabled}`);
    } catch (err) {
        await bot.sendMessage(CHAT_ID, `❌ Toggle failed: ${err.message}`);
    }
});

// --- /apply_fix Command: Merge pending hotfix to main + restart ---
// [MAINT-4 FIX] PROJECT_DIR → DEFAULT_PROJECT_DIR
// [SEC-1 FIX] Branch name sanitization via isValidHotfixBranch()
// [SEC-1 FIX] Shell injection eliminated via safeGit() (execFileSync)
bot.onText(/^\/apply_fix/, async (msg) => {
    if (String(msg.chat.id) !== String(CHAT_ID)) return;
    try {
        const branches = safeGit(['branch'], DEFAULT_PROJECT_DIR);
        const match = branches.match(/hotfix\/auto-\d+/);
        if (!match) {
            await bot.sendMessage(CHAT_ID, '❌ No pending hotfix branch found.');
            return;
        }
        const hotfix = match[0].trim();
        if (!isValidHotfixBranch(hotfix)) {
            await bot.sendMessage(CHAT_ID, '❌ Invalid hotfix branch name.');
            return;
        }
        safeGit(['checkout', 'main'], DEFAULT_PROJECT_DIR);
        safeGit(['merge', hotfix, '--no-edit'], DEFAULT_PROJECT_DIR);
        safeGit(['branch', '-d', hotfix], DEFAULT_PROJECT_DIR);
        await bot.sendMessage(CHAT_ID, `✅ Hotfix merged to main. Restarting bot...`);
        console.log(`✅ ${new Date().toISOString()} | /apply_fix: merged ${hotfix} to main`);
        setTimeout(() => process.exit(0), 500);
    } catch (err) {
        await bot.sendMessage(CHAT_ID, `❌ Apply failed: ${err.message}`);
    }
});

// --- /discard_fix Command: Delete pending hotfix branch ---
// [MAINT-4 FIX] PROJECT_DIR → DEFAULT_PROJECT_DIR
// [SEC-1 FIX] Branch name sanitization + safeGit()
bot.onText(/^\/discard_fix/, async (msg) => {
    if (String(msg.chat.id) !== String(CHAT_ID)) return;
    try {
        const branches = safeGit(['branch'], DEFAULT_PROJECT_DIR);
        const match = branches.match(/hotfix\/auto-\d+/);
        if (!match) {
            await bot.sendMessage(CHAT_ID, '❌ No pending hotfix branch found.');
            return;
        }
        const hotfix = match[0].trim();
        if (!isValidHotfixBranch(hotfix)) {
            await bot.sendMessage(CHAT_ID, '❌ Invalid hotfix branch name.');
            return;
        }
        safeGit(['checkout', 'main'], DEFAULT_PROJECT_DIR);
        safeGit(['branch', '-D', hotfix], DEFAULT_PROJECT_DIR);
        await bot.sendMessage(CHAT_ID, `🗑️ Hotfix ${hotfix} discarded.`);
        console.log(`🗑️ ${new Date().toISOString()} | /discard_fix: deleted ${hotfix}`);
    } catch (err) {
        await bot.sendMessage(CHAT_ID, `❌ Discard failed: ${err.message}`);
    }
});

// --- /kill Command: Force-kill running agent immediately ---
// [SEC-2 FIX] Broad pkill → targeted killAgent() from shell.js
bot.onText(/^\/kill/, async (msg) => {
    if (String(msg.chat.id) !== String(CHAT_ID)) return;
    try {
        killAgent();
        if (existsSync(LOCK_FILE)) unlinkSync(LOCK_FILE);
        await bot.sendMessage(CHAT_ID, '🛑 Agent force-killed.\nLock cleared. Watcher is idle and ready.');
        console.log(`🛑 ${new Date().toISOString()} | /kill — agent force-killed`);
    } catch (err) {
        await bot.sendMessage(CHAT_ID, `❌ Kill failed: ${err.message}`);
    }
});

// Track watcher status to avoid spamming alerts
let watcherWasAlive = true;

function isWatcherRunning() {
    try {
        const result = execSync('pgrep -f "watcher.sh"', { encoding: 'utf8', timeout: 3000 }).trim();
        return result.length > 0;
    } catch {
        return false;
    }
}

setInterval(async () => {
    try {
        // --- Check 1: Lock file health ---
        if (existsSync(LOCK_FILE)) {
            const stats = statSync(LOCK_FILE);
            const ageMs = Date.now() - stats.mtimeMs;
            const ageMin = Math.floor(ageMs / 1000 / 60);

            // Check if watcher is in step-through dispatch wait (valid idle)
            let inDispatchWait = false;
            const dispatchFile = join(CENTRAL_DIR, 'wa_dispatch.json');
            if (existsSync(dispatchFile)) {
                try {
                    const dispatch = JSON.parse(readFileSync(dispatchFile, 'utf8'));
                    if (dispatch.status === 'approved' && Array.isArray(dispatch.tasks)) {
                        const hasDone = dispatch.tasks.some(t => t.taskStatus === 'done');
                        const hasPending = dispatch.tasks.some(t => !t.taskStatus || t.taskStatus === 'pending' || t.taskStatus === null);
                        inDispatchWait = hasDone && hasPending;
                    }
                } catch { /* ignore parse errors */ }
            }

            // Long running task (> 10 mins), warn every 5 mins — but skip if in dispatch wait
            if (ageMin > 10 && ageMin % 5 === 0 && !inDispatchWait) {
                await bot.sendMessage(CHAT_ID, `⚠️ Health Alert\nTask running for ${ageMin} minutes.\nUse /stop to halt or /clear_lock if stuck.`);
            }

            // Stale lock (process dead)
            const content = readFileSync(LOCK_FILE, 'utf8').trim();
            const pid = parseInt(content, 10);
            if (!isNaN(pid)) {
                try {
                    process.kill(pid, 0);
                } catch (err) {
                    if (err.code === 'ESRCH') {
                        // Silently auto-clear — no need to alarm the user
                        unlinkSync(LOCK_FILE);
                        console.log(`💀 Auto-cleared stale lock for dead PID ${pid}`);
                    }
                }
            }
        }

        // --- Check 2: Watcher process alive ---
        const watcherAlive = isWatcherRunning();

        if (!watcherAlive && watcherWasAlive) {
            // Watcher just died — alert with resolution options
            await bot.sendMessage(CHAT_ID, [
                '🔴 Watcher Down',
                '',
                'watcher.sh is not running.',
                'Messages will NOT be processed.',
                '',
                'To fix, run on the host:',
                'nohup bash scripts/watcher.sh > /dev/null 2>&1 &',
                '',
                'Or use /clear_lock if stuck.'
            ].join('\n'));
            console.log('🔴 Watcher down — alert sent');
        } else if (watcherAlive && !watcherWasAlive) {
            // Watcher came back
            await bot.sendMessage(CHAT_ID, '🟢 Watcher Restored — message processing resumed.');
            console.log('🟢 Watcher restored');
        }

        watcherWasAlive = watcherAlive;
    } catch (err) {
        console.error(`Health check error: ${err.message}`);
    }
}, 60000); // Check every minute

// --- Outbound: wa_outbox.json → Telegram ---
// If reply > MAX_MSG_LEN, send as a .md file attachment instead of splitting
const FILE_SEND_THRESHOLD = MAX_MSG_LEN;

async function sendAsFile(text) {
    // Write reply to a temp .md file
    const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const tmpFile = join(tmpdir(), `gemini_reply_${ts}.txt`);
    writeFileSync(tmpFile, text, 'utf8');

    // Send first ~200 chars as caption preview
    const preview = text.substring(0, 200).replace(/\n/g, ' ') + '…';
    const caption = `📄 Full reply (${text.length} chars):\n${preview}`;

    try {
        await bot.sendDocument(CHAT_ID, tmpFile, {
            caption: caption.substring(0, 1024) // Telegram caption limit
        });
    } finally {
        // Clean up temp file
        try { unlinkSync(tmpFile); } catch { /* ignore */ }
    }
}

// Track whether we've already shown the auto-trigger for this plan
let lastAutoTriggerPlanStatus = null;

setInterval(async () => {
    // --- Auto-trigger: check for pending execution plans ---
    try {
        const plan = loadExecutionPlan();
        if (plan && plan.status === 'pending_approval' && plan.tasks?.length && lastAutoTriggerPlanStatus !== 'pending_approval') {
            lastAutoTriggerPlanStatus = 'pending_approval';
            // Apply tier defaults and show confirmation
            applyTierDefaults(plan);
            plan.status = 'confirming';
            saveExecutionPlan(plan);

            await bot.sendMessage(CHAT_ID,
                '📋 New execution plan ready!\n\n' +
                formatExecutionPlan(plan) + '\n\n💡 Suggested by planner based on task tier.',
                {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🚀 Execute All', callback_data: 'ep_execute' }, { text: '✏️ Override Task', callback_data: 'ep_override' }],
                            [{ text: '🔄 Re-plan', callback_data: 'ep_replan' }]
                        ]
                    }
                }
            );
            console.log(`📋 ${new Date().toISOString()} | Auto-triggered execution plan review`);
        } else if (!plan || !plan.tasks?.length) {
            lastAutoTriggerPlanStatus = null; // Reset when plan is cleared
        }
    } catch (err) {
        console.error(`Auto-trigger check error: ${err.message}`);
    }

    // --- Outbox relay ---
    if (!existsSync(OUTBOX)) return;

    const outbox = readJsonSafe(OUTBOX, { messages: [] });
    const unsent = outbox.messages.filter(m => !m.sent);
    if (unsent.length === 0) return;

    let dirty = false;
    for (const msg of unsent) {
        try {
            // --- Document attachment (watcher sends spec files) ---
            if (msg.type === 'document' && msg.filePath) {
                if (existsSync(msg.filePath)) {
                    await bot.sendDocument(CHAT_ID, msg.filePath, {
                        caption: (msg.caption || '📎 Document').substring(0, 1024)
                    });
                    console.log(`📤 ${new Date().toISOString()} | 📎 DOC | ${msg.filePath}`);
                } else {
                    console.error(`❌ Document not found: ${msg.filePath}`);
                }
                msg.sent = true;
                dirty = true;
                continue;
            }

            // --- Text message (with optional inline keyboard) ---
            const text = msg.text || '(empty response)';
            const opts = {};
            if (msg.reply_markup) {
                opts.reply_markup = msg.reply_markup;
            }

            if (text.length > FILE_SEND_THRESHOLD) {
                // Long reply → send as downloadable .md file
                await sendAsFile(text);
                // If there's also a reply_markup, send it as a separate short message
                if (msg.reply_markup) {
                    await bot.sendMessage(CHAT_ID, '👆 Full report attached above.', opts);
                }
            } else {
                // Short reply → send as text message (with optional inline keyboard)
                await bot.sendMessage(CHAT_ID, text, opts);
            }

            msg.sent = true;
            dirty = true;

            const preview = text.length > 80 ? text.substring(0, 77) + '...' : text;
            const typeLabel = text.length > FILE_SEND_THRESHOLD ? '📄 FILE' : (msg.reply_markup ? '🔘 BTN' : '💬 TEXT');
            console.log(`📤 ${new Date().toISOString()} | ${typeLabel} | ${preview}`);
        } catch (err) {
            console.error(`❌ Send failed: ${err.message}`);
            break;
        }
    }

    if (dirty) {
        // Re-read outbox to merge — prevents race with watcher's write_to_outbox_file
        const fresh = readJsonSafe(OUTBOX, { messages: [] });
        const sentIds = new Set(unsent.filter(m => m.sent).map(m => m.id));
        for (const m of fresh.messages) {
            if (sentIds.has(m.id)) m.sent = true;
        }
        atomicWrite(OUTBOX, fresh);
    }
}, POLL_INTERVAL_MS);

// --- Error Handling (prevents crashes) ---
bot.on('polling_error', (err) => {
    console.error(`⚠️ Polling error: ${err.message}`);
});

bot.on('error', (err) => {
    console.error(`⚠️ Bot error: ${err.message}`);
});

process.on('unhandledRejection', (err) => {
    console.error(`⚠️ Unhandled rejection: ${err.message || err}`);
});

// --- Graceful Shutdown ---
process.on('SIGINT', () => {
    console.log('\n👋 Shutting down...');
    bot.stopPolling();
    process.exit(0);
});

process.on('SIGTERM', () => {
    bot.stopPolling();
    process.exit(0);
});
