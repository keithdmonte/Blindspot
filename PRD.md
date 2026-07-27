# PRD — Blindspot

## Problem

Before building anything, everyone asks "is this idea taken?" — and then runs a few Google/ChatGPT searches that only surface the well-known, well-linked incumbents. The dangerous competitors — the ones that prove the idea is already being executed, or crowd the niche — are new, small, and obscure. Authority-ranked search structurally cannot find them: no backlinks, no domain age, no traffic. Validation done this way produces false confidence.

## User

Anyone validating a product idea:

- **Solo founders** — before committing months to a build
- **Startup teams / PMs** — scoping a new product or feature line
- **Agencies** — sanity-checking client ideas
- **Investors** — quick diligence on a pitch's "we have no competitors" claim

## Input

A product idea in plain language. One sentence to a paragraph. Example: *"a tool that turns meeting recordings into follow-up emails."*

## Output (per idea)

### 1. Verdict
- **taken / crowded / open lane**
- One-line landscape summary
- Recommendation: **go / caution / no-go**

### 2. Competitor list
- Every player found: name + link
- One-liner on each
- Obscurity flag: how new/small/hidden each one is (the obscure ones are the value)

### 3. Per competitor
- **Pricing** — or explicitly "gated/unknown"
- **Positioning / target** — who they sell to, how they frame it
- **Current use case** — what it actually does today
- **Funding** — best-effort; flagged **unverified** when not confirmed
- **Traction signal** — reviews, upvotes, GitHub stars, launch date; whatever exists

### 4. Gaps & opening
- Common complaints across reviews/threads — **with sources**
- What none of the competitors do well
- Where an opening exists — **or an honest statement that there isn't one**
- Hard rule: every gap claim must be grounded in real evidence found during the run. Never invented.

### 5. Meta
- Sources checked + coverage confidence
- Fields where data was thin

### 6. Liveness *(Phase 6 — see [PHASE6.md](PHASE6.md))*
- Each competitor tagged **Active / Stale / Dead / Unknown** from the freshest dated signal found (GitHub last push, launch date, dead-domain check) — with the evidence shown
- **Seen in N sources** corroboration count per competitor (same product merged across sources, not double-counted)
- **Hide dead** toggle; the crowded count and summary recompute to living players only

### 7. Closest open lane *(Phase 6 — see [PHASE6.md](PHASE6.md))*
- When crowded/taken: 2–3 nearby ideas that are more open, each grounded in a gap found this run — with the gap it exploits, the nearest competitor, and a near/far pivot tag
- When already open: reframed as adjacent lanes the user could also own
- Hard rule (inherits from Gaps): every "why open" claim traces to a source from the run, or it doesn't ship

## ✅ v1 SCOPE CUT — CONFIRMED 2026-07-21

### IN for v1
- CLI (no UI)
- Sources: **Product Hunt, Hacker News (Algolia API), AlternativeTo + "alternatives/vs" pages + directories** (see [SOURCES.md](SOURCES.md))
- Query expansion + snowballing
- Full output spec above, with these v1 softenings:
  - **Funding**: only what surfaces incidentally in the sources searched (e.g. mentioned in an HN thread). No dedicated funding lookup.
  - **Pricing**: from competitor pages when reachable; otherwise "gated/unknown".

### DEFERRED to v2+
- Reddit as a source
- GitHub as a source
- All other candidate sources (launch platforms, review sites, marketplaces, directories — backlog in [SOURCES.md](SOURCES.md))
- Dedicated funding data (Crunchbase/PitchBook are paid; see honest limits below)
- UI / web app
- Saved runs, history, monitoring ("alert me if a new competitor appears")

### Rationale for the cut
The three v1 sources are where indie/startup builders most reliably self-publish at launch, and they cover the recall thesis. Reddit and GitHub add recall but also add API/auth complexity and noise-filtering work. Funding data is the weakest-quality field regardless — deferring it costs little.

## Honest limits (must survive into every future version of this doc)

- **Funding data is partial.** Crunchbase/PitchBook are paid. Anything reported is best-effort and flagged unverified unless confirmed.
- **Source API terms shift.** Every source's API status/cost must be re-verified before building against it ([SOURCES.md](SOURCES.md)).
- **Product Hunt's API is non-commercial by default** (verified 2026-07-21). Free to build and validate with, but written approval from Product Hunt is required before Blindspot becomes a paid product.
- **Gaps must be evidence-grounded.** The "opening" section is only credible if every claim traces to a real complaint/thread/review found during the run. An honest "no clear opening" is a valid and expected output.

## Non-goals

- Not a market-sizing tool. No TAM estimates.
- Not a business-plan generator. It reports the landscape; the go/no-go call is the user's.
- Not exhaustive legal/trademark clearance.
