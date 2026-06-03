import { shortImpact, nextAction } from "./impact.js";
import { BriefingSections, TrendItem } from "./types.js";

export function formatTrendItems(items: TrendItem[], options: { actionable?: boolean } = {}): string {
  if (!items.length) return "No matching tech trends found right now.";

  return items
    .map((item, index) => {
      const date = item.publishedAt ? new Date(item.publishedAt).toISOString().slice(0, 10) : "unknown date";
      const tags = item.tags.length ? `\nTags: ${item.tags.slice(0, 8).join(", ")}` : "";
      const summary = item.summary ? `\nSummary: ${item.summary.slice(0, 260)}` : "";
      const actionable = options.actionable
        ? `\nWhy care: ${shortImpact(item)}\nWhat to do: ${nextAction(item)}`
        : "";
      return `${index + 1}. ${item.title}\nSource: ${item.source} | ${item.category} | score ${Math.round(item.score)} | ${date}${summary}${tags}${actionable}\nURL: ${item.url}`;
    })
    .join("\n\n");
}

function section(title: string, items: TrendItem[]): string {
  return [`## ${title}`, formatTrendItems(items, { actionable: true })].join("\n");
}

export function formatDailyBriefing(sections: BriefingSections): string {
  const topSignals = [
    ...sections.trends,
    ...sections.repos,
    ...sections.announcements,
    ...sections.modelsAndResearch,
    ...sections.opportunities
  ]
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return [
    "# Vanguard Tech Radar Daily Briefing",
    "",
    "## Executive signals",
    formatTrendItems(topSignals, { actionable: true }),
    "",
    section("Top trends", sections.trends),
    "",
    section("GitHub repositories", sections.repos),
    "",
    section("Company announcements", sections.announcements),
    "",
    section("Models and research", sections.modelsAndResearch),
    "",
    section("Opportunities and events", sections.opportunities),
    "",
    "## Recommended action",
    "Pick one item from the briefing, spend 30-60 minutes validating it, then either build a tiny demo, save it to watch, or discard it deliberately."
  ].join("\n");
}

