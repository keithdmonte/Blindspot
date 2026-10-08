/**
 * search_reddit — Reddit threads via Tavily, scoped to reddit.com. Reddit's
 * own Data API is paid / non-commercial by default (SOURCES.md), so per the
 * project rule we don't build against it — we reach Reddit through the web
 * search we already pay for. Two kinds of signal: builders announcing tools
 * (competitors) and users complaining (gap evidence). Optional: registry omits
 * it when no Tavily key is set.
 */
import type { SourceTool } from "./types.js";
import { withRetry } from "../util.js";
import { REDDIT_MAX_RESULTS, FETCH_TIMEOUT_MS } from "../config.js";

interface TavilyResult {
  title: string;
  url: string;
  content: string;
}

export function redditTool(tavilyKey: string): SourceTool {
  return {
    discovery: true,
    definition: {
      name: "search_reddit",
      description:
        "Search Reddit threads. Two uses: finding products people mention or " +
        "announce in niche subreddits (competitors), and finding what users " +
        "complain about in a space (gap evidence for the report). Use short " +
        "keyword queries (2-6 words).",
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Short keyword query" },
        },
        required: ["query"],
      },
    },

    async run(input, emit) {
      const { query } = input as { query: string };
      const response = await withRetry(`reddit search "${query}"`, emit, async () => {
        const res = await fetch("https://api.tavily.com/search", {
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${tavilyKey}`,
          },
          body: JSON.stringify({
            query,
            max_results: REDDIT_MAX_RESULTS,
            include_domains: ["reddit.com"],
          }),
        });
        if (!res.ok) {
          throw new Error(`Tavily returned ${res.status}: ${await res.text()}`);
        }
        return res.json() as Promise<{ results: TavilyResult[] }>;
      });

      const results = response.results ?? [];
      emit({
        type: "tool_results",
        tool: "search_reddit",
        query,
        count: results.length,
        results: results.map((r) => ({ title: r.title, url: r.url })),
      });

      if (results.length === 0) {
        return "No Reddit results for this query. Try different keywords.";
      }

      return results
        .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.content}`)
        .join("\n\n");
    },
  };
}
