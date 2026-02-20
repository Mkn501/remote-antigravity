// ============================================================================
// commands/plan.js — /review_plan + all ep_* callback handlers
// ============================================================================

import { existsSync, unlinkSync } from 'fs';
import { resolve } from 'path';
import {
    PLATFORM_MODELS, PLATFORM_LABELS, TIER_EMOJI,
    TIER_DEFAULTS, DIFFICULTY_LABEL
} from '../registries.js';

// --- Plan Helpers ---

function loadExecutionPlan(getState) {
    const state = getState();
    return state.executionPlan || null;
}

function saveExecutionPlan(plan, updateState) {
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

function applyTierDefaults(plan, getState) {
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

function writeDispatch(plan, atomicWrite, DISPATCH_FILE) {
    const dispatch = {
        timestamp: new Date().toISOString(),
        status: 'approved',
        tasks: plan.tasks.map(t => ({
            id: t.id, description: t.description,
            platform: t.platform, model: t.model,
            parallel: t.parallel, deps: t.deps
        }))
    };
    atomicWrite(DISPATCH_FILE, dispatch);
}

// --- Registration ---

export function register(bot, ctx) {
    const { CHAT_ID, getState, updateState, atomicWrite,
        CENTRAL_DIR, DISPATCH_FILE, registerCommand, onCallback } = ctx;

    registerCommand(/^\/review_plan$/, async (msg) => {
        const plan = loadExecutionPlan(getState);
        if (!plan || !plan.tasks?.length) {
            await bot.sendMessage(CHAT_ID, '📋 No execution plan found.\n\nRun /plan_feature first — the architect will generate a plan and save it to state.json.\nThe plan will appear here automatically when ready.');
            return;
        }

        if (plan.status === 'approved') {
            await bot.sendMessage(CHAT_ID, `✅ Plan already approved.\n\n${formatExecutionPlan(plan)}\n\nThe watcher will dispatch automatically.`, {
                reply_markup: { inline_keyboard: [[{ text: '🔄 Re-plan', callback_data: 'ep_replan' }]] }
            });
            return;
        }

        if (plan.status === 'executing') {
            await bot.sendMessage(CHAT_ID, `⏳ Plan is executing...\n\n${formatExecutionPlan(plan)}`);
            return;
        }

        applyTierDefaults(plan, getState);
        plan.status = 'confirming';
        saveExecutionPlan(plan, updateState);

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

    // --- Callback: ep_platform:<id> ---
    onCallback('ep_platform:', async (query) => {
        const chatId = query.message.chat.id;
        const msgId = query.message.message_id;
        const platform = query.data.replace('ep_platform:', '');
        const plan = loadExecutionPlan(getState);
        if (!plan) return;

        plan.defaultPlatform = platform;

        if (platform === 'jules') {
            plan.defaultModel = null;
            plan.tasks.forEach(t => { t.platform = 'jules'; t.model = null; });
            plan.status = 'confirming';
            saveExecutionPlan(plan, updateState);

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

        plan.status = 'selecting_model';
        saveExecutionPlan(plan, updateState);

        const models = PLATFORM_MODELS[platform] || [];
        const modelButtons = models.map(m => ({ text: m.label, callback_data: `ep_model:${m.id}` }));
        const rows = [];
        for (let i = 0; i < modelButtons.length; i += 2) {
            rows.push(modelButtons.slice(i, i + 2));
        }

        await bot.answerCallbackQuery(query.id, { text: `${PLATFORM_LABELS[platform]}` });
        await bot.editMessageText(
            `📋 Default model for ${PLATFORM_LABELS[platform]}:`,
            { chat_id: chatId, message_id: msgId, reply_markup: { inline_keyboard: rows } }
        );
    });

    // --- Callback: ep_model:<id> ---
    onCallback('ep_model:', async (query) => {
        const chatId = query.message.chat.id;
        const msgId = query.message.message_id;
        const modelId = query.data.replace('ep_model:', '');
        const plan = loadExecutionPlan(getState);
        if (!plan) return;

        plan.defaultModel = modelId;
        plan.tasks.forEach(t => { t.platform = plan.defaultPlatform; t.model = modelId; });
        plan.status = 'confirming';
        saveExecutionPlan(plan, updateState);

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
    });

    // --- Callback: ep_execute ---
    onCallback('ep_execute', async (query) => {
        const chatId = query.message.chat.id;
        const msgId = query.message.message_id;
        const plan = loadExecutionPlan(getState);
        if (!plan) return;

        plan.status = 'approved';
        plan.tasks.forEach(t => { if (!t.taskStatus) t.taskStatus = 'pending'; });
        saveExecutionPlan(plan, updateState);
        writeDispatch(plan, atomicWrite, DISPATCH_FILE);

        await bot.answerCallbackQuery(query.id, { text: '🚀 Plan approved!' });
        await bot.editMessageText(
            `🚀 Plan Approved! (Step-through mode)\n\n${formatExecutionPlan(plan)}\n\n⏳ Watcher will run Task 1, then pause for your review.`,
            { chat_id: chatId, message_id: msgId }
        );
        console.log(`🚀 ${new Date().toISOString()} | Execution plan approved (${plan.tasks.length} tasks, step-through)`);
    });

    // --- Callback: ep_continue ---
    onCallback('ep_continue', async (query) => {
        const chatId = query.message.chat.id;
        const msgId = query.message.message_id;
        const plan = loadExecutionPlan(getState);
        if (!plan) return;

        const continueFile = resolve(CENTRAL_DIR, 'wa_dispatch_continue.json');
        atomicWrite(continueFile, { timestamp: new Date().toISOString(), action: 'continue' });

        await bot.answerCallbackQuery(query.id, { text: '▶️ Continuing...' });
        await bot.editMessageText(
            `▶️ Continuing execution...\n\n${formatExecutionPlan(plan)}`,
            { chat_id: chatId, message_id: msgId }
        );
        console.log(`▶️ ${new Date().toISOString()} | Step-through: continue to next task`);
    });

    // --- Callback: ep_stop ---
    onCallback('ep_stop', async (query) => {
        const chatId = query.message.chat.id;
        const msgId = query.message.message_id;
        const plan = loadExecutionPlan(getState);
        if (!plan) return;

        plan.status = 'stopped';
        saveExecutionPlan(plan, updateState);
        if (existsSync(DISPATCH_FILE)) {
            try { unlinkSync(DISPATCH_FILE); } catch { /* ignore */ }
        }

        await bot.answerCallbackQuery(query.id, { text: '🛑 Stopped' });
        await bot.editMessageText(
            `🛑 Execution stopped.\n\n${formatExecutionPlan(plan)}\n\nUse /review_plan to restart or 🔄 Re-plan.`,
            {
                chat_id: chatId, message_id: msgId,
                reply_markup: { inline_keyboard: [[{ text: '🔄 Re-plan', callback_data: 'ep_replan' }]] }
            }
        );
        console.log(`🛑 ${new Date().toISOString()} | Execution stopped`);
    });

    // --- Callback: ep_override ---
    onCallback('ep_override', async (query) => {
        const chatId = query.message.chat.id;
        const msgId = query.message.message_id;
        const plan = loadExecutionPlan(getState);
        if (!plan) return;

        const taskButtons = plan.tasks.map(t => ({
            text: `${t.id}. ${t.description}`,
            callback_data: `ep_task:${t.id}`
        }));
        const rows = taskButtons.map(b => [b]);

        await bot.answerCallbackQuery(query.id, { text: 'Select task to override' });
        await bot.editMessageText('✏️ Which task to override?', {
            chat_id: chatId, message_id: msgId,
            reply_markup: { inline_keyboard: rows }
        });
    });

    // --- Callback: ep_task:<id> ---
    onCallback('ep_task:', async (query) => {
        const chatId = query.message.chat.id;
        const msgId = query.message.message_id;
        const taskId = parseInt(query.data.replace('ep_task:', ''), 10);
        const plan = loadExecutionPlan(getState);
        if (!plan) return;

        const task = plan.tasks.find(t => t.id === taskId);
        if (!task) return;

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
    });

    // --- Callback: ep_task_plat:<taskId>:<platform> ---
    onCallback('ep_task_plat:', async (query) => {
        const chatId = query.message.chat.id;
        const msgId = query.message.message_id;
        const [, taskIdStr, platform] = query.data.split(':');
        const taskId = parseInt(taskIdStr, 10);
        const plan = loadExecutionPlan(getState);
        if (!plan) return;

        const task = plan.tasks.find(t => t.id === taskId);
        if (!task) return;

        task.platform = platform;

        if (platform === 'jules') {
            task.model = null;
            plan.status = 'confirming';
            saveExecutionPlan(plan, updateState);

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

        saveExecutionPlan(plan, updateState);

        const models = PLATFORM_MODELS[platform] || [];
        const modelButtons = models.map(m => ({ text: m.label, callback_data: `ep_task_model:${taskId}:${m.id}` }));
        const rows = [];
        for (let i = 0; i < modelButtons.length; i += 2) {
            rows.push(modelButtons.slice(i, i + 2));
        }

        await bot.answerCallbackQuery(query.id, { text: PLATFORM_LABELS[platform] });
        await bot.editMessageText(
            `✏️ Task ${taskId} — Model for ${PLATFORM_LABELS[platform]}:`,
            { chat_id: chatId, message_id: msgId, reply_markup: { inline_keyboard: rows } }
        );
    });

    // --- Callback: ep_task_model:<taskId>:<modelId> ---
    onCallback('ep_task_model:', async (query) => {
        const chatId = query.message.chat.id;
        const msgId = query.message.message_id;
        const [, taskIdStr, modelId] = query.data.split(':');
        const taskId = parseInt(taskIdStr, 10);
        const plan = loadExecutionPlan(getState);
        if (!plan) return;

        const task = plan.tasks.find(t => t.id === taskId);
        if (!task) return;

        task.model = modelId;
        plan.status = 'confirming';
        saveExecutionPlan(plan, updateState);

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
    });

    // --- Callback: ep_replan ---
    onCallback('ep_replan', async (query) => {
        const chatId = query.message.chat.id;
        const msgId = query.message.message_id;
        updateState(s => { delete s.executionPlan; });
        if (existsSync(DISPATCH_FILE)) {
            try { unlinkSync(DISPATCH_FILE); } catch { /* ignore */ }
        }

        await bot.answerCallbackQuery(query.id, { text: 'Plan cleared' });
        await bot.editMessageText(
            '🔄 Execution plan cleared.\n\nRun /plan_feature to generate a new plan.\nIt will appear here automatically when ready.',
            { chat_id: chatId, message_id: msgId }
        );
        console.log(`🔄 ${new Date().toISOString()} | Execution plan cleared`);
    });
}

// Export helpers for testing
export { loadExecutionPlan, saveExecutionPlan, formatExecutionPlan, applyTierDefaults, writeDispatch };
