#!/usr/bin/env -S npx tsx
/**
 * CLI entry point.
 *
 * Run: blindspot "your product idea"        (after npm link)
 *  or: npm run blindspot -- "your product idea"
 *
 * The engine lives in src/discovery.ts; this file validates the environment
 * and renders events to the terminal.
 */
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import type { DiscoveryEvent } from "./events.js";
import { PRICE_PER_MTOK_IN, PRICE_PER_MTOK_OUT } from "./config.js";
import { runDiscovery } from "./discovery.js";

// ---------------------------------------------------------------------------
// Terminal rendering
// ---------------------------------------------------------------------------

const BOLD = "\x1b[1m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

/**
 * Make the report readable in a terminal: bold the section headings, color
 * URLs, and convert any markdown the model emitted anyway into real ANSI
 * styling instead of literal ** and # characters.
 */
function renderForTerminal(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, `${BOLD}$1${RESET}`) // **bold** → ANSI bold
    .replace(/^#+\s*(.+)$/gm, `${BOLD}$1${RESET}`) // # heading → ANSI bold
    .replace(/^(VERDICT|COMPETITORS|NOTES|SOURCES)\s*$/gm, `${BOLD}$1${RESET}`)
    .replace(/(https?:\/\/[^\s)\]]+)/g, `${CYAN}$1${RESET}`);
}

function logEvent(event: DiscoveryEvent) {
  switch (event.type) {
    case "start":
      console.log(`💡 idea: ${event.idea}`);
      break;
    case "expansion_start":
      console.log("🧭 expanding idea into a query set...");
      break;
    case "expansion_done":
      console.log(`   ↳ ${event.queries.length} queries:`);
      for (const [i, query] of event.queries.entries()) {
        console.log(`     ${i + 1}. ${query}`);
      }
      break;
    case "expansion_fallback":
      console.log(`   ⚠ expansion failed (${event.message}) — falling back to the raw idea`);
      break;
    case "iteration":
      console.log(`\n── iteration ${event.iteration}/${event.maxIterations} ──`);
      break;
    case "budget_exhausted":
      console.log("⏰ search budget exhausted — forcing final synthesis");
      break;
    case "tool_call":
      console.log(`🔍 [${event.tool}] "${event.query}"`);
      break;
    case "tool_results":
      console.log(`   ↳ ${event.count} results`);
      break;
    case "tool_error":
      console.log(`   ⚠ [${event.tool}] failed: ${event.message}`);
      break;
    case "retry":
      console.log(`   ⚠ ${event.label} failed (attempt ${event.attempt}/${event.attempts}): ${event.message}`);
      console.log(`   ↻ retrying in ${event.delayMs / 1000}s...`);
      break;
    case "report":
      console.log("✓ model finished");
      break;
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const idea = process.argv.slice(2).join(" ").trim();
if (!idea) {
  console.error('Usage: blindspot "your product idea"');
  process.exit(1);
}

const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
if (!anthropicApiKey) {
  console.error("Missing ANTHROPIC_API_KEY. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

const tavilyApiKey = process.env.TAVILY_API_KEY;
if (!tavilyApiKey) {
  console.warn("⚠ TAVILY_API_KEY not set — running without web_search (HN only).");
}

try {
  const result = await runDiscovery(idea, { anthropicApiKey, tavilyApiKey, onEvent: logEvent });
  console.log("\n════════════════════════════════\n");
  console.log(renderForTerminal(result.report));
  const cost =
    (result.usage.inputTokens * PRICE_PER_MTOK_IN + result.usage.outputTokens * PRICE_PER_MTOK_OUT) /
    1_000_000;
  console.log(
    `\n(${result.iterations} iterations, ${result.toolCalls} tool calls, ` +
      `${result.usage.inputTokens.toLocaleString()} in / ${result.usage.outputTokens.toLocaleString()} out tokens, ` +
      `~$${cost.toFixed(2)})`,
  );
} catch (err) {
  if (err instanceof Anthropic.APIError) {
    console.error(`\nAnthropic API error (${err.status}): ${err.message}`);
  } else {
    console.error(`\nFatal: ${err instanceof Error ? err.message : err}`);
  }
  process.exit(1);
}
