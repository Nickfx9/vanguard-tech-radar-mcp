import axios from "axios";
import { parseFeed } from "./rss.js";
import { TrendItem, TrendQuery } from "../types.js";

function encodeArxivQuery(query?: string): string {
  const base = query?.trim() || "AI agents OR large language models OR machine learning";
  return base
    .split(/\s+OR\s+/i)
    .map((part) => `all:${part.trim().replace(/\s+/g, "+")}`)
    .join("+OR+");
}

export async function fetchArxivResearch(query: TrendQuery = {}): Promise<TrendItem[]> {
  const searchQuery = encodeArxivQuery(query.query);
  const response = await axios.get<string>("https://export.arxiv.org/api/query", {
    params: {
      search_query: searchQuery,
      sortBy: "submittedDate",
      sortOrder: "descending",
      start: 0,
      max_results: Math.min(query.limit ?? 10, 20)
    },
    timeout: 15_000,
    responseType: "text"
  });

  return parseFeed(response.data, { name: "arXiv", url: "https://arxiv.org", category: "research", baseScore: 8 }, query.limit ?? 10);
}

