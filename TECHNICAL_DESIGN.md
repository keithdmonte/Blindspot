# Technical Design — Blindspot

## Core idea

Blindspot is a **multi-tool agent loop**: one tool per source, fanned out, results unioned. It is explicitly **not** a single `web_search` call — that's the thing whose blind spots we exist to cover. Recall comes from where we search (builder-publish surfaces), how we phrase queries (expansion), and following the graph (snowballing).

## Stack

- TypeScript
- Anthropic SDK (agent loop with tool use) — builds on the existing working research-agent loop (Tavily + Claude API)
- Tavily retained for general-web fills (pricing pages, competitor sites)
- v1: CLI. Deploy target later: Railway.

## Agent loop

```
idea (plain language)
  │
  ▼
1. QUERY EXPANSION (LLM step)
   Reframe the idea into a query set:
   - the problem stated ~5 different ways
   - plausible alternate product names / category labels
   - adjacent categories a competitor might file itself under
   Rationale: tiny startups describe themselves in words the user didn't use.
  │
  ▼
2. FAN-OUT (parallel tool calls, one tool per source)
   search_product_hunt(query)     — launches, taglines, upvotes, dates
   search_hn(query)               — Algolia API: Show HN, launch threads, comments
   search_alternatives(query)     — AlternativeTo + "alternatives to X" / "X vs Y" pages + directories
   fetch_page(url)                — read a competitor's own site (pricing, positioning)
   (v2: search_reddit, search_github, funding lookup — see ROADMAP.md)
   Every query in the expansion set runs against every applicable source.
   Results are UNIONed and deduped by domain/name.
  │
  ▼
3. SNOWBALL (the recall multiplier)
   For each competitor found:
   - fetch its page → extract self-description, pricing, positioning
   - fetch its "alternatives to <competitor>" listings → new candidates
   - "X vs Y" pages name competitors in pairs → new candidates
   New candidates re-enter step 3. Recall compounds: finding 3 players
   surfaces the other 10.
  │
  ▼
4. ENRICH per competitor
   pricing / positioning / use case / funding-if-surfaced / traction signal
   Missing data is marked "gated/unknown" — never guessed.
  │
  ▼
5. SYNTHESIZE
   Verdict + competitor list + gaps & opening + meta (see PRD.md output spec).
   Gap claims must cite a source found during the run, or they don't ship.
```

## Stop conditions

The loop terminates when **any** of:

1. **Saturation** — a snowball round yields no new candidates (dedup catches everything).
2. **Depth cap** — max N snowball rounds (v1 proposal: 2–3) to bound cost and latency.
3. **Budget cap** — max total tool calls / tokens per run (exact numbers TBD during build).
4. **Candidate cap** — enrichment stops past M competitors (v1 proposal: ~25); beyond that the verdict is "crowded" regardless and further enrichment adds cost, not signal.

Whichever condition fired is reported in the output's Meta section, so the user knows whether coverage was exhausted or truncated.

## Design rules

- **Union, don't rank-and-cut.** Authority-based trimming is the failure mode we're built against. Dedup, but keep the obscure hits — flag them, don't drop them.
- **Evidence or "unknown".** Every enriched field carries its source. No source → "gated/unknown". This is what keeps the gaps section non-hallucinated.
- **One tool per source.** Keeps each source's quirks (rate limits, auth, result shape) isolated, and makes the v1→v2 source additions additive.

## Open questions (resolve during build)

- Concurrency limits per source API (rate limits — verify per [SOURCES.md](SOURCES.md))
- Exact dedup heuristic (domain match + fuzzy name match?)
- Caching of fetched pages across a run (likely yes, trivially)
