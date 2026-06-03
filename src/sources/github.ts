import axios from "axios";
import { scoreTrend } from "../scoring.js";
import { TrendItem, TrendQuery } from "../types.js";

type GitHubRepo = {
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
  updated_at: string;
  pushed_at: string;
  topics?: string[];
};

type GitHubSearchResponse = {
  items: GitHubRepo[];
};

export async function fetchGitHubTrends(query: TrendQuery = {}): Promise<TrendItem[]> {
  const sinceDays = query.sinceDays ?? 14;
  const limit = query.limit ?? 10;
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString().slice(0, 10);
  const topic = query.query?.trim() || "ai agent OR llm OR mcp OR developer-tools";

  const response = await axios.get<GitHubSearchResponse>("https://api.github.com/search/repositories", {
    headers: {
      Accept: "application/vnd.github+json",
      ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {})
    },
    params: {
      q: `${topic} pushed:>=${since}`,
      sort: "stars",
      order: "desc",
      per_page: Math.min(limit, 30)
    },
    timeout: 15_000
  });

  return response.data.items.map((repo) =>
    scoreTrend({
      title: repo.full_name,
      url: repo.html_url,
      source: "GitHub",
      category: "github",
      publishedAt: repo.pushed_at || repo.updated_at,
      summary: repo.description ?? undefined,
      metadata: {
        stars: repo.stargazers_count,
        language: repo.language ?? undefined
      },
      tags: repo.topics ?? []
    })
  );
}

