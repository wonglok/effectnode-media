import { create } from "zustand";
import Papa from "papaparse";
import type {
  AspectRatio,
  Resolution,
  VideoMode,
} from "./generationStore";
import {
  clearBatchImageToVideoState,
  loadBatchImageToVideoState,
  saveBatchImageToVideoState,
  type PersistedBatchImageToVideoState,
} from "../lib/batchImageToVideoStorage";

const API_BASE = `http://localhost:${(window as any).PORT}`;

export type BatchI2VRowStatus = "idle" | "generating" | "done" | "error";

export interface BatchI2VRow {
  id: string;
  // Text-to-image prompt (drives the starting image)
  t2iPrompt: string;
  // Image-to-video prompt (drives the motion on top of the generated image)
  i2vPrompt: string;
  // Optional per-row video duration override (seconds); null = use shared.
  duration: number | null;
  imagePath: string | null;
  imageUrl: string | null;
  imageFilename: string | null;
  imageStatus: BatchI2VRowStatus;
  videoResult: string | null;
  videoStatus: BatchI2VRowStatus;
  error: string | null;
}

interface BatchImageToVideoStore {
  rows: BatchI2VRow[];

  // Shared settings (image + video share the same aspect ratio / resolution)
  aspectRatio: AspectRatio;
  resolution: Resolution;
  duration: number;
  mode: VideoMode;

  running: boolean;
  progress: { current: number; total: number } | null;
  cancelRequested: boolean;
  logs: string[];

  // Persistence
  projectId: string | null;
  hydrated: boolean;
  hydrate: (projectId: string) => Promise<void>;
  clear: () => void;

  addRow: () => void;
  removeRow: (id: string) => void;
  updateT2IPrompt: (id: string, v: string) => void;
  updateI2VPrompt: (id: string, v: string) => void;
  updateRowDuration: (id: string, duration: number | null) => void;
  uploadCsv: (base64: string, filename: string) => void;
  parseCsvText: (text: string) => void;

  setAspectRatio: (v: AspectRatio) => void;
  setResolution: (v: Resolution) => void;
  setDuration: (v: number) => void;
  setMode: (v: VideoMode) => void;

  generateAllImages: (projectId: string) => Promise<void>;
  generateAllVideos: (projectId: string) => Promise<void>;
  generateAll: (projectId: string) => Promise<void>;
  regenerateImage: (projectId: string, rowId: string) => Promise<void>;
  regenerateVideo: (projectId: string, rowId: string) => Promise<void>;
  regenerateBoth: (projectId: string, rowId: string) => Promise<void>;
  cancel: () => void;

  reset: () => void;
}

let batchAbortController: AbortController | null = null;

function getDimensions(
  aspect: AspectRatio,
  resolution: Resolution,
): { width: number; height: number } {
  const size = parseInt(resolution);
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

// The image-to-video backend only accepts a bare filename, so normalise any
// path / file URL / api-files URL down to just the basename.
function normalizeImagePath(path: string): string {
  let p = path;
  if (p.includes("/api/files?path=")) {
    try {
      const url = new URL(p);
      p = url.searchParams.get("path") || p;
    } catch {
      // not a valid URL, use as-is
    }
  }
  if (p.startsWith("file://")) {
    p = p.slice(7);
  }
  return p.split("/").pop() || p;
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

function playBeep() {
  try {
    const ctx = new (
      window.AudioContext || (window as any).webkitAudioContext
    )();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch {
    // silently ignore if audio not available
  }
}

function makeRow(): BatchI2VRow {
  return {
    id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    t2iPrompt: "",
    i2vPrompt: "",
    duration: null,
    imagePath: null,
    imageUrl: null,
    imageFilename: null,
    imageStatus: "idle",
    videoResult: null,
    videoStatus: "idle",
    error: null,
  };
}

/** Parse raw CSV text (t2i / i2v columns) into batch rows. */
function parseCsvRows(text: string): BatchI2VRow[] {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });
  return parsed.data
    .filter((r) => (r.t2i || "").trim() || (r.i2v || "").trim())
    .map((r) => {
      const rawDuration = String(r.duration ?? "").trim().replace(/s$/i, "");
      const parsedDuration = rawDuration ? Number(rawDuration) : NaN;
      return {
        id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        t2iPrompt: (r.t2i || "").trim(),
        i2vPrompt: (r.i2v || "").trim(),
        duration:
          Number.isFinite(parsedDuration) && parsedDuration > 0
            ? parsedDuration
            : null,
        imagePath: null,
        imageUrl: null,
        imageFilename: null,
        imageStatus: "idle",
        videoResult: null,
        videoStatus: "idle",
        error: null,
      };
    });
}

function toPersistedState(
  s: Pick<
    BatchImageToVideoStore,
    "rows" | "aspectRatio" | "resolution" | "duration" | "mode"
  >,
): PersistedBatchImageToVideoState {
  return {
    rows: s.rows.map((r) => ({
      id: r.id,
      t2iPrompt: r.t2iPrompt,
      i2vPrompt: r.i2vPrompt,
      duration: r.duration ?? null,
    })),
    aspectRatio: s.aspectRatio,
    resolution: s.resolution,
    duration: s.duration,
    mode: s.mode,
  };
}

function persistBatchState() {
  const { projectId } = useBatchImageToVideoStore.getState();
  if (!projectId) return;
  void saveBatchImageToVideoState(
    projectId,
    toPersistedState(useBatchImageToVideoStore.getState()),
  );
}

// ========== Generation helpers (module-level, using store getState/setState) ==========

async function runImageGeneration(
  projectId: string,
  rowId: string,
  settings: { aspect: AspectRatio; width: number; height: number },
  signal: AbortSignal,
  onLog: (text: string) => void,
): Promise<string | null> {
  const row = useBatchImageToVideoStore
    .getState()
    .rows.find((r) => r.id === rowId);
  if (!row) return null;

  useBatchImageToVideoStore.setState((s) => ({
    rows: s.rows.map((r) =>
      r.id === rowId ? { ...r, imageStatus: "generating", error: null } : r,
    ),
  }));

  const res = await fetch(`${API_BASE}/api/render/text-to-image`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: row.t2iPrompt.trim(),
      projectId,
      aspect: settings.aspect,
      width: settings.width,
      height: settings.height,
      device: "mps",
    }),
    signal,
  });

  if (!res.ok) {
    const err = await res.text();
    useBatchImageToVideoStore.setState((s) => ({
      rows: s.rows.map((r) =>
        r.id === rowId ? { ...r, imageStatus: "error", error: err } : r,
      ),
    }));
    return null;
  }

  let imagePath: string | null = null;
  await readSSEStream(res, (event, data) => {
    switch (event) {
      case "log":
        onLog(data.text as string);
        break;
      case "complete":
        imagePath = data.path as string;
        useBatchImageToVideoStore.setState((s) => ({
          rows: s.rows.map((r) =>
            r.id === rowId
              ? {
                  ...r,
                  imageStatus: "done",
                  imagePath: data.path,
                  imageUrl: `http://localhost:${(window as any).PORT}/api/files?path=${encodeURIComponent(data.path)}`,
                  imageFilename: data.filename,
                }
              : r,
          ),
        }));
        break;
      case "error":
        useBatchImageToVideoStore.setState((s) => ({
          rows: s.rows.map((r) =>
            r.id === rowId
              ? {
                  ...r,
                  imageStatus: "error",
                  error: data.error || "Image generation failed",
                }
              : r,
          ),
        }));
        break;
    }
  });

  return imagePath;
}

async function runVideoGeneration(
  projectId: string,
  rowId: string,
  settings: {
    width: number;
    height: number;
    duration: number;
    mode: VideoMode;
  },
  signal: AbortSignal,
  onLog: (text: string) => void,
): Promise<void> {
  const row = useBatchImageToVideoStore
    .getState()
    .rows.find((r) => r.id === rowId);
  if (!row || !row.imagePath) return;

  useBatchImageToVideoStore.setState((s) => ({
    rows: s.rows.map((r) =>
      r.id === rowId ? { ...r, videoStatus: "generating", error: null } : r,
    ),
  }));

  const res = await fetch(`${API_BASE}/api/render/image-to-video`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: row.i2vPrompt.trim(),
      imagePath: normalizeImagePath(row.imagePath),
      projectId,
      width: settings.width,
      height: settings.height,
      frames: settings.duration * 24 + 1,
      frameRate: 24,
      mode: settings.mode,
    }),
    signal,
  });

  if (!res.ok) {
    const err = await res.text();
    useBatchImageToVideoStore.setState((s) => ({
      rows: s.rows.map((r) =>
        r.id === rowId ? { ...r, videoStatus: "error", error: err } : r,
      ),
    }));
    return;
  }

  await readSSEStream(res, (event, data) => {
    switch (event) {
      case "log":
        onLog(data.text as string);
        break;
      case "complete":
        useBatchImageToVideoStore.setState((s) => ({
          rows: s.rows.map((r) =>
            r.id === rowId
              ? {
                  ...r,
                  videoStatus: "done",
                  videoResult: `http://localhost:${(window as any).PORT}/api/files?path=${encodeURIComponent(data.path)}`,
                }
              : r,
          ),
        }));
        break;
      case "error":
        useBatchImageToVideoStore.setState((s) => ({
          rows: s.rows.map((r) =>
            r.id === rowId
              ? {
                  ...r,
                  videoStatus: "error",
                  error: data.error || "Video generation failed",
                }
              : r,
          ),
        }));
        break;
    }
  });
}

type PipelineMode = "images" | "videos" | "both";

async function runPipeline(
  projectId: string,
  ids: string[],
  pipelineMode: PipelineMode,
) {
  const state = useBatchImageToVideoStore.getState();
  if (state.running) return;
  if (ids.length === 0) return;

  const { aspectRatio, resolution, duration, mode } = state;
  const { width, height } = getDimensions(aspectRatio, resolution);

  batchAbortController = new AbortController();
  const signal = batchAbortController.signal;

  useBatchImageToVideoStore.setState({
    running: true,
    progress: { current: 0, total: ids.length },
    cancelRequested: false,
    logs: [],
  });

  let cancelled = false;

  const appendLog = (text: string, idx: number) => {
    useBatchImageToVideoStore.setState((s) => ({
      logs: [...s.logs, `[${idx + 1}/${ids.length}] ${text}`],
    }));
  };

  for (let i = 0; i < ids.length; i++) {
    if (useBatchImageToVideoStore.getState().cancelRequested) {
      cancelled = true;
      break;
    }

    const row = useBatchImageToVideoStore
      .getState()
      .rows.find((r) => r.id === ids[i]);
    if (!row) continue;

    const onLog = (text: string) => appendLog(text, i);

    try {
      if (pipelineMode === "images" || pipelineMode === "both") {
        const imagePath = await runImageGeneration(
          projectId,
          row.id,
          { aspect: aspectRatio, width, height },
          signal,
          onLog,
        );
        if (imagePath) {
          appendLog(`Image ready: ${row.t2iPrompt.trim().slice(0, 60)}`, i);
        } else if (pipelineMode === "both") {
          // Image failed — skip the video stage for this row.
          useBatchImageToVideoStore.setState(() => ({
            progress: { current: i + 1, total: ids.length },
          }));
          continue;
        }
      }

      if (pipelineMode === "videos" || pipelineMode === "both") {
        await runVideoGeneration(
          projectId,
          row.id,
          { width, height, duration: row.duration ?? duration, mode },
          signal,
          onLog,
        );
      }
    } catch (e: any) {
      if (e?.name === "AbortError") {
        cancelled = true;
        break;
      }
      useBatchImageToVideoStore.setState((s) => ({
        rows: s.rows.map((r) =>
          r.id === row.id ? { ...r, error: String(e) } : r,
        ),
      }));
    }

    useBatchImageToVideoStore.setState(() => ({
      progress: { current: i + 1, total: ids.length },
    }));
  }

  batchAbortController = null;
  useBatchImageToVideoStore.setState({
    running: false,
    progress: null,
    cancelRequested: false,
  });

  if (!cancelled) {
    playBeep();
  }
}

export const useBatchImageToVideoStore = create<BatchImageToVideoStore>(
  (set, get) => ({
    rows: [makeRow()],

    aspectRatio: "1:1",
    resolution: "480p",
    duration: 5,
    mode: "distilled",

    running: false,
    progress: null,
    cancelRequested: false,
    logs: [],

    projectId: null,
    hydrated: false,

    hydrate: async (projectId) => {
      if (get().hydrated && get().projectId === projectId) return;

      const previous = get().projectId;
      if (previous !== null && previous !== projectId) {
        get().reset();
      }
      set({ hydrated: true, projectId });

      const stored = await loadBatchImageToVideoState(projectId);
      if (!stored) return;

      set((s) => {
        const rows: BatchI2VRow[] = (stored.rows ?? []).map((r) => ({
          id: r.id,
          t2iPrompt: r.t2iPrompt,
          i2vPrompt: r.i2vPrompt,
          duration: r.duration ?? null,
          imagePath: null,
          imageUrl: null,
          imageFilename: null,
          imageStatus: "idle",
          videoResult: null,
          videoStatus: "idle",
          error: null,
        }));

        return {
          rows: rows.length > 0 ? rows : [makeRow()],
          aspectRatio: stored.aspectRatio ?? s.aspectRatio,
          resolution: stored.resolution ?? s.resolution,
          duration: stored.duration ?? s.duration,
          mode: stored.mode ?? s.mode,
        };
      });
    },

    clear: () => {
      const { projectId } = get();
      get().reset();
      if (projectId) void clearBatchImageToVideoState(projectId);
    },

    addRow: () => {
      set((s) => ({ rows: [...s.rows, makeRow()] }));
      persistBatchState();
    },

    removeRow: (id) => {
      set((s) => ({ rows: s.rows.filter((r) => r.id !== id) }));
      persistBatchState();
    },

    updateT2IPrompt: (id, t2iPrompt) => {
      set((s) => ({
        rows: s.rows.map((r) => (r.id === id ? { ...r, t2iPrompt } : r)),
      }));
      persistBatchState();
    },

    updateI2VPrompt: (id, i2vPrompt) => {
      set((s) => ({
        rows: s.rows.map((r) => (r.id === id ? { ...r, i2vPrompt } : r)),
      }));
      persistBatchState();
    },

    updateRowDuration: (id, duration) => {
      set((s) => ({
        rows: s.rows.map((r) => (r.id === id ? { ...r, duration } : r)),
      }));
      persistBatchState();
    },

    uploadCsv: (base64, _filename) => {
      try {
        const raw = base64
          .replace(/^data:text\/csv;base64,/, "")
          .replace(/^data:application\/csv;base64,/, "")
          .replace(/^data:text\/plain;base64,/, "");
        const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
        const text = new TextDecoder("utf-8").decode(bytes);
        const rows = parseCsvRows(text);
        set({ rows: rows.length > 0 ? rows : [makeRow()] });
        persistBatchState();
      } catch {
        set({ rows: [makeRow()] });
      }
    },

    parseCsvText: (text) => {
      try {
        const rows = parseCsvRows(text);
        set({ rows: rows.length > 0 ? rows : [makeRow()] });
        persistBatchState();
      } catch {
        set({ rows: [makeRow()] });
      }
    },

    setAspectRatio: (aspectRatio) => {
      set({ aspectRatio });
      persistBatchState();
    },
    setResolution: (resolution) => {
      set({ resolution });
      persistBatchState();
    },
    setDuration: (duration) => {
      set({ duration });
      persistBatchState();
    },
    setMode: (mode) => {
      set({ mode });
      persistBatchState();
    },

    generateAllImages: (projectId) => {
      const ids = get()
        .rows.filter((r) => r.t2iPrompt.trim())
        .map((r) => r.id);
      return runPipeline(projectId, ids, "images");
    },

    generateAllVideos: (projectId) => {
      const ids = get()
        .rows.filter((r) => r.imagePath && r.i2vPrompt.trim())
        .map((r) => r.id);
      return runPipeline(projectId, ids, "videos");
    },

    generateAll: (projectId) => {
      const ids = get()
        .rows.filter((r) => r.t2iPrompt.trim() && r.i2vPrompt.trim())
        .map((r) => r.id);
      return runPipeline(projectId, ids, "both");
    },

    regenerateImage: (projectId, rowId) => {
      const ids = get()
        .rows.filter((r) => r.id === rowId && r.t2iPrompt.trim())
        .map((r) => r.id);
      return runPipeline(projectId, ids, "images");
    },

    regenerateVideo: (projectId, rowId) => {
      const ids = get()
        .rows.filter(
          (r) => r.id === rowId && r.imagePath && r.i2vPrompt.trim(),
        )
        .map((r) => r.id);
      return runPipeline(projectId, ids, "videos");
    },

    regenerateBoth: (projectId, rowId) => {
      const ids = get()
        .rows.filter(
          (r) => r.id === rowId && r.t2iPrompt.trim() && r.i2vPrompt.trim(),
        )
        .map((r) => r.id);
      return runPipeline(projectId, ids, "both");
    },

    cancel: () => {
      set({ cancelRequested: true });
      if (batchAbortController) {
        batchAbortController.abort();
      }
      set({
        running: false,
        progress: null,
        rows: get().rows.map((r) => ({
          ...r,
          imageStatus:
            r.imageStatus === "generating" ? "idle" : r.imageStatus,
          videoStatus:
            r.videoStatus === "generating" ? "idle" : r.videoStatus,
        })),
      });
      fetch(`${API_BASE}/api/render/cancel`, { method: "POST" }).catch(() => {});
    },

    reset: () =>
      set({
        rows: [makeRow()],
        aspectRatio: "1:1",
        resolution: "480p",
        duration: 5,
        mode: "distilled",
        running: false,
        progress: null,
        cancelRequested: false,
        logs: [],
      }),
  }),
);
