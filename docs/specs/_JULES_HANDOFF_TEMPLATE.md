# Jules Handoff: [TASK-ID] — [Title]

<!--
  USAGE: Copy this template, fill in all sections, and paste into a GitHub Issue body.
  Apply the `jules` label to auto-trigger Jules.
  
  RULE: If you cannot fill in §4 (Files) and §6 (Code Anchors) with confidence,
  the task is too vague for Jules. Refine it or handle it manually.
-->

## 1. Mission (What)

<!-- One sentence. What does Jules need to build/fix? Be specific. -->
<!-- ✅ "Add nextPageToken pagination to the Gmail API fetch loop in ingestor/app.py" -->
<!-- ❌ "Fix the email bug" -->

## 2. Branch & Base

- **Base branch**: `main`
- **Target**: Jules will create a new branch automatically

## 3. Architecture Context (Where This Fits)

<!-- 
  Help Jules understand WHERE this code lives in the system.
  Include a mini-diagram if it helps:
  
  ```
  Gmail API → [gmail-mcp/app.py] → [ingestor/app.py] → Qdrant
  ```
  
  Mention relevant Named Patterns from AGENTS.md if applicable
  (e.g., "This uses the Sleeper Container pattern").
-->

## 4. Files to Touch

<!-- 
  STRICT: If this list has >3 files, the task is too large for Jules.
  Break it down further.
-->

| File | Action | Current Purpose |
|------|--------|----------------|
| `path/to/file.py` | MODIFY | [What this file does now] |
| `path/to/test_file.py` | CREATE / MODIFY | [What test should verify] |

## 5. Exact Requirements

<!-- Numbered, testable requirements. Each must have a clear pass/fail condition. -->

1. [ ] Requirement 1
2. [ ] Requirement 2
3. [ ] Requirement 3

## 6. Code Anchors

<!-- 
  Paste the EXACT function signatures / code blocks Jules will modify.
  This is the most critical section — it gives Jules precise insertion points.
  Include line numbers and file paths.
-->

```python
# File: path/to/file.py (lines 42-58)
def existing_function(param: str) -> dict:
    """Current docstring."""
    # ... existing implementation ...
    return result
```

**Expected change**: [Describe what should change in this function]

## 7. Coding Standards (Task-Specific)

<!-- 
  Override or augment AGENTS.md standards for this specific task.
  Delete this section if AGENTS.md standards are sufficient.
-->

- Import style: [e.g., `from app.utils import helper`]
- Error handling: [e.g., `raise ValueError("msg")` not `print("error")`]
- Logging: [e.g., `logger.info("Fetched %d emails", count)`]

## 8. What NOT To Do (Guardrails)

<!-- 
  CRITICAL: Jules tends to over-refactor. Be explicit about boundaries.
-->

- ❌ Do NOT modify any files not listed in §4
- ❌ Do NOT add new pip dependencies
- ❌ Do NOT change function signatures of public APIs
- ❌ Do NOT refactor existing code "while you're at it"
- ❌ Do NOT modify Docker or deployment configuration

## 9. Environment & Verification

<!-- 
  Exact commands Jules can run in its VM to test the changes.
  These MUST work in a clean checkout with only pip install.
-->

```bash
# Setup
cd path/to/service
pip install -r requirements.txt

# Run tests
python -m pytest tests/test_specific.py -v

# Expected output
# All tests pass. Specifically verify: [what to look for]
```

## 10. Acceptance Criteria

<!--
  The PR is mergeable if and only if ALL of these are true.
  Jules uses this as its own checklist.
-->

- [ ] All requirements in §5 are implemented
- [ ] Verification command in §9 passes
- [ ] No files outside §4 are modified
- [ ] No new dependencies added (unless specified in §5)
- [ ] Code follows standards in AGENTS.md + §7
- [ ] Test coverage: [new tests added / existing tests updated]
