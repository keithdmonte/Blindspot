# Roadmap — Blindspot

Short and current beats long and stale. Phases, not dates. Each phase has a "done when" so progress is checkable.

## Phase 0 — Docs & source verification ✅ done 2026-07-21

- All five docs written; v1 scope cut confirmed ([PRD.md](PRD.md))
- v1 source APIs verified, findings date-stamped in [SOURCES.md](SOURCES.md)

## Phase 1 — Core loop, first source ✅ done 2026-07-21

- Loop ported and made generic over a tool registry (one tool per source; Phase 2 sources are additive)
- CLI entry: `blindspot "<idea>"` (npm link) / `npm run blindspot -- "<idea>"`
- Query expansion via structured outputs, raw-idea fallback
- HN Algolia tool; Tavily web_search kept as optional gap-fill (HN-only without key)
- Verified on the PRD test idea: 20+ competitors, all with HN evidence links, several obscure (~$0.21/run); negative-idea and HN-only runs also pass

## Phase 2 — Full v1 recall ✅ done 2026-07-21

- Product Hunt tool: Tavily-scoped discovery + GraphQL enrichment (API has no post keyword search — see [SOURCES.md](SOURCES.md))
- Alternatives graph via **SaaSHub** (AlternativeTo 403s bots → dropped per source rules) + `fetch_page` for competitor sites and vs-pages
- Fan-out queries × sources, snowballing, stop conditions (saturation + candidate cap via prompt; iteration + tool-call budget caps in engine; stop reason reported)
- **Recall test passed**: on the meeting-recordings idea, plain web search returns the SEO set (Tactiq, Otter, Notta…); Blindspot additionally surfaces Custos, AfterTheCall, Sidenote AI, Admin AI, hq0 and other sub-5-point Show HN / low-vote PH launches it missed
- Note: snowball path verified mid-run on a niche idea; final clean niche run pending an API credit top-up

## Phase 3 — Report quality ✅ done 2026-07-24 (ships v1)

- Full output spec from [PRD.md](PRD.md): verdict, per-competitor enrichment (pricing / positioning / use case / traction), obscurity flags
- Evidence-grounded gaps section — every claim cites a source from the run, or it doesn't ship
- Meta section: sources checked, coverage confidence, thin fields, which stop condition fired

**Done when:** the report matches the PRD output spec and a skeptical reader can trace every gap claim to a source. **This ships v1.**

## Phase 4 — v2 recall & data ✅ done 2026-07-24

- **GitHub** source (`search_github`): REST repo search sorted by stars, keyless with optional `GITHUB_TOKEN`; stars are the traction signal
- **Reddit** source (`search_reddit`): Tavily-scoped to reddit.com — the official Data API is paid/non-commercial, so per source rules we don't build against it. Covers builder announcements + user complaints (gap evidence)
- **Funding data** — decision: stays best-effort/incidental (report surfaces funding only when it appears in another source, flagged unverified); a paid funding API isn't justified. See [SOURCES.md](SOURCES.md)
- Tuning: raised `MAX_TOKENS` 8000→16000 — the richer source set pushed competitor counts high enough to truncate the final report (META/SOURCES were being cut)
- **CI:** `.github/workflows/ci.yml` runs `npm run typecheck` on push/PR. No secrets, never runs `blindspot` itself. Lint + mocked smoke test deferred.

**Verified 2026-07-24** on the meeting-recordings idea: `search_github` and `search_reddit` both fire; GitHub adds open-source competitors the SEO/PH set missed (Meetily 26k⭐, Vexa 2.6k⭐, Steno AI 1.1k⭐); Reddit threads ground both competitor and gap claims; result set is a superset of the Phase 2 run; ~$0.38–0.75/run. A GitHub keyless 429 mid-run degraded gracefully (retry then error fed back, run continued).

**Done when:** measurably better recall than Phase 2 on the same test ideas, at acceptable cost per run. ✅

## Phase 5 — Product

- **UI** — web app on Railway
- Saved runs / history
- Monitoring: "alert me when a new competitor appears in this space"
- **CD:** push to main auto-deploys to Railway; branch protection on main + PRs required. Keys as Railway/GitHub secrets. This is where full CI/CD lands.

**Done when:** a non-CLI user can run a validation and share the result.

## Not planned

- Market sizing / TAM estimates
- Business-plan generation
- Trademark/legal clearance
