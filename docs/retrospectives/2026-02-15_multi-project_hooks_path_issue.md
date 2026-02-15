# Retrospective: Multi-Project Hooks Path Issue

**Date:** 2026-02-15
**Scope:** Multi-Project Support (Gemini CLI Hooks)
**Duration:** ~2 hours
**Severity:** High (Blocked Feature)

---

## Context

To enable multi-project support, the Gemini CLI hooks needed to be executed within arbitrary project directories while referencing the central hook scripts located in `remote antigravity` (which resides in `Google Drive/Meine Ablage/`, a path with spaces).

## What Was Done

1. Implemented `setup_project.sh` to configure target projects.
2. Attempted multiple strategies to point `settings.json` to the central hook scripts.
3. Settled on a **Wrapper Script** strategy to handle paths with spaces robustly.

---

## Trial & Error Log

### 1. Direct Absolute Paths (with Spaces)

- **Expected:** `settings.json` supports absolute paths with spaces if quoted.
- **Reality:** The Gemini CLI hook runner seemingly fails to parse the command string correctly when spaces are present, even with escaped quotes (`"command": "\"path with spaces...\""`).
- **Resolution:** Abandoned direct paths.

### 2. Symlinks

- **Expected:** Symlinking the hook directory to `~/.gemini/hooks` (no spaces) would allow `settings.json` to use a clean path.
- **Reality:** Gemini CLI resolves symlinks *before* execution or upon loading the configuration, resulting in the underlying spaced path being passed to the shell, which again failed with `bash: .../Meine: No such file`.
- **Resolution:** Abandoned symlinks.

### 3. Wrapper Scripts (Success)

- **Expected:** Create a static shell script in `~/.gemini/wa_bridge_wrappers/` (no spaces) that calls the real script using `exec`.
- **Reality:** Works perfectly. The Gemini CLI executes the wrapper (clean path), and the wrapper executes the real script (quoted path handles spaces).
- **Resolution:** Updated `setup_project.sh` to generate these wrappers automatically.

---

## Lessons Learned

| # | Lesson | Detail |
|---|--------|--------|
| 1 | **Gemini Hook Limitations** | The Gemini CLI hook runner is fragile with spaces in command paths. Do not rely on quoting. |
| 2 | **Symlink Resolution** | Gemini resolves symlinks eagerly, negating their utility for hiding spaces in paths. |
| 3 | **Wrapper Pattern** | When an external tool has shell parsing issues, use an intermediate wrapper script in a controlled path (`~/.local/...` or similar) to bridge the gap. |

---

## Files Changed

- `[NEW] scripts/setup_project.sh` — Configuration script that generates the wrappers.
- `[MODIFIED] scripts/watcher.sh` — Enhanced to support `HOOK_BRIDGE_DIR` injection.

---

## Lookup Tags

`hooks`, `gemini-cli`, `bash`, `paths`, `multi-project`
