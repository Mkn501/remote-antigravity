# Retrospective Index

## Tag Vocabulary

`docker` · `mcp` · `cloud` · `config` · `network` · `testing` · `security` · `regression` · `hooks` · `whatsapp` · `telegram` · `gemini-cli`

> Add new tags as needed. Keep vocabulary concise — prefer existing tags over new ones.

## Index

| Date | File | Tags | Key Lesson |
|------|------|------|------------|
| 2026-02-16 | [telegram_bot_security_review](2026-02-16_telegram_bot_security_review.md) | `security`, `telegram`, `gemini-cli` | Auth every handler — callback queries need same CHAT_ID check as messages |
| 2026-02-15 | [multi-project_hooks_path_issue](2026-02-15_multi-project_hooks_path_issue.md) | `hooks`, `gemini-cli`, `config` | Spaces in paths break Gemini CLI hooks |
| 2026-02-18 | [telegram_plan_mode_and_model_reliability](2026-02-18_telegram_plan_mode_and_model_reliability.md) | `telegram`, `regression`, `gemini-cli` | Callback data must match exactly between sender and handler — string mismatch causes silent UI failures |
| 2026-02-17 | [kilo_cli_backend_abstraction](2026-02-17_kilo_cli_backend_abstraction.md) | `gemini-cli`, `testing`, `regression`, `kilo` | Never trust AI research without web search — always enforce Google Search for research tasks |
| 2026-03-01 | [multi_project_dispatch_routing_bug](2026-03-01_multi_project_dispatch_routing_bug.md) | `gemini-cli`, `multi-project`, `dispatch`, `routing` | Dispatch files must be self-contained — carry originating project path, not rely on transient state |
