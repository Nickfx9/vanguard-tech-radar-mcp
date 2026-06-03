import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";
import { markAndFilterNew } from "./cache.js";
import { formatDailyBriefing, formatTrendItems } from "./formatting.js";
import { analyzeImpact } from "./impact.js";
import { matchesQuery, rankTrends } from "./scoring.js";
import { fetchArxivResearch } from "./sources/arxiv.js";
import { fetchCompanyAnnouncements } from "./sources/companyBlogs.js";
import { fetchGitHubTrends } from "./sources/github.js";
import { fetchHackerNewsTrends } from "./sources/hackernews.js";
import { fetchHuggingFaceModels } from "./sources/huggingface.js";
import { fetchDeveloperOpportunities } from "./sources/opportunities.js";
import { fetchProductHuntTrends } from "./sources/producthunt.js";
import { BriefingSections, TrendItem, TrendQuery } from "./types.js";

const inputSchema = {
  query: z.string().optional().describe("Optional topic or company filter, for example 'agent', 'MCP', 'OpenAI', or 'hackathon'."),
  limit: z.number().int().min(1).max(30).default(10).describe("Maximum number of results to return."),
  sinceDays: z.number().int().min(1).max(90).default(14).describe("How far back to search, in days.")
};

const impactInputSchema = {
  topic: z.string().describe("The trend, repository, announcement, or technology to analyze."),
  context: z.string().optional().describe("Optional extra context such as a URL, summary, repo description, or your goal."),
  audience: z.string().optional().describe("Optional audience, for example founder, developer, researcher, student, or investor.")
};

async function collectAll(query: TrendQuery): Promise<TrendItem[]> {
  const settled = await Promise.allSettled([
    fetchGitHubTrends(query),
    fetchHackerNewsTrends(query),
    fetchCompanyAnnouncements(query),
    fetchHuggingFaceModels(query),
    fetchArxivResearch(query),
    fetchProductHuntTrends(query),
    fetchDeveloperOpportunities(query)
  ]);

  return settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
}

async function collectBriefing(query: TrendQuery): Promise<BriefingSections> {
  const limit = query.limit ?? 5;
  const [trends, repos, announcements, models, research, opportunities] = await Promise.all([
    collectAll({ ...query, limit: limit * 2 }),
    fetchGitHubTrends({ ...query, limit }),
    fetchCompanyAnnouncements({ ...query, limit }),
    fetchHuggingFaceModels({ ...query, limit }),
    fetchArxivResearch({ ...query, limit }),
    fetchDeveloperOpportunities({ ...query, limit })
  ]);

  return {
    trends: rankTrends(trends.filter((item) => matchesQuery(item, query.query)), limit),
    repos: rankTrends(repos, limit),
    announcements: rankTrends(announcements, limit),
    modelsAndResearch: rankTrends([...models, ...research], limit),
    opportunities: rankTrends(opportunities, limit)
  };
}

const server = new McpServer({
  name: "vanguard-tech-radar",
  version: "0.1.0"
});

server.registerTool(
  "latest_tech_trends",
  {
    description: "Get ranked, fresh technology trends from GitHub, Hacker News, and major company engineering/AI blogs.",
    inputSchema
  },
  async ({ query, limit, sinceDays }) => {
    const items = rankTrends((await collectAll({ query, limit, sinceDays })).filter((item) => matchesQuery(item, query)), limit);
    return { content: [{ type: "text", text: formatTrendItems(items, { actionable: true }) }] };
  }
);

server.registerTool(
  "github_trending_repos",
  {
    description: "Find high-signal GitHub repositories related to AI, agents, MCP, developer tools, and emerging tech.",
    inputSchema
  },
  async ({ query, limit, sinceDays }) => {
    const items = rankTrends(await fetchGitHubTrends({ query, limit, sinceDays }), limit);
    return { content: [{ type: "text", text: formatTrendItems(items, { actionable: true }) }] };
  }
);

server.registerTool(
  "company_announcements",
  {
    description: "Fetch recent announcements from major technology company blogs and developer feeds.",
    inputSchema
  },
  async ({ query, limit, sinceDays }) => {
    const cutoff = Date.now() - sinceDays * 86_400_000;
    const items = rankTrends(
      (await fetchCompanyAnnouncements({ query, limit, sinceDays })).filter((item) => !item.publishedAt || new Date(item.publishedAt).getTime() >= cutoff),
      limit
    );
    return { content: [{ type: "text", text: formatTrendItems(items, { actionable: true }) }] };
  }
);

server.registerTool(
  "developer_opportunities",
  {
    description: "Surface opportunities such as hackathons, grants, accelerator programs, beta access, previews, and developer challenges.",
    inputSchema
  },
  async ({ query, limit, sinceDays }) => {
    const opportunityQuery = query || "hackathon grant beta early access accelerator challenge apply";
    const items = rankTrends(await fetchDeveloperOpportunities({ query: opportunityQuery, limit, sinceDays }), limit);
    return { content: [{ type: "text", text: formatTrendItems(items, { actionable: true }) }] };
  }
);

server.registerTool(
  "watch_new_tech_signals",
  {
    description: "Check current sources and return only items this server has not seen before. Uses a local cache file.",
    inputSchema
  },
  async ({ query, limit, sinceDays }) => {
    const items = rankTrends(await collectAll({ query, limit, sinceDays }), limit);
    const fresh = await markAndFilterNew(items);
    return { content: [{ type: "text", text: formatTrendItems(fresh.slice(0, limit), { actionable: true }) }] };
  }
);

server.registerTool(
  "analyze_tech_impact",
  {
    description: "Explain why a trend or repo matters, what opportunities it unlocks, and who should care.",
    inputSchema: impactInputSchema
  },
  async ({ topic, context, audience }) => {
    return { content: [{ type: "text", text: analyzeImpact(topic, context, audience) }] };
  }
);

server.registerTool(
  "models_and_research",
  {
    description: "Find relevant Hugging Face models and arXiv research papers, with practical impact notes.",
    inputSchema
  },
  async ({ query, limit, sinceDays }) => {
    const items = rankTrends(
      [...(await fetchHuggingFaceModels({ query, limit, sinceDays })), ...(await fetchArxivResearch({ query, limit, sinceDays }))],
      limit
    );
    return { content: [{ type: "text", text: formatTrendItems(items, { actionable: true }) }] };
  }
);

server.registerTool(
  "daily_tech_briefing",
  {
    description: "Create a daily radar briefing with top trends, repos, company announcements, models/research, opportunities, and recommended actions.",
    inputSchema
  },
  async ({ query, limit, sinceDays }) => {
    const sections = await collectBriefing({ query, limit: Math.min(limit ?? 5, 10), sinceDays });
    return { content: [{ type: "text", text: formatDailyBriefing(sections) }] };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Failed to start Vanguard Tech Radar MCP:", error);
  process.exit(1);
});
