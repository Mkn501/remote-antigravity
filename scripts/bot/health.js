// ============================================================================
// health.js — Health check interval + watcher status monitoring
// ============================================================================

import { existsSync, readFileSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

export function isWatcherRunning() {
    try {
        const result = execSync('pgrep -f "watcher.sh"', { encoding: 'utf8', timeout: 3000 }).trim();
        return result.length > 0;
    } catch {
        return false;
    }
}

export function startHealthCheck(bot, ctx) {
    const { CHAT_ID, CENTRAL_DIR, LOCK_FILE, readJsonSafe } = ctx;
    let watcherWasAlive = true;

    setInterval(async () => {
        try {
            // --- Check 1: Lock file health ---
            if (existsSync(LOCK_FILE)) {
                const stats = statSync(LOCK_FILE);
                const ageMs = Date.now() - stats.mtimeMs;
                const ageMin = Math.floor(ageMs / 1000 / 60);

                // Check if watcher is in step-through dispatch wait (valid idle)
                let inDispatchWait = false;
                const dispatchFile = join(CENTRAL_DIR, 'wa_dispatch.json');
                if (existsSync(dispatchFile)) {
                    try {
                        const dispatch = JSON.parse(readFileSync(dispatchFile, 'utf8'));
                        if (dispatch.status === 'approved' && Array.isArray(dispatch.tasks)) {
                            const hasDone = dispatch.tasks.some(t => t.taskStatus === 'done');
                            const hasPending = dispatch.tasks.some(t => !t.taskStatus || t.taskStatus === 'pending' || t.taskStatus === null);
                            inDispatchWait = hasDone && hasPending;
                        }
                    } catch { /* ignore parse errors */ }
                }

                if (ageMin > 10 && ageMin % 5 === 0 && !inDispatchWait) {
                    await bot.sendMessage(CHAT_ID, `⚠️ Health Alert\nTask running for ${ageMin} minutes.\nUse /stop to halt or /clear_lock if stuck.`);
                }

                // Stale lock (process dead)
                const content = readFileSync(LOCK_FILE, 'utf8').trim();
                const pid = parseInt(content, 10);
                if (!isNaN(pid)) {
                    try {
                        process.kill(pid, 0);
                    } catch (err) {
                        if (err.code === 'ESRCH') {
                            unlinkSync(LOCK_FILE);
                            console.log(`💀 Auto-cleared stale lock for dead PID ${pid}`);
                        }
                    }
                }
            }

            // --- Check 2: Watcher process alive ---
            const watcherAlive = isWatcherRunning();

            if (!watcherAlive && watcherWasAlive) {
                await bot.sendMessage(CHAT_ID, [
                    '🔴 Watcher Down',
                    '',
                    'watcher.sh is not running.',
                    'Messages will NOT be processed.',
                    '',
                    'To fix, run on the host:',
                    'nohup bash scripts/watcher.sh > /dev/null 2>&1 &',
                    '',
                    'Or use /clear_lock if stuck.'
                ].join('\n'));
                console.log('🔴 Watcher down — alert sent');
            } else if (watcherAlive && !watcherWasAlive) {
                await bot.sendMessage(CHAT_ID, '🟢 Watcher Restored — message processing resumed.');
                console.log('🟢 Watcher restored');
            }

            watcherWasAlive = watcherAlive;
        } catch (err) {
            console.error(`Health check error: ${err.message}`);
        }
    }, 60000);
}
