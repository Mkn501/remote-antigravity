// ============================================================================
// outbox.js — Outbox polling + sendAsFile + auto-trigger plan check
// ============================================================================

import { existsSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

export function startOutboxPoller(bot, ctx) {
    const { CHAT_ID, OUTBOX, CENTRAL_DIR, DISPATCH_FILE,
        readJsonSafe, atomicWrite, getState, updateState,
        POLL_INTERVAL_MS, MAX_MSG_LEN } = ctx;

    // Import plan helpers lazily to avoid circular deps
    let formatExecutionPlan, applyTierDefaults, saveExecutionPlan, loadExecutionPlan;
    import('./commands/plan.js').then(mod => {
        formatExecutionPlan = mod.formatExecutionPlan;
        applyTierDefaults = mod.applyTierDefaults;
        saveExecutionPlan = mod.saveExecutionPlan;
        loadExecutionPlan = mod.loadExecutionPlan;
    });

    const FILE_SEND_THRESHOLD = MAX_MSG_LEN;

    async function sendAsFile(text) {
        const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        const tmpFile = join(tmpdir(), `gemini_reply_${ts}.txt`);
        writeFileSync(tmpFile, text, 'utf8');
        const preview = text.substring(0, 200).replace(/\n/g, ' ') + '…';
        const caption = `📄 Full reply (${text.length} chars):\n${preview}`;

        try {
            await bot.sendDocument(CHAT_ID, tmpFile, {
                caption: caption.substring(0, 1024)
            });
        } finally {
            try { unlinkSync(tmpFile); } catch { /* ignore */ }
        }
    }

    let lastAutoTriggerPlanStatus = null;

    setInterval(async () => {
        // --- Auto-trigger: check for pending execution plans ---
        try {
            if (loadExecutionPlan && formatExecutionPlan) {
                const plan = loadExecutionPlan(getState);
                if (plan && plan.status === 'pending_approval' && plan.tasks?.length && lastAutoTriggerPlanStatus !== 'pending_approval') {
                    lastAutoTriggerPlanStatus = 'pending_approval';
                    applyTierDefaults(plan, getState);
                    plan.status = 'confirming';
                    saveExecutionPlan(plan, updateState);

                    await bot.sendMessage(CHAT_ID,
                        '📋 New execution plan ready!\n\n' +
                        formatExecutionPlan(plan) + '\n\n💡 Suggested by planner based on task tier.',
                        {
                            reply_markup: {
                                inline_keyboard: [
                                    [{ text: '🚀 Execute All', callback_data: 'ep_execute' }, { text: '✏️ Override Task', callback_data: 'ep_override' }],
                                    [{ text: '🔄 Re-plan', callback_data: 'ep_replan' }]
                                ]
                            }
                        }
                    );
                    console.log(`📋 ${new Date().toISOString()} | Auto-triggered execution plan review`);
                } else if (!plan || !plan.tasks?.length) {
                    lastAutoTriggerPlanStatus = null;
                }
            }
        } catch (err) {
            console.error(`Auto-trigger check error: ${err.message}`);
        }

        // --- Outbox relay ---
        if (!existsSync(OUTBOX)) return;

        const outbox = readJsonSafe(OUTBOX, { messages: [] });
        const unsent = outbox.messages.filter(m => !m.sent);
        if (unsent.length === 0) return;

        let dirty = false;
        for (const msg of unsent) {
            try {
                if (msg.type === 'document' && msg.filePath) {
                    if (existsSync(msg.filePath)) {
                        await bot.sendDocument(CHAT_ID, msg.filePath, {
                            caption: (msg.caption || '📎 Document').substring(0, 1024)
                        });
                        console.log(`📤 ${new Date().toISOString()} | 📎 DOC | ${msg.filePath}`);
                    } else {
                        console.error(`❌ Document not found: ${msg.filePath}`);
                    }
                    msg.sent = true;
                    dirty = true;
                    continue;
                }

                const text = msg.text || '(empty response)';
                const opts = {};
                if (msg.reply_markup) opts.reply_markup = msg.reply_markup;

                if (text.length > FILE_SEND_THRESHOLD) {
                    await sendAsFile(text);
                    if (msg.reply_markup) {
                        await bot.sendMessage(CHAT_ID, '👆 Full report attached above.', opts);
                    }
                } else {
                    await bot.sendMessage(CHAT_ID, text, opts);
                }

                msg.sent = true;
                dirty = true;

                const preview = text.length > 80 ? text.substring(0, 77) + '...' : text;
                const typeLabel = text.length > FILE_SEND_THRESHOLD ? '📄 FILE' : (msg.reply_markup ? '🔘 BTN' : '💬 TEXT');
                console.log(`📤 ${new Date().toISOString()} | ${typeLabel} | ${preview}`);
            } catch (err) {
                console.error(`❌ Send failed: ${err.message}`);
                break;
            }
        }

        if (dirty) {
            const fresh = readJsonSafe(OUTBOX, { messages: [] });
            const sentIds = new Set(unsent.filter(m => m.sent).map(m => m.id));
            for (const m of fresh.messages) {
                if (sentIds.has(m.id)) m.sent = true;
            }
            atomicWrite(OUTBOX, fresh);
        }
    }, POLL_INTERVAL_MS);
}
