/**
 * search_hn — Hacker News via the Algolia API. Free, no auth (verified in
 * SOURCES.md 2026-07-21). Show HN launches and discussion threads are the
 * primary discovery surface for small/new/obscure competitors.
 */
import type { SourceTool } from "./types.js";
import { withRetry } from "../util.js";
import { HN_HITS_PER_PAGE } from "../config.js";

const HN_API = "https://hn.algolia.com/api/v1";

interface HNHit {
  objectID: string;
  title: string | null;
  url: string | null;
  points: number | null;
  num_comments: number | null;
  created_at: string;
  story_text: string | null;
}

/** Algolia returns story_text as HTML; flatten it to plain text for the model. */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/\s+/g, " ")
    .trim();
}

export function hnSearchTool(): SourceTool {
  return {
    discovery: true,
    definition: {
      name: "search_hn",
      description:
        "Search Hacker News stories, including Show HN launches. Best for " +
        "finding products people have built and launched, and candid " +
        "discussion of them. Use short keyword queries (2-6 words).",
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Short keyword query" },
          sort: {
            type: "string",
            enum: ["relevance", "date"],
            description:
              "relevance (default) ranks by points and relevance; date returns " +
              "newest first — use it to catch very recent launches",
          },
        },
        required: ["query"],
      },
    },

    async run(input, emit) {
      const { query, sort } = input as { query: string; sort?: "relevance" | "date" };
      const path = sort === "date" ? "search_by_date" : "search";
      const params = new URLSearchParams({
        query,
        tags: "story",
        hitsPerPage: String(HN_HITS_PER_PAGE),
      });

      const response = await withRetry(`hn search "${query}"`, emit, async () => {
        const res = await fetch(`${HN_API}/${path}?${params}`);
        if (!res.ok) {
          throw new Error(`HN Algolia returned ${res.status}: ${await res.text()}`);
        }
        return res.json() as Promise<{ hits: HNHit[] }>;
      });

      const hits = response.hits ?? [];
      emit({ type: "tool_results", tool: "search_hn", query, count: hits.length });

      if (hits.length === 0) {
        return "No HN results for this query. Try different keywords.";
      }

      return hits
        .map((hit, i) => {
          const lines = [`[${i + 1}] ${hit.title ?? "(untitled)"}`];
          if (hit.url) lines.push(`URL: ${hit.url}`);
          lines.push(
            `HN discussion: https://news.ycombinator.com/item?id=${hit.objectID} ` +
              `(points: ${hit.points ?? 0}, comments: ${hit.num_comments ?? 0}, ` +
              `posted: ${hit.created_at.slice(0, 10)})`,
          );
          if (hit.story_text) {
            const text = stripHtml(hit.story_text);
            lines.push(text.length > 500 ? `${text.slice(0, 500)}...` : text);
          }
          return lines.join("\n");
        })
        .join("\n\n");
    },
  };
}
