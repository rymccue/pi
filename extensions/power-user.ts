import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

const READ_ONLY_TOOLS = ["read", "grep", "find", "ls"];
const SAFE_TOOLS = ["read", "grep", "find", "ls", "bash"];

const protectedPathPatterns: Array<{ label: string; pattern: RegExp }> = [
	{ label: "pi auth", pattern: /(^|\/)\.pi\/agent\/auth\.json(\.|$)?/ },
	{ label: "private keys", pattern: /(^|\/)(id_rsa|id_dsa|id_ecdsa|id_ed25519)(\.|$)?/ },
	{ label: "git internals", pattern: /(^|\/)\.git(\/|$)/ },
	{ label: "dependencies", pattern: /(^|\/)(node_modules|vendor)(\/|$)/ },
	{ label: "build output", pattern: /(^|\/)(dist|build|\.next|coverage)(\/|$)/ },
];

const dangerousBashPatterns: Array<{ label: string; pattern: RegExp }> = [
	{ label: "recursive forced removal", pattern: /\brm\s+-(?:[^\s-]*r[^\s-]*f|[^\s-]*f[^\s-]*r|[^\s-]*R[^\s-]*f|[^\s-]*f[^\s-]*R)\b/ },
	{ label: "hard git reset", pattern: /\bgit\s+reset\s+--hard\b/ },
	{ label: "git clean", pattern: /\bgit\s+clean\s+-[^\n;|&]*[fdx][^\n;|&]*/ },
	{ label: "sudo", pattern: /(^|[;&|]\s*)sudo\b/ },
	{ label: "recursive chmod/chown", pattern: /\b(chmod|chown)\s+-R\b/ },
	{ label: "disk writer", pattern: /\bdd\b[^\n;|&]*\bof=/ },
	{ label: "filesystem formatter", pattern: /\bmkfs(\.|\s|$)/ },
];

function notify(ctx: ExtensionContext, message: string, level: "info" | "success" | "warning" | "error" = "info") {
	if (ctx.hasUI) ctx.ui.notify(message, level);
	else console.log(message);
}

function availableToolNames(pi: ExtensionAPI) {
	return pi.getAllTools().map((tool) => tool.name);
}

function activeToolNames(pi: ExtensionAPI) {
	return pi.getActiveTools().map((tool) => (typeof tool === "string" ? tool : tool.name));
}

function setTools(pi: ExtensionAPI, names: string[]) {
	const available = new Set(availableToolNames(pi));
	const selected = names.filter((name) => available.has(name));
	pi.setActiveTools(selected);
	return selected;
}

function pathProtectionReason(path: string) {
	const normalized = path.replace(/\\/g, "/");
	const hit = protectedPathPatterns.find(({ pattern }) => pattern.test(normalized));
	return hit ? `${hit.label}: ${path}` : undefined;
}

function dangerousBashReason(command: string) {
	const hit = dangerousBashPatterns.find(({ pattern }) => pattern.test(command));
	return hit ? hit.label : undefined;
}

export default function powerUserExtension(pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		ctx.ui.setStatus("power", "⚡ power");
	});

	pi.on("model_select", async (event, ctx) => {
		ctx.ui.setStatus("model", `🤖 ${event.model.id}`);
		if (event.source !== "restore") notify(ctx, `Model: ${event.model.provider}/${event.model.id}`, "info");
	});

	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName === "write" || event.toolName === "edit") {
			const path = (event.input.path as string | undefined) ?? "";
			const reason = pathProtectionReason(path);
			if (reason) {
				notify(ctx, `Blocked write to protected path (${reason})`, "warning");
				return { block: true, reason: `Protected path: ${reason}` };
			}
		}

		if (event.toolName === "bash") {
			const command = (event.input.command as string | undefined) ?? "";
			const reason = dangerousBashReason(command);
			if (!reason) return;

			if (!ctx.hasUI) {
				return { block: true, reason: `Dangerous bash command blocked (${reason})` };
			}

			const ok = await ctx.ui.confirm("Confirm risky bash", `${reason}\n\n${command}`);
			if (!ok) return { block: true, reason: `User denied risky bash command (${reason})` };
		}
	});

	pi.registerCommand("ctx", {
		description: "Show current context/token usage",
		handler: async (_args, ctx) => {
			const usage = ctx.getContextUsage();
			notify(ctx, usage ? JSON.stringify(usage, null, 2) : "Context usage is not available yet", "info");
		},
	});

	pi.registerCommand("tools", {
		description: "Switch tool preset: readonly, safe, full, or list",
		getArgumentCompletions: (prefix) => {
			const values = ["readonly", "safe", "full", "list"];
			const filtered = values.filter((value) => value.startsWith(prefix));
			return filtered.length ? filtered.map((value) => ({ value, label: value })) : null;
		},
		handler: async (args, ctx) => {
			const mode = args.trim() || "list";
			if (mode === "readonly") {
				notify(ctx, `Active tools: ${setTools(pi, READ_ONLY_TOOLS).join(", ")}`, "success");
				return;
			}
			if (mode === "safe") {
				notify(ctx, `Active tools: ${setTools(pi, SAFE_TOOLS).join(", ")}`, "success");
				return;
			}
			if (mode === "full") {
				const all = availableToolNames(pi);
				pi.setActiveTools(all);
				notify(ctx, `Active tools: ${all.join(", ")}`, "success");
				return;
			}
			const active = activeToolNames(pi);
			notify(ctx, `Available: ${availableToolNames(pi).join(", ")}\nActive: ${active.join(", ")}`, "info");
		},
	});

	pi.registerCommand("compact-now", {
		description: "Trigger compaction with optional custom instructions",
		handler: async (args, ctx) => {
			notify(ctx, "Compaction started", "info");
			ctx.compact({
				customInstructions: args.trim() || undefined,
				onComplete: () => notify(ctx, "Compaction completed", "success"),
				onError: (error) => notify(ctx, `Compaction failed: ${error.message}`, "error"),
			});
		},
	});

	pi.registerCommand("commands", {
		description: "List extension, prompt, and skill slash commands",
		getArgumentCompletions: (prefix) => {
			const values = ["extension", "prompt", "skill"];
			const filtered = values.filter((value) => value.startsWith(prefix));
			return filtered.length ? filtered.map((value) => ({ value, label: value })) : null;
		},
		handler: async (args, ctx) => {
			const source = args.trim();
			const commands = pi.getCommands().filter((command) => !source || command.source === source);
			const lines = commands.map((command) => `/${command.name}${command.description ? ` — ${command.description}` : ""}`);
			notify(ctx, lines.length ? lines.join("\n") : "No matching commands", "info");
		},
	});
}
