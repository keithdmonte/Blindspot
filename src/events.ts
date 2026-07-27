/**
 * Progress events emitted by the discovery pipeline. The engine is UI-agnostic:
 * the CLI (src/cli.ts) renders these; the web UI (src/server.ts) forwards the
 * same stream to the browser.
 */
import type { StructuredReport } from "./report.js";

/** A lightweight result reference for the live UI's search-result cards. */
export type SearchResultRef = { title: string; url: string };

export type DiscoveryEvent =
  | { type: "start"; idea: string; maxIterations: number }
  | { type: "expansion_start" }
  | { type: "expansion_done"; queries: string[] }
  | { type: "expansion_fallback"; message: string }
  | { type: "iteration"; iteration: number; maxIterations: number }
  | { type: "budget_exhausted"; reason: "iteration_cap" | "tool_call_cap" }
  | { type: "tool_call"; tool: string; query: string }
  | { type: "tool_results"; tool: string; query: string; count: number; results?: SearchResultRef[] }
  | { type: "tool_error"; tool: string; query: string; message: string }
  | { type: "retry"; label: string; attempt: number; attempts: number; delayMs: number; message: string }
  | { type: "usage"; iteration: number; inputTokens: number; outputTokens: number }
  | { type: "report"; report: StructuredReport };

export type EventHandler = (event: DiscoveryEvent) => void;
