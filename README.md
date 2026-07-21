# Blindspot

**Find the competitors Google can't.** An "is this idea taken?" validator that surfaces the small, new, obscure players authority-ranked search structurally misses.

## What it is

You describe a product idea. Blindspot returns the competitive landscape: who's already building it, their pricing, positioning, funding, use case — and where the gaps are. A verdict (taken / crowded / open lane) with evidence.

## Who it's for

Anyone validating a product idea: solo founders, startup teams, PMs, agencies, investors doing quick diligence.

## Why it exists (the moat)

Google, Perplexity, and ChatGPT rank by authority — backlinks, domain age, traffic. A three-week-old side project with 40 Product Hunt upvotes is invisible to them. But those obscure competitors are exactly what an idea validator must find; the big names are easy and you already know them.

Blindspot's recall comes from three things general search doesn't do:

1. **Search where builders self-publish** — Product Hunt, Hacker News, Reddit, AlternativeTo and "alternatives to X" pages, directories, GitHub. One tool per source, fanned out in parallel, results unioned.
2. **Query expansion** — the idea is reframed many ways (the problem stated 5 different ways, alternate product names, adjacent categories), because tiny startups describe themselves in words you didn't use.
3. **Snowballing** — once a few competitors are found, their pages and "alternatives to" listings are mined to surface the rest. Recall compounds.

See [TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md) for how, [PRD.md](PRD.md) for the product spec, [SOURCES.md](SOURCES.md) for the source list.

## Status

**Docs only — no code yet.** Builds on an existing working research-agent loop (TypeScript, Tavily + Claude API). v1 will be a CLI; UI later. See [ROADMAP.md](ROADMAP.md).

## Quickstart (stub)

```bash
# Not implemented yet. Intended v1 shape:
blindspot "a tool that turns meeting recordings into follow-up emails"
```
