# Pi Agent Configuration

Personal Pi configuration for sharing across machines.

## Included

- `settings.json` — global Pi defaults
- `keybindings.json` — global keyboard shortcut overrides
- `AGENTS.md` — global agent guidance
- `prompts/` — global slash prompt templates
- `skills/` — global skills
- `agents/` — global subagent definitions used by the `subagent` extension
- `extensions/` — global TypeScript extensions (`parallel-search.ts` requires `PARALLEL_API_KEY`)
- `themes/` — global TUI themes
- `models.json` — custom model registry, if used
- `bootstrap.sh` — safe one-command setup/update script for new machines

## Excluded

The `.gitignore` intentionally excludes:

- `auth.json`, auth backups, and local Codex subscription profiles
- session JSONL/history files
- runtime binaries and package artifacts
- local caches and logs

Do not commit secrets or machine-specific runtime files.

## Subagents

The `subagent` extension delegates work to isolated `pi` subprocesses using agent definitions in `agents/`.

Primary agents:

- `search` — locate files, symbols, call sites, tests, docs, and config (`openai-codex/gpt-5.5:low`)
- `scout` — synthesize read-only codebase context for handoff (`openai-codex/gpt-5.5:low`)
- `planner` — produce concrete implementation plans for non-trivial work (`openai-codex/gpt-5.5:high`)
- `validator` — run no-edit focused checks and summarize failures (`openai-codex/gpt-5.5:medium`)
- `reviewer` — review code/context for correctness, maintainability, risk, and missing validation (`openai-codex/gpt-5.5:high`)
- `diff-reviewer` — review current git changes and worker output (`openai-codex/gpt-5.5:high`)
- `prompt-reviewer` — review prompts, agents, skills, and workflow instructions (`openai-codex/gpt-5.5:high`)
- `worker` — bounded implementation with bash/edit/write tools; the only editing subagent (`openai-codex/gpt-5.5:high`)

Compatibility/fallback agents:

- `code-reviewer` / `review` — read-only aliases for `reviewer`; do not maintain separate behavior
- `default` — safe read-only fallback for accidental default-agent requests; prefer a specific agent

Workflow prompts:

- `/orchestrate <task>` — choose direct work, scout/plan, implementation, and review workflow for a task
- `/search-code <query>` — run the fast search agent for ranked file/symbol discovery
- `/sub-scout-plan <task>` — scout relevant context, then produce a read-only plan
- `/sub-implement <task>` — scout, plan, then implement with worker
- `/sub-implement-review <task>` — implement, review read-only, then fix required issues
- `/sub-diff-review [focus]` — review current git changes with the diff-focused reviewer
- `/sub-validate [scope]` — run the no-edit validator for focused checks
- `/sub-prompt-review [scope]` — review prompts, agents, skills, or workflow instructions

Utility prompts:

- `/config-check [focus]` — validate this Pi config before committing or syncing
- `/doctor [focus]` — diagnose current Pi session and personal config health
- `/test [scope]` — find and run the narrowest useful validation
- `/status [scope]` — summarize current project or task status

Power-user extension commands:

- `/usage` — user-facing usage dashboard for current session cost/token usage, including nested subagent usage; passive only, no agent guidance
- `/goal [objective|pause|resume|continue|clear|status]` — set and manage a persistent thread goal with Codex-style auto-continuation and `get_goal`/`create_goal`/`update_goal` model tools
- `/checkpoint [label]` — label the current session tree point for resume/navigation
- `/session-hygiene` — report whether the session should be named, labeled, compacted, or handed off
- `/ctx` — show current context/token usage
- `/tools readonly|safe|full|list` — switch active tool presets
- `/compact-now [instructions]` — trigger generic/manual compaction with optional instructions
- `/smart-compact [focus]` — trigger high-quality phase-boundary compaction that preserves goal, working set, decisions, validation, file memory, blockers, and next actions
- `/compaction-status` — show compaction count/source, latest metadata, context usage, and repeated-read heuristics
- `/commands [extension|prompt|skill]` — list available custom commands
- `/codex-subscription status|list|save <name>|use <name>|sync|remove <name>` — manage local OpenAI Codex subscription profiles; `/codex` is an alias

Safety notes:

- Subagents default to user-level agents from `~/.pi/agent/agents`.
- Do not use project-local `.pi/agents` unless explicitly requested for a trusted repository.
- `search` is read-only but has tightly restricted bash for search/status/history inspection.
- Use parallel subagents only for read-only investigation; do not run multiple editing workers in parallel.
- Run `/reload` or restart Pi after changing agents, prompts, skills, extensions, settings, models, themes, or keybindings.
- Prefer `/smart-compact <phase/focus>` at task phase boundaries (after reconnaissance, planning, implementation, or validation) so compaction preserves operational state and reduces re-reading. Built-in `/compact [instructions]` and `/compact-now [instructions]` remain generic/manual fallbacks.

## Install on another machine

Bootstrap with one command:

```bash
curl -fsSL https://raw.githubusercontent.com/rymccue/pi/main/bootstrap.sh | bash
```

Safer inspect-first variant:

```bash
curl -fsSL https://raw.githubusercontent.com/rymccue/pi/main/bootstrap.sh -o /tmp/pi-bootstrap.sh
less /tmp/pi-bootstrap.sh
bash /tmp/pi-bootstrap.sh
```

The bootstrap script:

- installs Pi with `npm install -g @mariozechner/pi-coding-agent` if `pi` is missing and `npm` is available
- clones this repo into `~/.pi/agent`
- updates an existing matching clone with `git pull --ff-only`
- backs up a pre-existing non-matching `~/.pi/agent` to `~/.pi/agent.backup.<timestamp>`
- leaves dirty matching clones untouched so local edits are not overwritten

Optional overrides:

```bash
PI_BOOTSTRAP_INSTALL_PI=0 bash /tmp/pi-bootstrap.sh      # skip Pi npm install
PI_BOOTSTRAP_UPDATE=0 bash /tmp/pi-bootstrap.sh          # skip git pull on existing clone
PI_CODING_AGENT_DIR=/path/to/agent bash /tmp/pi-bootstrap.sh
PI_CONFIG_REPO=https://github.com/rymccue/pi.git bash /tmp/pi-bootstrap.sh
PI_CONFIG_BRANCH=main bash /tmp/pi-bootstrap.sh
```

Authenticate separately on each machine:

```bash
pi
/login
```

or provide provider API keys via environment variables.

For multiple ChatGPT/Codex subscriptions on one machine:

```text
/login openai-codex
/codex-subscription save personal
/login openai-codex
/codex-subscription save work
/codex-subscription use personal
```

Codex subscription profiles are stored locally under `~/.pi/agent/codex-subscriptions/` and are intentionally ignored by git.

Useful environment variables:

- `PARALLEL_API_KEY` — required for `parallel-search.ts` tools: `web_search`, `web_extract`, and `research`
- `OPENROUTER_API_KEY` — required for OpenRouter models configured in `models.json`

After install, useful smoke checks inside Pi:

```text
/reload
/commands
/tools list
/doctor
```

## Updating

After changing config on one machine:

```bash
cd ~/.pi/agent
git status
```

Inside Pi, run:

```text
/config-check
```

Then commit and push:

```bash
cd ~/.pi/agent
git add AGENTS.md settings.json keybindings.json prompts skills agents extensions themes models.json bootstrap.sh .gitignore README.md
git commit -m "Update Pi config"
git push
```

On another machine:

```bash
cd ~/.pi/agent
git pull
```

In a running Pi session, use `/reload` or restart Pi.
