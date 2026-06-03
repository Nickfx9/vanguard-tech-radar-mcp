import axios from "axios";
import { scoreTrend } from "../scoring.js";
import { TrendCategory, TrendItem } from "../types.js";

export type FeedSource = {
  name: string;
  url: string;
  category: TrendCategory;
  baseScore?: number;
};

function decodeEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function extractTag(block: string, tag: string): string | undefined {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match?.[1] ? decodeEntities(match[1]) : undefined;
}

function extractLink(block: string): string {
  const linkMatch = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*>|<link[^>]*>([\s\S]*?)<\/link>/i);
  return decodeEntities((linkMatch?.[1] ?? linkMatch?.[2] ?? "").trim());
}

export function parseFeed(xml: string, source: FeedSource, maxItems = 8): TrendItem[] {
  const blocks = [...xml.matchAll(/<item[\s\S]*?<\/item>|<entry[\s\S]*?<\/entry>/gi)].map((match) => match[0]);

  return blocks
    .slice(0, maxItems)
    .map((block) => {
      const title = extractTag(block, "title") ?? "Untitled signal";
      const url = extractLink(block);
      const publishedAt = extractTag(block, "pubDate") ?? extractTag(block, "published") ?? extractTag(block, "updated");
      const summary = extractTag(block, "description") ?? extractTag(block, "summary") ?? extractTag(block, "content");

      return scoreTrend({
        title,
        url,
        source: source.name,
        category: source.category,
        publishedAt: publishedAt ? new Date(publishedAt).toISOString() : undefined,
        summary,
        score: source.baseScore ?? 0,
        tags: []
      });
    })
    .filter((item) => item.url);
}

export async function fetchFeeds(sources: FeedSource[], maxItemsPerFeed = 8): Promise<TrendItem[]> {
  const settled = await Promise.allSettled(
    sources.map(async (source) => {
      const response = await axios.get<string>(source.url, { timeout: 15_000, responseType: "text" });
      return parseFeed(response.data, source, maxItemsPerFeed);
    })
  );

  return settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
}

