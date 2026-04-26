---
description: "Subagent workflow: run a fast codebase search agent for ranked file and symbol discovery"
argument-hint: "<query>"
---

Use the `subagent` tool to run the `search` agent.

Query: $ARGUMENTS

Constraints:
- Use only user-level agents (`agentScope: "user"`).
- Use the agent's frontmatter model/thinking settings; do not override them unless I explicitly request it.
- Do not use project-local agents unless I explicitly request them.
- Search only; do not modify files.
- Prefer exact line/file findings, likely entry points, tests, docs, config, and call sites.
- If results are empty, require fallback searches before reporting no matches.

After the search completes, the main Pi session should inspect the returned Start Here files before planning or implementing.
