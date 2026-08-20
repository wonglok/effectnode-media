import { create } from "zustand";

const API_BASE = `http://localhost:${(window as any).PORT}`;

export interface SceneVisualItem {
  id: string;
  prompt: string;
  generating: boolean;
  uploading: boolean;
  result: string | null;
  error: string | null;
  logs: string[];
}

interface SceneVisualStore {
  projectId: string | null;
  items: SceneVisualItem[];
  ensureProject: (projectId: string) => void;
  addItem: () => void;
  removeItem: (id: string) => void;
  setPrompt: (id: string, prompt: string) => void;
  generateItem: (projectId: string, id: string) => Promise<void>;
  uploadItemImage: (
    projectId: string,
    id: string,
    base64: string,
    filename: string,
  ) => Promise<void>;
  haltAll: () => void;
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function readSSEStream(
  response: Response,
  onEvent: (event: string, data: any) => void,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      let eventType = "message";
      for (const line of lines) {
        if (line.startsWith("event: ")) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          try {
            onEvent(eventType, JSON.parse(line.slice(6)));
          } catch {
            // skip malformed lines
          }
          eventType = "message";
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export const useSceneVisualStore = create<SceneVisualStore>((set, get) => ({
  projectId: null,
  items: [],

  ensureProject: (projectId) => {
    if (get().projectId !== projectId) {
      set({ projectId, items: [] });
    }
  },

  addItem: () =>
    set((s) => ({
      items: [
        ...s.items,
        {
          id: makeId(),
          prompt: "",
          generating: false,
          uploading: false,
          result: null,
          error: null,
          logs: [],
        },
      ],
    })),

  removeItem: (id) =>
    set((s) => ({ items: s.items.filter((i) => i.id !== id) })),

  setPrompt: (id, prompt) =>
    set((s) => ({
      items: s.items.map((i) =>
        i.id === id ? { ...i, prompt, error: null } : i,
      ),
    })),

  generateItem: async (projectId, id) => {
    const item = get().items.find((i) => i.id === id);
    if (!item || item.generating || !item.prompt.trim()) return;

    set((s) => ({
      items: s.items.map((i) =>
        i.id === id
          ? { ...i, generating: true, error: null, result: null, logs: [] }
          : i,
      ),
    }));

    try {
      const res = await fetch(`${API_BASE}/api/render/text-to-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: item.prompt.trim(),
          projectId,
          aspect: "1:1",
          width: 1080,
          height: 1080,
          device: "mps",
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        set((s) => ({
          items: s.items.map((i) =>
            i.id === id ? { ...i, generating: false, error: err } : i,
          ),
        }));
        return;
      }

      await readSSEStream(res, (event, data) => {
        switch (event) {
          case "log":
            set((s) => ({
              items: s.items.map((i) =>
                i.id === id
                  ? { ...i, logs: [...i.logs, data.text as string] }
                  : i,
              ),
            }));
            break;
          case "complete":
            set((s) => ({
              items: s.items.map((i) =>
                i.id === id
                  ? {
                      ...i,
                      generating: false,
                      result: `http://localhost:${(window as any).PORT}/api/files?path=${encodeURIComponent(data.path)}`,
                    }
                  : i,
              ),
            }));
            break;
          case "error":
            set((s) => ({
              items: s.items.map((i) =>
                i.id === id
                  ? {
                      ...i,
                      generating: false,
                      error: data.error || "Image generation failed",
                    }
                  : i,
              ),
            }));
            break;
        }
      });
    } catch (e) {
      set((s) => ({
        items: s.items.map((i) =>
          i.id === id ? { ...i, generating: false, error: String(e) } : i,
        ),
      }));
    }
  },

  uploadItemImage: async (projectId, id, base64, filename) => {
    set((s) => ({
      items: s.items.map((i) =>
        i.id === id ? { ...i, uploading: true, error: null } : i,
      ),
    }));

    try {
      const res = await fetch(`${API_BASE}/api/upload/image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: base64,
          filename: filename || `scene-${Date.now()}.png`,
          projectId,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        set((s) => ({
          items: s.items.map((i) =>
            i.id === id ? { ...i, uploading: false, error: err } : i,
          ),
        }));
        return;
      }

      const data = await res.json();
      set((s) => ({
        items: s.items.map((i) =>
          i.id === id
            ? {
                ...i,
                uploading: false,
                result: `http://localhost:${(window as any).PORT}/api/files?path=${encodeURIComponent(data.path)}`,
              }
            : i,
        ),
      }));
    } catch (e) {
      set((s) => ({
        items: s.items.map((i) =>
          i.id === id ? { ...i, uploading: false, error: String(e) } : i,
        ),
      }));
    }
  },

  haltAll: () => {
    set((s) => ({
      items: s.items.map((i) =>
        i.generating ? { ...i, generating: false } : i,
      ),
    }));
    fetch(`${API_BASE}/api/render/cancel`, { method: "POST" }).catch(() => {});
  },
}));
