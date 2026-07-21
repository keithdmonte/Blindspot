/**
 * Progress events emitted by the discovery pipeline. The engine is UI-agnostic:
 * the CLI (src/cli.ts) renders these; a future web UI can listen to the same
 * stream.
 */
export type DiscoveryEvent =
  | { type: "start"; idea: string; maxIterations: number }
  | { type: "expansion_start" }
  | { type: "expansion_done"; queries: string[] }
  | { type: "expansion_fallback"; message: string }
  | { type: "iteration"; iteration: number; maxIterations: number }
  | { type: "budget_exhausted" }
  | { type: "tool_call"; tool: string; query: string }
  | { type: "tool_results"; tool: string; query: string; count: number }
  | { type: "tool_error"; tool: string; query: string; message: string }
  | { type: "retry"; label: string; attempt: number; attempts: number; delayMs: number; message: string }
  | { type: "usage"; iteration: number; inputTokens: number; outputTokens: number }
  | { type: "report"; text: string };

export type EventHandler = (event: DiscoveryEvent) => void;
