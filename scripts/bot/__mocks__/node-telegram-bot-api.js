// __mocks__/node-telegram-bot-api.js
// This mock is for testing purposes to intercept TelegramBot interactions.

let mockHandlers = [];
let mockReceivedMessages = [];
let mockTelegramBotInstance;

class MockTelegramBot {
    constructor(token, options) {
        this.token = token;
        this.options = options;
        mockTelegramBotInstance = this; // Store reference to this instance
        this._handlers = []; // Handlers specific to this instance
        mockHandlers = this._handlers; // Global reference for convenience in tests
        mockReceivedMessages = []; // Clear messages for new instance
        this.isPolling = options?.polling || false;
        this.onMessageHandler = null; // To capture the bot.on('message') handler
        this.onCallbackQueryHandler = null; // To capture the bot.on('callback_query') handler
        this.onErrorHandler = null; // To capture error handlers
    }

    onText(regexp, callback) {
        this._handlers.push({ regexp, callback });
    }

    sendMessage(chatId, text, options) {
        mockReceivedMessages.push({ chatId, text, options });
        return Promise.resolve({ message_id: mockReceivedMessages.length });
    }

    // New mock methods for other interactions if needed, e.g., sendDocument
    sendDocument(chatId, filePath, options) {
        mockReceivedMessages.push({ chatId, type: 'document', filePath, options });
        return Promise.resolve({ message_id: mockReceivedMessages.length });
    }

    // Mock callbackQuery handling
    answerCallbackQuery(queryId, options) {
        // In a real bot, this would send a response to Telegram
        // For testing, we just record that it was called
        mockReceivedMessages.push({ type: 'answerCallbackQuery', queryId, options });
        return Promise.resolve(true);
    }

    editMessageText(text, options) {
        mockReceivedMessages.push({ type: 'editMessageText', text, options });
        return Promise.resolve(true);
    }

    stopPolling() {
        this.isPolling = false;
    }

    // Helper to simulate incoming messages
    async _receiveMessage(msg) {
        let handled = false;
        // First, check onText handlers
        for (const handler of this._handlers) {
            if (msg.text) { // Only attempt to match onText if msg.text exists
                const match = msg.text.match(handler.regexp);
                if (match) {
                    await handler.callback(msg, match);
                    handled = true;
                    break;
                }
            }
        }

        // If no onText handler matched, and a general on('message') handler exists, call it
        if (!handled && this.onMessageHandler) {
            await this.onMessageHandler(msg);
            handled = true;
        }
        return handled;
    }

    // Helper to simulate incoming callback queries
    async _receiveCallbackQuery(query) {
        if (this.onCallbackQueryHandler) {
            await this.onCallbackQueryHandler(query);
            return true;
        }
        return false;
    }
}

// Store the actual on('callback_query') handler from bot.js
// This is a bit hacky but allows us to directly call it from the mock
// when we simulate a callback_query.
MockTelegramBot.prototype.on = function(event, listener) {
    if (event === 'callback_query') {
        this.onCallbackQueryHandler = listener;
    } else if (event === 'message') {
        // Store general message handler if needed for specific tests
        this.onMessageHandler = listener;
    } else if (event === 'polling_error' || event === 'error') {
        // Suppress or capture errors for testing
        this.onErrorHandler = listener;
    }
};


// Export a factory function to get the current mock instance's data
MockTelegramBot.__get
MockTelegramBot.__getHandlers = () => mockHandlers;
MockTelegramBot.__getReceivedMessages = () => mockReceivedMessages;
MockTelegramBot.__getTelegramBotInstance = () => mockTelegramBotInstance;
MockTelegramBot.__clearMocks = () => {
    mockHandlers = [];
    mockReceivedMessages = [];
    mockTelegramBotInstance = null;
};

// Default export is the class itself, so `import TelegramBot from 'node-telegram-bot-api'` works
export default MockTelegramBot;
