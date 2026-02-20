// ============================================================================
// commands/project.js — /project, /add, /list + callback
// ============================================================================

import { existsSync } from 'fs';
import { resolve, isAbsolute } from 'path';

export function register(bot, ctx) {
    const { CHAT_ID, getState, updateState, DEFAULT_PROJECT_DIR, registerCommand, onCallback } = ctx;

    // /project (no args) — show picker
    registerCommand(/^\/project$/, async (msg) => {
        const state = getState();
        const projects = state.projects || {};
        const active = state.activeProject;

        const buttons = Object.entries(projects).map(([name, path]) => ({
            text: path === active ? `✅ ${name}` : name,
            callback_data: `project:${name}`
        }));
        const rows = [];
        for (let i = 0; i < buttons.length; i += 2) {
            rows.push(buttons.slice(i, i + 2));
        }

        await bot.sendMessage(CHAT_ID, `📂 Active: ${Object.entries(projects).find(([, p]) => p === active)?.[0] || 'unknown'}\nSelect a project:`, {
            reply_markup: { inline_keyboard: rows }
        });
    });

    // /project <name> — direct switch
    registerCommand(/^\/project\s+(.+)/, async (msg, match) => {
        const name = match[1].trim();
        const state = getState();

        if (!state.projects[name]) {
            await bot.sendMessage(CHAT_ID, `❌ Project "${name}" not found.\nUse /project to see available or /add to register.`);
            return;
        }

        updateState(s => s.activeProject = state.projects[name]);
        await bot.sendMessage(CHAT_ID, `✅ Switched to project: ${name}\n${state.projects[name]}`);
        console.log(`📂 Switched to project: ${name} (${state.projects[name]})`);
    });

    // /add <name> <path>
    registerCommand(/^\/add\s+(\S+)\s+(.+)/, async (msg, match) => {
        const name = match[1].trim();
        let path = match[2].trim();

        if (!isAbsolute(path)) {
            path = resolve(DEFAULT_PROJECT_DIR, path);
        }

        if (!existsSync(path)) {
            await bot.sendMessage(CHAT_ID, `❌ Directory not found:\n${path}`);
            return;
        }

        updateState(s => s.projects[name] = path);
        await bot.sendMessage(CHAT_ID, `✅ Added project: ${name}\n${path}`);
        console.log(`➕ Added project: ${name} -> ${path}`);
    });

    // /list
    registerCommand(/^\/list/, async (msg) => {
        const state = getState();
        const list = Object.entries(state.projects)
            .map(([name, path]) => `- ${name}: ${path} ${state.activeProject === path ? '(ACTIVE)' : ''}`)
            .join('\n');

        await bot.sendMessage(CHAT_ID, `📂 Available Projects:\n${list}`);
    });

    // Callback: project:<name>
    onCallback('project:', async (query) => {
        const chatId = query.message.chat.id;
        const msgId = query.message.message_id;
        const name = query.data.replace('project:', '');
        const state = getState();
        if (!state.projects[name]) return;

        updateState(s => s.activeProject = state.projects[name]);
        await bot.answerCallbackQuery(query.id, { text: `Switched to ${name}` });
        await bot.editMessageText(`📂 Switched to: ${name}`, { chat_id: chatId, message_id: msgId });
        console.log(`📂 ${new Date().toISOString()} | Project → ${name}`);
    });
}
