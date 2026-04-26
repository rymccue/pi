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

Success means:
- current structure and callers were inspected
- the strategy explains what changes and what stays behaviorally identical
- implementation, if requested, is incremental and easy to review
- validation covers the behavior most likely to regress

Return changed files, verification, risks, and any follow-up needed.
