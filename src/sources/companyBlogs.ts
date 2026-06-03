import { TrendItem, TrendQuery } from "../types.js";
import { FeedSource, fetchFeeds } from "./rss.js";

const feeds: FeedSource[] = [
  { name: "OpenAI", url: "https://openai.com/news/rss.xml", category: "company-announcement", baseScore: 10 },
  { name: "Google AI", url: "https://blog.google/technology/ai/rss/", category: "company-announcement", baseScore: 10 },
  { name: "Microsoft", url: "https://blogs.microsoft.com/ai/feed/", category: "company-announcement", baseScore: 10 },
  { name: "NVIDIA", url: "https://developer.nvidia.com/blog/feed/", category: "company-announcement", baseScore: 12 },
  { name: "AWS", url: "https://aws.amazon.com/blogs/machine-learning/feed/", category: "company-announcement", baseScore: 8 },
  { name: "Meta AI", url: "https://ai.meta.com/blog/rss/", category: "company-announcement", baseScore: 10 },
  { name: "Anthropic", url: "https://www.anthropic.com/news/rss.xml", category: "company-announcement", baseScore: 10 },
  { name: "Hugging Face Blog", url: "https://huggingface.co/blog/feed.xml", category: "company-announcement", baseScore: 9 },
  { name: "GitHub Blog", url: "https://github.blog/feed/", category: "company-announcement", baseScore: 7 },
  { name: "Cloudflare Blog", url: "https://blog.cloudflare.com/rss/", category: "company-announcement", baseScore: 6 },
  { name: "Vercel Blog", url: "https://vercel.com/blog/rss.xml", category: "company-announcement", baseScore: 6 }
];

export async function fetchCompanyAnnouncements(query: TrendQuery = {}): Promise<TrendItem[]> {
  const selectedFeeds = feeds.filter((feed) => !query.query || feed.name.toLowerCase().includes(query.query.toLowerCase()));
  const targets = selectedFeeds.length ? selectedFeeds : feeds;
  return (await fetchFeeds(targets, 8)).slice(0, query.limit ?? 20);
}
