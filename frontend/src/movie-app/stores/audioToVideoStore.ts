import { create } from "zustand";
import type { QueueTask } from "./queueStore";

const API_BASE = `http://localhost:${(window as any).PORT}`;

export interface AssetFile {
  filename: string;
  url: string;
}

function resolveUrl(url: string): string {
  return url.startsWith("http") ? url : `${API_BASE}${url}`;
}

interface AudioToVideoStore {
  image: AssetFile | null;
  audio: AssetFile | null;
  images: AssetFile[];
  audios: AssetFile[];
  imagesLoading: boolean;
  audiosLoading: boolean;
  uploadingImage: boolean;
  uploadingAudio: boolean;
  steps: number;
  prompt: string;
  generating: boolean;
  result: string | null;
  error: string | null;

  setImage: (a: AssetFile | null) => void;
  setAudio: (a: AssetFile | null) => void;
  setSteps: (n: number) => void;
  setPrompt: (p: string) => void;
  clearResult: () => void;
  fetchImages: (projectId: string) => Promise<void>;
  fetchAudios: (projectId: string) => Promise<void>;
  uploadImage: (
    projectId: string,
    base64: string,
    filename: string,
  ) => Promise<void>;
  uploadAudio: (
    projectId: string,
    base64: string,
    filename: string,
  ) => Promise<void>;
  generate: (projectId: string) => Promise<void>;
  applyQueueTask: (task: QueueTask) => void;
  reset: () => void;
}

/** The queue task id enqueued by the current generate action, if any. */
let audioToVideoActiveTaskId: string | null = null;

async function enqueueAudioToVideoTask(
  projectId: string,
  imagePath: string,
  audioPath: string,
  prompt: string,
  stage1Steps: number,
): Promise<{ ok: boolean; error?: string; taskId?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/queue/enqueue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        type: "audio-to-video",
        label: "Audio to video",
        payload: { imagePath, audioPath, prompt, stage1Steps },
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

export const useAudioToVideoStore = create<AudioToVideoStore>((set, get) => ({
  image: null,
  audio: null,
  images: [],
  audios: [],
  imagesLoading: false,
  audiosLoading: false,
  uploadingImage: false,
  uploadingAudio: false,
  steps: 15,
  prompt: "",
  generating: false,
  result: null,
  error: null,

  setImage: (image) => set({ image, error: null }),
  setAudio: (audio) => set({ audio, error: null }),
  setSteps: (steps) =>
    set({ steps: Math.max(1, Math.round(Number(steps)) || 1), error: null }),
  setPrompt: (prompt) => set({ prompt, error: null }),
  clearResult: () => set({ result: null, error: null }),

  fetchImages: async (projectId) => {
    set({ imagesLoading: true });
    try {
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/images`);
      if (!res.ok) throw new Error(await res.text());
      const images: AssetFile[] = await res.json();
      set({
        images: images.map((i) => ({ ...i, url: resolveUrl(i.url) })),
        imagesLoading: false,
      });
    } catch {
      set({ imagesLoading: false });
    }
  },

  fetchAudios: async (projectId) => {
    set({ audiosLoading: true });
    try {
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/audios`);
      if (!res.ok) throw new Error(await res.text());
      const audios: AssetFile[] = await res.json();
      set({
        audios: audios.map((a) => ({ ...a, url: resolveUrl(a.url) })),
        audiosLoading: false,
      });
    } catch {
      set({ audiosLoading: false });
    }
  },

  uploadImage: async (projectId, base64, filename) => {
    set({ uploadingImage: true, error: null });
    try {
      const res = await fetch(`${API_BASE}/api/upload/image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64, filename, projectId }),
      });
      if (!res.ok) {
        set({ uploadingImage: false, error: await res.text() });
        return;
      }
      const data = await res.json();
      set({
        uploadingImage: false,
        image: {
          filename: data.filename,
          url: resolveUrl(
            `/api/files?path=${encodeURIComponent(data.path)}`,
          ),
        },
      });
      void get().fetchImages(projectId);
    } catch (e) {
      set({ uploadingImage: false, error: String(e) });
    }
  },

  uploadAudio: async (projectId, base64, filename) => {
    set({ uploadingAudio: true, error: null });
    try {
      const res = await fetch(`${API_BASE}/api/upload/audio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio: base64, filename, projectId }),
      });
      if (!res.ok) {
        set({ uploadingAudio: false, error: await res.text() });
        return;
      }
      const data = await res.json();
      set({
        uploadingAudio: false,
        audio: {
          filename: data.filename,
          url: resolveUrl(
            `/api/files?path=${encodeURIComponent(data.path)}`,
          ),
        },
      });
      void get().fetchAudios(projectId);
    } catch (e) {
      set({ uploadingAudio: false, error: String(e) });
    }
  },

  generate: async (projectId) => {
    const { image, audio, prompt, steps, generating } = get();
    if (generating || !image || !audio) return;

    set({ generating: true, error: null, result: null });

    const r = await enqueueAudioToVideoTask(
      projectId,
      image.filename,
      audio.filename,
      prompt.trim(),
      steps,
    );
    audioToVideoActiveTaskId = r.taskId ?? null;
    if (!r.ok) {
      set({
        generating: false,
        error: r.error ?? "Failed to enqueue audio-to-video",
      });
    }
  },

  // Reconcile the audio-to-video state with the latest queue task state. Only the
  // task enqueued by this tab is reflected, so past tasks never surface stale results.
  applyQueueTask: (task) => {
    if (task.type !== "audio-to-video") return;
    if (task.id !== audioToVideoActiveTaskId) return;

    if (task.status === "completed") {
      const url = task.result?.url;
      set({
        generating: false,
        result: url ? resolveUrl(url) : null,
        error: null,
      });
    } else if (task.status === "failed") {
      set({ generating: false, error: task.error ?? "Audio-to-video failed" });
    } else if (task.status === "cancelled" || task.status === "paused") {
      set({ generating: false, error: null });
    } else {
      // pending / running
      set({ generating: true, error: null });
    }
  },

  reset: () => {
    audioToVideoActiveTaskId = null;
    set({
      image: null,
      audio: null,
      images: [],
      audios: [],
      imagesLoading: false,
      audiosLoading: false,
      uploadingImage: false,
      uploadingAudio: false,
      steps: 15,
      prompt: "",
      generating: false,
      result: null,
      error: null,
    });
  },
}));
