import { TrendItem, TrendQuery } from "../types.js";
import { fetchFeeds } from "./rss.js";

export async function fetchProductHuntTrends(query: TrendQuery = {}): Promise<TrendItem[]> {
  const items = await fetchFeeds(
    [{ name: "Product Hunt", url: "https://www.producthunt.com/feed", category: "tooling", baseScore: 7 }],
    Math.min(query.limit ?? 10, 20)
  );

  if (!query.query) return items;
  const normalized = query.query.toLowerCase();
  return items.filter((item) => `${item.title} ${item.summary ?? ""}`.toLowerCase().includes(normalized));
}

