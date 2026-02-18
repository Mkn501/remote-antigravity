# /version Command Spec

## Executive Summary
This feature adds a `/version` command to the Telegram bot. This allows users to quickly verify the running version of the bot and its uptime, which is useful for confirming deployments and monitoring bot health.

## Technical Design

### Components

1.  **Telegram Bot (`scripts/bot/bot.js`)**
    -   **Handler**: New command handler for `/version`.
    -   **Logic**:
        -   Read `version` from `package.json`.
        -   Calculate uptime using `process.uptime()` (seconds -> H:M:S format).
        -   Send formatted message to `CHAT_ID`.

2.  **Configuration (`scripts/bot/package.json`)**
    -   Source of truth for the version number.

### Interface

-   **Command**: `/version`
-   **Response**:
    ```text
    🤖 wa-bridge v0.1.0
    ⏱️ Uptime: 1h 23m 45s
    ```

## Implementation Tasks

1.  **Update Bot Logic**: Add `/version` handler in `bot.js`.
