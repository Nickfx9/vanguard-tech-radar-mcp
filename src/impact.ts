import { TrendItem } from "./types.js";

export function analyzeImpact(topic: string, context?: string, audience?: string): string {
  const text = `${topic} ${context ?? ""}`.toLowerCase();
  const target = audience?.trim() || "builders, developers, founders, researchers, and technical learners";

  const signals: string[] = [];
  if (text.includes("agent")) signals.push("agentic workflows are moving from demos into practical automation");
  if (text.includes("mcp")) signals.push("MCP can make tools and data sources easier for AI systems to use safely");
  if (text.includes("open source") || text.includes("github")) signals.push("open-source momentum can create fast learning, reuse, and contribution opportunities");
  if (text.includes("model") || text.includes("llm")) signals.push("model improvements can unlock new product quality, speed, or cost tradeoffs");
  if (text.includes("security")) signals.push("security relevance means teams may need to evaluate trust, access, and deployment risk");
  if (text.includes("gpu") || text.includes("nvidia") || text.includes("cuda")) signals.push("compute-side progress can change what is practical to train, serve, or run locally");
  if (text.includes("api") || text.includes("sdk")) signals.push("APIs and SDKs reduce integration cost and can turn a trend into something shippable");
  if (text.includes("hugging face") || text.includes("dataset")) signals.push("model and dataset activity can reveal what the AI builder community is adopting");
  if (text.includes("paper") || text.includes("arxiv") || text.includes("research")) signals.push("research momentum can become tomorrow's tooling, products, and benchmarks");
  if (text.includes("hackathon") || text.includes("grant") || text.includes("startup") || text.includes("fellowship")) signals.push("opportunity signals can turn attention into funding, access, or portfolio proof");

  const why = signals.length
    ? signals
    : ["it may indicate a fresh shift in developer behavior, platform capability, or market demand"];

  return [
    `Impact analysis: ${topic}`,
    "",
    `Why you should care: ${why.join("; ")}.`,
    "",
    "What it unlocks:",
    "- Faster prototyping if the signal includes reusable code, APIs, SDKs, models, or examples.",
    "- New product ideas where the technology removes a previous bottleneck.",
    "- Learning and portfolio opportunities if the space is early and moving quickly.",
    "- Better timing decisions: adopt now, watch closely, or ignore if it does not fit your goals.",
    "",
    `Who should care: ${target}.`,
    "",
    "What you can do next:",
    "1. Open the repo/article and check recency, maintainers, examples, license, and activity.",
    "2. Build a tiny proof of concept before committing serious time.",
    "3. Compare it with one mature alternative so you understand the tradeoff.",
    "4. If it is an opportunity, note the deadline, eligibility, and application requirements.",
    "5. Save the signal if it maps to your roadmap, learning path, or business idea.",
    context ? `\nContext considered: ${context.slice(0, 500)}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

export function shortImpact(item: TrendItem): string {
  const text = `${item.title} ${item.summary ?? ""} ${item.tags.join(" ")}`.toLowerCase();
  if (item.category === "developer-opportunity" || item.category === "event") {
    return "This could become access, funding, network, beta entry, or portfolio proof if you act before the window closes.";
  }
  if (item.category === "github") {
    return "This is worth checking because active repos can become reusable building blocks, learning material, or contribution targets.";
  }
  if (item.category === "model") {
    return "This may matter because model releases show what capabilities builders can test, fine-tune, or integrate next.";
  }
  if (item.category === "research") {
    return "This is a research signal that may become tooling, product features, benchmarks, or investment themes.";
  }
  if (text.includes("agent") || text.includes("mcp")) {
    return "This points toward more capable AI workflows that can connect tools, data, and automation.";
  }
  if (text.includes("gpu") || text.includes("cuda") || text.includes("nvidia")) {
    return "This can affect what is practical to run, optimize, or deploy at scale.";
  }
  return "This is a signal to inspect because it may reveal where developer attention and platform capability are moving.";
}

export function nextAction(item: TrendItem): string {
  if (item.category === "github") return "Clone or star it, inspect examples, then build a 30-minute proof of concept.";
  if (item.category === "developer-opportunity" || item.category === "event") return "Check deadline, eligibility, and whether applying fits your current goals.";
  if (item.category === "model") return "Open the model page, inspect license/benchmarks, and test a small inference workflow.";
  if (item.category === "research") return "Read abstract and figures, then note one practical implementation idea.";
  if (item.category === "company-announcement") return "Look for API/docs/pricing changes and decide whether it affects your stack.";
  return "Open the link, verify credibility, and save it if it maps to your roadmap.";
}

