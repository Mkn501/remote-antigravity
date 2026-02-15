// ============================================================================
// Telegram Relay Bot — wa-bridge
// ============================================================================
// Relays messages between Telegram and the Gemini CLI hook bridge via JSON
// files (wa_inbox.json / wa_outbox.json).
//
// Commands:
//   /sprint        — Start Sprint Mode
//   /stop          — Send STOP signal
//   /status        — Check status
//   /project <name> — Switch active project
//   /add <name> <path> — Register a new project
//   /list          — List available projects
//
// Usage:
//   1. Copy .env.example to .env and fill in values
//   2. npm install
//   3. npm start
// ============================================================================

import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync } from 'fs';
import { resolve, dirname, isAbsolute } from 'path';
import { fileURLToPath } from 'url';

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

const POLL_INTERVAL_MS = 2000;
const MAX_MSG_LEN = 4096;

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

// --- Commands ---

bot.onText(/^\/help/, async (msg) => {
    if (String(msg.chat.id) !== String(CHAT_ID)) return;
    const help = [
        '🤖 *Antigravity Bot Commands*',
        '',
        '⚡ *Workflow Commands* (→ Gemini CLI):',
        '/startup — Load project context, fresh branch',
        '/shutdown — Save state, close session branch',
        '/plan\_feature — Plan a new feature',
        '/implement\_task — Implement an assigned task',
        '/pr\_check — Check and merge PRs',
        '/update\_roadmap — Update roadmap docs',
        '/new — Archive branch, start fresh',
        '',
        '🔧 *Bot Commands* (instant):',
        '/status — System status',
        '/stop — Halt agent',
        '/sprint — Sprint mode',
        '/project <name> — Switch project',
        '/list — List projects',
        '/help — This message',
        '/model — Switch AI model',
    ].join('\n');
    await bot.sendMessage(CHAT_ID, help, { parse_mode: 'Markdown' });
});

// --- Model Selection ---
const MODEL_OPTIONS = [
    { id: 'gemini-2.5-flash', label: '1️⃣ Flash', short: 'Flash' },
    { id: 'gemini-2.5-pro', label: '2️⃣ Pro', short: 'Pro' },
    { id: 'gemini-3-pro-preview', label: '3️⃣ Pro 3.0 Preview', short: 'Pro 3.0 Preview' },
    { id: 'gemini-2.0-flash-lite', label: '4️⃣ Flash Lite', short: 'Flash Lite' },
];

bot.onText(/^\/model$/, async (msg) => {
    if (String(msg.chat.id) !== String(CHAT_ID)) return;
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    const current = state.model || 'default';
    const currentLabel = MODEL_OPTIONS.find(m => m.id === current)?.short || current;

    await bot.sendMessage(CHAT_ID, `🤖 Current model: *${currentLabel}*\nSelect a model:`, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [MODEL_OPTIONS.map(m => ({
                text: m.id === current ? `✅ ${m.label}` : m.label,
                callback_data: `model:${m.id}`
            }))]
        }
    });
});

bot.on('callback_query', async (query) => {
    if (!query.data?.startsWith('model:')) return;
    const modelId = query.data.replace('model:', '');
    const modelInfo = MODEL_OPTIONS.find(m => m.id === modelId);
    if (!modelInfo) return;

    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    state.model = modelId;
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

    await bot.answerCallbackQuery(query.id, { text: `Switched to ${modelInfo.short}` });
    await bot.editMessageText(`🤖 Model switched to: *${modelInfo.short}*`, {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        parse_mode: 'Markdown'
    });
    console.log(`🤖 ${new Date().toISOString()} | Model → ${modelId}`);
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
    await bot.sendMessage(CHAT_ID, '🔴 STOP signal sent.\nAgent will halt after completing current action.');
    console.log(`🛑 ${new Date().toISOString()} | STOP signal sent`);
});

bot.onText(/^\/status/, async (msg) => {
    if (String(msg.chat.id) !== String(CHAT_ID)) return;
    const inboxData = readJsonSafe(INBOX, { messages: [] });
    const outboxData = readJsonSafe(OUTBOX, { messages: [] });
    const unread = inboxData.messages.filter(m => !m.read).length;
    const unsent = outboxData.messages.filter(m => !m.sent).length;
    const stopFlag = existsSync(resolve(CENTRAL_DIR, 'wa_stop_signal'));
    const state = getState();

    const status = [
        '📊 **Bridge Status**',
        `📂 Active Project: \`${state.activeProject}\``,
        `📥 Inbox: ${inboxData.messages.length} total, ${unread} unread`,
        `📤 Outbox: ${outboxData.messages.length} total, ${unsent} unsent`,
        `${stopFlag ? '🔴' : '🟢'} Stop signal: ${stopFlag ? 'ACTIVE' : 'clear'}`,
        `🤖 Bot: running`
    ].join('\n');

    await bot.sendMessage(CHAT_ID, status, { parse_mode: 'Markdown' });
});

bot.onText(/^\/project\s+(.+)/, async (msg, match) => {
    if (String(msg.chat.id) !== String(CHAT_ID)) return;
    const name = match[1].trim();
    const state = getState();

    if (!state.projects[name]) {
        await bot.sendMessage(CHAT_ID, `❌ Project "${name}" not found.\nUse /list to see available or /add to register.`);
        return;
    }

    updateState(s => s.activeProject = state.projects[name]);
    await bot.sendMessage(CHAT_ID, `✅ Switched to project: **${name}**\n\`${state.projects[name]}\``, { parse_mode: 'Markdown' });
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
        await bot.sendMessage(CHAT_ID, `❌ Directory not found:\n\`${path}\``, { parse_mode: 'Markdown' });
        return;
    }

    updateState(s => s.projects[name] = path);
    await bot.sendMessage(CHAT_ID, `✅ Added project: **${name}**\n\`${path}\``, { parse_mode: 'Markdown' });
    console.log(`➕ Added project: ${name} -> ${path}`);
});

bot.onText(/^\/list/, async (msg) => {
    if (String(msg.chat.id) !== String(CHAT_ID)) return;
    const state = getState();
    const list = Object.entries(state.projects)
        .map(([name, path]) => `- **${name}**: \`${path}\` ${state.activeProject === path ? '(ACTIVE)' : ''}`)
        .join('\n');

    await bot.sendMessage(CHAT_ID, `📂 **Available Projects**:\n${list}`, { parse_mode: 'Markdown' });
});


// --- Inbound: Telegram → wa_inbox.json ---
bot.on('message', (msg) => {
    // Skip bot-native commands (handled by their own handlers above)
    const BOT_COMMANDS = ['/stop', '/status', '/project', '/list', '/model', '/add', '/help', '/sprint'];
    if (msg.text && BOT_COMMANDS.some(cmd => msg.text.startsWith(cmd))) return;

    // Auth
    if (String(msg.chat.id) !== String(CHAT_ID)) return;

    if (!msg.text) return;

    writeToInbox(msg.text);
    const preview = msg.text.length > 80 ? msg.text.substring(0, 77) + '...' : msg.text;
    console.log(`📥 ${new Date().toISOString()} | ${preview}`);
});

// --- Outbound: wa_outbox.json → Telegram ---
setInterval(async () => {
    if (!existsSync(OUTBOX)) return;

    const outbox = readJsonSafe(OUTBOX, { messages: [] });
    const unsent = outbox.messages.filter(m => !m.sent);
    if (unsent.length === 0) return;

    let dirty = false;
    for (const msg of unsent) {
        try {
            const text = msg.text || '(empty response)';
            for (let i = 0; i < text.length; i += MAX_MSG_LEN) {
                await bot.sendMessage(CHAT_ID, text.substring(i, i + MAX_MSG_LEN));
            }
            msg.sent = true;
            dirty = true;

            const preview = text.length > 80 ? text.substring(0, 77) + '...' : text;
            console.log(`📤 ${new Date().toISOString()} | ${preview}`);
        } catch (err) {
            console.error(`❌ Send failed: ${err.message}`);
            break;
        }
    }

    if (dirty) {
        atomicWrite(OUTBOX, outbox);
    }
}, POLL_INTERVAL_MS);

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
