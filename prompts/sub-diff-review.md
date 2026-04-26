---
description: "Subagent workflow: review current changes with a diff-focused reviewer"
argument-hint: "[focus]"
---

Use the `subagent` tool to run the `diff-reviewer` agent.

Focus: $ARGUMENTS

Constraints:
- Use only user-level agents (`agentScope: "user"`).
- Use the agent's frontmatter model/thinking settings; do not override them unless I explicitly request it.
- Do not use project-local agents unless I explicitly request them.
- Review only; do not modify files.
- Inspect current git status/diff if available.
- Identify blocking issues, warnings, validation gaps, and likely unintended changes.

After the review completes, the main Pi session must inspect changed files and validation status before reporting final completion to the user.
