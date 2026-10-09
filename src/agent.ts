/**
 * The agent loop, ported from the research agent (Research agent/src/research.ts)
 * and made generic over a tool registry. It knows nothing about sources or
 * about Blindspot: give it a system prompt, a first message, and tools, and it
 * loops until the model answers or the iteration budget forces a synthesis.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { EventHandler } from "./events.js";
import type { SourceTool } from "./tools/types.js";
import { MAX_ITERATIONS, MAX_TOKENS, MAX_TOOL_CALLS, MODEL, TOOL_CONCURRENCY } from "./config.js";
import { coerceReport, REPORT_TOOL, reportTool, type StructuredReport } from "./report.js";

/** Why the run ended: the model finished on its own, or a budget cap fired. */
export type StopReason = "model" | "iteration_cap" | "tool_call_cap";

export interface AgentResult {
  report: StructuredReport;
  iterations: number;
  toolCalls: number;
  usage: { inputTokens: number; outputTokens: number };
  stoppedBy: StopReason;
}

export async function agentLoop(opts: {
  client: Anthropic;
  systemPrompt: string;
  firstMessage: string;
  registry: Map<string, SourceTool>;
  /** Tool calls to run before the first model turn, recorded in history as if
   * the model had issued them. Saves a model round-trip when the first turn's
   * calls are fully determined by the prompt (the discovery fan-out). */
  seedCalls?: { name: string; input: Record<string, unknown> }[];
  onEvent?: EventHandler;
}): Promise<AgentResult> {
  const { client, systemPrompt, firstMessage, registry } = opts;
  const emit = opts.onEvent ?? (() => {});

  // Source tools plus submit_report — the tool the model calls to end the run.
  const definitions = [...[...registry.values()].map((tool) => tool.definition), reportTool];

  // Full conversation history — resent to the API on every turn.
  const history: Anthropic.MessageParam[] = [{ role: "user", content: firstMessage }];

  let toolCalls = 0;
  const usage = { inputTokens: 0, outputTokens: 0 };

  // One model call over `messages`, with prompt caching and usage tracking.
  // Cache hits count as input tokens too, so the cost shown is an upper bound.
  const callModel = async (
    messages: Anthropic.MessageParam[],
    iteration: number,
    toolChoice?: Anthropic.ToolChoice,
  ) => {
    // Streamed only because the SDK refuses non-streaming calls this large.
    const response = await client.messages
      .stream({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        tools: toolChoice ? [reportTool] : definitions,
        tool_choice: toolChoice,
        messages: withCacheBreakpoints(messages),
      })
      .finalMessage();
    const u = response.usage;
    const input = u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
    usage.inputTokens += input;
    usage.outputTokens += u.output_tokens;
    emit({ type: "usage", iteration, inputTokens: input, outputTokens: u.output_tokens });
    return response;
  };

  // Dispatch each tool call through the registry, up to TOOL_CONCURRENCY at
  // once. Results keep tool_use order and go back in ONE user message
  // (required for parallel calls).
  const runOne = async (toolUse: Anthropic.ToolUseBlockParam): Promise<Anthropic.ToolResultBlockParam> => {
    const input = toolUse.input as { query?: unknown; product?: unknown; url?: unknown };
    const query = String(input.query ?? input.product ?? input.url ?? JSON.stringify(input));
    emit({ type: "tool_call", tool: toolUse.name, query });

    const tool = registry.get(toolUse.name);
    if (!tool) {
      return {
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: `Unknown tool: ${toolUse.name}`,
        is_error: true,
      };
    }

    try {
      return {
        type: "tool_result",
        tool_use_id: toolUse.id, // must match the tool_use block's id
        content: await tool.run(toolUse.input, emit),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      emit({ type: "tool_error", tool: toolUse.name, query, message });
      // Feed the failure back to the model so it can adapt instead of dying.
      return {
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: `Tool call failed: ${message}`,
        is_error: true,
      };
    }
  };

  const dispatch = async (toolUses: Anthropic.ToolUseBlockParam[]) => {
    toolCalls += toolUses.length;
    const results: Anthropic.ToolResultBlockParam[] = new Array(toolUses.length);
    let next = 0;
    const worker = async () => {
      while (next < toolUses.length) {
        const i = next++;
        results[i] = await runOne(toolUses[i]);
      }
    };
    await Promise.all(Array.from({ length: Math.min(TOOL_CONCURRENCY, toolUses.length) }, worker));
    history.push({ role: "user", content: results });
  };

  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    emit({ type: "iteration", iteration, maxIterations: MAX_ITERATIONS });

    // Seeded first turn: record the calls as the model's and run them, no API call.
    if (iteration === 1 && opts.seedCalls?.length) {
      const seeded: Anthropic.ToolUseBlockParam[] = opts.seedCalls.map((call, i) => ({
        type: "tool_use",
        id: `toolu_seed_${i}`,
        name: call.name,
        input: call.input,
      }));
      history.push({ role: "assistant", content: seeded });
      await dispatch(seeded);
      continue;
    }

    // If a budget cap is hit, force a final synthesis: no tools offered,
    // plus an instruction to wrap up with what it has.
    const capReason: StopReason | null =
      iteration === MAX_ITERATIONS
        ? "iteration_cap"
        : toolCalls >= MAX_TOOL_CALLS
          ? "tool_call_cap"
          : null;
    if (capReason) {
      emit({ type: "budget_exhausted", reason: capReason });
      history.push({
        role: "user",
        content:
          "You have reached the search budget. Stop searching and call " +
          "submit_report now with what you have found so far, setting " +
          "stopCondition to budget_exhausted.",
      });
    }

    // 1. Call the model. Normally it may search or call submit_report; at the
    //    budget cap we force submit_report so the run always ends with a report.
    const response = await callModel(
      history,
      iteration,
      capReason ? { type: "tool", name: REPORT_TOOL } : undefined,
    );

    // 2. Append the assistant response verbatim — this keeps the tool_use
    //    (and thinking) blocks in history, which the API requires.
    history.push({ role: "assistant", content: response.content });

    const toolUses = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );

    // 3. submit_report → the run is done. Its validated input IS the report.
    const reportCall = toolUses.find((t) => t.name === REPORT_TOOL);
    if (reportCall) {
      // Truncated tool input arrives empty; coercing it would render a blank
      // report as if the run succeeded. Fail loudly instead.
      if (response.stop_reason === "max_tokens") {
        throw new Error(`submit_report truncated at max_tokens (${MAX_TOKENS})`);
      }
      const report = coerceReport(reportCall.input);
      emit({ type: "report", report });
      return { report, iterations: iteration, toolCalls, usage, stoppedBy: capReason ?? "model" };
    }

    // 3b. Model ended its turn without searching and without a report — nudge
    //     it to finish through the tool instead of stalling.
    if (response.stop_reason !== "tool_use") {
      history.push({
        role: "user",
        content: "Finish by calling submit_report with your structured findings.",
      });
      continue;
    }

    // 4. Source-tool calls → run them and send the results back.
    await dispatch(toolUses);
    // ...and loop: the model sees the results and decides to search again or report.
  }

  // Unreachable: the outOfBudget turn offers no tools, so it always returns above.
  throw new Error("Agent loop exited without a report");
}

/**
 * Mark the last block of the last two user messages for prompt caching. The
 * newest mark writes this turn's prefix; the previous one reads last turn's,
 * so each turn pays full price only for what's new since the last one.
 */
function withCacheBreakpoints(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  const out = [...messages];
  let marked = 0;
  for (let i = out.length - 1; i >= 0 && marked < 2; i--) {
    if (out[i].role !== "user") continue;
    const content = out[i].content;
    const blocks: Anthropic.ContentBlockParam[] =
      typeof content === "string" ? [{ type: "text", text: content }] : [...content];
    const last = blocks[blocks.length - 1];
    blocks[blocks.length - 1] = { ...last, cache_control: { type: "ephemeral" } } as Anthropic.ContentBlockParam;
    out[i] = { ...out[i], content: blocks };
    marked++;
  }
  return out;
}
