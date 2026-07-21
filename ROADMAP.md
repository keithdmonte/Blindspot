# Roadmap — Blindspot

Short and current beats long and stale. Phases, not dates. Each phase has a "done when" so progress is checkable.

## Phase 0 — Docs & source verification ✅ done 2026-07-21

- All five docs written; v1 scope cut confirmed ([PRD.md](PRD.md))
- v1 source APIs verified, findings date-stamped in [SOURCES.md](SOURCES.md)

## Phase 1 — Core loop, first source

- Port the existing research-agent loop (TypeScript, Tavily + Claude API) into this repo
- CLI entry: `blindspot "<idea>"`
- Query-expansion step (idea → query set)
- **HN Algolia tool** (free, no auth — lowest-risk source, so it goes first)
- Minimal report output (rough text is fine; structure comes in Phase 3)

**Done when:** one command runs end-to-end on a real idea and returns competitors found via HN.

## Phase 2 — Full v1 recall

- **Product Hunt tool** (developer token from their API dashboard; mind the 6,250-complexity-points/15-min limit)
- **AlternativeTo + directories** page-fetch tool (polite, low-volume; SaaSHub fallback if blocked)
- Fan-out across all queries × all sources; union + dedup
- **Snowballing**: mine found competitors' pages and "alternatives to" listings for new candidates
- Stop conditions wired in (saturation, depth cap, budget cap, candidate cap — [TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md))

**Done when:** a run on a real idea surfaces competitors the same idea run through Google/Perplexity misses. *(This is the v1 recall thesis test.)*

## Phase 3 — Report quality (completes v1)

- Full output spec from [PRD.md](PRD.md): verdict, per-competitor enrichment (pricing / positioning / use case / traction), obscurity flags
- Evidence-grounded gaps section — every claim cites a source from the run, or it doesn't ship
- Meta section: sources checked, coverage confidence, thin fields, which stop condition fired

**Done when:** the report matches the PRD output spec and a skeptical reader can trace every gap claim to a source. **This ships v1.**

## Phase 4 — v2 recall & data

- **Reddit** source (verify API pricing/terms first)
- **GitHub** source (open-source competitors, stars as traction)
- **Funding data** — evaluate an affordable path (paid APIs vs press mining); may stay best-effort
- More sources from the [SOURCES.md](SOURCES.md) backlog, prioritized by recall per unit of integration work
- Tuning from real usage: dedup quality, snowball depth, cost per run

**Done when:** measurably better recall than Phase 2 on the same test ideas, at acceptable cost per run.

## Phase 5 — Product

- **UI** — web app on Railway
- Saved runs / history
- Monitoring: "alert me when a new competitor appears in this space"

**Done when:** a non-CLI user can run a validation and share the result.

## Not planned

- Market sizing / TAM estimates
- Business-plan generation
- Trademark/legal clearance
