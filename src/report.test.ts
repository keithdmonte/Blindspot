import { test } from "node:test";
import assert from "node:assert/strict";
import { coerceReport } from "./report.js";

const gap = { title: "No tool for sales teams", why: "3 tried, all dead", evidence: ["https://example.com/g"] };
const lane = {
  idea: "Meeting notes scoped to sales calls",
  whyOpen: "no living competitor targets sales teams",
  gap: "No tool for sales teams",
  nearestCompetitor: "Otter",
  distance: "near",
  evidence: ["https://example.com/l"],
};

test("keeps a lane that builds on a real gap and cites evidence", () => {
  const r = coerceReport({ gaps: [gap], openLanes: [lane] });
  assert.equal(r.openLanes.length, 1);
  assert.deepEqual(r.openLanes[0], lane);
});

test("matches the gap case-insensitively and normalizes to its exact title", () => {
  const r = coerceReport({ gaps: [gap], openLanes: [{ ...lane, gap: "  no TOOL for sales teams " }] });
  assert.equal(r.openLanes[0].gap, "No tool for sales teams");
});

test("drops lanes with no matching gap, no evidence, or no idea", () => {
  const r = coerceReport({
    gaps: [gap],
    openLanes: [
      { ...lane, gap: "A gap that is not in the report" },
      { ...lane, evidence: [] },
      { ...lane, idea: "" },
    ],
  });
  assert.equal(r.openLanes.length, 0);
});

test("caps lanes at 3 and defaults bad fields", () => {
  const r = coerceReport({
    gaps: [gap],
    openLanes: [{ ...lane, distance: "sideways", nearestCompetitor: 7 }, lane, lane, lane],
  });
  assert.equal(r.openLanes.length, 3);
  assert.equal(r.openLanes[0].distance, "near");
  assert.equal(r.openLanes[0].nearestCompetitor, "none");
});

test("missing openLanes coerces to an empty list", () => {
  assert.deepEqual(coerceReport({ gaps: [gap] }).openLanes, []);
});
