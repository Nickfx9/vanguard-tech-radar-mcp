import { Signal } from "../database.js";

/**
 * Source Adapter Interface
 * 
 * Each source adapter is responsible for:
 * 1. Fetching signals from its specific source
 * 2. Converting the data into the standardized Signal format
 * 3. Returning signals with proper deduplication keys (URL)
 */

export interface SourceAdapter {
  /** Unique identifier for this source */
  readonly sourceName: string;
  
  /**
   * Fetch signals from this source
   * @param topic - The search topic/query to use
   * @param options - Additional options for fetching
   * @returns Array of signals from this source
   */
  fetch(topic: string, options?: FetchOptions): Promise<Signal[]>;
}

export interface FetchOptions {
  /** Maximum number of signals to fetch */
  limit?: number;
  /** How far back to search, in days */
  sinceDays?: number;
}

/**
 * Helper to convert a TrendItem-like object to a Signal
 */
export function createSignal(params: {
  url: string;
  source: string;
  title: string;
  summary?: string;
  category: string;
  score: number;
  tags?: string[];
  metadata?: Record<string, string | number | boolean | undefined>;
  publishedAt?: string;
}): Signal {
  const now = new Date().toISOString();
  return {
    url: params.url,
    source: params.source,
    title: params.title,
    summary: params.summary,
    category: params.category,
    firstSeenAt: now,
    lastSeenAt: now,
    seenCount: 1,
    lastScore: params.score,
    tags: params.tags,
    metadata: params.metadata,
    publishedAt: params.publishedAt
  };
}
