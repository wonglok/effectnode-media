import { create } from "zustand";

export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

interface ProjectStore {
  projects: Project[];
  loading: boolean;
  error: string | null;

  fetchProjects: () => Promise<void>;
  createProject: (name: string, description: string) => Promise<Project | null>;
  updateProject: (id: string, data: { name?: string; description?: string }) => Promise<Project | null>;
  deleteProject: (id: string) => Promise<boolean>;
  openInFinder: (id: string) => Promise<boolean>;
  openFolder: (id: string, type: "upload" | "output") => Promise<boolean>;
}

const API_BASE = `http://localhost:${(window as any).PORT}`;

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  loading: false,
  error: null,

  fetchProjects: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`${API_BASE}/api/projects`);
      const projects = await res.json();
      set({ projects, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  createProject: async (name, description) => {
    set({ error: null });
    try {
      const res = await fetch(`${API_BASE}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      if (!res.ok) throw new Error(await res.text());
      const project = await res.json();
      set({ projects: [...get().projects, project] });
      return project;
    } catch (e) {
      set({ error: String(e) });
      return null;
    }
  },

  updateProject: async (id, data) => {
    set({ error: null });
    try {
      const res = await fetch(`${API_BASE}/api/projects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      set({
        projects: get().projects.map((p) => (p.id === id ? updated : p)),
      });
      return updated;
    } catch (e) {
      set({ error: String(e) });
      return null;
    }
  },

  deleteProject: async (id) => {
    set({ error: null });
    try {
      const res = await fetch(`${API_BASE}/api/projects/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await res.text());
      set({ projects: get().projects.filter((p) => p.id !== id) });
      return true;
    } catch (e) {
      set({ error: String(e) });
      return false;
    }
  },

  openInFinder: async (id) => {
    set({ error: null });
    try {
      const res = await fetch(`${API_BASE}/api/projects/${id}/open-in-finder`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(await res.text());
      return true;
    } catch (e) {
      set({ error: String(e) });
      return false;
    }
  },

  openFolder: async (id, type) => {
    set({ error: null });
    try {
      const res = await fetch(`${API_BASE}/api/projects/${id}/open-folder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      if (!res.ok) throw new Error(await res.text());
      return true;
    } catch (e) {
      set({ error: String(e) });
      return false;
    }
  },
}));
