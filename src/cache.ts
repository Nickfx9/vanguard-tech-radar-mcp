import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getCacheDir } from "./appPaths.js";
import { TrendItem } from "./types.js";

const cacheDir = getCacheDir();
const seenFile = path.join(cacheDir, "seen-trends.json");

type SeenCache = Record<string, string>;

async function readSeen(): Promise<SeenCache> {
  try {
    return JSON.parse(await readFile(seenFile, "utf8")) as SeenCache;
  } catch {
    return {};
  }
}

export async function markAndFilterNew(items: TrendItem[]): Promise<TrendItem[]> {
  const seen = await readSeen();
  const now = new Date().toISOString();
  const fresh = items.filter((item) => !seen[item.url]);

  for (const item of items) {
    seen[item.url] = seen[item.url] ?? now;
  }

  await mkdir(cacheDir, { recursive: true });
  await writeFile(seenFile, JSON.stringify(seen, null, 2));
  return fresh;
}
