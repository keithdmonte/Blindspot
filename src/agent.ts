/**
 * The agent loop, ported from the research agent (Research agent/src/research.ts)
 * and made generic over a tool registry. It knows nothing about sources or
 * about Blindspot: give it a system prompt, a first message, and tools, and it
 * loops until the model answers or the iteration budget forces a synthesis.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { EventHandler } from "./events.js";
import type { SourceTool } from "./tools/types.js";
import { MAX_ITERATIONS, MAX_TOKENS, MODEL } from "./config.js";

export interface AgentResult {
  report: string;
  iterations: number;
  toolCalls: number;
  usage: { inputTokens: number; outputTokens: number };
}

export async function agentLoop(opts: {
  client: Anthropic;
  systemPrompt: string;
  firstMessage: string;
  registry: Map<string, SourceTool>;
  onEvent?: EventHandler;
}): Promise<AgentResult> {
  const { client, systemPrompt, firstMessage, registry } = opts;
  const emit = opts.onEvent ?? (() => {});

  const definitions = [...registry.values()].map((tool) => tool.definition);

  // Full conversation history — resent to the API on every turn.
  const history: Anthropic.MessageParam[] = [{ role: "user", content: firstMessage }];

  let toolCalls = 0;
  const usage = { inputTokens: 0, outputTokens: 0 };

  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    emit({ type: "iteration", iteration, maxIterations: MAX_ITERATIONS });

    // If this is the last allowed iteration, force a final synthesis:
    // no tools offered, plus an instruction to wrap up with what it has.
    const outOfBudget = iteration === MAX_ITERATIONS;
    if (outOfBudget) {
      emit({ type: "budget_exhausted" });
      history.push({
        role: "user",
        content:
          "You have reached the search limit. Stop searching and write your " +
          "final report now, synthesizing what you have found so far.",
      });
    }

    // 1. Call the model with the full history (+ tools, unless forcing a report)
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      tools: outOfBudget ? [] : definitions,
      messages: history,
    });

    usage.inputTokens += response.usage.input_tokens;
    usage.outputTokens += response.usage.output_tokens;
    emit({
      type: "usage",
      iteration,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    });

    // 2. Append the assistant response verbatim — this keeps the tool_use
    //    (and thinking) blocks in history, which the API requires.
    history.push({ role: "assistant", content: response.content });

    // 3. No tool call → this is the final report. Extract the text and stop.
    if (response.stop_reason !== "tool_use") {
      const report = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n");
      emit({ type: "report", text: report });
      return { report, iterations: iteration, toolCalls, usage };
    }

    // 4. Tool call(s) requested → dispatch each through the registry and send
    //    every result back in ONE user message (required for parallel calls).
    const toolUses = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUse of toolUses) {
      const query = String(
        (toolUse.input as { query?: unknown }).query ?? JSON.stringify(toolUse.input),
      );
      emit({ type: "tool_call", tool: toolUse.name, query });
      toolCalls++;

      const tool = registry.get(toolUse.name);
      if (!tool) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: `Unknown tool: ${toolUse.name}`,
          is_error: true,
        });
        continue;
      }

      try {
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id, // must match the tool_use block's id
          content: await tool.run(toolUse.input, emit),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        emit({ type: "tool_error", tool: toolUse.name, query, message });
        // Feed the failure back to the model so it can adapt instead of dying.
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: `Tool call failed: ${message}`,
          is_error: true,
        });
      }
    }

    history.push({ role: "user", content: toolResults });
    // ...and loop: the model sees the results and decides to search again or report.
  }

  // Unreachable: the outOfBudget turn offers no tools, so it always returns above.
  throw new Error("Agent loop exited without a report");
}
