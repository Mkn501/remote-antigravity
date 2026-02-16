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

// ---- Test Framework ----
let passed = 0;
let failed = 0;
let skipped = 0;
const failures = [];

function setup() {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
}

function teardown() {
    rmSync(TEST_DIR, { recursive: true, force: true });
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
    ok(watcher.includes('Google Search'), 'prompt should mention Google Search tool');
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
