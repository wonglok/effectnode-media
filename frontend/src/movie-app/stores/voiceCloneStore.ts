import { create } from "zustand";
import type { QueueTask } from "./queueStore";

const API_BASE = "";

export type VoiceQuality = "low" | "high";

export interface VoiceAudio {
  filename: string;
  url: string;
}

export interface GeneratedVoice {
  id: string;
  transcript: string;
  quality: string;
  refAudioFilename: string | null;
  filename: string;
  createdAt: string | null;
  url: string;
}

function resolveUrl(url: string): string {
  return url.startsWith("http") ? url : `${API_BASE}${url}`;
}

interface VoiceCloneStore {
  quality: VoiceQuality;
  transcript: string;
  refAudio: VoiceAudio | null;
  audios: VoiceAudio[];
  audiosLoading: boolean;
  voices: GeneratedVoice[];
  voicesLoading: boolean;
  uploading: boolean;
  generating: boolean;
  result: string | null;
  error: string | null;

  setQuality: (q: VoiceQuality) => void;
  setTranscript: (t: string) => void;
  setRefAudio: (a: VoiceAudio | null) => void;
  clearResult: () => void;
  fetchAudios: (projectId: string) => Promise<void>;
  fetchVoices: (projectId: string) => Promise<void>;
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
let voiceCloneActiveTaskId: string | null = null;

/** Project whose voice-clone task should refresh the generated list on completion. */
let voiceCloneProjectId: string | null = null;

async function enqueueVoiceCloneTask(
  projectId: string,
  text: string,
  refAudioPath: string,
  quality: VoiceQuality,
): Promise<{ ok: boolean; error?: string; taskId?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/queue/enqueue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        type: "voice-clone",
        label: "Voice clone",
        payload: { text, refAudioPath, quality },
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

export const useVoiceCloneStore = create<VoiceCloneStore>((set, get) => ({
  quality: "high",
  transcript: "",
  refAudio: null,
  audios: [],
  audiosLoading: false,
  voices: [],
  voicesLoading: false,
  uploading: false,
  generating: false,
  result: null,
  error: null,

  setQuality: (quality) => set({ quality, error: null }),
  setTranscript: (transcript) => set({ transcript, error: null }),
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

  fetchVoices: async (projectId) => {
    set({ voicesLoading: true });
    try {
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/voices`);
      if (!res.ok) throw new Error(await res.text());
      const voices: GeneratedVoice[] = await res.json();
      set({
        voices: voices.map((v) => ({ ...v, url: resolveUrl(v.url) })),
        voicesLoading: false,
      });
    } catch {
      set({ voicesLoading: false });
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
          url: resolveUrl(
            `/api/files?path=${encodeURIComponent(data.path)}`,
          ),
        },
      });
      void get().fetchAudios(projectId);
    } catch (e) {
      set({ uploading: false, error: String(e) });
    }
  },

  generate: async (projectId) => {
    const { refAudio, transcript, quality, generating } = get();
    if (generating || !refAudio || !transcript.trim()) return;

    set({ generating: true, error: null, result: null });

    voiceCloneProjectId = projectId;
    const r = await enqueueVoiceCloneTask(
      projectId,
      transcript.trim(),
      refAudio.filename,
      quality,
    );
    voiceCloneActiveTaskId = r.taskId ?? null;
    if (!r.ok) {
      set({ generating: false, error: r.error ?? "Failed to enqueue voice clone" });
    }
  },

  // Reconcile the voice clone state with the latest queue task state. Only the
  // task enqueued by this tab is reflected, so past tasks never surface stale results.
  applyQueueTask: (task) => {
    if (task.type !== "voice-clone") return;
    if (task.id !== voiceCloneActiveTaskId) return;

    if (task.status === "completed") {
      const url = task.result?.url;
      set({
        generating: false,
        result: url ? resolveUrl(url) : null,
        error: null,
      });
      if (voiceCloneProjectId) {
        void get().fetchVoices(voiceCloneProjectId);
      }
    } else if (task.status === "failed") {
      set({ generating: false, error: task.error ?? "Voice clone failed" });
    } else if (task.status === "cancelled" || task.status === "paused") {
      set({ generating: false, error: null });
    } else {
      // pending / running
      set({ generating: true, error: null });
    }
  },

  reset: () => {
    voiceCloneActiveTaskId = null;
    voiceCloneProjectId = null;
    set({
      quality: "high",
      transcript: "",
      refAudio: null,
      audios: [],
      audiosLoading: false,
      voices: [],
      voicesLoading: false,
      uploading: false,
      generating: false,
      result: null,
      error: null,
    });
  },
}));
