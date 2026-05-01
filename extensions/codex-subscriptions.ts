import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";

const CODEX_PROVIDER = "openai-codex";
const PROFILE_DIR = join(homedir(), ".pi", "agent", "codex-subscriptions");
const ACTIVE_PROFILE_PATH = join(PROFILE_DIR, "active");
const PROFILE_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

const COMMAND_USAGE = [
	"Usage:",
	"  /codex-subscription status",
	"  /codex-subscription list",
	"  /codex-subscription save <name>",
	"  /codex-subscription use <name>",
	"  /codex-subscription sync",
	"  /codex-subscription remove <name>",
].join("\n");

type NotifyLevel = "info" | "success" | "warning" | "error";

type CodexCredential = {
	type: "oauth";
	access: string;
	refresh: string;
	expires: number;
	accountId?: string;
	[key: string]: unknown;
};

type ParsedCommand = {
	action: "status" | "list" | "save" | "use" | "sync" | "remove" | "help";
	name?: string;
};

function notify(ctx: ExtensionContext, message: string, level: NotifyLevel = "info") {
	if (ctx.hasUI) ctx.ui.notify(message, level);
	else console.log(message);
}

function ensureProfileDir() {
	if (!existsSync(PROFILE_DIR)) mkdirSync(PROFILE_DIR, { recursive: true, mode: 0o700 });
	chmodSync(PROFILE_DIR, 0o700);
}

function validateProfileName(name: string): string {
	const trimmed = name.trim();
	if (!PROFILE_NAME_PATTERN.test(trimmed)) {
		throw new Error("Profile names may contain only letters, numbers, underscores, and hyphens.");
	}
	return trimmed;
}

function profilePath(name: string): string {
	const safeName = validateProfileName(name);
	return join(PROFILE_DIR, `${safeName}.json`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCodexCredential(value: unknown): value is CodexCredential {
	return (
		isRecord(value) &&
		value.type === "oauth" &&
		typeof value.access === "string" &&
		typeof value.refresh === "string" &&
		typeof value.expires === "number"
	);
}

function readProfile(name: string): CodexCredential {
	ensureProfileDir();
	const path = profilePath(name);
	if (!existsSync(path)) throw new Error(`Unknown Codex subscription profile: ${name}`);
	const parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown;
	if (!isCodexCredential(parsed)) throw new Error(`Invalid Codex subscription profile: ${name}`);
	return parsed;
}

function writeProfile(name: string, credential: CodexCredential): boolean {
	ensureProfileDir();
	const path = profilePath(name);
	const next = `${JSON.stringify(credential, null, 2)}\n`;
	const current = existsSync(path) ? readFileSync(path, "utf-8") : undefined;
	if (current === next) return false;
	writeFileSync(path, next, "utf-8");
	chmodSync(path, 0o600);
	return true;
}

function removeProfile(name: string) {
	ensureProfileDir();
	const path = profilePath(name);
	if (!existsSync(path)) throw new Error(`Unknown Codex subscription profile: ${name}`);
	unlinkSync(path);
}

function listProfiles(): string[] {
	ensureProfileDir();
	return readdirSync(PROFILE_DIR, { withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
		.map((entry) => basename(entry.name, ".json"))
		.filter((name) => PROFILE_NAME_PATTERN.test(name))
		.sort((a, b) => a.localeCompare(b));
}

function getActiveProfileName(): string | undefined {
	ensureProfileDir();
	if (!existsSync(ACTIVE_PROFILE_PATH)) return undefined;
	const active = readFileSync(ACTIVE_PROFILE_PATH, "utf-8").trim();
	return active ? validateProfileName(active) : undefined;
}

function setActiveProfileName(name: string | undefined) {
	ensureProfileDir();
	if (!name) {
		if (existsSync(ACTIVE_PROFILE_PATH)) unlinkSync(ACTIVE_PROFILE_PATH);
		return;
	}
	writeFileSync(ACTIVE_PROFILE_PATH, `${validateProfileName(name)}\n`, "utf-8");
	chmodSync(ACTIVE_PROFILE_PATH, 0o600);
}

function getCurrentCodexCredential(ctx: ExtensionContext): CodexCredential | undefined {
	const credential = ctx.modelRegistry.authStorage.get(CODEX_PROVIDER) as unknown;
	return isCodexCredential(credential) ? credential : undefined;
}

function formatExpiry(expires: number): string {
	if (!Number.isFinite(expires)) return "unknown expiry";
	return new Date(expires).toISOString();
}

function summarizeCredential(credential: CodexCredential): string {
	const account = credential.accountId ? `, account ${credential.accountId.slice(0, 8)}…` : "";
	return `expires ${formatExpiry(credential.expires)}${account}`;
}

function updateStatus(ctx: ExtensionContext) {
	const active = getActiveProfileName();
	if (ctx.hasUI) ctx.ui.setStatus("codex", active ? `Codex: ${active}` : "Codex: default");
}

function parseCommand(args: string): ParsedCommand {
	const [rawAction = "status", rawName, ...rest] = args.trim().split(/\s+/).filter(Boolean);
	if (rest.length > 0) throw new Error(`Unexpected extra arguments: ${rest.join(" ")}`);

	switch (rawAction) {
		case "status":
		case "list":
		case "sync":
		case "help":
			if (rawName) throw new Error(`/${rawAction} does not accept a profile name.`);
			return { action: rawAction };
		case "save":
		case "use":
		case "remove":
			if (!rawName) throw new Error(`/${rawAction} requires a profile name.`);
			return { action: rawAction, name: validateProfileName(rawName) };
		default:
			throw new Error(`Unknown codex-subscription action: ${rawAction}`);
	}
}

function syncActiveProfile(ctx: ExtensionContext): boolean {
	const active = getActiveProfileName();
	if (!active) return false;
	const credential = getCurrentCodexCredential(ctx);
	if (!credential) return false;
	return writeProfile(active, credential);
}

function syncActiveProfileQuietly(ctx: ExtensionContext) {
	try {
		syncActiveProfile(ctx);
	} catch {
		// Background sync must never interfere with model requests or shutdown.
	}
}

function updateStatusQuietly(ctx: ExtensionContext) {
	try {
		updateStatus(ctx);
	} catch {
		// Ignore invalid local profile metadata in passive UI updates; commands report errors explicitly.
	}
}

async function handleStatus(ctx: ExtensionCommandContext) {
	const active = getActiveProfileName();
	const current = getCurrentCodexCredential(ctx);
	const profiles = listProfiles();
	updateStatus(ctx);
	notify(
		ctx,
		[
			`Active profile: ${active ?? "none"}`,
			`Current ${CODEX_PROVIDER} credential: ${current ? summarizeCredential(current) : "not configured"}`,
			`Saved profiles: ${profiles.length ? profiles.join(", ") : "none"}`,
		].join("\n"),
		"info",
	);
}

async function handleList(ctx: ExtensionCommandContext) {
	const active = getActiveProfileName();
	const profiles = listProfiles();
	if (!profiles.length) {
		notify(ctx, "No saved Codex subscription profiles. Use /login openai-codex, then /codex-subscription save <name>.", "info");
		return;
	}
	const lines = profiles.map((profile) => `${profile === active ? "*" : " "} ${profile}`);
	notify(ctx, lines.join("\n"), "info");
}

async function handleSave(ctx: ExtensionCommandContext, name: string) {
	const credential = getCurrentCodexCredential(ctx);
	if (!credential) {
		throw new Error(`No active ${CODEX_PROVIDER} OAuth credential found. Run /login ${CODEX_PROVIDER} first.`);
	}
	writeProfile(name, credential);
	setActiveProfileName(name);
	updateStatus(ctx);
	notify(ctx, `Saved current Codex subscription as "${name}".`, "success");
}

async function handleUse(ctx: ExtensionCommandContext, name: string) {
	await ctx.waitForIdle();
	syncActiveProfile(ctx);
	const credential = readProfile(name);
	ctx.modelRegistry.authStorage.set(CODEX_PROVIDER, credential);
	setActiveProfileName(name);
	updateStatus(ctx);
	notify(ctx, `Using Codex subscription profile "${name}" (${summarizeCredential(credential)}).`, "success");
}

async function handleSync(ctx: ExtensionCommandContext) {
	const active = getActiveProfileName();
	if (!active) throw new Error("No active Codex subscription profile is selected.");
	const credential = getCurrentCodexCredential(ctx);
	if (!credential) throw new Error(`No active ${CODEX_PROVIDER} OAuth credential found to sync.`);
	const changed = writeProfile(active, credential);
	notify(ctx, changed ? `Synced active Codex profile "${active}".` : `Codex profile "${active}" is already up to date.`, "success");
}

async function handleRemove(ctx: ExtensionCommandContext, name: string) {
	removeProfile(name);
	if (getActiveProfileName() === name) setActiveProfileName(undefined);
	updateStatus(ctx);
	notify(ctx, `Removed Codex subscription profile "${name}".`, "success");
}

async function handleCommand(args: string, ctx: ExtensionCommandContext) {
	try {
		const command = parseCommand(args);
		switch (command.action) {
			case "status":
				await handleStatus(ctx);
				return;
			case "list":
				await handleList(ctx);
				return;
			case "save":
				await handleSave(ctx, command.name ?? "");
				return;
			case "use":
				await handleUse(ctx, command.name ?? "");
				return;
			case "sync":
				await handleSync(ctx);
				return;
			case "remove":
				await handleRemove(ctx, command.name ?? "");
				return;
			case "help":
				notify(ctx, COMMAND_USAGE, "info");
				return;
		}
	} catch (error) {
		notify(ctx, `${error instanceof Error ? error.message : String(error)}\n\n${COMMAND_USAGE}`, "error");
	}
}

function getArgumentCompletions(prefix: string) {
	const parts = prefix.split(/\s+/);
	const actions = ["status", "list", "save", "use", "sync", "remove", "help"];
	if (parts.length <= 1) {
		return actions.filter((action) => action.startsWith(parts[0] ?? "")).map((action) => ({ value: action, label: action }));
	}
	if (["use", "remove"].includes(parts[0] ?? "")) {
		const profilePrefix = parts[1] ?? "";
		return listProfiles()
			.filter((profile) => profile.startsWith(profilePrefix))
			.map((profile) => ({ value: `${parts[0]} ${profile}`, label: profile }));
	}
	return null;
}

export default function codexSubscriptionsExtension(pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		updateStatusQuietly(ctx);
	});

	pi.on("after_provider_response", async (_event, ctx) => {
		syncActiveProfileQuietly(ctx);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		syncActiveProfileQuietly(ctx);
	});

	pi.registerCommand("codex-subscription", {
		description: "Save, list, and switch between OpenAI Codex subscription OAuth profiles",
		getArgumentCompletions,
		handler: handleCommand,
	});

	pi.registerCommand("codex", {
		description: "Alias for /codex-subscription",
		getArgumentCompletions,
		handler: handleCommand,
	});
}
