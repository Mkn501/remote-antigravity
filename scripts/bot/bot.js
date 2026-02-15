// ============================================================================
// Telegram Relay Bot — wa-bridge
// ============================================================================
// Relays messages between Telegram and the Gemini CLI hook bridge via JSON
// files (wa_inbox.json / wa_outbox.json).
//
// Commands:
//   /sprint  — Start Sprint Mode (sends initial sprint prompt)
//   /stop    — Send STOP signal to halt Sprint Mode
//   /status  — Check bot and file status
//
// Usage:
//   1. Copy .env.example to .env and fill in values
//   2. npm install
//   3. npm start
// ============================================================================

import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';

// --- Config ---
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const PROJECT_DIR = process.env.GEMINI_PROJECT_DIR || '.';
const INBOX = resolve(PROJECT_DIR, '.gemini/wa_inbox.json');
const OUTBOX = resolve(PROJECT_DIR, '.gemini/wa_outbox.json');
const POLL_INTERVAL_MS = 2000;
const MAX_MSG_LEN = 4096;

if (!TOKEN || !CHAT_ID) {
    console.error('❌ Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID in .env');
    process.exit(1);
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

// --- Bot Init ---
const bot = new TelegramBot(TOKEN, { polling: true });
console.log('🤖 wa-bridge bot started');
console.log(`   📂 Project: ${PROJECT_DIR}`);
console.log(`   📥 Inbox:   ${INBOX}`);
console.log(`   📤 Outbox:  ${OUTBOX}`);
console.log(`   💬 Chat ID: ${CHAT_ID}`);
console.log('');

// --- Commands ---

bot.onText(/^\/sprint/, async (msg) => {
    if (String(msg.chat.id) !== String(CHAT_ID)) return;
    writeToInbox('🏃 Sprint Mode activated. Check your task list and process the highest priority task. After completing it, report your status.');
    await bot.sendMessage(CHAT_ID, '🟢 Sprint Mode activated.\nSend messages anytime — they\'ll be picked up between turns.\nSend /stop to halt.');
    console.log(`🏃 ${new Date().toISOString()} | Sprint Mode activated`);
});

bot.onText(/^\/stop/, async (msg) => {
    if (String(msg.chat.id) !== String(CHAT_ID)) return;
    writeToInbox('STOP');
    await bot.sendMessage(CHAT_ID, '🔴 STOP signal sent.\nAgent will halt after completing its current action.');
    console.log(`🛑 ${new Date().toISOString()} | STOP signal sent`);
});

bot.onText(/^\/status/, async (msg) => {
    if (String(msg.chat.id) !== String(CHAT_ID)) return;
    const inboxData = readJsonSafe(INBOX, { messages: [] });
    const outboxData = readJsonSafe(OUTBOX, { messages: [] });
    const unread = inboxData.messages.filter(m => !m.read).length;
    const unsent = outboxData.messages.filter(m => !m.sent).length;
    const stopFlag = existsSync(resolve(PROJECT_DIR, '.gemini/wa_stop_signal'));

    const status = [
        '📊 **Bridge Status**',
        `📥 Inbox: ${inboxData.messages.length} total, ${unread} unread`,
        `📤 Outbox: ${outboxData.messages.length} total, ${unsent} unsent`,
        `${stopFlag ? '🔴' : '🟢'} Stop signal: ${stopFlag ? 'ACTIVE' : 'clear'}`,
        `🤖 Bot: running`
    ].join('\n');

    await bot.sendMessage(CHAT_ID, status, { parse_mode: 'Markdown' });
});

// --- Inbound: Telegram → wa_inbox.json ---
bot.on('message', (msg) => {
    // Skip commands (handled above)
    if (msg.text && msg.text.startsWith('/')) return;

    // Auth: only accept from configured chat
    if (String(msg.chat.id) !== String(CHAT_ID)) {
        console.log(`⚠️  Ignored message from unauthorized chat: ${msg.chat.id}`);
        return;
    }

    if (!msg.text) {
        console.log('⚠️  Ignored non-text message');
        return;
    }

    writeToInbox(msg.text);
    const preview = msg.text.length > 80 ? msg.text.substring(0, 77) + '...' : msg.text;
    console.log(`📥 ${new Date().toISOString()} | ${preview}`);
});

// --- Outbound: wa_outbox.json → Telegram (polling) ---
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
