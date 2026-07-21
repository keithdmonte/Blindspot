/**
 * web_search — Tavily. Retained from the research agent as the general-web
 * gap-fill tool (confirming a candidate exists, finding its site), not a
 * primary discovery channel. Optional: registry omits it when no key is set.
 */
import type { SourceTool } from "./types.js";
import { withRetry } from "../util.js";
import { TAVILY_MAX_RESULTS } from "../config.js";

interface TavilyResult {
  title: string;
  url: string;
  content: string;
}

export function webSearchTool(apiKey: string): SourceTool {
  return {
    discovery: false,
    definition: {
      name: "web_search",
      description:
        "Search the general web. Returns the top results as title, URL, and a " +
        "content snippet. Use sparingly, to confirm a candidate product exists " +
        "or to find its own website — not as a primary discovery channel. Use " +
        "focused queries (a few keywords), not full sentences.",
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query" },
        },
        required: ["query"],
      },
    },

    async run(input, emit) {
      const { query } = input as { query: string };
      const response = await withRetry(`tavily search "${query}"`, emit, async () => {
        const res = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ query, max_results: TAVILY_MAX_RESULTS }),
        });
        if (!res.ok) {
          throw new Error(`Tavily returned ${res.status}: ${await res.text()}`);
        }
        return res.json() as Promise<{ results: TavilyResult[] }>;
      });

      const results = response.results ?? [];
      emit({ type: "tool_results", tool: "web_search", query, count: results.length });

      if (results.length === 0) {
        return "No results found for this query. Try different keywords.";
      }

      return results
        .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.content}`)
        .join("\n\n");
    },
  };
}
