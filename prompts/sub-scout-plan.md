---
description: Subagent workflow: scout relevant code, then produce a read-only implementation plan
argument-hint: "<task>"
---

Use the `subagent` tool with the `chain` parameter for this read-only workflow.

Task: $ARGUMENTS

Constraints:
- Use only user-level agents (`agentScope: "user"`).
- Do not use project-local agents unless I explicitly request them.
- Do not implement changes.

Chain:
1. `scout`: Find code, tests, config, and docs relevant to the task. Return compact context with file paths and line ranges.
2. `planner`: Create a concrete implementation plan for the task using the scout findings. Include files to modify, validation, and risks. Use `{previous}` to pass scout output.
