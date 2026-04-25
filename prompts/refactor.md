---
description: Plan or perform a low-risk refactor with guardrails
argument-hint: "<target> [goal]"
---

Refactor target: $ARGUMENTS

Constraints:
- preserve behavior unless explicitly requested
- prefer small mechanical steps
- avoid broad rewrites
- keep public APIs compatible unless asked
- add/update tests only where they prove behavior

Workflow:
1. Inspect current structure and callers.
2. State the refactor strategy and risk points.
3. If implementation is requested, edit incrementally and validate.
4. Summarize changed files and verification.
