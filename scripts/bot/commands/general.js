// ============================================================================
// commands/general.js — /help, /version, /status
// ============================================================================

import { readFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { BACKEND_OPTIONS, PLATFORM_MODELS, PLATFORM_LABELS } from '../registries.js';

// Read version at module load (ESM-compatible — no require())
const PKG = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

export function register(bot, ctx) {
    const { CHAT_ID, SCRIPT_DIR, getState, readJsonSafe, formatUptime,
        INBOX, OUTBOX, CENTRAL_DIR, DISPATCH_FILE,
        BOT_START_TIME, authorized, registerCommand } = ctx;

    registerCommand(/^\/help/, async (msg) => {
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

    registerCommand(/^\/version/, async (msg) => {
        const state = getState();
        const backend = state.backend || 'gemini';
        const model = state.model || '(default)';
        const backendLabel = BACKEND_OPTIONS.find(b => b.id === backend)?.short || backend;
        const modelEntry = PLATFORM_MODELS[backend]?.find(m => m.id === model);
        const modelLabel = modelEntry ? modelEntry.label : model;
        const uptime = formatUptime(Date.now() - BOT_START_TIME);

        const versionLines = [
            'ℹ️ wa-bridge Bot',
            `📦 Version: ${PKG.version}`,
            `🔧 Backend: ${backendLabel}`,
            `🤖 Model: ${modelLabel}`,
            `⏱️ Uptime: ${uptime}`,
            `⏰ ${new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}`
        ].join('\n');
        await bot.sendMessage(CHAT_ID, versionLines);
    });

    registerCommand(/^\/status/, async (msg) => {
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
}
