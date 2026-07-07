import { TrendItem, TrendQuery } from "../types.js";
import { FeedSource, fetchFeeds } from "./rss.js";

const opportunityFeeds: FeedSource[] = [
  { name: "Devpost Hackathons", url: "https://devpost.com/hackathons.atom", category: "developer-opportunity", baseScore: 12 },
  { name: "Google Developers Blog", url: "https://developers.googleblog.com/feeds/posts/default", category: "developer-opportunity", baseScore: 8 },
  { name: "Microsoft Developer Blogs", url: "https://devblogs.microsoft.com/feed/", category: "developer-opportunity", baseScore: 8 },
  { name: "NVIDIA Developer Blog", url: "https://developer.nvidia.com/blog/feed/", category: "developer-opportunity", baseScore: 9 },
  { name: "AWS Open Source Blog", url: "https://aws.amazon.com/blogs/opensource/feed/", category: "developer-opportunity", baseScore: 7 },
  { name: "YC Blog", url: "https://www.ycombinator.com/blog/rss", category: "developer-opportunity", baseScore: 8 },
  { name: "Product Hunt", url: "https://www.producthunt.com/feed", category: "tooling", baseScore: 7 }
];

const opportunityWords = [
  "apply",
  "application",
  "deadline",
  "grant",
  "funding",
  "startup",
  "accelerator",
  "hackathon",
  "challenge",
  "contest",
  "beta",
  "preview",
  "early access",
  "program",
  "fellowship",
  "students",
  "developers"
];

export async function fetchDeveloperOpportunities(query: TrendQuery = {}): Promise<TrendItem[]> {
  const items = await fetchFeeds(opportunityFeeds, 10);
  const topicTerms = query.query
    ?.toLowerCase()
    .split(/\s+|\s+or\s+|,|;/i)
    .map((term) => term.trim())
    .filter((term) => term.length > 2 && !opportunityWords.includes(term));

  const filtered = items
    .filter((item) => {
      const text = `${item.title} ${item.summary ?? ""} ${item.source}`.toLowerCase();
      const matchesTopic = !topicTerms?.length || topicTerms.some((term) => text.includes(term) || item.tags.some((tag) => tag.toLowerCase().includes(term)));
      const matchesOpportunity = opportunityWords.some((word) => text.includes(word)) || item.category === "developer-opportunity";
      return matchesTopic && matchesOpportunity;
    })
    .slice(0, query.limit ?? 20);

  return filtered.length ? filtered : items.slice(0, query.limit ?? 20);
}
