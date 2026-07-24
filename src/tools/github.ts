/**
 * search_github — GitHub repository search via the REST API. Catches
 * open-source competitors the launch/discussion sources miss, and gives a
 * hard traction number (stars) for free. Keyless works (60 search req/hr,
 * ~10/min); an optional GITHUB_TOKEN raises the limit. Verified in SOURCES.md.
 */
import type { SourceTool } from "./types.js";
import { withRetry } from "../util.js";
import { GITHUB_MAX_RESULTS } from "../config.js";

const GITHUB_API = "https://api.github.com";

interface GitHubRepo {
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  pushed_at: string | null;
  language: string | null;
}

export function githubSearchTool(token?: string): SourceTool {
  return {
    discovery: true,
    definition: {
      name: "search_github",
      description:
        "Search GitHub repositories, ranked by stars. Best for finding " +
        "open-source products and tools that compete with the idea — the " +
        "star count is a concrete traction signal. Use short keyword queries " +
        "(2-6 words).",
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Short keyword query" },
        },
        required: ["query"],
      },
    },

    async run(input, emit) {
      const { query } = input as { query: string };
      const params = new URLSearchParams({
        q: query,
        sort: "stars",
        order: "desc",
        per_page: String(GITHUB_MAX_RESULTS),
      });

      const response = await withRetry(`github search "${query}"`, emit, async () => {
        const headers: Record<string, string> = {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        };
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetch(`${GITHUB_API}/search/repositories?${params}`, { headers });
        if (!res.ok) {
          throw new Error(`GitHub returned ${res.status}: ${await res.text()}`);
        }
        return res.json() as Promise<{ items: GitHubRepo[] }>;
      });

      const repos = response.items ?? [];
      emit({ type: "tool_results", tool: "search_github", query, count: repos.length });

      if (repos.length === 0) {
        return "No GitHub results for this query. Try different keywords.";
      }

      return repos
        .map((repo, i) => {
          const lines = [`[${i + 1}] ${repo.full_name}`];
          lines.push(`URL: ${repo.html_url}`);
          if (repo.description) lines.push(repo.description);
          const traction = [`stars: ${repo.stargazers_count}`];
          if (repo.pushed_at) traction.push(`last push: ${repo.pushed_at.slice(0, 10)}`);
          if (repo.language) traction.push(`language: ${repo.language}`);
          lines.push(`(${traction.join(", ")})`);
          return lines.join("\n");
        })
        .join("\n\n");
    },
  };
}
