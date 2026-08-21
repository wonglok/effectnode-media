import { create } from "zustand";
import type { QueueTask } from "./queueStore";

const API_BASE = `http://localhost:${(window as any).PORT}`;

export type UpscaleMode = "1x" | "2048";

export interface UpscaleImage {
  filename: string;
  url: string;
}

function resolveUrl(url: string): string {
  return url.startsWith("http") ? url : `${API_BASE}${url}`;
}

interface UpscaleStore {
  mode: UpscaleMode;
  image: UpscaleImage | null;
  generating: boolean;
  result: string | null;
  error: string | null;

  setMode: (mode: UpscaleMode) => void;
  setImage: (image: UpscaleImage | null) => void;
  clearResult: () => void;
  generate: (projectId: string) => Promise<void>;
  applyQueueTask: (task: QueueTask) => void;
  reset: () => void;
}

/** The queue task id enqueued by the current generate action, if any. */
let upscaleActiveTaskId: string | null = null;

async function enqueueUpscaleTask(
  projectId: string,
  imagePath: string,
  resolution: UpscaleMode,
): Promise<{ ok: boolean; error?: string; taskId?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/queue/enqueue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        type: "upscale",
        label: `Upscale image (${resolution})`,
        payload: { imagePath, resolution },
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

export const useUpscaleStore = create<UpscaleStore>((set, get) => ({
  mode: "1x",
  image: null,
  generating: false,
  result: null,
  error: null,

  setMode: (mode) => set({ mode, error: null }),
  setImage: (image) => set({ image, error: null }),
  clearResult: () => set({ result: null, error: null }),

  generate: async (projectId) => {
    const { image, mode, generating } = get();
    if (generating || !image) return;

    set({ generating: true, error: null, result: null });

    const r = await enqueueUpscaleTask(projectId, image.filename, mode);
    upscaleActiveTaskId = r.taskId ?? null;
    if (!r.ok) {
      set({ generating: false, error: r.error ?? "Failed to enqueue upscale" });
    }
  },

  // Reconcile the upscale state with the latest queue task state. Only the task
  // enqueued by this tab is reflected, so past tasks never surface stale results.
  applyQueueTask: (task) => {
    if (task.type !== "upscale") return;
    if (task.id !== upscaleActiveTaskId) return;

    if (task.status === "completed") {
      const url = task.result?.url;
      set({
        generating: false,
        result: url ? resolveUrl(url) : null,
        error: null,
      });
    } else if (task.status === "failed") {
      set({ generating: false, error: task.error ?? "Upscale failed" });
    } else if (task.status === "cancelled" || task.status === "paused") {
      set({ generating: false, error: null });
    } else {
      // pending / running
      set({ generating: true, error: null });
    }
  },

  reset: () => {
    upscaleActiveTaskId = null;
    set({
      mode: "1x",
      image: null,
      generating: false,
      result: null,
      error: null,
    });
  },
}));
