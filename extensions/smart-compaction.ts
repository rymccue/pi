import { completeSimple } from "@mariozechner/pi-ai";
import type { AssistantMessage, ToolCall } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext, FileOperations, SessionEntry } from "@mariozechner/pi-coding-agent";
import { convertToLlm, serializeConversation } from "@mariozechner/pi-coding-agent";

type NotifyLevel = "info" | "success" | "warning" | "error";

type SmartCompactionDetails = {
	version: 1;
	kind: "smart-compaction";
	readFiles: string[];
	modifiedFiles: string[];
	tokensBefore: number;
	generatedAt: string;
	summaryChars: number;
};

type CompactionLikeDetails = Partial<SmartCompactionDetails> & {
	kind?: string;
	readFiles?: unknown;
	modifiedFiles?: unknown;
	summaryChars?: unknown;
};

function notify(ctx: Pick<ExtensionContext, "hasUI" | "ui">, message: string, level: NotifyLevel = "info") {
	try {
		if (ctx.hasUI) ctx.ui.notify(message, level);
		else console.log(message);
	} catch {
		// Compaction callbacks can outlive a command context in print/reload/replacement flows.
		// Avoid turning a completed fallback/error path into an extension crash.
		console.log(message);
	}
}

function computeSerializableFileLists(fileOps: FileOperations): {
	readFiles: string[];
	modifiedFiles: string[];
} {
	const modified = new Set([...fileOps.written, ...fileOps.edited]);
	return {
		readFiles: [...fileOps.read].filter((path) => !modified.has(path)).sort(),
		modifiedFiles: [...modified].sort(),
	};
}

function estimateTokensFromChars(text: string): number {
	return Math.ceil(text.length / 4);
}

function textFromResponse(response: AssistantMessage): string {
	return response.content
		.filter((c): c is { type: "text"; text: string } => c.type === "text")
		.map((c) => c.text)
		.join("\n")
		.trim();
}

function asStringArray(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function formatUsage(usage: unknown): string {
	if (!usage || typeof usage !== "object") return "unknown";
	const u = usage as Record<string, unknown>;
	const tokens = typeof u.tokens === "number" ? u.tokens.toLocaleString() : "unknown";
	const percent = typeof u.percent === "number" ? `${Math.round(u.percent)}%` : undefined;
	const contextWindow = typeof u.contextWindow === "number" ? u.contextWindow.toLocaleString() : undefined;
	return [
		`tokens=${tokens}`,
		percent ? `percent=${percent}` : undefined,
		contextWindow ? `window=${contextWindow}` : undefined,
	]
		.filter(Boolean)
		.join(", ");
}

function getAssistantReadToolCalls(entry: SessionEntry): string[] {
	if (entry.type !== "message") return [];
	const message = entry.message;
	if (message.role !== "assistant" || !("content" in message) || !Array.isArray(message.content)) return [];
	const reads: string[] = [];
	for (const block of message.content) {
		if (!block || typeof block !== "object") continue;
		const maybeToolCall = block as Partial<ToolCall>;
		if (maybeToolCall.type !== "toolCall" || maybeToolCall.name !== "read") continue;
		const path = maybeToolCall.arguments?.path;
		if (typeof path === "string") reads.push(path);
	}
	return reads;
}

function topCounts(values: string[], max = 8): string[] {
	const counts = new Map<string, number>();
	for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
	return [...counts.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.slice(0, max)
		.map(([path, count]) => `${path} (${count})`);
}

function detectCompactionSource(entry: Extract<SessionEntry, { type: "compaction" }>): "smart" | "default" | "unknown/custom" {
	const details = entry.details as CompactionLikeDetails | undefined;
	if (details?.kind === "smart-compaction") return "smart";
	if (!entry.fromHook) return "default";
	return "unknown/custom";
}

function summaryLengthBucket(length: number | undefined): string {
	if (length === undefined) return "unknown";
	if (length < 1500) return "too short (<1500 chars for non-trivial compaction)";
	if (length > 20000) return "too long (>20000 chars)";
	return "normal";
}

function hasRequiredCapsuleSections(summary: string): boolean {
	const requiredHeadings = [
		"# Session State Capsule",
		"## Active Goal",
		"## Current Phase",
		"## Current Working Set",
		"## Work Completed",
		"## In Progress",
		"## Next Actions",
		"## File Memory",
		"## Compaction Metadata",
	];
	return requiredHeadings.every((heading) => summary.includes(heading));
}

function buildSmartCompactionPrompt(input: {
	previousSummary?: string;
	transcript: string;
	customInstructions?: string;
	tokensBefore: number;
	firstKeptEntryId: string;
	readFiles: string[];
	modifiedFiles: string[];
	transcriptLimitNote: string;
}) {
	const previous = input.previousSummary?.trim() || "(none)";
	const focus = input.customInstructions?.trim() || "(none)";
	const readFiles = input.readFiles.length ? input.readFiles.map((path) => `- ${path}`).join("\n") : "(none)";
	const modifiedFiles = input.modifiedFiles.length ? input.modifiedFiles.map((path) => `- ${path}`).join("\n") : "(none)";

	return `You are Pi's smart compaction engine for a coding-agent session.

Your job is to update a durable Session State Capsule. This capsule will replace older conversation history and may itself be compacted again later. Optimize for repeated compactions over a long coding task.

Do not continue the conversation. Do not answer questions from the transcript. Only produce the capsule.

Inputs:
- Previous capsule, if any
- New transcript segment being compacted
- Optional user focus instructions
- File operation lists

Rules:
1. Merge the previous capsule with new evidence. Preserve still-relevant facts.
2. Remove or mark stale facts only when superseded by newer evidence.
3. Preserve exact file paths, symbols, commands, errors, test names, config keys, and user constraints.
4. Preserve conclusions from tool outputs, not raw logs, unless exact text is still actionable.
5. For important read files visible in the provided transcript/file-memory input, record why they mattered and the key facts learned so the agent can avoid re-reading when possible. If the transcript was truncated and facts are unavailable, say so instead of inventing.
6. For every modified file, record what changed, why, and validation status.
7. Keep current goal, current phase, in-progress state, blockers, risks, and next actions very explicit.
8. Prefer compact bullets over narrative chronology.
9. If a file likely needs re-reading, say why.
10. If information is uncertain, mark it as uncertain rather than inventing details.
11. Explicitly identify files that should not need re-reading because this capsule contains the relevant facts.
12. Treat transcript-derived file memory as best-effort because ${input.transcriptLimitNote}

Output exactly this markdown structure:

# Session State Capsule

## Active Goal
- Current user goal in one or a few bullets.

## User Preferences & Constraints
- Persistent preferences, constraints, safety rules, output style, explicit non-goals.

## Current Phase
- One of: orientation, reconnaissance, planning, implementation, validation, review, debugging, blocked, handoff.
- Why this phase was inferred.

## Current Working Set
- \`path\` — why it matters now; key symbols/functions; whether likely needs re-read.

## Durable Project Facts
- Architecture/config/runtime facts learned that should survive future compactions.

## Decisions Made
- Decision — rationale — affected files/systems.

## Work Completed
- Completed steps and changed files.
- Validation run and result.

## In Progress
- Exact current thread, partial edits, failing command, unresolved investigation, or next local reasoning step.

## Next Actions
1. Concrete next action.
2. Concrete follow-up.
3. Validation/check to run.

## Blockers / Risks
- Known uncertainty, environment issues, missing context, risky files, validation gaps.

## File Memory
### Read Files
- \`path\` — key facts learned; important lines/symbols; re-read priority: high/medium/low.

### Modified Files
- \`path\` — what changed; why; validation status; remaining risk.

## Important Evidence
- Exact errors, command outputs, API contracts, line references, user instructions, or test names that matter.

## Compaction Metadata
- Previous summary incorporated: yes/no.
- Approx tokens before compaction.
- Recent raw context kept from \`firstKeptEntryId\`.

<metadata>
tokensBefore: ${input.tokensBefore}
firstKeptEntryId: ${input.firstKeptEntryId}
customFocus: ${focus}
readFiles:
${readFiles}
modifiedFiles:
${modifiedFiles}
transcriptLimitNote: ${input.transcriptLimitNote}
</metadata>

<previous-capsule>
${previous}
</previous-capsule>

<new-transcript-segment>
${input.transcript || "(empty)"}
</new-transcript-segment>`;
}

function buildStatus(branch: SessionEntry[], usage: unknown): string {
	const compactions = branch.filter((entry): entry is Extract<SessionEntry, { type: "compaction" }> => entry.type === "compaction");
	const latest = compactions.at(-1);
	const latestIndex = latest ? branch.findIndex((entry) => entry.id === latest.id) : -1;
	const latestDetails = latest?.details as CompactionLikeDetails | undefined;
	const latestReadFiles = asStringArray(latestDetails?.readFiles);
	const latestModifiedFiles = asStringArray(latestDetails?.modifiedFiles);
	const protectedFiles = new Set([...latestReadFiles, ...latestModifiedFiles]);
	const postCompactionReads = latestIndex >= 0 ? branch.slice(latestIndex + 1).flatMap(getAssistantReadToolCalls) : [];
	const repeatedReads = postCompactionReads.filter((path) => protectedFiles.has(path));

	const sourceCounts = { smart: 0, default: 0, "unknown/custom": 0 };
	for (const entry of compactions) sourceCounts[detectCompactionSource(entry)]++;

	const compactionIndexes = compactions.map((entry) => branch.findIndex((candidate) => candidate.id === entry.id)).filter((index) => index >= 0);
	const averageEntriesBetween =
		compactionIndexes.length > 1
			? Math.round(
					compactionIndexes.slice(1).reduce((sum, index, i) => sum + (index - compactionIndexes[i]), 0) /
						(compactionIndexes.length - 1),
				)
			: undefined;

	const summaryChars =
		typeof latestDetails?.summaryChars === "number" ? latestDetails.summaryChars : latest ? latest.summary.length : undefined;
	const source = latest ? detectCompactionSource(latest) : "none";
	const lines = [
		"# Compaction Status",
		`- Context usage: ${formatUsage(usage)}`,
		`- Compactions on current branch: ${compactions.length}`,
		`- Source counts: smart=${sourceCounts.smart}, default=${sourceCounts.default}, unknown/custom=${sourceCounts["unknown/custom"]}`,
		`- Average entries between compactions: ${averageEntriesBetween ?? "unknown"}`,
		`- Latest source: ${source}`,
		`- Latest tokensBefore: ${latest?.tokensBefore?.toLocaleString?.() ?? "unknown"}`,
		`- Latest summary chars: ${summaryChars ?? "unknown"} (${summaryLengthBucket(summaryChars)})`,
		`- Settings: not available from ExtensionContext; inspect ~/.pi/agent/settings.json and project .pi/settings.json`,
		`- Latest read files: ${latestReadFiles.length ? latestReadFiles.join(", ") : "none/unknown"}`,
		`- Latest modified files: ${latestModifiedFiles.length ? latestModifiedFiles.join(", ") : "none/unknown"}`,
		`- Attempted read calls after latest compaction: ${postCompactionReads.length}`,
		`- Attempted repeated reads from latest file memory: ${repeatedReads.length}`,
	];

	const repeatedTop = topCounts(repeatedReads);
	if (repeatedTop.length) lines.push(`- Top repeated read attempts: ${repeatedTop.join(", ")}`);
	if (compactions.length > 3 && averageEntriesBetween !== undefined && averageEntriesBetween < 8) {
		lines.push("- Warning: compactions appear frequent on this branch; prefer phase-boundary /smart-compact and review reserveTokens/headroom.");
	}
	if (repeatedReads.length >= 5) {
		lines.push(
			"- Warning: possible re-read loop. Consider /smart-compact with focus on file memory or enabling later file-memory capture.",
		);
	}
	if (summaryChars !== undefined && summaryChars < 1500 && latestReadFiles.length + latestModifiedFiles.length > 3) {
		lines.push("- Warning: latest summary may be too short for the number of files touched.");
	}

	return lines.join("\n");
}

export default function smartCompaction(pi: ExtensionAPI) {
	pi.on("session_before_compact", async (event, ctx) => {
		const { preparation, customInstructions, signal } = event;
		const allMessages = [...preparation.messagesToSummarize, ...preparation.turnPrefixMessages];

		if (allMessages.length === 0 && !preparation.previousSummary) return;

		const model = ctx.model;
		if (!model) {
			if (!signal.aborted) notify(ctx, "Smart compaction skipped: no active model; using default compaction", "warning");
			return;
		}

		const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
		if (!auth.ok || !auth.apiKey) {
			const reason = auth.ok ? "no API key" : auth.error;
			if (!signal.aborted) notify(ctx, `Smart compaction skipped: model auth unavailable (${reason}); using default compaction`, "warning");
			return;
		}

		const { readFiles, modifiedFiles } = computeSerializableFileLists(preparation.fileOps);
		const transcript = serializeConversation(convertToLlm(allMessages));
		const prompt = buildSmartCompactionPrompt({
			previousSummary: preparation.previousSummary,
			transcript,
			customInstructions,
			tokensBefore: preparation.tokensBefore,
			firstKeptEntryId: preparation.firstKeptEntryId,
			readFiles,
			modifiedFiles,
			transcriptLimitNote: "tool results in this transcript may be truncated to 2000 characters by Pi serialization.",
		});

		const maxTokens = Math.min(12000, model.maxTokens ?? 12000);
		const estimatedPromptTokens = estimateTokensFromChars(prompt);
		const contextWindow = model.contextWindow ?? 0;
		if (contextWindow > 0 && estimatedPromptTokens + maxTokens > contextWindow * 0.9) {
			if (!signal.aborted) notify(ctx, "Smart compaction skipped: summarizer prompt too large; using default compaction", "warning");
			return;
		}

		try {
			notify(ctx, `Smart compaction: summarizing ${allMessages.length} messages (${preparation.tokensBefore.toLocaleString()} tokens)`, "info");
			const response = await completeSimple(
				model,
				{
					systemPrompt:
						"You are Pi's smart compaction engine. Produce only the requested Session State Capsule markdown. Do not continue the conversation.",
					messages: [{ role: "user", content: [{ type: "text", text: prompt }], timestamp: Date.now() }],
				},
				{ apiKey: auth.apiKey, headers: auth.headers, maxTokens, signal },
			);

			if (response.stopReason === "error" || response.stopReason === "aborted") {
				throw new Error(response.errorMessage ?? `summarizer stopped with ${response.stopReason}`);
			}

			const summary = textFromResponse(response);
			if (!summary) {
				if (!signal.aborted) notify(ctx, "Smart compaction produced an empty summary; using default compaction", "warning");
				return;
			}
			if (response.stopReason === "length" || !hasRequiredCapsuleSections(summary)) {
				if (!signal.aborted) notify(ctx, "Smart compaction summary was truncated or missing required sections; using default compaction", "warning");
				return;
			}

			return {
				compaction: {
					summary,
					firstKeptEntryId: preparation.firstKeptEntryId,
					tokensBefore: preparation.tokensBefore,
					details: {
						version: 1,
						kind: "smart-compaction",
						readFiles,
						modifiedFiles,
						tokensBefore: preparation.tokensBefore,
						generatedAt: new Date().toISOString(),
						summaryChars: summary.length,
					} satisfies SmartCompactionDetails,
				},
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (!signal.aborted) notify(ctx, `Smart compaction failed; falling back to default: ${message}`, "warning");
			return;
		}
	});

	pi.on("session_compact", async (event, ctx) => {
		const details = event.compactionEntry.details as CompactionLikeDetails | undefined;
		const source = details?.kind === "smart-compaction" ? "smart" : event.fromExtension ? "custom" : "default";
		notify(ctx, `Compaction completed (${source}, ${event.compactionEntry.tokensBefore.toLocaleString()} tokens before)`, "success");
	});

	pi.registerCommand("smart-compact", {
		description: "Trigger high-quality phase-boundary compaction with optional focus instructions",
		handler: async (args, ctx) => {
			await ctx.waitForIdle();
			const focus = args.trim();
			const customInstructions = [
				"Compact at this task phase boundary. Preserve active goal, current phase, decisions, changed files, validation status, file memory, important errors, blockers, and exact next actions. Optimize to avoid re-reading previously inspected files.",
				focus ? `Focus: ${focus}` : undefined,
			]
				.filter(Boolean)
				.join("\n\n");
			notify(ctx, "Smart compaction started", "info");
			ctx.compact({
				customInstructions,
				onComplete: () => notify(ctx, "Smart compaction completed", "success"),
				onError: (error) => notify(ctx, `Smart compaction failed: ${error.message}`, "error"),
			});
		},
	});

	pi.registerCommand("compaction-status", {
		description: "Show compaction telemetry, latest details, and repeated-read heuristics",
		handler: async (_args, ctx) => {
			const branch = ctx.sessionManager.getBranch();
			notify(ctx, buildStatus(branch, ctx.getContextUsage()), "info");
		},
	});
}
