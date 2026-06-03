import axios from "axios";
import { scoreTrend } from "../../scoring.js";
import { createSignal, FetchOptions, SourceAdapter } from "./types.js";

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

class GitHubWatcher implements SourceAdapter {
  readonly sourceName = "github";

  async fetch(topic: string, options: FetchOptions = {}): Promise<any[]> {
    const sinceDays = options.sinceDays ?? 14;
    const limit = options.limit ?? 30;
    const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString().slice(0, 10);

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

    return response.data.items.map((repo) => {
      // Use the same scoring logic as the existing codebase
      const trendItem = scoreTrend({
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
      });

      return createSignal({
        url: trendItem.url,
        source: this.sourceName,
        title: trendItem.title,
        summary: trendItem.summary,
        category: trendItem.category,
        score: trendItem.score,
        tags: trendItem.tags,
        metadata: trendItem.metadata,
        publishedAt: trendItem.publishedAt
      });
    });
  }
}

export const githubWatcher = new GitHubWatcher();