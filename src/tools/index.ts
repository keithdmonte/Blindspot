import type { SourceTool } from "./types.js";
import { alternativesTool } from "./alternatives.js";
import { fetchPageTool } from "./fetchpage.js";
import { hnSearchTool } from "./hn.js";
import { productHuntTool } from "./producthunt.js";
import { webSearchTool } from "./web.js";

/**
 * Build the tool registry for a run. Adding a source (AlternativeTo... — see
 * ROADMAP.md Phase 2) is a new module + one entry here. Keyed tools are
 * optional: missing keys shrink the registry instead of failing the run.
 */
export function buildToolRegistry(env: {
  tavilyApiKey?: string;
  productHuntToken?: string;
}): Map<string, SourceTool> {
  const registry = new Map<string, SourceTool>();
  const tools = [
    hnSearchTool(),
    ...(env.productHuntToken ? [productHuntTool(env.productHuntToken, env.tavilyApiKey)] : []),
    alternativesTool(env.tavilyApiKey),
    ...(env.tavilyApiKey ? [fetchPageTool(env.tavilyApiKey), webSearchTool(env.tavilyApiKey)] : []),
  ];
  for (const tool of tools) {
    registry.set(tool.definition.name, tool);
  }
  return registry;
}
