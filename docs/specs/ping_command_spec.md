# Ping Command Specification

## 1. Executive Summary
This feature introduces a simple `/ping` command to the Telegram bot. The command serves as a connectivity test, responding with "pong" to verify the bot is active and responsive.

**Goals:**
- Provide a quick, low-overhead connectivity check.
- Maintain existing security protocols (chat ID authorization).

## 2. Technical Design

### Components
- **Bot Command Handler**: A new regex-based command handler in `scripts/bot/commands/general.js`.
- **Authorization**: Must leverage the existing `authorized(msg)` check.

### Data Flow
1. User sends `/ping`.
2. Bot validates `authorized(msg)`.
3. If authorized, bot replies "pong".
4. If unauthorized, bot ignores (security by silence).

## 3. Implementation Plan

### Phase 1: Implementation
- **File**: `scripts/bot/commands/general.js`
- **Action**: Add `registerCommand(/^\/ping/, ...)`
- **Logic**: Simple reply "pong".

### Phase 2: Testing
- **File**: `scripts/bot/bot.test.js`
- **Action**: Add a new test case `test('Command: /ping replies pong', ...)`
- **Verification**: `npm test` (runs `node bot.test.js`)

## 4. Security & Risks
- **Risk**: Unauthorized users spamming ping.
- **Mitigation**: The standard `authorized(msg)` check will be applied. Unauthorized messages trigger no response.

## 5. Testing Strategy
| Component | Test Case | Expected Outcome |
|-----------|-----------|------------------|
| Bot | `/ping` from authorized user | Reply: "pong" |
| Bot | `/ping` from unauthorized user | No reply |
