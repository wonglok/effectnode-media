import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  realpathSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, sep } from "node:path";

const APP_DATA_DIR = join(homedir(), "media-studio");
const JSON_DIR = join(APP_DATA_DIR, "json");

export const AGENTS_DIR = join(APP_DATA_DIR, "agents");
export const UPLOAD_DIR = join(APP_DATA_DIR, "upload");
export const AGENT_UPLOAD_DIR = join(APP_DATA_DIR, "agent-upload");
export const MEMORIES_DIR_NAME = "memories";
export const PROJECTS_FILE = join(JSON_DIR, "projects.json");
export const STUDIO_DIR = join(APP_DATA_DIR, "studio");

export function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function workspaceDir(projectId: string): string {
  return join(AGENTS_DIR, projectId);
}

export function movieStudioDataDir(projectId: string): string {
  return join(STUDIO_DIR, projectId, "data");
}

export function movieStudioStateFile(projectId: string): string {
  return join(STUDIO_DIR, projectId, "state.json");
}

export function memoriesDir(projectId: string): string {
  return join(AGENTS_DIR, projectId, MEMORIES_DIR_NAME);
}

const PROJECT_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

export function isValidProjectId(id: string): boolean {
  return PROJECT_ID_RE.test(id);
}

/** Resolve a workspace-relative path safely (no traversal / absolute paths). */
export function resolveWorkspacePath(
  projectId: string,
  relativePath: string,
): string | null {
  if (!isValidProjectId(projectId)) return null;
  if (typeof relativePath !== "string" || !relativePath) return null;
  if (relativePath.includes("..") || relativePath.includes("\0")) return null;
  const normalized = relativePath.replace(/\\/g, "/");
  if (normalized.startsWith("/")) return null;
  const base = workspaceDir(projectId);
  const resolved = join(base, normalized);
  if (resolved !== base && !resolved.startsWith(base + sep)) return null;

  // Defense in depth: if the target exists, ensure its real path (symlinks
  // resolved) is still inside the real agent workspace.
  if (existsSync(resolved)) {
    try {
      const realResolved = realpathSync(resolved);
      const realAgents = realpathSync(AGENTS_DIR);
      if (!realResolved.startsWith(realAgents + sep)) return null;
    } catch {
      return null;
    }
  }
  return resolved;
}

export type FileKind = "image" | "video" | "text" | "other";

const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"];
const VIDEO_EXTS = [".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi"];
const TEXT_EXTS = [
  ".md",
  ".txt",
  ".json",
  ".csv",
  ".log",
  ".html",
  ".js",
  ".ts",
  ".tsx",
  ".jsx",
  ".py",
  ".css",
  ".yml",
  ".yaml",
];

export function classifyFile(name: string): FileKind {
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  if (IMAGE_EXTS.includes(ext)) return "image";
  if (VIDEO_EXTS.includes(ext)) return "video";
  if (TEXT_EXTS.includes(ext)) return "text";
  return "other";
}

export interface WorkspaceFile {
  path: string;
  name: string;
  ext: string;
  size: number;
  mtime: number;
  kind: FileKind;
}

export function walkFiles(base: string, prefix = ""): WorkspaceFile[] {
  const results: WorkspaceFile[] = [];
  let entries: string[];
  try {
    entries = readdirSync(base);
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = join(base, entry);
    const rel = prefix ? `${prefix}/${entry}` : entry;
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      results.push(...walkFiles(full, rel));
    } else {
      results.push({
        path: rel,
        name: entry,
        ext: entry.slice(entry.lastIndexOf(".")).toLowerCase(),
        size: st.size,
        mtime: st.mtimeMs,
        kind: classifyFile(entry),
      });
    }
  }
  return results;
}
