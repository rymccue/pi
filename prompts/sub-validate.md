---
description: "Subagent workflow: run a no-edit validator to choose and execute focused checks"
argument-hint: "[scope/change/failure]"
---

Use the `subagent` tool to run the `validator` agent.

Validation scope: $ARGUMENTS

Constraints:
- Use only user-level agents (`agentScope: "user"`).
- Use the agent's frontmatter model/thinking settings; do not override them unless I explicitly request it.
- Do not use project-local agents unless I explicitly request them.
- Do not modify files.
- Run only inspection or validation commands.
- Do not install dependencies, update snapshots, run formatters that mutate files, deploy, migrate, restart services, or clean/reset repositories unless I explicitly request it.
- Choose the narrowest useful check first and report broader checks as optional follow-ups.

After validation completes, the main Pi session should inspect the result and decide whether fixes or broader checks are needed.
