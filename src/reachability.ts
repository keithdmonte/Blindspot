/**
 * Domain reachability (Phase 6 liveness follow-up): after the report is
 * written, probe each competitor's own site. A domain that doesn't resolve,
 * refuses connections, or lands on a domain-parking page marks the product
 * dead. Anything that answers — even 403 or 5xx — counts as up: a bot wall is
 * not death. A timeout proves nothing, so it leaves the label alone.
 */
import type { Competitor } from "./report.js";
import { ownDomain } from "./dedup.js";
import { PROBE_TIMEOUT_MS } from "./config.js";

export type Probe = "up" | "dead" | "unknown";

const DEAD_CODES = new Set(["ENOTFOUND", "ECONNREFUSED"]);
const PARKING_HOSTS = /(^|\.)(sedo\.com|dan\.com|afternic\.com|hugedomains\.com|bodis\.com|parkingcrew\.net|godaddy\.com|undeveloped\.com)$/;
const PARKING_TEXT = /(this domain|the domain [\w.-]+) (is|may be) for sale|buy this domain/i;

export async function probeDomain(url: string, fetchFn: typeof fetch = fetch): Promise<Probe> {
  try {
    const res = await fetchFn(url, { redirect: "follow", signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    const finalHost = new URL(res.url || url).hostname;
    if (PARKING_HOSTS.test(finalHost)) return "dead";
    const head = (await res.text()).slice(0, 20_000);
    return PARKING_TEXT.test(head) ? "dead" : "up";
  } catch (err) {
    const code = (err as { cause?: { code?: string } })?.cause?.code;
    return code && DEAD_CODES.has(code) ? "dead" : "unknown";
  }
}

/**
 * Mark competitors whose own domain is unreachable or parked as dead. Only
 * ever downgrades to dead; a reachable site can still be dead by date. If
 * every probe comes back dead, our own network is the likelier culprit, so
 * nothing changes.
 */
export async function applyReachability(
  competitors: Competitor[],
  fetchFn: typeof fetch = fetch,
): Promise<Competitor[]> {
  const targets = competitors.filter((c) => c.alive !== "dead" && ownDomain(c.url));
  const results = await Promise.all(targets.map((c) => probeDomain(c.url, fetchFn)));
  const dead = new Set(targets.filter((_, i) => results[i] === "dead"));
  if (targets.length >= 3 && dead.size === targets.length) return competitors;
  return competitors.map((c) => (dead.has(c) ? { ...c, alive: "dead" } : c));
}
