/**
 * Web server (Phase 5, PR1): wraps the CLI engine in an HTTP app so a non-CLI
 * user can run a validation from the browser and watch it stream.
 *
 * The engine (src/discovery.ts) is UI-agnostic and emits DiscoveryEvents; this
 * server forwards each event to the browser as a line of NDJSON over a single
 * long-lived POST /run response. No database yet — history lands in PR2.
 *
 * Run: npm run serve   (needs ANTHROPIC_API_KEY in .env)
 *
 * No auth gate — local-only. Add a spend guard before any public deploy.
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Fastify from "fastify";
import Anthropic from "@anthropic-ai/sdk";
import type { DiscoveryEvent } from "./events.js";
import { PRICE_PER_MTOK_IN, PRICE_PER_MTOK_OUT } from "./config.js";
import { runDiscovery } from "./discovery.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Environment: fail fast rather than boot an app that can't run — or, worse,
// an app open to the whole internet spending money.
// ---------------------------------------------------------------------------

const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
if (!anthropicApiKey) {
  console.error("Missing ANTHROPIC_API_KEY. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

const tavilyApiKey = process.env.TAVILY_API_KEY;
const productHuntToken = process.env.PRODUCTHUNT_API_TOKEN;
const githubToken = process.env.GITHUB_TOKEN;
const port = Number(process.env.PORT ?? 3000);

// NOTE: no auth gate yet — this app is local-only. Before deploying to a public
// URL, add a spend guard (password, rate limit, or per-run cap): each /run call
// spends Anthropic credits, so an open endpoint drains the wallet.

// Map raw errors to short, user-safe messages. Raw API bodies (credit balance,
// request ids, auth details) must never reach the browser.
function friendlyError(err: unknown): string {
  if (err instanceof Anthropic.APIError) {
    const status = err.status;
    const raw = (err.message ?? "").toLowerCase();
    if (status === 400 && raw.includes("credit balance")) {
      return "We're temporarily out of credits. Please try again later.";
    }
    if (status === 401 || status === 403) {
      return "Service is misconfigured. Please try again later.";
    }
    if (status === 429) {
      return "Too many requests right now. Please wait a moment and try again.";
    }
    if (status && status >= 500) {
      return "The AI service is having a moment. Please try again shortly.";
    }
    return "Something went wrong reaching the AI service. Please try again.";
  }
  return "Something went wrong. Please try again.";
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const app = Fastify({ logger: false });

// The whole front-end is one self-contained file; no bundler, no static plugin.
app.get("/", async (_req, reply) => {
  const html = await readFile(join(__dirname, "..", "public", "index.html"), "utf8");
  reply.type("text/html").send(html);
});

app.get("/health", async () => ({ ok: true }));

interface RunBody {
  idea?: unknown;
}

app.post("/run", async (req, reply) => {
  const body = (req.body ?? {}) as RunBody;

  const idea = typeof body.idea === "string" ? body.idea.trim() : "";
  if (!idea) {
    reply.code(400).send({ error: "Missing idea." });
    return;
  }

  // Take over the socket and stream newline-delimited JSON events as they fire.
  reply.hijack();
  const res = reply.raw;
  res.writeHead(200, {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no", // disable proxy buffering so events arrive live
  });

  const send = (obj: unknown) => {
    // Client gone: nothing to do but stop writing.
    if (!res.writableEnded) res.write(JSON.stringify(obj) + "\n");
  };

  const onEvent = (event: DiscoveryEvent) => send(event);

  try {
    const result = await runDiscovery(idea, {
      anthropicApiKey,
      tavilyApiKey,
      productHuntToken,
      githubToken,
      onEvent,
    });
    const cost =
      (result.usage.inputTokens * PRICE_PER_MTOK_IN +
        result.usage.outputTokens * PRICE_PER_MTOK_OUT) /
      1_000_000;
    send({
      type: "done",
      report: result.report,
      iterations: result.iterations,
      toolCalls: result.toolCalls,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      cost,
      stoppedBy: result.stoppedBy,
    });
  } catch (err) {
    console.error(err);
    const message = friendlyError(err);
    send({ type: "fatal", message });
  } finally {
    if (!res.writableEnded) res.end();
  }
});

app.listen({ port, host: "0.0.0.0" }, (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Blindspot web UI on ${address}`);
});
