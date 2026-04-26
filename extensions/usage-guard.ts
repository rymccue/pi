import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

type Usage = {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
	turns: number;
	maxContextTokens: number;
};

type SessionUsage = {
	main: Usage;
	subagents: Usage;
	totalCost: number;
	toolErrors: number;
};


function emptyUsage(): Usage {
	return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0, maxContextTokens: 0 };
}

function addUsage(target: Usage, source: Partial<Usage> | undefined) {
	if (!source) return;
	target.input += source.input ?? 0;
	target.output += source.output ?? 0;
	target.cacheRead += source.cacheRead ?? 0;
	target.cacheWrite += source.cacheWrite ?? 0;
	target.cost += source.cost ?? 0;
	target.turns += source.turns ?? 0;
	target.maxContextTokens = Math.max(target.maxContextTokens, source.maxContextTokens ?? 0);
}

function formatTokens(count: number): string {
	if (count < 1000) return `${count}`;
	if (count < 1_000_000) return `${Math.round(count / 1000)}k`;
	return `${(count / 1_000_000).toFixed(1)}M`;
}

function formatCost(cost: number): string {
	return `$${cost.toFixed(cost < 10 ? 2 : 1)}`;
}

function collectSessionUsage(ctx: ExtensionContext): SessionUsage {
	const main = emptyUsage();
	const subagents = emptyUsage();
	let toolErrors = 0;

	for (const entry of ctx.sessionManager.getBranch() as Array<any>) {
		if (entry.type !== "message") continue;
		const message = entry.message;

		if (message?.role === "assistant") {
			const usage = message.usage;
			main.turns += 1;
			main.input += usage?.input ?? 0;
			main.output += usage?.output ?? 0;
			main.cacheRead += usage?.cacheRead ?? 0;
			main.cacheWrite += usage?.cacheWrite ?? 0;
			main.cost += usage?.cost?.total ?? 0;
			main.maxContextTokens = Math.max(main.maxContextTokens, usage?.totalTokens ?? 0);
		}

		if (message?.role === "toolResult") {
			if (message.isError) toolErrors += 1;
			if (message.toolName === "subagent") {
				for (const result of message.details?.results ?? []) {
					const usage = result.usage ?? {};
					addUsage(subagents, {
						input: usage.input ?? 0,
						output: usage.output ?? 0,
						cacheRead: usage.cacheRead ?? 0,
						cacheWrite: usage.cacheWrite ?? 0,
						cost: usage.cost ?? 0,
						turns: usage.turns ?? 0,
						maxContextTokens: usage.contextTokens ?? 0,
					});
				}
			}
		}
	}

	return { main, subagents, totalCost: main.cost + subagents.cost, toolErrors };
}

function statusText(usage: SessionUsage, contextTokens?: number): string {
	const ctxPart = contextTokens ? ` ctx:${formatTokens(contextTokens)}` : "";
	const subPart = usage.subagents.cost > 0 ? ` sub:${formatCost(usage.subagents.cost)}` : "";
	return `💸 ${formatCost(usage.totalCost)}${subPart}${ctxPart}`;
}

function notify(ctx: ExtensionContext, message: string, level: "info" | "success" | "warning" | "error" = "info") {
	if (ctx.hasUI) ctx.ui.notify(message, level);
	else console.log(message);
}

function updateUsageStatus(ctx: ExtensionContext) {
	if (!ctx.hasUI) return;
	const usage = collectSessionUsage(ctx);
	const contextUsage = ctx.getContextUsage();
	ctx.ui.setStatus("usage", statusText(usage, contextUsage?.tokens));
}

export default function usageGuardExtension(pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		updateUsageStatus(ctx);
	});

	pi.on("message_end", async (_event, ctx) => {
		updateUsageStatus(ctx);
	});

	pi.on("agent_end", async (_event, ctx) => {
		updateUsageStatus(ctx);
	});

	pi.registerCommand("usage", {
		description: "Show current session usage, including nested subagent usage",
		handler: async (_args, ctx) => {
			const usage = collectSessionUsage(ctx);
			const contextUsage = ctx.getContextUsage();
			updateUsageStatus(ctx);
			notify(
				ctx,
				[
					`Total: ${formatCost(usage.totalCost)}`,
					`Main: ${usage.main.turns} turns, ${formatCost(usage.main.cost)}, ↑${formatTokens(usage.main.input)} ↓${formatTokens(usage.main.output)} R${formatTokens(usage.main.cacheRead)} W${formatTokens(usage.main.cacheWrite)}`,
					`Subagents: ${usage.subagents.turns} turns, ${formatCost(usage.subagents.cost)}, ↑${formatTokens(usage.subagents.input)} ↓${formatTokens(usage.subagents.output)} R${formatTokens(usage.subagents.cacheRead)} W${formatTokens(usage.subagents.cacheWrite)}`,
					`Context: ${contextUsage ? `${formatTokens(contextUsage.tokens)} tokens` : "not available yet"}`,
					`Tool errors on branch: ${usage.toolErrors}`,
				].join("\n"),
				"info",
			);
		},
	});
}
