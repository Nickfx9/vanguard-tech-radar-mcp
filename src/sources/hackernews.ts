import axios from "axios";
import { scoreTrend } from "../scoring.js";
import { TrendItem, TrendQuery } from "../types.js";

type AlgoliaHit = {
  title?: string;
  story_title?: string;
  url?: string;
  story_url?: string;
  points?: number;
  num_comments?: number;
  created_at?: string;
  objectID: string;
};

type AlgoliaResponse = {
  hits: AlgoliaHit[];
};

export async function fetchHackerNewsTrends(query: TrendQuery = {}): Promise<TrendItem[]> {
  const searchQuery = query.query?.trim() || "AI OR agent OR open source OR developer tools OR startup";
  const sinceDays = query.sinceDays ?? 7;
  const since = Math.floor((Date.now() - sinceDays * 86_400_000) / 1000);

  const response = await axios.get<AlgoliaResponse>("https://hn.algolia.com/api/v1/search_by_date", {
    params: {
      query: searchQuery,
      tags: "story",
      numericFilters: `created_at_i>${since}`,
      hitsPerPage: Math.min(query.limit ?? 10, 30)
    },
    timeout: 15_000
  });

  return response.data.hits
    .filter((hit) => hit.title || hit.story_title)
    .map((hit) =>
      scoreTrend({
        title: hit.title ?? hit.story_title ?? "Untitled Hacker News story",
        url: hit.url ?? hit.story_url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`,
        source: "Hacker News",
        category: "discussion",
        publishedAt: hit.created_at,
        summary: `${hit.points ?? 0} points, ${hit.num_comments ?? 0} comments`,
        metadata: {
          points: hit.points ?? 0,
          comments: hit.num_comments ?? 0
        },
        tags: []
      })
    );
}

