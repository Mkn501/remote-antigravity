# Project Brief

**Project Name**: Remote Antigravity
**Type**: Developer Tool / CLI Integration
**Priority**: Medium
**Status**: Initialization
**Standards**: [Federated Model SOP](../docs/standards/workstation_sop.md)

**Description**: Remote Antigravity bridges the Gemini CLI hook system with WhatsApp/Telegram messaging, enabling developers to run and control their Antigravity development sessions remotely from a mobile phone. It uses `BeforeAgent` hooks for inbound message injection and `AfterAgent` hooks for outbound status reporting, with a lightweight message bot as the platform adapter.

## Core Objectives
- [ ] Enable bidirectional communication between Gemini CLI and WhatsApp/Telegram
- [ ] Support the standard Antigravity lifecycle (`startup → implement → shutdown`) via mobile messaging
- [ ] Provide a "Sprint Mode" for autonomous task execution with remote monitoring
- [ ] Keep the system lightweight — no OpenClaw, no external gateways, just hooks + a bot

## Key Stakeholders
- User: Minh (Mkn501)
