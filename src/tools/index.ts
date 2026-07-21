import type { SourceTool } from "./types.js";
import { hnSearchTool } from "./hn.js";
import { webSearchTool } from "./web.js";

/**
 * Build the tool registry for a run. Adding a source (Product Hunt,
 * AlternativeTo... — see ROADMAP.md Phase 2) is a new module + one entry here.
 * web_search is optional: without a Tavily key the run is HN-only.
 */
export function buildToolRegistry(env: { tavilyApiKey?: string }): Map<string, SourceTool> {
  const registry = new Map<string, SourceTool>();
  for (const tool of [hnSearchTool(), ...(env.tavilyApiKey ? [webSearchTool(env.tavilyApiKey)] : [])]) {
    registry.set(tool.definition.name, tool);
  }
  return registry;
}
