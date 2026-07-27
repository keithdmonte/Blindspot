/**
 * search_alternatives — the alternatives-graph source (snowball fuel).
 *
 * Verified 2026-07-21: AlternativeTo hard-403s non-browser clients (bot
 * protection) — per SOURCES.md rules we don't work around blocks, so the
 * alternatives graph comes from SaaSHub (fallback named in the plan; robots.txt
 * only restricts specific crawlers, plain requests get 200). Access is polite:
 * honest UA, throttled to ~1 request/second, one page per call.
 *
 * URL pattern: saashub.com/<slug>-alternatives. Alternatives are parsed from
 * anchor tags linking to other /<slug>-alternatives pages, which carry proper
 * product names as link text.
 */
import type { SourceTool } from "./types.js";
import { withRetry } from "../util.js";
import { SAASHUB_THROTTLE_MS } from "../config.js";

const UA = "BlindspotBot/0.1 (competitor research; contact: dmontekm@gmail.com)";

/** Serialize + space out SaaSHub requests across the whole run. */
let lastRequest: Promise<unknown> = Promise.resolve();
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const next = lastRequest.then(
    () => new Promise((r) => setTimeout(r, SAASHUB_THROTTLE_MS)),
  ).then(fn);
  lastRequest = next.catch(() => {});
  return next;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function titleCaseFromSlug(slug: string): string {
  return slug.split("-").map((w) => w[0]?.toUpperCase() + w.slice(1)).join(" ");
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'");
}

/** Does a found SaaSHub slug plausibly belong to this product name? */
function slugMatchesProduct(slug: string, product: string): boolean {
  const productTokens = slugify(product).split("-").filter((t) => t.length >= 3);
  return productTokens.some((token) => slug.includes(token));
}

async function fetchSaasHubPage(url: string): Promise<string | null> {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`SaaSHub returned ${res.status} for ${url}`);
  return res.text();
}

interface Alternative {
  slug: string;
  name: string;
  tagline?: string;
}

/**
 * Alternatives appear as anchors to other /<slug>-alternatives pages; each
 * list item also carries a <p class="tagline"> description. Associate each
 * tagline with the closest preceding named anchor. Taglines double as
 * collision detection: SaaSHub's "Circleback" is a calendar-sync tool, not
 * the AI notetaker, and its alternatives' taglines make that obvious.
 */
function parseAlternatives(html: string, selfSlug: string): Alternative[] {
  const links: Array<{ slug: string; name: string; index: number }> = [];
  for (const match of html.matchAll(
    /<a[^>]+href="\/([a-z0-9-]+)-alternatives"[^>]*>([^<]*)</g,
  )) {
    const name = decodeEntities(match[2].replace(/\s+/g, " ").trim());
    links.push({ slug: match[1], name, index: match.index });
  }
  const taglines = [...html.matchAll(/<p class="tagline"[^>]*>([^<]+)/g)].map((m) => ({
    text: decodeEntities(m[1].replace(/\s+/g, " ").trim()),
    index: m.index,
  }));

  const seen = new Set<string>([selfSlug]);
  const alternatives: Alternative[] = [];
  for (const [i, link] of links.entries()) {
    if (seen.has(link.slug)) continue;
    seen.add(link.slug);
    const nextIndex = links[i + 1]?.index ?? html.length;
    const tagline = taglines.find((t) => t.index > link.index && t.index < nextIndex);
    alternatives.push({
      slug: link.slug,
      name: link.name || titleCaseFromSlug(link.slug),
      tagline: tagline?.text,
    });
  }
  return alternatives;
}

export function alternativesTool(tavilyApiKey?: string): SourceTool {
  return {
    discovery: false,
    definition: {
      name: "search_alternatives",
      description:
        "Look up a product's alternatives graph (via SaaSHub). Given a product " +
        "name you already found, returns other products people list as its " +
        "alternatives/competitors — the snowball step: finding 3 players " +
        "surfaces the other 10. Call this for each promising competitor found.",
      input_schema: {
        type: "object",
        properties: {
          product: {
            type: "string",
            description: "Product name as found, e.g. 'Otter.ai' or 'Circleback'",
          },
        },
        required: ["product"],
      },
    },

    async run(input, emit) {
      const { product } = input as { product: string };
      const slug = slugify(product);

      let html = await withRetry(`saashub "${product}"`, emit, () =>
        throttled(() => fetchSaasHubPage(`https://www.saashub.com/${slug}-alternatives`)),
      );
      let resolvedSlug = slug;

      // Name didn't slugify to a SaaSHub URL → find the page via Tavily.
      if (html === null && tavilyApiKey) {
        const search = await withRetry(`tavily saashub "${product}"`, emit, async () => {
          const res = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${tavilyApiKey}`,
            },
            body: JSON.stringify({
              query: `${product} alternatives`,
              max_results: 5,
              include_domains: ["saashub.com"],
            }),
          });
          if (!res.ok) throw new Error(`Tavily returned ${res.status}`);
          return res.json() as Promise<{ results: Array<{ url: string }> }>;
        });
        // Only accept a page whose slug plausibly matches the product name —
        // otherwise Tavily's best guess is an unrelated listing page.
        const hit = (search.results ?? [])
          .map((r) => r.url.match(/saashub\.com\/([a-z0-9-]+)-alternatives/))
          .find((m) => m !== null && slugMatchesProduct(m[1], product));
        if (hit) {
          resolvedSlug = hit[1];
          html = await withRetry(`saashub "${resolvedSlug}"`, emit, () =>
            throttled(() =>
              fetchSaasHubPage(`https://www.saashub.com/${resolvedSlug}-alternatives`),
            ),
          );
        }
      }

      if (html === null) {
        emit({ type: "tool_results", tool: "search_alternatives", query: product, count: 0 });
        return `No alternatives page found for "${product}" — it may be too new or too obscure for the alternatives graph. That itself is signal.`;
      }

      const alternatives = parseAlternatives(html, resolvedSlug);
      emit({
        type: "tool_results",
        tool: "search_alternatives",
        query: product,
        count: alternatives.length,
        results: alternatives.map((alt) => ({
          title: alt.name,
          url: `https://www.saashub.com/${alt.slug}`,
        })),
      });

      if (alternatives.length === 0) {
        return `SaaSHub has a page for "${product}" but lists no alternatives.`;
      }

      return (
        `Products listed as alternatives to "${product}" (via SaaSHub).\n` +
        `CAUTION — product names collide on SaaSHub. Check the taglines below: ` +
        `if they describe a different kind of product than the one you meant, ` +
        `discard this list.\n` +
        alternatives
          .map(
            (alt, i) =>
              `[${i + 1}] ${alt.name}${alt.tagline ? ` — ${alt.tagline}` : ""} — https://www.saashub.com/${alt.slug}`,
          )
          .join("\n")
      );
    },
  };
}
