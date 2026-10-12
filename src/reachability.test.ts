import { test } from "node:test";
import assert from "node:assert/strict";
import { applyReachability, probeDomain } from "./reachability.js";
import { deadNote, type Competitor } from "./report.js";

function comp(name: string, url: string, alive: Competitor["alive"] = "active"): Competitor {
  return {
    name, url, overlap: "direct", obscure: false, what: "unknown", pricing: "unknown",
    positioning: "unknown", traction: "unknown", alive, sourceCount: 1, evidence: [],
  };
}

const netError = (code: string) => Object.assign(new TypeError("fetch failed"), { cause: { code } });

/** A fake fetch: per-host behavior, keyed by hostname. */
function fakeFetch(byHost: Record<string, Error | { finalUrl?: string; body?: string; status?: number }>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    const spec = byHost[new URL(url).hostname];
    if (spec instanceof Error) throw spec;
    const res = new Response(spec?.body ?? "<html>ok</html>", { status: spec?.status ?? 200 });
    Object.defineProperty(res, "url", { value: spec?.finalUrl ?? url });
    return res;
  }) as typeof fetch;
}

test("probe: DNS failure and refused connection are dead", async () => {
  const f = fakeFetch({ "a.com": netError("ENOTFOUND"), "b.com": netError("ECONNREFUSED") });
  assert.equal(await probeDomain("https://a.com", f), "dead");
  assert.equal(await probeDomain("https://b.com", f), "dead");
});

test("probe: any HTTP answer is up, even 403 and 503", async () => {
  const f = fakeFetch({ "a.com": { status: 403 }, "b.com": { status: 503 } });
  assert.equal(await probeDomain("https://a.com", f), "up");
  assert.equal(await probeDomain("https://b.com", f), "up");
});

test("probe: timeouts and other errors are unknown", async () => {
  const f = fakeFetch({ "a.com": new DOMException("timed out", "TimeoutError"), "b.com": netError("EAI_AGAIN") });
  assert.equal(await probeDomain("https://a.com", f), "unknown");
  assert.equal(await probeDomain("https://b.com", f), "unknown");
});

test("probe: parking redirect or for-sale page is dead", async () => {
  const f = fakeFetch({
    "a.com": { finalUrl: "https://www.hugedomains.com/domain_profile.cfm?d=a.com" },
    "b.com": { body: "<h1>This domain is for sale!</h1>" },
  });
  assert.equal(await probeDomain("https://a.com", f), "dead");
  assert.equal(await probeDomain("https://b.com", f), "dead");
});

test("apply: marks unreachable own domains dead, skips shared hosts", async () => {
  let githubProbed = false;
  const base = fakeFetch({ "gone.com": netError("ENOTFOUND") });
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input).includes("github.com")) githubProbed = true;
    return base(input, init);
  }) as typeof fetch;
  const out = await applyReachability(
    [comp("Gone", "https://gone.com"), comp("Up", "https://up.com"), comp("Repo", "https://github.com/x/y")],
    f,
  );
  assert.deepEqual(out.map((c) => c.alive), ["dead", "active", "active"]);
  assert.equal(githubProbed, false);
});

test("apply: if every probe fails, assumes our network and changes nothing", async () => {
  const f = fakeFetch({ "a.com": netError("ENOTFOUND"), "b.com": netError("ENOTFOUND"), "c.com": netError("ENOTFOUND") });
  const input = [comp("A", "https://a.com"), comp("B", "https://b.com"), comp("C", "https://c.com")];
  const out = await applyReachability(input, f);
  assert.deepEqual(out.map((c) => c.alive), ["active", "active", "active"]);
});

test("deadNote: says so plainly when a quarter or more is dead", () => {
  const comps = [comp("A", "", "dead"), comp("B", "", "dead"), comp("C", "", "active"), comp("D", "", "unknown")];
  assert.equal(deadNote("crowded", comps), "Crowded on paper (4 players), but 2 look abandoned; 1 is actively maintained.");
  assert.equal(deadNote("open lane", comps), undefined);
  assert.equal(deadNote("crowded", [comp("A", "", "dead"), ...Array(4).fill(comp("B", ""))]), undefined);
});
