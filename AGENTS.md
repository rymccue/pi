# Global Pi Agent Guidance

These instructions apply to Pi sessions by default. Project-local `AGENTS.md` or `CLAUDE.md` files may add more specific guidance.

## Working Style

- Be concise, practical, and explicit about assumptions.
- Prefer the smallest correct change over broad rewrites.
- Inspect relevant files before editing.
- Preserve existing project conventions unless asked to change them.
- State validation performed, or explain why validation was not run.

## Safety

- Before large or destructive changes, explain the risk and ask for confirmation.

## Recommended Skill

Use `/skill:project-context` or load the `project-context` skill when beginning non-trivial work in a project.

## Preferred Workflow

1. Understand the request and project context.
2. Inspect the smallest relevant file set.
3. Plan briefly for non-trivial work.
4. Edit precisely.
5. Run focused validation.
6. Summarize results with clear file paths.

## Orchestrator Mode

Use the main Pi session as the coordinator for non-trivial work.

Default decision rule:
- Do simple, obvious, single-area tasks directly in the main session.
- Use read-only subagents when context discovery, planning, or review would reduce main-context noise.
- Use implementation workers only for bounded tasks with clear files, constraints, and validation.
- Do not run multiple editing workers in parallel in the same working tree.
- Main Pi must inspect worker changes before reporting completion.

Subagent workflow preference:
1. Scout unfamiliar code read-only.
2. Plan read-only when implementation is non-trivial.
3. Implement with at most one worker.
4. Review with a read-only reviewer when changes are meaningful.
5. Main Pi validates and summarizes.
