// ============================================================================
// commands/model.js — /model, /backend + callback handlers
// ============================================================================

import { PLATFORM_MODELS, BACKEND_OPTIONS } from '../registries.js';

export function register(bot, ctx) {
    const { CHAT_ID, getState, updateState, registerCommand, onCallback } = ctx;

    registerCommand(/^\/model$/, async (msg) => {
        const state = getState();
        const backend = state.backend || 'gemini';
        const current = state.model || 'gemini-3-pro-preview';
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

    registerCommand(/^\/backend$/, async (msg) => {
        const state = getState();
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

    // Callback: model:<id>
    onCallback('model:', async (query) => {
        const chatId = query.message.chat.id;
        const msgId = query.message.message_id;
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
    });

    // Callback: backend:<id>
    onCallback('backend:', async (query) => {
        const chatId = query.message.chat.id;
        const msgId = query.message.message_id;
        const backendId = query.data.replace('backend:', '');
        const backendInfo = BACKEND_OPTIONS.find(b => b.id === backendId);
        if (!backendInfo) return;

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
    });
}
