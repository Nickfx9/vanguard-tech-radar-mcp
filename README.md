# Vanguard Tech Radar MCP

Vanguard Tech Radar is an MCP server that tracks fresh technology signals from big tech blogs, GitHub, and Hacker News.

## Tools

- `latest_tech_trends` - ranked trends across all sources
- `github_trending_repos` - high-signal GitHub repositories
- `company_announcements` - latest major tech company announcements
- `developer_opportunities` - hackathons, grants, betas, previews, and programs
- `watch_new_tech_signals` - returns only items not seen before by this local server
- `analyze_tech_impact` - explains why a trend matters and what to do next
- `models_and_research` - Hugging Face models plus arXiv research
- `daily_tech_briefing` - one briefing with trends, repos, announcements, research, opportunities, and actions

## Sources

- GitHub repository search
- Hacker News
- OpenAI, Google AI, Microsoft, NVIDIA, Anthropic, Meta AI, AWS, GitHub, Hugging Face, Cloudflare, and Vercel feeds
- Hugging Face model API
- arXiv research API
- Devpost, Product Hunt, YC, and developer program feeds

Every trend response includes practical impact notes: why you should care and what to do next.

## Setup

```bash
npm install
copy .env.example .env
npm run build
```

`GITHUB_TOKEN` is optional, but recommended for higher GitHub API limits.

## Run

```bash
npm start
```

The server uses MCP stdio transport, so MCP clients should launch:

```bash
node D:\vanguard-mcp\build\index.js
```

## Smoke Test

```bash
python src\mcp-test.py
```

## MCP Inspector

On Windows, use the launcher script to avoid path parsing issues:

```text
Transport Type: STDIO
Command: D:\vanguard-mcp\run-mcp.cmd
Arguments:
```

Leave `Arguments` empty.

## Claude Desktop Extension

If your Claude Desktop version manages MCP through Extensions, install the packaged bundle from:

```text
D:\vanguard-mcp\dist\vanguard-tech-radar.dxt
```

Open Claude Desktop, go to Settings > Extensions > Advanced settings > Install Extension, then select the `.dxt` file.
