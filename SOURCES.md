# Sources — Blindspot

One tool per source (see [TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md)). All API details below are **assumptions until verified** — terms, pricing, and rate limits shift. Nothing here is a commitment; re-check every row before building against it.

## Source table

| Source | What it covers | API status / cost | v1? |
|---|---|---|---|
| **Product Hunt** | New product launches, taglines, upvotes, launch dates. The canonical "I just built this" surface. | **VERIFIED 2026-07-21.** GraphQL API v2, free. OAuth2; a no-expiry developer token from the API dashboard is enough for scripts. Rate limit: 6,250 complexity points / 15 min. ⚠️ **Non-commercial by default** — commercial use needs written approval (hello@producthunt.com). Fine for the build/validation phase; approval required before Blindspot charges money. Note: since Feb 2023 maker names/Twitter handles are redacted — doesn't affect us (we need products, not makers). **BUILD FINDING 2026-07-21 (schema-introspected): the API has NO keyword search on posts** — only `topics(query:)` (weak: broad categories only), `posts(topic:/url:)`, `post(slug: <launch-slug>)`. Implemented as: Tavily search scoped to producthunt.com for discovery → batched `post(slug:)` lookups for grounded enrichment (votes, launch date); topic-browse fallback without Tavily. Bare product slugs (no `/launches/` in URL) often don't resolve via `post(slug:)` — such hits are kept unenriched rather than dropped. | ✅ v1 |
| **Hacker News (Algolia)** | Show HN launches, launch discussions, candid comment threads (great gap evidence). | **VERIFIED 2026-07-21.** Free, no auth. `hn.algolia.com/api/v1/search` + `/search_by_date`. ~10k requests/hour documented; excessive use gets temporary blocks. Lowest-risk source we have — build first. | ✅ v1 |
| **AlternativeTo** | Crowdsourced alternatives graph — the single best snowball surface. Small tools list themselves here to ride bigger tools' traffic. | **VERIFIED 2026-07-21: no official public API** (nothing in FAQ; `/api/` is their internal backend, disallowed in robots.txt). **BUILD FINDING 2026-07-21: direct page fetch returns 403 even with a browser UA** — active bot protection. Per our rules we don't work around blocks → **dropped as a direct source; replaced by SaaSHub** (below). AlternativeTo content still reaches runs indirectly via Tavily search snippets. Re-check if they ever ship an API. | ❌ dropped (replaced by SaaSHub) |
| **SaaSHub** | Crowdsourced alternatives graph (promoted from backlog — replaces AlternativeTo as the v1 snowball surface). | **VERIFIED 2026-07-21.** No API, but plain page fetch returns 200 with an honest bot UA; robots.txt only restricts specific crawlers (Amazonbot, MJ12bot). Implemented as `search_alternatives`: `saashub.com/<slug>-alternatives`, throttled ~1 req/s, Tavily URL-discovery fallback for odd names. ⚠️ Product-name collisions are real (their "Circleback" is a calendar-sync tool) — tool output includes taglines + a caution so the model can discard mismatched graphs. | ✅ v1 |
| **"Alternatives to X" / "X vs Y" pages + directories** (e.g. SaaS directories, curated lists) | Comparison/listing pages that name obscure players in the same breath as known ones. | **VERIFIED 2026-07-21 (approach-level):** plain web fetch via Tavily/fetch_page — no dedicated API to verify; per-site ToS checked case-by-case as sites come up. | ✅ v1 |
| **Reddit** | Builders announcing in niche subreddits; users complaining (gap evidence). | API is paid/tiered since 2023; current pricing & terms: **VERIFY before building** — cost is TODO | ⏳ v2 |
| **GitHub** | Open-source competitors, stars as traction signal, READMEs as positioning. | REST/GraphQL API, free tier with rate limits; current limits: **VERIFY before building** | ⏳ v2 |
| **Funding data** (Crunchbase, PitchBook, press) | Who's funded, how much. | Crunchbase/PitchBook are **paid**; pricing TODO — do not assume. v1 reports only funding mentions that surface incidentally in other sources, flagged unverified. | ⏳ v2 |

## Candidate sources (backlog — not scheduled)

Everything below fits the recall thesis (builders self-publish there, or users compare/complain there). None are committed to a version yet; same rule applies — **VERIFY API status/cost/terms before building**. Many have no API and would be page-fetch only.

### Launch platforms (same species as Product Hunt)

| Source | What it covers | API status / cost |
|---|---|---|
| **BetaList** | Pre-launch startups — catches competitors before they ship | Unknown; likely page-fetch: **VERIFY** |
| **Indie Hackers** | Product directory + "what I'm building" posts; the obscure-solo-founder demographic | Unknown: **VERIFY** |
| **Y Combinator startup directory** | Every YC batch, free and searchable; slightly-more-funded competitors | Public site, API unknown: **VERIFY** |
| **Uneed** | Smaller PH alternative; tools that can't crack PH's front page | Unknown: **VERIFY** |
| **Microlaunch** | Smaller PH alternative | Unknown: **VERIFY** |
| **Peerlist Launchpad** | Smaller PH alternative | Unknown: **VERIFY** |
| **Kickstarter / Indiegogo** | Hardware/consumer product ideas; pre-orders as traction signal | Unknown: **VERIFY** |

### Review sites (pricing + gap evidence)

| Source | What it covers | API status / cost |
|---|---|---|
| **G2** | Established B2B SaaS reviews — richest source of *complaints* for the gaps section | Commercial API; terms/cost: **VERIFY** |
| **Capterra** | Same, broader SMB coverage | Unknown: **VERIFY** |
| **GetApp** | Same family as Capterra | Unknown: **VERIFY** |
| **Trustpilot** | Consumer-facing product complaints | API exists; terms/cost: **VERIFY** |

### Alternatives graphs (snowball fuel, like AlternativeTo)

| Source | What it covers | API status / cost |
|---|---|---|
| **SaaSHub** | ~~Crowdsourced alternatives graph~~ **Promoted to v1 2026-07-21** — see main source table | — |
| **StackShare** | Dev-tool stacks — what companies actually use | Unknown: **VERIFY** |
| **Slant** | Community-ranked "best X for Y" comparisons | Unknown: **VERIFY** |

### Platform marketplaces (conditional — only when the idea targets that platform)

| Source | What it covers | API status / cost |
|---|---|---|
| **Chrome Web Store** | Browser-extension ideas | Unknown: **VERIFY** |
| **Shopify App Store** | E-commerce app ideas | Unknown: **VERIFY** |
| **Slack App Directory** | Slack-integration ideas | Unknown: **VERIFY** |
| **Figma Community** | Design-tool plugin ideas | Unknown: **VERIFY** |
| **VS Code Marketplace** | Editor-extension ideas | Unknown: **VERIFY** |
| **Apple App Store / Google Play** | Mobile app ideas; ratings + review complaints | iTunes Search API historically free; Play unknown: **VERIFY** |
| **WordPress plugin directory** | WordPress-plugin ideas | Public API historically; **VERIFY** |

### Niche / vertical directories

| Source | What it covers | API status / cost |
|---|---|---|
| **There's An AI For That** | Thousands of tiny AI tools — high recall for AI-flavored ideas | Unknown: **VERIFY** |
| **Futurepedia** | Same, AI tool directory | Unknown: **VERIFY** |
| **npm / PyPI** | Dev-tool ideas — the open-source competitor often ships as a package | Free registry APIs; limits: **VERIFY** |

### Social / startup networks

| Source | What it covers | API status / cost |
|---|---|---|
| **X/Twitter (#buildinpublic)** | Highest recall for the newest, smallest builders | API is paid and restrictive; cost: **VERIFY** — likely expensive |
| **Wellfound (AngelList)** | Startup listings + hiring as a leading indicator of what's being built | Unknown: **VERIFY** |
| **Discord communities** | Builder communities announce there | Effectively unsearchable from outside; probably not viable |

## Proposed v1 source cut

**Start with: Product Hunt + HN Algolia + AlternativeTo/directories.**

- These three are where indie/startup builders most reliably self-publish, and AlternativeTo + directories power the snowball step.
- **Defer: Reddit** (paid API, heavy noise-filtering) — **GitHub** (adds a whole open-source dimension; valuable but separable) — **funding data** (paid sources, lowest-quality field anyway).

## Rules

- No API cost or limit in this file may be treated as fact. Anything not re-verified at build time is a **TODO**, not a plan.
- If a source's terms prohibit our access pattern, we drop or replace the source — noted here, not worked around.
- Each source row should be updated with verified findings (date-stamped) as they're checked.
