export type TrendCategory =
  | "github"
  | "company-announcement"
  | "developer-opportunity"
  | "discussion"
  | "release"
  | "research"
  | "tooling"
  | "model"
  | "event";

export type TrendItem = {
  title: string;
  url: string;
  source: string;
  category: TrendCategory;
  publishedAt?: string;
  summary?: string;
  score: number;
  tags: string[];
  metadata?: Record<string, string | number | boolean | undefined>;
};

export type TrendQuery = {
  query?: string;
  limit?: number;
  sinceDays?: number;
};

export type BriefingSections = {
  trends: TrendItem[];
  repos: TrendItem[];
  announcements: TrendItem[];
  modelsAndResearch: TrendItem[];
  opportunities: TrendItem[];
};
