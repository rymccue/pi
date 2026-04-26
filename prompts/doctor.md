---
description: Diagnose the current Pi session and personal config health
argument-hint: "[focus]"
---

Run a Pi doctor check: $ARGUMENTS

Scope: current session plus `~/.pi/agent` when available.

Workflow:
1. Summarize current working directory and relevant project/config instructions.
2. Report current git status for `~/.pi/agent` if it is a git repo.
3. Check whether expected Pi config files and directories exist: `settings.json`, `keybindings.json`, `models.json`, `AGENTS.md`, `prompts/`, `skills/`, `agents/`, `extensions/`, and `themes/`.
4. Validate JSON syntax for config/theme/model/keybinding files when present.
5. Check whether environment variables required by configured integrations appear to be set, especially `PARALLEL_API_KEY` and `OPENROUTER_API_KEY`; report set/missing only, never values.
6. List available custom prompt commands, skills, agents, themes, and extensions at a high level.
7. Note whether `/reload` or restart is likely needed.

Rules:
- Do not modify files.
- Do not print secrets or read secret file contents.
- Prefer concise diagnostics and concrete fixes.

Return:
- overall health: OK / warning / needs attention
- findings grouped by config area
- commands run
- recommended next actions
