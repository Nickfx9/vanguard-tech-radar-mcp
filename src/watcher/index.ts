/**
 * Signal Watcher Module
 * 
 * This module provides a signal watching system that:
 * - Collects signals from various sources (GitHub, etc.)
 * - Stores and tracks signals in SQLite
 * - Provides deduplication and history tracking
 * - Exposes MCP tools for interaction
 */

// Database exports
export {
  getDatabase,
  Signal,
  SignalScoreEntry,
  WatchTopic,
  upsertSignal,
  upsertSignals,
  getSignal,
  getSignalsSince,
  getNewSignalsSince,
  getSignalHistory,
  getAllSignals,
  getSignalsBySource,
  removeWatchTopic,
  getLastCheckTime,
  getStats,
  closeDatabase,
  getDatabasePath
} from "./database.js";

// Watcher exports (includes addWatchTopic and listWatchTopics with watcher logic)
export {
  watchSignals,
  WatchResult,
  getNewSignals,
  getHistory,
  addWatchTopic,
  listWatchTopics,
  getWatcherStats
} from "./watcher.js";

// Source adapter exports
export {
  SourceAdapter,
  FetchOptions,
  createSignal
} from "./sources/types.js";
