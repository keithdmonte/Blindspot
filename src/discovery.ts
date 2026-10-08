/**
 * Orchestrator: idea → query expansion → agent loop → report.
 * UI-agnostic; the CLI (and any future front-end) calls runDiscovery.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { EventHandler } from "./events.js";
import { CANDIDATE_CAP, MAX_ITERATIONS } from "./config.js";
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
    githubToken?: string;
    onEvent?: EventHandler;
  },
): Promise<DiscoveryResult> {
  const emit = opts.onEvent ?? (() => {});
  emit({ type: "start", idea, maxIterations: MAX_ITERATIONS });

  // The SDK already retries 429s and 5xx errors with backoff; maxRetries just
  // raises the ceiling. Source API calls get their own retry wrapper.
  // Keys not scoped to a workspace must name one via this header.
  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID;
  const client = new Anthropic({
    apiKey: opts.anthropicApiKey,
    maxRetries: 3,
    defaultHeaders: workspaceId ? { "anthropic-workspace-id": workspaceId } : undefined,
  });
  const registry = buildToolRegistry({
    tavilyApiKey: opts.tavilyApiKey,
    productHuntToken: opts.productHuntToken,
    githubToken: opts.githubToken,
  });

  // Discovery tools fan out over the query set; the rest are follow-up tools.
  const discoveryTools = [...registry.values()]
    .filter((tool) => tool.discovery)
    .map((tool) => tool.definition.name);

  const queries = await expandQueries(client, idea, emit);

  const result = await agentLoop({
    client,
    systemPrompt: buildSystemPrompt({
      discoveryTools,
      toolNames: [...registry.keys()],
      candidateCap: CANDIDATE_CAP,
    }),
    firstMessage: buildFirstMessage(idea, queries, discoveryTools),
    registry,
    onEvent: emit,
  });

  return { ...result, queries };
}
