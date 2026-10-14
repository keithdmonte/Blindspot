/**
 * Saved runs: one JSON file per finished run in a directory (RUNS_DIR,
 * default runs/). A record is the `done` event's report and stats plus id,
 * idea and timestamps, so the front-end renders a saved run exactly like a
 * live one. Everything storage-specific lives here, so moving to a database
 * later touches only this file.
 */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { StructuredReport } from "./report.js";

export interface RunStats {
  iterations: number;
  toolCalls: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  stoppedBy: string;
}

export interface SavedRun {
  id: string;
  idea: string;
  createdAt: string;
  /** Set when the run came from a "Validate this lane" button. */
  parentId?: string;
  parentIdea?: string;
  report: StructuredReport;
  stats: RunStats;
}

export interface RunSummary {
  id: string;
  idea: string;
  createdAt: string;
  parentId?: string;
  verdict: string;
  competitorCount: number;
  cost: number;
}

// Ids are randomUUIDs. Checking the shape also keeps a crafted id from
// reaching the filesystem as a path.
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const isRunId = (id: unknown): id is string => typeof id === "string" && ID.test(id);

const fileFor = (dir: string, id: string) => join(dir, `${id}.json`);

export async function saveRun(
  dir: string,
  run: Omit<SavedRun, "id" | "createdAt">,
  now = new Date(),
): Promise<SavedRun> {
  const saved: SavedRun = { ...run, id: randomUUID(), createdAt: now.toISOString() };
  await mkdir(dir, { recursive: true });
  // Write then rename, so a crash mid-write never leaves a half-written .json.
  const tmp = fileFor(dir, saved.id) + ".tmp";
  await writeFile(tmp, JSON.stringify(saved));
  await rename(tmp, fileFor(dir, saved.id));
  return saved;
}

export async function getRun(dir: string, id: string): Promise<SavedRun | undefined> {
  if (!isRunId(id)) return undefined;
  try {
    return JSON.parse(await readFile(fileFor(dir, id), "utf8")) as SavedRun;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
}

/** Newest first. */
export async function listRuns(dir: string): Promise<RunSummary[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const runs = await Promise.all(
    names.filter((n) => n.endsWith(".json")).map((n) => getRun(dir, n.slice(0, -".json".length))),
  );
  return runs
    .filter((r): r is SavedRun => r !== undefined)
    .map((r) => ({
      id: r.id,
      idea: r.idea,
      createdAt: r.createdAt,
      ...(r.parentId ? { parentId: r.parentId } : {}),
      verdict: r.report.verdict,
      competitorCount: r.report.competitors.length,
      cost: r.stats.cost,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
