import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Local JSON database root: ~/media-workspace.
export const WORKSPACE_DIR = path.join(os.homedir(), "effectnode-media");

async function ensureWorkspace(): Promise<void> {
  await fs.mkdir(WORKSPACE_DIR, { recursive: true });
}

/** Read a JSON file from the workspace, returning `fallback` if missing/invalid. */
export async function readJson<T>(file: string, fallback: T): Promise<T> {
  await ensureWorkspace();
  const full = path.join(WORKSPACE_DIR, file);
  try {
    return JSON.parse(await fs.readFile(full, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

/** Write JSON to the workspace atomically (temp file + rename). */
export async function writeJson(file: string, data: unknown): Promise<void> {
  await ensureWorkspace();
  const full = path.join(WORKSPACE_DIR, file);
  const tmp = `${full}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf-8");
  await fs.rename(tmp, full);
}
