/** All tunable knobs in one place. Secrets stay in .env; these are behavior. */

const DEFAULT_MODEL = "claude-sonnet-5";
export const MODEL = process.env.BLINDSPOT_MODEL?.trim() || DEFAULT_MODEL;

/** Agent loop budgets: hitting either forces synthesis with no tools. */
export const MAX_ITERATIONS = 15;
export const MAX_TOOL_CALLS = 70;
/** Tool calls from one model turn run in parallel, at most this many at once.
 * Capped so a 70-call fan-out doesn't trip per-source rate limits. */
export const TOOL_CONCURRENCY = 8;
// Raised from 8000 in Phase 4: GitHub + Reddit push competitor counts high
// enough that the final report was truncating mid-section (losing META/SOURCES).
// Raised to 32000: a 16000 cap cut submit_report mid-JSON on crowded ideas,
// leaving an empty report. Raised to 64000 with alsoSeen: a 46+46 report used
// 27k. Above ~21k the SDK requires streaming (agent.ts).
export const MAX_TOKENS = 64000;

/** Enrichment stops past this many competitors — beyond it the verdict is
 * "crowded" regardless, and more enrichment adds cost, not signal. Enforced
 * via the system prompt (the model tracks its own candidate list). */
export const CANDIDATE_CAP = 25;

/** Liveness buckets (Phase 6). A competitor whose freshest dated signal is
 * within ALIVE_MONTHS is "active", within STALE_MONTHS is "stale", older is
 * "dead". No date seen → "unknown". Used to discredit fake-crowded markets. */
export const ALIVE_MONTHS = 6;
export const STALE_MONTHS = 18;

/** Query expansion */
export const EXPANSION_MAX_TOKENS = 1500;
export const MAX_QUERIES = 12;

/** Per-request timeout for source APIs. A stalled request is aborted and
 * retried (withRetry) instead of holding up the whole parallel search round. */
export const FETCH_TIMEOUT_MS = 20_000;

/** Timeout for the post-report reachability probe of each competitor's site.
 * Short: probes run in parallel after the report, and a timeout changes nothing. */
export const PROBE_TIMEOUT_MS = 5_000;

/** Per-source result sizes */
export const HN_HITS_PER_PAGE = 10;
export const TAVILY_MAX_RESULTS = 5;
export const PH_MAX_PRODUCTS = 6;
export const FETCH_PAGE_MAX_CHARS = 4000;
export const SAASHUB_THROTTLE_MS = 1100;
export const GITHUB_MAX_RESULTS = 10;
export const REDDIT_MAX_RESULTS = 5;

/** $/MTok for the default model, Sonnet 5. The $2/$10 launch price became
 * standard (the planned 2026-09-01 rise to $3/$15 was cancelled). Cache writes
 * use the 5-minute TTL. Another model needs its own prices, set in .env, so the
 * cost shown is never computed at the wrong rates. */
const DEFAULT_PRICES = { in: 2, cacheWrite: 2.5, cacheRead: 0.2, out: 10 };

function price(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return n;
    console.error(`${name} must be a number of dollars per million tokens, got "${raw}".`);
    process.exit(1);
  }
  if (MODEL === DEFAULT_MODEL) return fallback;
  console.error(
    `BLINDSPOT_MODEL is "${MODEL}", so set ${name} in .env to that model's ` +
      "price (see .env.example).",
  );
  process.exit(1);
}

export const PRICE_PER_MTOK_IN = price("BLINDSPOT_PRICE_IN", DEFAULT_PRICES.in);
export const PRICE_PER_MTOK_CACHE_WRITE = price("BLINDSPOT_PRICE_CACHE_WRITE", DEFAULT_PRICES.cacheWrite);
export const PRICE_PER_MTOK_CACHE_READ = price("BLINDSPOT_PRICE_CACHE_READ", DEFAULT_PRICES.cacheRead);
export const PRICE_PER_MTOK_OUT = price("BLINDSPOT_PRICE_OUT", DEFAULT_PRICES.out);
