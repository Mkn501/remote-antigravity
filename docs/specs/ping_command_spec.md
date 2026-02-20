# Ping Command Specification (v3)

## 1. Executive Summary
This feature introduces a simple `/ping` command to the Telegram bot (v3 architecture). The command serves as a connectivity test, responding with "pong" to verify the bot is active and responsive.

**Goals:**
- Provide a quick, low-overhead connectivity check.
- Maintain existing security protocols (chat ID authorization).

## 2. Technical Design

### Components
- **Bot Command Handler**: A new regex-based command handler in `scripts/bot/commands/general.js`.
- **Authorization**: Must leverage the existing `authorized(msg)` check provided by `bot_v3.js`.

### Data Flow
1. User sends `/ping`.
2. Bot validates `authorized(msg)`.
3. If authorized, bot replies "pong".
4. If unauthorized, bot ignores (security by silence).

## 3. Implementation Plan

### Phase 1: Implementation
- **File**: `scripts/bot/commands/general.js`
- **Action**: Add `registerCommand(/^\/ping/, ...)` inside the `register` function.
- **Logic**: Simple reply "pong".

### Phase 2: Testing
- **File**: `scripts/bot/bot_test_v3.js`
- **Action**:
    1.  Add `/ping` to the `expectedCommands` list in the "Command Handler Coverage" contract test.
    2.  Add a new behavioral test case: `test('[behavioral] /ping replies pong', ...)` simulating a user message.
- **Verification**: `node scripts/bot/bot_test_v3.js`

## 4. Security & Risks
- **Risk**: Unauthorized users spamming ping.
- **Mitigation**: The standard `authorized(msg)` check will be applied. Unauthorized messages trigger no response.

## 5. Testing Strategy
| Component | Test Case | Expected Outcome |
|-----------|-----------|------------------|
| Bot (v3) | `/ping` from authorized user | Reply: "pong" |
| Bot (v3) | `/ping` from unauthorized user | No reply |
