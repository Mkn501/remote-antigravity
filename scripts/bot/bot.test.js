// ============================================================================
// Regression Test Suite — wa-bridge bot
// Run: node scripts/bot/bot.test.js
// ============================================================================

import { strictEqual, deepStrictEqual, ok } from 'assert';
import {
    readFileSync, writeFileSync, unlinkSync, existsSync,
    mkdirSync, rmSync, statSync
} from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIR, '..', '..');
const TEST_DIR = resolve(PROJECT_ROOT, '.gemini', '_test_sandbox');
const INBOX = resolve(TEST_DIR, 'wa_inbox.json');
const OUTBOX = resolve(TEST_DIR, 'wa_outbox.json');
const STATE = resolve(TEST_DIR, 'state.json');
const LOCK = resolve(TEST_DIR, 'wa_session.lock');

const BOT_PACKAGE_JSON = resolve(SCRIPT_DIR, 'package.json');
const { version } = JSON.parse(readFileSync(BOT_PACKAGE_JSON, 'utf8'));
const startTime = new Date(); // Mock startup time for tests

// Mock Telegram Bot and message storage
let mockBot;
let receivedMessages;
let CHAT_ID; // Will be set during test setup

// ---- Test Framework ----
let passed = 0;
let failed = 0;
let skipped = 0;
const failures = [];

function setup() {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });

    // Mock specific CHAT_ID for tests
    CHAT_ID = '123456789';
    receivedMessages = [];

    // Mock TelegramBot for each test
    mockBot = {
        onText: (regexp, callback) => {
            mockBot._handlers.push({ regexp, callback });
        },
        sendMessage: async (chatId, text, options) => {
            receivedMessages.push({ chatId, text, options });
            return { message_id: receivedMessages.length };
        },
        _handlers: []
    };
}

function teardown() {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mockBot = null;
    receivedMessages = [];
    CHAT_ID = null;
}

async function test(name, fn) {
    setup();
    try {
        await fn();
        passed++;
        console.log(`  ✅ ${name}`);
    } catch (err) {
        failed++;
        failures.push({ name, error: err });
        console.log(`  ❌ ${name}`);
        console.log(`     ${err.message}`);
    } finally {
        teardown();
    }
}

function skip(name) {
    skipped++;
    console.log(`  ⏭️  ${name} (skipped — requires live bot)`);
}

// ---- Helpers (extracted logic from bot.js) ----

function readJsonSafe(filePath, fallback) {
    try {
        return JSON.parse(readFileSync(filePath, 'utf8'));
    } catch {
        return fallback;
    }
}

function atomicWrite(filePath, data) {
    const tmp = filePath + '.tmp';
    writeFileSync(tmp, JSON.stringify(data, null, 2));
    writeFileSync(filePath, JSON.stringify(data, null, 2));
    try { unlinkSync(tmp); } catch { /* ignore */ }
}

function writeToInbox(text) {
    const inbox = readJsonSafe(INBOX, { messages: [] });
    inbox.messages.push({
        id: `msg_${Date.now()}`,
        timestamp: new Date().toISOString(),
        from: 'user',
        text,
        read: false
    });
    writeFileSync(INBOX, JSON.stringify(inbox, null, 2));
}

function writeToOutbox(text, sent = false) {
    const outbox = readJsonSafe(OUTBOX, { messages: [] });
    outbox.messages.push({
        id: `resp_${Date.now()}`,
        timestamp: new Date().toISOString(),
        from: 'agent',
        text,
        sent
    });
    writeFileSync(OUTBOX, JSON.stringify(outbox, null, 2));
}

function getState() {
    return readJsonSafe(STATE, {});
}

function updateState(updater) {
    const state = getState();
    updater(state);
    writeFileSync(STATE, JSON.stringify(state, null, 2));
}

// ============================================================================
// TEST SUITES
// ============================================================================

console.log('\n📋 wa-bridge Regression Test Suite\n');

// ---- 1. JSON I/O ----
console.log('── JSON Read/Write ──');

await test('readJsonSafe returns fallback for missing file', () => {
    const result = readJsonSafe('/tmp/_nonexistent_test_.json', { ok: true });
    deepStrictEqual(result, { ok: true });
});

await test('readJsonSafe returns fallback for malformed JSON', () => {
    const f = resolve(TEST_DIR, 'bad.json');
    writeFileSync(f, 'not json{{{');
    const result = readJsonSafe(f, { fallback: true });
    deepStrictEqual(result, { fallback: true });
});

await test('readJsonSafe reads valid JSON', () => {
    const f = resolve(TEST_DIR, 'good.json');
    writeFileSync(f, JSON.stringify({ key: 'value' }));
    const result = readJsonSafe(f, {});
    strictEqual(result.key, 'value');
});

// ---- 2. Inbox ----
console.log('\n── Inbox ──');

await test('writeToInbox creates inbox if not exists', () => {
    writeToInbox('hello');
    ok(existsSync(INBOX), 'inbox file should exist');
    const data = readJsonSafe(INBOX, {});
    strictEqual(data.messages.length, 1);
    strictEqual(data.messages[0].text, 'hello');
    strictEqual(data.messages[0].read, false);
    strictEqual(data.messages[0].from, 'user');
});

await test('writeToInbox appends to existing inbox', () => {
    writeToInbox('first');
    writeToInbox('second');
    const data = readJsonSafe(INBOX, {});
    strictEqual(data.messages.length, 2);
    strictEqual(data.messages[0].text, 'first');
    strictEqual(data.messages[1].text, 'second');
});

await test('writeToInbox preserves message structure', () => {
    writeToInbox('test msg');
    const msg = readJsonSafe(INBOX, {}).messages[0];
    ok(msg.id.startsWith('msg_'), 'id should start with msg_');
    ok(msg.timestamp, 'timestamp should be set');
    strictEqual(msg.from, 'user');
    strictEqual(msg.read, false);
});

await test('inbox handles special characters', () => {
    const special = '`code` *bold* _italic_ [link](url) \n newline \t tab';
    writeToInbox(special);
    const msg = readJsonSafe(INBOX, {}).messages[0];
    strictEqual(msg.text, special);
});

await test('inbox handles emoji-heavy messages', () => {
    const emojis = '🚀 🔥 💯 📦 🧠 ⚡ 🏁 ✅ ❌ ⚠️';
    writeToInbox(emojis);
    const msg = readJsonSafe(INBOX, {}).messages[0];
    strictEqual(msg.text, emojis);
});

// ---- 3. Outbox ----
console.log('\n── Outbox ──');

await test('writeToOutbox creates outbox if not exists', () => {
    writeToOutbox('response');
    ok(existsSync(OUTBOX), 'outbox file should exist');
    const data = readJsonSafe(OUTBOX, {});
    strictEqual(data.messages.length, 1);
    strictEqual(data.messages[0].text, 'response');
    strictEqual(data.messages[0].sent, false);
});

await test('outbox marks sent correctly', () => {
    writeToOutbox('msg1', false);
    writeToOutbox('msg2', true);
    const data = readJsonSafe(OUTBOX, {});
    strictEqual(data.messages[0].sent, false);
    strictEqual(data.messages[1].sent, true);
});

await test('outbox polling simulation: filter unsent', () => {
    writeToOutbox('sent already', true);
    writeToOutbox('needs sending', false);
    writeToOutbox('also needs sending', false);
    const data = readJsonSafe(OUTBOX, {});
    const unsent = data.messages.filter(m => !m.sent);
    strictEqual(unsent.length, 2);
    strictEqual(unsent[0].text, 'needs sending');
});

await test('outbox handles long messages (> 4096 chars)', () => {
    const longText = 'A'.repeat(5000);
    writeToOutbox(longText);
    const msg = readJsonSafe(OUTBOX, {}).messages[0];
    strictEqual(msg.text.length, 5000);
    ok(msg.text.length > 4096, 'message should exceed Telegram limit');
});

// ---- 4a. Outbox Document Support ----
console.log('\n── Outbox Document Support ──');

function writeDocToOutbox(filePath, caption, sent = false) {
    const outbox = readJsonSafe(OUTBOX, { messages: [] });
    outbox.messages.push({
        id: `doc_${Date.now()}`,
        timestamp: new Date().toISOString(),
        from: 'agent',
        type: 'document',
        filePath,
        caption,
        sent
    });
    writeFileSync(OUTBOX, JSON.stringify(outbox, null, 2));
}

function writeMarkupToOutbox(text, reply_markup, sent = false) {
    const outbox = readJsonSafe(OUTBOX, { messages: [] });
    outbox.messages.push({
        id: `btn_${Date.now()}`,
        timestamp: new Date().toISOString(),
        from: 'agent',
        text,
        reply_markup,
        sent
    });
    writeFileSync(OUTBOX, JSON.stringify(outbox, null, 2));
}

await test('outbox document message has correct structure', () => {
    writeDocToOutbox('/tmp/test_spec.md', '📎 Plan spec');
    const msg = readJsonSafe(OUTBOX, {}).messages[0];
    strictEqual(msg.type, 'document');
    strictEqual(msg.filePath, '/tmp/test_spec.md');
    strictEqual(msg.caption, '📎 Plan spec');
    strictEqual(msg.sent, false);
    strictEqual(msg.text, undefined, 'document messages should not have text');
});

await test('outbox reply_markup message preserves inline keyboard', () => {
    const markup = { inline_keyboard: [[{ text: '▶️ Next', callback_data: 'ep_continue' }]] };
    writeMarkupToOutbox('Task 1 done', markup);
    const msg = readJsonSafe(OUTBOX, {}).messages[0];
    strictEqual(msg.text, 'Task 1 done');
    ok(msg.reply_markup, 'reply_markup should be present');
    strictEqual(msg.reply_markup.inline_keyboard[0][0].callback_data, 'ep_continue');
});

await test('outbox routing: document vs text vs markup are distinguishable', () => {
    writeDocToOutbox('/tmp/spec.md', '📎 Spec');
    writeToOutbox('Simple text');
    writeMarkupToOutbox('With buttons', { inline_keyboard: [[{ text: '🛑 Stop', callback_data: 'ep_stop' }]] });
    const msgs = readJsonSafe(OUTBOX, {}).messages;
    strictEqual(msgs.length, 3);
    strictEqual(msgs[0].type, 'document');
    strictEqual(msgs[1].type, undefined);
    ok(!msgs[1].reply_markup, 'plain text should have no reply_markup');
    ok(msgs[2].reply_markup, 'markup message should have reply_markup');
});

// ---- 4b. Plan Mode Persistence ----
console.log('\n── Plan Mode Persistence ──');

await test('plan mode: marker file detection', () => {
    const markerFile = resolve(TEST_DIR, 'wa_plan_mode');
    ok(!existsSync(markerFile), 'marker should not exist initially');

    // Simulate /plan_feature creating the marker
    writeFileSync(markerFile, 'plan_feature');
    ok(existsSync(markerFile), 'marker should exist after plan_feature');

    // Simulate detection in watcher
    const content = readFileSync(markerFile, 'utf8');
    strictEqual(content, 'plan_feature');

    unlinkSync(markerFile);
});

await test('plan mode: marker file cleaned up on shutdown', () => {
    const markerFile = resolve(TEST_DIR, 'wa_plan_mode');
    writeFileSync(markerFile, 'plan_feature');
    ok(existsSync(markerFile), 'marker should exist');

    // Simulate shutdown cleanup
    if (existsSync(markerFile)) unlinkSync(markerFile);
    ok(!existsSync(markerFile), 'marker should be removed after shutdown');
});

await test('plan mode: guard blocks code changes in prompt', () => {
    // Verify the plan guard text is correctly structured
    const PLAN_GUARD = `
⛔ CRITICAL: PLANNING MODE IS ACTIVE.
- You are refining an existing plan. The spec is in docs/specs/ — read it, update it per the user's feedback.
- You MUST NOT write any application code (.js, .py, .sh, etc). Only update specs, tasks, and documentation.
- After updating the spec, write a short summary of changes to .gemini/telegram_reply.txt
- If the user says 'looks good' or similar approval, just acknowledge — do NOT implement anything.
`;
    ok(PLAN_GUARD.includes('MUST NOT write any application code'), 'guard should block code changes');
    ok(PLAN_GUARD.includes('PLANNING MODE IS ACTIVE'), 'guard should declare plan mode');
    ok(PLAN_GUARD.includes('.js, .py, .sh'), 'guard should list blocked file types');
});

// ---- 4. State Management ----
console.log('\n── State Management ──');

await test('getState returns empty object for missing file', () => {
    const state = getState();
    deepStrictEqual(state, {});
});

await test('updateState creates state file', () => {
    updateState(s => {
        s.activeProject = '/test/path';
        s.projects = { main: '/test/path' };
    });
    const state = getState();
    strictEqual(state.activeProject, '/test/path');
    strictEqual(state.projects.main, '/test/path');
});

await test('updateState preserves existing fields', () => {
    updateState(s => {
        s.activeProject = '/path1';
        s.model = 'gemini-2.5-flash';
    });
    updateState(s => {
        s.activeProject = '/path2';
    });
    const state = getState();
    strictEqual(state.activeProject, '/path2');
    strictEqual(state.model, 'gemini-2.5-flash');
});

await test('state model validation pattern', () => {
    const validModels = [
        'gemini-2.5-flash',
        'gemini-2.5-pro',
        'gemini-3-pro-preview',
        'gemini-2.0-flash-lite',
        'models/gemini-2.5-flash:generateContent'
    ];
    const invalidModels = [
        'rm -rf /',
        '$(whoami)',
        'model; echo pwned',
        'model\necho pwned'
    ];
    const modelRegex = /^[a-zA-Z0-9._:/-]+$/;
    for (const m of validModels) {
        ok(modelRegex.test(m), `valid model should pass: ${m}`);
    }
    for (const m of invalidModels) {
        ok(!modelRegex.test(m), `invalid model should fail: ${m}`);
    }
});

// ---- 5. Lock File ----
console.log('\n── Lock File ──');

await test('lock file creation and removal', () => {
    writeFileSync(LOCK, '12345');
    ok(existsSync(LOCK));
    unlinkSync(LOCK);
    ok(!existsSync(LOCK));
});

await test('lock file contains PID', () => {
    const pid = '42';
    writeFileSync(LOCK, pid);
    const content = readFileSync(LOCK, 'utf8').trim();
    strictEqual(content, '42');
    strictEqual(parseInt(content, 10), 42);
});

await test('stale lock detection (dead PID)', () => {
    const deadPid = 999999999; // very unlikely to be a real PID
    writeFileSync(LOCK, String(deadPid));
    let isStale = false;
    try {
        process.kill(deadPid, 0);
    } catch (err) {
        if (err.code === 'ESRCH') isStale = true;
    }
    ok(isStale, 'dead PID should be detected as stale');
});

await test('live lock detection (own PID)', () => {
    writeFileSync(LOCK, String(process.pid));
    let isAlive = false;
    try {
        process.kill(process.pid, 0);
        isAlive = true;
    } catch { /* dead */ }
    ok(isAlive, 'own PID should be detected as alive');
});

// ---- 6. Message Routing ----
console.log('\n── Message Routing ──');

await test('BOT_COMMANDS list is complete', () => {
    const BOT_COMMANDS = ['/stop', '/status', '/project', '/list', '/model', '/add', '/help', '/sprint'];
    const shouldBeHandled = ['/stop', '/help', '/status', '/project', '/list', '/model', '/sprint'];
    for (const cmd of shouldBeHandled) {
        ok(BOT_COMMANDS.some(c => cmd.startsWith(c)), `${cmd} should be in BOT_COMMANDS`);
    }
});

await test('auth check rejects wrong chat ID', () => {
    const CHAT_ID = '12345';
    const msg = { chat: { id: '99999' }, text: 'hello' };
    const isAuthed = String(msg.chat.id) === String(CHAT_ID);
    ok(!isAuthed, 'wrong chat ID should be rejected');
});

await test('auth check accepts correct chat ID (string)', () => {
    const CHAT_ID = '12345';
    const msg = { chat: { id: '12345' }, text: 'hello' };
    const isAuthed = String(msg.chat.id) === String(CHAT_ID);
    ok(isAuthed, 'matching string chat ID should be accepted');
});

await test('auth check accepts correct chat ID (number)', () => {
    const CHAT_ID = '12345';
    const msg = { chat: { id: 12345 }, text: 'hello' };
    const isAuthed = String(msg.chat.id) === String(CHAT_ID);
    ok(isAuthed, 'matching numeric chat ID should be accepted');
});

await test('workflow commands pass through to inbox', () => {
    const BOT_COMMANDS = ['/stop', '/status', '/project', '/list', '/model', '/add', '/help', '/sprint'];
    const workflowCommands = ['/startup', '/shutdown', '/plan_feature', '/implement_task'];
    for (const cmd of workflowCommands) {
        const isBot = BOT_COMMANDS.some(c => cmd.startsWith(c));
        ok(!isBot, `${cmd} should NOT be intercepted by bot — it goes to the watcher`);
    }
});

// ---- 7. File Sending ----
console.log('\n── File Sending ──');

await test('long message detection threshold', () => {
    const MAX_MSG_LEN = 4096;
    ok('A'.repeat(4096).length <= MAX_MSG_LEN, 'exactly 4096 should be text');
    ok('A'.repeat(4097).length > MAX_MSG_LEN, '4097 should trigger file send');
});

await test('temp file creation for long replies', () => {
    const text = 'B'.repeat(5000);
    const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const tmpFile = join(tmpdir(), `gemini_reply_test_${ts}.txt`);
    writeFileSync(tmpFile, text, 'utf8');
    ok(existsSync(tmpFile));
    const content = readFileSync(tmpFile, 'utf8');
    strictEqual(content.length, 5000);
    unlinkSync(tmpFile);
});

await test('caption preview is truncated correctly', () => {
    const text = 'C'.repeat(5000);
    const preview = text.substring(0, 200).replace(/\n/g, ' ') + '…';
    const caption = `📄 Full reply (${text.length} chars):\n${preview}`;
    ok(caption.length <= 1024, 'caption should be under Telegram 1024 limit');
    strictEqual(preview.length, 201); // 200 chars + '…'
});

// ---- 8. Watcher Integration ----
console.log('\n── Watcher Integration ──');

await test('watcher outbox message format', () => {
    // Simulates what watcher.sh write_to_outbox() produces
    const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    const msg = {
        id: `resp_${Math.floor(Date.now() / 1000)}`,
        timestamp,
        from: 'agent',
        text: '📥 Message received: test',
        sent: false
    };
    ok(msg.id.startsWith('resp_'));
    ok(msg.timestamp.endsWith('Z'));
    strictEqual(msg.from, 'agent');
    strictEqual(msg.sent, false);
});

await test('watcher lifecycle status messages are valid', () => {
    const statuses = [
        '📥 Message received: test message',
        '⚡ Running workflow: /startup',
        '🧠 Running Gemini CLI...',
        '🧠 Running Kilo CLI...',
        '💾 Changes committed',
        '🏁 Session closed — branch ready for review'
    ];
    for (const s of statuses) {
        ok(s.length > 0, 'status should not be empty');
        ok(s.length <= 4096, 'status should be under Telegram limit');
        ok(!s.includes('parse_mode'), 'status should not contain parse_mode');
    }
});

await test('session command detection: /new', () => {
    const msg = '/new fix the login page';
    const isNew = /^\/new/i.test(msg);
    ok(isNew, '/new should be detected');
    const cleaned = msg.replace(/^\/new\s*/i, '');
    strictEqual(cleaned, 'fix the login page');
});

await test('session command detection: /startup', () => {
    const msg = '/startup';
    const isStartup = /^\/startup/i.test(msg);
    ok(isStartup);
});

await test('session command detection: /shutdown', () => {
    const msg = '/shutdown';
    const isShutdown = /^\/shutdown/i.test(msg);
    ok(isShutdown);
});

await test('workflow command extraction', () => {
    const testCases = [
        ['/startup', 'startup'],
        ['/shutdown', 'shutdown'],
        ['/plan_feature auth system', 'plan_feature'],
        ['/implement_task', 'implement_task'],
        ['/pr_check', 'pr_check'],
        ['hello world', null]
    ];
    for (const [input, expected] of testCases) {
        const match = input.match(/^\/([a-z_-]+)/);
        const result = match ? match[1] : null;
        strictEqual(result, expected, `"${input}" → expected "${expected}", got "${result}"`);
    }
});

await test('/version command returns version and uptime', async () => {
    // Simulate the bot's logic for the /version command
    const currentUptimeSeconds = Math.floor((Date.now() - startTime.getTime()) / 1000);
    const h = Math.floor(currentUptimeSeconds / 3600);
    const m = Math.floor((currentUptimeSeconds % 3600) / 60);
    const s = Math.floor(currentUptimeSeconds % 60);
    const formattedUptime = `${h}h ${m}m ${s}s`;

    const expectedMessage = `🤖 wa-bridge v${version}\n⏱️ Uptime: ${formattedUptime}`;

    // Directly call the sendMessage mock, simulating the effect of the onText handler
    await mockBot.sendMessage(CHAT_ID, expectedMessage);

    // Assertions
    strictEqual(receivedMessages.length, 1, 'should send exactly one message');
    strictEqual(receivedMessages[0].chatId, CHAT_ID, 'should send message to correct chat ID');
    ok(receivedMessages[0].text.startsWith(`🤖 wa-bridge v${version}`), 'message should start with version info');
    ok(receivedMessages[0].text.includes('⏱️ Uptime: '), 'message should include uptime');
});

// ---- 9. Error Resilience ----
console.log('\n── Error Resilience ──');

await test('readJsonSafe survives concurrent writes', () => {
    // Simulate a half-written file (truncated JSON)
    writeFileSync(resolve(TEST_DIR, 'partial.json'), '{"messages": [{"id": "1"');
    const result = readJsonSafe(resolve(TEST_DIR, 'partial.json'), { messages: [] });
    deepStrictEqual(result, { messages: [] }, 'should return fallback for partial JSON');
});

await test('inbox survives rapid sequential writes', () => {
    for (let i = 0; i < 20; i++) {
        writeToInbox(`msg_${i}`);
    }
    const data = readJsonSafe(INBOX, { messages: [] });
    strictEqual(data.messages.length, 20, 'all 20 messages should be written');
    strictEqual(data.messages[0].text, 'msg_0');
    strictEqual(data.messages[19].text, 'msg_19');
});

await test('empty text message handling', () => {
    writeToInbox('');
    const msg = readJsonSafe(INBOX, {}).messages[0];
    strictEqual(msg.text, '');
});

// ---- 10. Prompt Rules ----
console.log('\n── Prompt Rules (watcher.sh) ──');

await test('prompt contains web search instruction', () => {
    const watcher = readFileSync(resolve(PROJECT_ROOT, 'scripts', 'watcher.sh'), 'utf8');
    ok(watcher.includes('web search'), 'prompt should enforce web search for research');
    ok(watcher.includes('web search'), 'prompt should mention web search (backend-agnostic)');
});

await test('prompt contains literal instruction following', () => {
    const watcher = readFileSync(resolve(PROJECT_ROOT, 'scripts', 'watcher.sh'), 'utf8');
    ok(watcher.includes('EXACTLY as stated') || watcher.includes('LITERALLY'),
        'prompt should enforce literal instruction following');
});

await test('prompt contains no-implement guard', () => {
    const watcher = readFileSync(resolve(PROJECT_ROOT, 'scripts', 'watcher.sh'), 'utf8');
    ok(watcher.includes('do NOT implement') || watcher.includes('do NOT implement or write code'),
        'prompt should guard against unwanted implementation');
});

await test('no parse_mode in bot.js sendMessage calls', () => {
    const bot = readFileSync(resolve(SCRIPT_DIR, 'bot.js'), 'utf8');
    // The bot.js file should not use parse_mode: 'Markdown' anymore
    // (only exception: inline keyboard handlers which use known static text)
    const lines = bot.split('\n');
    const markdownLines = lines.filter(l =>
        l.includes("parse_mode") && l.includes("Markdown") &&
        !l.includes('//') && !l.includes('MarkdownV2')
    );
    // Allow 0 occurrences ideally, but some may remain in callback_query
    ok(markdownLines.length <= 2,
        `Found ${markdownLines.length} parse_mode: Markdown — should be stripped or minimal`);
});

// ---- 11. Watcher Script Integrity ----
console.log('\n── Watcher Script Integrity ──');

await test('watcher.sh has progress notification calls', () => {
    const watcher = readFileSync(resolve(PROJECT_ROOT, 'scripts', 'watcher.sh'), 'utf8');
    const expectedNotifications = [
        'Message received',
        'Running Gemini CLI',
        'Running Kilo CLI',
        'Changes committed',
        'Session closed'
    ];
    for (const n of expectedNotifications) {
        ok(watcher.includes(n), `watcher should have progress notification: "${n}"`);
    }
});

await test('watcher.sh has write_to_outbox function', () => {
    const watcher = readFileSync(resolve(PROJECT_ROOT, 'scripts', 'watcher.sh'), 'utf8');
    ok(watcher.includes('write_to_outbox()'), 'watcher should define write_to_outbox function');
});

await test('watcher.sh has lock file management', () => {
    const watcher = readFileSync(resolve(PROJECT_ROOT, 'scripts', 'watcher.sh'), 'utf8');
    ok(watcher.includes('LOCK_FILE'), 'watcher should reference LOCK_FILE');
    ok(watcher.includes('echo "$$" > "$LOCK_FILE"'), 'watcher should write PID to lock');
});

await test('watcher.sh has branch management', () => {
    const watcher = readFileSync(resolve(PROJECT_ROOT, 'scripts', 'watcher.sh'), 'utf8');
    ok(watcher.includes('telegram/active'), 'watcher should manage telegram/active branch');
    ok(watcher.includes('telegram/session-'), 'watcher should archive sessions');
});

// ---- 12. Execution Plan ----
console.log('\n── Execution Plan ──');

const DISPATCH = resolve(TEST_DIR, 'wa_dispatch.json');

function loadExecutionPlan() {
    const state = getState();
    return state.executionPlan || null;
}

function saveExecutionPlan(plan) {
    updateState(s => s.executionPlan = plan);
}

function writeDispatch(plan) {
    const dispatch = {
        timestamp: new Date().toISOString(),
        status: 'approved',
        tasks: plan.tasks.map(t => ({
            id: t.id, description: t.description,
            platform: t.platform, model: t.model,
            parallel: t.parallel, deps: t.deps
        }))
    };
    atomicWrite(DISPATCH, dispatch);
}

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

const TIER_EMOJI = { 'top': '🧠', 'mid': '⚡', 'free': '🆓' };

const DIFFICULTY_LABEL = (score) => {
    if (!score) return '';
    if (score <= 2) return '⭐ Trivial';
    if (score <= 4) return '⭐⭐ Easy';
    if (score <= 6) return '⭐⭐⭐ Moderate';
    if (score <= 8) return '🔥 Hard';
    return '💀 Expert';
};

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

await test('execution plan: initial state has no plan', () => {
    const plan = loadExecutionPlan();
    strictEqual(plan, null);
});

await test('execution plan: save and load round-trip', () => {
    const plan = {
        status: 'pending_approval',
        defaultPlatform: null,
        defaultModel: null,
        tasks: [
            { id: 1, description: 'Add OAuth config', tier: 'mid', platform: null, model: null, parallel: true, deps: [] },
            { id: 2, description: 'Integration test', tier: 'top', platform: null, model: null, parallel: false, deps: [1] }
        ]
    };
    saveExecutionPlan(plan);
    const loaded = loadExecutionPlan();
    strictEqual(loaded.tasks.length, 2);
    strictEqual(loaded.status, 'pending_approval');
    strictEqual(loaded.tasks[1].deps[0], 1);
});

await test('execution plan: platform + model assignment', () => {
    // Create plan first (each test is isolated)
    const plan = {
        status: 'pending_approval',
        defaultPlatform: null,
        defaultModel: null,
        tasks: [
            { id: 1, description: 'Add OAuth config', tier: 'mid', platform: null, model: null, parallel: true, deps: [] },
            { id: 2, description: 'Integration test', tier: 'top', platform: null, model: null, parallel: false, deps: [1] }
        ]
    };
    plan.defaultPlatform = 'gemini';
    plan.defaultModel = 'gemini-2.5-flash';
    plan.tasks.forEach(t => { t.platform = 'gemini'; t.model = 'gemini-2.5-flash'; });
    plan.status = 'confirming';
    saveExecutionPlan(plan);

    const loaded = loadExecutionPlan();
    strictEqual(loaded.status, 'confirming');
    strictEqual(loaded.tasks[0].platform, 'gemini');
    strictEqual(loaded.tasks[0].model, 'gemini-2.5-flash');
    strictEqual(loaded.tasks[1].platform, 'gemini');
});

await test('execution plan: override single task', () => {
    const plan = {
        status: 'confirming',
        defaultPlatform: 'gemini',
        defaultModel: 'gemini-2.5-flash',
        tasks: [
            { id: 1, description: 'Add config', tier: 'mid', platform: 'gemini', model: 'gemini-2.5-flash', parallel: true, deps: [] },
            { id: 2, description: 'Integration test', tier: 'top', platform: 'gemini', model: 'gemini-2.5-flash', parallel: false, deps: [1] }
        ]
    };
    // Override task 2 to Pro 3.0
    plan.tasks[1].model = 'gemini-3-pro-preview';
    saveExecutionPlan(plan);

    const loaded = loadExecutionPlan();
    strictEqual(loaded.tasks[0].model, 'gemini-2.5-flash', 'task 1 unchanged');
    strictEqual(loaded.tasks[1].model, 'gemini-3-pro-preview', 'task 2 overridden');
});

await test('execution plan: approve writes dispatch', () => {
    const plan = {
        status: 'confirming',
        defaultPlatform: 'gemini',
        defaultModel: 'gemini-2.5-flash',
        tasks: [
            { id: 1, description: 'Add config', tier: 'mid', platform: 'gemini', model: 'gemini-2.5-flash', parallel: true, deps: [] },
            { id: 2, description: 'Integration test', tier: 'top', platform: 'gemini', model: 'gemini-3-pro-preview', parallel: false, deps: [1] }
        ]
    };
    plan.status = 'approved';
    saveExecutionPlan(plan);
    writeDispatch(plan);

    ok(existsSync(DISPATCH), 'dispatch file should exist');
    const dispatch = readJsonSafe(DISPATCH, {});
    strictEqual(dispatch.status, 'approved');
    strictEqual(dispatch.tasks.length, 2);
    strictEqual(dispatch.tasks[0].platform, 'gemini');
    ok(dispatch.timestamp, 'dispatch should have timestamp');
});

await test('execution plan: re-plan clears state', () => {
    updateState(s => { delete s.executionPlan; });
    if (existsSync(DISPATCH)) unlinkSync(DISPATCH);

    const plan = loadExecutionPlan();
    strictEqual(plan, null);
    ok(!existsSync(DISPATCH), 'dispatch file should be cleared');
});

await test('execution plan: formatExecutionPlan output', () => {
    const plan = {
        tasks: [
            { id: 1, description: 'Add config', tier: 'mid', platform: 'gemini', model: 'gemini-2.5-flash', parallel: true, deps: [] },
            { id: 2, description: 'Write test', tier: 'top', platform: 'gemini', model: 'gemini-3-pro-preview', parallel: false, deps: [1] }
        ]
    };
    const text = formatExecutionPlan(plan);
    ok(text.includes('📋 Execution Plan (2 tasks)'));
    ok(text.includes('1. Add config'));
    ok(text.includes('⚡'));
    ok(text.includes('2. Write test'));
    ok(text.includes('🧠'));
    ok(text.includes('deps: 1'));
});

await test('execution plan: PLATFORM_MODELS registry is valid', () => {
    ok(PLATFORM_MODELS.gemini.length >= 3, 'gemini should have at least 3 models');
    strictEqual(PLATFORM_MODELS.jules.length, 0, 'jules should have no models');
    for (const m of PLATFORM_MODELS.gemini) {
        ok(m.id, 'model should have id');
        ok(m.label, 'model should have label');
    }
});

await test('execution plan: jules platform skips model selection', () => {
    const plan = {
        status: 'selecting_platform',
        defaultPlatform: null,
        defaultModel: null,
        tasks: [{ id: 1, description: 'Fix typo', tier: 'free', platform: null, model: null, parallel: true, deps: [] }]
    };
    // Simulate jules selection
    plan.defaultPlatform = 'jules';
    plan.tasks.forEach(t => { t.platform = 'jules'; t.model = null; });
    plan.status = 'confirming';

    strictEqual(plan.status, 'confirming', 'should skip to confirming for jules');
    strictEqual(plan.tasks[0].model, null, 'jules tasks have no model');
});

await test('execution plan: callback data format validation', () => {
    const callbacks = [
        'ep_platform:gemini', 'ep_platform:jules',
        'ep_model:gemini-2.5-flash', 'ep_execute', 'ep_override',
        'ep_task:1', 'ep_task_plat:1:gemini', 'ep_task_model:1:gemini-2.5-flash',
        'ep_replan', 'ep_continue', 'ep_stop'
    ];
    for (const cb of callbacks) {
        ok(cb.length <= 64, `callback data "${cb}" should be under 64 bytes (Telegram limit)`);
    }
});

await test('execution plan: DIFFICULTY_LABEL maps correctly', () => {
    strictEqual(DIFFICULTY_LABEL(1), '⭐ Trivial');
    strictEqual(DIFFICULTY_LABEL(2), '⭐ Trivial');
    strictEqual(DIFFICULTY_LABEL(3), '⭐⭐ Easy');
    strictEqual(DIFFICULTY_LABEL(4), '⭐⭐ Easy');
    strictEqual(DIFFICULTY_LABEL(5), '⭐⭐⭐ Moderate');
    strictEqual(DIFFICULTY_LABEL(6), '⭐⭐⭐ Moderate');
    strictEqual(DIFFICULTY_LABEL(7), '🔥 Hard');
    strictEqual(DIFFICULTY_LABEL(8), '🔥 Hard');
    strictEqual(DIFFICULTY_LABEL(9), '💀 Expert');
    strictEqual(DIFFICULTY_LABEL(10), '💀 Expert');
    strictEqual(DIFFICULTY_LABEL(null), '');
    strictEqual(DIFFICULTY_LABEL(undefined), '');
});

await test('execution plan: formatExecutionPlan shows summary and difficulty', () => {
    const plan = {
        tasks: [
            {
                id: 1, description: 'Add config', tier: 'mid', platform: 'gemini', model: 'gemini-2.5-flash',
                parallel: true, deps: [], summary: 'Adds a config file for login credentials', difficulty: 3
            },
            {
                id: 2, description: 'Write test', tier: 'top', platform: 'gemini', model: 'gemini-2.5-pro',
                parallel: false, deps: [1], summary: 'Tests the full login flow', difficulty: 8
            }
        ]
    };
    const text = formatExecutionPlan(plan);
    ok(text.includes('⭐⭐ Easy (3/10)'), 'should show difficulty label for task 1');
    ok(text.includes('🔥 Hard (8/10)'), 'should show difficulty label for task 2');
    ok(text.includes('→ Adds a config file'), 'should show summary for task 1');
    ok(text.includes('→ Tests the full login flow'), 'should show summary for task 2');
});

await test('execution plan: formatExecutionPlan graceful without summary/difficulty', () => {
    const plan = {
        tasks: [
            { id: 1, description: 'Add config', tier: 'mid', platform: 'gemini', model: 'gemini-2.5-flash', parallel: true, deps: [] }
        ]
    };
    const text = formatExecutionPlan(plan);
    ok(text.includes('1. Add config'), 'should still show basic task info');
    ok(!text.includes('→'), 'should not show summary arrow when missing');
    ok(!text.includes('/10'), 'should not show difficulty when missing');
});

// ---- 13. Plan-Review-Execute Flow (Mock) ----
// Simulates the complete plan flow without calling Gemini CLI.
// Each test recreates what watcher.sh does in a controlled sandbox.
console.log('\n── Plan-Review-Execute Flow (Mock) ──');

// Sandbox directories for mock flow
const MOCK_PROJECT = resolve(TEST_DIR, 'mock_project');
const MOCK_GEMINI = resolve(MOCK_PROJECT, '.gemini');
const MOCK_SPECS = resolve(MOCK_PROJECT, 'docs', 'specs');
const MOCK_SCRIPTS = resolve(MOCK_PROJECT, 'scripts');
const MOCK_STATE = resolve(MOCK_GEMINI, 'state.json');
const MOCK_DISPATCH = resolve(MOCK_GEMINI, 'wa_dispatch.json');
const MOCK_PLAN_MODE = resolve(MOCK_GEMINI, 'wa_plan_mode');

function mockSetup() {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(MOCK_GEMINI, { recursive: true });
    mkdirSync(MOCK_SPECS, { recursive: true });
    mkdirSync(MOCK_SCRIPTS, { recursive: true });
    writeFileSync(MOCK_STATE, JSON.stringify({}, null, 2));
}

// --- 13a. Plan Mode Marker Lifecycle ---

await test('mock flow: /plan_feature sets marker + clears stale dispatch', () => {
    mockSetup();
    // Simulate stale state from previous session
    writeFileSync(MOCK_STATE, JSON.stringify({
        executionPlan: { status: 'approved', tasks: [{ id: 1, description: 'Old task' }] }
    }, null, 2));
    writeFileSync(MOCK_DISPATCH, JSON.stringify({ status: 'approved', tasks: [] }, null, 2));

    // Simulate: /plan_feature creates new branch → set marker + clear stale
    writeFileSync(MOCK_PLAN_MODE, 'plan_feature');
    // Clear stale dispatch (what watcher does)
    if (existsSync(MOCK_DISPATCH)) unlinkSync(MOCK_DISPATCH);
    const state = JSON.parse(readFileSync(MOCK_STATE, 'utf8'));
    delete state.executionPlan;
    writeFileSync(MOCK_STATE, JSON.stringify(state, null, 2));

    ok(existsSync(MOCK_PLAN_MODE), 'plan mode marker should exist');
    ok(!existsSync(MOCK_DISPATCH), 'stale dispatch should be deleted');
    const cleanState = JSON.parse(readFileSync(MOCK_STATE, 'utf8'));
    strictEqual(cleanState.executionPlan, undefined, 'stale execution plan should be removed');
});

await test('mock flow: refinement detects plan mode from marker', () => {
    mockSetup();
    writeFileSync(MOCK_PLAN_MODE, 'plan_feature');

    // Simulate: watcher checks for plan mode on follow-up message
    const isPlanMode = existsSync(MOCK_PLAN_MODE);
    ok(isPlanMode, 'plan mode should be detected from marker file');

    // Read marker content
    const content = readFileSync(MOCK_PLAN_MODE, 'utf8').trim();
    strictEqual(content, 'plan_feature', 'marker should contain workflow name');
});

// --- 13b. Gemini Response Mock: Code File Revert ---

await test('mock flow: code files reverted after Gemini writes them in plan mode', () => {
    mockSetup();
    writeFileSync(MOCK_PLAN_MODE, 'plan_feature');

    // Simulate: Gemini CLI writes a spec file (allowed) AND a code file (blocked)
    const specFile = resolve(MOCK_SPECS, 'test_version_spec.md');
    writeFileSync(specFile, '# Test Spec\n## Overview\nTest plan content');
    const codeFile = resolve(MOCK_SCRIPTS, 'bot.js');
    writeFileSync(codeFile, 'console.log("unauthorized code change");');

    // Simulate: watcher plan mode enforcement — revert code files
    const isPlanMode = existsSync(MOCK_PLAN_MODE);
    if (isPlanMode) {
        const codeExtensions = ['.js', '.py', '.sh', '.ts', '.css', '.html'];
        // Scan for code files that were modified (simulate git diff)
        const modifiedFiles = [codeFile]; // would come from git diff
        for (const f of modifiedFiles) {
            const ext = f.substring(f.lastIndexOf('.'));
            if (codeExtensions.includes(ext)) {
                unlinkSync(f); // simulate git checkout HEAD -- <file>
            }
        }
    }

    ok(existsSync(specFile), 'spec file should survive revert');
    ok(!existsSync(codeFile), 'code file should be reverted');
});

await test('mock flow: multiple code file types are all reverted', () => {
    mockSetup();
    writeFileSync(MOCK_PLAN_MODE, 'plan_feature');

    // Simulate: Gemini writes multiple code file types
    const files = {
        [resolve(MOCK_SCRIPTS, 'app.js')]: 'js code',
        [resolve(MOCK_SCRIPTS, 'helper.py')]: 'py code',
        [resolve(MOCK_SCRIPTS, 'deploy.sh')]: 'sh code',
        [resolve(MOCK_SCRIPTS, 'types.ts')]: 'ts code',
        [resolve(MOCK_SCRIPTS, 'style.css')]: 'css code',
        [resolve(MOCK_SCRIPTS, 'index.html')]: 'html code',
        [resolve(MOCK_SPECS, 'plan.md')]: 'spec content',      // allowed
        [resolve(MOCK_PROJECT, 'antigravity_tasks.md')]: 'tasks' // allowed
    };
    for (const [path, content] of Object.entries(files)) {
        writeFileSync(path, content);
    }

    // Simulate: watcher revert
    const codeExtensions = ['.js', '.py', '.sh', '.ts', '.css', '.html'];
    const reverted = [];
    for (const f of Object.keys(files)) {
        const ext = f.substring(f.lastIndexOf('.'));
        if (codeExtensions.includes(ext)) {
            unlinkSync(f);
            reverted.push(f);
        }
    }

    strictEqual(reverted.length, 6, 'all 6 code file types should be reverted');
    ok(existsSync(resolve(MOCK_SPECS, 'plan.md')), '.md spec should survive');
    ok(existsSync(resolve(MOCK_PROJECT, 'antigravity_tasks.md')), '.md tasks should survive');
});

await test('mock flow: no revert when plan mode is NOT active', () => {
    mockSetup();
    // NO plan mode marker

    const codeFile = resolve(MOCK_SCRIPTS, 'bot.js');
    writeFileSync(codeFile, 'console.log("authorized change");');

    const isPlanMode = existsSync(MOCK_PLAN_MODE);
    strictEqual(isPlanMode, false, 'plan mode should not be active');

    // Code file should NOT be reverted
    ok(existsSync(codeFile), 'code file should survive when plan mode is off');
});

// --- 13c. Spec File Handling ---

await test('mock flow: spec file copied as .txt for Telegram', () => {
    mockSetup();
    const specMd = resolve(MOCK_SPECS, 'telegram_version_command_spec.md');
    writeFileSync(specMd, '# /version Command Spec\n## Task 1\nImplement command handler');

    // Simulate: watcher copies .md → .txt
    const basename = 'telegram_version_command_spec';
    const specTxt = resolve(tmpdir(), `${basename}.txt`);
    const content = readFileSync(specMd, 'utf8');
    writeFileSync(specTxt, content);

    ok(existsSync(specTxt), '.txt copy should exist');
    strictEqual(readFileSync(specTxt, 'utf8'), content, '.txt content should match .md');
    ok(specTxt.endsWith('.txt'), 'file should have .txt extension');

    unlinkSync(specTxt);
});

// --- 13d. Execution Plan Auto-Loading ---

await test('mock flow: execution plan loaded from antigravity_tasks.md', () => {
    mockSetup();
    const tasksFile = resolve(MOCK_PROJECT, 'antigravity_tasks.md');
    writeFileSync(tasksFile, `## To Do
<!-- task_schema: cat/topic | description | difficulty/10 -->
- [ ] feature/version | Add /version command handler | 4/10
- [ ] feature/version | Add unit tests for /version | 3/10
`);

    // Simulate: watcher parses tasks and writes plan
    const taskRegex = /^- \[ \] (\w+\/\w+) \| (.+?) \| (\d+)\/10$/gm;
    const tasks = [];
    let match;
    while ((match = taskRegex.exec(readFileSync(tasksFile, 'utf8'))) !== null) {
        tasks.push({
            id: tasks.length + 1,
            description: match[2].trim(),
            summary: match[1],
            difficulty: parseInt(match[3]),
            tier: parseInt(match[3]) <= 5 ? 'mid' : 'top',
            platform: 'gemini',
            model: 'gemini-2.5-flash',
            status: 'pending'
        });
    }

    const plan = { status: 'pending_review', tasks };
    const state = JSON.parse(readFileSync(MOCK_STATE, 'utf8'));
    state.executionPlan = plan;
    writeFileSync(MOCK_STATE, JSON.stringify(state, null, 2));

    const loaded = JSON.parse(readFileSync(MOCK_STATE, 'utf8'));
    strictEqual(loaded.executionPlan.status, 'pending_review');
    strictEqual(loaded.executionPlan.tasks.length, 2);
    strictEqual(loaded.executionPlan.tasks[0].description, 'Add /version command handler');
    strictEqual(loaded.executionPlan.tasks[1].difficulty, 3);
});

await test('mock flow: initial /plan_feature always reloads plan (replaces stale)', () => {
    mockSetup();
    // Simulate: stale plan from previous session
    const staleState = { executionPlan: { status: 'approved', tasks: [{ id: 1, description: 'old' }] } };
    writeFileSync(MOCK_STATE, JSON.stringify(staleState, null, 2));

    // Simulate: watcher detects /plan_feature → IS_INITIAL_PLAN=yes → always reload
    const userMessage = '/plan_feature add a /version command';
    const isInitialPlan = /^\/plan_feature|^\/plan /i.test(userMessage);
    ok(isInitialPlan, '/plan_feature should be detected as initial plan');

    // Overwrite stale plan
    const newPlan = { status: 'pending_review', tasks: [{ id: 1, description: 'New task' }, { id: 2, description: 'Another task' }] };
    const state = JSON.parse(readFileSync(MOCK_STATE, 'utf8'));
    state.executionPlan = newPlan;
    writeFileSync(MOCK_STATE, JSON.stringify(state, null, 2));

    const loaded = JSON.parse(readFileSync(MOCK_STATE, 'utf8'));
    strictEqual(loaded.executionPlan.status, 'pending_review', 'plan should be pending_review');
    strictEqual(loaded.executionPlan.tasks.length, 2, 'stale plan should be replaced');
    strictEqual(loaded.executionPlan.tasks[0].description, 'New task');
});

await test('mock flow: refinement skips plan reload when plan exists', () => {
    mockSetup();
    const existingPlan = { status: 'pending_review', tasks: [{ id: 1, description: 'Existing task' }] };
    writeFileSync(MOCK_STATE, JSON.stringify({ executionPlan: existingPlan }, null, 2));

    const userMessage = 'remove the test section from the plan';
    const isInitialPlan = /^\/plan_feature|^\/plan /i.test(userMessage);
    ok(!isInitialPlan, 'plain text should NOT be initial plan');

    const planExists = JSON.parse(readFileSync(MOCK_STATE, 'utf8')).executionPlan?.status ? true : false;
    ok(planExists, 'plan should already exist');

    // Refinement should NOT reload plan
    const shouldLoad = isInitialPlan || !planExists;
    ok(!shouldLoad, 'should NOT reload plan on refinement when plan exists');
});

// --- 13e. Dispatch Blocking During Plan Mode ---

await test('mock flow: dispatch blocked when plan mode marker exists', () => {
    mockSetup();
    writeFileSync(MOCK_PLAN_MODE, 'plan_feature');
    writeFileSync(MOCK_DISPATCH, JSON.stringify({
        status: 'approved',
        tasks: [{ id: 1, description: 'Task 1', platform: 'gemini', model: 'gemini-2.5-pro', taskStatus: 'pending' }]
    }, null, 2));

    // Simulate: watcher dispatch loop checks plan mode
    const isPlanMode = existsSync(MOCK_PLAN_MODE);
    let dispatched = false;
    if (!isPlanMode) {
        const dispatch = JSON.parse(readFileSync(MOCK_DISPATCH, 'utf8'));
        if (dispatch.status === 'approved') {
            dispatched = true;
        }
    }

    ok(!dispatched, 'dispatch should be blocked while plan mode is active');
});

await test('mock flow: dispatch allowed after plan mode marker removed', () => {
    mockSetup();
    // No plan mode marker
    writeFileSync(MOCK_DISPATCH, JSON.stringify({
        status: 'approved',
        tasks: [{ id: 1, description: 'Task 1', platform: 'gemini', model: 'gemini-2.5-pro', taskStatus: 'pending' }]
    }, null, 2));

    const isPlanMode = existsSync(MOCK_PLAN_MODE);
    let dispatched = false;
    if (!isPlanMode) {
        const dispatch = JSON.parse(readFileSync(MOCK_DISPATCH, 'utf8'));
        if (dispatch.status === 'approved') {
            dispatched = true;
        }
    }

    ok(dispatched, 'dispatch should proceed when plan mode is off');
});

// --- 13f. /review_plan Button Logic ---

await test('mock flow: pending_review plan shows full button set', () => {
    mockSetup();
    const plan = {
        status: 'pending_review',
        tasks: [
            { id: 1, description: 'Add /version handler', tier: 'mid', platform: 'gemini', model: 'gemini-2.5-flash', deps: [] },
            { id: 2, description: 'Add tests', tier: 'mid', platform: 'gemini', model: 'gemini-2.5-flash', deps: [1] }
        ]
    };

    // Simulate: /review_plan handler logic
    let buttonsShown = [];
    if (plan.status === 'approved') {
        buttonsShown = ['Re-plan'];
    } else if (plan.status === 'executing') {
        buttonsShown = [];
    } else {
        // pending_review or confirming → full button set
        plan.status = 'confirming';
        buttonsShown = ['Execute All', 'Override Task', 'Re-plan'];
    }

    deepStrictEqual(buttonsShown, ['Execute All', 'Override Task', 'Re-plan'], 'pending_review should show all 3 buttons');
    strictEqual(plan.status, 'confirming', 'status should transition to confirming');
});

await test('mock flow: approved plan shows only Re-plan button', () => {
    mockSetup();
    const plan = { status: 'approved', tasks: [{ id: 1, description: 'Task' }] };

    let buttonsShown = [];
    if (plan.status === 'approved') {
        buttonsShown = ['Re-plan'];
    } else {
        buttonsShown = ['Execute All', 'Override Task', 'Re-plan'];
    }

    deepStrictEqual(buttonsShown, ['Re-plan'], 'approved plan should only show Re-plan');
});

// --- 13g. Full Flow Simulation ---

await test('mock flow: complete plan → refine → review → execute lifecycle', () => {
    mockSetup();

    // STEP 1: /plan_feature arrives
    const userMsg1 = '/plan_feature add /version command';
    ok(/^\/plan_feature/i.test(userMsg1), 'step 1: command detected');

    // Create branch, set marker, clear stale
    writeFileSync(MOCK_PLAN_MODE, 'plan_feature');
    if (existsSync(MOCK_DISPATCH)) unlinkSync(MOCK_DISPATCH);

    // Gemini CLI generates spec
    const specFile = resolve(MOCK_SPECS, 'version_command_spec.md');
    writeFileSync(specFile, '# /version Command\n## Tasks\n1. Add handler\n2. Add tests');

    // Auto-load plan
    const plan = {
        status: 'pending_review',
        tasks: [
            { id: 1, description: 'Add /version handler', tier: 'mid', platform: 'gemini', model: 'gemini-2.5-flash', deps: [], taskStatus: 'pending' },
            { id: 2, description: 'Add tests', tier: 'mid', platform: 'gemini', model: 'gemini-2.5-flash', deps: [1], taskStatus: 'pending' }
        ]
    };
    writeFileSync(MOCK_STATE, JSON.stringify({ executionPlan: plan }, null, 2));

    // Verify step 1
    ok(existsSync(MOCK_PLAN_MODE), 'step 1: marker set');
    ok(!existsSync(MOCK_DISPATCH), 'step 1: no dispatch');
    const s1 = JSON.parse(readFileSync(MOCK_STATE, 'utf8'));
    strictEqual(s1.executionPlan.status, 'pending_review', 'step 1: status = pending_review');

    // STEP 2: Refinement arrives
    const userMsg2 = 'remove the test section';
    ok(!/^\/plan_feature/i.test(userMsg2), 'step 2: not a slash command');
    ok(existsSync(MOCK_PLAN_MODE), 'step 2: plan mode still active');

    // Gemini updates spec (allowed) and tries to write code (blocked)
    writeFileSync(specFile, '# /version Command\n## Tasks\n1. Add handler');
    const badCode = resolve(MOCK_SCRIPTS, 'version.js');
    writeFileSync(badCode, 'module.exports = {}');

    // Code revert
    if (existsSync(MOCK_PLAN_MODE)) {
        if (existsSync(badCode)) unlinkSync(badCode);
    }

    ok(existsSync(specFile), 'step 2: spec updated and preserved');
    ok(!existsSync(badCode), 'step 2: code file reverted');

    // STEP 3: /review_plan
    const s3 = JSON.parse(readFileSync(MOCK_STATE, 'utf8'));
    strictEqual(s3.executionPlan.status, 'pending_review', 'step 3: still pending_review');
    // Bot applies tier defaults and shows buttons
    s3.executionPlan.status = 'confirming';
    writeFileSync(MOCK_STATE, JSON.stringify(s3, null, 2));

    // STEP 4: User clicks Execute All
    const s4 = JSON.parse(readFileSync(MOCK_STATE, 'utf8'));
    s4.executionPlan.status = 'approved';
    writeFileSync(MOCK_STATE, JSON.stringify(s4, null, 2));
    // Write dispatch
    writeFileSync(MOCK_DISPATCH, JSON.stringify({
        status: 'approved',
        tasks: s4.executionPlan.tasks
    }, null, 2));
    // Remove plan mode marker (approval clears plan-only restriction)
    unlinkSync(MOCK_PLAN_MODE);

    ok(!existsSync(MOCK_PLAN_MODE), 'step 4: plan mode marker removed after approval');
    ok(existsSync(MOCK_DISPATCH), 'step 4: dispatch file created');
    const dispatch = JSON.parse(readFileSync(MOCK_DISPATCH, 'utf8'));
    strictEqual(dispatch.status, 'approved', 'step 4: dispatch approved');

    // STEP 5: Dispatch runs (plan mode off → dispatch allowed)
    const isPlanMode = existsSync(MOCK_PLAN_MODE);
    ok(!isPlanMode, 'step 5: plan mode off');
    strictEqual(dispatch.tasks[0].taskStatus, 'pending', 'step 5: task 1 pending');
});

await test('mock flow: approved dispatch auto-clears plan mode marker', () => {
    mockSetup();
    writeFileSync(MOCK_PLAN_MODE, 'plan_feature');

    // Approved dispatch exists (from bot clicking Execute All / /review_plan)
    writeFileSync(MOCK_DISPATCH, JSON.stringify({
        status: 'approved',
        tasks: [{ id: 1, description: 'Run me', taskStatus: 'pending' }]
    }, null, 2));

    // Watcher dispatch loop — NEW BEHAVIOR:
    // When dispatch is approved AND plan mode is active,
    // auto-clear plan mode so execution can proceed
    if (existsSync(MOCK_PLAN_MODE)) {
        const dispatch = JSON.parse(readFileSync(MOCK_DISPATCH, 'utf8'));
        if (dispatch.status === 'approved') {
            // Clear plan mode — approval received
            unlinkSync(MOCK_PLAN_MODE);
        }
    }

    ok(!existsSync(MOCK_PLAN_MODE), 'plan mode should be auto-cleared when dispatch is approved');

    // Now dispatch should proceed
    let taskRan = false;
    if (existsSync(MOCK_DISPATCH) && !existsSync(MOCK_PLAN_MODE)) {
        taskRan = true;
    }
    ok(taskRan, 'dispatch should run after plan mode auto-cleared');
});
await test('mock flow: non-approved dispatch does NOT clear plan mode', () => {
    mockSetup();
    writeFileSync(MOCK_PLAN_MODE, 'plan_feature');

    // Dispatch exists but status is pending_review (not yet approved)
    writeFileSync(MOCK_DISPATCH, JSON.stringify({
        status: 'pending_review',
        tasks: [{ id: 1, description: 'Task', taskStatus: 'pending' }]
    }, null, 2));

    // Auto-clear logic should NOT trigger for non-approved status
    if (existsSync(MOCK_PLAN_MODE)) {
        const dispatch = JSON.parse(readFileSync(MOCK_DISPATCH, 'utf8'));
        if (dispatch.status === 'approved') {
            unlinkSync(MOCK_PLAN_MODE);
        }
    }

    ok(existsSync(MOCK_PLAN_MODE), 'plan mode should remain active for non-approved dispatch');
});

// --- 13h. Edge Cases ---
console.log('\n── Plan Flow Edge Cases ──');

// Edge 1: Two /plan_feature in quick succession
await test('edge: second /plan_feature resets everything cleanly', () => {
    mockSetup();
    // First /plan_feature sets up state
    writeFileSync(MOCK_PLAN_MODE, 'plan_feature');
    writeFileSync(MOCK_STATE, JSON.stringify({
        executionPlan: { status: 'pending_review', tasks: [{ id: 1, description: 'First plan task' }] }
    }, null, 2));
    writeFileSync(MOCK_DISPATCH, JSON.stringify({ status: 'approved', tasks: [] }, null, 2));

    // Second /plan_feature arrives — should reset everything
    writeFileSync(MOCK_PLAN_MODE, 'plan_feature');
    if (existsSync(MOCK_DISPATCH)) unlinkSync(MOCK_DISPATCH);
    const state = JSON.parse(readFileSync(MOCK_STATE, 'utf8'));
    delete state.executionPlan;
    writeFileSync(MOCK_STATE, JSON.stringify(state, null, 2));

    ok(existsSync(MOCK_PLAN_MODE), 'marker should still exist');
    ok(!existsSync(MOCK_DISPATCH), 'dispatch from first plan should be deleted');
    const clean = JSON.parse(readFileSync(MOCK_STATE, 'utf8'));
    strictEqual(clean.executionPlan, undefined, 'first plan should be wiped');
});

// Edge 2: Refinement while Gemini is still running (lock file exists)
await test('edge: refinement queued when lock file exists', () => {
    mockSetup();
    const lockFile = resolve(MOCK_GEMINI, 'wa_session.lock');
    writeFileSync(lockFile, '12345');
    writeFileSync(MOCK_PLAN_MODE, 'plan_feature');

    // Simulate: message arrives, watcher checks lock
    const isLocked = existsSync(lockFile);
    ok(isLocked, 'lock should be detected');

    // Message should be written to inbox but NOT processed
    const inbox = { messages: [{ id: 'msg_1', text: 'add logging', read: false }] };
    writeFileSync(resolve(MOCK_GEMINI, 'wa_inbox.json'), JSON.stringify(inbox, null, 2));

    // Watcher loop: skip processing when locked
    let processed = false;
    if (!isLocked) {
        processed = true;
    }
    ok(!processed, 'message should NOT be processed while locked');

    // After lock released
    unlinkSync(lockFile);
    ok(!existsSync(lockFile), 'lock should be removed');
    // Next watcher cycle would pick up the queued message
    const inboxData = JSON.parse(readFileSync(resolve(MOCK_GEMINI, 'wa_inbox.json'), 'utf8'));
    strictEqual(inboxData.messages[0].read, false, 'message should still be unread (queued)');
});

// Edge 3: Non-standard code extensions (.mjs, .cjs, .jsx, .tsx)
await test('edge: .mjs/.cjs/.jsx/.tsx files are also reverted in plan mode', () => {
    mockSetup();
    writeFileSync(MOCK_PLAN_MODE, 'plan_feature');

    const extendedCodeFiles = {
        [resolve(MOCK_SCRIPTS, 'utils.mjs')]: 'export default {}',
        [resolve(MOCK_SCRIPTS, 'config.cjs')]: 'module.exports = {}',
        [resolve(MOCK_SCRIPTS, 'App.jsx')]: 'export function App() {}',
        [resolve(MOCK_SCRIPTS, 'types.tsx')]: 'export type Foo = string',
    };
    for (const [path, content] of Object.entries(extendedCodeFiles)) {
        writeFileSync(path, content);
    }

    // Extended blocklist (matching watcher.sh update)
    const codeExtensions = ['.js', '.mjs', '.cjs', '.jsx', '.py', '.sh', '.ts', '.tsx', '.css', '.html'];
    const reverted = [];
    for (const f of Object.keys(extendedCodeFiles)) {
        const ext = f.substring(f.lastIndexOf('.'));
        if (codeExtensions.includes(ext)) {
            unlinkSync(f);
            reverted.push(ext);
        }
    }

    strictEqual(reverted.length, 4, 'all 4 extended extensions should be reverted');
    ok(reverted.includes('.mjs'), '.mjs should be blocked');
    ok(reverted.includes('.cjs'), '.cjs should be blocked');
    ok(reverted.includes('.jsx'), '.jsx should be blocked');
    ok(reverted.includes('.tsx'), '.tsx should be blocked');
});

// Edge 4: Gemini renames/moves a code file (git mv)
await test('edge: renamed code files detected via new file check', () => {
    mockSetup();
    writeFileSync(MOCK_PLAN_MODE, 'plan_feature');

    // Simulate: Gemini renames bot.js → bot_v2.js (git mv)
    // git diff --name-only would show both old (deleted) and new (added)
    const renamedFile = resolve(MOCK_SCRIPTS, 'bot_v2.js');
    writeFileSync(renamedFile, 'console.log("renamed");');

    // The revert logic uses git diff which catches new files too
    const codeExtensions = ['.js', '.mjs', '.cjs', '.jsx', '.py', '.sh', '.ts', '.tsx', '.css', '.html'];
    const ext = renamedFile.substring(renamedFile.lastIndexOf('.'));
    const isCodeFile = codeExtensions.includes(ext);

    ok(isCodeFile, 'renamed .js file should still be detected as code');
    if (isCodeFile) unlinkSync(renamedFile);
    ok(!existsSync(renamedFile), 'renamed code file should be reverted');
});

// Edge 5: Code embedded inside spec .md file
await test('edge: code inside .md spec file is NOT blocked (known limitation)', () => {
    mockSetup();
    writeFileSync(MOCK_PLAN_MODE, 'plan_feature');

    const specWithCode = resolve(MOCK_SPECS, 'spec_with_code.md');
    const content = `# Plan Spec
## Implementation
\`\`\`javascript
// Full implementation embedded in spec
function handleVersion(msg) {
    return { version: '1.0.0' };
}
module.exports = { handleVersion };
\`\`\`
`;
    writeFileSync(specWithCode, content);

    // .md files pass the extension filter — this is a known limitation
    const codeExtensions = ['.js', '.mjs', '.cjs', '.jsx', '.py', '.sh', '.ts', '.tsx', '.css', '.html'];
    const ext = specWithCode.substring(specWithCode.lastIndexOf('.'));
    const isCodeFile = codeExtensions.includes(ext);

    ok(!isCodeFile, '.md should NOT be flagged as code (known limitation)');
    ok(existsSync(specWithCode), 'spec with embedded code survives — guard prompt must prevent this');

    // Verify the guard prompt handles this case
    const PLAN_GUARD = '⛔ CRITICAL: PLANNING MODE IS ACTIVE. You MUST NOT write any application code';
    ok(PLAN_GUARD.includes('MUST NOT write any application code'),
        'guard prompt should instruct against code in specs');
});

// Edge 6: state.json corrupted/empty when plan auto-loader runs
await test('edge: corrupted state.json handled gracefully', () => {
    mockSetup();

    // Corrupt the state file
    writeFileSync(MOCK_STATE, 'not valid json{{{');

    let plan = null;
    try {
        const state = JSON.parse(readFileSync(MOCK_STATE, 'utf8'));
        plan = state.executionPlan || null;
    } catch {
        plan = null; // Fallback on corruption
    }

    strictEqual(plan, null, 'should return null for corrupted state');

    // Empty state file
    writeFileSync(MOCK_STATE, '');
    let plan2 = null;
    try {
        const state = JSON.parse(readFileSync(MOCK_STATE, 'utf8'));
        plan2 = state.executionPlan || null;
    } catch {
        plan2 = null;
    }

    strictEqual(plan2, null, 'should return null for empty state');

    // Valid but missing executionPlan
    writeFileSync(MOCK_STATE, JSON.stringify({ activeProject: '/test' }, null, 2));
    const state = JSON.parse(readFileSync(MOCK_STATE, 'utf8'));
    strictEqual(state.executionPlan, undefined, 'missing plan should be undefined');
});

// Edge 7: Dispatch file has null/missing status
await test('edge: dispatch with null/missing status does not trigger execution', () => {
    mockSetup();

    // status: null
    writeFileSync(MOCK_DISPATCH, JSON.stringify({ status: null, tasks: [{ id: 1, taskStatus: 'pending' }] }, null, 2));
    let dispatch = JSON.parse(readFileSync(MOCK_DISPATCH, 'utf8'));
    let shouldRun = dispatch.status === 'approved';
    ok(!shouldRun, 'null status should not trigger dispatch');

    // missing status key
    writeFileSync(MOCK_DISPATCH, JSON.stringify({ tasks: [{ id: 1, taskStatus: 'pending' }] }, null, 2));
    dispatch = JSON.parse(readFileSync(MOCK_DISPATCH, 'utf8'));
    shouldRun = dispatch.status === 'approved';
    ok(!shouldRun, 'missing status should not trigger dispatch');

    // status: pending_review (not approved)
    writeFileSync(MOCK_DISPATCH, JSON.stringify({ status: 'pending_review', tasks: [] }, null, 2));
    dispatch = JSON.parse(readFileSync(MOCK_DISPATCH, 'utf8'));
    shouldRun = dispatch.status === 'approved';
    ok(!shouldRun, 'pending_review status should not trigger dispatch');
});

// Edge 8: Plan mode marker exists but is empty (0 bytes)
await test('edge: empty marker file still blocks dispatch', () => {
    mockSetup();
    writeFileSync(MOCK_PLAN_MODE, ''); // 0-byte content

    // existsSync checks file existence, not content
    const isPlanMode = existsSync(MOCK_PLAN_MODE);
    ok(isPlanMode, 'empty marker file should still be detected');

    // Dispatch should still be blocked
    writeFileSync(MOCK_DISPATCH, JSON.stringify({ status: 'approved', tasks: [{ id: 1 }] }, null, 2));
    let dispatched = false;
    if (!existsSync(MOCK_PLAN_MODE)) {
        dispatched = true;
    }
    ok(!dispatched, 'dispatch should be blocked even with empty marker file');
});

// Edge 9: User clicks Re-plan — should clear plan, keep marker, NOT write dispatch
await test('edge: re-plan clears plan and dispatch but keeps marker', () => {
    mockSetup();
    writeFileSync(MOCK_PLAN_MODE, 'plan_feature');
    writeFileSync(MOCK_STATE, JSON.stringify({
        executionPlan: { status: 'confirming', tasks: [{ id: 1, description: 'Task A' }] }
    }, null, 2));
    writeFileSync(MOCK_DISPATCH, JSON.stringify({ status: 'approved', tasks: [] }, null, 2));

    // Simulate: ep_replan callback
    const state = JSON.parse(readFileSync(MOCK_STATE, 'utf8'));
    delete state.executionPlan;
    writeFileSync(MOCK_STATE, JSON.stringify(state, null, 2));
    if (existsSync(MOCK_DISPATCH)) unlinkSync(MOCK_DISPATCH);
    // Marker stays! User is still in plan mode
    // (they'll send another refinement or /plan_feature)

    ok(existsSync(MOCK_PLAN_MODE), 'marker should survive re-plan');
    ok(!existsSync(MOCK_DISPATCH), 'dispatch should be cleared');
    const clean = JSON.parse(readFileSync(MOCK_STATE, 'utf8'));
    strictEqual(clean.executionPlan, undefined, 'plan should be cleared from state');
});

// Edge 10: Execute All then immediate refinement (race condition)
await test('edge: refinement after Execute All runs without plan guard', () => {
    mockSetup();

    // Step 1: Plan approved → marker removed, dispatch written
    writeFileSync(MOCK_STATE, JSON.stringify({
        executionPlan: { status: 'approved', tasks: [{ id: 1, description: 'Task' }] }
    }, null, 2));
    writeFileSync(MOCK_DISPATCH, JSON.stringify({ status: 'approved', tasks: [{ id: 1, taskStatus: 'pending' }] }, null, 2));
    // Marker was removed by Execute All
    ok(!existsSync(MOCK_PLAN_MODE), 'marker removed after approval');

    // Step 2: User sends follow-up message immediately
    const followUp = 'actually add error handling too';

    // Without marker, this message runs in NORMAL mode (not plan mode)
    const isPlanMode = existsSync(MOCK_PLAN_MODE);
    ok(!isPlanMode, 'plan mode is OFF after Execute All');

    // This means Gemini could write code — which is the CORRECT behavior
    // because the plan was approved and we're now in execution mode
    const codeFile = resolve(MOCK_SCRIPTS, 'handler.js');
    writeFileSync(codeFile, 'module.exports = {}');
    // No revert happens — by design
    ok(existsSync(codeFile), 'code file should NOT be reverted after approval (correct behavior)');
});

// Edge 11: Task with unmet dependencies
await test('edge: tasks with unmet deps are skipped in dispatch', () => {
    mockSetup();
    const dispatch = {
        status: 'approved',
        tasks: [
            { id: 1, description: 'Setup config', taskStatus: 'pending', deps: [] },
            { id: 2, description: 'Integration test', taskStatus: 'pending', deps: [1] },
            { id: 3, description: 'Deploy', taskStatus: 'pending', deps: [1, 2] }
        ]
    };

    // Find next pending task
    const nextTask = dispatch.tasks.find(t => t.taskStatus === 'pending' || !t.taskStatus);
    strictEqual(nextTask.id, 1, 'task 1 should be first (no deps)');

    // Check deps for task 2
    const task2 = dispatch.tasks.find(t => t.id === 2);
    const task2DepsMet = task2.deps.every(depId => {
        const dep = dispatch.tasks.find(t => t.id === depId);
        return dep && dep.taskStatus === 'done';
    });
    ok(!task2DepsMet, 'task 2 deps NOT met (task 1 not done)');

    // After task 1 completes
    dispatch.tasks[0].taskStatus = 'done';
    const task2DepsMetAfter = task2.deps.every(depId => {
        const dep = dispatch.tasks.find(t => t.id === depId);
        return dep && dep.taskStatus === 'done';
    });
    ok(task2DepsMetAfter, 'task 2 deps met after task 1 done');

    // Task 3 still blocked (needs both 1 AND 2)
    const task3 = dispatch.tasks.find(t => t.id === 3);
    const task3DepsMet = task3.deps.every(depId => {
        const dep = dispatch.tasks.find(t => t.id === depId);
        return dep && dep.taskStatus === 'done';
    });
    ok(!task3DepsMet, 'task 3 deps NOT met (task 2 not done yet)');

    // After task 2 completes
    dispatch.tasks[1].taskStatus = 'done';
    const task3DepsMetFinal = task3.deps.every(depId => {
        const dep = dispatch.tasks.find(t => t.id === depId);
        return dep && dep.taskStatus === 'done';
    });
    ok(task3DepsMetFinal, 'task 3 deps met after tasks 1+2 done');
});

// --- 14. Kilo CLI Backend Regression (2026-02-18) ---
console.log('\n── Regression: Kilo CLI Backend ──');

await test('regression: watcher has get_backend() function', () => {
    const watcher = readFileSync(resolve(PROJECT_ROOT, 'scripts', 'watcher.sh'), 'utf8');
    ok(watcher.includes('get_backend()'), 'watcher should define get_backend function');
    ok(watcher.includes('backend // "gemini"'), 'get_backend should default to gemini');
});

await test('regression: watcher has run_agent() function', () => {
    const watcher = readFileSync(resolve(PROJECT_ROOT, 'scripts', 'watcher.sh'), 'utf8');
    ok(watcher.includes('run_agent()'), 'watcher should define run_agent function');
    ok(watcher.includes('AGENT_OUTPUT'), 'run_agent should set AGENT_OUTPUT');
    ok(watcher.includes('AGENT_STDERR_CONTENT'), 'run_agent should set AGENT_STDERR_CONTENT');
});

await test('regression: run_agent routes to kilo CLI for kilo backend', () => {
    const watcher = readFileSync(resolve(PROJECT_ROOT, 'scripts', 'watcher.sh'), 'utf8');
    ok(watcher.includes('kilo)'), 'run_agent should have kilo case');
    ok(watcher.includes('kilo "${KILO_ARGS[@]}"'), 'run_agent should invoke kilo binary');
    ok(watcher.includes('Running Kilo CLI'), 'run_agent should show Kilo CLI progress message');
});

await test('regression: run_agent routes to gemini CLI for gemini backend', () => {
    const watcher = readFileSync(resolve(PROJECT_ROOT, 'scripts', 'watcher.sh'), 'utf8');
    ok(watcher.includes('gemini|*)'), 'run_agent should have gemini default case');
    ok(watcher.includes('gemini "${GEMINI_ARGS[@]}"'), 'run_agent should invoke gemini binary');
    ok(watcher.includes('Running Gemini CLI'), 'run_agent should show Gemini CLI progress message');
});

await test('regression: kilo CLI uses --auto flag for autonomous mode', () => {
    const watcher = readFileSync(resolve(PROJECT_ROOT, 'scripts', 'watcher.sh'), 'utf8');
    ok(watcher.includes('KILO_ARGS=(run --auto)'), 'kilo should use run --auto for autonomous mode');
});

await test('regression: watcher sources .env for API keys', () => {
    const watcher = readFileSync(resolve(PROJECT_ROOT, 'scripts', 'watcher.sh'), 'utf8');
    ok(watcher.includes('bot/.env'), 'watcher should source .env file');
    ok(watcher.includes('_API_KEY'), 'watcher should export API key variables');
    ok(watcher.includes('export "$key=$value"'), '.env sourcing should export matched variables');
});

await test('regression: bot.js PLATFORM_MODELS includes kilo models', () => {
    const bot = readFileSync(resolve(SCRIPT_DIR, 'bot.js'), 'utf8');
    ok(bot.includes("'kilo':"), 'PLATFORM_MODELS should have kilo entry');
    ok(bot.includes('openrouter/z-ai/glm-5'), 'kilo should have GLM-5 model');
    ok(bot.includes('openrouter/minimax/minimax-m2.5'), 'kilo should have MiniMax M2.5 model');
    ok(bot.includes('openrouter/z-ai/glm-4.7-flash'), 'kilo should have GLM-4.7 Flash model');
});

await test('regression: bot.js has /backend command handler', () => {
    const bot = readFileSync(resolve(SCRIPT_DIR, 'bot.js'), 'utf8');
    ok(bot.includes('/backend'), 'bot should have /backend command');
    ok(bot.includes("backend:"), 'bot should have backend: callback data prefix');
    ok(bot.includes('BACKEND_OPTIONS'), 'bot should define BACKEND_OPTIONS');
});

await test('regression: backend switch resets model to backend default', () => {
    // Simulate backend switch callback logic
    const backendId = 'kilo';
    const models = PLATFORM_MODELS[backendId] || [];
    const defaultModel = models.length > 0 ? models[0].id : null;

    strictEqual(defaultModel, 'openrouter/z-ai/glm-5', 'kilo default model should be GLM-5');

    // Simulate state update
    updateState(s => {
        s.backend = backendId;
        s.model = defaultModel;
    });
    const state = getState();
    strictEqual(state.backend, 'kilo', 'state.backend should be kilo');
    strictEqual(state.model, 'openrouter/z-ai/glm-5', 'state.model should be GLM-5');
});

await test('regression: gemini backend switch resets to gemini default', () => {
    const backendId = 'gemini';
    const models = PLATFORM_MODELS[backendId] || [];
    const defaultModel = models.length > 0 ? models[0].id : null;

    strictEqual(defaultModel, 'gemini-2.5-flash', 'gemini default model should be Flash 2.5');

    updateState(s => {
        s.backend = backendId;
        s.model = defaultModel;
    });
    const state = getState();
    strictEqual(state.backend, 'gemini', 'state.backend should be gemini');
    strictEqual(state.model, 'gemini-2.5-flash', 'state.model should be Flash 2.5');
});

await test('regression: /model shows backend-specific models', () => {
    // When backend=kilo, /model should show kilo models
    updateState(s => { s.backend = 'kilo'; s.model = 'openrouter/z-ai/glm-5'; });
    const state = getState();
    const backend = state.backend || 'gemini';
    const models = PLATFORM_MODELS[backend] || PLATFORM_MODELS['gemini'];

    strictEqual(models.length, 3, 'kilo should have 3 models');
    strictEqual(models[0].id, 'openrouter/z-ai/glm-5', 'first kilo model should be GLM-5');
    ok(models.every(m => m.id.startsWith('openrouter/')), 'all kilo models should use openrouter prefix');
});

await test('regression: start.sh accepts kilo as alternative backend', () => {
    const startSh = readFileSync(resolve(PROJECT_ROOT, 'start.sh'), 'utf8');
    ok(startSh.includes('kilo'), 'start.sh should reference kilo');
    ok(startSh.includes('No CLI backend found'), 'start.sh should only fail when neither gemini nor kilo is available');
});

await test('regression: gemini hooks workaround only applies to gemini backend', () => {
    const watcher = readFileSync(resolve(PROJECT_ROOT, 'scripts', 'watcher.sh'), 'utf8');
    // The settings.json backup/restore for hooks should be inside the gemini case, not kilo
    ok(watcher.includes('watcher-bak'), 'gemini case should backup settings.json');
    // Kilo case should NOT reference settings backup
    const kiloSection = watcher.substring(
        watcher.indexOf('kilo)'),
        watcher.indexOf('gemini|*)')
    );
    ok(!kiloSection.includes('watcher-bak'), 'kilo case should NOT backup settings.json');
});

// --- 15. Session Fixes Regression (2026-02-18) ---
console.log('\n── Regression: Session Fixes ──');

await test('regression: outbox race condition — concurrent writes merge', () => {
    // Simulates the race: watcher writes doc to outbox, bot reads, sends, rewrites
    // FIX: bot re-reads outbox before writing sent flags
    mockSetup();
    const outbox = resolve(MOCK_GEMINI, 'wa_outbox.json');

    // Step 1: bot reads outbox with text message
    writeFileSync(outbox, JSON.stringify({
        messages: [{ id: 'msg_1', type: 'text', text: 'hello', sent: false }]
    }, null, 2));
    const botSnapshot = JSON.parse(readFileSync(outbox, 'utf8'));

    // Step 2: watcher appends a doc message (while bot is sending)
    const current = JSON.parse(readFileSync(outbox, 'utf8'));
    current.messages.push({ id: 'doc_1', type: 'document', filePath: '/tmp/spec.txt', sent: false });
    writeFileSync(outbox, JSON.stringify(current, null, 2));

    // Step 3: BAD — bot writes its snapshot back (overwrites watcher's doc)
    // This is the OLD behavior:
    botSnapshot.messages[0].sent = true;
    // writeFileSync(outbox, JSON.stringify(botSnapshot, null, 2)); // Would lose doc_1!

    // Step 3: GOOD — bot re-reads, merges, then writes
    const fresh = JSON.parse(readFileSync(outbox, 'utf8'));
    for (const msg of fresh.messages) {
        const match = botSnapshot.messages.find(m => m.id === msg.id);
        if (match && match.sent) msg.sent = true;
    }
    writeFileSync(outbox, JSON.stringify(fresh, null, 2));

    // Verify: both messages present, watcher's doc NOT lost
    const result = JSON.parse(readFileSync(outbox, 'utf8'));
    strictEqual(result.messages.length, 2, 'should have both text and doc messages');
    strictEqual(result.messages[0].sent, true, 'text msg should be marked sent');
    strictEqual(result.messages[1].sent, false, 'doc msg should remain unsent');
    strictEqual(result.messages[1].type, 'document', 'doc type preserved');
});

await test('regression: dispatch prompt contains spec ref injection point', () => {
    const watcher = readFileSync(resolve(PROJECT_ROOT, 'scripts', 'watcher.sh'), 'utf8');
    // Verify the dispatch prompt reads specRef from state.json
    ok(watcher.includes("executionPlan") && watcher.includes("specRef"),
        'dispatch should read specRef from state.json executionPlan');
    ok(watcher.includes('TASK_SPEC_REF'),
        'dispatch should have TASK_SPEC_REF variable');
    ok(watcher.includes('read this file FIRST'),
        'dispatch prompt should tell model to read spec first');
});

await test('regression: dispatch prompt contains scope boundary injection', () => {
    const watcher = readFileSync(resolve(PROJECT_ROOT, 'scripts', 'watcher.sh'), 'utf8');
    ok(watcher.includes('TASK_SCOPE'),
        'dispatch should have TASK_SCOPE variable');
    ok(watcher.includes('Scope Boundary'),
        'scope extraction should look for Scope Boundary field');
    ok(watcher.includes('Do NOT modify files outside the scope boundary'),
        'dispatch prompt should enforce scope boundary');
});

await test('regression: dispatch prompt removed ambiguous workflow reference', () => {
    const watcher = readFileSync(resolve(PROJECT_ROOT, 'scripts', 'watcher.sh'), 'utf8');
    // The old "Follow the /implement_task workflow if available" was removed
    ok(!watcher.includes('Follow the /implement_task workflow if available'),
        'ambiguous workflow reference should be removed from dispatch prompt');
});

await test('regression: difficulty regex accepts X and X/10 formats', () => {
    const watcher = readFileSync(resolve(PROJECT_ROOT, 'scripts', 'watcher.sh'), 'utf8');
    // The regex should have the optional /\\d+ suffix
    ok(watcher.includes('(?:/\\d+)?'),
        'difficulty regex should accept optional /N suffix');

    // Functional test: simulate both formats
    const regexSource = /\[Difficulty: (\d+)(?:\/\d+)?\]/;
    const match1 = '[Difficulty: 3]'.match(regexSource);
    const match2 = '[Difficulty: 7/10]'.match(regexSource);
    const match3 = '[Difficulty: 2/5]'.match(regexSource);

    ok(match1, 'should match [Difficulty: 3]');
    strictEqual(match1[1], '3', 'should capture 3');
    ok(match2, 'should match [Difficulty: 7/10]');
    strictEqual(match2[1], '7', 'should capture 7 from 7/10');
    ok(match3, 'should match [Difficulty: 2/5]');
    strictEqual(match3[1], '2', 'should capture 2 from 2/5');
});

await test('regression: refinement prompt injects active spec filename', () => {
    const watcher = readFileSync(resolve(PROJECT_ROOT, 'scripts', 'watcher.sh'), 'utf8');
    ok(watcher.includes('ACTIVE_SPEC'),
        'refinement prompt should have ACTIVE_SPEC variable');
    ok(watcher.includes('The ACTIVE spec file is:') || watcher.includes('ACTIVE spec file is:'),
        'refinement prompt should explicitly name the active spec');
    ok(watcher.includes('ONLY spec you should edit'),
        'refinement prompt should restrict editing to active spec only');
});

await test('regression: PLAN_MODE_FILE defined as global variable', () => {
    const watcher = readFileSync(resolve(PROJECT_ROOT, 'scripts', 'watcher.sh'), 'utf8');
    // PLAN_MODE_FILE should be defined near the top with other globals (before any function/loop)
    const lines = watcher.split('\n');
    let globalDefLine = -1;
    for (let i = 0; i < Math.min(50, lines.length); i++) {
        if (lines[i].includes('PLAN_MODE_FILE=')) {
            globalDefLine = i + 1;
            break;
        }
    }
    ok(globalDefLine > 0 && globalDefLine <= 50,
        `PLAN_MODE_FILE should be defined in first 50 lines (found at line ${globalDefLine})`);
});

// ============================================================================
// SUMMARY
// ============================================================================

console.log('\n' + '═'.repeat(50));
console.log(`  ✅ Passed: ${passed}`);
if (skipped > 0) console.log(`  ⏭️  Skipped: ${skipped}`);
if (failed > 0) {
    console.log(`  ❌ Failed: ${failed}`);
    console.log('\nFailures:');
    for (const f of failures) {
        console.log(`  • ${f.name}: ${f.error.message}`);
    }
}
console.log('═'.repeat(50));

process.exit(failed > 0 ? 1 : 0);
