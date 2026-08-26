import { create } from "zustand";
import type { AspectRatio } from "./generationStore";
import type { QueueTask } from "./queueStore";

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
  applyQueueTask: (task: QueueTask) => void;
  reset: () => void;
}

/** The queue task id enqueued by the current generate action, if any. */
let advancedImageEditActiveTaskId: string | null = null;

async function enqueueAdvancedImageEditTask(
  projectId: string,
  prompt: string,
  imagePath: string,
  width: number,
  height: number,
  steps: number,
  seed: number,
  lowRam: boolean,
): Promise<{ ok: boolean; error?: string; taskId?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/queue/enqueue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        type: "advanced-image-edit",
        label: "Advanced image edit",
        payload: { prompt, imagePath, width, height, steps, seed, lowRam, projectId },
      }),
    });
    if (!res.ok) {
      return { ok: false, error: await res.text() };
    }
    const task = (await res.json()) as { id?: string };
    return { ok: true, taskId: task.id };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
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

      const r = await enqueueAdvancedImageEditTask(
        projectId,
        prompt.trim(),
        image.filename,
        width,
        height,
        steps,
        seed,
        lowRam,
      );
      advancedImageEditActiveTaskId = r.taskId ?? null;
      if (!r.ok) {
        set({
          generating: false,
          error: r.error ?? "Failed to enqueue image edit",
        });
      }
    },

    // Reconcile state with the latest queue task (only the task this tab
    // enqueued is reflected).
    applyQueueTask: (task) => {
      if (task.type !== "advanced-image-edit") return;
      if (task.id !== advancedImageEditActiveTaskId) return;

      if (task.status === "completed") {
        const url = task.result?.url;
        set({
          generating: false,
          result: url ? String(url) : null,
          error: null,
        });
      } else if (
        task.status === "failed" ||
        task.status === "cancelled" ||
        task.status === "paused"
      ) {
        set({ generating: false, error: task.error ?? "Image edit failed" });
      } else {
        // pending / running
        set({ generating: true, error: null });
      }
    },

    reset: () => {
      advancedImageEditActiveTaskId = null;
      set({ ...initialState });
    },
  }),
);
