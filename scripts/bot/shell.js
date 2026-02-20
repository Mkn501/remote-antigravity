// ============================================================================
// shell.js — Safe shell execution helpers
// ============================================================================
// Fixes SEC-1 (shell injection) and SEC-2 (broad pkill) from the refactoring
// spec. All external process calls use execFileSync (no shell interpolation)
// or targeted pkill patterns.
// ============================================================================

import { execSync, execFileSync } from 'child_process';

/**
 * Validate a hotfix branch name against the strict pattern.
 * Only allows `hotfix/auto-<digits>` — rejects anything else.
 *
 * @param {string} name - Branch name to validate
 * @returns {boolean} true if valid
 */
function isValidHotfixBranch(name) {
    return /^hotfix\/auto-\d+$/.test(name);
}

/**
 * Kill running CLI agent processes using specific patterns.
 * Fixes SEC-2: uses targeted patterns instead of broad `pkill -f "gemini"`.
 *
 * - `gemini -p` matches only stateless Gemini CLI prompt calls (not `gemini settings` etc.)
 * - `node.*kilo` matches the Kilo CLI node process
 */
function killAgent() {
    try {
        execSync('pkill -f "gemini -p" 2>/dev/null || true');
    } catch { /* no process found */ }
    try {
        execSync('pkill -f "node.*kilo" 2>/dev/null || true');
    } catch { /* no process found */ }
}

/**
 * Execute a git command safely using execFileSync (no shell interpolation).
 * Fixes SEC-1: arguments are passed as an array, so metacharacters like
 * `; rm -rf /` are treated as literal git arguments.
 *
 * @param {string[]} args - Git arguments (e.g., ['checkout', 'main'])
 * @param {string} cwd - Working directory
 * @returns {string} stdout
 */
function safeGit(args, cwd) {
    return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

export { isValidHotfixBranch, killAgent, safeGit };
