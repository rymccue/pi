#!/usr/bin/env bash
set -Eeuo pipefail

# Bootstrap Ryan's Pi global config on a new machine.
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/rymccue/pi/main/bootstrap.sh | bash
#
# Optional overrides:
#   PI_CONFIG_REPO=https://github.com/rymccue/pi.git
#   PI_CONFIG_BRANCH=main
#   PI_CODING_AGENT_DIR=$HOME/.pi/agent
#   PI_BOOTSTRAP_INSTALL_PI=0   # skip npm install -g if pi is missing
#   PI_BOOTSTRAP_UPDATE=0       # skip git pull for an existing matching clone

REPO_URL="${PI_CONFIG_REPO:-https://github.com/rymccue/pi.git}"
BRANCH="${PI_CONFIG_BRANCH:-main}"
TARGET_DIR="${PI_CODING_AGENT_DIR:-${PI_AGENT_DIR:-$HOME/.pi/agent}}"
INSTALL_PI="${PI_BOOTSTRAP_INSTALL_PI:-1}"
UPDATE_EXISTING="${PI_BOOTSTRAP_UPDATE:-1}"

log() {
	printf '\033[1;34m==>\033[0m %s\n' "$*"
}

warn() {
	printf '\033[1;33mWARN:\033[0m %s\n' "$*" >&2
}

die() {
	printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2
	exit 1
}

have() {
	command -v "$1" >/dev/null 2>&1
}

normalize_repo_url() {
	local url="${1%.git}"
	case "$url" in
		git@github.com:*) printf 'https://github.com/%s' "${url#git@github.com:}" ;;
		http://github.com/*) printf 'https://github.com/%s' "${url#http://github.com/}" ;;
		*) printf '%s' "$url" ;;
	esac
}

backup_path_for() {
	local path="$1"
	local stamp candidate index
	stamp="$(date +%Y%m%d%H%M%S)"
	candidate="${path}.backup.${stamp}"
	index=1
	while [ -e "$candidate" ] || [ -L "$candidate" ]; do
		candidate="${path}.backup.${stamp}.${index}"
		index=$((index + 1))
	done
	printf '%s' "$candidate"
}

is_empty_dir() {
	[ -d "$1" ] && [ -z "$(find "$1" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]
}

is_dirty_git_worktree() {
	local dir="$1"
	if ! git -C "$dir" diff --quiet --ignore-submodules --; then
		return 0
	fi
	if ! git -C "$dir" diff --cached --quiet --ignore-submodules --; then
		return 0
	fi
	if [ -n "$(git -C "$dir" ls-files --others --exclude-standard)" ]; then
		return 0
	fi
	return 1
}

clone_config() {
	mkdir -p "$(dirname "$TARGET_DIR")"
	log "Cloning Pi config into $TARGET_DIR"
	git clone --branch "$BRANCH" "$REPO_URL" "$TARGET_DIR"
}

install_or_update_config() {
	if [ -d "$TARGET_DIR/.git" ]; then
		local current_remote normalized_current normalized_wanted current_branch
		current_remote="$(git -C "$TARGET_DIR" remote get-url origin 2>/dev/null || true)"
		normalized_current="$(normalize_repo_url "$current_remote")"
		normalized_wanted="$(normalize_repo_url "$REPO_URL")"

		if [ "$normalized_current" = "$normalized_wanted" ]; then
			log "Pi config repo already exists at $TARGET_DIR"
			if [ "$UPDATE_EXISTING" = "0" ]; then
				log "Skipping update because PI_BOOTSTRAP_UPDATE=0"
				return
			fi
			if is_dirty_git_worktree "$TARGET_DIR"; then
				warn "Existing config has uncommitted or untracked changes; leaving it untouched."
				warn "Review with: git -C '$TARGET_DIR' status --short"
				return
			fi

			log "Updating existing config with git pull --ff-only"
			git -C "$TARGET_DIR" fetch origin "$BRANCH"
			current_branch="$(git -C "$TARGET_DIR" branch --show-current 2>/dev/null || true)"
			if [ "$current_branch" != "$BRANCH" ]; then
				git -C "$TARGET_DIR" checkout "$BRANCH"
			fi
			git -C "$TARGET_DIR" pull --ff-only origin "$BRANCH"
			return
		fi

		local backup
		backup="$(backup_path_for "$TARGET_DIR")"
		warn "Existing git repo at $TARGET_DIR has origin '$current_remote', not '$REPO_URL'."
		log "Moving existing config to $backup"
		mv "$TARGET_DIR" "$backup"
		clone_config
		return
	fi

	if [ -e "$TARGET_DIR" ] || [ -L "$TARGET_DIR" ]; then
		if is_empty_dir "$TARGET_DIR"; then
			clone_config
			return
		fi

		local backup
		backup="$(backup_path_for "$TARGET_DIR")"
		warn "Existing non-git config found at $TARGET_DIR."
		log "Moving existing config to $backup"
		mv "$TARGET_DIR" "$backup"
	fi

	clone_config
}

install_pi_if_needed() {
	if have pi; then
		log "Pi is already installed: $(command -v pi)"
		pi --version 2>/dev/null || true
		return
	fi

	if [ "$INSTALL_PI" = "0" ]; then
		warn "Pi is not installed, and PI_BOOTSTRAP_INSTALL_PI=0 was set."
		return
	fi

	if ! have npm; then
		warn "Pi is not installed and npm was not found."
		warn "Install Node.js/npm first, then run: npm install -g @mariozechner/pi-coding-agent"
		return
	fi

	log "Installing Pi with npm"
	if npm install -g @mariozechner/pi-coding-agent; then
		log "Pi installed: $(command -v pi || printf 'not found in PATH yet')"
	else
		warn "npm install -g @mariozechner/pi-coding-agent failed."
		warn "Fix npm permissions or install Pi manually, then rerun this script."
	fi
}

main() {
	have git || die "git is required. Install git, then rerun this script."

	install_or_update_config
	install_pi_if_needed

	cat <<EOF

Done.

Pi config directory:
  $TARGET_DIR

Next steps on this machine:
  1. Start Pi: pi
  2. Authenticate inside Pi: /login
  3. If needed, set local environment variables outside git:
       export PARALLEL_API_KEY=...
       export OPENROUTER_API_KEY=...
  4. In an existing Pi session, run /reload or restart Pi.

Rerun/update command:
  curl -fsSL https://raw.githubusercontent.com/rymccue/pi/main/bootstrap.sh | bash

EOF
}

main "$@"
