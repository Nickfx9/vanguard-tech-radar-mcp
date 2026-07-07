import {
  upsertSignals,
  getNewSignalsSince,
  getSignalHistory,
  addWatchTopic as dbAddWatchTopic,
  listWatchTopics as dbListWatchTopics,
  getLastCheckTime,
  getStats,
  getDatabasePath,
  Signal,
  WatchTopic
} from "./database.js";
import { githubWatcher } from "./sources/github.js";

/**
 * Signal Watcher - Main Module
 * 
 * Orchestrates signal collection from all configured sources,
 * stores them in the database, and provides query capabilities.
 */

// Registry of source adapters
const sourceAdapters = new Map<string, { fetch: (topic: string, options?: any) => Promise<Signal[]> }>();
sourceAdapters.set("github", githubWatcher);

/**
 * Watch signals from all active sources and topics
 * @returns Summary of what was collected
 */
export async function watchSignals(): Promise<WatchResult> {
  const topics = dbListWatchTopics(true);
  const result: WatchResult = {
    checkedAt: new Date().toISOString(),
    sourcesChecked: 0,
    signalsFound: 0,
    newSignals: 0,
    updatedSignals: 0,
    details: []
  };

  for (const topic of topics) {
    const adapter = sourceAdapters.get(topic.source);
    if (!adapter) {
      console.warn(`No adapter found for source: ${topic.source}`);
      continue;
    }

    try {
      const signals = await adapter.fetch(topic.topic, { limit: 30, sinceDays: 14 });
      result.sourcesChecked++;
      result.signalsFound += signals.length;

      // Track new vs updated signals
      let newCount = 0;
      let updatedCount = 0;

      for (const signal of signals) {
        const existing = await import("./database.js").then(m => m.getSignal(signal.url));
        if (existing) {
          updatedCount++;
        } else {
          newCount++;
        }
      }

      result.newSignals += newCount;
      result.updatedSignals += updatedCount;

      // Store all signals in database
      upsertSignals(signals);

      result.details.push({
        source: topic.source,
        topic: topic.topic,
        signalsFound: signals.length,
        newSignals: newCount,
        updatedSignals: updatedCount
      });
    } catch (error) {
      console.error(`Error fetching from ${topic.source}:`, error);
      result.details.push({
        source: topic.source,
        topic: topic.topic,
        signalsFound: 0,
        newSignals: 0,
        updatedSignals: 0,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return result;
}

export interface WatchResult {
  checkedAt: string;
  sourcesChecked: number;
  signalsFound: number;
  newSignals: number;
  updatedSignals: number;
  details: Array<{
    source: string;
    topic: string;
    signalsFound: number;
    newSignals: number;
    updatedSignals: number;
    error?: string;
  }>;
}

/**
 * Get signals that are new since the last check
 * @returns Array of new signals since last check
 */
export async function getNewSignals(): Promise<{ signals: Signal[]; since: string | null }> {
  const lastCheck = getLastCheckTime();
  
  if (!lastCheck) {
    // If no previous check, return all signals
    const allSignals = await import("./database.js").then(m => m.getAllSignals(50));
    return { signals: allSignals, since: null };
  }

  const newSignals = getNewSignalsSince(lastCheck);
  return { signals: newSignals, since: lastCheck };
}

/**
 * Get the score history for a specific signal
 * @param url - The URL of the signal
 * @returns Array of score entries
 */
export function getHistory(url: string) {
  return getSignalHistory(url);
}

/**
 * Add a new watch topic
 * @param topic - The topic keyword to watch
 * @param source - The source type (default: "github")
 * @returns The created watch topic
 */
export function addWatchTopic(topic: string, source: string = "github"): WatchTopic {
  return dbAddWatchTopic(topic, source);
}

/**
 * List all watch topics
 * @param activeOnly - Whether to only return active topics
 * @returns Array of watch topics
 */
export function listWatchTopics(activeOnly: boolean = true): WatchTopic[] {
  return dbListWatchTopics(activeOnly);
}

/**
 * Get watcher statistics
 * @returns Statistics about the watcher
 */
export function getWatcherStats() {
  const stats = getStats();
  const lastCheck = getLastCheckTime();
  return {
    ...stats,
    lastCheckAt: lastCheck,
    databasePath: getDatabasePath()
  };
}
