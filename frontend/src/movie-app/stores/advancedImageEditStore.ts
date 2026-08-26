import { create } from "zustand";
import type { AspectRatio } from "./generationStore";

const API_BASE = "";

export interface AdvancedImage {
  filename: string;
  url: string;
}

export const RESOLUTIONS = [250, 500, 1000, 1500, 2000] as const;
export const STEPS_OPTIONS = [8, 10, 12, 20, 40] as const;

function getDimensions(
  aspect: AspectRatio,
  resolution: number,
): { width: number; height: number } {
  const size = resolution;
  switch (aspect) {
    case "1:1":
      return { width: size, height: size };
    case "16:9":
      return { width: Math.round((size * 16) / 9), height: size };
    case "9:16":
      return { width: size, height: Math.round((size * 16) / 9) };
    case "4:3":
      return { width: Math.round((size * 4) / 3), height: size };
    case "3:4":
      return { width: size, height: Math.round((size * 4) / 3) };
  }
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

interface AdvancedImageEditStore {
  prompt: string;
  aspectRatio: AspectRatio;
  resolution: number;
  steps: number;
  seed: number;
  lowRam: boolean;
  image: AdvancedImage | null;
  generating: boolean;
  result: string | null;
  error: string | null;
  logs: string[];

  setPrompt: (v: string) => void;
  setAspectRatio: (v: AspectRatio) => void;
  setResolution: (v: number) => void;
  setSteps: (v: number) => void;
  setSeed: (v: number) => void;
  setLowRam: (v: boolean) => void;
  setImage: (img: AdvancedImage | null) => void;
  clearResult: () => void;
  generate: (projectId: string) => Promise<void>;
  reset: () => void;
}

const initialState = {
  prompt: "",
  aspectRatio: "1:1" as AspectRatio,
  resolution: 1000,
  steps: 8,
  seed: 42,
  lowRam: false,
  image: null as AdvancedImage | null,
  generating: false,
  result: null as string | null,
  error: null as string | null,
  logs: [] as string[],
};

export const useAdvancedImageEditStore = create<AdvancedImageEditStore>(
  (set, get) => ({
    ...initialState,

    setPrompt: (prompt) => set({ prompt, error: null }),
    setAspectRatio: (aspectRatio) => set({ aspectRatio }),
    setResolution: (resolution) => set({ resolution }),
    setSteps: (steps) =>
      set({ steps: Math.max(1, Math.round(Number(steps)) || 1) }),
    setSeed: (seed) => set({ seed: Math.round(Number(seed)) || 0 }),
    setLowRam: (lowRam) => set({ lowRam }),
    setImage: (image) => set({ image, error: null }),
    clearResult: () => set({ result: null, error: null, logs: [] }),

    generate: async (projectId) => {
      const { prompt, aspectRatio, resolution, steps, seed, lowRam, image, generating } =
        get();
      if (generating || !image) return;

      if (!prompt.trim()) {
        set({ error: "Prompt is required" });
        return;
      }

      const { width, height } = getDimensions(aspectRatio, resolution);

      set({ generating: true, error: null, result: null, logs: [] });

      try {
        const res = await fetch(`${API_BASE}/api/mlxgen/advanced-image-edit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: prompt.trim(),
            imagePath: image.filename,
            projectId,
            width,
            height,
            steps,
            seed,
            lowRam,
          }),
        });

        if (!res.ok) {
          const err = await res.text();
          set({ generating: false, error: err });
          return;
        }

        await readSSEStream(res, (event, data) => {
          switch (event) {
            case "log":
              set((s) => ({ logs: [...s.logs, data.text as string] }));
              break;
            case "complete":
              set({
                generating: false,
                result: `/api/files?path=${encodeURIComponent(data.path)}`,
              });
              break;
            case "error":
              set({
                generating: false,
                error: data.error || "Image edit failed",
              });
              break;
          }
        });
      } catch (e) {
        set({ generating: false, error: String(e) });
      }
    },

    reset: () => set({ ...initialState }),
  }),
);
