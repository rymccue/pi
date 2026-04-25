---
description: Subagent workflow: implement with a worker, review read-only, then fix issues if needed
argument-hint: "<task>"
---

Use the `subagent` tool with the `chain` parameter for this implementation-and-review workflow.

Task: $ARGUMENTS

Constraints:
- Use only user-level agents (`agentScope: "user"`).
- Do not use project-local agents unless I explicitly request them.
- Reviewer is read-only.
- Only worker steps should modify files.
- Keep changes small and validate narrowly.

Chain:
1. `worker`: Implement the task. Summarize changed files, validation, and risks.
2. `reviewer`: Review the worker's changes/context. Use `{previous}` to pass worker output. Return critical issues, warnings, suggestions, and line-specific feedback where possible.
3. `worker`: Address only critical and clearly actionable reviewer findings. Use `{previous}` to pass the review. If there are no required fixes, report that no further edits were needed.
