/**
 * Query expansion: one LLM call before the agent loop that reframes the idea
 * into a query set (TECHNICAL_DESIGN.md step 1). Tiny startups describe
 * themselves in words the user didn't use — this is where recall starts.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { EventHandler } from "./events.js";
import { EXPANSION_MAX_TOKENS, MAX_QUERIES, MODEL } from "./config.js";
import { EXPANSION_PROMPT } from "./prompts.js";

const EXPANSION_SCHEMA = {
  type: "object",
  properties: {
    problem_restatements: { type: "array", items: { type: "string" } },
    product_names: { type: "array", items: { type: "string" } },
    adjacent_categories: { type: "array", items: { type: "string" } },
  },
  required: ["problem_restatements", "product_names", "adjacent_categories"],
  additionalProperties: false,
} as const;

interface Expansion {
  problem_restatements: string[];
  product_names: string[];
  adjacent_categories: string[];
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/**
 * Expand the idea into a deduped query set, capped at MAX_QUERIES.
 * Never throws: on repeated failure it falls back to the idea itself as the
 * sole query — expansion failing must not kill a run.
 */
export async function expandQueries(
  client: Anthropic,
  idea: string,
  emit: EventHandler,
  signal?: AbortSignal,
): Promise<string[]> {
  emit({ type: "expansion_start" });

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: EXPANSION_MAX_TOKENS,
        system: EXPANSION_PROMPT,
        messages: [{ role: "user", content: `PRODUCT IDEA: ${idea}` }],
        output_config: { format: { type: "json_schema", schema: EXPANSION_SCHEMA } },
      }, { signal });

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");
      const parsed = JSON.parse(text) as Expansion;

      const groups = [
        parsed.problem_restatements,
        parsed.product_names,
        parsed.adjacent_categories,
      ];
      if (!groups.every(isStringArray)) {
        throw new Error("expansion JSON does not match the expected shape");
      }

      const seen = new Set<string>();
      const queries: string[] = [];
      for (const query of groups.flat().map((q) => q.trim())) {
        if (!query || seen.has(query.toLowerCase())) continue;
        seen.add(query.toLowerCase());
        queries.push(query);
        if (queries.length >= MAX_QUERIES) break;
      }
      if (queries.length === 0) throw new Error("expansion produced no queries");

      emit({ type: "expansion_done", queries });
      return queries;
    } catch (err) {
      // A stopped run must stop here, not fall back and carry on.
      signal?.throwIfAborted();
      if (attempt >= 2) {
        emit({
          type: "expansion_fallback",
          message: err instanceof Error ? err.message : String(err),
        });
        const queries = [idea];
        emit({ type: "expansion_done", queries });
        return queries;
      }
    }
  }

  throw new Error("unreachable"); // the loop always returns above
}
