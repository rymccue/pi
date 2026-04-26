---
description: "Subagent workflow: review prompts, agents, skills, or workflow instructions with a prompt-reviewer"
argument-hint: "[scope]"
---

Use the `subagent` tool to run the `prompt-reviewer` agent.

Review scope: $ARGUMENTS

Constraints:
- Use only user-level agents (`agentScope: "user"`).
- Use the agent's frontmatter model/thinking settings; do not override them unless I explicitly request it.
- Do not use project-local agents unless I explicitly request them.
- Review only; do not modify files.
- Focus on clarity, conflicts, output contracts, tool scope, grounding, reliability, and whether instructions optimize for the intended user/workflow.

After the review completes, the main Pi session should inspect the findings before editing any prompt/agent/skill files.
