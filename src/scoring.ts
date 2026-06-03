import { TrendItem } from "./types.js";

const highSignalTerms = [
  "ai",
  "agent",
  "agents",
  "mcp",
  "llm",
  "model",
  "open source",
  "developer",
  "api",
  "sdk",
  "framework",
  "automation",
  "research",
  "security",
  "cloud",
  "gpu",
  "robotics",
  "data",
  "inference",
  "reasoning",
  "benchmark",
  "multimodal",
  "dataset",
  "fine-tune",
  "fine tuning",
  "rag",
  "vector",
  "eval",
  "evaluation",
  "edge",
  "local",
  "startup",
  "hackathon",
  "grant",
  "beta",
  "preview",
  "launch",
  "release"
];

const opportunityTerms = [
  "opportunity",
  "apply",
  "applications",
  "grant",
  "funding",
  "startup program",
  "accelerator",
  "hackathon",
  "challenge",
  "fellowship",
  "internship",
  "beta",
  "early access",
  "call for"
];

export function scoreTrend(item: Omit<TrendItem, "score" | "tags"> & Partial<Pick<TrendItem, "score" | "tags">>): TrendItem {
  const text = `${item.title} ${item.summary ?? ""}`.toLowerCase();
  const tags = highSignalTerms.filter((term) => text.includes(term));
  const opportunityMatches = opportunityTerms.filter((term) => text.includes(term));

  let score = item.score ?? 0;
  score += tags.length * 8;
  score += opportunityMatches.length * 12;

  if (item.category === "github") {
    score += Number(item.metadata?.stars ?? 0) > 1000 ? 20 : 0;
    score += Number(item.metadata?.stars ?? 0) > 10000 ? 20 : 0;
  }

  if (item.category === "model") {
    score += Number(item.metadata?.likes ?? 0) > 500 ? 15 : 0;
    score += Number(item.metadata?.downloads ?? 0) > 100000 ? 15 : 0;
  }

  if (item.category === "research") {
    score += 8;
  }

  if (item.publishedAt) {
    const ageMs = Date.now() - new Date(item.publishedAt).getTime();
    const ageDays = ageMs / 86_400_000;
    if (ageDays <= 1) score += 25;
    else if (ageDays <= 7) score += 15;
    else if (ageDays <= 30) score += 6;
  }

  if (["OpenAI", "Google AI", "Microsoft", "NVIDIA", "Anthropic", "Meta AI", "AWS", "Hugging Face Blog", "Hugging Face Models", "arXiv"].includes(item.source)) {
    score += 12;
  }

  return {
    ...item,
    score,
    tags: Array.from(new Set([...(item.tags ?? []), ...tags, ...opportunityMatches]))
  };
}

export function rankTrends(items: TrendItem[], limit = 10): TrendItem[] {
  const seen = new Set<string>();
  return items
    .filter((item) => {
      const key = item.url || item.title;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function matchesQuery(item: TrendItem, query?: string): boolean {
  if (!query) return true;
  const normalized = query.toLowerCase();
  return `${item.title} ${item.summary ?? ""} ${item.source} ${item.tags.join(" ")}`
    .toLowerCase()
    .includes(normalized);
}
