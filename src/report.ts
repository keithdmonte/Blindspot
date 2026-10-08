/**
 * The structured report the agent produces. Instead of writing prose, the
 * model ends a run by calling the `submit_report` tool with this shape — so
 * the CLI and the web UI both render from data, not from parsed text.
 *
 * Every field still obeys the grounding rule (see prompts.ts): a value the
 * model did not see in a tool result is "unknown", never invented.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { mergeCompetitors, normalizeLiveness } from "./dedup.js";

export type Verdict = "taken" | "crowded" | "open lane";
export type Recommendation = "go" | "caution" | "no-go";
export type Overlap = "direct" | "partial" | "adjacent";
export type Confidence = "high" | "medium" | "low" | "thin";
export type StopCondition = "saturation" | "candidate_cap" | "budget_exhausted";
export type Liveness = "active" | "stale" | "dead" | "unknown";

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
  /** Freshest dated signal seen (ISO YYYY / YYYY-MM / YYYY-MM-DD), else omitted. */
  lastActive?: string;
  /** Is it still maintained? Derived from lastActive age, or a dead domain. */
  alive: Liveness;
  /** How many distinct sources surfaced this product this run (corroboration). */
  sourceCount: number;
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
            lastActive: {
              type: "string",
              description: "Freshest dated signal you saw for it, as ISO YYYY, YYYY-MM, or YYYY-MM-DD (GitHub last push, PH/HN launch date). Omit if no date was seen.",
            },
            alive: {
              type: "string",
              enum: ["active", "stale", "dead", "unknown"],
              description: "active = last signal within 6 months; stale = 6-18 months; dead = older than 18 months or the domain is unreachable; unknown = no date seen.",
            },
            sourceCount: {
              type: "number",
              description: "How many distinct sources (HN, PH, GitHub, Reddit, etc.) surfaced this same product this run. 1 if only one.",
            },
            evidence: { type: "array", items: { type: "string" }, description: "URL(s) where you saw this." },
          },
          required: ["name", "url", "overlap", "obscure", "what", "pricing", "positioning", "traction", "alive", "sourceCount", "evidence"],
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
      ...(typeof c.lastActive === "string" && c.lastActive.trim() ? { lastActive: c.lastActive.trim() } : {}),
      alive: normalizeLiveness(c.alive, c.lastActive),
      sourceCount: Math.max(1, Math.round(num(c.sourceCount, 1))),
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

  let verdictWhy = str(o.verdictWhy, "");
  let salvagedComps = competitors;
  let salvagedGaps = gaps;
  let salvagedCov = coverage;
  let sources = arr(o.sources).filter((s): s is string => typeof s === "string");

  // Salvage: the model sometimes fills the scalar fields as JSON but then
  // writes the rest of the report as XML tags inside verdictWhy, leaving the
  // real arrays empty. Recover the structured data from that text.
  if (competitors.length === 0 && /<competitor[\s>]/i.test(verdictWhy)) {
    const s = salvageFromXml(verdictWhy);
    if (s.competitors.length) salvagedComps = s.competitors;
    if (s.gaps.length) salvagedGaps = s.gaps;
    if (s.coverage.length) salvagedCov = s.coverage;
    if (s.sources.length) sources = s.sources;
    verdictWhy = s.verdictWhy || verdictWhy;
  }

  return {
    verdict,
    recommendation,
    confidence: Math.max(0, Math.min(1, num(o.confidence, 0.5))),
    verdictWhy,
    competitors: mergeCompetitors(salvagedComps),
    gaps: salvagedGaps,
    coverage: salvagedCov,
    stopCondition,
    thinFields: arr(o.thinFields).filter((t): t is string => typeof t === "string"),
    // Not asked of the model (it already cites URLs per competitor and gap,
    // and repeating them cost output time): derive the list from that evidence.
    sources: sources.length
      ? sources
      : [...new Set([...salvagedComps, ...salvagedGaps].flatMap((x) => x.evidence))],
  };
}

/**
 * Recover structured report data from a text blob where the model emitted the
 * competitors / gaps / coverage as XML tags instead of JSON array fields.
 * Tolerant on purpose: malformed tags (e.g. <stat">) and either a JSON-array
 * or bare-URL <evidence> are both handled.
 */
export function salvageFromXml(text: string): {
  verdictWhy: string;
  competitors: Competitor[];
  gaps: Gap[];
  coverage: Coverage[];
  sources: string[];
} {
  const tag = (block: string, name: string): string => {
    const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i").exec(block);
    return m ? m[1].trim() : "";
  };
  const urls = (s: string): string[] => (s.match(/https?:\/\/[^\s"'<>)\]]+/g) ?? []);
  const evidence = (block: string): string[] => {
    const raw = tag(block, "evidence");
    if (!raw) return [];
    try {
      const a = JSON.parse(raw);
      if (Array.isArray(a)) return a.filter((x): x is string => typeof x === "string");
    } catch {
      /* fall through to url scrape */
    }
    return urls(raw);
  };
  const blocks = (name: string): string[] =>
    (text.match(new RegExp(`<${name}>[\\s\\S]*?</${name}>`, "gi")) ?? []);
  const intOf = (s: string): number => Number((s.match(/-?\d+/) ?? ["0"])[0]) || 0;

  // verdictWhy = the prose before the structured section begins.
  const cut = text.search(/<\/verdictWhy>|<competitors?>|<competitor[\s>]/i);
  const verdictWhy = (cut >= 0 ? text.slice(0, cut) : text).trim();

  const competitors: Competitor[] = blocks("competitor").map((b) => {
    const overlapRaw = tag(b, "overlap").toLowerCase();
    const overlap: Overlap = overlapRaw === "direct" || overlapRaw === "adjacent"
      ? (overlapRaw as Overlap)
      : "partial";
    const funding = tag(b, "funding");
    return {
      name: tag(b, "name") || "unnamed",
      url: tag(b, "url") || "unknown",
      overlap,
      obscure: /true/i.test(tag(b, "obscure")),
      what: tag(b, "what") || "unknown",
      pricing: tag(b, "pricing") || "unknown",
      positioning: tag(b, "positioning") || "unknown",
      traction: tag(b, "traction") || "unknown",
      ...(funding ? { funding } : {}),
      ...(tag(b, "lastActive") ? { lastActive: tag(b, "lastActive") } : {}),
      alive: normalizeLiveness(tag(b, "alive"), tag(b, "lastActive")),
      sourceCount: Math.max(1, Math.round(Number(tag(b, "sourceCount")) || 1)),
      evidence: evidence(b),
    };
  });

  const gaps: Gap[] = blocks("gap").map((b) => {
    const stat = tag(b, "stat");
    const statLabel = tag(b, "statLabel");
    return {
      ...(stat ? { stat } : {}),
      ...(statLabel ? { statLabel } : {}),
      title: tag(b, "title"),
      why: tag(b, "why"),
      evidence: evidence(b),
    };
  });

  // Coverage rows are usually <item>…</item> inside <coverage>.
  const covSection = tag(text, "coverage") || text;
  const coverage: Coverage[] = (covSection.match(/<item>[\s\S]*?<\/item>/gi) ?? []).map((b) => {
    const confRaw = tag(b, "confidence").toLowerCase();
    const confidence: Confidence =
      confRaw === "high" || confRaw === "low" || confRaw === "thin" ? (confRaw as Confidence) : "medium";
    return {
      source: tag(b, "source"),
      queries: intOf(tag(b, "queries")),
      hits: intOf(tag(b, "hits")),
      confidence,
      note: tag(b, "note"),
    };
  });

  // Sources: prefer an explicit <sources> block, else union of all evidence URLs.
  const srcSection = tag(text, "sources");
  const sources = srcSection
    ? [...new Set(urls(srcSection))]
    : [...new Set([...competitors, ...gaps].flatMap((x) => x.evidence))];

  return { verdictWhy, competitors, gaps, coverage, sources };
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
