import type Anthropic from "@anthropic-ai/sdk";
import type { EventHandler } from "../events.js";

/**
 * One tool per source (TECHNICAL_DESIGN.md). Each source's quirks — auth,
 * rate limits, result shape — stay inside its own module; adding a v2 source
 * is a new file plus a registry entry, never a loop change.
 */
export interface SourceTool {
  definition: Anthropic.Tool;
  /** Execute the call and return plain text formatted for the model. */
  run(input: unknown, emit: EventHandler): Promise<string>;
}
