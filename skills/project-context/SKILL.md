---
name: project-context
description: Load the important project architecture, commands, conventions, and runtime context before making non-trivial changes.
---

# Project Context

Use this skill before non-trivial project work, especially when making edits, debugging failures, changing configuration, adding features, or reviewing unfamiliar code.

## Read These First

Read the smallest useful set of context files, generally in this order:

1. `AGENTS.md` or `CLAUDE.md` from the current project and its parents
2. `README.md`
3. package, build, test, and tool configuration files relevant to the task
4. relevant source files for the current task
5. relevant tests, specs, docs, or examples

## Build a Working Mental Model

Before making changes, identify:

- how the project is structured
- how to run tests and checks
- how to build or start the project
- where runtime configuration lives
- what files are safe to edit
- what files are generated, vendored, secret, or risky
- the narrowest set of files needed for the task

## Operating Rules

- Prefer project conventions over personal preferences.
- Avoid broad rewrites unless explicitly requested.
- Make the smallest correct change.
- Preserve existing style and architecture where reasonable.
- Do not edit secrets or generated/vendor directories unless explicitly requested.
- Run the smallest useful validation after changes.
- Summarize changed files and validation results at the end.

## Completion Checklist

Before finishing, confirm:

- the relevant instructions were read
- the change is scoped and minimal
- validation was run or the reason for not running it is stated
- remaining risks or follow-ups are called out clearly
