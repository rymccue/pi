---
description: Decide and run the right main-agent/subagent workflow for a task
argument-hint: "<task>"
---

Task: $ARGUMENTS

Act as the main orchestrator.

First decide the workflow:
- Direct main-session work for simple, low-risk tasks.
- Read-only scout/plan for unfamiliar or non-trivial tasks.
- Sequential worker implementation for bounded edits.
- Read-only review after implementation when changes are meaningful.

Rules:
- Parallelize only read-only subagents.
- Do not run multiple editing workers in the same working tree.
- Use only user-level agents unless I explicitly request project-local agents.
- Before final response, inspect changed files and validation results.

Proceed with the chosen workflow and briefly state why it was chosen.
