/**
 * fetch_page — read a specific page (competitor site, pricing page,
 * "X vs Y" comparison) via the Tavily extract API. Powers enrichment and the
 * page-mining half of snowballing without us running our own scraper.
 */
import type { SourceTool } from "./types.js";
import { withRetry } from "../util.js";
import { FETCH_PAGE_MAX_CHARS } from "../config.js";

export function fetchPageTool(tavilyApiKey: string): SourceTool {
  return {
    discovery: false,
    definition: {
      name: "fetch_page",
      description:
        "Fetch and read a specific web page, returned as plain text/markdown. " +
        "Use it to read a competitor's own site: pricing page, homepage " +
        "positioning, or an 'alternatives to X' / 'X vs Y' listing that names " +
        "more competitors.",
      input_schema: {
        type: "object",
        properties: {
          url: { type: "string", description: "The full URL to fetch" },
        },
        required: ["url"],
      },
    },

    async run(input, emit) {
      const { url } = input as { url: string };
      const response = await withRetry(`fetch ${url}`, emit, async () => {
        const res = await fetch("https://api.tavily.com/extract", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${tavilyApiKey}`,
          },
          body: JSON.stringify({ urls: [url] }),
        });
        if (!res.ok) {
          throw new Error(`Tavily extract returned ${res.status}: ${await res.text()}`);
        }
        return res.json() as Promise<{
          results: Array<{ url: string; raw_content: string }>;
          failed_results?: Array<{ url: string; error?: string }>;
        }>;
      });

      const result = response.results?.[0];
      emit({
        type: "tool_results",
        tool: "fetch_page",
        query: url,
        count: result ? 1 : 0,
        results: result ? [{ title: url, url: result.url }] : [],
      });

      if (!result) {
        const reason = response.failed_results?.[0]?.error ?? "page could not be extracted";
        return `Could not fetch ${url}: ${reason}. Mark dependent fields "gated/unknown" rather than guessing.`;
      }

      const text = result.raw_content.replace(/\n{3,}/g, "\n\n").trim();
      return text.length > FETCH_PAGE_MAX_CHARS
        ? `${text.slice(0, FETCH_PAGE_MAX_CHARS)}\n\n[truncated at ${FETCH_PAGE_MAX_CHARS} chars]`
        : text;
    },
  };
}
