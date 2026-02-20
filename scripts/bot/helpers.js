// ============================================================================
// helpers.js — Shared config, state management, and IO helpers
// ============================================================================
// Extracted from bot.js to enable consistent usage across modules and tests.
// Fixes MAINT-3 (inconsistent state access) by providing a single getState().
// ============================================================================

import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// --- Path Resolution ---
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIR, '..', '..');

// --- Environment ---
dotenv.config({ path: resolve(SCRIPT_DIR, '.env') });

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const DEFAULT_PROJECT_DIR = process.env.GEMINI_PROJECT_DIR || PROJECT_ROOT;

// --- Derived Paths ---
const CENTRAL_DIR = resolve(DEFAULT_PROJECT_DIR, '.gemini');
const INBOX = resolve(CENTRAL_DIR, 'wa_inbox.json');
const OUTBOX = resolve(CENTRAL_DIR, 'wa_outbox.json');
const STATE_FILE = resolve(CENTRAL_DIR, 'state.json');
const DISPATCH_FILE = resolve(CENTRAL_DIR, 'wa_dispatch.json');
const LOCK_FILE = resolve(CENTRAL_DIR, 'wa_session.lock');

// --- Constants ---
const POLL_INTERVAL_MS = 2000;
const MAX_MSG_LEN = 4096;

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

function getState() {
    return readJsonSafe(STATE_FILE, { activeProject: DEFAULT_PROJECT_DIR, projects: { "main": DEFAULT_PROJECT_DIR } });
}

function updateState(updater) {
    const state = getState();
    updater(state);
    atomicWrite(STATE_FILE, state);
    return state;
}

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

// --- Exports ---

export {
    // Paths
    SCRIPT_DIR,
    PROJECT_ROOT,
    CENTRAL_DIR,
    INBOX,
    OUTBOX,
    STATE_FILE,
    DISPATCH_FILE,
    LOCK_FILE,
    DEFAULT_PROJECT_DIR,

    // Env
    TOKEN,
    CHAT_ID,

    // Constants
    POLL_INTERVAL_MS,
    MAX_MSG_LEN,

    // Functions
    readJsonSafe,
    atomicWrite,
    writeToInbox,
    getState,
    updateState,
    formatUptime,
};
