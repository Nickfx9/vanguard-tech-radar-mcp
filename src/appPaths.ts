import os from "node:os";
import path from "node:path";

export function getAppDataDir(): string {
  if (process.env.VANGUARD_DATA_DIR?.trim()) {
    return path.resolve(process.env.VANGUARD_DATA_DIR.trim());
  }

  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || os.homedir(), "vanguard-tech-radar");
  }

  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "vanguard-tech-radar");
  }

  return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"), "vanguard-tech-radar");
}

export function getCacheDir(): string {
  return path.join(getAppDataDir(), "cache");
}

export function getDatabaseDir(): string {
  return path.join(getAppDataDir(), "data");
}

