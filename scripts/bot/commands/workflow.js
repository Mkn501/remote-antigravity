// ============================================================================
// commands/workflow.js — /sprint, /stop
// ============================================================================

export function register(bot, ctx) {
    const { CHAT_ID, writeToInbox, registerCommand } = ctx;

    registerCommand(/^\/sprint/, async (msg) => {
        writeToInbox('🏃 Sprint Mode activated. Check your task list and process the highest priority task.');
        await bot.sendMessage(CHAT_ID, '🟢 Sprint Mode activated.\nSend messages anytime — they\'ll be picked up between turns.\nSend /stop to halt.');
        console.log(`🏃 ${new Date().toISOString()} | Sprint Mode activated`);
    });

    registerCommand(/^\/stop/, async (msg) => {
        writeToInbox('STOP');
        await bot.sendMessage(CHAT_ID, '🔴 STOP signal sent.\nAgent will halt after completing current action.\nUse /kill to force-stop immediately.');
        console.log(`🛑 ${new Date().toISOString()} | STOP signal sent`);
    });
}
