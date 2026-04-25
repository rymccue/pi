---
description: Find and run the narrowest useful validation for a task
argument-hint: "[what changed or failing behavior]"
---

Validate this work: $ARGUMENTS

Workflow:
1. Read project instructions and test/build config.
2. Identify the smallest meaningful checks before broad suites.
3. Run focused tests first, then broader checks only if justified.
4. If a check fails, summarize the failure and likely cause.
5. Do not make code changes unless I explicitly ask.

Return commands run, results, and recommended next action.
