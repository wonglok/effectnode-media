import { create } from "zustand";
import {
  clearReferencesToVideoState,
  loadReferencesToVideoState,
  saveReferencesToVideoState,
  type PersistedReferencesToVideoState,
} from "../lib/referencesToVideoStorage";

const API_BASE = `http://localhost:${(window as any).PORT}`;

// Abort controller for the in-flight generation request, so it can be cancelled.
let generateAbortController: AbortController | null = null;

export type ReferenceKind = "image" | "video" | "audio";

export interface ReferenceRef {
  kind: ReferenceKind;
  filename: string | null;
}

interface ReferencesToVideoStore {
  // Model download
  downloading: boolean;
  downloaded: boolean;
  error: string | null;
  logs: string[];

  // Generation parameters
  prompt: string;
  steps: number;
  width: number;
  height: number;
  seconds: number;
  seed: number;

  // Reference media (ordered list of image/video references)
  refs: ReferenceRef[];

  // Generation state
  generating: boolean;
  result: string | null;
  genError: string | null;
  genLogs: string[];

  // Persistence
  projectId: string | null;
  hydrated: boolean;
  hydrate: (projectId: string) => Promise<void>;
  clear: () => void;

  checkStatus: () => Promise<void>;
  downloadModel: () => Promise<void>;

  setPrompt: (v: string) => void;
  setSteps: (v: number) => void;
  setWidth: (v: number) => void;
  setHeight: (v: number) => void;
  setSeconds: (v: number) => void;
  setSeed: (v: number) => void;

  addRef: (kind: ReferenceKind) => void;
  removeRef: (index: number) => void;
  setRefFilename: (index: number, filename: string) => void;
  uploadVideo: (
    base64: string,
    filename: string,
    projectId: string,
  ) => Promise<string | null>;
  uploadAudio: (
    base64: string,
    filename: string,
    projectId: string,
  ) => Promise<string | null>;

  generate: (projectId: string) => Promise<void>;
  cancelGenerate: () => void;

  reset: () => void;
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

function makeDefaultRefs(): ReferenceRef[] {
  return [
    { kind: "image", filename: null },
    { kind: "image", filename: null },
  ];
}

function toPersistedState(
  s: Pick<
    ReferencesToVideoStore,
    "prompt" | "steps" | "width" | "height" | "seconds" | "seed" | "refs"
  >,
): PersistedReferencesToVideoState {
  return {
    prompt: s.prompt,
    steps: s.steps,
    width: s.width,
    height: s.height,
    seconds: s.seconds,
    seed: s.seed,
    refs: s.refs.map((r) => ({ kind: r.kind, filename: r.filename })),
  };
}

// Fire-and-forget save of the current editable UI state.
function persistReferencesState() {
  const { projectId } = useReferencesToVideoStore.getState();
  if (!projectId) return;
  void saveReferencesToVideoState(
    projectId,
    toPersistedState(useReferencesToVideoStore.getState()),
  );
}

export const useReferencesToVideoStore = create<ReferencesToVideoStore>(
  (set, get) => ({
    // Model download
    downloading: false,
    downloaded: false,
    error: null,
    logs: [],

    // Generation parameters
    prompt:
      "with voice [audio1], [image1] say Ghost reporting , ready for combat.",
    steps: 30,
    width: 640,
    height: 320,
    seconds: 10,
    seed: 42,

    // Reference media
    refs: [
      { kind: "image", filename: null },
      { kind: "image", filename: null },
    ],

    // Generation state
    generating: false,
    result: null,
    genError: null,
    genLogs: [],

    projectId: null,
    hydrated: false,

    hydrate: async (projectId) => {
      // No-op if we've already hydrated for this project.
      if (get().hydrated && get().projectId === projectId) return;

      // Switching to a different project: reset to defaults so refs and
      // settings from the previous project don't leak through.
      const previous = get().projectId;
      if (previous !== null && previous !== projectId) {
        get().reset();
      }
      set({ hydrated: true, projectId });

      const stored = await loadReferencesToVideoState(projectId);
      if (!stored) return;

      set((s) => ({
        prompt: stored.prompt ?? s.prompt,
        steps: stored.steps ?? s.steps,
        width: stored.width ?? s.width,
        height: stored.height ?? s.height,
        seconds: stored.seconds ?? s.seconds,
        seed: stored.seed ?? s.seed,
        refs: stored.refs?.length
          ? stored.refs.map((r) => ({
              kind: r.kind,
              filename: r.filename ?? null,
            }))
          : s.refs,
      }));
    },

    clear: () => {
      const { projectId } = get();
      get().reset();
      if (projectId) void clearReferencesToVideoState(projectId);
    },

    checkStatus: async () => {
      try {
        const res = await fetch(`${API_BASE}/api/h3/status`);
        if (!res.ok) return;
        const data = await res.json();
        set({ downloaded: Boolean(data.downloaded) });
      } catch {
        // Leave status unchanged if the check fails.
      }
    },

    downloadModel: async () => {
      if (get().downloading) return;

      set({ downloading: true, error: null, logs: [] });

      try {
        const res = await fetch(`${API_BASE}/api/h3/download-model`, {
          method: "POST",
        });

        if (!res.ok) {
          const err = await res.text();
          set({ downloading: false, error: err });
          return;
        }

        await readSSEStream(res, (event, data) => {
          switch (event) {
            case "log":
              set((s) => ({ logs: [...s.logs, data.text as string] }));
              break;
            case "complete":
              set({ downloading: false, downloaded: true });
              break;
            case "error":
              set({
                downloading: false,
                error: data.error || "Model download failed",
              });
              break;
          }
        });
      } catch (e) {
        set({ downloading: false, error: String(e) });
      }
    },

    setPrompt: (prompt) => {
      set({ prompt });
      persistReferencesState();
    },
    setSteps: (steps) => {
      set({ steps });
      persistReferencesState();
    },
    setWidth: (width) => {
      set({ width });
      persistReferencesState();
    },
    setHeight: (height) => {
      set({ height });
      persistReferencesState();
    },
    setSeconds: (seconds) => {
      set({ seconds });
      persistReferencesState();
    },
    setSeed: (seed) => {
      set({ seed });
      persistReferencesState();
    },

    addRef: (kind) => {
      set((s) => ({ refs: [...s.refs, { kind, filename: null }] }));
      persistReferencesState();
    },

    removeRef: (index) => {
      set((s) => ({ refs: s.refs.filter((_, i) => i !== index) }));
      persistReferencesState();
    },

    setRefFilename: (index, filename) => {
      set((s) => ({
        refs: s.refs.map((r, i) => (i === index ? { ...r, filename } : r)),
      }));
      persistReferencesState();
    },

    uploadVideo: async (base64, filename, projectId) => {
      try {
        const res = await fetch(`${API_BASE}/api/upload/video`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            video: base64,
            filename: filename || `upload-${Date.now()}.mp4`,
            projectId,
          }),
        });

        if (!res.ok) {
          const err = await res.text();
          set({ genError: err });
          return null;
        }

        const data = await res.json();
        return data.filename as string;
      } catch (e) {
        set({ genError: String(e) });
        return null;
      }
    },

    uploadAudio: async (base64, filename, projectId) => {
      try {
        const res = await fetch(`${API_BASE}/api/upload/audio`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audio: base64,
            filename: filename || `upload-${Date.now()}.mp3`,
            projectId,
          }),
        });

        if (!res.ok) {
          const err = await res.text();
          set({ genError: err });
          return null;
        }

        const data = await res.json();
        return data.filename as string;
      } catch (e) {
        set({ genError: String(e) });
        return null;
      }
    },

    generate: async (projectId) => {
      if (get().generating) return;

      const { prompt, steps, width, height, seconds, seed, refs } = get();

      const resolvedRefs = refs
        .filter(
          (r): r is { kind: ReferenceKind; filename: string } =>
            !!r.filename && !!r.filename.trim(),
        )
        .map((r) => ({ kind: r.kind, filename: r.filename.trim() }));

      // Frame count derived from duration at 24fps (+1 keyframe).
      const frames = Math.max(1, Math.round(24 * seconds + 1));

      // Fresh AbortController so this run can be cancelled independently.
      generateAbortController = new AbortController();
      const signal = generateAbortController.signal;

      set({ generating: true, genError: null, genLogs: [], result: null });

      try {
        const res = await fetch(`${API_BASE}/api/h3/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: prompt.trim(),
            refs: resolvedRefs,
            projectId,
            steps,
            width,
            height,
            frames,
            seed,
          }),
          signal,
        });

        if (!res.ok) {
          const err = await res.text();
          set({ generating: false, genError: err });
          return;
        }

        await readSSEStream(res, (event, data) => {
          switch (event) {
            case "log":
              set((s) => ({ genLogs: [...s.genLogs, data.text as string] }));
              break;
            case "complete":
              set({
                generating: false,
                result: `http://localhost:${(window as any).PORT}/api/files?path=${encodeURIComponent(data.path)}`,
              });
              break;
            case "error":
              set({
                generating: false,
                genError: data.error || "Generation failed",
              });
              break;
          }
        });
      } catch (e: any) {
        // If the request was aborted, just stop silently (cancel already reset state).
        if (e?.name !== "AbortError") {
          set({ generating: false, genError: String(e) });
        } else {
          set({ generating: false });
        }
      } finally {
        generateAbortController = null;
      }
    },

    cancelGenerate: () => {
      if (generateAbortController) {
        generateAbortController.abort();
        generateAbortController = null;
      }
      // Immediately reset generating state so the UI returns to ready.
      set({ generating: false });
      // Also kill the backend spawn process.
      fetch(`${API_BASE}/api/render/cancel`, { method: "POST" }).catch(
        () => {},
      );
    },

    reset: () =>
      set({
        prompt: "[image1] is dancing at [image2]",
        steps: 10,
        width: 320,
        height: 320,
        seconds: 3,
        seed: 42,
        refs: makeDefaultRefs(),
        generating: false,
        result: null,
        genError: null,
        genLogs: [],
      }),
  }),
);
