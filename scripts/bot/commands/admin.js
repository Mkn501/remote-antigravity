// ============================================================================
// commands/admin.js — /kill, /clear_lock, /restart, /watchdog
// ============================================================================

import { existsSync, unlinkSync, readFileSync, openSync } from 'fs';
import { resolve } from 'path';
import { spawn } from 'child_process';
import { execSync } from 'child_process';
import { killAgent } from '../shell.js';

export function register(bot, ctx) {
    const { CHAT_ID, CENTRAL_DIR, SCRIPT_DIR, LOCK_FILE,
        registerCommand, isWatcherRunning } = ctx;

    const WATCHER_PATH = resolve(SCRIPT_DIR, '..', 'watcher.sh');
    const WATCHER_LOG = resolve(CENTRAL_DIR, 'watcher.log');
    const WATCHDOG_LOG = resolve(CENTRAL_DIR, 'watchdog.log');
    const RESTART_TRACKER = '/tmp/ra-watchdog-restarts';

    // /kill — force-kill running agent
    registerCommand(/^\/kill/, async (msg) => {
        try {
            killAgent();
            if (existsSync(LOCK_FILE)) unlinkSync(LOCK_FILE);
            await bot.sendMessage(CHAT_ID, '🛑 Agent force-killed.\nLock cleared. Watcher is idle and ready.');
            console.log(`🛑 ${new Date().toISOString()} | /kill — agent force-killed`);
        } catch (err) {
            await bot.sendMessage(CHAT_ID, `❌ Kill failed: ${err.message}`);
        }
    });

    // /clear_lock
    registerCommand(/^\/clear_lock/, async (msg) => {
        if (existsSync(LOCK_FILE)) {
            try {
                unlinkSync(LOCK_FILE);
                await bot.sendMessage(CHAT_ID, '✅ Lock file cleared manually.');
                console.log('🔓 Lock file cleared manually');
            } catch (err) {
                await bot.sendMessage(CHAT_ID, `❌ Failed to clear lock: ${err.message}`);
            }
        } else {
            await bot.sendMessage(CHAT_ID, 'ℹ️ No lock file found.');
        }
    });

    // /restart
    registerCommand(/^\/restart/, async (msg) => {
        await bot.sendMessage(CHAT_ID, '🔄 Restarting watcher...');
        console.log(`🔄 ${new Date().toISOString()} | /restart invoked`);

        let oldPid = 'unknown';
        try {
            oldPid = execSync('pgrep -f "watcher.sh"', { encoding: 'utf8', timeout: 3000 }).trim();
            execSync('pkill -f "watcher.sh"', { timeout: 3000 });
        } catch { /* no watcher running */ }

        const continueFile = resolve(CENTRAL_DIR, 'wa_dispatch_continue.json');
        [LOCK_FILE, continueFile].forEach(f => {
            try { if (existsSync(f)) unlinkSync(f); } catch { /* ignore */ }
        });

        let logTail = '(no log available)';
        try {
            logTail = execSync(`tail -10 "${WATCHER_LOG}"`, { encoding: 'utf8', timeout: 3000 }).trim();
        } catch { /* log file may not exist */ }

        let newPid = 'failed';
        try {
            const logFd = openSync(WATCHER_LOG, 'a');
            const watcher = spawn('bash', [WATCHER_PATH], {
                detached: true,
                stdio: ['ignore', logFd, logFd]
            });
            watcher.unref();
            newPid = watcher.pid;
        } catch (err) {
            await bot.sendMessage(CHAT_ID, `❌ Failed to start watcher: ${err.message}`);
            return;
        }

        const report = [
            `✅ Watcher restarted`,
            `   Old PID: ${oldPid || 'not running'}`,
            `   New PID: ${newPid}`,
            `🧹 Lock + continue signal cleared`,
            '',
            `📋 Last watcher log:`,
            logTail
        ].join('\n');
        await bot.sendMessage(CHAT_ID, report);
        console.log(`✅ ${new Date().toISOString()} | Watcher restarted (PID ${newPid})`);
    });

    // /watchdog
    registerCommand(/^\/watchdog/, async (msg) => {
        const botAlive = true;
        const watcherAlive = isWatcherRunning();

        let restartCount = 0;
        try {
            const hour = new Date().toISOString().slice(0, 13).replace('T', '-');
            const tracker = readFileSync(RESTART_TRACKER, 'utf8');
            restartCount = (tracker.match(new RegExp(hour.slice(0, 10), 'g')) || []).length;
        } catch { /* no tracker file */ }

        let lastRestart = 'never';
        try {
            const log = execSync(`grep -E "restarting|started" "${WATCHDOG_LOG}" | tail -1`,
                { encoding: 'utf8', timeout: 3000 }).trim();
            if (log) lastRestart = log.substring(0, 19);
        } catch { /* no log */ }

        const status = [
            '🐕 Watchdog Status',
            '',
            `🤖 Bot: ${botAlive ? '✅ running' : '❌ down'}`,
            `👁️ Watcher: ${watcherAlive ? '✅ running' : '❌ down'}`,
            `🔄 Restarts today: ${restartCount}`,
            `📋 Last restart: ${lastRestart}`,
            '',
            `📂 Log: .gemini/watchdog.log`
        ].join('\n');
        await bot.sendMessage(CHAT_ID, status);
    });
}
