import { create } from "zustand";
import type {
  AspectRatio,
  Resolution,
  VideoMode,
  ProjectImage,
} from "./generationStore";
import { loadFFmpeg } from "../lib/ffmpeg";
import {
  clearBatchVoiceState,
  loadBatchVoiceState,
  saveBatchVoiceState,
  type PersistedBatchVoiceState,
  type VoiceQuality,
} from "../lib/batchVoiceStorage";

const API_BASE = `http://localhost:${(window as any).PORT}`;

export type BatchVoiceRowStatus =
  | "idle"
  | "uploading"
  | "tts"
  | "video"
  | "muxing"
  | "done"
  | "error";

export interface BatchVoiceRow {
  id: string;
  // Video prompt (drives the image-to-video stage)
  prompt: string;
  // TTS text (spoken in the cloned voice). Empty = silent video (no voiceover).
  script: string;
  imagePath: string | null;
  imageUrl: string | null;
  imageFilename: string | null;
  status: BatchVoiceRowStatus;
  result: string | null;
  error: string | null;
  logs: string[];
  audioResult: string | null;
  motionResult: string | null;
}

interface BatchVoiceStore {
  // Rows
  rows: BatchVoiceRow[];

  // Shared video settings
  duration: number;
  aspectRatio: AspectRatio;
  resolution: Resolution;
  mode: VideoMode;

  // Shared voice settings
  quality: VoiceQuality;
  voiceRefPath: string | null;
  voiceRefUrl: string | null;
  voiceRefFilename: string | null;

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
  updateScript: (id: string, script: string) => void;
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
  setQuality: (v: VoiceQuality) => void;
  uploadVoiceRef: (
    base64: string,
    filename: string,
    projectId: string,
  ) => Promise<string | null>;

  generateRows: (projectId: string, ids: string[]) => Promise<void>;
  generateRow: (projectId: string, id: string) => Promise<void>;
  generateAll: (projectId: string) => Promise<void>;
  cancel: () => void;

  stitchVideos: () => Promise<void>;

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

function makeRow(): BatchVoiceRow {
  return {
    id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    prompt: "",
    script: "",
    imagePath: null,
    imageUrl: null,
    imageFilename: null,
    status: "idle",
    result: null,
    error: null,
    logs: [],
    audioResult: null,
    motionResult: null,
  };
}

function toPersistedState(
  s: Pick<
    BatchVoiceStore,
    | "rows"
    | "duration"
    | "aspectRatio"
    | "resolution"
    | "mode"
    | "quality"
    | "voiceRefPath"
    | "voiceRefFilename"
  >,
): PersistedBatchVoiceState {
  return {
    rows: s.rows.map((r) => ({
      id: r.id,
      prompt: r.prompt,
      script: r.script,
      imagePath: r.imagePath,
      imageUrl: r.imageUrl,
      imageFilename: r.imageFilename,
    })),
    duration: s.duration,
    aspectRatio: s.aspectRatio,
    resolution: s.resolution,
    mode: s.mode,
    quality: s.quality,
    voiceRefPath: s.voiceRefPath,
    voiceRefFilename: s.voiceRefFilename,
  };
}

// Fire-and-forget save of the current editable UI state.
function persistBatchState() {
  const { projectId } = useBatchVoiceStore.getState();
  if (!projectId) return;
  void saveBatchVoiceState(
    projectId,
    toPersistedState(useBatchVoiceStore.getState()),
  );
}

export const useBatchVoiceStore = create<BatchVoiceStore>((set, get) => ({
  rows: [makeRow()],

  duration: 5,
  aspectRatio: "1:1",
  resolution: "480p",
  mode: "distilled",

  quality: "high",
  voiceRefPath: null,
  voiceRefUrl: null,
  voiceRefFilename: null,

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

    const stored = await loadBatchVoiceState(projectId);
    if (!stored) return;

    set((s) => {
      const rows: BatchVoiceRow[] = (stored.rows ?? []).map((r) => ({
        id: r.id,
        prompt: r.prompt,
        script: r.script,
        imagePath: r.imagePath,
        imageUrl: r.imageUrl,
        imageFilename: r.imageFilename,
        status: "idle",
        result: null,
        error: null,
        logs: [],
        audioResult: null,
        motionResult: null,
      }));

      // Rebuild the preview URL for the stored voice reference so the audio
      // player keeps working after a reload.
      const restoredRefPath = stored.voiceRefPath ?? s.voiceRefPath;

      return {
        rows: rows.length > 0 ? rows : [makeRow()],
        duration: stored.duration ?? s.duration,
        aspectRatio: stored.aspectRatio ?? s.aspectRatio,
        resolution: stored.resolution ?? s.resolution,
        mode: stored.mode ?? s.mode,
        quality: stored.quality ?? s.quality,
        voiceRefPath: restoredRefPath,
        voiceRefUrl: restoredRefPath
          ? `http://localhost:${(window as any).PORT}/api/files?path=${encodeURIComponent(restoredRefPath)}`
          : null,
        voiceRefFilename: stored.voiceRefFilename ?? s.voiceRefFilename,
      };
    });
  },

  clear: () => {
    const { projectId } = get();
    get().reset();
    if (projectId) void clearBatchVoiceState(projectId);
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

  updateScript: (id, script) => {
    set((s) => ({
      rows: s.rows.map((r) => (r.id === id ? { ...r, script } : r)),
    }));
    persistBatchState();
  },

  clearRowResult: (id) =>
    set((s) => ({
      rows: s.rows.map((r) =>
        r.id === id
          ? {
              ...r,
              result: null,
              error: null,
              status: "idle",
              audioResult: null,
              motionResult: null,
            }
          : r,
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
  setQuality: (quality) => {
    set({ quality });
    persistBatchState();
  },

  uploadVoiceRef: async (base64, filename, projectId) => {
    try {
      const res = await fetch(`${API_BASE}/api/upload/audio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audio: base64,
          filename,
          projectId,
        }),
      });

      if (!res.ok) {
        return null;
      }

      const data = await res.json();
      set({
        voiceRefPath: data.path,
        voiceRefUrl: `http://localhost:${(window as any).PORT}/api/files?path=${encodeURIComponent(data.path)}`,
        voiceRefFilename: data.filename,
      });
      persistBatchState();
      return data.path as string;
    } catch {
      return null;
    }
  },

  generateRows: async (projectId, ids) => {
    if (get().running) return;

    const rows = get().rows;
    const targets = ids
      .map((id) => rows.find((r) => r.id === id))
      .filter((r): r is BatchVoiceRow => !!r)
      .filter(
        (r) =>
          r.prompt.trim() &&
          r.imagePath &&
          (!r.script.trim() || get().voiceRefPath),
      );

    if (targets.length === 0) return;

    const { duration, aspectRatio, resolution, mode, quality, voiceRefPath } =
      get();
    const { width, height } = getDimensions(aspectRatio, resolution);
    const refAudioPath = voiceRefPath ? normalizeImagePath(voiceRefPath) : null;

    batchAbortController = new AbortController();
    const signal = batchAbortController.signal;

    set({
      running: true,
      progress: { current: 0, total: targets.length },
      cancelRequested: false,
      logs: [],
    });

    let cancelled = false;

    for (let i = 0; i < targets.length; i++) {
      if (get().cancelRequested) {
        cancelled = true;
        break;
      }

      const row = targets[i];
      const hasVoice = row.script.trim().length > 0;

      set((s) => ({
        progress: { current: i + 1, total: targets.length },
        rows: s.rows.map((r) =>
          r.id === row.id
            ? {
                ...r,
                status: hasVoice ? "tts" : "video",
                error: null,
                logs: [],
                result: null,
                audioResult: null,
                motionResult: null,
              }
            : r,
        ),
        logs: [
          ...s.logs,
          `[${i + 1}/${targets.length}] ${hasVoice ? "Voice" : "Video (no voice)"}: ${row.prompt.trim().slice(0, 80)}`,
        ],
      }));

      try {
        // ===== STEP 1: TTS (skipped when the row has no script) =====
        if (hasVoice) {
          const ttsRes = await fetch(`${API_BASE}/api/render/tts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: row.script.trim(),
              refAudioPath,
              projectId,
              quality,
              // Each row's voiceover is saved under
              // <projectOutputDir>/voices/<voiceId>/, keyed by the row id.
              voiceId: row.id,
            }),
            signal,
          });

          if (!ttsRes.ok) {
            const err = await ttsRes.text();
            set((s) => ({
              rows: s.rows.map((r) =>
                r.id === row.id ? { ...r, status: "error", error: err } : r,
              ),
            }));
            continue;
          }

          let ttsDone = false;
          await readSSEStream(ttsRes, (event, data) => {
            if (ttsDone) return;
            switch (event) {
              case "log":
                set((s) => ({
                  rows: s.rows.map((r) =>
                    r.id === row.id
                      ? { ...r, logs: [...r.logs, data.text as string] }
                      : r,
                  ),
                  logs: [
                    ...s.logs,
                    `[${i + 1}/${targets.length}] ${data.text as string}`,
                  ],
                }));
                break;
              case "complete":
                ttsDone = true;
                set((s) => ({
                  rows: s.rows.map((r) =>
                    r.id === row.id
                      ? {
                          ...r,
                          audioResult: `http://localhost:${(window as any).PORT}/api/files?path=${encodeURIComponent(data.path)}`,
                        }
                      : r,
                  ),
                }));
                break;
              case "error":
                ttsDone = true;
                set((s) => ({
                  rows: s.rows.map((r) =>
                    r.id === row.id
                      ? {
                          ...r,
                          status: "error",
                          error: data.error || "Voice generation failed",
                        }
                      : r,
                  ),
                }));
                break;
            }
          });

          const ttsRow = get().rows.find((r) => r.id === row.id);
          if (!ttsRow || ttsRow.status === "error") {
            continue;
          }
        }

        // ===== STEP 2: Video =====
        set((s) => ({
          rows: s.rows.map((r) =>
            r.id === row.id ? { ...r, status: "video" } : r,
          ),
        }));

        const imagePath = normalizeImagePath(row.imagePath!);

        const vidRes = await fetch(`${API_BASE}/api/render/image-to-video`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: row.prompt.trim(),
            imagePath,
            projectId,
            width,
            height,
            frames: duration * 24 + 1,
            frameRate: 24,
            mode,
          }),
          signal,
        });

        if (!vidRes.ok) {
          const err = await vidRes.text();
          set((s) => ({
            rows: s.rows.map((r) =>
              r.id === row.id ? { ...r, status: "error", error: err } : r,
            ),
          }));
          continue;
        }

        let vidDone = false;
        await readSSEStream(vidRes, (event, data) => {
          if (vidDone) return;
          switch (event) {
            case "log":
              set((s) => ({
                rows: s.rows.map((r) =>
                  r.id === row.id
                    ? { ...r, logs: [...r.logs, data.text as string] }
                    : r,
                ),
                logs: [
                  ...s.logs,
                  `[${i + 1}/${targets.length}] ${data.text as string}`,
                ],
              }));
              break;
            case "complete":
              vidDone = true;
              set((s) => ({
                rows: s.rows.map((r) =>
                  r.id === row.id
                    ? {
                        ...r,
                        motionResult: `http://localhost:${(window as any).PORT}/api/files?path=${encodeURIComponent(data.path)}`,
                      }
                    : r,
                ),
              }));
              break;
            case "error":
              vidDone = true;
              set((s) => ({
                rows: s.rows.map((r) =>
                  r.id === row.id
                    ? {
                        ...r,
                        status: "error",
                        error: data.error || "Video generation failed",
                      }
                    : r,
                ),
              }));
              break;
          }
        });

        const vidRow = get().rows.find((r) => r.id === row.id);
        if (!vidRow || vidRow.status === "error") {
          continue;
        }

        // No script → no voiceover: the motion video is the final result.
        if (!hasVoice) {
          set((s) => ({
            rows: s.rows.map((r) =>
              r.id === row.id
                ? { ...r, status: "done", result: vidRow.motionResult }
                : r,
            ),
          }));
          continue;
        }

        // ===== STEP 3: Mux audio + video =====
        set((s) => ({
          rows: s.rows.map((r) =>
            r.id === row.id ? { ...r, status: "muxing" } : r,
          ),
        }));

        const muxRes = await fetch(`${API_BASE}/api/render/mux-audio`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            videoPath: normalizeImagePath(vidRow.motionResult!),
            audioPath: normalizeImagePath(vidRow.audioResult!),
            projectId,
          }),
          signal,
        });

        if (!muxRes.ok) {
          const err = await muxRes.text();
          set((s) => ({
            rows: s.rows.map((r) =>
              r.id === row.id ? { ...r, status: "error", error: err } : r,
            ),
          }));
          continue;
        }

        let muxDone = false;
        await readSSEStream(muxRes, (event, data) => {
          if (muxDone) return;
          switch (event) {
            case "log":
              set((s) => ({
                rows: s.rows.map((r) =>
                  r.id === row.id
                    ? { ...r, logs: [...r.logs, data.text as string] }
                    : r,
                ),
                logs: [
                  ...s.logs,
                  `[${i + 1}/${targets.length}] ${data.text as string}`,
                ],
              }));
              break;
            case "complete":
              muxDone = true;
              set((s) => ({
                rows: s.rows.map((r) =>
                  r.id === row.id
                    ? {
                        ...r,
                        status: "done",
                        result: `http://localhost:${(window as any).PORT}/api/files?path=${encodeURIComponent(data.path)}`,
                      }
                    : r,
                ),
              }));
              break;
            case "error":
              muxDone = true;
              set((s) => ({
                rows: s.rows.map((r) =>
                  r.id === row.id
                    ? {
                        ...r,
                        status: "error",
                        error: data.error || "Muxing failed",
                      }
                    : r,
                ),
              }));
              break;
          }
        });
      } catch (e: any) {
        if (e?.name === "AbortError") {
          cancelled = true;
          break;
        }
        set((s) => ({
          rows: s.rows.map((r) =>
            r.id === row.id
              ? { ...r, status: "error", error: String(e) }
              : r,
          ),
        }));
      }
    }

    batchAbortController = null;
    set({ running: false, progress: null, cancelRequested: false });

    if (!cancelled) {
      playBeep();
    }
  },

  generateRow: (projectId, id) => get().generateRows(projectId, [id]),

  generateAll: (projectId) => {
    const ids = get()
      .rows.filter(
        (r) =>
          r.prompt.trim() &&
          r.imagePath &&
          (!r.script.trim() || get().voiceRefPath),
      )
      .map((r) => r.id);
    return get().generateRows(projectId, ids);
  },

  cancel: () => {
    set({ cancelRequested: true });
    if (batchAbortController) {
      batchAbortController.abort();
    }
    set({
      running: false,
      progress: null,
      rows: get().rows.map((r) =>
        r.status === "tts" || r.status === "video" || r.status === "muxing"
          ? { ...r, status: "idle" }
          : r,
      ),
    });
    // Keep cancelRequested: true — the loop's top-of-iteration check breaks out
    // between rows, and generateRows resets the flag in its final set().
    fetch(`${API_BASE}/api/render/cancel`, { method: "POST" }).catch(() => {});
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
          stitchLogs: [...s.stitchLogs, `Added video ${i + 1}/${results.length}`],
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
      quality: "high",
      voiceRefPath: null,
      voiceRefUrl: null,
      voiceRefFilename: null,
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
