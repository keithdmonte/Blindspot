import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeCompetitors, mergeMentions } from "./dedup.js";
import type { Competitor } from "./report.js";

function comp(name: string, url: string, extra: Partial<Competitor> = {}): Competitor {
  return {
    name,
    url,
    overlap: "partial",
    obscure: false,
    what: "unknown",
    pricing: "unknown",
    positioning: "unknown",
    traction: "unknown",
    alive: "unknown",
    sourceCount: 1,
    evidence: [],
    ...extra,
  };
}

const names = (list: Competitor[]) => list.map((c) => c.name);

test("different repos on github.com stay separate", () => {
  const out = mergeCompetitors([
    comp("Mealie", "https://github.com/mealie-recipes/mealie"),
    comp("Grocy", "https://github.com/grocy/grocy"),
  ]);
  assert.deepEqual(names(out), ["Mealie", "Grocy"]);
});

test("same github repo merges, ignoring deeper paths and www", () => {
  const out = mergeCompetitors([
    comp("Mealie", "https://github.com/mealie-recipes/mealie", { evidence: ["a"] }),
    comp("mealie", "https://www.github.com/mealie-recipes/mealie/issues/12", { evidence: ["b"] }),
  ]);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].evidence, ["a", "b"]);
  assert.equal(out[0].sourceCount, 2);
});

test("different Product Hunt products stay separate", () => {
  const out = mergeCompetitors([
    comp("Dinnerfy", "https://www.producthunt.com/products/dinnerfy/launches/dinnerfy"),
    comp("TastyPlan", "https://www.producthunt.com/products/tastyplan/launches/tastyplan"),
  ]);
  assert.deepEqual(names(out), ["Dinnerfy", "TastyPlan"]);
});

test("reddit URLs key by name: two products in one thread stay separate", () => {
  const thread = "https://www.reddit.com/r/Frugal/comments/1qq7dtt/meal_planner_apps";
  const out = mergeCompetitors([comp("AnyList", thread), comp("Mealime", thread)]);
  assert.deepEqual(names(out), ["AnyList", "Mealime"]);
});

test("reddit URLs with the same name merge", () => {
  const out = mergeCompetitors([
    comp("AnyList", "https://www.reddit.com/r/a/comments/1"),
    comp("anylist", "https://www.reddit.com/r/b/comments/2"),
  ]);
  assert.equal(out.length, 1);
});

test("own domains merge by domain and keep the richest fields", () => {
  const out = mergeCompetitors([
    comp("Plan to Eat", "https://www.plantoeat.com", { pricing: "unknown", overlap: "partial" }),
    comp("PlanToEat", "https://plantoeat.com/pricing", { pricing: "$5.95/mo", overlap: "direct" }),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].name, "Plan to Eat");
  assert.equal(out[0].pricing, "$5.95/mo");
  assert.equal(out[0].overlap, "direct");
});

test("alsoSeen drops products that already have a competitor entry", () => {
  const out = mergeMentions(
    [
      { name: "Mealie", url: "https://github.com/mealie-recipes/mealie/tree/main", evidence: [] },
      { name: "Paprika", url: "https://paprikaapp.com", evidence: [] },
    ],
    [comp("Mealie", "https://github.com/mealie-recipes/mealie")],
  );
  assert.deepEqual(out.map((m) => m.name), ["Paprika"]);
});

test("alsoSeen merges repeats and unions their evidence", () => {
  const out = mergeMentions(
    [
      { name: "Paprika", url: "https://paprikaapp.com", evidence: ["a"] },
      { name: "Paprika 3", url: "https://www.paprikaapp.com/", evidence: ["b"] },
    ],
    [],
  );
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].evidence, ["a", "b"]);
});
