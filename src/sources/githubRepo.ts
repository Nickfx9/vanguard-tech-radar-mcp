import axios, { AxiosError } from "axios";

type GitHubRepoMetadata = {
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
  topics?: string[];
  updated_at: string;
};

type GitHubReadme = {
  content: string;
  encoding: string;
};

type GitHubCommit = {
  sha: string;
};

type GitHubRelease = {
  published_at: string | null;
  created_at: string;
  tag_name: string;
  html_url: string;
};

type GitHubSearchResponse = {
  total_count: number;
};

type RepoRef = {
  owner: string;
  repo: string;
};

const GITHUB_API = "https://api.github.com";

function githubHeaders(): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {})
  };
}

function parseRepoUrl(repoUrl: string): RepoRef {
  const trimmed = repoUrl.trim();
  const shorthand = trimmed.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (shorthand) return { owner: shorthand[1], repo: shorthand[2].replace(/\.git$/, "") };

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("Use a GitHub repo URL like https://github.com/owner/repo or owner/repo.");
  }

  if (url.hostname.toLowerCase() !== "github.com") {
    throw new Error("Only github.com repository URLs are supported.");
  }

  const [owner, repo] = url.pathname.split("/").filter(Boolean);
  if (!owner || !repo) {
    throw new Error("Use a GitHub repo URL like https://github.com/owner/repo.");
  }

  return { owner, repo: repo.replace(/\.git$/, "") };
}

function githubError(error: unknown, repo: RepoRef): string {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error ? error.message : String(error);
  }

  const axiosError = error as AxiosError<{ message?: string }>;
  const status = axiosError.response?.status;
  const message = axiosError.response?.data?.message || axiosError.message;
  const remaining = axiosError.response?.headers["x-ratelimit-remaining"];
  const reset = axiosError.response?.headers["x-ratelimit-reset"];
  const resetAt = reset ? new Date(Number(reset) * 1000).toISOString() : undefined;
  const rateInfo = remaining !== undefined ? ` (rate limit remaining: ${remaining}${resetAt ? `, resets at ${resetAt}` : ""})` : "";

  if (status === 404) {
    return `Repository not found or not accessible: ${repo.owner}/${repo.repo}. If this is private, set GITHUB_TOKEN with repo access.`;
  }

  if (status === 403) {
    if (remaining === "0") {
      return `GitHub API rate limit exceeded${resetAt ? `; resets at ${resetAt}` : ""}. Set GITHUB_TOKEN for higher limits or try again after the reset window.`;
    }
    return `GitHub API access forbidden for ${repo.owner}/${repo.repo}: ${message}${rateInfo}`;
  }

  if (status === 429) {
    return `GitHub API rate limit exceeded${resetAt ? `; resets at ${resetAt}` : ""}. ${message}${rateInfo}`;
  }

  return `GitHub API error${status ? ` ${status}` : ""} for ${repo.owner}/${repo.repo}: ${message}${rateInfo}`;
}

async function getRepo(repo: RepoRef): Promise<GitHubRepoMetadata> {
  const response = await axios.get<GitHubRepoMetadata>(`${GITHUB_API}/repos/${repo.owner}/${repo.repo}`, {
    headers: githubHeaders(),
    timeout: 15_000
  });
  return response.data;
}

function decodeReadme(readme: GitHubReadme): string {
  if (readme.encoding !== "base64") return readme.content;
  return Buffer.from(readme.content, "base64").toString("utf8");
}

async function getReadmeExcerpt(repo: RepoRef): Promise<string | undefined> {
  try {
    const response = await axios.get<GitHubReadme>(`${GITHUB_API}/repos/${repo.owner}/${repo.repo}/readme`, {
      headers: githubHeaders(),
      timeout: 15_000
    });
    return extractFirstRealParagraph(decodeReadme(response.data));
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) return undefined;
    throw error;
  }
}

function extractFirstRealParagraph(markdown: string): string | undefined {
  const paragraphs = markdown
    .replace(/```[\s\S]*?```/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .split(/\n\s*\n/)
    .map((block) =>
      block
        .split("\n")
        .filter((line) => {
          const trimmed = line.trim();
          return (
            trimmed &&
            !trimmed.startsWith("#") &&
            !trimmed.startsWith("[!") &&
            !trimmed.startsWith("!") &&
            !trimmed.startsWith("<img") &&
            !trimmed.startsWith("<p align=") &&
            !/^\[!\[.*\]\(.*\)\]\(.*\)$/.test(trimmed)
          );
        })
        .join(" ")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/[*_`>#]/g, "")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter((block) => block.length >= 40);

  return paragraphs[0]?.slice(0, 700);
}

async function fileExists(repo: RepoRef, path: string): Promise<boolean> {
  try {
    await axios.get(`${GITHUB_API}/repos/${repo.owner}/${repo.repo}/contents/${path}`, {
      headers: githubHeaders(),
      timeout: 15_000
    });
    return true;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) return false;
    throw error;
  }
}

async function detectStack(repo: RepoRef): Promise<string[]> {
  const checks: Array<string | undefined> = await Promise.all([
    fileExists(repo, "package.json").then((exists) => (exists ? "Node/JavaScript or TypeScript" : undefined)),
    fileExists(repo, "requirements.txt").then((exists) => (exists ? "Python" : undefined)),
    fileExists(repo, "go.mod").then((exists) => (exists ? "Go" : undefined)),
    fileExists(repo, "Cargo.toml").then((exists) => (exists ? "Rust" : undefined))
  ]);
  return checks.filter((stack): stack is string => Boolean(stack));
}

export async function analyzeGitHubRepo(repoUrl: string): Promise<string> {
  let repo: RepoRef;
  try {
    repo = parseRepoUrl(repoUrl);
  } catch (error) {
    return `Error analyzing GitHub repo: ${error instanceof Error ? error.message : String(error)}`;
  }

  try {
    const [metadata, readmeExcerpt, stack] = await Promise.all([getRepo(repo), getReadmeExcerpt(repo), detectStack(repo)]);
    const topics = metadata.topics?.length ? metadata.topics.join(", ") : "none listed";

    return [
      `# GitHub Repo Analysis: ${metadata.full_name}`,
      "",
      `Description: ${metadata.description || "No repository description provided."}`,
      readmeExcerpt ? `README excerpt: ${readmeExcerpt}` : "README excerpt: No README paragraph found.",
      `Stack: ${stack.length ? stack.join(", ") : metadata.language || "Not detected from package.json, requirements.txt, go.mod, or Cargo.toml."}`,
      `Topics: ${topics}`,
      `Stars: ${metadata.stargazers_count.toLocaleString("en-US")}`,
      `Language: ${metadata.language || "unknown"}`,
      `Updated: ${metadata.updated_at}`,
      `URL: ${metadata.html_url}`
    ].join("\n");
  } catch (error) {
    return `Error analyzing GitHub repo: ${githubError(error, repo)}`;
  }
}

type GitHubCommitActivityWeek = {
  total: number;
  week: number;
  days: number[];
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchCommitActivity(repo: RepoRef): Promise<number | undefined> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await axios.get<GitHubCommitActivityWeek[] | null>(`${GITHUB_API}/repos/${repo.owner}/${repo.repo}/stats/commit_activity`, {
        headers: githubHeaders(),
        timeout: 15_000
      });

      const data = response.data;
      const isEmpty = data == null || (Array.isArray(data) && data.length === 0);
      if (response.status === 202 || isEmpty) {
        if (attempt === maxAttempts) return undefined;
        await sleep(2000);
        continue;
      }

      if (Array.isArray(data)) {
        const weeklyTotals = data.slice(-4).map((week) => week.total ?? 0);
        return weeklyTotals.reduce((sum, count) => sum + count, 0);
      }

      return undefined;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 202) {
        if (attempt === maxAttempts) return undefined;
        await sleep(2000);
        continue;
      }
      throw error;
    }
  }

  return undefined;
}

async function countCommitsViaCommitsApi(repo: RepoRef, since: string): Promise<number> {
  let page = 1;
  let total = 0;

  while (page <= 10) {
    const response = await axios.get<GitHubCommit[]>(`${GITHUB_API}/repos/${repo.owner}/${repo.repo}/commits`, {
      headers: githubHeaders(),
      params: { since, per_page: 100, page },
      timeout: 15_000
    });

    total += response.data.length;
    if (response.data.length < 100) break;
    page += 1;
  }

  return total;
}

async function countCommitsSince(repo: RepoRef, since: string): Promise<number> {
  const fromStats = await fetchCommitActivity(repo);
  if (typeof fromStats === "number") {
    return fromStats;
  }
  return countCommitsViaCommitsApi(repo, since);
}

async function countIssues(repo: RepoRef, state: "open" | "closed"): Promise<number> {
  const response = await axios.get<GitHubSearchResponse>(`${GITHUB_API}/search/issues`, {
    headers: githubHeaders(),
    params: {
      q: `repo:${repo.owner}/${repo.repo} is:issue is:${state}`,
      per_page: 1
    },
    timeout: 15_000
  });
  return response.data.total_count;
}

async function getLatestRelease(repo: RepoRef): Promise<GitHubRelease | undefined> {
  try {
    const response = await axios.get<GitHubRelease>(`${GITHUB_API}/repos/${repo.owner}/${repo.repo}/releases/latest`, {
      headers: githubHeaders(),
      timeout: 15_000
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) return undefined;
    throw error;
  }
}

function daysBetween(fromIso: string, to = Date.now()): number {
  return Math.floor((to - new Date(fromIso).getTime()) / 86_400_000);
}

function healthVerdict(commitsLast30Days: number, openIssues: number, closedIssues: number, daysSinceLatestRelease?: number): string {
  const issueRatio = closedIssues === 0 ? openIssues : openIssues / closedIssues;
  const staleRelease = daysSinceLatestRelease === undefined || daysSinceLatestRelease > 365;

  if (commitsLast30Days === 0 && staleRelease && issueRatio >= 1) return "likely abandoned";
  if (commitsLast30Days >= 5 && issueRatio <= 2 && (daysSinceLatestRelease === undefined || daysSinceLatestRelease <= 180)) return "actively maintained";
  if (commitsLast30Days >= 1 && issueRatio <= 5) return "slowing down";
  return "likely abandoned";
}

export async function repoHealthCheck(repoUrl: string): Promise<string> {
  let repo: RepoRef;
  try {
    repo = parseRepoUrl(repoUrl);
  } catch (error) {
    return `Error checking GitHub repo health: ${error instanceof Error ? error.message : String(error)}`;
  }
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();

  try {
    const metadata = await getRepo(repo);
    const [commitsLast30Days, openIssues, closedIssues, latestRelease] = await Promise.all([
      countCommitsSince(repo, since),
      countIssues(repo, "open"),
      countIssues(repo, "closed"),
      getLatestRelease(repo)
    ]);

    const releaseDate = latestRelease?.published_at || latestRelease?.created_at;
    const daysSinceLatestRelease = releaseDate ? daysBetween(releaseDate) : undefined;
    const issueRatio = closedIssues === 0 ? (openIssues === 0 ? 0 : Infinity) : openIssues / closedIssues;
    const verdict = healthVerdict(commitsLast30Days, openIssues, closedIssues, daysSinceLatestRelease);

    return [
      `# Repo Health Check: ${metadata.full_name}`,
      "",
      `Verdict: ${verdict}`,
      `Commits in last 30 days: ${commitsLast30Days}`,
      `Open issues: ${openIssues}`,
      `Closed issues: ${closedIssues}`,
      `Open/closed issue ratio: ${Number.isFinite(issueRatio) ? issueRatio.toFixed(2) : "unbounded"}`,
      `Latest release: ${latestRelease ? `${latestRelease.tag_name} (${releaseDate})` : "none found"}`,
      `Days since latest release: ${daysSinceLatestRelease ?? "no releases found"}`,
      `Updated: ${metadata.updated_at}`,
      `URL: ${metadata.html_url}`
    ].join("\n");
  } catch (error) {
    return `Error checking GitHub repo health: ${githubError(error, repo)}`;
  }
}
