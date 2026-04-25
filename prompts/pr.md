---
description: Review a PR, branch, or diff like a senior maintainer
argument-hint: "[base/ref/url/focus]"
---

Review this PR/branch/diff: $ARGUMENTS

Priorities:
- correctness and edge cases
- security and data-loss risk
- concurrency/race conditions
- API/backward compatibility
- tests that would catch the issue

Workflow:
1. Inspect the diff or referenced files first.
2. Verify assumptions with targeted searches.
3. Separate blocking issues from nits.
4. Do not edit files unless I explicitly ask.

Return blocking findings first with file paths, line references where possible, and concrete fixes.
