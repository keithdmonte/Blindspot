/** All tunable knobs in one place. Secrets stay in .env; these are behavior. */

export const MODEL = "claude-sonnet-5";

/** Agent loop budget: the final iteration forces synthesis with no tools. */
export const MAX_ITERATIONS = 15;
export const MAX_TOKENS = 8000;

/** Query expansion */
export const EXPANSION_MAX_TOKENS = 1500;
export const MAX_QUERIES = 12;

/** Per-source result sizes */
export const HN_HITS_PER_PAGE = 10;
export const TAVILY_MAX_RESULTS = 5;
export const PH_MAX_PRODUCTS = 6;

/** Sonnet 5 $/MTok — intro pricing through 2026-08-31 ($3 in / $15 out after). */
export const PRICE_PER_MTOK_IN = 2;
export const PRICE_PER_MTOK_OUT = 10;
