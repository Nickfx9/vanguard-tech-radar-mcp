import "dotenv/config";
import express from "express";
import { IncomingMessage, ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import * as z from "zod/v4";
import { markAndFilterNew } from "./cache.js";
import { formatDailyBriefing, formatTrendItems } from "./formatting.js";
import { analyzeImpact } from "./impact.js";
import { matchesQuery, rankTrends } from "./scoring.js";
import { fetchArxivResearch } from "./sources/arxiv.js";
import { fetchCompanyAnnouncements } from "./sources/companyBlogs.js";
import { fetchGitHubTrends } from "./sources/github.js";
import { analyzeGitHubRepo, repoHealthCheck } from "./sources/githubRepo.js";
import { fetchHackerNewsTrends } from "./sources/hackernews.js";
import { fetchHuggingFaceModels } from "./sources/huggingface.js";
import { fetchDeveloperOpportunities } from "./sources/opportunities.js";
import { fetchProductHuntTrends } from "./sources/producthunt.js";
import { BriefingSections, TrendItem, TrendQuery } from "./types.js";
import {
  watchSignals,
  getNewSignals,
  getHistory,
  addWatchTopic,
  listWatchTopics,
  getWatcherStats
} from "./watcher/index.js";

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

const repoInputSchema = {
  repo_url: z.string().describe("GitHub repository URL or shorthand, for example https://github.com/modelcontextprotocol/typescript-sdk or owner/repo.")
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
  const [trends, repos, announcements, models, research, opportunities] = await Promise.allSettled([
    collectAll({ ...query, limit: limit * 2 }),
    fetchGitHubTrends({ ...query, limit }),
    fetchCompanyAnnouncements({ ...query, limit }),
    fetchHuggingFaceModels({ ...query, limit }),
    fetchArxivResearch({ ...query, limit }),
    fetchDeveloperOpportunities({ ...query, limit })
  ]);

  return {
    trends: rankTrends((trends.status === "fulfilled" ? trends.value : []).filter((item) => matchesQuery(item, query.query)), limit),
    repos: rankTrends(repos.status === "fulfilled" ? repos.value : [], limit),
    announcements: rankTrends(announcements.status === "fulfilled" ? announcements.value : [], limit),
    modelsAndResearch: rankTrends([
      ...(models.status === "fulfilled" ? models.value : []),
      ...(research.status === "fulfilled" ? research.value : [])
    ], limit),
    opportunities: rankTrends(opportunities.status === "fulfilled" ? opportunities.value : [], limit)
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
  "analyze_github_repo",
  {
    description: "Analyze a GitHub repository using repo metadata, README excerpt, detected stack files, topics, and stars. No LLM calls.",
    inputSchema: repoInputSchema
  },
  async ({ repo_url }) => {
    return { content: [{ type: "text", text: await analyzeGitHubRepo(repo_url) }] };
  }
);

server.registerTool(
  "repo_health_check",
  {
    description: "Check GitHub repository maintenance health using commits from the last 30 days, issue ratio, and latest release age.",
    inputSchema: repoInputSchema
  },
  async ({ repo_url }) => {
    return { content: [{ type: "text", text: await repoHealthCheck(repo_url) }] };
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
    const [models, research] = await Promise.allSettled([
      fetchHuggingFaceModels({ query, limit, sinceDays }),
      fetchArxivResearch({ query, limit, sinceDays })
    ]);
    const items = rankTrends([
      ...(models.status === "fulfilled" ? models.value : []),
      ...(research.status === "fulfilled" ? research.value : [])
    ], limit);
    const warnings = [
      models.status === "rejected" ? `Hugging Face unavailable/rate-limited: ${models.reason instanceof Error ? models.reason.message : String(models.reason)}` : "",
      research.status === "rejected" ? `arXiv unavailable: ${research.reason instanceof Error ? research.reason.message : String(research.reason)}` : ""
    ].filter(Boolean);
    const text = [warnings.length ? `Warnings:\n${warnings.map((warning) => `- ${warning}`).join("\n")}\n` : "", formatTrendItems(items, { actionable: true })]
      .filter(Boolean)
      .join("\n");
    return { content: [{ type: "text", text: text }] };
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

// ============================================
// Signal Watcher Tools (SQLite-backed)
// ============================================

server.registerTool(
  "watch_signals",
  {
    description: "Run the signal watcher to collect signals from all active sources (GitHub trending repos, etc.) and store them in the database. Returns a summary of what was found, including new vs previously seen signals."
  },
  async () => {
    try {
      const result = await watchSignals();
      const lines: string[] = [
        `**Signal Watch Complete** (${result.checkedAt})`,
        ``,
        `**Summary:**`,
        `• Sources checked: ${result.sourcesChecked}`,
        `• Total signals found: ${result.signalsFound}`,
        `• New signals: ${result.newSignals}`,
        `• Updated signals: ${result.updatedSignals}`,
        ``
      ];

      for (const detail of result.details) {
        lines.push(`**${detail.source}** (topic: "${detail.topic}")`);
        lines.push(`  Found: ${detail.signalsFound} | New: ${detail.newSignals} | Updated: ${detail.updatedSignals}`);
        if (detail.error) {
          lines.push(`  ⚠️ Error: ${detail.error}`);
        }
        lines.push(``);
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Error running signal watcher: ${error instanceof Error ? error.message : String(error)}` }] };
    }
  }
);

server.registerTool(
  "new_since_last_check",
  {
    description: "Return signals that are new since the last watch_signals run. Shows only signals that were first seen after the most recent previous check."
  },
  async () => {
    try {
      const { signals, since } = await getNewSignals();

      if (signals.length === 0) {
        return {
          content: [{
            type: "text",
            text: since
              ? `No new signals since ${since}. All current signals have been seen before.`
              : "No signals in database yet. Run watch_signals first."
          }]
        };
      }

      const lines: string[] = [
        `**New Signals**${since ? ` (since ${since})` : " (first check)"} — ${signals.length} new`,
        ``
      ];

      for (const signal of signals.slice(0, 20)) {
        lines.push(`• **${signal.title}** (score: ${signal.lastScore})`);
        lines.push(`  ${signal.url}`);
        if (signal.summary) {
          lines.push(`  ${signal.summary}`);
        }
        if (signal.tags && signal.tags.length > 0) {
          lines.push(`  Tags: ${signal.tags.slice(0, 5).join(", ")}`);
        }
        lines.push(``);
      }

      if (signals.length > 20) {
        lines.push(`... and ${signals.length - 20} more`);
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Error getting new signals: ${error instanceof Error ? error.message : String(error)}` }] };
    }
  }
);

server.registerTool(
  "signal_history",
  {
    description: "Get the score history for a specific signal (by URL). Shows how the signal's relevance score has changed over time.",
    inputSchema: {
      url: z.string().describe("The URL of the signal to get history for.")
    }
  },
  async ({ url }) => {
    try {
      const history = getHistory(url);

      if (history.length === 0) {
        return {
          content: [{
            type: "text",
            text: `No history found for URL: ${url}\n\nRun watch_signals first to collect signals, or check that the URL is correct.`
          }]
        };
      }

      const lines: string[] = [
        `**Score History for:** ${url}`,
        ``,
        `**${history.length}** recorded scores:`,
        ``
      ];

      for (const entry of history.slice(0, 10)) {
        lines.push(`• ${entry.scoredAt} — score: ${entry.score}`);
      }

      if (history.length > 10) {
        lines.push(`... and ${history.length - 10} more entries`);
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Error getting signal history: ${error instanceof Error ? error.message : String(error)}` }] };
    }
  }
);

server.registerTool(
  "add_watch_topic",
  {
    description: "Add a new topic to watch. The watcher will include this topic in future watch_signals runs.",
    inputSchema: {
      topic: z.string().describe("The search topic/keywords to watch, e.g., 'rust wasm' or 'agentic coding'."),
      source: z.string().optional().describe("The source type to watch (default: 'github'). Currently only 'github' is supported.")
    }
  },
  async ({ topic, source }) => {
    try {
      const watchTopic = addWatchTopic(topic, source || "github");
      return {
        content: [{
          type: "text",
          text: `**Added watch topic:**\n\n• Topic: "${watchTopic.topic}"\n• Source: ${watchTopic.source}\n• ID: ${watchTopic.id}\n• Active: ${watchTopic.isActive}\n\nThis topic will be included in future watch_signals runs.`
        }]
      };
    } catch (error) {
      return { content: [{ type: "text", text: `Error adding watch topic: ${error instanceof Error ? error.message : String(error)}` }] };
    }
  }
);

server.registerTool(
  "list_watch_topics",
  {
    description: "List all configured watch topics. Shows which topics are being monitored and their status.",
    inputSchema: {
      activeOnly: z.boolean().optional().default(true).describe("Whether to only show active topics (default: true).")
    }
  },
  async ({ activeOnly }) => {
    try {
      const topics = listWatchTopics(activeOnly);
      const stats = getWatcherStats();

      const lines: string[] = [
        `**Watch Topics** — ${topics.length} ${activeOnly ? "active" : "total"} topic(s)`,
        ``,
        `**Database Stats:**`,
        `• Total signals: ${stats.totalSignals}`,
        `• New today: ${stats.newToday}`,
        `• Last check: ${stats.lastCheckAt || "never"}`,
        `• Database: ${stats.databasePath}`,
        ``
      ];

      if (topics.length === 0) {
        lines.push(`No watch topics configured.`);
      } else {
        for (const topic of topics) {
          lines.push(`• **${topic.topic}**`);
          lines.push(`  Source: ${topic.source} | ID: ${topic.id} | Active: ${topic.isActive}`);
          lines.push(``);
        }
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Error listing watch topics: ${error instanceof Error ? error.message : String(error)}` }] };
    }
  }
);

async function main() {
  const app = express();
  app.use(express.json());

  // Lazy-initialized SSE transport instance
  let transport: any | undefined;

  // GET /sse: initialize the SSE transport (points to /messages endpoint)
  app.get("/sse", async (req: express.Request, res: express.Response) => {
    try {
      if (!transport) {
        // SSEServerTransport expects (endpoint, ServerResponse, options?)
        transport = new SSEServerTransport("/messages", res as unknown as ServerResponse);
        await transport.start();
        // connect the transport to the MCP server so it can send/receive messages
        await server.connect(transport);
      }

      // Informational response; clients will connect to the /messages endpoint
      res.status(200).send("SSE transport initialized. Connect to /messages for events.");
    } catch (err) {
      console.error("Failed to initialize SSE transport:", err);
      res.status(500).send("Failed to initialize SSE transport");
    }
  });

  // POST /messages: forward client payloads to the transport for handling
  app.post("/messages", async (req: express.Request, res: express.Response) => {
    if (!transport) {
      res.status(503).send("Transport not initialized; call GET /sse first.");
      return;
    }

    try {
      // Use handlePostMessage which accepts IncomingMessage + ServerResponse
      if (typeof transport.handlePostMessage === "function") {
        await transport.handlePostMessage(req as unknown as IncomingMessage, res as unknown as ServerResponse, req.body);
        // handlePostMessage is expected to end the response
      } else if (typeof transport.handleMessage === "function") {
        // fallback: pass the parsed body into handleMessage
        await transport.handleMessage(req.body);
        res.status(204).end();
      } else {
        res.status(501).send("Transport does not implement POST handling");
      }
    } catch (err) {
      console.error("Error handling /messages payload:", err);
      res.status(500).send("Error handling message");
    }
  });

  // Health check for Render and other platforms
  app.get("/health", (_req: express.Request, res: express.Response) => {
    res.status(200).send("ok");
  });

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  app.listen(port, () => {
    console.log(`Vanguard Tech Radar MCP listening on port ${port}`);
  });
}

main().catch((error) => {
  console.error("Failed to start Vanguard Tech Radar MCP:", error);
  process.exit(1);
});
