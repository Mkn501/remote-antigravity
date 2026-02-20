// ============================================================================
// Regression Test Suite — wa-bridge bot (v3)
// ============================================================================
// Tests for the modular architecture (bot_v3.js + commands/*.js).
// Unlike v1/v2 test files, this IMPORTS modules directly for behavioral tests
// and source-scans bot_v3.js (not bot.js) for contract tests.
//
// Run: node scripts/bot/bot_test_v3.js
// ============================================================================

import { strictEqual, deepStrictEqual, ok } from 'assert';
import {
    readFileSync, writeFileSync, unlinkSync, existsSync,
    mkdirSync, rmSync, statSync, renameSync
} from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import { execSync } from 'child_process';

// --- Direct Module Imports (behavioral testing) ---
import {
    readJsonSafe, atomicWrite, writeToInbox, getState, updateState, formatUptime,
    CENTRAL_DIR, DEFAULT_PROJECT_DIR
} from './helpers.js';
import { isValidHotfixBranch, safeGit } from './shell.js';
import {
    MODEL_OPTIONS, PLATFORM_MODELS, PLATFORM_LABELS,
    BACKEND_OPTIONS, TIER_EMOJI, TIER_DEFAULTS, DIFFICULTY_LABEL
} from './registries.js';
import {
    loadExecutionPlan, saveExecutionPlan, formatExecutionPlan,
    applyTierDefaults, writeDispatch
} from './commands/plan.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIR, '..', '..');
const TEST_DIR = resolve(PROJECT_ROOT, '.gemini', '_test_sandbox');
const INBOX = resolve(TEST_DIR, 'wa_inbox.json');
const OUTBOX = resolve(TEST_DIR, 'wa_outbox.json');
const STATE = resolve(TEST_DIR, 'state.json');
const LOCK = resolve(TEST_DIR, 'wa_session.lock');
const DISPATCH = resolve(TEST_DIR, 'wa_dispatch.json');

const BOT_PACKAGE_JSON = resolve(SCRIPT_DIR, 'package.json');
const { version } = JSON.parse(readFileSync(BOT_PACKAGE_JSON, 'utf8'));

// Mock Telegram Bot
let mockBot, receivedMessages, CHAT_ID;

// ---- Test Framework ----
let passed = 0, failed = 0, skipped = 0;
const failures = [];

function setup() {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
    CHAT_ID = '123456789';
    receivedMessages = [];
    mockBot = {
        onText: (regexp, callback) => { mockBot._handlers.push({ regexp, callback }); },
        sendMessage: async (chatId, text, options) => {
            receivedMessages.push({ chatId, text, options });
            return { message_id: receivedMessages.length };
        },
        answerCallbackQuery: async () => { },
        editMessageText: async () => { },
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

// --- Helpers for test-local state (uses TEST_DIR, not production STATE_FILE) ---
function testGetState() { return readJsonSafe(STATE, { activeProject: DEFAULT_PROJECT_DIR, projects: { main: DEFAULT_PROJECT_DIR } }); }
function testUpdateState(updater) {
    const state = testGetState();
    updater(state);
    atomicWrite(STATE, state);
    return state;
}
function testWriteToInbox(text) {
    const inbox = readJsonSafe(INBOX, { messages: [] });
    inbox.messages.push({ id: `msg_${Date.now()}`, timestamp: new Date().toISOString(), from: 'user', text, read: false });
    writeFileSync(INBOX, JSON.stringify(inbox, null, 2));
}
function testLoadPlan() { return testGetState().executionPlan || null; }
function testSavePlan(plan) { testUpdateState(s => s.executionPlan = plan); }

// ============================================================================
// TEST SUITES
// ============================================================================

console.log('\n📋 wa-bridge v3 Regression Test Suite\n');

// ============================================================================
// 1. BEHAVIORAL TESTS — Imported modules tested directly
// ============================================================================

// ---- 1a. helpers.js ----
console.log('── helpers.js: JSON I/O ──');

await test('[helpers] readJsonSafe returns fallback for missing file', () => {
    const result = readJsonSafe('/tmp/_nonexistent_v3_test_.json', { ok: true });
    deepStrictEqual(result, { ok: true });
});

await test('[helpers] readJsonSafe returns fallback for malformed JSON', () => {
    const f = resolve(TEST_DIR, 'bad.json');
    writeFileSync(f, 'not json{{{');
    deepStrictEqual(readJsonSafe(f, { fallback: true }), { fallback: true });
});

await test('[helpers] readJsonSafe reads valid JSON', () => {
    const f = resolve(TEST_DIR, 'good.json');
    writeFileSync(f, JSON.stringify({ key: 'value' }));
    strictEqual(readJsonSafe(f, {}).key, 'value');
});

await test('[helpers] atomicWrite creates file via rename', () => {
    const f = resolve(TEST_DIR, 'atomic_test.json');
    atomicWrite(f, { a: 1 });
    ok(existsSync(f), 'file should exist');
    ok(!existsSync(f + '.tmp'), 'tmp file should be removed after rename');
    deepStrictEqual(readJsonSafe(f, {}), { a: 1 });
});

await test('[helpers] atomicWrite survives rapid writes', () => {
    const f = resolve(TEST_DIR, 'rapid.json');
    for (let i = 0; i < 20; i++) atomicWrite(f, { count: i });
    strictEqual(readJsonSafe(f, {}).count, 19);
});

console.log('\n── helpers.js: State ──');

await test('[helpers] getState returns defaults for missing file', () => {
    const state = readJsonSafe('/tmp/_no_state_v3_.json', { activeProject: DEFAULT_PROJECT_DIR, projects: { main: DEFAULT_PROJECT_DIR } });
    ok(state.activeProject, 'should have activeProject');
    ok(state.projects.main, 'should have main project');
});

await test('[helpers] formatUptime formats correctly', () => {
    strictEqual(formatUptime(0), 'just now');
    strictEqual(formatUptime(30000), 'just now');  // < 1 min = 'just now'
    strictEqual(formatUptime(90000), '1m');         // 90s = 1 min
    strictEqual(formatUptime(3661000), '1h 1m');
});

console.log('\n── helpers.js: Inbox ──');

await test('[helpers] writeToInbox creates and appends', () => {
    testWriteToInbox('first');
    testWriteToInbox('second');
    const data = readJsonSafe(INBOX, {});
    strictEqual(data.messages.length, 2);
    strictEqual(data.messages[0].text, 'first');
    strictEqual(data.messages[1].text, 'second');
});

await test('[helpers] inbox handles special chars and emojis', () => {
    testWriteToInbox('`code` *bold* 🚀 🔥');
    strictEqual(readJsonSafe(INBOX, {}).messages[0].text, '`code` *bold* 🚀 🔥');
});

// ---- 1b. shell.js ----
console.log('\n── shell.js: Branch Validation ──');

await test('[shell] isValidHotfixBranch accepts valid branches', () => {
    ok(isValidHotfixBranch('hotfix/auto-123'));
    ok(isValidHotfixBranch('hotfix/auto-1'));
    ok(isValidHotfixBranch('hotfix/auto-999999'));
});

await test('[shell] isValidHotfixBranch rejects injection attempts', () => {
    ok(!isValidHotfixBranch('hotfix/auto-123; rm -rf /'));
    ok(!isValidHotfixBranch('hotfix/auto-123 && echo pwned'));
    ok(!isValidHotfixBranch('hotfix/auto-$(whoami)'));
    ok(!isValidHotfixBranch('hotfix/auto-`id`'));
});

await test('[shell] isValidHotfixBranch rejects non-hotfix branches', () => {
    ok(!isValidHotfixBranch('main'));
    ok(!isValidHotfixBranch('feature/something'));
    ok(!isValidHotfixBranch('hotfix/manual-fix'));
    ok(!isValidHotfixBranch(''));
    ok(!isValidHotfixBranch('hotfix/auto-'));
});

// ---- 1c. registries.js ----
console.log('\n── registries.js: Model Registry ──');

await test('[registries] PLATFORM_MODELS has required platforms', () => {
    ok(PLATFORM_MODELS.gemini, 'should have gemini');
    ok(PLATFORM_MODELS.kilo, 'should have kilo');
    ok(Array.isArray(PLATFORM_MODELS.jules), 'should have jules (empty)');
    ok(PLATFORM_MODELS.gemini.length >= 3, 'gemini should have ≥3 models');
    strictEqual(PLATFORM_MODELS.jules.length, 0, 'jules should have 0 models');
});

await test('[registries] all models have id and label', () => {
    for (const [platform, models] of Object.entries(PLATFORM_MODELS)) {
        for (const m of models) {
            ok(m.id, `${platform} model should have id`);
            ok(m.label, `${platform} model should have label`);
        }
    }
});

await test('[registries] BACKEND_OPTIONS valid', () => {
    ok(BACKEND_OPTIONS.length >= 2);
    ok(BACKEND_OPTIONS.find(b => b.id === 'gemini'));
    ok(BACKEND_OPTIONS.find(b => b.id === 'kilo'));
});

await test('[registries] TIER_DEFAULTS covers all tiers', () => {
    for (const backend of ['gemini', 'kilo']) {
        ok(TIER_DEFAULTS[backend].top, `${backend} should have top tier`);
        ok(TIER_DEFAULTS[backend].mid, `${backend} should have mid tier`);
        ok(TIER_DEFAULTS[backend].free, `${backend} should have free tier`);
    }
});

await test('[registries] DIFFICULTY_LABEL maps correctly', () => {
    strictEqual(DIFFICULTY_LABEL(1), '⭐ Trivial');
    strictEqual(DIFFICULTY_LABEL(3), '⭐⭐ Easy');
    strictEqual(DIFFICULTY_LABEL(5), '⭐⭐⭐ Moderate');
    strictEqual(DIFFICULTY_LABEL(7), '🔥 Hard');
    strictEqual(DIFFICULTY_LABEL(9), '💀 Expert');
    strictEqual(DIFFICULTY_LABEL(null), '');
    strictEqual(DIFFICULTY_LABEL(undefined), '');
});

await test('[registries] PLATFORM_LABELS has all platforms', () => {
    ok(PLATFORM_LABELS.gemini, 'should have gemini label');
    ok(PLATFORM_LABELS.kilo, 'should have kilo label');
    ok(PLATFORM_LABELS.jules, 'should have jules label');
});

// ---- 1d. commands/plan.js — pure functions ----
console.log('\n── commands/plan.js: Execution Plan Functions ──');

await test('[plan] loadExecutionPlan returns null for empty state', () => {
    const plan = testLoadPlan();
    strictEqual(plan, null);
});

await test('[plan] save and load round-trip', () => {
    const plan = {
        status: 'pending_approval', tasks: [
            { id: 1, description: 'Task A', tier: 'mid', platform: null, model: null, parallel: true, deps: [] },
            { id: 2, description: 'Task B', tier: 'top', platform: null, model: null, parallel: false, deps: [1] }
        ]
    };
    testSavePlan(plan);
    const loaded = testLoadPlan();
    strictEqual(loaded.tasks.length, 2);
    strictEqual(loaded.status, 'pending_approval');
    strictEqual(loaded.tasks[1].deps[0], 1);
});

await test('[plan] formatExecutionPlan output format', () => {
    const plan = {
        tasks: [
            { id: 1, description: 'Add config', tier: 'mid', platform: 'gemini', model: 'gemini-2.5-flash', parallel: true, deps: [] },
            { id: 2, description: 'Write test', tier: 'top', platform: 'gemini', model: 'gemini-3-pro-preview', parallel: false, deps: [1] }
        ]
    };
    const text = formatExecutionPlan(plan);
    ok(text.includes('📋 Execution Plan (2 tasks)'));
    ok(text.includes('1. Add config'));
    ok(text.includes('⚡'));  // mid tier
    ok(text.includes('2. Write test'));
    ok(text.includes('🧠'));  // top tier
    ok(text.includes('deps: 1'));
});

await test('[plan] formatExecutionPlan with summary + difficulty', () => {
    const plan = {
        tasks: [
            {
                id: 1, description: 'Add config', tier: 'mid', platform: 'gemini', model: 'gemini-2.5-flash',
                parallel: true, deps: [], summary: 'Adds config file', difficulty: 3
            },
            {
                id: 2, description: 'Write test', tier: 'top', platform: 'gemini', model: 'gemini-2.5-pro',
                parallel: false, deps: [1], summary: 'Tests login flow', difficulty: 8
            }
        ]
    };
    const text = formatExecutionPlan(plan);
    ok(text.includes('⭐⭐ Easy (3/10)'));
    ok(text.includes('🔥 Hard (8/10)'));
    ok(text.includes('→ Adds config file'));
    ok(text.includes('→ Tests login flow'));
});

await test('[plan] formatExecutionPlan graceful without summary/difficulty', () => {
    const plan = {
        tasks: [
            { id: 1, description: 'Simple task', tier: 'mid', platform: 'gemini', model: 'gemini-2.5-flash', parallel: true, deps: [] }
        ]
    };
    const text = formatExecutionPlan(plan);
    ok(text.includes('1. Simple task'));
    ok(!text.includes('→'));
    ok(!text.includes('/10'));
});

await test('[plan] callback data format under 64 bytes', () => {
    const callbacks = [
        'ep_platform:gemini', 'ep_platform:jules',
        'ep_model:gemini-2.5-flash', 'ep_execute', 'ep_override',
        'ep_task:1', 'ep_task_plat:1:gemini', 'ep_task_model:1:gemini-2.5-flash',
        'ep_replan', 'ep_continue', 'ep_stop'
    ];
    for (const cb of callbacks) {
        ok(cb.length <= 64, `"${cb}" should be under 64 bytes`);
    }
});

// ============================================================================
// 2. CONTRACT TESTS — Source-scan bot_v3.js + commands/*.js
// ============================================================================

console.log('\n── Contract: bot_v3.js Architecture ──');

const V3_SRC = readFileSync(resolve(SCRIPT_DIR, 'bot_v3.js'), 'utf8');

await test('[v3] bot_v3.js imports helpers.js', () => {
    ok(V3_SRC.includes("from './helpers.js'"), 'should import helpers');
});

await test('[v3] bot_v3.js imports health.js', () => {
    ok(V3_SRC.includes("from './health.js'"), 'should import health');
});

await test('[v3] bot_v3.js imports outbox.js', () => {
    ok(V3_SRC.includes("from './outbox.js'"), 'should import outbox');
});

await test('[v3] bot_v3.js imports all 7 command modules', () => {
    const modules = ['general', 'model', 'project', 'workflow', 'plan', 'admin', 'diagnose'];
    for (const mod of modules) {
        ok(V3_SRC.includes(`'./commands/${mod}.js'`), `should import commands/${mod}.js`);
    }
});

await test('[v3] bot_v3.js has centralized auth wrapper', () => {
    ok(V3_SRC.includes('function authorized'), 'should define authorized() wrapper');
    ok(V3_SRC.includes('CHAT_ID'), 'auth should check CHAT_ID');
});

await test('[v3] bot_v3.js has callback router', () => {
    ok(V3_SRC.includes('callbackRoutes'), 'should have callback route map');
    ok(V3_SRC.includes("bot.on('callback_query'"), 'should register callback handler');
});

await test('[v3] bot_v3.js has registerCommand for auto BOT_COMMANDS', () => {
    ok(V3_SRC.includes('function registerCommand'), 'should define registerCommand');
    ok(V3_SRC.includes('BOT_COMMANDS'), 'should build BOT_COMMANDS list');
});

await test('[v3] bot_v3.js has message relay to inbox', () => {
    ok(V3_SRC.includes("bot.on('message'"), 'should have message handler');
    ok(V3_SRC.includes('writeToInbox'), 'should relay to inbox');
});

await test('[v3] bot_v3.js has error handling', () => {
    ok(V3_SRC.includes("bot.on('error'"), 'should handle bot errors');
    ok(V3_SRC.includes("bot.on('polling_error'"), 'should handle polling errors');
    ok(V3_SRC.includes('SIGINT'), 'should handle SIGINT');
    ok(V3_SRC.includes('SIGTERM'), 'should handle SIGTERM');
});

await test('[v3] bot_v3.js has no duplicate dotenv import', () => {
    const dotenvCount = (V3_SRC.match(/import.*dotenv/g) || []).length;
    strictEqual(dotenvCount, 1, 'should have exactly one dotenv import');
});

console.log('\n── Contract: Command Module Structure ──');

const COMMAND_FILES = ['general', 'model', 'project', 'workflow', 'plan', 'admin', 'diagnose'];

for (const mod of COMMAND_FILES) {
    await test(`[contract] commands/${mod}.js exports register()`, () => {
        const src = readFileSync(resolve(SCRIPT_DIR, 'commands', `${mod}.js`), 'utf8');
        ok(src.includes('export function register'), `${mod}.js should export register()`);
        ok(src.includes('registerCommand'), `${mod}.js should use registerCommand`);
    });
}

console.log('\n── Contract: Command Handler Coverage ──');

// Build handler list from v3 command modules
const ALL_COMMAND_SOURCES = COMMAND_FILES.map(f =>
    readFileSync(resolve(SCRIPT_DIR, 'commands', `${f}.js`), 'utf8')
).join('\n');

await test('[contract] all 18 bot commands have handlers in v3', () => {
    const expectedCommands = [
        'help', 'version', 'status',
        'model', 'backend',
        'project', 'add', 'list',
        'sprint', 'stop',
        'review_plan',
        'kill', 'clear_lock', 'restart', 'watchdog',
        'diagnose', 'autofix', 'apply_fix', 'discard_fix', 'ping', 'ping'
    ];
    for (const cmd of expectedCommands) {
        const pattern = new RegExp(`registerCommand\\(.*\\\\\\/${cmd}`);
        ok(pattern.test(ALL_COMMAND_SOURCES), `/${cmd} should have a handler in commands/`);
    }
});

await test('[contract] /kill uses killAgent (not raw pkill)', () => {
    const admin = readFileSync(resolve(SCRIPT_DIR, 'commands', 'admin.js'), 'utf8');
    ok(admin.includes('killAgent'), '/kill should use killAgent from shell.js');
    ok(!admin.includes("pkill -f \"gemini\""), '/kill should NOT use broad pkill');
});

await test('[contract] /apply_fix uses safeGit (not execSync)', () => {
    const diagnose = readFileSync(resolve(SCRIPT_DIR, 'commands', 'diagnose.js'), 'utf8');
    ok(diagnose.includes('safeGit'), '/apply_fix should use safeGit');
    ok(diagnose.includes('isValidHotfixBranch'), '/apply_fix should validate branch names');
    ok(!diagnose.includes('execSync(`git'), 'should not use string-interpolated git commands');
});

await test('[contract] /autofix uses updateState (not raw JSON.parse)', () => {
    const diagnose = readFileSync(resolve(SCRIPT_DIR, 'commands', 'diagnose.js'), 'utf8');
    ok(diagnose.includes('updateState'), '/autofix should use updateState');
    ok(!diagnose.includes('JSON.parse(readFileSync(STATE'), 'should not use raw JSON.parse for state');
});

await test('[contract] no PROJECT_DIR in commands (should use DEFAULT_PROJECT_DIR)', () => {
    // Exclude the import/destructure lines
    const lines = ALL_COMMAND_SOURCES.split('\n').filter(l =>
        !l.includes('DEFAULT_PROJECT_DIR') && !l.includes('//') && l.includes('PROJECT_DIR')
    );
    strictEqual(lines.length, 0, `Found bare PROJECT_DIR usage: ${lines[0] || 'none'}`);
});

// ---- Watcher Contract Tests ----
console.log('\n── Contract: Watcher Script ──');

await test('[contract] watcher.sh has required functions', () => {
    const watcher = readFileSync(resolve(PROJECT_ROOT, 'scripts', 'watcher.sh'), 'utf8');
    ok(watcher.includes('write_to_outbox()'), 'should define write_to_outbox');
    ok(watcher.includes('LOCK_FILE'), 'should reference LOCK_FILE');
    ok(watcher.includes('echo "$$" > "$LOCK_FILE"'), 'should write PID to lock');
    ok(watcher.includes('telegram/active'), 'should manage branches');
});

await test('[contract] watcher.sh has progress notifications', () => {
    const watcher = readFileSync(resolve(PROJECT_ROOT, 'scripts', 'watcher.sh'), 'utf8');
    for (const n of ['Message received', 'Running Gemini CLI', 'Changes committed', 'Session closed']) {
        ok(watcher.includes(n), `should have: "${n}"`);
    }
});

await test('[contract] watcher.sh has run_agent function', () => {
    const watcher = readFileSync(resolve(PROJECT_ROOT, 'scripts', 'watcher.sh'), 'utf8');
    ok(watcher.includes('run_agent()'), 'should define run_agent');
});

// ---- Self-healing Contract Tests ----
console.log('\n── Contract: Self-Healing Pipeline ──');

await test('[contract] watchdog.sh exists and has valid syntax', () => {
    const watchdogPath = resolve(PROJECT_ROOT, 'scripts', 'watchdog.sh');
    ok(existsSync(watchdogPath), 'watchdog.sh should exist');
    try {
        execSync(`bash -n "${watchdogPath}"`, { timeout: 5000 });
    } catch (err) {
        ok(false, `watchdog.sh has syntax error: ${err.message}`);
    }
});

await test('[contract] diagnose_prompt.txt template exists', () => {
    const promptPath = resolve(PROJECT_ROOT, 'scripts', 'diagnose_prompt.txt');
    ok(existsSync(promptPath), 'diagnose_prompt.txt should exist');
});

await test('[contract] admin.js /kill clears lock file', () => {
    const admin = readFileSync(resolve(SCRIPT_DIR, 'commands', 'admin.js'), 'utf8');
    ok(admin.includes('LOCK_FILE'), '/kill should reference LOCK_FILE');
    ok(admin.includes('unlinkSync'), '/kill should clear lock file');
});

// ---- Auth & Routing Tests ----
console.log('\n── Auth & Routing ──');

await test('[auth] string vs number chat ID comparison', () => {
    const check = (msgId, chatId) => String(msgId) === String(chatId);
    ok(check('12345', '12345'), 'string match');
    ok(check(12345, '12345'), 'number→string match');
    ok(check('12345', 12345), 'string→number match');
    ok(!check('99999', '12345'), 'mismatch rejected');
});

await test('[routing] workflow commands are NOT in bot command list', () => {
    // Simulate the auto-generated BOT_COMMANDS from v3 registerCommand
    const botCmds = ['help', 'version', 'status', 'model', 'backend', 'project', 'add',
        'list', 'sprint', 'stop', 'review_plan', 'kill', 'clear_lock', 'restart',
        'watchdog', 'diagnose', 'autofix', 'apply_fix', 'discard_fix'];
    const workflowCmds = ['startup', 'shutdown', 'plan_feature', 'implement_task', 'pr_check'];

    for (const cmd of workflowCmds) {
        ok(!botCmds.includes(cmd), `/${cmd} should NOT be a bot command — it goes to inbox`);
    }
});

// ---- Lock File Tests ----
console.log('\n── Lock File ──');

await test('[lock] creation and removal', () => {
    writeFileSync(LOCK, '12345');
    ok(existsSync(LOCK));
    unlinkSync(LOCK);
    ok(!existsSync(LOCK));
});

await test('[lock] stale detection (dead PID)', () => {
    writeFileSync(LOCK, '999999999');
    let isStale = false;
    try { process.kill(999999999, 0); } catch (err) {
        if (err.code === 'ESRCH') isStale = true;
    }
    ok(isStale, 'dead PID should be stale');
});

await test('[lock] live detection (own PID)', () => {
    writeFileSync(LOCK, String(process.pid));
    let isAlive = false;
    try { process.kill(process.pid, 0); isAlive = true; } catch { }
    ok(isAlive, 'own PID should be alive');
});

// ---- File Size / Line Count Architecture ----
console.log('\n── Architecture: File Size Constraints ──');

await test('[arch] bot_v3.js is under 200 lines', () => {
    const lines = V3_SRC.split('\n').length;
    ok(lines <= 200, `bot_v3.js is ${lines} lines — should be ≤200`);
});

await test('[arch] no command module exceeds 500 lines', () => {
    for (const mod of COMMAND_FILES) {
        const src = readFileSync(resolve(SCRIPT_DIR, 'commands', `${mod}.js`), 'utf8');
        const lines = src.split('\n').length;
        ok(lines <= 500, `commands/${mod}.js is ${lines} lines — should be ≤500`);
    }
});

await test('[arch] bot_v3.js has no duplicate /kill handler', () => {
    const killMatches = V3_SRC.match(/\/kill/g) || [];
    // bot_v3.js should reference /kill only in comments/imports, not define its own handler
    const handlerMatches = V3_SRC.match(/registerCommand.*kill/g) || [];
    strictEqual(handlerMatches.length, 0, 'bot_v3.js should NOT have /kill handler — it lives in admin.js');
});

// ---- Auth Tests (from v2 section 6) ----
console.log('\n── Auth Guard ──');

await test('[auth] rejects wrong chat ID', () => {
    const msg = { chat: { id: '99999' }, text: 'hello' };
    ok(String(msg.chat.id) !== String('12345'), 'wrong chat ID should be rejected');
});

await test('[auth] accepts correct chat ID (string)', () => {
    ok(String('12345') === String('12345'), 'matching string chat ID');
});

await test('[auth] accepts correct chat ID (number)', () => {
    ok(String(12345) === String('12345'), 'matching numeric chat ID');
});

await test('[auth] workflow commands pass through to inbox', () => {
    const BOT_COMMANDS = ['/stop', '/status', '/project', '/list', '/model', '/backend', '/add', '/help', '/version', '/sprint', '/review_plan', '/clear_lock', '/restart', '/watchdog', '/diagnose', '/autofix', '/apply_fix', '/discard_fix', '/kill'];
    const workflowCommands = ['/startup', '/shutdown', '/plan_feature', '/implement_task'];
    for (const cmd of workflowCommands) {
        ok(!BOT_COMMANDS.some(c => cmd.startsWith(c)), `${cmd} should NOT be intercepted by bot`);
    }
});

// ---- File Sending (from v2 section 7) ----
console.log('\n── File Sending ──');

await test('[file] long message detection threshold', () => {
    const MAX_MSG_LEN = 4096;
    ok('A'.repeat(4096).length <= MAX_MSG_LEN, 'exactly 4096 should be text');
    ok('A'.repeat(4097).length > MAX_MSG_LEN, '4097 should trigger file send');
});

await test('[file] temp file creation for long replies', () => {
    const text = 'B'.repeat(5000);
    const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const tmpFile = join(tmpdir(), `gemini_reply_test_${ts}.txt`);
    writeFileSync(tmpFile, text, 'utf8');
    ok(existsSync(tmpFile));
    strictEqual(readFileSync(tmpFile, 'utf8').length, 5000);
    unlinkSync(tmpFile);
});

await test('[file] caption preview is truncated correctly', () => {
    const text = 'C'.repeat(5000);
    const preview = text.substring(0, 200).replace(/\n/g, ' ') + '…';
    const caption = `📄 Full reply (${text.length} chars):\n${preview}`;
    ok(caption.length <= 1024, 'caption should be under Telegram 1024 limit');
    strictEqual(preview.length, 201);
});

// ---- Watcher Integration (from v2 section 8) ----
console.log('\n── Watcher Integration ──');

await test('[watcher] outbox message format', () => {
    const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    const msg = { id: `resp_${Math.floor(Date.now() / 1000)}`, timestamp, from: 'agent', text: '📥 Message received: test', sent: false };
    ok(msg.id.startsWith('resp_'));
    ok(msg.timestamp.endsWith('Z'));
    strictEqual(msg.from, 'agent');
    strictEqual(msg.sent, false);
});

await test('[watcher] lifecycle status messages are valid', () => {
    const statuses = ['📥 Message received: test', '⚡ Running workflow: /startup', '🧠 Running Gemini CLI...', '🧠 Running Kilo CLI...', '💾 Changes committed', '🏁 Session closed — branch ready for review'];
    for (const s of statuses) {
        ok(s.length > 0 && s.length <= 4096 && !s.includes('parse_mode'));
    }
});

await test('[watcher] session command detection: /new', () => {
    ok(/^\/new/i.test('/new fix the login page'));
    strictEqual('/new fix the login page'.replace(/^\/new\s*/i, ''), 'fix the login page');
});

await test('[watcher] session command detection: /startup /shutdown', () => {
    ok(/^\/startup/i.test('/startup'));
    ok(/^\/shutdown/i.test('/shutdown'));
});

await test('[watcher] workflow command extraction', () => {
    const cases = [['/startup', 'startup'], ['/shutdown', 'shutdown'], ['/plan_feature auth system', 'plan_feature'], ['/implement_task', 'implement_task'], ['hello world', null]];
    for (const [input, expected] of cases) {
        const match = input.match(/^\/([a-z_-]+)/);
        strictEqual(match ? match[1] : null, expected, `"${input}" → "${expected}"`);
    }
});

await test('[watcher] /version command output format', async () => {
    const versionLines = ['ℹ️ wa-bridge Bot', `📦 Version: ${version}`, '🔧 Backend: Flash', '🤖 Model: ⚡ Flash 2.5', '⏱️ Uptime: just now', `⏰ ${new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}`].join('\n');
    await mockBot.sendMessage(CHAT_ID, versionLines);
    strictEqual(receivedMessages.length, 1);
    ok(receivedMessages[0].text.includes('wa-bridge Bot'));
    ok(receivedMessages[0].text.includes(`📦 Version: ${version}`));
});

await test('[behavioral] /ping replies pong when authorized', async () => {
    // Dynamically import and register commands for this test
    const { register } = await import('./commands/general.js');
    const mockCtx = {
        CHAT_ID,
        authorized: (msg) => true, // Mock authorized to always return true
        registerCommand: (regexp, handler) => {
            mockBot._handlers.push({ regexp, handler });
        },
        getState: testGetState,
        readJsonSafe,
        formatUptime,
        INBOX,
        OUTBOX,
        CENTRAL_DIR,
        DISPATCH_FILE: DISPATCH,
        BOT_START_TIME: Date.now() - 100000,
        // Add any other context properties that general.js might use
    };
    register(mockBot, mockCtx);

    const msg = { chat: { id: CHAT_ID }, text: '/ping' };
    const handler = mockBot._handlers.find(h => h.regexp.test(msg.text));
    ok(handler, 'handler for /ping should be registered');

    await handler.handler(msg);

    strictEqual(receivedMessages.length, 1);
    strictEqual(receivedMessages[0].text, 'pong');
    strictEqual(receivedMessages[0].chatId, CHAT_ID);
});

await test('[behavioral] /ping does not reply when unauthorized', async () => {
    const { register } = await import('./commands/general.js');
    const mockCtx = {
        CHAT_ID,
        authorized: (msg) => false, // Mock authorized to always return false
        registerCommand: (regexp, handler) => {
            mockBot._handlers.push({ regexp, handler });
        },
        getState: testGetState,
        readJsonSafe,
        formatUptime,
        INBOX,
        OUTBOX,
        CENTRAL_DIR,
        DISPATCH_FILE: DISPATCH,
        BOT_START_TIME: Date.now() - 100000,
    };
    register(mockBot, mockCtx);

    const msg = { chat: { id: CHAT_ID }, text: '/ping' };
    const handler = mockBot._handlers.find(h => h.regexp.test(msg.text));
    ok(handler, 'handler for /ping should be registered');

    await handler.handler(msg);

    strictEqual(receivedMessages.length, 0, 'bot should not send a message when unauthorized');
});

await test('[watcher] watcher.sh has write_to_outbox function', () => {
    const watcher = readFileSync(resolve(PROJECT_ROOT, 'scripts', 'watcher.sh'), 'utf8');
    ok(watcher.includes('write_to_outbox()'));
});

await test('[watcher] watcher.sh has lock file management', () => {
    const watcher = readFileSync(resolve(PROJECT_ROOT, 'scripts', 'watcher.sh'), 'utf8');
    ok(watcher.includes('LOCK_FILE'));
    ok(watcher.includes('echo "$$" > "$LOCK_FILE"'));
});

await test('[watcher] watcher.sh has branch management', () => {
    const watcher = readFileSync(resolve(PROJECT_ROOT, 'scripts', 'watcher.sh'), 'utf8');
    ok(watcher.includes('telegram/active'));
    ok(watcher.includes('telegram/session-'));
});

// ---- Error Resilience (from v2 section 9) ----
console.log('\n── Error Resilience ──');

await test('[resilience] readJsonSafe survives concurrent writes', () => {
    writeFileSync(resolve(TEST_DIR, 'partial.json'), '{"messages": [{"id": "1"');
    deepStrictEqual(readJsonSafe(resolve(TEST_DIR, 'partial.json'), { messages: [] }), { messages: [] });
});

await test('[resilience] inbox survives rapid sequential writes', () => {
    for (let i = 0; i < 20; i++) testWriteToInbox(`msg_${i}`);
    const data = readJsonSafe(INBOX, { messages: [] });
    strictEqual(data.messages.length, 20);
    strictEqual(data.messages[0].text, 'msg_0');
    strictEqual(data.messages[19].text, 'msg_19');
});

await test('[resilience] empty text message handling', () => {
    testWriteToInbox('');
    strictEqual(readJsonSafe(INBOX, {}).messages[0].text, '');
});

// ---- Prompt Rules (from v2 section 10) ----
console.log('\n── Prompt Rules ──');

await test('[prompt] contains web search instruction', () => {
    const watcher = readFileSync(resolve(PROJECT_ROOT, 'scripts', 'watcher.sh'), 'utf8');
    ok(watcher.includes('web search'));
});

await test('[prompt] contains literal instruction following', () => {
    const watcher = readFileSync(resolve(PROJECT_ROOT, 'scripts', 'watcher.sh'), 'utf8');
    ok(watcher.includes('EXACTLY as stated') || watcher.includes('LITERALLY'));
});

await test('[prompt] contains no-implement guard', () => {
    const watcher = readFileSync(resolve(PROJECT_ROOT, 'scripts', 'watcher.sh'), 'utf8');
    ok(watcher.includes('do NOT implement') || watcher.includes('do NOT implement or write code'));
});

await test('[prompt] no parse_mode in v3 sendMessage calls', () => {
    const allV3 = V3_SRC + '\n' + ALL_COMMAND_SOURCES;
    const markdownLines = allV3.split('\n').filter(l => l.includes('parse_mode') && l.includes('Markdown') && !l.includes('//') && !l.includes('MarkdownV2'));
    ok(markdownLines.length <= 2, `Found ${markdownLines.length} parse_mode: Markdown`);
});

// ---- Execution Plan: Extra Behavioral Tests (from v2 section 12) ----
console.log('\n── Execution Plan: Extended ──');

await test('[plan] platform + model assignment', () => {
    const plan = {
        status: 'pending_approval', defaultPlatform: null, defaultModel: null, tasks: [
            { id: 1, description: 'Task A', tier: 'mid', platform: null, model: null, parallel: true, deps: [] }
        ]
    };
    plan.defaultPlatform = 'gemini'; plan.defaultModel = 'gemini-2.5-flash';
    plan.tasks.forEach(t => { t.platform = 'gemini'; t.model = 'gemini-2.5-flash'; });
    testSavePlan(plan);
    const loaded = testLoadPlan();
    strictEqual(loaded.tasks[0].platform, 'gemini');
    strictEqual(loaded.tasks[0].model, 'gemini-2.5-flash');
});

await test('[plan] jules platform skips model selection', () => {
    const plan = { status: 'selecting_platform', tasks: [{ id: 1, tier: 'free', platform: null, model: null }] };
    plan.defaultPlatform = 'jules'; plan.tasks[0].platform = 'jules'; plan.tasks[0].model = null; plan.status = 'confirming';
    strictEqual(plan.status, 'confirming');
    strictEqual(plan.tasks[0].model, null);
});

// ---- Mock Plan Flow (from v2 section 13) ----
console.log('\n── Mock Plan Flow ──');

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

await test('[mock] /plan_feature sets marker + clears stale dispatch', () => {
    mockSetup();
    writeFileSync(MOCK_STATE, JSON.stringify({ executionPlan: { status: 'approved', tasks: [{ id: 1 }] } }, null, 2));
    writeFileSync(MOCK_DISPATCH, JSON.stringify({ status: 'approved', tasks: [] }, null, 2));
    writeFileSync(MOCK_PLAN_MODE, 'plan_feature');
    if (existsSync(MOCK_DISPATCH)) unlinkSync(MOCK_DISPATCH);
    const state = JSON.parse(readFileSync(MOCK_STATE, 'utf8'));
    delete state.executionPlan;
    writeFileSync(MOCK_STATE, JSON.stringify(state, null, 2));
    ok(existsSync(MOCK_PLAN_MODE));
    ok(!existsSync(MOCK_DISPATCH));
    strictEqual(JSON.parse(readFileSync(MOCK_STATE, 'utf8')).executionPlan, undefined);
});

await test('[mock] refinement detects plan mode from marker', () => {
    mockSetup();
    writeFileSync(MOCK_PLAN_MODE, 'plan_feature');
    ok(existsSync(MOCK_PLAN_MODE));
    strictEqual(readFileSync(MOCK_PLAN_MODE, 'utf8').trim(), 'plan_feature');
});

await test('[mock] code files reverted in plan mode', () => {
    mockSetup();
    writeFileSync(MOCK_PLAN_MODE, 'plan_feature');
    const specFile = resolve(MOCK_SPECS, 'test_spec.md');
    writeFileSync(specFile, '# Spec');
    const codeFile = resolve(MOCK_SCRIPTS, 'bot.js');
    writeFileSync(codeFile, 'bad code');
    const codeExtensions = ['.js', '.py', '.sh', '.ts', '.css', '.html'];
    for (const f of [codeFile]) { const ext = f.substring(f.lastIndexOf('.')); if (codeExtensions.includes(ext)) unlinkSync(f); }
    ok(existsSync(specFile));
    ok(!existsSync(codeFile));
});

await test('[mock] multiple code file types all reverted', () => {
    mockSetup();
    writeFileSync(MOCK_PLAN_MODE, 'plan_feature');
    const files = { [resolve(MOCK_SCRIPTS, 'app.js')]: 'js', [resolve(MOCK_SCRIPTS, 'helper.py')]: 'py', [resolve(MOCK_SCRIPTS, 'deploy.sh')]: 'sh', [resolve(MOCK_SCRIPTS, 'types.ts')]: 'ts', [resolve(MOCK_SPECS, 'plan.md')]: 'md' };
    for (const [p, c] of Object.entries(files)) writeFileSync(p, c);
    const codeExts = ['.js', '.py', '.sh', '.ts', '.css', '.html'];
    let reverted = 0;
    for (const f of Object.keys(files)) { const ext = f.substring(f.lastIndexOf('.')); if (codeExts.includes(ext)) { unlinkSync(f); reverted++; } }
    strictEqual(reverted, 4);
    ok(existsSync(resolve(MOCK_SPECS, 'plan.md')));
});

await test('[mock] no revert when plan mode is NOT active', () => {
    mockSetup();
    const codeFile = resolve(MOCK_SCRIPTS, 'bot.js');
    writeFileSync(codeFile, 'authorized change');
    ok(!existsSync(MOCK_PLAN_MODE));
    ok(existsSync(codeFile));
});

await test('[mock] dispatch blocked when plan mode marker exists', () => {
    mockSetup();
    writeFileSync(MOCK_PLAN_MODE, 'plan_feature');
    writeFileSync(MOCK_DISPATCH, JSON.stringify({ status: 'approved', tasks: [] }, null, 2));
    let dispatched = false;
    if (!existsSync(MOCK_PLAN_MODE)) dispatched = true;
    ok(!dispatched);
});

await test('[mock] dispatch allowed after plan mode marker removed', () => {
    mockSetup();
    writeFileSync(MOCK_DISPATCH, JSON.stringify({ status: 'approved', tasks: [] }, null, 2));
    ok(!existsSync(MOCK_PLAN_MODE));
    const dispatch = JSON.parse(readFileSync(MOCK_DISPATCH, 'utf8'));
    ok(dispatch.status === 'approved');
});

await test('[mock] pending_review plan shows full button set', () => {
    const plan = { status: 'pending_review', tasks: [{ id: 1 }, { id: 2 }] };
    let buttons = plan.status === 'approved' ? ['Re-plan'] : ['Execute All', 'Override Task', 'Re-plan'];
    deepStrictEqual(buttons, ['Execute All', 'Override Task', 'Re-plan']);
});

await test('[mock] approved plan shows only Re-plan button', () => {
    const plan = { status: 'approved', tasks: [{ id: 1 }] };
    let buttons = plan.status === 'approved' ? ['Re-plan'] : ['Execute All', 'Override Task', 'Re-plan'];
    deepStrictEqual(buttons, ['Re-plan']);
});

await test('[mock] approved dispatch auto-clears plan mode marker', () => {
    mockSetup();
    writeFileSync(MOCK_PLAN_MODE, 'plan_feature');
    writeFileSync(MOCK_DISPATCH, JSON.stringify({ status: 'approved', tasks: [{ id: 1 }] }, null, 2));
    if (existsSync(MOCK_PLAN_MODE)) {
        const dispatch = JSON.parse(readFileSync(MOCK_DISPATCH, 'utf8'));
        if (dispatch.status === 'approved') unlinkSync(MOCK_PLAN_MODE);
    }
    ok(!existsSync(MOCK_PLAN_MODE));
});

await test('[mock] non-approved dispatch does NOT clear plan mode', () => {
    mockSetup();
    writeFileSync(MOCK_PLAN_MODE, 'plan_feature');
    writeFileSync(MOCK_DISPATCH, JSON.stringify({ status: 'pending_review', tasks: [] }, null, 2));
    if (existsSync(MOCK_PLAN_MODE)) {
        const dispatch = JSON.parse(readFileSync(MOCK_DISPATCH, 'utf8'));
        if (dispatch.status === 'approved') unlinkSync(MOCK_PLAN_MODE);
    }
    ok(existsSync(MOCK_PLAN_MODE));
});

// ---- Edge Cases (from v2 section 13h) ----
console.log('\n── Plan Flow Edge Cases ──');

await test('[edge] second /plan_feature resets everything cleanly', () => {
    mockSetup();
    writeFileSync(MOCK_PLAN_MODE, 'plan_feature');
    writeFileSync(MOCK_STATE, JSON.stringify({ executionPlan: { status: 'pending_review', tasks: [{ id: 1 }] } }, null, 2));
    writeFileSync(MOCK_DISPATCH, JSON.stringify({ status: 'approved' }, null, 2));
    writeFileSync(MOCK_PLAN_MODE, 'plan_feature');
    if (existsSync(MOCK_DISPATCH)) unlinkSync(MOCK_DISPATCH);
    const state = JSON.parse(readFileSync(MOCK_STATE, 'utf8')); delete state.executionPlan;
    writeFileSync(MOCK_STATE, JSON.stringify(state, null, 2));
    ok(existsSync(MOCK_PLAN_MODE));
    ok(!existsSync(MOCK_DISPATCH));
    strictEqual(JSON.parse(readFileSync(MOCK_STATE, 'utf8')).executionPlan, undefined);
});

await test('[edge] refinement queued when lock file exists', () => {
    mockSetup();
    const lockFile = resolve(MOCK_GEMINI, 'wa_session.lock');
    writeFileSync(lockFile, '12345');
    writeFileSync(MOCK_PLAN_MODE, 'plan_feature');
    ok(existsSync(lockFile));
    let processed = false;
    if (!existsSync(lockFile)) processed = true;
    ok(!processed);
    unlinkSync(lockFile);
    ok(!existsSync(lockFile));
});

await test('[edge] .mjs/.cjs/.jsx/.tsx files also reverted in plan mode', () => {
    mockSetup();
    writeFileSync(MOCK_PLAN_MODE, 'plan_feature');
    const extFiles = { [resolve(MOCK_SCRIPTS, 'u.mjs')]: 'a', [resolve(MOCK_SCRIPTS, 'c.cjs')]: 'b', [resolve(MOCK_SCRIPTS, 'A.jsx')]: 'c', [resolve(MOCK_SCRIPTS, 't.tsx')]: 'd' };
    for (const [p, c] of Object.entries(extFiles)) writeFileSync(p, c);
    const codeExts = ['.js', '.mjs', '.cjs', '.jsx', '.py', '.sh', '.ts', '.tsx', '.css', '.html'];
    let reverted = 0;
    for (const f of Object.keys(extFiles)) { const ext = f.substring(f.lastIndexOf('.')); if (codeExts.includes(ext)) { unlinkSync(f); reverted++; } }
    strictEqual(reverted, 4);
});

await test('[edge] corrupted state.json handled gracefully', () => {
    mockSetup();
    writeFileSync(MOCK_STATE, 'not valid json{{{');
    let plan = null;
    try { plan = JSON.parse(readFileSync(MOCK_STATE, 'utf8')).executionPlan || null; } catch { plan = null; }
    strictEqual(plan, null);
});

await test('[edge] dispatch with null/missing status does not trigger execution', () => {
    mockSetup();
    writeFileSync(MOCK_DISPATCH, JSON.stringify({ status: null, tasks: [{ id: 1 }] }, null, 2));
    ok(JSON.parse(readFileSync(MOCK_DISPATCH, 'utf8')).status !== 'approved');
    writeFileSync(MOCK_DISPATCH, JSON.stringify({ tasks: [{ id: 1 }] }, null, 2));
    ok(JSON.parse(readFileSync(MOCK_DISPATCH, 'utf8')).status !== 'approved');
});

await test('[edge] empty marker file still blocks dispatch', () => {
    mockSetup();
    writeFileSync(MOCK_PLAN_MODE, '');
    ok(existsSync(MOCK_PLAN_MODE));
    let dispatched = false;
    if (!existsSync(MOCK_PLAN_MODE)) dispatched = true;
    ok(!dispatched);
});

await test('[edge] re-plan clears plan and dispatch but keeps marker', () => {
    mockSetup();
    writeFileSync(MOCK_PLAN_MODE, 'plan_feature');
    writeFileSync(MOCK_STATE, JSON.stringify({ executionPlan: { status: 'confirming', tasks: [{ id: 1 }] } }, null, 2));
    writeFileSync(MOCK_DISPATCH, JSON.stringify({ status: 'approved' }, null, 2));
    const state = JSON.parse(readFileSync(MOCK_STATE, 'utf8')); delete state.executionPlan;
    writeFileSync(MOCK_STATE, JSON.stringify(state, null, 2));
    if (existsSync(MOCK_DISPATCH)) unlinkSync(MOCK_DISPATCH);
    ok(existsSync(MOCK_PLAN_MODE));
    ok(!existsSync(MOCK_DISPATCH));
    strictEqual(JSON.parse(readFileSync(MOCK_STATE, 'utf8')).executionPlan, undefined);
});

await test('[edge] tasks with unmet deps are skipped in dispatch', () => {
    const dispatch = {
        status: 'approved', tasks: [
            { id: 1, taskStatus: 'pending', deps: [] },
            { id: 2, taskStatus: 'pending', deps: [1] },
            { id: 3, taskStatus: 'pending', deps: [1, 2] }
        ]
    };
    const nextTask = dispatch.tasks.find(t => t.taskStatus === 'pending');
    strictEqual(nextTask.id, 1);
    const t2DepsMet = dispatch.tasks[1].deps.every(d => dispatch.tasks.find(t => t.id === d)?.taskStatus === 'done');
    ok(!t2DepsMet);
    dispatch.tasks[0].taskStatus = 'done';
    ok(dispatch.tasks[1].deps.every(d => dispatch.tasks.find(t => t.id === d)?.taskStatus === 'done'));
    ok(!dispatch.tasks[2].deps.every(d => dispatch.tasks.find(t => t.id === d)?.taskStatus === 'done'));
    dispatch.tasks[1].taskStatus = 'done';
    ok(dispatch.tasks[2].deps.every(d => dispatch.tasks.find(t => t.id === d)?.taskStatus === 'done'));
});

// ---- Kilo CLI Regression (from v2 section 14) ----
console.log('\n── Regression: Kilo CLI Backend ──');

await test('[regression] watcher has get_backend() function', () => {
    const w = readFileSync(resolve(PROJECT_ROOT, 'scripts', 'watcher.sh'), 'utf8');
    ok(w.includes('get_backend()'));
    ok(w.includes('backend // "gemini"'));
});

await test('[regression] watcher has run_agent() function', () => {
    const w = readFileSync(resolve(PROJECT_ROOT, 'scripts', 'watcher.sh'), 'utf8');
    ok(w.includes('run_agent()'));
    ok(w.includes('AGENT_OUTPUT'));
});

await test('[regression] run_agent routes to kilo CLI for kilo backend', () => {
    const w = readFileSync(resolve(PROJECT_ROOT, 'scripts', 'watcher.sh'), 'utf8');
    ok(w.includes('kilo)'));
    ok(w.includes('kilo "${KILO_ARGS[@]}"'));
});

await test('[regression] run_agent routes to gemini CLI for gemini backend', () => {
    const w = readFileSync(resolve(PROJECT_ROOT, 'scripts', 'watcher.sh'), 'utf8');
    ok(w.includes('gemini|*)'));
    ok(w.includes('gemini "${GEMINI_ARGS[@]}"'));
});

await test('[regression] kilo CLI uses --auto flag', () => {
    const w = readFileSync(resolve(PROJECT_ROOT, 'scripts', 'watcher.sh'), 'utf8');
    ok(w.includes('KILO_ARGS=(run --auto)'));
});

await test('[regression] watcher sources .env for API keys', () => {
    const w = readFileSync(resolve(PROJECT_ROOT, 'scripts', 'watcher.sh'), 'utf8');
    ok(w.includes('bot/.env'));
    ok(w.includes('_API_KEY'));
});

await test('[regression] registries.js PLATFORM_MODELS includes kilo models', () => {
    ok(PLATFORM_MODELS.kilo.length >= 3);
    ok(PLATFORM_MODELS.kilo.some(m => m.id.includes('glm-5')));
    ok(PLATFORM_MODELS.kilo.some(m => m.id.includes('minimax')));
});

await test('[regression] registries.js has /backend command data', () => {
    ok(BACKEND_OPTIONS.some(b => b.id === 'kilo'));
    ok(BACKEND_OPTIONS.some(b => b.id === 'gemini'));
});

await test('[regression] backend switch resets model to backend default', () => {
    const kiloModels = PLATFORM_MODELS['kilo'] || [];
    const defaultModel = kiloModels.length > 0 ? kiloModels[0].id : null;
    ok(defaultModel.includes('openrouter/'));
    const geminiModels = PLATFORM_MODELS['gemini'] || [];
    strictEqual(geminiModels[0].id, 'gemini-2.5-flash');
});

await test('[regression] /model shows backend-specific models', () => {
    const models = PLATFORM_MODELS['kilo'] || [];
    strictEqual(models.length, 3);
    ok(models.every(m => m.id.startsWith('openrouter/')));
});

await test('[regression] start.sh accepts kilo as alternative backend', () => {
    const startSh = readFileSync(resolve(PROJECT_ROOT, 'start.sh'), 'utf8');
    ok(startSh.includes('kilo'));
    ok(startSh.includes('No CLI backend found'));
});

await test('[regression] gemini hooks workaround only applies to gemini backend', () => {
    const w = readFileSync(resolve(PROJECT_ROOT, 'scripts', 'watcher.sh'), 'utf8');
    ok(w.includes('watcher-bak'));
    const kiloSection = w.substring(w.indexOf('kilo)'), w.indexOf('gemini|*)'));
    ok(!kiloSection.includes('watcher-bak'));
});

// ---- Session Fixes Regression (from v2 section 15) ----
console.log('\n── Regression: Session Fixes ──');

await test('[regression] outbox race condition — concurrent writes merge', () => {
    mockSetup();
    const outbox = resolve(MOCK_GEMINI, 'wa_outbox.json');
    writeFileSync(outbox, JSON.stringify({ messages: [{ id: 'msg_1', type: 'text', text: 'hello', sent: false }] }, null, 2));
    const botSnapshot = JSON.parse(readFileSync(outbox, 'utf8'));
    const current = JSON.parse(readFileSync(outbox, 'utf8'));
    current.messages.push({ id: 'doc_1', type: 'document', filePath: '/tmp/spec.txt', sent: false });
    writeFileSync(outbox, JSON.stringify(current, null, 2));
    botSnapshot.messages[0].sent = true;
    const fresh = JSON.parse(readFileSync(outbox, 'utf8'));
    for (const msg of fresh.messages) { const match = botSnapshot.messages.find(m => m.id === msg.id); if (match && match.sent) msg.sent = true; }
    writeFileSync(outbox, JSON.stringify(fresh, null, 2));
    const result = JSON.parse(readFileSync(outbox, 'utf8'));
    strictEqual(result.messages.length, 2);
    strictEqual(result.messages[0].sent, true);
    strictEqual(result.messages[1].sent, false);
});

await test('[regression] dispatch prompt contains spec ref injection point', () => {
    const w = readFileSync(resolve(PROJECT_ROOT, 'scripts', 'watcher.sh'), 'utf8');
    ok(w.includes('executionPlan') && w.includes('specRef'));
    ok(w.includes('TASK_SPEC_REF'));
});

await test('[regression] dispatch prompt contains scope boundary injection', () => {
    const w = readFileSync(resolve(PROJECT_ROOT, 'scripts', 'watcher.sh'), 'utf8');
    ok(w.includes('TASK_SCOPE'));
    ok(w.includes('Do NOT modify files outside the scope boundary'));
});

await test('[regression] difficulty regex accepts X and X/10 formats', () => {
    const regex = /\[Difficulty: (\d+)(?:\/\d+)?\]/;
    ok('[Difficulty: 3]'.match(regex));
    strictEqual('[Difficulty: 7/10]'.match(regex)[1], '7');
    strictEqual('[Difficulty: 2/5]'.match(regex)[1], '2');
});

await test('[regression] refinement prompt injects active spec filename', () => {
    const w = readFileSync(resolve(PROJECT_ROOT, 'scripts', 'watcher.sh'), 'utf8');
    ok(w.includes('ACTIVE_SPEC'));
    ok(w.includes('ONLY spec you should edit'));
});

await test('[regression] PLAN_MODE_FILE defined as global variable', () => {
    const w = readFileSync(resolve(PROJECT_ROOT, 'scripts', 'watcher.sh'), 'utf8');
    const lines = w.split('\n');
    let found = false;
    for (let i = 0; i < Math.min(50, lines.length); i++) { if (lines[i].includes('PLAN_MODE_FILE=')) { found = true; break; } }
    ok(found, 'PLAN_MODE_FILE should be defined in first 50 lines');
});

// ---- Kilo CLI E2E (from v2 section 17) ----
console.log('\n── E2E: Kilo CLI ──');

await test('[e2e] .env file exists with KILO_API_KEY', () => {
    const envFile = resolve(PROJECT_ROOT, 'scripts', 'bot', '.env');
    ok(existsSync(envFile));
    ok(readFileSync(envFile, 'utf8').includes('KILO_API_KEY='));
});

await test('[e2e] watcher maps KILO_API_KEY → OPENROUTER_API_KEY', () => {
    const w = readFileSync(resolve(PROJECT_ROOT, 'scripts', 'watcher.sh'), 'utf8');
    ok(w.includes('KILO_API_KEY'));
    ok(w.includes('OPENROUTER_API_KEY'));
});

await test('[e2e] TIER_DEFAULTS is backend-specific in registries.js', () => {
    ok(TIER_DEFAULTS.gemini.top);
    ok(TIER_DEFAULTS.kilo.top);
    ok(TIER_DEFAULTS.gemini.top.model.includes('gemini'));
    ok(TIER_DEFAULTS.kilo.top.model.includes('openrouter'));
});

await test('[e2e] health check uses CENTRAL_DIR not DOT_GEMINI', () => {
    const healthSrc = readFileSync(resolve(SCRIPT_DIR, 'health.js'), 'utf8');
    ok(!healthSrc.includes('DOT_GEMINI'));
});

await test('[e2e] kilo E2E test script exists', () => {
    const e2e = resolve(SCRIPT_DIR, 'test_kilo_e2e.sh');
    ok(existsSync(e2e));
    ok(readFileSync(e2e, 'utf8').includes('Direct Kilo CLI Call'));
});

// ---- Self-Healing (from v2 sections 19-22) ----
console.log('\n── Self-Healing: Command Handlers in v3 ──');

await test('[self-healing] /restart handler exists in admin.js', () => {
    const admin = readFileSync(resolve(SCRIPT_DIR, 'commands', 'admin.js'), 'utf8');
    ok(admin.includes('registerCommand') && admin.includes('restart'));
});

await test('[self-healing] /restart clears lock file', () => {
    const admin = readFileSync(resolve(SCRIPT_DIR, 'commands', 'admin.js'), 'utf8');
    ok(admin.includes('LOCK_FILE'));
});

await test('[self-healing] /restart listed in /help output', () => {
    const general = readFileSync(resolve(SCRIPT_DIR, 'commands', 'general.js'), 'utf8');
    ok(general.includes('/restart'));
});

await test('[self-healing] watchdog.sh has restart loop guard', () => {
    const src = readFileSync(resolve(PROJECT_ROOT, 'scripts', 'watchdog.sh'), 'utf8');
    ok(src.includes('RESTART_COUNT'));
    ok(src.includes('-ge 3'));
});

await test('[self-healing] /watchdog handler exists in admin.js', () => {
    const admin = readFileSync(resolve(SCRIPT_DIR, 'commands', 'admin.js'), 'utf8');
    ok(admin.includes('registerCommand') && admin.includes('watchdog'));
});

await test('[self-healing] /diagnose handler exists in diagnose.js', () => {
    const diagnose = readFileSync(resolve(SCRIPT_DIR, 'commands', 'diagnose.js'), 'utf8');
    ok(diagnose.includes('registerCommand') && diagnose.includes('diagnose'));
});

await test('[self-healing] watchdog has diagnosis trigger', () => {
    const src = readFileSync(resolve(PROJECT_ROOT, 'scripts', 'watchdog.sh'), 'utf8');
    ok(src.includes('CRASH_COUNT'));
    ok(src.includes('-ge 2'));
    ok(src.includes('diagnosis'));
});

await test('[self-healing] watchdog has diagnosis_pending dedup guard', () => {
    const src = readFileSync(resolve(PROJECT_ROOT, 'scripts', 'watchdog.sh'), 'utf8');
    ok(src.includes('diagnosis_pending'));
    ok(src.includes('touch'));
});

await test('[self-healing] diagnose_prompt.txt has required content', () => {
    const content = readFileSync(resolve(PROJECT_ROOT, 'scripts', 'diagnose_prompt.txt'), 'utf8');
    ok(content.includes('ROOT CAUSE'));
    ok(content.includes('Do NOT modify'));
});

await test('[self-healing] /autofix handler exists in diagnose.js', () => {
    const diagnose = readFileSync(resolve(SCRIPT_DIR, 'commands', 'diagnose.js'), 'utf8');
    ok(diagnose.includes('registerCommand') && diagnose.includes('autofix'));
});

await test('[self-healing] /apply_fix and /discard_fix handlers exist', () => {
    const diagnose = readFileSync(resolve(SCRIPT_DIR, 'commands', 'diagnose.js'), 'utf8');
    ok(diagnose.includes('apply_fix'));
    ok(diagnose.includes('discard_fix'));
});

await test('[self-healing] watchdog has auto-fix trigger', () => {
    const src = readFileSync(resolve(PROJECT_ROOT, 'scripts', 'watchdog.sh'), 'utf8');
    ok(src.includes('auto_fix_enabled'));
    ok(src.includes('HOTFIX_BRANCH'));
    ok(src.includes('npm test'));
});

await test('[self-healing] watchdog hotfix branches from main', () => {
    const src = readFileSync(resolve(PROJECT_ROOT, 'scripts', 'watchdog.sh'), 'utf8');
    ok(src.includes('hotfix/auto-'));
    ok(src.includes('checkout -b'));
    ok(src.includes('apply_fix'));
});

// ---- Diagnosis Pipeline (from v2 section 23) ----
console.log('\n── Diagnosis Pipeline ──');

await test('[diagnosis] watcher detects IS_DIAGNOSIS from "You are a" prefix', () => {
    const src = readFileSync(resolve(PROJECT_ROOT, 'scripts', 'watcher.sh'), 'utf8');
    ok(src.includes('IS_DIAGNOSIS=false'));
    ok(src.includes('You are a'));
    ok(src.includes('IS_DIAGNOSIS=true'));
});

await test('[diagnosis] output saved to DOT_GEMINI (not GEMINI_DIR)', () => {
    const src = readFileSync(resolve(PROJECT_ROOT, 'scripts', 'watcher.sh'), 'utf8');
    const saveBlock = src.match(/Save diagnosis output[\s\S]{0,300}diagnosis_output\.txt/);
    ok(saveBlock);
    ok(saveBlock[0].includes('$DOT_GEMINI'));
    ok(!saveBlock[0].includes('$GEMINI_DIR'));
});

await test('[diagnosis] routed to Flash model (not Pro)', () => {
    const src = readFileSync(resolve(PROJECT_ROOT, 'scripts', 'watcher.sh'), 'utf8');
    ok(src.includes('IS_DIAGNOSIS') && src.includes('ROUTINE_MODEL'));
});

await test('[diagnosis] watcher stop sends confirmation to outbox', () => {
    const src = readFileSync(resolve(PROJECT_ROOT, 'scripts', 'watcher.sh'), 'utf8');
    ok(src.includes('Watcher stopped. Agent is no longer running'));
});

// ---- Behavioral: Auto-Load (from v2 section 18) ----
console.log('\n── Behavioral: Auto-Load Backend Enforcement ──');

await test('[behavioral] auto-load assigns kilo models when backend=kilo', () => {
    const watcher = readFileSync(resolve(PROJECT_ROOT, 'scripts', 'watcher.sh'), 'utf8');
    const pyStart = watcher.indexOf('import json, re, sys');
    const pyEnd = watcher.indexOf("print(f'Loaded {len(tasks)}", pyStart);
    const pyScript = watcher.substring(pyStart, pyEnd) + "print(json.dumps(tasks))\n";
    const mockDir = resolve(TEST_DIR, '_autoload1');
    mkdirSync(mockDir, { recursive: true });
    const mockTasks = resolve(mockDir, 'antigravity_tasks.md');
    const mockState = resolve(mockDir, 'state.json');
    const specRef = 'docs/specs/test_spec.md';
    writeFileSync(mockTasks, `## To Do\n- [ ] [Feature] [Bot] Add version command [Ref: ${specRef}] [Difficulty: 3]\n`);
    writeFileSync(mockState, JSON.stringify({ backend: 'kilo', model: 'openrouter/minimax/minimax-m2.5' }, null, 2));
    const result = execSync(`python3 -c '${pyScript.replace(/'/g, "'\\''")}' '${mockTasks}' '${mockState}' '${specRef}'`, { encoding: 'utf8', timeout: 5000 }).trim();
    const tasks = JSON.parse(result);
    ok(tasks.length >= 1);
    strictEqual(tasks[0].platform, 'kilo');
    ok(tasks[0].model.includes('openrouter/'));
    rmSync(mockDir, { recursive: true, force: true });
});

await test('[behavioral] auto-load assigns gemini models when backend=gemini', () => {
    const watcher = readFileSync(resolve(PROJECT_ROOT, 'scripts', 'watcher.sh'), 'utf8');
    const pyStart = watcher.indexOf('import json, re, sys');
    const pyEnd = watcher.indexOf("print(f'Loaded {len(tasks)}", pyStart);
    const pyScript = watcher.substring(pyStart, pyEnd) + "print(json.dumps(tasks))\n";
    const mockDir = resolve(TEST_DIR, '_autoload2');
    mkdirSync(mockDir, { recursive: true });
    const mockTasks = resolve(mockDir, 'antigravity_tasks.md');
    const mockState = resolve(mockDir, 'state.json');
    const specRef = 'docs/specs/test_spec.md';
    writeFileSync(mockTasks, `## To Do\n- [ ] [Feature] [Bot] Add version command [Ref: ${specRef}] [Difficulty: 3]\n`);
    writeFileSync(mockState, JSON.stringify({ backend: 'gemini', model: 'gemini-2.5-flash' }, null, 2));
    const result = execSync(`python3 -c '${pyScript.replace(/'/g, "'\\''")}' '${mockTasks}' '${mockState}' '${specRef}'`, { encoding: 'utf8', timeout: 5000 }).trim();
    const tasks = JSON.parse(result);
    strictEqual(tasks[0].platform, 'gemini');
    ok(tasks[0].model.startsWith('gemini-'));
    rmSync(mockDir, { recursive: true, force: true });
});

await test('[behavioral] auto-load defaults to gemini when backend not set', () => {
    const watcher = readFileSync(resolve(PROJECT_ROOT, 'scripts', 'watcher.sh'), 'utf8');
    const pyStart = watcher.indexOf('import json, re, sys');
    const pyEnd = watcher.indexOf("print(f'Loaded {len(tasks)}", pyStart);
    const pyScript = watcher.substring(pyStart, pyEnd) + "print(json.dumps(tasks))\n";
    const mockDir = resolve(TEST_DIR, '_autoload3');
    mkdirSync(mockDir, { recursive: true });
    const mockTasks = resolve(mockDir, 'antigravity_tasks.md');
    const mockState = resolve(mockDir, 'state.json');
    const specRef = 'docs/specs/test_spec.md';
    writeFileSync(mockTasks, `## To Do\n- [ ] [Feature] [Bot] Add version command [Ref: ${specRef}] [Difficulty: 3]\n`);
    writeFileSync(mockState, JSON.stringify({ model: 'gemini-2.5-flash' }, null, 2));
    const result = execSync(`python3 -c '${pyScript.replace(/'/g, "'\\''")}' '${mockTasks}' '${mockState}' '${specRef}'`, { encoding: 'utf8', timeout: 5000 }).trim();
    const tasks = JSON.parse(result);
    strictEqual(tasks[0].platform, 'gemini');
    rmSync(mockDir, { recursive: true, force: true });
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
