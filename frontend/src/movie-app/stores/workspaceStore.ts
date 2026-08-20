import { create } from "zustand";

const API_BASE = `http://localhost:${(window as any).PORT}`;

export type FileKind = "image" | "video" | "text" | "other";

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
): string {
  return `${API_BASE}/api/agent/file/preview?projectId=${encodeURIComponent(
    projectId,
  )}&path=${encodeURIComponent(path)}`;
}

interface WorkspaceStore {
  files: WorkspaceFile[];
  loading: boolean;
  error: string | null;
  fetchFiles: (projectId: string) => Promise<void>;
  uploadFile: (
    projectId: string,
    dataUrl: string,
    filename: string,
  ) => Promise<boolean>;
  removeFile: (projectId: string, path: string) => Promise<void>;
  renameFile: (
    projectId: string,
    path: string,
    newName: string,
  ) => Promise<void>;
  readFileContent: (projectId: string, path: string) => Promise<string | null>;
  writeFileContent: (
    projectId: string,
    path: string,
    content: string,
  ) => Promise<boolean>;
  openWorkspace: (projectId: string) => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  files: [],
  loading: false,
  error: null,

  fetchFiles: async (projectId) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(
        `${API_BASE}/api/agent/files?projectId=${encodeURIComponent(projectId)}`,
      );
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      set({ files: data.files || [], loading: false });
    } catch (e) {
      set({ loading: false, error: String(e) });
    }
  },

  uploadFile: async (projectId, dataUrl, filename) => {
    // Strip any directory component — only the basename is ever sent.
    const safeName = filename.split(/[/\\]/).pop() || "upload";
    try {
      const res = await fetch(`${API_BASE}/api/agent/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl, filename: safeName, projectId }),
      });
      if (!res.ok) throw new Error(await res.text());
      await get().fetchFiles(projectId);
      return true;
    } catch (e) {
      set({ error: String(e) });
      return false;
    }
  },

  removeFile: async (projectId, path) => {
    try {
      const res = await fetch(`${API_BASE}/api/agent/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, path }),
      });
      if (!res.ok) throw new Error(await res.text());
      await get().fetchFiles(projectId);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  renameFile: async (projectId, path, newName) => {
    try {
      const res = await fetch(`${API_BASE}/api/agent/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, path, newName }),
      });
      if (!res.ok) throw new Error(await res.text());
      await get().fetchFiles(projectId);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  readFileContent: async (projectId, path) => {
    try {
      const res = await fetch(
        `${API_BASE}/api/agent/file/content?projectId=${encodeURIComponent(
          projectId,
        )}&path=${encodeURIComponent(path)}`,
      );
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      return data.content ?? "";
    } catch (e) {
      set({ error: String(e) });
      return null;
    }
  },

  writeFileContent: async (projectId, path, content) => {
    try {
      const res = await fetch(`${API_BASE}/api/agent/file/content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, path, content }),
      });
      if (!res.ok) throw new Error(await res.text());
      await get().fetchFiles(projectId);
      return true;
    } catch (e) {
      set({ error: String(e) });
      return false;
    }
  },

  openWorkspace: async (projectId) => {
    try {
      await fetch(`${API_BASE}/api/agent/open-workspace`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
    } catch (e) {
      set({ error: String(e) });
    }
  },
}));
