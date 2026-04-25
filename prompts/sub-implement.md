---
description: Subagent workflow: scout, plan, then implement with a worker
argument-hint: "<task>"
---

Use the `subagent` tool with the `chain` parameter for this implementation workflow.

Task: $ARGUMENTS

Constraints:
- Use only user-level agents (`agentScope: "user"`).
- Do not use project-local agents unless I explicitly request them.
- Scout and planner are read-only.
- Only the worker should modify files.
- Keep the change small and validate narrowly.

Chain:
1. `scout`: Find code, tests, config, and docs relevant to the task. Return compact context with file paths and line ranges.
2. `planner`: Create a concrete implementation plan for the task using the scout findings. Use `{previous}` to pass scout output.
3. `worker`: Implement the planner's plan. Use `{previous}` to pass the plan. Summarize changed files and validation.
