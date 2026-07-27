# Phase 6 — Liveness & the Pivot Finder

The point of Phase 6 is to move Blindspot from a **directory** ("here's who exists") to a **decision** ("this lane is dead-crowded; *this* adjacent one is open — go there").

Two headline features carry it. This doc specifies exactly what the user sees on screen for each. Everything obeys the standing grounding rule: no value is shown that didn't trace to something a source returned during the run.

---

## Feature 1 — Is this competitor still alive?

**The problem it fixes.** Today every hit on the results page looks equal. A product with a commit this week and a product abandoned in 2022 sit side by side, both counting toward the "crowded" verdict. That is exactly the false-confidence trap the PRD warns about, just inverted: a market looks scarier than it is. Google shows you the corpse; Blindspot should tell you it's a corpse.

**Where the signal comes from.** No new sources needed for v1 of this feature — the raw data is already returned and thrown away:

- GitHub — last push date (already emitted)
- Product Hunt — launch date + upvotes (already emitted)
- Hacker News — story date + points (already emitted)
- Open web / fetch_page — a dead or parked domain (add a reachability check)

The freshest dated signal seen for a competitor becomes its **last-active** date. Age buckets it:

- within 6 months → **Active**
- 6–18 months → **Stale**
- older, or domain unreachable → **Dead**
- no date seen anywhere → **Unknown** (not penalized, just unlabeled)

### What the user sees

**On each competitor card** — a status pill sits in the badge row next to the existing `overlap` and `◆ obscure` badges:

- `● Active` — green
- `● Stale` — amber
- `● Dead` — red
- (Unknown — no pill; card is unchanged)

Directly under the product name, one muted line gives the evidence, so the label is never a black box:

> `last active Mar 2025 · GitHub push`
> `launched 2021 · domain unreachable`

**In the summary bar** (the line that today reads `Confidence 0.72 · recommendation caution · 34 competitors`) two things change:

- the count splits: `34 found · 8 dead · 26 living`
- a toggle appears: **`Hide dead (8)`**

Flipping *Hide dead* removes the dead cards and the summary switches to the living count. On a market that looked crowded at 34, watching it collapse to 8 living players is the single most convincing moment in the product — it is the thing a Google search physically cannot do for you.

**Corroboration chip.** While we're on the card, each competitor also shows how many distinct sources surfaced it: a small `seen in 3 sources` chip. A product three sources agree on is real; a one-mention ghost is noise. The list is sortable by this. (This rides along because the de-dupe work that merges the same product across HN + Product Hunt + GitHub is what makes the count honest in the first place.)

**Verdict honesty.** When a large share of a "crowded" verdict is dead, the one-line landscape summary says so plainly, e.g.:

> *Crowded on paper (34 players) — but 8 are abandoned; 26 are actively maintained.*

---

## Feature 4 — Closest open lane (the pivot finder)

**The problem it fixes.** Today Blindspot ends at the verdict: *taken / crowded / open*. If the answer is "taken," the user is left at a dead end — which is the least useful moment to abandon them. They came to decide what to build; "no" is only half a decision.

**What it does.** After the landscape is mapped, Blindspot proposes **2–3 nearby ideas that are more open than the one asked about** — same skills, same direction, less competition. Each one is grounded in a gap or underserved segment actually found during the run (it reuses the *adjacent categories* the query-expansion step already generated, now aimed at the whitespace instead of at recall). Nothing is invented: an adjacent idea that can't point at a real gap doesn't ship.

### What the user sees

A new **`Closest open lane`** panel appears directly under the verdict block, *above* the competitor list — because when the verdict is "crowded," this is the answer the user actually wants, and it should be the first thing after the bad news.

The panel holds 2–3 idea cards. Each card shows:

- **The adjacent idea** — one line, phrased as a product ("Meeting-notes tool scoped to *sales* calls, with CRM write-back")
- **Why it's open** — one line grounded in the run ("no living competitor targets sales teams; the 3 that tried are all Dead")
- **Exploits gap** — a chip linking to the specific gap from the Gaps section it builds on
- **Nearest competitor** — name + how far off it is ("Otter — partial overlap")
- **Pivot distance** — a `near` / `far` tag, so the user knows if this is a small tack or a real change of direction

Cards carry the same evidence links every other Blindspot claim does — the user can trace "this lane is open" back to the dead competitors and the ungrounded gap that prove it.

**When the original idea is already open.** The panel doesn't disappear — it reframes to *expansion* rather than *escape*: "Your lane is open. Adjacent lanes you could also own:" — turning the pivot finder into a roadmap hint.

**Stretch (opt-in, later).** A `Validate this lane →` button on each card re-runs a fresh Blindspot pass on the adjacent idea to confirm it's actually open, not just open-looking. One level deep only; it costs roughly another full run, so it's a click, never automatic.

---

## Net effect

Feature 1 makes the "crowded" number honest and turns liveness into the moment the tool earns its keep. Feature 4 makes sure the user never leaves at a dead end. Together they are the difference between *"here is a list"* and *"here is what to do."*

## Done when

- Every competitor carries a grounded Active/Stale/Dead/Unknown status and a source count; *Hide dead* works and the summary recomputes.
- Same product arriving from multiple sources is merged into one entry, not double-counted.
- A crowded or taken verdict always ships with at least one grounded adjacent-idea card (or an honest "no adjacent opening found"), and every "why open" claim traces to a source from the run.
