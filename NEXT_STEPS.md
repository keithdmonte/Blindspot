# Next steps (as of 2026-10-09)

Pick up here. The speed work from 2026-10-08 (a run went from **~295s to ~163s**) is merged. On 2026-10-09 a truncation bug was fixed, the cost estimate was corrected, and the report now streams into the UI.

## Where things stand

- **Merged:** PR #3 (`parallel-tool-calls`) merged into `main` as `fe1e133`. It contains:
  - `6ba1683` Support keys not scoped to a workspace (`ANTHROPIC_WORKSPACE_ID` header)
  - `0c723d4` Stop dedup from merging different products on shared hosts
  - `03e901c` Time out stalled source requests so they retry (20s, `FETCH_TIMEOUT_MS`)
  - `6dfa131` Cut run time ~295s to ~160s (parallel tool calls, skipped first model turn, prompt caching, `sources` derived from evidence)
- **Merged:** PR #5 (`fix-truncated-report`) merged as `00237a6`. On crowded ideas `submit_report` hit the 16k `max_tokens` limit partway through its JSON, and the UI showed a blank "crowded, 0.50, 0 competitors" report. `MAX_TOKENS` is now 32000, model calls are streamed, and a truncated report now fails with an error instead of showing a blank report.
- **Branch `streaming-report-and-cost`:** to-do items 1, 3 and 5 below.
- **`.env`:** has `ANTHROPIC_API_KEY` (an unscoped key), `ANTHROPIC_WORKSPACE_ID`, `GITHUB_TOKEN` (fine-grained, public read-only), `TAVILY_API_KEY`, `PRODUCTHUNT_API_TOKEN` and `APP_PASSWORD`.
- **Port 3000 is taken** by another project (`nexus-fairdrop`), so run Blindspot on 3001.

## To do (in order)

1. [x] **Fix the cost estimate.** The premise was wrong: Sonnet 5's $2 / $10 launch price became the standard price, and the planned rise to $3 / $15 was cancelled (checked on the pricing page, 2026-10-09). What was actually wrong was that cache reads and writes were priced as full input. Cost is now computed per call: input $2, cache write $2.50, cache read $0.20, output $10 per MTok. A typical run now shows about $0.34.
2. [x] **Land the branch.** Done: PR #3 merged 2026-10-08 with a merge commit, and CI passed.
3. [x] **Stream the report into the UI as it's written.** `submit_report` uses `eager_input_streaming`. The server sends a `report_partial` event each time another competitor, gap or coverage row finishes, and the report screen fills in as they arrive. In a live test, the first competitor appeared at 69s of a 139s run.
4. [ ] **Look into the coverage finding below.** When the model listed competitors without writing full details for each, it found 25–50% more real competitors from the same research. This is still open: it trades detail (more "unknown" fields) for coverage, which is a product decision.
5. [x] **Unit test for `mergeCompetitors`.** `npm test` (node:test via tsx) covers github.com, producthunt.com and reddit.com URLs, plus merging on a product's own domain. CI runs it too.

## Findings and decisions

- **Where the time went (before):** tool calls ran one at a time (97s for the first round of 72 calls), and the final report write took about 105s.
- **Dedup bug (fixed):** competitors were keyed by bare domain, so every GitHub repo and every Product Hunt product collapsed into a single entry. Reports undercounted badly ("12 competitors" was really about 30), and `sourceCount` was inflated (10, 29).
- **Tried and dropped: a parallel report.** The model listed competitors first, then parallel calls filled in the details. It saved only 0–10s, because listing 45–60 names is itself 37–51s and some detail calls think first. It also cost more per run. Quality changed rather than improved: it found more competitors and filled in dates, but wrote "unknown" more often for pricing and traction. Rejected on the no-quality-loss rule.
- **Ruled out to protect quality:** a smaller `CANDIDATE_CAP`, capping evidence URLs, and a faster or cheaper model for the report.
- **GitHub:** without `GITHUB_TOKEN`, search is rate-limited (10/min) and returns 403s. With the token the limit is 30/min.
- **The model writes the verdict last.** Observed `submit_report` field order: competitors, gaps, coverage, stopCondition, thinFields, verdict, recommendation, confidence, verdictWhy. So while the report streams, the UI shows "Weighing the verdict…" until the verdict arrives, instead of a default verdict.
- **Eager streaming skips the API's JSON check.** In 1 of 6 test runs the model's report JSON failed to parse. `callModel` now retries that call once with the report tool buffered (validated as before). Tokens spent on the failed attempt are not counted in the cost shown.
- **Report size:** report calls used 11–16k output tokens for 33–59 competitors. That's why the old 16k limit truncated.

## How to run

```sh
PORT=3001 npm run serve        # web UI at http://localhost:3001 (password = APP_PASSWORD in .env)
npm run blindspot "your idea"  # CLI run, prints the report + timing/cost line
npm run typecheck
npm test                       # offline unit tests, no API calls
```

Restart the server after code or `.env` changes, since it reads both only at startup. A full run costs about $0.35 and takes 120–160s.
