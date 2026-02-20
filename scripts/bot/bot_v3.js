// ============================================================================
// Telegram Relay Bot — wa-bridge (v3)
// ============================================================================
// Modularized entry point. All command logic lives in commands/*.js.
// This file handles: init, auth, routing, message relay, error handling.
//
// P3 modular split from bot_refactoring_spec.md:
//   MAINT-1: Monolith → 12 focused modules
//   REF-2:   Centralized auth guard
//   REF-3:   Callback query router
//   REF-5:   Auto-generated BOT_COMMANDS
// ============================================================================

import dotenv from 'dotenv';
import TelegramBot from 'node-telegram-bot-api';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

// --- Config ---
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIR, '..', '..');

dotenv.config({ path: resolve(SCRIPT_DIR, '.env') });

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
if (!TOKEN || !CHAT_ID) {
    console.error('❌ Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID in .env');
    process.exit(1);
}

// --- Imports: helpers, health, outbox ---
import {
    readJsonSafe, atomicWrite, writeToInbox, getState, updateState, formatUptime,
    CENTRAL_DIR, INBOX, OUTBOX, STATE_FILE, DISPATCH_FILE, LOCK_FILE,
    DEFAULT_PROJECT_DIR
} from './helpers.js';
import { isWatcherRunning, startHealthCheck } from './health.js';
import { startOutboxPoller } from './outbox.js';
import { PLATFORM_LABELS } from './registries.js';

// --- Bot Init ---
const bot = new TelegramBot(TOKEN, { polling: true });
const BOT_START_TIME = Date.now();

console.log(`🤖 wa-bridge v3 started at ${new Date().toISOString()}`);
console.log(`📂 Project root: ${PROJECT_ROOT}`);
console.log(`📂 Central dir: ${CENTRAL_DIR}`);

// ============================================================================
// Core Patterns: Auth, Command Registry, Callback Router
// ============================================================================

// REF-2: Centralized auth guard
function authorized(handler) {
    return async (msg, ...args) => {
        if (String(msg.chat.id) !== String(CHAT_ID)) return;
        return handler(msg, ...args);
    };
}

// REF-5: Auto-generated BOT_COMMANDS list
const BOT_COMMANDS = [];
function registerCommand(pattern, handler) {
    const match = pattern.source.match(/\\\/(\w+)/);
    if (match) BOT_COMMANDS.push('/' + match[1]);
    bot.onText(pattern, authorized(handler));
}

// REF-3: Callback query router
const callbackRoutes = {};
function onCallback(prefix, handler) {
    callbackRoutes[prefix] = handler;
}

bot.on('callback_query', async (query) => {
    if (String(query.message?.chat.id) !== String(CHAT_ID)) return;
    const data = query.data || '';

    // Find longest matching prefix (e.g. "ep_task_model:" before "ep_task:")
    const sorted = Object.keys(callbackRoutes).sort((a, b) => b.length - a.length);
    for (const prefix of sorted) {
        if (data.startsWith(prefix) || data === prefix) {
            try {
                await callbackRoutes[prefix](query);
            } catch (err) {
                console.error(`Callback error (${prefix}): ${err.message}`);
                try {
                    await bot.answerCallbackQuery(query.id, { text: `Error: ${err.message}` });
                } catch { /* ignore */ }
            }
            return;
        }
    }
});

// ============================================================================
// Shared Context — passed to all command modules
// ============================================================================

const ctx = {
    CHAT_ID, SCRIPT_DIR, CENTRAL_DIR,
    INBOX, OUTBOX, STATE_FILE, DISPATCH_FILE, LOCK_FILE,
    DEFAULT_PROJECT_DIR, BOT_START_TIME,
    readJsonSafe, atomicWrite, writeToInbox, getState, updateState, formatUptime,
    isWatcherRunning, resolve,
    registerCommand, onCallback, authorized,
    POLL_INTERVAL_MS: 2000,
    MAX_MSG_LEN: 4096
};

// ============================================================================
// Register All Command Modules
// ============================================================================

import { register as registerGeneral } from './commands/general.js';
import { register as registerModel } from './commands/model.js';
import { register as registerProject } from './commands/project.js';
import { register as registerWorkflow } from './commands/workflow.js';
import { register as registerPlan } from './commands/plan.js';
import { register as registerAdmin } from './commands/admin.js';
import { register as registerDiagnose } from './commands/diagnose.js';

registerGeneral(bot, ctx);
registerModel(bot, ctx);
registerProject(bot, ctx);
registerWorkflow(bot, ctx);
registerPlan(bot, ctx);
registerAdmin(bot, ctx);
registerDiagnose(bot, ctx);

console.log(`📋 Registered ${BOT_COMMANDS.length} commands: ${BOT_COMMANDS.join(', ')}`);

// ============================================================================
// Message Relay — non-command messages go to inbox for watcher
// ============================================================================

bot.on('message', async (msg) => {
    if (String(msg.chat.id) !== String(CHAT_ID)) return;
    if (!msg.text) return;

    // Skip if it's a registered bot command
    if (BOT_COMMANDS.some(cmd => msg.text.startsWith(cmd))) return;

    // Workflow commands (e.g. /startup, /shutdown) pass through to inbox
    writeToInbox(msg.text);
    console.log(`📥 ${new Date().toISOString()} | Relayed to inbox: ${msg.text.substring(0, 50)}`);
});

// ============================================================================
// Start Infrastructure
// ============================================================================

startOutboxPoller(bot, ctx);
startHealthCheck(bot, ctx);

// Send startup notification to Telegram
const { version } = JSON.parse(readFileSync(resolve(SCRIPT_DIR, 'package.json'), 'utf8'));
const state = getState();
const backendLabel = PLATFORM_LABELS[state.backend || 'gemini'] || state.backend || 'gemini';
bot.sendMessage(CHAT_ID, `✅ Bot v3 started\n📦 ${version} | ${backendLabel}\n⏰ ${new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}`).catch(err => {
    console.error(`⚠️ Failed to send startup notification: ${err.message}`);
});

// ============================================================================
// Error Handling + Graceful Shutdown
// ============================================================================

bot.on('error', (err) => {
    console.error(`❌ Bot error: ${err.message}`);
});

bot.on('polling_error', (err) => {
    console.error(`⚠️ Polling error: ${err.message}`);
});

process.on('SIGINT', () => {
    console.log('\\n👋 Shutting down gracefully...');
    bot.stopPolling();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\\n👋 SIGTERM received, shutting down...');
    bot.stopPolling();
    process.exit(0);
});

process.on('uncaughtException', (err) => {
    console.error(`💥 Uncaught exception: ${err.message}`);
    console.error(err.stack);
});
