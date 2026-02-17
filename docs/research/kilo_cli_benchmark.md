## 3. Results

> [!NOTE]
> **Updated 2026-02-17**: Original benchmark used default free model (`z-ai/glm-5`). Kilo CLI v1.0.21 now supports `--auto` for headless/pipeline use and `--model` for provider/model selection, making it viable as a primary backend with faster models.

- **Installation**: Requires npm global install (`npm i -g @kilocode/cli`).
- **Context Awareness**: Excellent. Successfully read and summarized `memory-bank` structure.
- **Headless Mode**: `kilo run --auto "prompt"` — fully autonomous, no user interaction needed. Suitable for CI/CD and `watcher.sh` integration.
- **Model Selection**: `kilo run --auto --model "provider/model" "prompt"` — supports 500+ models across 60+ providers.
- **Speed (default free model `z-ai/glm-5`)**: Very slow.
  - Simple File Write: ~18s
  - Code Edit: ~43s
- **Speed (with faster models)**: TBD — re-benchmark with `google/gemini-2.5-flash` recommended.
- **Reliability**: Good. Correctly modified code without hallucinations or deletion.

## 4. Conclusion

Kilo CLI is a **viable alternative backend** to Gemini CLI, especially when using faster models. Default free model is too slow for real-time chat, but with `--model google/gemini-2.5-flash` it should match Gemini CLI latency.

**Recommendation (Updated 2026-02-17):**
1.  **Implement as switchable backend** in `watcher.sh` via `run_agent()` abstraction. See [backend_agnostic_watcher_spec.md](../specs/backend_agnostic_watcher_spec.md).
2.  **Use `--model` with fast providers** (Google, Anthropic) for real-time chat loop.
3.  **Default free model** remains useful for background/batch tasks where latency doesn't matter.
4.  **Add Tavily MCP** for web search capability (Kilo lacks built-in search).
