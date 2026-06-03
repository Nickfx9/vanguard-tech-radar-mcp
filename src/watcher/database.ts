import Database from "better-sqlite3";
import path from "node:path";
import { mkdirSync } from "node:fs";

/**
 * Signal Watcher Database Module
 * 
 * Schema Design:
 * 
 * 1. signals - Main table for tracking seen signals
 *    - id: Internal unique identifier
 *    - url: Unique URL of the signal (deduplication key)
 *    - source: Source type (e.g., "github", "hackernews")
 *    - title: Title of the signal
 *    - summary: Optional description/summary
 *    - category: Type of signal (e.g., "github", "release")
 *    - firstSeenAt: When this signal was first detected
 *    - lastSeenAt: When this signal was last detected
 *    - seenCount: How many times this signal has been seen
 *    - lastScore: Most recent relevance score
 *    - metadata: JSON string of additional data
 * 
 * 2. signal_scores - History of score changes over time
 *    - id: Internal unique identifier
 *    - signalUrl: Reference to signals.url
 *    - score: The score value at this point in time
 *    - scoredAt: When this score was recorded
 * 
 * 3. watch_topics - Topics/sources to monitor
 *    - id: Internal unique identifier
 *    - topic: The topic keyword to watch
 *    - source: Source type (e.g., "github")
 *    - createdAt: When this topic was added
 *    - isActive: Whether this topic is currently being watched
 */

const DB_DIR = path.join(process.cwd(), ".data");
const DB_PATH = path.join(DB_DIR, "signals.db");

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!db) {
    // Ensure data directory exists
    mkdirSync(DB_DIR, { recursive: true });
    
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database.Database): void {
  // Create signals table
  db.exec(`
    CREATE TABLE IF NOT EXISTS signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT UNIQUE NOT NULL,
      source TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT,
      category TEXT NOT NULL,
      firstSeenAt TEXT NOT NULL,
      lastSeenAt TEXT NOT NULL,
      seenCount INTEGER NOT NULL DEFAULT 1,
      lastScore REAL NOT NULL DEFAULT 0,
      metadata TEXT,
      publishedAt TEXT
    )
  `);

  // Create index for faster lookups
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_signals_source ON signals(source);
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_signals_category ON signals(category);
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_signals_lastSeenAt ON signals(lastSeenAt);
  `);

  // Create signal_scores table for score history
  db.exec(`
    CREATE TABLE IF NOT EXISTS signal_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      signalUrl TEXT NOT NULL,
      score REAL NOT NULL,
      scoredAt TEXT NOT NULL,
      FOREIGN KEY (signalUrl) REFERENCES signals(url) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_signal_scores_url ON signal_scores(signalUrl);
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_signal_scores_scoredAt ON signal_scores(scoredAt);
  `);

  // Create watch_topics table
  db.exec(`
    CREATE TABLE IF NOT EXISTS watch_topics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'github',
      createdAt TEXT NOT NULL,
      isActive INTEGER NOT NULL DEFAULT 1
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_watch_topics_source ON watch_topics(source);
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_watch_topics_active ON watch_topics(isActive);
  `);

  // Insert default watch topic for GitHub trending repos
  const existingCount = db.prepare("SELECT COUNT(*) as count FROM watch_topics").get() as { count: number };
  if (existingCount.count === 0) {
    db.prepare(`
      INSERT INTO watch_topics (topic, source, createdAt, isActive)
      VALUES (?, ?, ?, 1)
    `).run("ai agent OR llm OR mcp OR developer-tools", "github", new Date().toISOString());
  }
}

// Signal types
export interface Signal {
  url: string;
  source: string;
  title: string;
  summary?: string;
  category: string;
  firstSeenAt: string;
  lastSeenAt: string;
  seenCount: number;
  lastScore: number;
  tags?: string[];
  metadata?: Record<string, string | number | boolean | undefined>;
  publishedAt?: string;
}

export interface SignalScoreEntry {
  signalUrl: string;
  score: number;
  scoredAt: string;
}

export interface WatchTopic {
  id: number;
  topic: string;
  source: string;
  createdAt: string;
  isActive: boolean;
}

// Signal operations
export function upsertSignal(signal: Signal): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  
  // Check if signal exists
  const existing = db.prepare("SELECT * FROM signals WHERE url = ?").get(signal.url) as Signal | undefined;
  
  if (existing) {
    // Update existing signal
    db.prepare(`
      UPDATE signals 
      SET lastSeenAt = ?, seenCount = seenCount + 1, lastScore = ?, summary = ?, metadata = ?
      WHERE url = ?
    `).run(now, signal.lastScore, signal.summary, JSON.stringify(signal.metadata || {}), signal.url);
  } else {
    // Insert new signal
    db.prepare(`
      INSERT INTO signals (url, source, title, summary, category, firstSeenAt, lastSeenAt, seenCount, lastScore, metadata, publishedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `).run(
      signal.url,
      signal.source,
      signal.title,
      signal.summary,
      signal.category,
      signal.firstSeenAt,
      signal.lastSeenAt,
      signal.lastScore,
      JSON.stringify(signal.metadata || {}),
      signal.publishedAt
    );
  }
  
  // Record score history
  db.prepare(`
    INSERT INTO signal_scores (signalUrl, score, scoredAt)
    VALUES (?, ?, ?)
  `).run(signal.url, signal.lastScore, now);
}

export function upsertSignals(signals: Signal[]): void {
  const db = getDatabase();
  
  // Use a transaction for better performance
  const transaction = db.transaction((signals: Signal[]) => {
    for (const signal of signals) {
      upsertSignal(signal);
    }
  });
  
  transaction(signals);
}

export function getSignal(url: string): Signal | undefined {
  const db = getDatabase();
  const row = db.prepare("SELECT * FROM signals WHERE url = ?").get(url) as Signal | undefined;
  
  if (row) {
    try {
      row.metadata = JSON.parse(row.metadata as unknown as string || "{}");
    } catch {
      row.metadata = {};
    }
  }
  
  return row;
}

export function getSignalsSince(since: string): Signal[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT * FROM signals 
    WHERE firstSeenAt >= ? OR lastSeenAt >= ?
    ORDER BY lastSeenAt DESC
  `).all(since, since) as Signal[];
  
  return rows.map(row => {
    try {
      row.metadata = JSON.parse(row.metadata as unknown as string || "{}");
    } catch {
      row.metadata = {};
    }
    return row;
  });
}

export function getNewSignalsSince(lastCheckAt: string): Signal[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT * FROM signals 
    WHERE firstSeenAt >= ?
    ORDER BY firstSeenAt DESC
  `).all(lastCheckAt) as Signal[];
  
  return rows.map(row => {
    try {
      row.metadata = JSON.parse(row.metadata as unknown as string || "{}");
    } catch {
      row.metadata = {};
    }
    return row;
  });
}

export function getSignalHistory(url: string): SignalScoreEntry[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT signalUrl, score, scoredAt 
    FROM signal_scores 
    WHERE signalUrl = ?
    ORDER BY scoredAt DESC
  `).all(url) as SignalScoreEntry[];
}

export function getAllSignals(limit?: number): Signal[] {
  const db = getDatabase();
  const query = limit 
    ? `SELECT * FROM signals ORDER BY lastSeenAt DESC LIMIT ?`
    : `SELECT * FROM signals ORDER BY lastSeenAt DESC`;
  
  const rows = limit ? db.prepare(query).all(limit) as Signal[] : db.prepare(query).all() as Signal[];
  
  return rows.map(row => {
    try {
      row.metadata = JSON.parse(row.metadata as unknown as string || "{}");
    } catch {
      row.metadata = {};
    }
    return row;
  });
}

export function getSignalsBySource(source: string, limit?: number): Signal[] {
  const db = getDatabase();
  const query = limit
    ? `SELECT * FROM signals WHERE source = ? ORDER BY lastSeenAt DESC LIMIT ?`
    : `SELECT * FROM signals WHERE source = ? ORDER BY lastSeenAt DESC`;
  
  const rows = limit 
    ? db.prepare(query).all(source, limit) as Signal[] 
    : db.prepare(query).all(source) as Signal[];
  
  return rows.map(row => {
    try {
      row.metadata = JSON.parse(row.metadata as unknown as string || "{}");
    } catch {
      row.metadata = {};
    }
    return row;
  });
}

// Watch topic operations
export function addWatchTopic(topic: string, source: string = "github"): WatchTopic {
  const db = getDatabase();
  const now = new Date().toISOString();
  
  const result = db.prepare(`
    INSERT INTO watch_topics (topic, source, createdAt, isActive)
    VALUES (?, ?, ?, 1)
  `).run(topic, source, now);
  
  return {
    id: result.lastInsertRowid as number,
    topic,
    source,
    createdAt: now,
    isActive: true
  };
}

export interface WatchTopicRow {
  id: number;
  topic: string;
  source: string;
  createdAt: string;
  isActive: number;
}

export function listWatchTopics(activeOnly: boolean = true): WatchTopic[] {
  const db = getDatabase();
  const query = activeOnly
    ? `SELECT * FROM watch_topics WHERE isActive = 1 ORDER BY createdAt DESC`
    : `SELECT * FROM watch_topics ORDER BY createdAt DESC`;
  
  const rows = db.prepare(query).all() as WatchTopicRow[];
  return rows.map(row => ({
    id: row.id,
    topic: row.topic,
    source: row.source,
    createdAt: row.createdAt,
    isActive: row.isActive === 1
  }));
}

export function removeWatchTopic(id: number): boolean {
  const db = getDatabase();
  const result = db.prepare(`
    UPDATE watch_topics SET isActive = 0 WHERE id = ?
  `).run(id);
  
  return result.changes > 0;
}

export function getLastCheckTime(): string | null {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT lastSeenAt FROM signals 
    ORDER BY lastSeenAt DESC 
    LIMIT 1
  `).get() as { lastSeenAt: string } | undefined;
  
  return row?.lastSeenAt || null;
}

export function getStats(): { totalSignals: number; newToday: number; bySource: Record<string, number> } {
  const db = getDatabase();
  
  const totalSignals = db.prepare("SELECT COUNT(*) as count FROM signals").get() as { count: number };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const newToday = db.prepare("SELECT COUNT(*) as count FROM signals WHERE firstSeenAt >= ?").get(today.toISOString()) as { count: number };
  
  const bySourceRows = db.prepare("SELECT source, COUNT(*) as count FROM signals GROUP BY source").all() as { source: string; count: number }[];
  const bySource: Record<string, number> = {};
  for (const row of bySourceRows) {
    bySource[row.source] = row.count;
  }
  
  return {
    totalSignals: totalSignals.count,
    newToday: newToday.count,
    bySource
  };
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}