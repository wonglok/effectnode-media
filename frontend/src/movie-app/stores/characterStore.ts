import { create } from "zustand";

export interface Character {
  id: string;
  projectId: string;
  name: string;
  filename: string;
  source: "upload" | "generated";
  createdAt: string;
}

interface CharacterStore {
  characters: Character[];
  loading: boolean;
  error: string | null;

  fetchCharacters: (projectId: string) => Promise<void>;
  createCharacter: (
    projectId: string,
    name: string,
    filename: string,
    source?: "upload" | "generated",
  ) => Promise<Character | null>;
  updateCharacter: (
    id: string,
    projectId: string,
    data: Partial<Pick<Character, "name" | "filename" | "source">>,
  ) => Promise<Character | null>;
  deleteCharacter: (id: string, projectId: string) => Promise<boolean>;
}

const API_BASE = `http://localhost:${(window as any).PORT}`;

export const useCharacterStore = create<CharacterStore>((set, get) => ({
  characters: [],
  loading: false,
  error: null,

  fetchCharacters: async (projectId) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(
        `${API_BASE}/api/characters?projectId=${encodeURIComponent(projectId)}`,
      );
      if (!res.ok) throw new Error(await res.text());
      const characters = await res.json();
      set({ characters, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  createCharacter: async (projectId, name, filename, source = "upload") => {
    set({ error: null });
    try {
      const res = await fetch(`${API_BASE}/api/characters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, name, filename, source }),
      });
      if (!res.ok) throw new Error(await res.text());
      const character = await res.json();
      set({ characters: [...get().characters, character] });
      return character;
    } catch (e) {
      set({ error: String(e) });
      return null;
    }
  },

  updateCharacter: async (id, projectId, data) => {
    set({ error: null });
    try {
      const res = await fetch(
        `${API_BASE}/api/characters/${id}?projectId=${encodeURIComponent(projectId)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
      );
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      set({
        characters: get().characters.map((c) => (c.id === id ? updated : c)),
      });
      return updated;
    } catch (e) {
      set({ error: String(e) });
      return null;
    }
  },

  deleteCharacter: async (id, projectId) => {
    set({ error: null });
    try {
      const res = await fetch(
        `${API_BASE}/api/characters/${id}?projectId=${encodeURIComponent(projectId)}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error(await res.text());
      set({ characters: get().characters.filter((c) => c.id !== id) });
      return true;
    } catch (e) {
      set({ error: String(e) });
      return false;
    }
  },
}));
