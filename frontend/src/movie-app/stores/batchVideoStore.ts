import { create } from "zustand";
import type {
  AspectRatio,
  Resolution,
  VideoMode,
  ProjectImage,
} from "./generationStore";
import type { QueueTask } from "./queueStore";
import { loadFFmpeg } from "../lib/ffmpeg";
import {
  clearBatchVideoState,
  loadBatchVideoState,
  saveBatchVideoState,
  type PersistedBatchVideoState,
} from "../lib/batchVideoStorage";

const API_BASE = `http://localhost:${(window as any).PORT}`;

export type BatchRowStatus =
  | "idle"
  | "uploading"
  | "generating"
  | "done"
  | "error";

export interface BatchVideoRow {
  id: string;
  prompt: string;
  imagePath: string | null;
  imageUrl: string | null;
  imageFilename: string | null;
  status: BatchRowStatus;
  result: string | null;
  error: string | null;
  logs: string[];
}

interface BatchVideoStore {
  // Rows
  rows: BatchVideoRow[];

  // Shared generation settings
  duration: number;
  aspectRatio: AspectRatio;
  resolution: Resolution;
  mode: VideoMode;
  stage1Steps: number;
  stage2Steps: number;

  // Batch generation state
  running: boolean;
  progress: { current: number; total: number } | null;
  cancelRequested: boolean;
  logs: string[];

  // Stitching state
  stitching: boolean;
  stitchLogs: string[];
  stitchResult: string | null;
  stitchError: string | null;

  // Persistence
  projectId: string | null;
  hydrated: boolean;
  hydrate: (projectId: string) => Promise<void>;
  clear: () => void;

  addRow: () => void;
  removeRow: (id: string) => void;
  updatePrompt: (id: string, prompt: string) => void;
  clearRowResult: (id: string) => void;
  uploadRowImage: (
    id: string,
    base64: string,
    filename: string | undefined,
    projectId: string,
  ) => Promise<string | null>;
  setRowImage: (id: string, image: ProjectImage) => void;

  setDuration: (v: number) => void;
  setAspectRatio: (v: AspectRatio) => void;
  setResolution: (v: Resolution) => void;
  setMode: (v: VideoMode) => void;
  setStage1Steps: (v: number) => void;
  setStage2Steps: (v: number) => void;

  generateRows: (projectId: string, ids: string[]) => Promise<void>;
  generateRow: (projectId: string, id: string) => Promise<void>;
  generateAll: (projectId: string) => Promise<void>;
  applyQueueTask: (task: QueueTask) => void;
  cancel: () => void;

  stitchVideos: () => Promise<void>;

  reset: () => void;
}

// Queue-task tracking for the current batch run: which row each queue task maps
// to, and which rows are part of the active batch (for progress accounting).
const rowTaskMap = new Map<string, string>(); // rowId -> taskId
const taskRowMap = new Map<string, string>(); // taskId -> rowId
let batchRowIds: string[] = [];

/** Resolve a queue task result URL (relative `/api/files` path) to absolute. */
function resolveMediaUrl(url: string): string {
  return url.startsWith("http")
    ? url
    : `http://localhost:${(window as any).PORT}${url}`;
}

/** Enqueue a single batch-video task in the backend queue. */
async function enqueueBatchVideoTask(
  projectId: string,
  payload: {
    prompt: string;
    imagePath: string;
    width: number;
    height: number;
    frames: number;
    frameRate: number;
    mode: string;
    stage1Steps: number;
    stage2Steps: number;
  },
): Promise<{ ok: boolean; error?: string; taskId?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/queue/enqueue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        type: "image-to-video",
        label: "Batch video",
        payload,
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
// uploaded path / file URL / api-files URL down to just the basename.
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

function makeRow(): BatchVideoRow {
  return {
    id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    prompt: "",
    imagePath: null,
    imageUrl: null,
    imageFilename: null,
    status: "idle",
    result: null,
    error: null,
    logs: [],
  };
}

function toPersistedState(
  s: Pick<
    BatchVideoStore,
    | "rows"
    | "duration"
    | "aspectRatio"
    | "resolution"
    | "mode"
    | "stage1Steps"
    | "stage2Steps"
  >,
): PersistedBatchVideoState {
  return {
    rows: s.rows.map((r) => ({
      id: r.id,
      prompt: r.prompt,
      imagePath: r.imagePath,
      imageUrl: r.imageUrl,
      imageFilename: r.imageFilename,
    })),
    duration: s.duration,
    aspectRatio: s.aspectRatio,
    resolution: s.resolution,
    mode: s.mode,
    stage1Steps: s.stage1Steps,
    stage2Steps: s.stage2Steps,
  };
}

// Fire-and-forget save of the current editable UI state.
function persistBatchState() {
  const { projectId } = useBatchVideoStore.getState();
  if (!projectId) return;
  void saveBatchVideoState(
    projectId,
    toPersistedState(useBatchVideoStore.getState()),
  );
}

export const useBatchVideoStore = create<BatchVideoStore>((set, get) => ({
  rows: [makeRow()],

  duration: 5,
  aspectRatio: "1:1",
  resolution: "480p",
  mode: "distilled",
  stage1Steps: 30,
  stage2Steps: 3,

  running: false,
  progress: null,
  cancelRequested: false,
  logs: [],

  stitching: false,
  stitchLogs: [],
  stitchResult: null,
  stitchError: null,

  projectId: null,
  hydrated: false,

  hydrate: async (projectId) => {
    // No-op if we've already hydrated for this project.
    if (get().hydrated && get().projectId === projectId) return;

    // Switching to a different project: reset to defaults so rows and
    // settings from the previous project don't leak through.
    const previous = get().projectId;
    if (previous !== null && previous !== projectId) {
      get().reset();
    }
    set({ hydrated: true, projectId });

    const stored = await loadBatchVideoState(projectId);
    if (!stored) return;

    set((s) => {
      const rows: BatchVideoRow[] = (stored.rows ?? []).map((r) => ({
        id: r.id,
        prompt: r.prompt,
        imagePath: r.imagePath,
        imageUrl: r.imageUrl,
        imageFilename: r.imageFilename,
        status: "idle",
        result: null,
        error: null,
        logs: [],
      }));

      return {
        rows: rows.length > 0 ? rows : [makeRow()],
        duration: stored.duration ?? s.duration,
        aspectRatio: stored.aspectRatio ?? s.aspectRatio,
        resolution: stored.resolution ?? s.resolution,
        mode: stored.mode ?? s.mode,
        stage1Steps: stored.stage1Steps ?? s.stage1Steps,
        stage2Steps: stored.stage2Steps ?? s.stage2Steps,
      };
    });
  },

  clear: () => {
    const { projectId } = get();
    get().reset();
    if (projectId) void clearBatchVideoState(projectId);
  },

  addRow: () => {
    set((s) => ({ rows: [...s.rows, makeRow()] }));
    persistBatchState();
  },

  removeRow: (id) => {
    set((s) => ({ rows: s.rows.filter((r) => r.id !== id) }));
    persistBatchState();
  },

  updatePrompt: (id, prompt) => {
    set((s) => ({
      rows: s.rows.map((r) => (r.id === id ? { ...r, prompt } : r)),
    }));
    persistBatchState();
  },

  clearRowResult: (id) =>
    set((s) => ({
      rows: s.rows.map((r) =>
        r.id === id ? { ...r, result: null, error: null, status: "idle" } : r,
      ),
    })),

  uploadRowImage: async (id, base64, filename, projectId) => {
    set((s) => ({
      rows: s.rows.map((r) =>
        r.id === id ? { ...r, status: "uploading" } : r,
      ),
    }));

    try {
      const res = await fetch(`${API_BASE}/api/upload/image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: base64,
          filename: filename || `upload-${Date.now()}.png`,
          projectId,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        set((s) => ({
          rows: s.rows.map((r) =>
            r.id === id ? { ...r, status: "error", error: err } : r,
          ),
        }));
        return null;
      }

      const data = await res.json();
      const url = `http://localhost:${(window as any).PORT}/api/files?path=${encodeURIComponent(data.path)}`;
      set((s) => ({
        rows: s.rows.map((r) =>
          r.id === id
            ? {
                ...r,
                status: "idle",
                imagePath: data.path,
                imageUrl: url,
                imageFilename: data.filename,
              }
            : r,
        ),
      }));
      persistBatchState();
      return data.path as string;
    } catch (e) {
      set((s) => ({
        rows: s.rows.map((r) =>
          r.id === id ? { ...r, status: "error", error: String(e) } : r,
        ),
      }));
      return null;
    }
  },

  setRowImage: (id, image) => {
    set((s) => ({
      rows: s.rows.map((r) =>
        r.id === id
          ? {
              ...r,
              imagePath: image.url,
              imageUrl: image.url,
              imageFilename: image.filename,
              status: "idle",
              error: null,
            }
          : r,
      ),
    }));
    persistBatchState();
  },

  setDuration: (duration) => {
    set({ duration });
    persistBatchState();
  },
  setAspectRatio: (aspectRatio) => {
    set({ aspectRatio });
    persistBatchState();
  },
  setResolution: (resolution) => {
    set({ resolution });
    persistBatchState();
  },
  setMode: (mode) => {
    set({ mode });
    persistBatchState();
  },
  setStage1Steps: (stage1Steps) => {
    set({ stage1Steps: Math.max(1, Math.round(Number(stage1Steps)) || 1) });
    persistBatchState();
  },
  setStage2Steps: (stage2Steps) => {
    set({ stage2Steps: Math.max(1, Math.round(Number(stage2Steps)) || 1) });
    persistBatchState();
  },

  generateRows: async (projectId, ids) => {
    if (get().running) return;

    const rows = get().rows;
    const targets = ids
      .map((id) => rows.find((r) => r.id === id))
      .filter((r): r is BatchVideoRow => !!r)
      .filter((r) => r.prompt.trim() && r.imagePath);

    if (targets.length === 0) return;

    const {
      duration,
      aspectRatio,
      resolution,
      mode,
      stage1Steps,
      stage2Steps,
    } = get();
    const { width, height } = getDimensions(aspectRatio, resolution);

    // Reset queue-task tracking for this batch run.
    rowTaskMap.clear();
    taskRowMap.clear();
    batchRowIds = targets.map((r) => r.id);

    set((s) => ({
      running: true,
      progress: { current: 0, total: targets.length },
      cancelRequested: false,
      logs: [],
      rows: s.rows.map((r) =>
        targets.some((t) => t.id === r.id)
          ? { ...r, status: "generating", error: null, logs: [] }
          : r,
      ),
    }));

    // Enqueue one queue task per row; the queue worker runs them sequentially.
    for (const row of targets) {
      // Stop enqueuing if the batch was cancelled while we were enqueuing.
      if (!get().running) break;

      const imagePath = normalizeImagePath(row.imagePath!);
      const r = await enqueueBatchVideoTask(projectId, {
        prompt: row.prompt.trim(),
        imagePath,
        width,
        height,
        frames: duration * 24 + 1,
        frameRate: 24,
        mode,
        stage1Steps,
        stage2Steps,
      });

      if (r.ok && r.taskId) {
        rowTaskMap.set(row.id, r.taskId);
        taskRowMap.set(r.taskId, row.id);
        set((s) => ({
          logs: [...s.logs, `Enqueued: ${row.prompt.trim().slice(0, 80)}`],
        }));
      } else {
        // Enqueue failed — mark the row as errored (terminal) so progress can
        // still complete.
        set((s) => ({
          rows: s.rows.map((x) =>
            x.id === row.id
              ? { ...x, status: "error", error: r.error ?? "Failed to enqueue" }
              : x,
          ),
        }));
      }
    }

    // Nothing was enqueued — reset the batch UI immediately.
    if (rowTaskMap.size === 0) {
      rowTaskMap.clear();
      taskRowMap.clear();
      batchRowIds = [];
      set({ running: false, progress: null, cancelRequested: false });
    }
  },

  generateRow: (projectId, id) => get().generateRows(projectId, [id]),

  generateAll: (projectId) => {
    const ids = get()
      .rows.filter((r) => r.prompt.trim() && r.imagePath)
      .map((r) => r.id);
    return get().generateRows(projectId, ids);
  },

  applyQueueTask: (task) => {
    if (task.type !== "image-to-video") return;
    const rowId = taskRowMap.get(task.id);
    if (!rowId) return;

    if (task.status === "completed") {
      const url = task.result?.url;
      set((s) => ({
        rows: s.rows.map((r) =>
          r.id === rowId
            ? {
                ...r,
                status: "done",
                result: url ? resolveMediaUrl(url) : null,
                error: null,
              }
            : r,
        ),
      }));
    } else if (task.status === "failed") {
      set((s) => ({
        rows: s.rows.map((r) =>
          r.id === rowId
            ? {
                ...r,
                status: "error",
                error: task.error ?? "Video generation failed",
              }
            : r,
        ),
      }));
    } else if (task.status === "cancelled") {
      set((s) => ({
        rows: s.rows.map((r) =>
          r.id === rowId ? { ...r, status: "idle", error: null } : r,
        ),
      }));
    } else {
      // pending / running / paused
      set((s) => ({
        rows: s.rows.map((r) =>
          r.id === rowId ? { ...r, status: "generating" } : r,
        ),
      }));
    }

    // Recompute batch progress from terminal rows.
    const batchRows = get().rows.filter((r) => batchRowIds.includes(r.id));
    const terminal = batchRows.filter(
      (r) => r.status === "done" || r.status === "error",
    ).length;
    const total = batchRowIds.length;

    if (total > 0 && terminal >= total) {
      batchRowIds = [];
      rowTaskMap.clear();
      taskRowMap.clear();
      set((s) => ({
        running: false,
        progress: null,
        cancelRequested: false,
        logs: [...s.logs, "Batch complete."],
      }));
      playBeep();
    } else if (total > 0) {
      set({ progress: { current: terminal, total } });
    }
  },

  cancel: () => {
    const projectId = get().projectId;
    if (projectId) {
      for (const taskId of Array.from(taskRowMap.keys())) {
        fetch(`${API_BASE}/api/queue/cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, taskId }),
        }).catch(() => {});
      }
    }
    rowTaskMap.clear();
    taskRowMap.clear();
    batchRowIds = [];
    set({
      running: false,
      progress: null,
      cancelRequested: false,
      rows: get().rows.map((r) =>
        r.status === "generating" ? { ...r, status: "idle" } : r,
      ),
    });
  },

  stitchVideos: async () => {
    if (get().stitching) return;

    const results = get()
      .rows.filter((r) => r.result)
      .map((r) => r.result as string);

    if (results.length < 2) {
      set({
        stitchError: "Need at least 2 generated videos to stitch.",
        stitchResult: null,
      });
      return;
    }

    set({
      stitching: true,
      stitchLogs: [],
      stitchResult: null,
      stitchError: null,
    });

    try {
      const ffmpeg = await loadFFmpeg();

      // Write each generated video into the in-memory FS in order.
      const list: string[] = [];
      for (let i = 0; i < results.length; i++) {
        const blob = await fetch(results[i]).then((r) => {
          if (!r.ok) throw new Error(`Failed to fetch video ${i + 1}`);
          return r.blob();
        });
        const data = new Uint8Array(await blob.arrayBuffer());
        const name = `in${i}.mp4`;
        await ffmpeg.writeFile(name, data);
        list.push(`file '${name}'`);
        set((s) => ({
          stitchLogs: [
            ...s.stitchLogs,
            `Added video ${i + 1}/${results.length}`,
          ],
        }));
      }

      await ffmpeg.writeFile("list.txt", list.join("\n"));
      set((s) => ({
        stitchLogs: [...s.stitchLogs, "Concatenating videos..."],
      }));

      const ret = await ffmpeg.exec([
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        "list.txt",
        "-c",
        "copy",
        "output.mp4",
      ]);

      if (ret !== 0) {
        throw new Error(`ffmpeg exited with code ${ret}`);
      }

      const out = (await ffmpeg.readFile("output.mp4")) as Uint8Array;
      const bytes = new Uint8Array(out);
      const url = URL.createObjectURL(
        new Blob([bytes.buffer], { type: "video/mp4" }),
      );

      set({
        stitching: false,
        stitchResult: url,
        stitchLogs: [...get().stitchLogs, "Done"],
      });
    } catch (e) {
      set({
        stitching: false,
        stitchError: String(e),
      });
    }
  },

  reset: () =>
    set({
      rows: [makeRow()],
      duration: 5,
      aspectRatio: "1:1",
      resolution: "480p",
      mode: "distilled",
      stage1Steps: 30,
      stage2Steps: 3,
      running: false,
      progress: null,
      cancelRequested: false,
      logs: [],
      stitching: false,
      stitchLogs: [],
      stitchResult: null,
      stitchError: null,
    }),
}));
