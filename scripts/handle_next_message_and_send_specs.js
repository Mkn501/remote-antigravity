
const fs = require('fs');
const path = require('path');

const GEMINI_DIR = path.resolve('.gemini');
const INBOX = path.join(GEMINI_DIR, 'wa_inbox.json');
const OUTBOX = path.join(GEMINI_DIR, 'wa_outbox.json');
const SPECS_DIR = path.resolve('docs/specs');

// 1. Mark unread messages as read in INBOX
if (fs.existsSync(INBOX)) {
    try {
        const inbox = JSON.parse(fs.readFileSync(INBOX, 'utf8'));
        let modified = false;
        inbox.messages.forEach(msg => {
            if (!msg.read) {
                console.log(`Marking message ${msg.id} as read: "${msg.text}"`);
                msg.read = true;
                modified = true;
            }
        });
        if (modified) {
            const tempFile = `${INBOX}.tmp`;
            fs.writeFileSync(tempFile, JSON.stringify(inbox, null, 2));
            fs.renameSync(tempFile, INBOX);
        }
    } catch (e) {
        console.error('Error updating inbox:', e);
    }
}

// 2. Find top 3 modified specs
let specs = [];
if (fs.existsSync(SPECS_DIR)) {
    specs = fs.readdirSync(SPECS_DIR)
        .filter(f => f.endsWith('.md') && !f.startsWith('_'))
        .map(f => {
            const fullPath = path.join(SPECS_DIR, f);
            return {
                path: fullPath,
                mtime: fs.statSync(fullPath).mtimeMs,
                name: f
            };
        })
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, 3);
}

if (specs.length === 0) {
    console.log('No specs found.');
    process.exit(0);
}

// 3. Add specs to OUTBOX
const messagesToAdd = specs.map(spec => ({
    id: `doc_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    timestamp: new Date().toISOString(),
    from: 'agent',
    type: 'document',
    filePath: spec.path,
    caption: `📄 ${spec.name}`,
    sent: false
}));

let outbox = { messages: [] };
if (fs.existsSync(OUTBOX)) {
    try {
        outbox = JSON.parse(fs.readFileSync(OUTBOX, 'utf8'));
    } catch (e) {
        console.error('Error reading outbox:', e);
    }
}

outbox.messages.push(...messagesToAdd);

// Atomic write outbox
const tempOutbox = `${OUTBOX}.tmp`;
fs.writeFileSync(tempOutbox, JSON.stringify(outbox, null, 2));
fs.renameSync(tempOutbox, OUTBOX);

console.log(`Added ${specs.length} specs to outbox:`);
specs.forEach(s => console.log(`- ${s.name}`));
