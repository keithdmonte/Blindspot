/**
 * search_product_hunt — Product Hunt via GraphQL API v2 + Tavily discovery.
 *
 * Verified 2026-07-21: the official API has NO keyword search on posts — only
 * topics(query:), posts(topic:/url:), and post(slug:). So discovery runs as a
 * Tavily search scoped to site:producthunt.com (public web index), and each
 * hit is then enriched through the official API (votes, launch date, tagline)
 * — grounded data, ToS-friendly access pattern. Without a Tavily key we fall
 * back to topic browse with client-side keyword filtering (weak but working).
 *
 * Rate limit: 6,250 complexity points / 15 min; slug lookups are tiny and
 * batched into one request per call. Non-commercial by default (SOURCES.md).
 */
import type { SourceTool } from "./types.js";
import { withRetry } from "../util.js";
import type { EventHandler } from "../events.js";
import { PH_MAX_PRODUCTS, TAVILY_MAX_RESULTS } from "../config.js";

const PH_API = "https://api.producthunt.com/v2/api/graphql";

interface PHPost {
  name: string;
  tagline: string;
  description: string | null;
  votesCount: number;
  createdAt: string;
  url: string;
}

async function phQuery<T>(
  token: string,
  label: string,
  emit: EventHandler,
  query: string,
): Promise<T> {
  return withRetry(label, emit, async () => {
    const res = await fetch(PH_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) {
      throw new Error(`Product Hunt returned ${res.status}: ${await res.text()}`);
    }
    const body = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
    if (body.errors?.length) {
      throw new Error(`Product Hunt GraphQL error: ${body.errors[0].message}`);
    }
    if (!body.data) throw new Error("Product Hunt returned no data");
    return body.data;
  });
}

function formatPost(post: PHPost): string {
  const lines = [
    `${post.name} — ${post.tagline}`,
    `Product Hunt: ${post.url.split("?")[0]} (votes: ${post.votesCount}, launched: ${post.createdAt.slice(0, 10)})`,
  ];
  if (post.description) {
    const text = post.description.replace(/\s+/g, " ").trim();
    lines.push(text.length > 300 ? `${text.slice(0, 300)}...` : text);
  }
  return lines.join("\n");
}

interface PHCandidate {
  slug: string;
  url: string;
  title: string;
}

/** Pull /products/<slug> and /posts/<slug> hits out of PH URLs. */
function extractCandidates(results: Array<{ url: string; title: string }>): PHCandidate[] {
  const seen = new Set<string>();
  const candidates: PHCandidate[] = [];
  for (const result of results) {
    // Prefer the launch slug when the URL has one — post(slug:) wants launch
    // slugs; bare /products/<slug> product slugs often don't resolve.
    const match = result.url.match(
      /producthunt\.com\/(?:products|posts)\/(?:[a-z0-9-]+\/launches\/)?([a-z0-9-]+)/i,
    );
    if (!match) continue;
    const slug = match[1].toLowerCase();
    if (seen.has(slug)) continue;
    seen.add(slug);
    candidates.push({ slug, url: result.url.split("?")[0], title: result.title });
  }
  return candidates.slice(0, PH_MAX_PRODUCTS);
}

/** Discovery via Tavily scoped to producthunt.com, then enrich via the API. */
async function searchViaTavily(
  phToken: string,
  tavilyApiKey: string,
  query: string,
  emit: EventHandler,
): Promise<string[]> {
  const response = await withRetry(`tavily site:producthunt.com "${query}"`, emit, async () => {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tavilyApiKey}`,
      },
      body: JSON.stringify({
        query,
        max_results: TAVILY_MAX_RESULTS * 2,
        include_domains: ["producthunt.com"],
      }),
    });
    if (!res.ok) {
      throw new Error(`Tavily returned ${res.status}: ${await res.text()}`);
    }
    return res.json() as Promise<{ results: Array<{ url: string; title: string }> }>;
  });

  const candidates = extractCandidates(response.results ?? []);
  if (candidates.length === 0) return [];

  // One batched GraphQL request; aliases keep it a single round-trip.
  const fields = "name tagline description votesCount createdAt url";
  const body = candidates
    .map((c, i) => `p${i}: post(slug: "${c.slug}") { ${fields} }`)
    .join(" ");
  const data = await phQuery<Record<string, PHPost | null>>(
    phToken,
    `producthunt lookup [${candidates.map((c) => c.slug).join(", ")}]`,
    emit,
    `{ ${body} }`,
  );

  // Enriched where the API resolved the slug; otherwise keep the raw hit —
  // a PH product URL is still a discovery lead (union, don't drop).
  return candidates.map((candidate, i) => {
    const post = data[`p${i}`];
    return post
      ? formatPost(post)
      : `${candidate.title}\nProduct Hunt: ${candidate.url} (votes/date unavailable via API)`;
  });
}

/** Fallback without Tavily: topic keyword search, then filter posts by name/tagline. */
async function searchViaTopics(
  phToken: string,
  query: string,
  emit: EventHandler,
): Promise<PHPost[]> {
  const escaped = query.replace(/"/g, "");
  const topicData = await phQuery<{
    topics: { edges: Array<{ node: { slug: string } }> };
  }>(
    phToken,
    `producthunt topics "${query}"`,
    emit,
    `{ topics(query: "${escaped}", first: 2) { edges { node { slug } } } }`,
  );
  const topicSlugs = topicData.topics.edges.map((e) => e.node.slug);
  if (topicSlugs.length === 0) return [];

  const fields = "name tagline description votesCount createdAt url";
  const body = topicSlugs
    .map(
      (slug, i) =>
        `t${i}: posts(topic: "${slug}", order: NEWEST, first: 20) { edges { node { ${fields} } } }`,
    )
    .join(" ");
  const data = await phQuery<Record<string, { edges: Array<{ node: PHPost }> }>>(
    phToken,
    `producthunt posts in [${topicSlugs.join(", ")}]`,
    emit,
    `{ ${body} }`,
  );

  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  const posts = Object.values(data).flatMap((conn) => conn.edges.map((e) => e.node));
  const seen = new Set<string>();
  return posts
    .filter((post) => {
      const haystack = `${post.name} ${post.tagline}`.toLowerCase();
      return terms.some((term) => haystack.includes(term));
    })
    .filter((post) => !seen.has(post.url) && seen.add(post.url) !== undefined)
    .slice(0, PH_MAX_PRODUCTS);
}

export function productHuntTool(phToken: string, tavilyApiKey?: string): SourceTool {
  return {
    definition: {
      name: "search_product_hunt",
      description:
        "Search Product Hunt launches. The canonical 'I just built this' " +
        "surface: returns product name, tagline, upvotes, and launch date. " +
        "Upvote count is a traction signal; low votes + recent date = obscure " +
        "competitor, which is exactly what we want to find. Use short keyword " +
        "queries (2-6 words).",
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
      const entries = tavilyApiKey
        ? await searchViaTavily(phToken, tavilyApiKey, query, emit)
        : (await searchViaTopics(phToken, query, emit)).map(formatPost);

      emit({ type: "tool_results", tool: "search_product_hunt", query, count: entries.length });

      if (entries.length === 0) {
        return "No Product Hunt results for this query. Try different keywords.";
      }
      return entries.map((entry, i) => `[${i + 1}] ${entry}`).join("\n\n");
    },
  };
}
