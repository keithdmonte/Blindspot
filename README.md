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

**Phase 1 complete** — CLI runs end-to-end with query expansion and the Hacker News (Algolia) source, plus optional Tavily web search for gap-fill. Product Hunt, AlternativeTo, and snowballing are next ([ROADMAP.md](ROADMAP.md) Phase 2).

## Quickstart

```bash
npm install
cp .env.example .env    # fill in ANTHROPIC_API_KEY (TAVILY_API_KEY optional)

npm run blindspot -- "a tool that turns meeting recordings into follow-up emails"

# or install the global command:
npm link
blindspot "a tool that turns meeting recordings into follow-up emails"
```

A run prints the expanded query set, live search progress, then a plain-text report: VERDICT / COMPETITORS (each with HN evidence links and obscurity flags) / NOTES / SOURCES, with a token + cost footer. Typical run: ~$0.10–0.25.

## Web UI

The same engine runs in the browser so a non-CLI user can validate an idea and watch it stream.

```bash
# needs ANTHROPIC_API_KEY in .env.
npm run serve                        # http://localhost:3000
```

Enter the idea, and the run streams live over a single NDJSON response — phase chips (expand → sweep → chase → score) and a timestamped log — then renders a report: a verdict block (colored by taken / crowded / open lane, with confidence), competitor cards (overlap + obscurity flags), gap cards, and a source-coverage table.

The report is **structured data**, not prose: the agent ends every run by calling a `submit_report` tool whose fields (`competitors[]`, `gaps[]`, `coverage[]`, verdict + confidence) the CLI and web UI both render — see `src/report.ts`. No database yet — saved runs/history land in the next phase ([ROADMAP.md](ROADMAP.md) Phase 5).

## Deploy

The web app is production-ready and platform-agnostic — no build step, one long-lived streaming endpoint.

- **Start:** `npm start` (runs `src/server.ts` via `tsx`, a runtime dependency). Binds `0.0.0.0` on `$PORT` (injected by the host; defaults to 3000).
- **Health check:** `GET /health` → `{"ok":true}`.
- **Node:** `>=20` (see `engines`).
- **Auth is env-driven.** Leave `APP_PASSWORD` unset and the app is open (fine for localhost). **Set `APP_PASSWORD` and every `/run` is gated** — the front-end reads `GET /config` and shows the access-code field automatically. Set it before exposing a public URL, since each run spends Anthropic credits.

Recommended host: **Railway / Render** (Vercel/Netlify won't work — serverless timeouts kill the minute-long streams). Steps:

1. New project → deploy from the GitHub repo.
2. Set env vars (see [`.env.example`](.env.example)): `ANTHROPIC_API_KEY` (required), `APP_PASSWORD` (set it), `TAVILY_API_KEY` + `GITHUB_TOKEN` (recommended).
3. Start command `npm start`, health-check path `/health`.
4. Deploy, generate a domain, run one validation end-to-end to confirm the stream arrives live.

Also cap spend on the Anthropic key itself (console budget limit) as a backstop.
