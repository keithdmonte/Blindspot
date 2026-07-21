/**
 * Orchestrator: idea → query expansion → agent loop → report.
 * UI-agnostic; the CLI (and any future front-end) calls runDiscovery.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { EventHandler } from "./events.js";
import { MAX_ITERATIONS } from "./config.js";
import { agentLoop, type AgentResult } from "./agent.js";
import { expandQueries } from "./expand.js";
import { buildFirstMessage, buildSystemPrompt } from "./prompts.js";
import { buildToolRegistry } from "./tools/index.js";

export interface DiscoveryResult extends AgentResult {
  queries: string[];
}

export async function runDiscovery(
  idea: string,
  opts: {
    anthropicApiKey: string;
    tavilyApiKey?: string;
    productHuntToken?: string;
    onEvent?: EventHandler;
  },
): Promise<DiscoveryResult> {
  const emit = opts.onEvent ?? (() => {});
  emit({ type: "start", idea, maxIterations: MAX_ITERATIONS });

  // The SDK already retries 429s and 5xx errors with backoff; maxRetries just
  // raises the ceiling. Source API calls get their own retry wrapper.
  const client = new Anthropic({ apiKey: opts.anthropicApiKey, maxRetries: 3 });
  const registry = buildToolRegistry({
    tavilyApiKey: opts.tavilyApiKey,
    productHuntToken: opts.productHuntToken,
  });

  // Discovery tools fan out over the query set; web_search is gap-fill only.
  const discoveryTools = [...registry.keys()].filter((name) => name !== "web_search");

  const queries = await expandQueries(client, idea, emit);

  const result = await agentLoop({
    client,
    systemPrompt: buildSystemPrompt({ discoveryTools, hasWebSearch: registry.has("web_search") }),
    firstMessage: buildFirstMessage(idea, queries, discoveryTools),
    registry,
    onEvent: emit,
  });

  return { ...result, queries };
}
