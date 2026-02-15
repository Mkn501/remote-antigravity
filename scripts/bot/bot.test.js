
import { deepStrictEqual, strictEqual } from 'assert';
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync, rmdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import sinon from 'sinon';
import TelegramBot from 'node-telegram-bot-api';

// --- Setup ---
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIR, '..', '..');
const CENTRAL_DIR = resolve(PROJECT_ROOT, '.gemini', 'test_bot');


// --- Mocks ---
const mockSendMessage = sinon.fake.resolves(true);
const mockStopPolling = sinon.fake();
const mockOnText = sinon.fake();
const mockOn = sinon.fake();

sinon.stub(TelegramBot.prototype, 'sendMessage').callsFake(mockSendMessage);
sinon.stub(TelegramBot.prototype, 'stopPolling').callsFake(mockStopPolling);
sinon.stub(TelegramBot.prototype, 'onText').callsFake(mockOnText);
sinon.stub(TelegramBot.prototype, 'on').callsFake(mockOn);


// --- Test Helper ---
function cleanup() {
    if (existsSync(CENTRAL_DIR)) {
        const files = ['wa_inbox.json', 'wa_outbox.json', 'state.json', 'wa_stop_signal'];
        files.forEach(f => {
            const fullPath = resolve(CENTRAL_DIR, f);
            if (existsSync(fullPath)) {
                unlinkSync(fullPath);
            }
        });
        rmdirSync(CENTRAL_DIR, { recursive: true });
    }
}

function setupTestEnvironment() {
    cleanup();
    mkdirSync(CENTRAL_DIR, { recursive: true });

    // Set env vars for the bot
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
    process.env.TELEGRAM_CHAT_ID = '12345';
    process.env.GEMINI_PROJECT_DIR = PROJECT_ROOT;
    
    // Override bot's file paths to use test directory
    const botFilePath = resolve(SCRIPT_DIR, 'bot.js');
    let botFileContent = readFileSync(botFilePath, 'utf8');
    botFileContent = botFileContent.replace(
        `const CENTRAL_DIR = resolve(DEFAULT_PROJECT_DIR, '.gemini');`,
        `const CENTRAL_DIR = resolve(process.env.GEMINI_PROJECT_DIR, '.gemini', 'test_bot');`
    );
    
    // Create a temporary bot file for testing
    const testBotPath = resolve(SCRIPT_DIR, 'bot.test.runner.js');
    writeFileSync(testBotPath, botFileContent);
    
    return testBotPath;
}

async function runTest(description, testFn) {
    console.log(`\n--- Running: ${description} ---`);
    const testBotPath = setupTestEnvironment();
    
    try {
        // Dynamically import the modified bot script
        const botModule = await import(`${testBotPath}?v=${Date.now()}`);
        await testFn(botModule);
        console.log(`✅ PASSED: ${description}`);
    } catch (error) {
        console.error(`❌ FAILED: ${description}`);
        console.error(error);
        process.exit(1);
    } finally {
        cleanup();
        if (existsSync(testBotPath)) {
            unlinkSync(testBotPath);
        }
        sinon.resetHistory();
    }
}

// --- Tests ---

async function main() {
    await runTest('Initial state setup', () => {
        const statePath = resolve(CENTRAL_DIR, 'state.json');
        strictEqual(existsSync(statePath), true, 'state.json should be created');
        const state = JSON.parse(readFileSync(statePath, 'utf8'));
        strictEqual(state.activeProject, PROJECT_ROOT, 'Default project should be set');
    });

    await runTest('/sprint command writes to inbox', () => {
        const sprintRegex = /^\/sprint/;
        const sprintHandler = mockOnText.getCall(0).args[1];
        sprintHandler({ chat: { id: '12345' } });

        const inboxPath = resolve(CENTRAL_DIR, 'wa_inbox.json');
        const inbox = JSON.parse(readFileSync(inboxPath, 'utf8'));
        
        strictEqual(inbox.messages.length, 1, 'Should have one message in inbox');
        strictEqual(inbox.messages[0].text, '🏃 Sprint Mode activated. Check your task list and process the highest priority task.');
        strictEqual(mockSendMessage.calledWith('12345', sinon.match(/Sprint Mode activated/)), true);
    });
    
    await runTest('/stop command writes to inbox', () => {
        const stopRegex = /^\/stop/;
        const stopHandler = mockOnText.getCall(1).args[1];
        stopHandler({ chat: { id: '12345' } });

        const inboxPath = resolve(CENTRAL_DIR, 'wa_inbox.json');
        const inbox = JSON.parse(readFileSync(inboxPath, 'utf8'));

        strictEqual(inbox.messages.length, 1, 'Should have one message in inbox');
        strictEqual(inbox.messages[0].text, 'STOP', 'Message should be STOP');
        strictEqual(mockSendMessage.calledWith('12345', sinon.match(/STOP signal sent/)), true);
    });

    await runTest('Regular message writes to inbox', () => {
        const messageHandler = mockOn.getCall(0).args[1];
        const msg = { chat: { id: '12345' }, text: 'Hello, bot!' };
        messageHandler(msg);

        const inboxPath = resolve(CENTRAL_DIR, 'wa_inbox.json');
        const inbox = JSON.parse(readFileSync(inboxPath, 'utf8'));

        strictEqual(inbox.messages.length, 1, 'Should have one message in inbox');
        strictEqual(inbox.messages[0].text, 'Hello, bot!', 'Message text should match');
    });

    await runTest('Outbox polling sends messages to Telegram', async () => {
        const outboxPath = resolve(CENTRAL_DIR, 'wa_outbox.json');
        const outboxData = {
            messages: [
                { id: '1', text: 'Test message 1', sent: false },
                { id: '2', text: 'Test message 2', sent: false }
            ]
        };
        writeFileSync(outboxPath, JSON.stringify(outboxData, null, 2));

        // The bot polls every 2s, so we wait a bit longer
        await new Promise(resolve => setTimeout(resolve, 2500));

        strictEqual(mockSendMessage.callCount, 2, 'sendMessage should be called twice');
        strictEqual(mockSendMessage.getCall(0).calledWith('12345', 'Test message 1'), true);
        strictEqual(mockSendMessage.getCall(1).calledWith('12345', 'Test message 2'), true);

        const updatedOutbox = JSON.parse(readFileSync(outboxPath, 'utf8'));
        strictEqual(updatedOutbox.messages.every(m => m.sent), true, 'All messages should be marked as sent');
    });
    
    console.log(`\n🎉 All tests passed!`);
    process.exit(0);
}

main().catch(err => {
    console.error('Test suite failed to run:', err);
    process.exit(1);
});
