
const fs = require('fs');
const path = require('path');

const GEMINI_DIR = path.resolve('.gemini');
const OUTBOX = path.join(GEMINI_DIR, 'wa_outbox.json');

// Helper to find latest logs
function findLatestLog(prefix) {
    // Check for active log first (e.g. bot.log)
    const active = path.join(GEMINI_DIR, `${prefix}.log`);
    if (fs.existsSync(active)) return active;

    // Fallback to latest rotated log
    const files = fs.readdirSync(GEMINI_DIR)
        .filter(f => f.startsWith(`${prefix}.log.`))
        .sort()
        .reverse();
    
    if (files.length > 0) return path.join(GEMINI_DIR, files[0]);
    return null;
}

const botLog = findLatestLog('bot');
const watcherLog = findLatestLog('watcher');

const messagesToAdd = [];

if (botLog) {
    console.log(`Found bot log: ${botLog}`);
    messagesToAdd.push({
        id: `doc_${Date.now()}_bot`,
        timestamp: new Date().toISOString(),
        from: 'agent',
        type: 'document',
        filePath: botLog,
        caption: '📄 Bot Log',
        sent: false
    });
}

if (watcherLog) {
    console.log(`Found watcher log: ${watcherLog}`);
    messagesToAdd.push({
        id: `doc_${Date.now()}_watcher`,
        timestamp: new Date().toISOString(),
        from: 'agent',
        type: 'document',
        filePath: watcherLog,
        caption: '📄 Watcher Log',
        sent: false
    });
}

if (messagesToAdd.length === 0) {
    console.log('No logs found.');
    process.exit(0);
}

// Read outbox
let outbox = { messages: [] };
if (fs.existsSync(OUTBOX)) {
    try {
        outbox = JSON.parse(fs.readFileSync(OUTBOX, 'utf8'));
    } catch (e) {
        console.error('Error reading outbox:', e);
    }
}

// Append
outbox.messages.push(...messagesToAdd);

// Atomic write
const tempFile = `${OUTBOX}.tmp`;
fs.writeFileSync(tempFile, JSON.stringify(outbox, null, 2));
fs.renameSync(tempFile, OUTBOX);

console.log(`Added ${messagesToAdd.length} files to outbox.`);
