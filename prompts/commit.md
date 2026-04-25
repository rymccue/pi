---
description: Prepare a high-signal commit from current git changes
argument-hint: "[scope/instructions]"
---

Prepare a commit for the current changes.

Instructions: $ARGUMENTS

Workflow:
1. Inspect `git status --short` and relevant diffs.
2. Identify unrelated or risky changes; do not stage or commit them without asking.
3. Run the narrowest relevant validation if appropriate.
4. Propose a concise conventional commit message.
5. Only create the commit if I explicitly asked you to commit.

Return:
- summary of changed files
- risks or follow-ups
- exact commit message
