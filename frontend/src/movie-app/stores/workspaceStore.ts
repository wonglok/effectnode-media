import { create } from "zustand";

const API_BASE = "";

export type FileKind = "image" | "video" | "text" | "other";

/** Which directory tree the file manager browses: the agent workspace or the whole project. */
export type FileScope = "agents" | "project";

export interface WorkspaceFile {
  path: string;
  name: string;
  ext: string;
  size: number;
  mtime: number;
  kind: FileKind;
}

export function workspacePreviewUrl(
  projectId: string,
  path: string,
  scope: FileScope = "agents",
): string {
  return `${API_BASE}/api/agent/file/preview?projectId=${encodeURIComponent(
    projectId,
  )}&path=${encodeURIComponent(path)}&scope=${encodeURIComponent(scope)}`;
}

interface WorkspaceStore {
  files: WorkspaceFile[];
  loading: boolean;
  error: string | null;
  fetchFiles: (projectId: string, scope?: FileScope) => Promise<void>;
  uploadFile: (
    projectId: string,
    dataUrl: string,
    filename: string,
    scope?: FileScope,
  ) => Promise<boolean>;
  removeFile: (
    projectId: string,
    path: string,
    scope?: FileScope,
  ) => Promise<void>;
  renameFile: (
    projectId: string,
    path: string,
    newName: string,
    scope?: FileScope,
  ) => Promise<void>;
  readFileContent: (
    projectId: string,
    path: string,
    scope?: FileScope,
  ) => Promise<string | null>;
  writeFileContent: (
    projectId: string,
    path: string,
    content: string,
    scope?: FileScope,
  ) => Promise<boolean>;
  openWorkspace: (projectId: string, scope?: FileScope) => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  files: [],
  loading: false,
  error: null,

  fetchFiles: async (projectId, scope = "agents") => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(
        `${API_BASE}/api/agent/files?projectId=${encodeURIComponent(
          projectId,
        )}&scope=${encodeURIComponent(scope)}`,
      );
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      set({ files: data.files || [], loading: false });
    } catch (e) {
      set({ loading: false, error: String(e) });
    }
  },

  uploadFile: async (projectId, dataUrl, filename, scope = "agents") => {
    // Strip any directory component — only the basename is ever sent.
    const safeName = filename.split(/[/\\]/).pop() || "upload";
    try {
      const res = await fetch(`${API_BASE}/api/agent/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: dataUrl,
          filename: safeName,
          projectId,
          scope,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      await get().fetchFiles(projectId, scope);
      return true;
    } catch (e) {
      set({ error: String(e) });
      return false;
    }
  },

  removeFile: async (projectId, path, scope = "agents") => {
    try {
      const res = await fetch(`${API_BASE}/api/agent/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, path, scope }),
      });
      if (!res.ok) throw new Error(await res.text());
      await get().fetchFiles(projectId, scope);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  renameFile: async (projectId, path, newName, scope = "agents") => {
    try {
      const res = await fetch(`${API_BASE}/api/agent/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, path, newName, scope }),
      });
      if (!res.ok) throw new Error(await res.text());
      await get().fetchFiles(projectId, scope);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  readFileContent: async (projectId, path, scope = "agents") => {
    try {
      const res = await fetch(
        `${API_BASE}/api/agent/file/content?projectId=${encodeURIComponent(
          projectId,
        )}&path=${encodeURIComponent(path)}&scope=${encodeURIComponent(scope)}`,
      );
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      return data.content ?? "";
    } catch (e) {
      set({ error: String(e) });
      return null;
    }
  },

  writeFileContent: async (projectId, path, content, scope = "agents") => {
    try {
      const res = await fetch(`${API_BASE}/api/agent/file/content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, path, content, scope }),
      });
      if (!res.ok) throw new Error(await res.text());
      await get().fetchFiles(projectId, scope);
      return true;
    } catch (e) {
      set({ error: String(e) });
      return false;
    }
  },

  openWorkspace: async (projectId, scope = "agents") => {
    try {
      await fetch(`${API_BASE}/api/agent/open-workspace`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, scope }),
      });
    } catch (e) {
      set({ error: String(e) });
    }
  },
}));
