---
description: Validate this Pi config before committing or syncing
argument-hint: "[focus]"
---

Check this Pi configuration: $ARGUMENTS

Scope: `~/.pi/agent` unless I specify another Pi config directory.

Workflow:
1. Inspect `git status --short`.
2. Validate JSON syntax for `settings.json`, `models.json`, `keybindings.json`, and `themes/*.json` when present.
3. Check prompt frontmatter for `prompts/*.md`.
4. Check agent frontmatter for `agents/*.md`.
5. Check skill frontmatter for `skills/*/SKILL.md`.
6. Look for likely accidentally tracked secrets or machine-local files, without printing secret contents.
7. Report whether `/reload` or restart is needed based on changed config areas.

Rules:
- Do not modify files.
- Do not read `auth.json`, auth backups, private keys, `.env` files, or other secret contents.
- Prefer metadata/listing checks over content inspection for sensitive paths.
- Keep checks local and fast.

Return:
- commands run
- pass/fail summary
- files or checks needing attention
- recommended next action
