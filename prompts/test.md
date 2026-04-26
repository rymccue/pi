---
description: Find and run the narrowest useful validation for a task
argument-hint: "[what changed or failing behavior]"
---

Validate this work: $ARGUMENTS

Success means:
- project instructions and test/build config were checked when relevant
- the smallest meaningful checks were chosen before broad suites
- focused tests or checks were run first, with broader checks only when justified
- failures are summarized with likely cause and next debugging step

Do not make code changes unless I explicitly ask.

Return commands run, results, and recommended next action.
