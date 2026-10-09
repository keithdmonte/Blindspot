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
 * Auth is optional and env-driven: set APP_PASSWORD and every /run is gated;
 * leave it unset (local dev) and the app is open. So the same build runs
 * open on localhost and gated in production just by setting one env var.
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { timingSafeEqual } from "node:crypto";
import Fastify from "fastify";
import Anthropic from "@anthropic-ai/sdk";
import type { DiscoveryEvent } from "./events.js";
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
// Localhost only unless HOST opts in (e.g. 0.0.0.0 for Docker or a deploy).
const host = process.env.HOST?.trim() || "127.0.0.1";

// Optional spend gate. When APP_PASSWORD is set, /run demands it — set this
// before exposing a public URL, since every run spends Anthropic credits.
const appPassword = process.env.APP_PASSWORD;
const authRequired = Boolean(appPassword);
const localOnly = host === "127.0.0.1" || host === "localhost" || host === "::1";
if (!authRequired && !localOnly) {
  console.warn(
    `APP_PASSWORD not set and HOST is ${host} — anyone who can reach this ` +
      "machine can start runs on your API key. Set APP_PASSWORD.",
  );
}

/** Constant-time password check so we don't leak length/prefix via timing. */
function passwordOk(supplied: unknown): boolean {
  if (typeof supplied !== "string") return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(appPassword as string);
  // timingSafeEqual throws on length mismatch, so guard it — but still run a
  // comparison against a fixed buffer to keep timing roughly constant.
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

// Map raw errors to short, user-safe messages. Raw API bodies (credit balance,
// request ids, auth details) must never reach the browser.
function friendlyError(err: unknown): string {
  if (err instanceof Anthropic.APIError) {
    const status = err.status;
    const raw = (err.message ?? "").toLowerCase();
    if (status === 400 && raw.includes("credit balance")) {
      return "Your Anthropic account is out of credits. Add credits in the Anthropic Console.";
    }
    if (status === 401 || status === 403) {
      return "Anthropic rejected the API key. Check ANTHROPIC_API_KEY in .env.";
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

// Lets the front-end know whether to show the password field.
app.get("/config", async () => ({ authRequired }));

interface RunBody {
  idea?: unknown;
  password?: unknown;
}

app.post("/run", async (req, reply) => {
  const body = (req.body ?? {}) as RunBody;

  if (authRequired && !passwordOk(body.password)) {
    reply.code(401).send({ error: "Wrong password." });
    return;
  }

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
    send({
      type: "done",
      report: result.report,
      iterations: result.iterations,
      toolCalls: result.toolCalls,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      cost: result.usage.cost,
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

app.listen({ port, host }, (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Blindspot web UI on ${address}`);
});
