# Next steps (as of 2026-10-08)

Pick up here. Today's session was about making runs faster without losing report quality. A run went from **~295s to ~163s**.

## Where things stand

- **Merged:** PR #3 (`parallel-tool-calls`) merged into `main` as `fe1e133`. It contains:
  - `6ba1683` Support keys not scoped to a workspace (`ANTHROPIC_WORKSPACE_ID` header)
  - `0c723d4` Stop dedup from merging different products on shared hosts
  - `03e901c` Time out stalled source requests so they retry (20s, `FETCH_TIMEOUT_MS`)
  - `6dfa131` Cut run time ~295s to ~160s (parallel tool calls, skipped first model turn, prompt caching, `sources` derived from evidence)
- **`.env`:** has `ANTHROPIC_API_KEY` (an unscoped key), `ANTHROPIC_WORKSPACE_ID`, `GITHUB_TOKEN` (fine-grained, public read-only), `TAVILY_API_KEY`, `PRODUCTHUNT_API_TOKEN` and `APP_PASSWORD`.
- **Port 3000 is taken** by another project (`nexus-fairdrop`), so run Blindspot on 3001.

## To do (in order)

1. [ ] **Fix the cost estimate.** `src/config.ts` still uses the Sonnet 5 intro price ($2 in / $10 out, valid through 2026-08-31). The rate now is $3 / $15. Separately, `inputTokens` now includes cache reads, so the cost shown is an upper bound. Pricing cache reads at about 0.1× would make it accurate.
2. [x] **Land the branch.** Done: PR #3 merged 2026-10-08 with a merge commit, and CI passed.
3. [ ] **Stream the report into the UI as it's written.** The final report call is now about 96s of the ~163s total. Streaming doesn't cut total time, but results start showing about 60s in instead of at the end. This is the last speed lever that doesn't touch quality.
4. [ ] **Look into the coverage finding below.** When the model listed competitors without writing full details for each, it found 25–50% more real competitors from the same research. Worth exploring as a quality improvement, separate from speed.
5. [ ] (Optional) Add a unit test for `mergeCompetitors` covering shared-host URLs (github.com, producthunt.com, reddit.com). There's no test script in `package.json` yet.

## Findings and decisions from today

- **Where the time went (before):** tool calls ran one at a time (97s for the first round of 72 calls), and the final report write took about 105s.
- **Dedup bug (fixed):** competitors were keyed by bare domain, so every GitHub repo and every Product Hunt product collapsed into a single entry. Reports undercounted badly ("12 competitors" was really about 30), and `sourceCount` was inflated (10, 29).
- **Tried and dropped: a parallel report.** The model listed competitors first, then parallel calls filled in the details. It saved only 0–10s, because listing 45–60 names is itself 37–51s and some detail calls think first. It also cost more per run. Quality changed rather than improved: it found more competitors and filled in dates, but wrote "unknown" more often for pricing and traction. Rejected on the no-quality-loss rule.
- **Ruled out to protect quality:** a smaller `CANDIDATE_CAP`, capping evidence URLs, and a faster or cheaper model for the report.
- **GitHub:** without `GITHUB_TOKEN`, search is rate-limited (10/min) and returns 403s. With the token the limit is 30/min.

## How to run

```sh
PORT=3001 npm run serve        # web UI at http://localhost:3001 (password = APP_PASSWORD in .env)
npm run blindspot "your idea"  # CLI run, prints the report + timing/cost line
npm run typecheck
```

Restart the server after code or `.env` changes, since it reads both only at startup. A full run costs about $0.45–0.60 and takes about 160s.
