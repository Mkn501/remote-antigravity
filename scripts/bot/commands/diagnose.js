// ============================================================================
// commands/diagnose.js — /diagnose, /autofix, /apply_fix, /discard_fix
// ============================================================================

import { execSync } from 'child_process';
import { resolve } from 'path';
import { isValidHotfixBranch, safeGit } from '../shell.js';

export function register(bot, ctx) {
    const { CHAT_ID, CENTRAL_DIR, DEFAULT_PROJECT_DIR,
        getState, updateState, writeToInbox, registerCommand } = ctx;

    const WATCHER_LOG = resolve(CENTRAL_DIR, 'watcher.log');

    // /diagnose
    registerCommand(/^\/diagnose/, async (msg) => {
        let wLog = '(empty)', bLog = '(empty)';
        try { wLog = execSync(`tail -30 "${WATCHER_LOG}"`, { encoding: 'utf8', timeout: 3000 }).trim(); } catch { }
        try { bLog = execSync(`tail -30 "${CENTRAL_DIR}/bot.log"`, { encoding: 'utf8', timeout: 3000 }).trim(); } catch { }

        const prompt = [
            'You are a systems reliability engineer. The Antigravity bot/watcher system',
            'may be experiencing issues. Analyze the logs below and:',
            '',
            '1. Identify the ROOT CAUSE of any errors or crashes',
            '2. Determine if it is a code bug, config issue, or external failure',
            '3. Suggest a specific fix (file + line if possible)',
            '4. Rate severity: CRITICAL / HIGH / MEDIUM / LOW',
            '',
            'Do NOT modify any files. Output your analysis as plain text.',
            '',
            '=== WATCHER LOG (last 30 lines) ===',
            wLog,
            '',
            '=== BOT LOG (last 30 lines) ===',
            bLog
        ].join('\n');

        await bot.sendMessage(CHAT_ID, '🔍 Spawning diagnosis agent...');
        writeToInbox(prompt);
        console.log(`🔍 ${new Date().toISOString()} | /diagnose triggered`);
    });

    // /autofix
    registerCommand(/^\/autofix/, async (msg) => {
        try {
            const newState = updateState(s => {
                s.auto_fix_enabled = !s.auto_fix_enabled;
            });
            const status = newState.auto_fix_enabled
                ? '🔧 Auto-fix ENABLED — bot will attempt to self-repair on CRITICAL/HIGH crashes'
                : '🔒 Auto-fix DISABLED — diagnosis only (read-only mode)';
            await bot.sendMessage(CHAT_ID, status);
            console.log(`🔧 ${new Date().toISOString()} | /autofix: ${newState.auto_fix_enabled}`);
        } catch (err) {
            await bot.sendMessage(CHAT_ID, `❌ Toggle failed: ${err.message}`);
        }
    });

    // /apply_fix
    registerCommand(/^\/apply_fix/, async (msg) => {
        try {
            const branches = safeGit(['branch'], DEFAULT_PROJECT_DIR);
            const match = branches.match(/hotfix\/auto-\d+/);
            if (!match) {
                await bot.sendMessage(CHAT_ID, '❌ No pending hotfix branch found.');
                return;
            }
            const hotfix = match[0].trim();
            if (!isValidHotfixBranch(hotfix)) {
                await bot.sendMessage(CHAT_ID, '❌ Invalid hotfix branch name.');
                return;
            }
            safeGit(['checkout', 'main'], DEFAULT_PROJECT_DIR);
            safeGit(['merge', hotfix, '--no-edit'], DEFAULT_PROJECT_DIR);
            safeGit(['branch', '-d', hotfix], DEFAULT_PROJECT_DIR);
            await bot.sendMessage(CHAT_ID, `✅ Hotfix merged to main. Restarting bot...`);
            console.log(`✅ ${new Date().toISOString()} | /apply_fix: merged ${hotfix} to main`);
            setTimeout(() => process.exit(0), 500);
        } catch (err) {
            await bot.sendMessage(CHAT_ID, `❌ Apply failed: ${err.message}`);
        }
    });

    // /discard_fix
    registerCommand(/^\/discard_fix/, async (msg) => {
        try {
            const branches = safeGit(['branch'], DEFAULT_PROJECT_DIR);
            const match = branches.match(/hotfix\/auto-\d+/);
            if (!match) {
                await bot.sendMessage(CHAT_ID, '❌ No pending hotfix branch found.');
                return;
            }
            const hotfix = match[0].trim();
            if (!isValidHotfixBranch(hotfix)) {
                await bot.sendMessage(CHAT_ID, '❌ Invalid hotfix branch name.');
                return;
            }
            safeGit(['checkout', 'main'], DEFAULT_PROJECT_DIR);
            safeGit(['branch', '-D', hotfix], DEFAULT_PROJECT_DIR);
            await bot.sendMessage(CHAT_ID, `🗑️ Hotfix ${hotfix} discarded.`);
            console.log(`🗑️ ${new Date().toISOString()} | /discard_fix: deleted ${hotfix}`);
        } catch (err) {
            await bot.sendMessage(CHAT_ID, `❌ Discard failed: ${err.message}`);
        }
    });
}
