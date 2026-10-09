# Public Release Plan

Goal: make Blindspot a public GitHub repo anyone can run locally with their own API key, without lowering output quality.

## Already in good shape

- `.env` is gitignored and was never committed. No Anthropic keys (`sk-ant`) found in history.
- `.env.example` exists and is clear. Only `ANTHROPIC_API_KEY` is required.
- `engines: node >=20` is set. CI exists.
- Optional sources skip themselves when their key is missing.

## Key point: "just an AI key" lowers quality

With only an Anthropic key, Blindspot runs on HN and GitHub alone. Web search, `fetch_page`, Reddit and Product Hunt need `TAVILY_API_KEY` / `PRODUCTHUNT_API_TOKEN`. That is a large recall loss, and recall is the product.

- README must say: **Anthropic key required, Tavily key strongly recommended** (free tier available).
- CLI and UI should print one startup warning naming which sources are off.

## Must do before going public

1. **Secret scan the full history** with `gitleaks` or `trufflehog`, covering Tavily, Product Hunt and GitHub tokens too. Once public, every commit is public. Rotate anything that ever leaked.
2. **Add a `LICENSE`.** MIT is the usual choice. Without one, nobody can legally use the code.
3. **Rewrite the README.** The current one says "Phase 1 complete". It needs:
   - what Blindspot does, plus a screenshot or GIF
   - prerequisites (Node 20+)
   - steps: clone, `npm install`, copy `.env.example`, add keys
   - CLI and web UI usage
   - which key unlocks which source
   - expected cost (about $0.35–0.50 per run, billed to the user's key)
4. **Make the model configurable** in `src/config.ts` with an env var (for example `BLINDSPOT_MODEL`). Pricing is already correct: the $2/$10 Sonnet 5 launch price became the standard price, and cache reads and writes are priced separately (PR #6). Prices are per model, so a model override also needs its prices.
5. **Fail clearly when the key is missing.** Show a friendly message pointing to `.env.example`, not an SDK stack trace.
6. **Make the server safe by default.** Bind to `127.0.0.1` unless the user opts in. With `APP_PASSWORD` blank and a public bind, anyone on the network could spend the user's money.
7. **Clean up internal docs.** Move `NEXT_STEPS.md`, `PHASE6.md`, `PRD.md` and `ROADMAP.md` to `docs/`, or trim or delete them. Add `.claude/` to `.gitignore`.
8. **Note third-party terms.** Scraping AlternativeTo and SaaSHub, plus the Reddit and Product Hunt APIs, each have terms of service. Add a line saying users are responsible for following them.

## Should do (quality and trust)

- **More unit tests.** Dedup tests (`mergeCompetitors`, `mergeMentions`) exist and CI runs `npm test`. Liveness and report parsing (`coerceReport`, XML salvage) still have none.
- `.nvmrc` to pin the Node version.
- `SECURITY.md` on how to report vulnerabilities.
- A short `CONTRIBUTING.md`.
- A `CHANGELOG` and version tags.

## Install options, simplest first

1. **`git clone` + `npm install` + `.env`.** Do this first. Zero extra work.
2. **Docker image:** one `docker run -e ANTHROPIC_API_KEY=...`, for people without Node.
3. **npm publish (`npx blindspot`).** Needs a build step to `dist/`, a proper shebang (`bin` currently points to a `.ts` file), and `"private": true` removed. Later.

Do **not** host a site where people paste their key into the browser. Keep it local-first.

## Other AI providers (OpenAI, Gemini, local models)

Output **will change**, and accuracy may drop.

**Why:**
- The code calls the Anthropic SDK directly, so another provider needs an adapter.
- Prompts (query expansion, candidate cap, liveness rules, `submit_report`) are tuned for Claude.
- A run is up to 15 turns and 70 tool calls, many in parallel, ending in one large structured report (18–27k tokens, capped at 64k). Weaker models stop early, loop, or produce broken JSON.

**What stays vs. what changes:**
- Stays roughly the same: raw candidates. They come from the source tools, not from the model's memory.
- Changes: generated queries (which affects recall), enrichment choices, dedup quality, the verdict, and pricing/funding details (highest hallucination risk).

**Expected quality by tier:**
| Model tier | Result |
|---|---|
| Frontier (latest GPT, Gemini) | Usable but different. Needs prompt retuning. |
| Mid-size | Fewer competitors, shakier verdicts. |
| Small / local (Ollama, 8B-class) | Poor. Cannot reliably run 70 tool calls or produce the report. |

### Recommendation

1. **Launch Claude-only.** It is tested and the quality is proven.
2. **Keep the README honest:** Anthropic key required, Tavily strongly recommended.
3. **Build an eval set** first: about 10 ideas with known competitors, measuring recall, fake competitors, verdict correctness and cost per run.
4. **Add OpenRouter later as an experimental option,** once the eval shows which models hold up.
5. **Never officially support small or local models.** Weak output would damage the project's reputation.

Ship quality first, add choice later.

## Cost to make it public

**$0 to publish.**

| Item | Cost |
|---|---|
| Public GitHub repo | Free |
| API usage | Paid by users with their own keys (about $0.35–0.50/run) |
| GitHub Actions CI | Free and unlimited for public repos |
| npm / Docker Hub (later) | Free |

**What would cost money:**
- **A hosted public demo** where you pay for the API. Every visitor spends your money. Avoid it, or protect it with a password and a spending cap.
- **Your own eval runs:** about 10 ideas × $0.35–0.50, so roughly $4–5 per full pass.
- **Optional custom domain:** about $10–15/year.

**Main cost is time:** roughly 1–3 days for the cleanup list above.

**Safety rule:** set a monthly spend limit on your own key in the Anthropic Console before going public.

## Repo audit: files to delete, move or fix

### Delete
- **`NEXT_STEPS.md`**: personal session notes (names the keys in `.env`, a local port clash with another project, commit hashes). Move open to-dos into GitHub Issues first.
- **`PHASE6.md`**: internal spec for unfinished work. Turn it into a GitHub Issue or Discussion if worth keeping.
- **`PUBLIC_RELEASE.md`** (this file): a planning checklist, not for users. Delete once worked through.

### Move to `docs/` or trim
- **`PRD.md`**: product reasoning, useful to contributors. Move to `docs/`.
- **`ROADMAP.md`**: phase history with internal dates. Trim to a short public roadmap, or move to `docs/`.
- **`TECHNICAL_DESIGN.md`**: good for contributors. Move to `docs/` and update the "Deploy target later: Railway" line.
- **`SOURCES.md`**: keep. Its terms-of-service and rate-limit notes help users. Move to `docs/` and refresh the "VERIFIED 2026-07-21" dates.

### Keep
`README.md` (after the rewrite), `.env.example`, `.gitignore`, `package.json`, `package-lock.json`, `tsconfig.json`, `src/`, `public/`, `.github/workflows/ci.yml`.

### Fix (not files to delete)
- **`src/tools/alternatives.ts:18`**: the user-agent string contains a personal email. Every user's runs would send it to SaaSHub. Make it configurable, or point it to the repo URL.
- **`.claude/settings.local.json`**: untracked only because of a global git ignore. Contributors won't have that rule, so add `.claude/` to the repo's `.gitignore`.
- **Git history**: deleted files stay visible in history. Low risk here (key names and a port only, no values). For a clean slate, squash into one fresh initial commit before going public.

## Order of work

1. Secret scan
2. LICENSE
3. Pricing and model fix
4. Missing-key error and localhost bind
5. README rewrite
6. Docs cleanup and audit fixes (see Repo audit)
7. More tests (liveness, report parsing)
8. Optional: squash history into one fresh commit
9. Flip the repo to public in GitHub settings
10. Later: Docker, npm, experimental OpenRouter
