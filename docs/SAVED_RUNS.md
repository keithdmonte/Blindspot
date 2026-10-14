# Spec — Saved runs

Status: **draft, 2026-10-14**. Phase 5 item from [ROADMAP.md](ROADMAP.md). Storage and sharing decided 2026-10-14; remaining questions at the end.

## Why

Today a report lives only in the open browser tab. Close it and the ~$0.40 run is gone; there is no way to send it to anyone. Phase 5 is done when "a non-CLI user can run a validation and share the result", and saved runs are the missing piece. Monitoring (alert on a new competitor) also needs a stored run to diff against.

## Goals

1. Every finished run is saved automatically, with no extra click.
2. A history list shows past runs; clicking one re-opens the full report with no new API spend.
3. A run can be shared with someone who has no access code.
4. A run started from **Validate this lane** remembers which run it came from.

## Non-goals (this PR)

- User accounts or per-user history. Blindspot is single-tenant: one access code, one shared history.
- Monitoring / re-running on a schedule (next Phase 5 item; builds on this).
- Saving partial, aborted or failed runs.
- Search or filtering in history.
- Editing a saved report.

## What gets saved

One record per finished run, written when the server sends the `done` event:

| Field | Source | Notes |
|---|---|---|
| `id` | generated | random, unguessable (`crypto.randomUUID()`); doubles as the share token |
| `idea` | request body | |
| `createdAt` | server clock | ISO timestamp |
| `parentId` | request body, optional | set when the run came from a lane button |
| `report` | `done.report` | the `StructuredReport`, as sent to the browser |
| `stats` | `done` event | `iterations`, `toolCalls`, `inputTokens`, `outputTokens`, `cost`, `stoppedBy` |

The run log (the streamed tool-call events) is **not** saved. It is large and only useful while watching. A re-opened run hides the *View the full run log* button.

Shape the record exactly like the `done` event plus `id`, `idea`, `createdAt` and `parentId`, so the front-end renders a saved run with the same `renderReport(report, stats)` call it uses today.

## Storage — decided: JSON files

The app runs on Node 20 and is not deployed anywhere yet (localhost only, per [TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md)).

- **A. JSON file per run in `runs/` (chosen).** Zero dependencies, zero setup, works on localhost today. `runs/` is git-ignored. List = read the directory, newest first. Fine up to thousands of runs. On Railway it needs a volume mounted at `runs/`.
- **B. Postgres via `pg`.** One dependency plus a database to run locally (or a Railway Postgres). Worth it only for several server instances or querying across runs, and Blindspot needs neither yet.
- **C. SQLite.** Node 20 has no built-in `node:sqlite`, so this means `better-sqlite3`, a native module. More setup than A with little gain at this size.

Put storage behind a four-function module (`saveRun`, `getRun`, `listRuns`, `deleteRun`) in `src/runs.ts`, so moving A to B later touches one file.

Like `APP_PASSWORD`, saving is env-driven: `RUNS_DIR` (default `runs/`). No separate on/off switch.

## Sharing — decided: public read-only link

- **Read-only link `/r/:id`, no access code (chosen).** The access code gates *spending*; viewing a saved report costs nothing. The random id is the secret: anyone with the link can view, nobody can list or guess others. Only useful once the app is deployed, since a localhost link works for nobody else.
- *Rejected:* **also gate links behind the access code.** Safer for confidential ideas, but then sharing means sharing the code, which also lets the recipient spend.
- *Rejected:* **download instead of a link.** A *Download report* button that saves a self-contained HTML file. Works with no deploy, but it's a second rendering path to maintain.

History and delete stay behind the access code, and a shared page shows no history, delete or *New idea* controls.

## API

All new routes follow the existing `/run` auth rule: gated when `APP_PASSWORD` is set, open on localhost.

| Route | Auth | Returns |
|---|---|---|
| `POST /run` | unchanged | unchanged stream; the `done` event gains `id`. Body may add `parentId` |
| `GET /runs` | access code | `[{ id, idea, createdAt, verdict, competitorCount, cost, parentId }]`, newest first |
| `GET /runs/:id` | none (id is the secret) | full saved record, or 404 |
| `DELETE /runs/:id` | access code | 204, or 404 |
| `GET /r/:id` | none | the normal `index.html`; the page sees `/r/:id`, fetches `/runs/:id` and renders it read-only |

Today the access code goes in the `/run` POST body. GET and DELETE need it in a header instead (`X-Access-Code`). The front-end keeps the code in memory after the first successful run, as now.

A save failure (disk full, bad permissions) must not break the run: log it and send `done` without `id`. The user still sees the report, just with no share link.

## UI

- **Input screen:** a *Recent runs* list under the idea box: idea (one line, truncated), verdict chip, date, cost. Click re-opens the run. Hidden when empty or when the access code is still unknown.
- **Report screen:** a *Copy share link* button next to *← New idea*, once the run has an `id`.
- **Lane runs:** the report header shows *Validating a lane from: <parent idea>*, linking back to the parent run.
- **Re-opened run:** identical report, minus the run-log button. The one-level lane rule still applies: if the saved run has a `parentId`, its lanes get no button.

## Done when

- A finished run appears in *Recent runs* after a page reload and re-opens with the same verdict, competitors, gaps, lanes and dead-competitor line, at $0.
- A share link opens the report in a private window without the access code, and `/runs` still demands it.
- A lane run shows its parent and links back to it.
- Stopping a run mid-way saves nothing.
- A forced save failure still shows the report.
- `npm test` covers `src/runs.ts` (save → get → list order → delete → 404) against a temp directory.

## Open questions

- Retention: keep forever, or cap history at N runs? (Default: forever. Each record is one report's JSON plus stats; measure a real one before deciding.)
- Should `DELETE` exist in v1, or is deleting files by hand enough for a single-user app?
- Deploy: sharing by link needs the app reachable from outside. Does Railway deploy (roadmap's CD item) come before or after this?
