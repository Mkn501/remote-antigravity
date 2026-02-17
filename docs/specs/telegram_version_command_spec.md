# Spec: Telegram Bot `/version` Command

## 1. Executive Summary & Goals

### 1.1 Executive Summary
This document outlines the design and implementation plan for adding a `/version` command to the Telegram bot. This command will allow users to query the bot's current version and its uptime.

### 1.2 Goals
- Provide a simple command for users to check the bot's operational status (uptime) and deployed version.
- Enhance bot maintainability by making version information easily accessible.
- Adhere to existing security patterns by ensuring the command is authenticated.

## 2. Technical Design

### 2.1 Command Handler
- A new command handler will be added to `scripts/bot/bot.js` to listen for the `/version` command.
- The handler will perform a `CHAT_ID` authentication check as per existing patterns to prevent unauthorized access.

### 2.2 Version Retrieval
- The bot's version will be read from the `version` field in the `package.json` file located at `scripts/bot/package.json`.
- This will be a one-time read during bot initialization or cached for subsequent calls.

### 2.3 Uptime Calculation
- The bot's startup timestamp will be recorded when `bot.js` is initialized.
- Uptime will be calculated by subtracting the startup timestamp from the current time and formatting it into a human-readable string (e.g., "X days, Y hours, Z minutes").

### 2.4 Response Format
- The bot will respond with a message similar to:
  ```
  Telegram Bot
  Version: 1.0.0
  Uptime: 0 days, 1 hour, 30 minutes
  ```

## 3. Testing

### 3.1 Unit Tests
- **New Tests**: `scripts/bot/bot.test.js`
  - [ ] Test case 1: Verify the `/version` command returns the correct version from `package.json`.
  - [ ] Test case 2: Verify the `/version` command returns a correctly formatted uptime.
  - [ ] Test case 3: Verify the `/version` command is protected by `CHAT_ID` authentication.
- **Verification**: `npm test -- scripts/bot/bot.test.js`

## 4. Open Source & Commercialization Impact
- This feature has no specific open-source or commercialization impact. It utilizes existing libraries and patterns.

## 5. Implementation Phases (N/A - simple feature)

## 6. Security & Risks
- **Risk**: Unauthorized access to `/version` command.
- **Mitigation**: Implement `CHAT_ID` authentication in the command handler, as identified in `docs/retrospectives/2026-02-16_telegram_bot_security_review.md`.

## 7. Testing (detailed in 3.1)
