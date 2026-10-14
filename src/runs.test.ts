import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { coerceReport } from "./report.js";
import { getRun, isRunId, listRuns, saveRun } from "./runs.js";

const stats = { iterations: 2, toolCalls: 40, inputTokens: 1000, outputTokens: 200, cost: 0.37, stoppedBy: "end_turn" };
const report = coerceReport({ verdict: "crowded" });

async function withDir(fn: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "blindspot-runs-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("a saved run reads back unchanged", () =>
  withDir(async (dir) => {
    const saved = await saveRun(dir, { idea: "habit tracker", report, stats });
    assert.ok(isRunId(saved.id));
    assert.deepEqual(await getRun(dir, saved.id), saved);
    // No temp file left behind.
    assert.deepEqual(await readdir(dir), [`${saved.id}.json`]);
  }));

test("list is newest first and summarises each run", () =>
  withDir(async (dir) => {
    const old = await saveRun(dir, { idea: "old", report, stats }, new Date("2026-10-01"));
    const lane = await saveRun(
      dir,
      { idea: "new", parentId: old.id, parentIdea: "old", report, stats },
      new Date("2026-10-02"),
    );
    assert.deepEqual(await listRuns(dir), [
      { id: lane.id, idea: "new", createdAt: lane.createdAt, parentId: old.id, verdict: "crowded", competitorCount: 0, cost: 0.37 },
      { id: old.id, idea: "old", createdAt: old.createdAt, verdict: "crowded", competitorCount: 0, cost: 0.37 },
    ]);
  }));

test("missing directory lists as empty", async () => {
  assert.deepEqual(await listRuns(join(tmpdir(), "blindspot-runs-does-not-exist")), []);
});

test("unknown or malformed ids return undefined", () =>
  withDir(async (dir) => {
    await writeFile(join(dir, "secret.json"), "{}");
    assert.equal(await getRun(dir, "00000000-0000-0000-0000-000000000000"), undefined);
    assert.equal(await getRun(dir, "../secret"), undefined);
    assert.equal(await getRun(dir, "secret"), undefined);
  }));
