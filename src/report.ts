/**
 * The structured report the agent produces. Instead of writing prose, the
 * model ends a run by calling the `submit_report` tool with this shape — so
 * the CLI and the web UI both render from data, not from parsed text.
 *
 * Every field still obeys the grounding rule (see prompts.ts): a value the
 * model did not see in a tool result is "unknown", never invented.
 */
import type Anthropic from "@anthropic-ai/sdk";

export type Verdict = "taken" | "crowded" | "open lane";
export type Recommendation = "go" | "caution" | "no-go";
export type Overlap = "direct" | "partial" | "adjacent";
export type Confidence = "high" | "medium" | "low" | "thin";
export type StopCondition = "saturation" | "candidate_cap" | "budget_exhausted";

export interface Competitor {
  name: string;
  url: string;
  /** How squarely it competes with the idea. */
  overlap: Overlap;
  /** True for the small/new/barely-launched hits general search misses. */
  obscure: boolean;
  what: string;
  pricing: string;
  positioning: string;
  traction: string;
  /** Only when it surfaced incidentally in a source; else omitted. */
  funding?: string;
  evidence: string[];
}

export interface Gap {
  /** Short headline number, e.g. "0/9" or "240▲". Optional. */
  stat?: string;
  /** Label under the stat, e.g. "coverage" or "upvotes". Optional. */
  statLabel?: string;
  title: string;
  why: string;
  evidence: string[];
}

export interface Coverage {
  source: string;
  queries: number;
  hits: number;
  confidence: Confidence;
  note: string;
}

export interface StructuredReport {
  verdict: Verdict;
  recommendation: Recommendation;
  /** 0–1; the model's own confidence in the verdict. */
  confidence: number;
  verdictWhy: string;
  competitors: Competitor[];
  gaps: Gap[];
  coverage: Coverage[];
  stopCondition: StopCondition;
  /** Fields that were thin/unknown across competitors (e.g. "pricing"). */
  thinFields: string[];
  sources: string[];
}

/** Tool name the agent calls to end a run with the structured report. */
export const REPORT_TOOL = "submit_report";

/**
 * The `submit_report` tool. Property names match StructuredReport exactly, so
 * the validated tool input IS the report — no mapping layer to drift.
 */
export const reportTool: Anthropic.Tool = {
  name: REPORT_TOOL,
  description:
    "Submit the final competitive-landscape report. Call this once, only when " +
    "you have finished searching. Every field must trace to something you saw " +
    "in a tool result this run — use \"unknown\" for a field you could not " +
    "confirm, never guess.",
  input_schema: {
    type: "object",
    properties: {
      verdict: {
        type: "string",
        enum: ["taken", "crowded", "open lane"],
        description:
          "taken = a funded player owns this exact wedge; crowded = many " +
          "products, but a lane exists; open lane = little purpose-built competition.",
      },
      recommendation: {
        type: "string",
        enum: ["go", "caution", "no-go"],
      },
      confidence: {
        type: "number",
        description: "0 to 1 — your confidence in the verdict given coverage.",
      },
      verdictWhy: {
        type: "string",
        description: "One or two sentences justifying the verdict, grounded in what you found.",
      },
      competitors: {
        type: "array",
        description: "One entry per distinct product found. Keep obscure ones — they are the point.",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            url: { type: "string", description: "Primary URL, or \"unknown\"." },
            overlap: {
              type: "string",
              enum: ["direct", "partial", "adjacent"],
              description: "direct = same core job; partial = overlaps; adjacent = nearby category.",
            },
            obscure: {
              type: "boolean",
              description: "True for small/new/barely-launched hits an authority search misses.",
            },
            what: { type: "string", description: "One line on what it actually does today." },
            pricing: { type: "string", description: "Price if seen (e.g. $5/mo, free) else \"gated/unknown\"." },
            positioning: { type: "string", description: "Who they sell to and how they frame it, else \"unknown\"." },
            traction: { type: "string", description: "Concrete signal: HN points, PH upvotes, stars, launch date, else \"unknown\"." },
            funding: { type: "string", description: "Only if it surfaced incidentally; mark unverified. Omit otherwise." },
            evidence: { type: "array", items: { type: "string" }, description: "URL(s) where you saw this." },
          },
          required: ["name", "url", "overlap", "obscure", "what", "pricing", "positioning", "traction", "evidence"],
        },
      },
      gaps: {
        type: "array",
        description: "Openings grounded in complaints/coverage you saw. Every gap cites a source.",
        items: {
          type: "object",
          properties: {
            stat: { type: "string", description: "Short headline number, e.g. \"0/9\" or \"240▲\". Optional." },
            statLabel: { type: "string", description: "Label under the stat, e.g. \"coverage\". Optional." },
            title: { type: "string" },
            why: { type: "string" },
            evidence: { type: "array", items: { type: "string" } },
          },
          required: ["title", "why", "evidence"],
        },
      },
      coverage: {
        type: "array",
        description: "One row per source you actually used.",
        items: {
          type: "object",
          properties: {
            source: { type: "string", description: "e.g. Hacker News, Product Hunt, GitHub, Reddit, Alternatives graph, Open web." },
            queries: { type: "number", description: "How many queries you ran against it." },
            hits: { type: "number", description: "Roughly how many results it returned." },
            confidence: { type: "string", enum: ["high", "medium", "low", "thin"] },
            note: { type: "string", description: "One short line, e.g. \"mostly noise, 1 rate limit\"." },
          },
          required: ["source", "queries", "hits", "confidence", "note"],
        },
      },
      stopCondition: {
        type: "string",
        enum: ["saturation", "candidate_cap", "budget_exhausted"],
        description: "Which condition ended the search.",
      },
      thinFields: {
        type: "array",
        items: { type: "string" },
        description: "Fields that were thin/unknown across competitors, e.g. [\"pricing\", \"funding\"].",
      },
      sources: {
        type: "array",
        items: { type: "string" },
        description: "One URL per line — only the ones you actually relied on.",
      },
    },
    required: [
      "verdict",
      "recommendation",
      "confidence",
      "verdictWhy",
      "competitors",
      "gaps",
      "coverage",
      "stopCondition",
      "thinFields",
      "sources",
    ],
  },
};

/**
 * Coerce raw submit_report tool input into a StructuredReport. The model
 * follows the schema well but isn't guaranteed to — fill missing arrays and
 * clamp the odd out-of-range value so the renderers never hit undefined.
 */
export function coerceReport(input: unknown): StructuredReport {
  const o = (input ?? {}) as Record<string, unknown>;
  const str = (v: unknown, fallback = "unknown") => (typeof v === "string" && v.trim() ? v : fallback);
  const num = (v: unknown, fallback = 0) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

  const verdict = (["taken", "crowded", "open lane"] as const).includes(o.verdict as Verdict)
    ? (o.verdict as Verdict)
    : "crowded";
  const recommendation = (["go", "caution", "no-go"] as const).includes(o.recommendation as Recommendation)
    ? (o.recommendation as Recommendation)
    : "caution";
  const stopCondition = (["saturation", "candidate_cap", "budget_exhausted"] as const).includes(
    o.stopCondition as StopCondition,
  )
    ? (o.stopCondition as StopCondition)
    : "saturation";

  const competitors: Competitor[] = arr(o.competitors).map((raw) => {
    const c = (raw ?? {}) as Record<string, unknown>;
    const overlap = (["direct", "partial", "adjacent"] as const).includes(c.overlap as Overlap)
      ? (c.overlap as Overlap)
      : "partial";
    return {
      name: str(c.name, "unnamed"),
      url: str(c.url),
      overlap,
      obscure: Boolean(c.obscure),
      what: str(c.what),
      pricing: str(c.pricing),
      positioning: str(c.positioning),
      traction: str(c.traction),
      ...(typeof c.funding === "string" && c.funding.trim() ? { funding: c.funding } : {}),
      evidence: arr(c.evidence).filter((e): e is string => typeof e === "string"),
    };
  });

  const gaps: Gap[] = arr(o.gaps).map((raw) => {
    const g = (raw ?? {}) as Record<string, unknown>;
    return {
      ...(typeof g.stat === "string" && g.stat.trim() ? { stat: g.stat } : {}),
      ...(typeof g.statLabel === "string" && g.statLabel.trim() ? { statLabel: g.statLabel } : {}),
      title: str(g.title, ""),
      why: str(g.why, ""),
      evidence: arr(g.evidence).filter((e): e is string => typeof e === "string"),
    };
  });

  const coverage: Coverage[] = arr(o.coverage).map((raw) => {
    const c = (raw ?? {}) as Record<string, unknown>;
    const confidence = (["high", "medium", "low", "thin"] as const).includes(c.confidence as Confidence)
      ? (c.confidence as Confidence)
      : "medium";
    return {
      source: str(c.source, ""),
      queries: num(c.queries),
      hits: num(c.hits),
      confidence,
      note: str(c.note, ""),
    };
  });

  return {
    verdict,
    recommendation,
    confidence: Math.max(0, Math.min(1, num(o.confidence, 0.5))),
    verdictWhy: str(o.verdictWhy, ""),
    competitors,
    gaps,
    coverage,
    stopCondition,
    thinFields: arr(o.thinFields).filter((t): t is string => typeof t === "string"),
    sources: arr(o.sources).filter((s): s is string => typeof s === "string"),
  };
}

// ---------------------------------------------------------------------------
// Terminal rendering — the CLI prints this; the web UI renders its own.
// ---------------------------------------------------------------------------

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

function heading(text: string): string {
  return `${BOLD}${text}${RESET}`;
}

/** Render a StructuredReport as plain, readable terminal text. */
export function renderReportForTerminal(r: StructuredReport): string {
  const lines: string[] = [];

  lines.push(heading("VERDICT"));
  lines.push(
    `${r.verdict}  ·  recommendation: ${r.recommendation}  ·  confidence ${r.confidence.toFixed(2)}`,
  );
  lines.push(r.verdictWhy);
  lines.push("");

  lines.push(heading(`COMPETITORS (${r.competitors.length})`));
  for (const c of r.competitors) {
    const flags = [c.overlap, c.obscure ? "obscure" : null].filter(Boolean).join(", ");
    lines.push(`- ${BOLD}${c.name}${RESET} — ${CYAN}${c.url}${RESET}  ${DIM}[${flags}]${RESET}`);
    lines.push(`  what: ${c.what}`);
    lines.push(`  pricing: ${c.pricing}   positioning: ${c.positioning}`);
    lines.push(`  traction: ${c.traction}`);
    if (c.funding) lines.push(`  funding: ${c.funding}`);
    if (c.evidence.length) lines.push(`  evidence: ${c.evidence.map((e) => CYAN + e + RESET).join("  ")}`);
  }
  lines.push("");

  lines.push(heading("GAPS & OPENING"));
  for (const g of r.gaps) {
    const stat = g.stat ? `${g.stat}${g.statLabel ? " " + g.statLabel : ""} — ` : "";
    lines.push(`- ${stat}${BOLD}${g.title}${RESET}`);
    lines.push(`  ${g.why}`);
    if (g.evidence.length) lines.push(`  ${DIM}${g.evidence.join("  ")}${RESET}`);
  }
  lines.push("");

  lines.push(heading("META"));
  for (const c of r.coverage) {
    lines.push(`- ${c.source}: ${c.queries} queries, ~${c.hits} hits, ${c.confidence} — ${c.note}`);
  }
  if (r.thinFields.length) lines.push(`- thin fields: ${r.thinFields.join(", ")}`);
  lines.push(`- stopped by: ${r.stopCondition}`);
  lines.push("");

  lines.push(heading("SOURCES"));
  for (const s of r.sources) lines.push(`${CYAN}${s}${RESET}`);

  return lines.join("\n");
}
