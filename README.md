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

## Excluded

The `.gitignore` intentionally excludes:

- `auth.json` and auth backups
- session JSONL/history files
- runtime binaries and package artifacts
- local caches and logs

Do not commit secrets or machine-specific runtime files.

## Subagents

The `subagent` extension delegates work to isolated `pi` subprocesses using agent definitions in `agents/`.

Global agents:

- `scout` — read-only reconnaissance (`openai-codex/gpt-5.5:medium`)
- `planner` — read-only implementation planning (`openai-codex/gpt-5.5:high`)
- `reviewer` — read-only code review (`openai-codex/gpt-5.5:high`)
- `worker` — implementation with edit/write/bash tools (`openai-codex/gpt-5.5:high`)

Workflow prompts:

- `/sub-scout-plan <task>` — scout relevant context, then produce a read-only plan
- `/sub-implement <task>` — scout, plan, then implement with worker
- `/sub-implement-review <task>` — implement, review read-only, then fix required issues

Safety notes:

- Subagents default to user-level agents from `~/.pi/agent/agents`.
- Do not use project-local `.pi/agents` unless explicitly requested for a trusted repository.
- Use parallel subagents only for read-only investigation; do not run multiple editing workers in parallel.
- Run `/reload` or restart Pi after changing agents, prompts, or extensions.

## Install on another machine

Option A: clone directly as the Pi config directory:

```bash
mkdir -p ~/.pi
mv ~/.pi/agent ~/.pi/agent.backup.$(date +%Y%m%d%H%M%S) 2>/dev/null || true
git clone <YOUR_REMOTE_URL> ~/.pi/agent
```

Option B: clone elsewhere and symlink:

```bash
git clone <YOUR_REMOTE_URL> ~/dotfiles/pi-agent
mkdir -p ~/.pi
mv ~/.pi/agent ~/.pi/agent.backup.$(date +%Y%m%d%H%M%S) 2>/dev/null || true
ln -s ~/dotfiles/pi-agent ~/.pi/agent
```

Then authenticate separately on each machine:

```bash
pi
/login
```

or provide provider API keys via environment variables.

## Updating

After changing config on one machine:

```bash
cd ~/.pi/agent
git status
git add AGENTS.md settings.json keybindings.json prompts skills agents extensions themes models.json .gitignore README.md
git commit -m "Update Pi config"
git push
```

On another machine:

```bash
cd ~/.pi/agent
git pull
```

In a running Pi session, use `/reload` or restart Pi.
