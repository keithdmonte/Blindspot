/** All tunable knobs in one place. Secrets stay in .env; these are behavior. */

export const MODEL = "claude-sonnet-5";

/** Agent loop budgets: hitting either forces synthesis with no tools. */
export const MAX_ITERATIONS = 15;
export const MAX_TOOL_CALLS = 70;
// Raised from 8000 in Phase 4: GitHub + Reddit push competitor counts high
// enough that the final report was truncating mid-section (losing META/SOURCES).
export const MAX_TOKENS = 16000;

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

/** Per-source result sizes */
export const HN_HITS_PER_PAGE = 10;
export const TAVILY_MAX_RESULTS = 5;
export const PH_MAX_PRODUCTS = 6;
export const FETCH_PAGE_MAX_CHARS = 4000;
export const SAASHUB_THROTTLE_MS = 1100;
export const GITHUB_MAX_RESULTS = 10;
export const REDDIT_MAX_RESULTS = 5;

/** Sonnet 5 $/MTok — intro pricing through 2026-08-31 ($3 in / $15 out after). */
export const PRICE_PER_MTOK_IN = 2;
export const PRICE_PER_MTOK_OUT = 10;
