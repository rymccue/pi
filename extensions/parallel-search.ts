import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";

type JsonObject = Record<string, unknown>;

const API_BASE_URL = process.env.PARALLEL_API_BASE_URL ?? "https://api.parallel.ai/v1";
const MAX_RESEARCH_POLL_MS = 30 * 60 * 1000;
const RESEARCH_POLL_INTERVAL_MS = 10_000;

const webSearchParams = Type.Object({
	query: Type.String({ description: "Search query" }),
	max_results: Type.Optional(
		Type.Number({ description: "Maximum number of results to return (default: 5)" }),
	),
});

const webExtractParams = Type.Object({
	url: Type.String({ description: "URL to extract content from" }),
	max_chars: Type.Optional(
		Type.Number({ description: "Maximum characters to extract (default: 5000)" }),
	),
});

const researchParams = Type.Object({
	question: Type.String({ description: "Research question to investigate" }),
	processor: Type.Optional(
		Type.String({
			description:
				"Parallel processor tier: 'pro' (thorough, default), 'ultra' (deepest), or a faster/lower-cost tier such as 'core' or 'pro-fast'",
		}),
	),
});

function requireParallelApiKey(): string {
	const apiKey = process.env.PARALLEL_API_KEY;
	if (!apiKey) {
		throw new Error("PARALLEL_API_KEY environment variable is not set.");
	}
	return apiKey;
}

async function readErrorBody(response: Response): Promise<string> {
	return response.text().catch(() => "unknown error");
}

function jsonText(value: unknown): string {
	return JSON.stringify(value, null, 2);
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	await new Promise<void>((resolve) => {
		const timer = setTimeout(resolve, ms);
		signal?.addEventListener(
			"abort",
			() => {
				clearTimeout(timer);
				resolve();
			},
			{ once: true },
		);
	});
}

export default function parallelSearchExtension(pi: ExtensionAPI) {
	pi.registerTool({
		name: "web_search",
		label: "Web Search",
		description: "Search the web for current information using the Parallel API.",
		promptSnippet: "Search the web for current information.",
		promptGuidelines: [
			"Use web_search for quick factual lookups, current information, URL discovery, and topic orientation.",
			"Prefer specific, targeted web_search queries over broad queries.",
			"Use web_extract to read full content from promising URLs found with web_search.",
		],
		parameters: webSearchParams,
		async execute(_toolCallId, params, signal) {
			const apiKey = requireParallelApiKey();
			const maxResults = params.max_results ?? 5;
			const response = await fetch(`${API_BASE_URL}/search`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": apiKey,
				},
				body: JSON.stringify({
					objective: params.query,
					search_queries: [params.query],
					mode: "advanced",
					max_chars_total: maxResults * 3000,
					advanced_settings: {
						max_results: maxResults,
						excerpt_settings: {
							max_chars_per_result: 3000,
						},
					},
				}),
				signal,
			});

			if (!response.ok) {
				throw new Error(`Parallel search API error (${response.status}): ${await readErrorBody(response)}`);
			}

			const data = await response.json();
			return {
				content: [{ type: "text", text: jsonText(data) }],
				details: data as JsonObject,
			};
		},
	});

	pi.registerTool({
		name: "web_extract",
		label: "Web Extract",
		description: "Extract readable content from a specific URL using the Parallel API.",
		promptSnippet: "Extract readable content from a URL.",
		promptGuidelines: [
			"Use web_extract when the user provides a URL or after web_search finds a promising URL.",
			"Increase max_chars when the full article, documentation page, or source detail matters.",
		],
		parameters: webExtractParams,
		async execute(_toolCallId, params, signal) {
			const apiKey = requireParallelApiKey();
			const maxChars = params.max_chars ?? 5000;
			const response = await fetch(`${API_BASE_URL}/extract`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": apiKey,
				},
				body: JSON.stringify({
					urls: [params.url],
					objective: "Extract the main content and relevant details from this URL for an agent to read.",
					max_chars_total: maxChars,
					advanced_settings: {
						excerpt_settings: {
							max_chars_per_result: maxChars,
						},
						full_content: {
							max_chars_per_result: maxChars,
						},
					},
				}),
				signal,
			});

			if (!response.ok) {
				throw new Error(`Parallel extract API error (${response.status}): ${await readErrorBody(response)}`);
			}

			const data = await response.json();
			return {
				content: [{ type: "text", text: jsonText(data) }],
				details: data as JsonObject,
			};
		},
	});

	pi.registerTool({
		name: "research",
		label: "Research",
		description:
			"Run deep, autonomous multi-source research on a question using the Parallel API. Returns synthesis with citations. Can take several minutes.",
		promptSnippet: "Run deep multi-source web research.",
		promptGuidelines: [
			"Use research for complex questions that need synthesis across many sources; use web_search for quick lookups.",
			"Choose processor based on depth needed: 'pro' for thorough research, 'ultra' for deepest research, or faster/lower-cost tiers such as 'core' or 'pro-fast' when speed matters.",
			"Tell the user this may take several minutes when invoking research for a broad topic.",
		],
		parameters: researchParams,
		async execute(_toolCallId, params, signal, onUpdate) {
			const apiKey = requireParallelApiKey();
			const processor = params.processor ?? "pro";

			const createResponse = await fetch(`${API_BASE_URL}/tasks/runs`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": apiKey,
				},
				body: JSON.stringify({
					input: params.question,
					processor,
					output_schema: { mode: "text" },
				}),
				signal,
			});

			if (!createResponse.ok) {
				throw new Error(
					`Parallel research API error creating run (${createResponse.status}): ${await readErrorBody(createResponse)}`,
				);
			}

			const createData = (await createResponse.json()) as { run_id?: string };
			const runId = createData.run_id;
			if (!runId) {
				throw new Error(`Parallel research API did not return a run_id: ${jsonText(createData)}`);
			}

			const startedAt = Date.now();
			let consecutiveErrors = 0;
			while (Date.now() - startedAt < MAX_RESEARCH_POLL_MS) {
				if (signal?.aborted) throw new Error("Research cancelled");

				const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
				onUpdate?.({
					content: [
						{
							type: "text",
							text: `Researching (${processor})... elapsed: ${elapsedSeconds}s`,
						},
					],
					details: { runId, processor, elapsedSeconds },
				});

				try {
					const pollResponse = await fetch(`${API_BASE_URL}/tasks/runs/${runId}/result?timeout=10`, {
						headers: { "x-api-key": apiKey },
						signal,
					});

					if (pollResponse.ok) {
						const result = (await pollResponse.json()) as JsonObject;
						const run = result.run as JsonObject | undefined;
						const status = run?.status ?? result.status;
						if (status === "completed") {
							return {
								content: [{ type: "text", text: jsonText(result) }],
								details: result,
							};
						}
						if (status === "failed" || status === "error") {
							throw new Error(`Research run failed: ${jsonText(result)}`);
						}
						consecutiveErrors = 0;
					} else if (pollResponse.status === 202) {
						consecutiveErrors = 0;
					} else {
						consecutiveErrors++;
						if (consecutiveErrors >= 3) {
							throw new Error(
								`Parallel research API polling failed after ${consecutiveErrors} attempts (${pollResponse.status}): ${await readErrorBody(pollResponse)}`,
							);
						}
					}
				} catch (error) {
					if (signal?.aborted) throw new Error("Research cancelled");
					consecutiveErrors++;
					if (consecutiveErrors >= 3) throw error;
				}

				await sleep(RESEARCH_POLL_INTERVAL_MS, signal);
			}

			return {
				content: [
					{
						type: "text",
						text: `Research timed out after ${MAX_RESEARCH_POLL_MS / 60000} minutes. Run ID: ${runId}. The research may still be processing.`,
					},
				],
				details: { runId, processor, timedOut: true },
			};
		},
	});
}
