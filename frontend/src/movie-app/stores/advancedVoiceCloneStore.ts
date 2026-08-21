import { create } from "zustand";
import type { QueueTask } from "./queueStore";

const API_BASE = `http://localhost:${(window as any).PORT}`;

export interface VoiceAudio {
  filename: string;
  url: string;
}

function resolveUrl(url: string): string {
  return url.startsWith("http") ? url : `${API_BASE}${url}`;
}

interface AdvancedVoiceCloneStore {
  text: string;
  language: string;
  outPrefix: string;
  model: string;
  refAudio: VoiceAudio | null;
  audios: VoiceAudio[];
  audiosLoading: boolean;
  uploading: boolean;
  generating: boolean;
  result: string | null;
  error: string | null;

  setText: (t: string) => void;
  setLanguage: (l: string) => void;
  setOutPrefix: (p: string) => void;
  setModel: (m: string) => void;
  setRefAudio: (a: VoiceAudio | null) => void;
  clearResult: () => void;
  fetchAudios: (projectId: string) => Promise<void>;
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
let advancedVoiceCloneActiveTaskId: string | null = null;

async function enqueueAdvancedVoiceCloneTask(
  projectId: string,
  text: string,
  refAudioPath: string,
  language: string,
  outPrefix: string,
  model: string,
): Promise<{ ok: boolean; error?: string; taskId?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/queue/enqueue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        type: "advanced-voice-clone",
        label: "Advanced voice clone",
        payload: { text, refAudioPath, language, outPrefix, model },
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

export const useAdvancedVoiceCloneStore = create<AdvancedVoiceCloneStore>(
  (set, get) => ({
    text: "",
    language: "YUE",
    outPrefix: "voice",
    model: "./dots-tts-mlx-weights/int4",
    refAudio: null,
    audios: [],
    audiosLoading: false,
    uploading: false,
    generating: false,
    result: null,
    error: null,

    setText: (text) => set({ text, error: null }),
    setLanguage: (language) => set({ language, error: null }),
    setOutPrefix: (outPrefix) => set({ outPrefix, error: null }),
    setModel: (model) => set({ model, error: null }),
    setRefAudio: (refAudio) => set({ refAudio, error: null }),
    clearResult: () => set({ result: null, error: null }),

    fetchAudios: async (projectId) => {
      set({ audiosLoading: true });
      try {
        const res = await fetch(`${API_BASE}/api/projects/${projectId}/audios`);
        if (!res.ok) throw new Error(await res.text());
        const audios: VoiceAudio[] = await res.json();
        set({
          audios: audios.map((a) => ({ ...a, url: resolveUrl(a.url) })),
          audiosLoading: false,
        });
      } catch {
        set({ audiosLoading: false });
      }
    },

    uploadAudio: async (projectId, base64, filename) => {
      set({ uploading: true, error: null });
      try {
        const res = await fetch(`${API_BASE}/api/upload/audio`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audio: base64, filename, projectId }),
        });
        if (!res.ok) {
          set({ uploading: false, error: await res.text() });
          return;
        }
        const data = await res.json();
        set({
          uploading: false,
          refAudio: {
            filename: data.filename,
            url: resolveUrl(`/api/files?path=${encodeURIComponent(data.path)}`),
          },
        });
        void get().fetchAudios(projectId);
      } catch (e) {
        set({ uploading: false, error: String(e) });
      }
    },

    generate: async (projectId) => {
      const { text, refAudio, language, outPrefix, model, generating } = get();
      if (generating || !refAudio || !text.trim()) return;

      set({ generating: true, error: null, result: null });

      const r = await enqueueAdvancedVoiceCloneTask(
        projectId,
        text.trim(),
        refAudio.filename,
        language,
        outPrefix,
        model,
      );
      advancedVoiceCloneActiveTaskId = r.taskId ?? null;
      if (!r.ok) {
        set({
          generating: false,
          error: r.error ?? "Failed to enqueue advanced voice clone",
        });
      }
    },

    // Reconcile state with the latest queue task state. Only the task enqueued by
    // this tab is reflected, so past tasks never surface stale results.
    applyQueueTask: (task) => {
      if (task.type !== "advanced-voice-clone") return;
      if (task.id !== advancedVoiceCloneActiveTaskId) return;

      if (task.status === "completed") {
        const url = task.result?.url;
        set({
          generating: false,
          result: url ? resolveUrl(url) : null,
          error: null,
        });
      } else if (task.status === "failed") {
        set({
          generating: false,
          error: task.error ?? "Advanced voice clone failed",
        });
      } else if (task.status === "cancelled" || task.status === "paused") {
        set({ generating: false, error: null });
      } else {
        // pending / running
        set({ generating: true, error: null });
      }
    },

    reset: () => {
      advancedVoiceCloneActiveTaskId = null;
      set({
        text: "",
        language: "YUE",
        outPrefix: "voice",
        model: "./dots-tts-mlx-weights/int4",
        refAudio: null,
        audios: [],
        audiosLoading: false,
        uploading: false,
        generating: false,
        result: null,
        error: null,
      });
    },
  }),
);
