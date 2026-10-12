/**
 * Deterministic backstop on the model's own de-duping, plus the liveness
 * bucketing (Phase 6). The model dedups implicitly, but the
 * same product routinely arrives from HN + Product Hunt + GitHub under
 * slightly different names and URLs; merging by domain here keeps the
 * competitor count honest, and a merge that finds a fresher date recomputes
 * the liveness label so it never lags behind the evidence.
 */
import type { Competitor, Liveness, Mention, Overlap } from "./report.js";
import { ALIVE_MONTHS, STALE_MONTHS } from "./config.js";

const LIVENESS = new Set<Liveness>(["active", "stale", "dead", "unknown"]);
const OVERLAP_RANK: Record<Overlap, number> = { direct: 3, partial: 2, adjacent: 1 };

/** Parse ISO-ish YYYY / YYYY-MM / YYYY-MM-DD into a Date, else null. */
function parseIsoish(value: string): Date | null {
  const m = value.trim().match(/^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = m[2] ? Number(m[2]) - 1 : 0;
  const day = m[3] ? Number(m[3]) : 1;
  const d = new Date(year, month, day);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Whole months from `then` to now (never negative). */
function monthsSince(then: Date): number {
  const now = new Date();
  const months = (now.getFullYear() - then.getFullYear()) * 12 + (now.getMonth() - then.getMonth());
  return Math.max(0, months);
}

/** Bucket a dated signal into a liveness label, or null if it doesn't parse. */
export function deriveAlive(lastActive?: string): Liveness | null {
  if (!lastActive) return null;
  const d = parseIsoish(lastActive);
  if (!d) return null;
  const months = monthsSince(d);
  if (months <= ALIVE_MONTHS) return "active";
  if (months <= STALE_MONTHS) return "stale";
  return "dead";
}

/**
 * Settle the liveness label: a parseable date is authoritative (it beats a
 * model-set label that lags the evidence); otherwise trust the model's label
 * (it carries the dead-domain case, which has no date); otherwise "unknown".
 */
export function normalizeLiveness(aliveRaw: unknown, lastActiveRaw: unknown): Liveness {
  const fromDate = deriveAlive(typeof lastActiveRaw === "string" ? lastActiveRaw : undefined);
  if (fromDate) return fromDate;
  if (typeof aliveRaw === "string" && LIVENESS.has(aliveRaw as Liveness)) return aliveRaw as Liveness;
  return "unknown";
}

/** Hosts where each product lives under its own path: key by host + the first
 * N path segments (owner/repo, products/slug), not the shared domain. */
const PATH_KEYED_HOSTS: Record<string, number> = {
  "github.com": 2,
  "gitlab.com": 2,
  "producthunt.com": 2,
};

/** Hosts whose URLs are posts or listings, not a product's identity — two
 * products both cited by a Reddit thread are still two products. Key by name. */
const NAME_KEYED_HOSTS = new Set([
  "reddit.com",
  "old.reddit.com",
  "news.ycombinator.com",
  "ycombinator.com",
  "x.com",
  "twitter.com",
  "linkedin.com",
  "youtube.com",
  "medium.com",
  "dev.to",
  "indiehackers.com",
  "apps.apple.com",
  "play.google.com",
  "chromewebstore.google.com",
  "chrome.google.com",
  "marketplace.atlassian.com",
  "saashub.com",
  "alternativeto.net",
]);

/** Registrable-ish key for a competitor: its domain (or host + path on shared
 * hosts), else its lowercased name. */
function keyOf(c: { name: string; url: string }): string {
  const name = c.name.trim().toLowerCase();
  const url = (c.url || "").trim().toLowerCase();
  if (url && url !== "unknown") {
    const [host, ...path] = url
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split(/[?#]/)[0]
      .split("/");
    const domain = host.split(":")[0];
    if (NAME_KEYED_HOSTS.has(domain)) return name;
    const segments = PATH_KEYED_HOSTS[domain];
    if (segments) {
      const parts = path.filter(Boolean).slice(0, segments);
      return parts.length === segments ? [domain, ...parts].join("/") : name;
    }
    if (domain) return domain;
  }
  return name;
}

/** The product's own domain, or null when its URL is on a shared host (a repo,
 * a listing, a post) where the host's liveness says nothing about the product. */
export function ownDomain(url: string): string | null {
  const host = (url || "").trim().toLowerCase().match(/^https?:\/\/([^/?#:]+)/)?.[1]?.replace(/^www\./, "");
  if (!host || NAME_KEYED_HOSTS.has(host) || PATH_KEYED_HOSTS[host]) return null;
  return host;
}

/** Prefer the longer, non-"unknown" value between two text fields. */
function richer(a: string, b: string): string {
  const aOk = a && a !== "unknown";
  const bOk = b && b !== "unknown";
  if (aOk && bOk) return a.length >= b.length ? a : b;
  return aOk ? a : bOk ? b : a;
}

/** Freshest of two ISO-ish dates (undefined-safe). */
function fresher(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  const da = parseIsoish(a);
  const db = parseIsoish(b);
  if (!da) return b;
  if (!db) return a;
  return da >= db ? a : b;
}

/**
 * Merge competitors that resolve to the same product. Preserves first-seen
 * order; for each duplicate it unions evidence, keeps the strongest overlap,
 * the richest text, the freshest date and the highest source count, then
 * recomputes liveness from the merged date.
 */
export function mergeCompetitors(list: Competitor[]): Competitor[] {
  const byKey = new Map<string, Competitor>();
  // How many raw entries collapsed into each key, and the highest source count
  // the model itself claimed. The final corroboration count is the larger of
  // the two: if the model already merged (one entry, sourceCount 3) we keep 3;
  // if it left duplicates (two entries, each 1) the collapse floor lifts it to 2.
  const collapsed = new Map<string, number>();
  const modelMax = new Map<string, number>();
  const order: string[] = [];

  for (const c of list) {
    const key = keyOf(c);
    collapsed.set(key, (collapsed.get(key) ?? 0) + 1);
    modelMax.set(key, Math.max(modelMax.get(key) ?? 1, c.sourceCount));
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...c });
      order.push(key);
      continue;
    }
    const lastActive = fresher(existing.lastActive, c.lastActive);
    const merged: Competitor = {
      ...existing,
      url: existing.url && existing.url !== "unknown" ? existing.url : c.url,
      overlap: OVERLAP_RANK[c.overlap] > OVERLAP_RANK[existing.overlap] ? c.overlap : existing.overlap,
      obscure: existing.obscure || c.obscure,
      what: richer(existing.what, c.what),
      pricing: richer(existing.pricing, c.pricing),
      positioning: richer(existing.positioning, c.positioning),
      traction: richer(existing.traction, c.traction),
      funding: existing.funding ?? c.funding,
      ...(lastActive ? { lastActive } : {}),
      sourceCount: existing.sourceCount, // finalized below
      evidence: [...new Set([...existing.evidence, ...c.evidence])],
    };
    merged.alive = normalizeLiveness(merged.alive, merged.lastActive);
    byKey.set(key, merged);
  }

  return order.map((key) => {
    const c = byKey.get(key)!;
    c.sourceCount = Math.max(collapsed.get(key) ?? 1, modelMax.get(key) ?? 1);
    return c;
  });
}

/**
 * Dedup the alsoSeen list: drop mentions of a product that already has a
 * competitor entry, and merge repeats (unioning their evidence).
 */
export function mergeMentions(mentions: Mention[], competitors: Competitor[]): Mention[] {
  const known = new Set(competitors.map(keyOf));
  const byKey = new Map<string, Mention>();
  for (const m of mentions) {
    const key = keyOf(m);
    if (known.has(key)) continue;
    const existing = byKey.get(key);
    if (existing) existing.evidence = [...new Set([...existing.evidence, ...m.evidence])];
    else byKey.set(key, { ...m, evidence: [...m.evidence] });
  }
  return [...byKey.values()];
}
