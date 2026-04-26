import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

const USER_MESSAGES_BEFORE_NAME_NUDGE = Number(process.env.PI_SESSION_NAME_NUDGE_USERS ?? 4);
const USER_MESSAGES_BEFORE_HANDOFF_NUDGE = Number(process.env.PI_SESSION_HANDOFF_NUDGE_USERS ?? 12);

let nudgedName = false;
let nudgedHandoff = false;

function notify(ctx: ExtensionContext, message: string, level: "info" | "success" | "warning" | "error" = "info") {
	if (ctx.hasUI) ctx.ui.notify(message, level);
	else console.log(message);
}

function branchEntries(ctx: ExtensionContext): Array<any> {
	return ctx.sessionManager.getBranch() as Array<any>;
}

function countUserMessages(ctx: ExtensionContext): number {
	return branchEntries(ctx).filter((entry) => entry.type === "message" && entry.message?.role === "user").length;
}

function countLabels(ctx: ExtensionContext): number {
	const labeledTargets = new Set<string>();
	for (const entry of ctx.sessionManager.getEntries() as Array<any>) {
		if (entry.type === "label" && entry.label && entry.targetId) labeledTargets.add(entry.targetId);
	}
	return labeledTargets.size;
}

function latestSessionName(ctx: ExtensionContext): string | undefined {
	return ctx.sessionManager.getSessionName?.() ?? undefined;
}

function maybeNudge(ctx: ExtensionContext) {
	const userMessages = countUserMessages(ctx);
	const sessionName = latestSessionName(ctx);

	if (!nudgedName && !sessionName && userMessages >= USER_MESSAGES_BEFORE_NAME_NUDGE) {
		nudgedName = true;
		notify(
			ctx,
			`This session has ${userMessages} user messages and no name. Consider /name <short task label> so it is easy to resume later.`,
			"info",
		);
	}

	if (!nudgedHandoff && userMessages >= USER_MESSAGES_BEFORE_HANDOFF_NUDGE) {
		nudgedHandoff = true;
		notify(
			ctx,
			"Long session checkpoint recommended. Consider /checkpoint <label>, /handoff, /compact-now, or /new before starting another major thread.",
			"warning",
		);
	}
}

function defaultCheckpointLabel(ctx: ExtensionContext): string {
	const now = new Date();
	const stamp = now.toISOString().slice(0, 16).replace("T", " ");
	const name = latestSessionName(ctx);
	return name ? `${name} @ ${stamp}` : `checkpoint @ ${stamp}`;
}

export default function sessionHygieneExtension(pi: ExtensionAPI) {
	pi.on("session_start", async (_event, _ctx) => {
		nudgedName = false;
		nudgedHandoff = false;
	});

	pi.on("agent_end", async (_event, ctx) => {
		maybeNudge(ctx);
	});

	pi.registerCommand("checkpoint", {
		description: "Label the current session tree point for easier resume/navigation",
		handler: async (args, ctx) => {
			const leafId = ctx.sessionManager.getLeafId();
			if (!leafId) {
				notify(ctx, "No current session entry to label yet.", "warning");
				return;
			}
			const label = args.trim() || defaultCheckpointLabel(ctx);
			pi.setLabel(leafId, label);
			notify(ctx, `Checkpoint label set: ${label}`, "success");
		},
	});

	pi.registerCommand("session-hygiene", {
		description: "Show session naming, label, handoff, and context hygiene status",
		handler: async (_args, ctx) => {
			const userMessages = countUserMessages(ctx);
			const labelCount = countLabels(ctx);
			const name = latestSessionName(ctx) ?? "(unnamed)";
			const recommendations: string[] = [];
			if (name === "(unnamed)" && userMessages >= USER_MESSAGES_BEFORE_NAME_NUDGE) {
				recommendations.push("Set /name <short task label>.");
			}
			if (labelCount === 0 && userMessages >= USER_MESSAGES_BEFORE_NAME_NUDGE) {
				recommendations.push("Use /checkpoint <label> at major milestones.");
			}
			if (userMessages >= USER_MESSAGES_BEFORE_HANDOFF_NUDGE) {
				recommendations.push("Consider /handoff, /compact-now, or /new before a new major thread.");
			}

			notify(
				ctx,
				[
					`Session: ${name}`,
					`User messages on branch: ${userMessages}`,
					`Labels in session: ${labelCount}`,
					recommendations.length ? `Recommendations:\n- ${recommendations.join("\n- ")}` : "Recommendations: none right now",
				].join("\n"),
				"info",
			);
		},
	});
}
