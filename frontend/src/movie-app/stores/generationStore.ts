import { create } from "zustand";
import Mustache from "mustache";
import Papa from "papaparse";
import {
  loadTextToImageState,
  saveTextToImageState,
  type PersistedTextToImageState,
} from "../lib/textToImageStorage";

const API_BASE = `http://localhost:${(window as any).PORT}`;

// ========== Types ==========

export type GenerationTab =
  | "movieStudio"
  | "fastImageEdit"
  | "video"
  | "extend"
  | "agent"
  | "storyWriter"
  | "characters"
  | "extract"
  | "sceneVisual"
  | "textToImage"
  | "referencesToVideo"
  | "batchVideo"
  | "batchImageToVideo"
  | "batchVoice"
  | "llmServer";
export type AspectRatio = "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
export type Resolution =
  | "320p"
  | "480p"
  | "512p"
  | "640p"
  | "720p"
  | "1080p"
  | "2048p";
export type TextToImagePreset = "prototype" | "medium" | "optimal";
export type VideoMode = "distilled" | "one-stage" | "two-stage";

function getDimensions(
  aspect: AspectRatio,
  resolution: Resolution,
): {
  width: number;
  height: number;
} {
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

interface ImageState {
  prompt: string;
  aspectRatio: AspectRatio;
  resolution: Resolution;
  generating: boolean;
  result: string | null;
  error: string | null;
  logs: string[];
}

interface VideoState {
  prompt: string;
  duration: number;
  aspectRatio: AspectRatio;
  resolution: Resolution;
  mode: VideoMode;
  generating: boolean;
  result: string | null;
  error: string | null;
  logs: string[];
}

interface ExtendState {
  prompt: string;
  extendDuration: number;
  extendFrames: number;
  generating: boolean;
  result: string | null;
  error: string | null;
  logs: string[];
}

interface TextToImageState {
  prompt: string;
  aspectRatio: AspectRatio;
  resolution: Resolution;
  steps: number;
  installing: boolean;
  installingLogs: string[];
  installingError: string | null;
  downloading: boolean;
  downloadingLogs: string[];
  downloadingError: string | null;
  generating: boolean;
  result: string | null;
  error: string | null;
  logs: string[];
  mlxgenInstalled: boolean | null;
  zModelDownloaded: boolean | null;
}

interface FastImageEditState {
  prompt: string;
  referenceImages: ProjectImage[];
  downloading: boolean;
  downloadingLogs: string[];
  downloadingError: string | null;
  generating: boolean;
  result: string | null;
  error: string | null;
  logs: string[];
  modelDownloaded: boolean | null;
}

interface AgentState {
  model: string;
  port: number;
  installing: boolean;
  installingLogs: string[];
  installingError: string | null;
  installed: boolean | null;
  starting: boolean;
  serverRunning: boolean;
  serverOnline: boolean | null;
  serverLogs: string[];
  serverError: string | null;
}

interface GenerationStore {
  // Tab
  activeTab: GenerationTab;
  setActiveTab: (tab: GenerationTab) => void;

  // Image generation
  image: ImageState;
  setImagePrompt: (v: string) => void;
  setImageAspectRatio: (v: AspectRatio) => void;
  setImageResolution: (v: Resolution) => void;
  clearImageResult: () => void;
  generateImage: (projectId: string) => Promise<void>;

  // Video generation
  video: VideoState;
  setVideoPrompt: (v: string) => void;
  setVideoDuration: (v: number) => void;
  setVideoAspectRatio: (v: AspectRatio) => void;
  setVideoResolution: (v: Resolution) => void;
  setVideoMode: (v: VideoMode) => void;
  clearVideoResult: () => void;
  generateVideo: (projectId: string, imagePath?: string) => Promise<void>;
  cancelGenerate: () => void;

  // Video extension
  extend: ExtendState;
  setExtendPrompt: (v: string) => void;
  setExtendDuration: (v: number) => void;
  setExtendFrames: (v: number) => void;
  clearExtendResult: () => void;
  generateExtend: (projectId: string, videoPath: string) => Promise<void>;

  // Text-to-image (mlx-gen z-image-turbo)
  textToImage: TextToImageState;
  setTextToImagePrompt: (v: string) => void;
  setTextToImageAspectRatio: (v: AspectRatio) => void;
  setTextToImageResolution: (v: Resolution) => void;
  setTextToImageSteps: (v: number) => void;
  applyTextToImagePreset: (preset: TextToImagePreset) => void;
  clearTextToImageResult: () => void;
  checkTextToImageStatus: () => Promise<void>;
  installTextToImage: () => Promise<void>;
  downloadTextToImageModel: () => Promise<void>;
  generateTextToImage: (projectId: string) => Promise<void>;

  // Text-to-image persistence
  textToImageProjectId: string | null;
  textToImageHydrated: boolean;
  hydrateTextToImage: (projectId: string) => Promise<void>;
  resetTextToImage: () => void;

  // Fast image edit (mlx-gen FLUX.2 Klein)
  fastImageEdit: FastImageEditState;
  setFastImageEditPrompt: (v: string) => void;
  toggleFastImageEditImage: (img: ProjectImage) => void;
  clearFastImageEditImages: () => void;
  clearFastImageEditResult: () => void;
  checkFastImageEditStatus: () => Promise<void>;
  downloadFastImageEditModel: () => Promise<void>;
  generateFastImageEdit: (projectId: string) => Promise<void>;

  // Agent (mlx-vlm)
  agent: AgentState;
  setAgentModel: (v: string) => void;
  setAgentPort: (v: number) => void;
  checkAgentStatus: () => Promise<void>;
  checkServerOnline: () => Promise<void>;
  installMlxVlm: () => Promise<void>;
  startAgentServer: () => Promise<void>;
  stopAgentServer: () => Promise<void>;
  openAgentServer: () => Promise<void>;

  // Project videos picker
  projectVideos: ProjectVideo[];
  projectVideosLoading: boolean;
  fetchProjectVideos: (projectId: string) => Promise<void>;
  selectedVideo: ProjectVideo | null;
  selectVideo: (video: ProjectVideo | null) => void;

  // Project audio picker
  projectAudios: ProjectAudio[];
  projectAudiosLoading: boolean;
  fetchProjectAudios: (projectId: string) => Promise<void>;

  // Upload
  uploading: boolean;
  uploadError: string | null;
  uploadedImageUrl: string | null;
  uploadedImageFilename: string | null;
  uploadedImagePath: string | null;
  uploadImage: (
    projectId: string,
    base64: string,
    filename?: string,
  ) => Promise<string | null>;

  // Project images picker
  projectImages: ProjectImage[];
  projectImagesLoading: boolean;
  fetchProjectImages: (projectId: string) => Promise<void>;
  selectedImage: ProjectImage | null;
  selectImage: (img: ProjectImage | null) => void;

  // Character sheet picker
  characterSheets: ProjectImage[];
  characterSheetsLoading: boolean;
  fetchCharacterSheets: (projectId: string) => Promise<void>;

  // CSV batch generation
  csvRows: Record<string, string>[];
  csvColumns: string[];
  csvFilename: string | null;
  csvSelectedIndices: Set<number>;
  batchRunning: boolean;
  batchProgress: { current: number; total: number } | null;
  batchCancelRequested: boolean;
  uploadCsv: (base64: string, filename: string) => void;
  clearCsvData: () => void;
  toggleCsvRow: (index: number) => void;
  selectAllCsvRows: () => void;
  deselectAllCsvRows: () => void;
  updateCsvCell: (rowIndex: number, column: string, value: string) => void;
  generateBatchVideos: (projectId: string) => Promise<void>;
  cancelBatch: () => void;

  // Reset
  resetAll: () => void;
}

export interface ProjectImage {
  filename: string;
  url: string;
  source: "upload" | "generated" | "characterSheet";
}

export interface ProjectVideo {
  filename: string;
  url: string;
}

export interface ProjectAudio {
  filename: string;
  url: string;
}

// ========== SSE Stream Reader ==========

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
            const data = JSON.parse(line.slice(6));
            onEvent(eventType, data);
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

// ========== CSV Parser ==========

function parseCsv(text: string): {
  rows: Record<string, string>[];
  columns: string[];
} {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });
  return { rows: result.data, columns: result.meta.fields || [] };
}

// ========== MLX-Gen Image Edit Helper ==========

function resolveImageUrl(url: string): string {
  if (url.startsWith("http")) return url;
  return `http://localhost:${(window as any).PORT}${url}`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

/**
 * Load an image from a URL and re-encode it as a PNG whose longest edge is at
 * most `maxDim` pixels (preserving aspect ratio). PNG is lossless, so the
 * result is always full quality. Returns the base64 data URL together with the
 * original image dimensions, or null on failure.
 */
async function resizeImageToPng(
  url: string,
  maxDim = 1024,
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    try {
      const img = await loadImage(objectUrl);
      const { width, height } = img;
      const longest = Math.max(width, height);
      const scale = longest > maxDim ? maxDim / longest : 1;
      const w = Math.max(1, Math.round(width * scale));
      const h = Math.max(1, Math.round(height * scale));

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, w, h);
      return { dataUrl: canvas.toDataURL("image/png"), width, height };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return null;
  }
}

async function requestFastImageEdit(
  body: {
    prompt: string;
    images: string[];
    projectId: string;
  },
  onLog: (text: string) => void,
): Promise<{ ok: boolean; error?: string; result?: string }> {
  const res = await fetch(`${API_BASE}/api/mlxgen/fast-image-edit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    return { ok: false, error: await res.text() };
  }

  let result: string | undefined;
  let error: string | undefined;

  await readSSEStream(res, (event, data) => {
    switch (event) {
      case "log":
        onLog(data.text as string);
        break;
      case "complete":
        result = `http://localhost:${(window as any).PORT}/api/files?path=${encodeURIComponent(data.path)}`;
        break;
      case "error":
        error = data.error || "Fast image edit failed";
        break;
    }
  });

  return { ok: !error, error, result };
}

// ========== Abort Controllers ==========

let generateAbortController: AbortController | null = null;
let batchAbortController: AbortController | null = null;

// ========== Beep ==========

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

// ========== Initial State ==========

const initialImage: ImageState = {
  prompt: "",
  aspectRatio: "1:1",
  resolution: "480p",
  generating: false,
  result: null,
  error: null,
  logs: [],
};

const initialVideo: VideoState = {
  prompt: `[a 4 years old little lamb happily says]: {{book}}. Chapter {{chapter}}. Verse {{verses}}. {{script}}`,
  duration: 5,
  aspectRatio: "1:1",
  resolution: "480p",
  mode: "distilled",
  generating: false,
  result: null,
  error: null,
  logs: [],
};

const initialExtend: ExtendState = {
  prompt: "Continue the scene: the camera holds, motion flows naturally...",
  extendDuration: 2,
  extendFrames: 2 * 24 + 1,
  generating: false,
  result: null,
  error: null,
  logs: [],
};

const TEXT_TO_IMAGE_PRESETS: Record<
  TextToImagePreset,
  {
    aspectRatio: AspectRatio;
    resolution: Resolution;
    steps: number;
  }
> = {
  prototype: {
    aspectRatio: "1:1",
    resolution: "320p",
    steps: 4,
  },
  medium: {
    aspectRatio: "1:1",
    resolution: "720p",
    steps: 7,
  },
  optimal: {
    aspectRatio: "1:1",
    resolution: "1080p",
    steps: 6,
  },
};

const initialTextToImage: TextToImageState = {
  prompt: "",
  aspectRatio: "1:1",
  resolution: "480p",
  steps: 4,
  installing: false,
  installingLogs: [],
  installingError: null,
  downloading: false,
  downloadingLogs: [],
  downloadingError: null,
  generating: false,
  result: null,
  error: null,
  logs: [],
  mlxgenInstalled: null,
  zModelDownloaded: null,
};

const initialFastImageEdit: FastImageEditState = {
  prompt: "",
  referenceImages: [],
  downloading: false,
  downloadingLogs: [],
  downloadingError: null,
  generating: false,
  result: null,
  error: null,
  logs: [],
  modelDownloaded: null,
};

const initialAgent: AgentState = {
  model: "mlx-community/gemma-4-e4b-it-8bit",
  port: 8881,
  installing: false,
  installingLogs: [],
  installingError: null,
  installed: null,
  starting: false,
  serverRunning: false,
  serverOnline: null,
  serverLogs: [],
  serverError: null,
};

// ========== Store ==========

function toPersistedTextToImageState(
  t: TextToImageState,
): PersistedTextToImageState {
  return {
    prompt: t.prompt,
    aspectRatio: t.aspectRatio,
    resolution: t.resolution,
    steps: t.steps,
  };
}

// Fire-and-forget save of the current editable text-to-image UI state.
function persistTextToImageState() {
  const { textToImageProjectId } = useGenerationStore.getState();
  if (!textToImageProjectId) return;
  void saveTextToImageState(
    textToImageProjectId,
    toPersistedTextToImageState(useGenerationStore.getState().textToImage),
  );
}

export const useGenerationStore = create<GenerationStore>((set, get) => ({
  activeTab: "movieStudio",
  setActiveTab: (tab) => set({ activeTab: tab }),

  // ---- Image ----
  image: { ...initialImage },

  setImagePrompt: (prompt) =>
    set((s) => ({ image: { ...s.image, prompt, error: null } })),
  setImageAspectRatio: (aspectRatio) =>
    set((s) => ({ image: { ...s.image, aspectRatio } })),
  setImageResolution: (resolution) =>
    set((s) => ({ image: { ...s.image, resolution } })),
  clearImageResult: () =>
    set((s) => ({
      image: { ...s.image, result: null, error: null, logs: [] },
    })),

  generateImage: async (projectId) => {
    const { image } = get();
    if (!image.prompt.trim() || image.generating) return;

    const { width, height } = getDimensions(
      image.aspectRatio,
      image.resolution,
    );

    set((s) => ({
      image: {
        ...s.image,
        generating: true,
        error: null,
        result: null,
        logs: [],
      },
    }));

    try {
      const res = await fetch(`${API_BASE}/api/render/text-to-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: image.prompt.trim(),
          projectId,
          aspect: image.aspectRatio,
          width,
          height,
          device: "mps",
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        set((s) => ({
          image: { ...s.image, generating: false, error: err },
        }));
        return;
      }

      await readSSEStream(res, (event, data) => {
        switch (event) {
          case "log":
            set((s) => ({
              image: {
                ...s.image,
                logs: [...s.image.logs, data.text as string],
              },
            }));
            break;
          case "complete":
            set((s) => ({
              image: {
                ...s.image,
                generating: false,
                result: `http://localhost:${(window as any).PORT}/api/files?path=${encodeURIComponent(data.path)}`,
              },
            }));
            break;
          case "error":
            set((s) => ({
              image: {
                ...s.image,
                generating: false,
                error: data.error || "Image generation failed",
              },
            }));
            break;
        }
      });
    } catch (e) {
      set((s) => ({
        image: { ...s.image, generating: false, error: String(e) },
      }));
    }
  },

  // ---- Video ----
  video: { ...initialVideo },

  setVideoPrompt: (prompt) =>
    set((s) => ({ video: { ...s.video, prompt, error: null } })),
  setVideoDuration: (duration) =>
    set((s) => ({ video: { ...s.video, duration } })),
  setVideoAspectRatio: (aspectRatio) =>
    set((s) => ({ video: { ...s.video, aspectRatio } })),
  setVideoResolution: (resolution) =>
    set((s) => ({ video: { ...s.video, resolution } })),
  setVideoMode: (mode) => set((s) => ({ video: { ...s.video, mode } })),
  clearVideoResult: () =>
    set((s) => ({
      video: { ...s.video, result: null, error: null, logs: [] },
    })),

  generateVideo: async (projectId, imagePath?) => {
    const { video } = get();
    if (!video.prompt.trim() || video.generating) return;

    const { width, height } = getDimensions(
      video.aspectRatio,
      video.resolution,
    );

    // Use the provided imagePath, or fall back to uploaded image, or generated image
    let resolvedImagePath =
      imagePath ||
      get().uploadedImagePath ||
      get().uploadedImageUrl ||
      get().image.result;

    if (!resolvedImagePath) {
      set((s) => ({
        video: {
          ...s.video,
          error: "Image path is required. Upload or generate an image first.",
        },
      }));
      return;
    }

    // Extract raw file path from HTTP URL (e.g. http://localhost:PORT/api/files?path=...)
    if (resolvedImagePath.includes("/api/files?path=")) {
      try {
        const url = new URL(resolvedImagePath);
        resolvedImagePath = url.searchParams.get("path") || resolvedImagePath;
      } catch {
        // not a valid URL, use as-is
      }
    }

    // Strip any remaining file:// prefix
    if (resolvedImagePath.startsWith("file://")) {
      resolvedImagePath = resolvedImagePath.slice(7);
    }

    // The backend now only accepts bare filenames — extract just the basename
    resolvedImagePath = resolvedImagePath.split("/").pop() || resolvedImagePath;

    // Create a fresh AbortController for this single generate run
    generateAbortController = new AbortController();
    const signal = generateAbortController.signal;

    set((s) => ({
      video: {
        ...s.video,
        generating: true,
        error: null,
        result: null,
        logs: [],
      },
    }));

    try {
      const res = await fetch(`${API_BASE}/api/render/image-to-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: video.prompt.trim(),
          imagePath: resolvedImagePath,
          projectId,
          width,
          height,
          frames: video.duration * 24 + 1,
          frameRate: 24,
          mode: video.mode,
        }),
        signal,
      });

      if (!res.ok) {
        const err = await res.text();
        set((s) => ({
          video: { ...s.video, generating: false, error: err },
        }));
        generateAbortController = null;
        return;
      }

      await readSSEStream(res, (event, data) => {
        switch (event) {
          case "log":
            set((s) => ({
              video: {
                ...s.video,
                logs: [...s.video.logs, data.text as string],
              },
            }));
            break;
          case "complete":
            set((s) => ({
              video: {
                ...s.video,
                generating: false,
                result: `http://localhost:${(window as any).PORT}/api/files?path=${encodeURIComponent(data.path)}`,
              },
            }));
            break;
          case "error":
            set((s) => ({
              video: {
                ...s.video,
                generating: false,
                error: data.error || "Video generation failed",
              },
            }));
            break;
        }
      });
    } catch (e: any) {
      // If the request was aborted, just stop silently
      if (e?.name !== "AbortError") {
        set((s) => ({
          video: { ...s.video, generating: false, error: String(e) },
        }));
      } else {
        set((s) => ({
          video: { ...s.video, generating: false },
        }));
      }
    } finally {
      generateAbortController = null;
    }
  },

  // ---- Upload ----
  uploading: false,
  uploadError: null,
  uploadedImageUrl: null,
  uploadedImageFilename: null,
  uploadedImagePath: null,

  uploadImage: async (projectId, base64, filename) => {
    set({ uploading: true, uploadError: null });
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
        set({ uploading: false, uploadError: err });
        return null;
      }

      const data = await res.json();
      const url = `http://localhost:${(window as any).PORT}/api/files?path=${encodeURIComponent(data.path)}`;
      set({
        uploading: false,
        uploadedImageUrl: url,
        uploadedImageFilename: data.filename,
        uploadedImagePath: data.path,
      });
      return data.path as string;
    } catch (e) {
      set({ uploading: false, uploadError: String(e) });
      return null;
    }
  },

  // ---- Project Images ----
  projectImages: [],
  projectImagesLoading: false,
  selectedImage: null,

  fetchProjectImages: async (projectId) => {
    set({ projectImagesLoading: true });
    try {
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/images`);
      if (!res.ok) throw new Error(await res.text());
      const images: ProjectImage[] = await res.json();
      // Resolve relative URLs to absolute so they work regardless of page origin
      const resolved = images.map((img) => ({
        ...img,
        url: img.url.startsWith("http")
          ? img.url
          : `http://localhost:${(window as any).PORT}${img.url}`,
      }));
      set({ projectImages: resolved, projectImagesLoading: false });
    } catch {
      set({ projectImagesLoading: false });
    }
  },

  // ---- Character Sheets ----
  characterSheets: [],
  characterSheetsLoading: false,

  fetchCharacterSheets: async (projectId) => {
    set({ characterSheetsLoading: true });
    try {
      const res = await fetch(
        `${API_BASE}/api/projects/${projectId}/character-sheets`,
      );
      if (!res.ok) throw new Error(await res.text());
      const sheets: { filename: string; url: string }[] = await res.json();
      const resolved: ProjectImage[] = sheets.map((sheet) => ({
        filename: sheet.filename,
        url: sheet.url.startsWith("http")
          ? sheet.url
          : `http://localhost:${(window as any).PORT}${sheet.url}`,
        source: "characterSheet",
      }));
      set({ characterSheets: resolved, characterSheetsLoading: false });
    } catch {
      set({ characterSheetsLoading: false });
    }
  },

  // ---- CSV Batch ----
  csvRows: [],
  csvColumns: [],
  csvFilename: null,
  csvSelectedIndices: new Set<number>(),
  batchRunning: false,
  batchProgress: null,
  batchCancelRequested: false,

  uploadCsv: (base64, filename) => {
    try {
      // Decode base64 (strip data URL prefix if present)
      const raw = base64
        .replace(/^data:text\/csv;base64,/, "")
        .replace(/^data:application\/csv;base64,/, "")
        .replace(/^data:text\/plain;base64,/, "");
      // atob() returns a binary string (bytes as Latin-1), which corrupts
      // multi-byte UTF-8 characters (Chinese, emoji, etc.). Decode properly
      // via TextDecoder so CSV names render correctly in Mustache templates.
      const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
      const text = new TextDecoder("utf-8").decode(bytes);
      const { rows, columns } = parseCsv(text);
      // Auto-select all rows
      const allIndices = new Set(rows.map((_, i) => i));
      set({
        csvRows: rows,
        csvColumns: columns,
        csvFilename: filename,
        csvSelectedIndices: allIndices,
      });
    } catch {
      set({
        csvRows: [],
        csvColumns: [],
        csvFilename: null,
        csvSelectedIndices: new Set(),
      });
    }
  },

  clearCsvData: () =>
    set({
      csvRows: [],
      csvColumns: [],
      csvFilename: null,
      csvSelectedIndices: new Set(),
      batchRunning: false,
      batchProgress: null,
      batchCancelRequested: false,
    }),

  toggleCsvRow: (index) =>
    set((s) => {
      const next = new Set(s.csvSelectedIndices);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return { csvSelectedIndices: next };
    }),

  selectAllCsvRows: () =>
    set((s) => ({
      csvSelectedIndices: new Set(s.csvRows.map((_, i) => i)),
    })),

  deselectAllCsvRows: () => set({ csvSelectedIndices: new Set() }),

  updateCsvCell: (rowIndex, column, value) =>
    set((s) => {
      const updated = s.csvRows.map((row, i) =>
        i === rowIndex ? { ...row, [column]: value } : row,
      );
      return { csvRows: updated };
    }),

  generateBatchVideos: async (projectId) => {
    const { video, csvRows, csvSelectedIndices, batchRunning } = get();
    // Only process selected rows
    const selectedIndices = Array.from(csvSelectedIndices).sort(
      (a, b) => a - b,
    );
    if (batchRunning || selectedIndices.length === 0) return;

    const { width, height } = getDimensions(
      video.aspectRatio,
      video.resolution,
    );

    // Create a fresh AbortController for this batch run
    batchAbortController = new AbortController();
    const signal = batchAbortController.signal;

    set({
      batchRunning: true,
      batchProgress: { current: 0, total: selectedIndices.length },
      batchCancelRequested: false,
    });

    for (let batchIdx = 0; batchIdx < selectedIndices.length; batchIdx++) {
      if (get().batchCancelRequested) break;

      const i = selectedIndices[batchIdx];

      set({
        batchProgress: { current: batchIdx + 1, total: selectedIndices.length },
      });

      const rowData = csvRows[i];
      const renderedPrompt = Mustache.render(`${video.prompt}`, { ...rowData });

      // Build a name-tagged prompt suffix so the output filename reflects the row
      // const nameTag = rowData.name ? ` [${rowData.name}]` : "";

      // Call the single-video generation with the rendered prompt
      // We use the existing generateVideo logic but inline it here for batch
      let resolvedImagePath =
        get().uploadedImagePath || get().uploadedImageUrl || get().image.result;

      if (!resolvedImagePath) continue;

      if (resolvedImagePath.includes("/api/files?path=")) {
        try {
          const url = new URL(resolvedImagePath);
          resolvedImagePath = url.searchParams.get("path") || resolvedImagePath;
        } catch {
          // not a valid URL, use as-is
        }
      }
      if (resolvedImagePath.startsWith("file://")) {
        resolvedImagePath = resolvedImagePath.slice(7);
      }
      resolvedImagePath =
        resolvedImagePath.split("/").pop() || resolvedImagePath;

      set((s) => ({
        video: {
          ...s.video,
          generating: true,
          error: null,
          result: null,
          logs: [],
        },
      }));

      try {
        const res = await fetch(`${API_BASE}/api/render/image-to-video`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: `${renderedPrompt}`, //${nameTag}
            imagePath: resolvedImagePath,
            projectId,
            width,
            height,
            frames: video.duration * 24 + 1,
            frameRate: 24,
            mode: video.mode,
          }),
          signal,
        });

        if (!res.ok) {
          const err = await res.text();
          set((s) => ({
            video: { ...s.video, generating: false, error: err },
          }));
          continue;
        }

        await readSSEStream(res, (event, data) => {
          switch (event) {
            case "log":
              set((s) => ({
                video: {
                  ...s.video,
                  logs: [
                    ...s.video.logs,
                    `[${batchIdx + 1}/${selectedIndices.length}] ${data.text as string}`,
                  ],
                },
              }));
              break;
            case "complete":
              set((s) => ({
                video: {
                  ...s.video,
                  generating: false,
                  result: `http://localhost:${(window as any).PORT}/api/files?path=${encodeURIComponent(data.path)}`,
                },
              }));
              break;
            case "error":
              set((s) => ({
                video: {
                  ...s.video,
                  generating: false,
                  error: data.error || "Video generation failed",
                },
              }));
              break;
          }
        });
      } catch (e: any) {
        // If the request was aborted, just stop silently
        if (e?.name === "AbortError") break;
        set((s) => ({
          video: { ...s.video, generating: false, error: String(e) },
        }));
      }
    }

    const finished = !get().batchCancelRequested;
    batchAbortController = null;
    set({
      batchRunning: false,
      batchProgress: null,
      batchCancelRequested: false,
    });

    if (finished) {
      playBeep();
    }
  },

  // ---- Video Extension ----
  extend: { ...initialExtend },

  setExtendPrompt: (prompt) =>
    set((s) => ({ extend: { ...s.extend, prompt, error: null } })),
  setExtendDuration: (extendDuration) =>
    set((s) => ({
      extend: {
        ...s.extend,
        extendDuration,
        extendFrames: extendDuration * 24 + 1,
      },
    })),
  setExtendFrames: (extendFrames) =>
    set((s) => ({
      extend: {
        ...s.extend,
        extendFrames,
        extendDuration: Math.max(0.5, (extendFrames - 1) / 24),
      },
    })),
  clearExtendResult: () =>
    set((s) => ({
      extend: { ...s.extend, result: null, error: null, logs: [] },
    })),

  generateExtend: async (projectId, videoPath) => {
    const { extend } = get();
    if (!extend.prompt.trim() || extend.generating) return;

    // Extract raw file path from HTTP URL (e.g. http://localhost:PORT/api/files?path=...)
    let resolvedVideoPath = videoPath || "";
    if (!resolvedVideoPath) {
      set((s) => ({
        extend: { ...s.extend, error: "Select a video to extend first." },
      }));
      return;
    }
    if (resolvedVideoPath.includes("/api/files?path=")) {
      try {
        const url = new URL(resolvedVideoPath);
        resolvedVideoPath = url.searchParams.get("path") || resolvedVideoPath;
      } catch {
        // not a valid URL, use as-is
      }
    }
    if (resolvedVideoPath.startsWith("file://")) {
      resolvedVideoPath = resolvedVideoPath.slice(7);
    }
    // The backend only accepts bare filenames — extract just the basename
    resolvedVideoPath = resolvedVideoPath.split("/").pop() || resolvedVideoPath;

    // Create a fresh AbortController for this extend run
    generateAbortController = new AbortController();
    const signal = generateAbortController.signal;

    set((s) => ({
      extend: {
        ...s.extend,
        generating: true,
        error: null,
        result: null,
        logs: [],
      },
    }));

    try {
      const res = await fetch(`${API_BASE}/api/render/extend-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: extend.prompt.trim(),
          videoPath: resolvedVideoPath,
          projectId,
          extendFrames: extend.extendDuration * 24 + 1,
        }),
        signal,
      });

      if (!res.ok) {
        const err = await res.text();
        set((s) => ({
          extend: { ...s.extend, generating: false, error: err },
        }));
        generateAbortController = null;
        return;
      }

      await readSSEStream(res, (event, data) => {
        switch (event) {
          case "log":
            set((s) => ({
              extend: {
                ...s.extend,
                logs: [...s.extend.logs, data.text as string],
              },
            }));
            break;
          case "complete":
            set((s) => ({
              extend: {
                ...s.extend,
                generating: false,
                result: `http://localhost:${(window as any).PORT}/api/files?path=${encodeURIComponent(data.path)}`,
              },
            }));
            // Refresh the video grid so the new extended-*.mp4 appears
            get().fetchProjectVideos(projectId);
            break;
          case "error":
            set((s) => ({
              extend: {
                ...s.extend,
                generating: false,
                error: data.error || "Video extension failed",
              },
            }));
            break;
        }
      });
    } catch (e: any) {
      // If the request was aborted, just stop silently
      if (e?.name !== "AbortError") {
        set((s) => ({
          extend: { ...s.extend, generating: false, error: String(e) },
        }));
      } else {
        set((s) => ({ extend: { ...s.extend, generating: false } }));
      }
    } finally {
      generateAbortController = null;
    }
  },

  // ---- Fast Image Edit (FLUX.2 Klein) ----
  fastImageEdit: { ...initialFastImageEdit },

  setFastImageEditPrompt: (prompt) =>
    set((s) => ({
      fastImageEdit: { ...s.fastImageEdit, prompt, error: null },
    })),

  toggleFastImageEditImage: (img) =>
    set((s) => {
      const current = s.fastImageEdit.referenceImages;
      const exists = current.some((r) => r.filename === img.filename);
      const next = exists
        ? current.filter((r) => r.filename !== img.filename)
        : current.length >= 4
          ? current
          : [...current, img];
      return { fastImageEdit: { ...s.fastImageEdit, referenceImages: next } };
    }),

  clearFastImageEditImages: () =>
    set((s) => ({
      fastImageEdit: { ...s.fastImageEdit, referenceImages: [] },
    })),

  clearFastImageEditResult: () =>
    set((s) => ({
      fastImageEdit: {
        ...s.fastImageEdit,
        result: null,
        error: null,
        logs: [],
      },
    })),

  checkFastImageEditStatus: async () => {
    try {
      const res = await fetch(`${API_BASE}/api/mlxgen/status`);
      if (!res.ok) return;
      const data = await res.json();
      set((s) => ({
        fastImageEdit: {
          ...s.fastImageEdit,
          modelDownloaded: Boolean(data.fluxModelDownloaded),
        },
      }));
    } catch {
      // Leave status unknown (null) if the check fails.
    }
  },

  downloadFastImageEditModel: async () => {
    const { fastImageEdit } = get();
    if (fastImageEdit.downloading) return;

    set((s) => ({
      fastImageEdit: {
        ...s.fastImageEdit,
        downloading: true,
        downloadingError: null,
        downloadingLogs: [],
      },
    }));

    try {
      const res = await fetch(`${API_BASE}/api/mlxgen/download-flux-model`, {
        method: "POST",
      });

      if (!res.ok) {
        const err = await res.text();
        set((s) => ({
          fastImageEdit: {
            ...s.fastImageEdit,
            downloading: false,
            downloadingError: err,
          },
        }));
        return;
      }

      await readSSEStream(res, (event, data) => {
        switch (event) {
          case "log":
            set((s) => ({
              fastImageEdit: {
                ...s.fastImageEdit,
                downloadingLogs: [
                  ...s.fastImageEdit.downloadingLogs,
                  data.text as string,
                ],
              },
            }));
            break;
          case "complete":
            set((s) => ({
              fastImageEdit: { ...s.fastImageEdit, downloading: false },
            }));
            get().checkFastImageEditStatus();
            break;
          case "error":
            set((s) => ({
              fastImageEdit: {
                ...s.fastImageEdit,
                downloading: false,
                downloadingError: data.error || "Download failed",
              },
            }));
            break;
        }
      });
    } catch (e) {
      set((s) => ({
        fastImageEdit: {
          ...s.fastImageEdit,
          downloading: false,
          downloadingError: String(e),
        },
      }));
    }
  },

  generateFastImageEdit: async (projectId) => {
    const { fastImageEdit } = get();
    if (fastImageEdit.generating) return;

    if (!fastImageEdit.prompt.trim()) {
      set((s) => ({
        fastImageEdit: { ...s.fastImageEdit, error: "Prompt is required" },
      }));
      return;
    }
    if (fastImageEdit.referenceImages.length === 0) {
      set((s) => ({
        fastImageEdit: {
          ...s.fastImageEdit,
          error: "Select at least one reference image.",
        },
      }));
      return;
    }

    set((s) => ({
      fastImageEdit: {
        ...s.fastImageEdit,
        generating: true,
        error: null,
        result: null,
        logs: [],
      },
    }));

    // Preprocess each reference image (max 1024px PNG) and send as base64.
    const images: string[] = [];
    for (const img of fastImageEdit.referenceImages) {
      const processed = await resizeImageToPng(resolveImageUrl(img.url), 1024);
      if (!processed) {
        set((s) => ({
          fastImageEdit: {
            ...s.fastImageEdit,
            generating: false,
            error: "Failed to process reference image.",
          },
        }));
        return;
      }
      images.push(processed.dataUrl);
    }

    const result = await requestFastImageEdit(
      {
        prompt: fastImageEdit.prompt.trim(),
        images,
        projectId,
      },
      (text) =>
        set((s) => ({
          fastImageEdit: {
            ...s.fastImageEdit,
            logs: [...s.fastImageEdit.logs, text],
          },
        })),
    );

    set((s) => ({
      fastImageEdit: {
        ...s.fastImageEdit,
        generating: false,
        result: result.result ?? null,
        error: result.error ?? null,
      },
    }));

    if (result.ok) {
      get().fetchProjectImages(projectId);
    }
  },

  // ---- Text-to-image (mlx-gen z-image-turbo) ----
  textToImage: { ...initialTextToImage },
  textToImageProjectId: null,
  textToImageHydrated: false,

  hydrateTextToImage: async (projectId) => {
    // No-op if we've already hydrated for this project.
    if (get().textToImageHydrated && get().textToImageProjectId === projectId) {
      return;
    }

    // Switching projects: reset to defaults so the previous project's settings
    // don't leak through, then load the stored state (if any) below.
    const previous = get().textToImageProjectId;
    if (previous !== null && previous !== projectId) {
      get().resetTextToImage();
    }
    set({ textToImageHydrated: true, textToImageProjectId: projectId });

    const stored = await loadTextToImageState(projectId);
    if (!stored) return;

    set((s) => ({
      textToImage: {
        ...s.textToImage,
        prompt: stored.prompt ?? s.textToImage.prompt,
        aspectRatio: stored.aspectRatio ?? s.textToImage.aspectRatio,
        resolution: stored.resolution ?? s.textToImage.resolution,
        steps: stored.steps ?? s.textToImage.steps,
      },
    }));
  },

  resetTextToImage: () => set({ textToImage: { ...initialTextToImage } }),

  setTextToImagePrompt: (prompt) => {
    set((s) => ({ textToImage: { ...s.textToImage, prompt, error: null } }));
    persistTextToImageState();
  },

  setTextToImageAspectRatio: (aspectRatio) => {
    set((s) => ({ textToImage: { ...s.textToImage, aspectRatio } }));
    persistTextToImageState();
  },

  setTextToImageResolution: (resolution) => {
    set((s) => ({ textToImage: { ...s.textToImage, resolution } }));
    persistTextToImageState();
  },

  setTextToImageSteps: (steps) => {
    set((s) => ({ textToImage: { ...s.textToImage, steps } }));
    persistTextToImageState();
  },

  applyTextToImagePreset: (preset) => {
    const p = TEXT_TO_IMAGE_PRESETS[preset];
    set((s) => ({ textToImage: { ...s.textToImage, ...p } }));
    persistTextToImageState();
  },

  clearTextToImageResult: () =>
    set((s) => ({
      textToImage: { ...s.textToImage, result: null, error: null, logs: [] },
    })),

  checkTextToImageStatus: async () => {
    try {
      const res = await fetch(`${API_BASE}/api/mlxgen/status`);
      if (!res.ok) return;
      const data = await res.json();
      set((s) => ({
        textToImage: {
          ...s.textToImage,
          mlxgenInstalled: Boolean(data.installed),
          zModelDownloaded: Boolean(data.zModelDownloaded),
        },
      }));
    } catch {
      // Leave status unknown (null) if the check fails.
    }
  },

  installTextToImage: async () => {
    const { textToImage } = get();
    if (textToImage.installing) return;

    set((s) => ({
      textToImage: {
        ...s.textToImage,
        installing: true,
        installingError: null,
        installingLogs: [],
      },
    }));

    try {
      const res = await fetch(`${API_BASE}/api/mlxgen/install`, {
        method: "POST",
      });

      if (!res.ok) {
        const err = await res.text();
        set((s) => ({
          textToImage: {
            ...s.textToImage,
            installing: false,
            installingError: err,
          },
        }));
        return;
      }

      await readSSEStream(res, (event, data) => {
        switch (event) {
          case "log":
            set((s) => ({
              textToImage: {
                ...s.textToImage,
                installingLogs: [
                  ...s.textToImage.installingLogs,
                  data.text as string,
                ],
              },
            }));
            break;
          case "complete":
            set((s) => ({
              textToImage: { ...s.textToImage, installing: false },
            }));
            get().checkTextToImageStatus();
            break;
          case "error":
            set((s) => ({
              textToImage: {
                ...s.textToImage,
                installing: false,
                installingError: data.error || "Install failed",
              },
            }));
            break;
        }
      });
    } catch (e) {
      set((s) => ({
        textToImage: {
          ...s.textToImage,
          installing: false,
          installingError: String(e),
        },
      }));
    }
  },

  downloadTextToImageModel: async () => {
    if (get().textToImage.downloading) return;

    set((s) => ({
      textToImage: {
        ...s.textToImage,
        downloading: true,
        downloadingError: null,
        downloadingLogs: [],
      },
    }));

    try {
      const res = await fetch(`${API_BASE}/api/mlxgen/download-z-model`, {
        method: "POST",
      });

      if (!res.ok) {
        const err = await res.text();
        set((s) => ({
          textToImage: {
            ...s.textToImage,
            downloading: false,
            downloadingError: err,
          },
        }));
        return;
      }

      await readSSEStream(res, (event, data) => {
        switch (event) {
          case "log":
            set((s) => ({
              textToImage: {
                ...s.textToImage,
                downloadingLogs: [
                  ...s.textToImage.downloadingLogs,
                  data.text as string,
                ],
              },
            }));
            break;
          case "complete":
            set((s) => ({
              textToImage: {
                ...s.textToImage,
                downloading: false,
              },
            }));
            get().checkTextToImageStatus();
            break;
          case "error":
            set((s) => ({
              textToImage: {
                ...s.textToImage,
                downloading: false,
                downloadingError: data.error || "Download failed",
              },
            }));
            break;
        }
      });
    } catch (e) {
      set((s) => ({
        textToImage: {
          ...s.textToImage,
          downloading: false,
          downloadingError: String(e),
        },
      }));
    }
  },

  generateTextToImage: async (projectId) => {
    const { textToImage } = get();
    if (!textToImage.prompt.trim() || textToImage.generating) return;

    const { width, height } = getDimensions(
      textToImage.aspectRatio,
      textToImage.resolution,
    );

    // Create a fresh AbortController so this run can be cancelled independently.
    generateAbortController = new AbortController();
    const signal = generateAbortController.signal;

    set((s) => ({
      textToImage: {
        ...s.textToImage,
        generating: true,
        error: null,
        result: null,
        logs: [],
      },
    }));

    try {
      const res = await fetch(`${API_BASE}/api/mlxgen/text-to-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: textToImage.prompt.trim(),
          projectId,
          width,
          height,
          steps: textToImage.steps,
        }),
        signal,
      });

      if (!res.ok) {
        const err = await res.text();
        set((s) => ({
          textToImage: { ...s.textToImage, generating: false, error: err },
        }));
        return;
      }

      await readSSEStream(res, (event, data) => {
        switch (event) {
          case "log":
            set((s) => ({
              textToImage: {
                ...s.textToImage,
                logs: [...s.textToImage.logs, data.text as string],
              },
            }));
            break;
          case "complete":
            set((s) => ({
              textToImage: {
                ...s.textToImage,
                generating: false,
                result: `http://localhost:${(window as any).PORT}/api/files?path=${encodeURIComponent(data.path)}`,
              },
            }));
            get().fetchProjectImages(projectId);
            break;
          case "error":
            set((s) => ({
              textToImage: {
                ...s.textToImage,
                generating: false,
                error: data.error || "Text-to-image generation failed",
              },
            }));
            break;
        }
      });
    } catch (e: any) {
      // If the request was aborted, just stop silently.
      if (e?.name === "AbortError") {
        set((s) => ({ textToImage: { ...s.textToImage, generating: false } }));
      } else {
        set((s) => ({
          textToImage: {
            ...s.textToImage,
            generating: false,
            error: String(e),
          },
        }));
      }
    } finally {
      generateAbortController = null;
    }
  },

  // ---- Agent (mlx-vlm) ----
  agent: { ...initialAgent },

  setAgentModel: (model) => set((s) => ({ agent: { ...s.agent, model } })),

  setAgentPort: (port) => set((s) => ({ agent: { ...s.agent, port } })),

  checkAgentStatus: async () => {
    try {
      const res = await fetch(`${API_BASE}/api/agent/status`);
      if (!res.ok) return;
      const data = await res.json();
      set((s) => ({
        agent: {
          ...s.agent,
          installed: Boolean(data.installed),
          serverRunning: Boolean(data.serverRunning),
        },
      }));
    } catch {
      // Leave status unknown (null) if the check fails.
    }
  },

  checkServerOnline: async () => {
    const { port } = get().agent;
    try {
      // Any response (even 4xx/5xx) means the port is listening.
      await fetch(`http://localhost:${port}/v1/models`, {
        method: "GET",
      }).then((r) => {
        if (!r.ok) {
          throw new Error("server is offline");
        }
      });
      set((s) => ({ agent: { ...s.agent, serverOnline: true } }));
    } catch {
      set((s) => ({ agent: { ...s.agent, serverOnline: false } }));
    }
  },

  installMlxVlm: async () => {
    const { agent } = get();
    if (agent.installing) return;

    set((s) => ({
      agent: {
        ...s.agent,
        installing: true,
        installingError: null,
        installingLogs: [],
      },
    }));

    try {
      const res = await fetch(`${API_BASE}/api/agent/install`, {
        method: "POST",
      });

      if (!res.ok) {
        const err = await res.text();
        set((s) => ({
          agent: { ...s.agent, installing: false, installingError: err },
        }));
        return;
      }

      await readSSEStream(res, (event, data) => {
        switch (event) {
          case "log":
            set((s) => ({
              agent: {
                ...s.agent,
                installingLogs: [
                  ...s.agent.installingLogs,
                  data.text as string,
                ],
              },
            }));
            break;
          case "complete":
            set((s) => ({ agent: { ...s.agent, installing: false } }));
            get().checkAgentStatus();
            break;
          case "error":
            set((s) => ({
              agent: {
                ...s.agent,
                installing: false,
                installingError: data.error || "Install failed",
              },
            }));
            break;
        }
      });
    } catch (e) {
      set((s) => ({
        agent: {
          ...s.agent,
          installing: false,
          installingError: String(e),
        },
      }));
    }
  },

  startAgentServer: async () => {
    const { agent } = get();
    if (agent.starting || agent.serverRunning) return;

    set((s) => ({
      agent: {
        ...s.agent,
        starting: true,
        serverRunning: true,
        serverError: null,
        serverLogs: [],
      },
    }));

    try {
      const res = await fetch(`${API_BASE}/api/agent/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: agent.model, port: agent.port }),
      });

      if (!res.ok) {
        const err = await res.text();
        set((s) => ({
          agent: {
            ...s.agent,
            starting: false,
            serverRunning: false,
            serverError: err,
          },
        }));
        return;
      }

      await readSSEStream(res, (event, data) => {
        switch (event) {
          case "log":
            set((s) => ({
              agent: {
                ...s.agent,
                serverLogs: [...s.agent.serverLogs, data.text as string],
              },
            }));
            break;
          case "complete":
            set((s) => ({
              agent: { ...s.agent, starting: false, serverRunning: false },
            }));
            break;
          case "error":
            set((s) => ({
              agent: {
                ...s.agent,
                starting: false,
                serverRunning: false,
                serverError: data.error || "Server error",
              },
            }));
            break;
        }
      });
    } catch (e) {
      set((s) => ({
        agent: {
          ...s.agent,
          starting: false,
          serverRunning: false,
          serverError: String(e),
        },
      }));
    }
  },

  stopAgentServer: async () => {
    try {
      await fetch(`${API_BASE}/api/agent/stop`, { method: "POST" });
    } catch {
      // ignore stop failures
    }
    set((s) => ({
      agent: { ...s.agent, starting: false, serverRunning: false },
    }));
  },

  openAgentServer: async () => {
    const { agent } = get();
    const url = `http://localhost:${agent.port}`;
    try {
      await fetch(`${API_BASE}/api/agent/open`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
    } catch {
      // ignore open failures
    }
  },

  // ---- Project Videos ----
  projectVideos: [],
  projectVideosLoading: false,
  selectedVideo: null,

  fetchProjectVideos: async (projectId) => {
    set({ projectVideosLoading: true });
    try {
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/videos`);
      if (!res.ok) throw new Error(await res.text());
      const videos: ProjectVideo[] = await res.json();
      // Resolve relative URLs to absolute so they work regardless of page origin
      const resolved = videos.map((v) => ({
        ...v,
        url: v.url.startsWith("http")
          ? v.url
          : `http://localhost:${(window as any).PORT}${v.url}`,
      }));
      set({ projectVideos: resolved, projectVideosLoading: false });
    } catch {
      set({ projectVideosLoading: false });
    }
  },

  selectVideo: (video) => {
    if (!video) {
      set({ selectedVideo: null });
      return;
    }
    const fullUrl = video.url.startsWith("http")
      ? video.url
      : `http://localhost:${(window as any).PORT}${video.url}`;
    set({ selectedVideo: { ...video, url: fullUrl } });
  },

  // ---- Project Audio ----
  projectAudios: [],
  projectAudiosLoading: false,

  fetchProjectAudios: async (projectId) => {
    set({ projectAudiosLoading: true });
    try {
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/audios`);
      if (!res.ok) throw new Error(await res.text());
      const audios: ProjectAudio[] = await res.json();
      const resolved = audios.map((a) => ({
        ...a,
        url: a.url.startsWith("http")
          ? a.url
          : `http://localhost:${(window as any).PORT}${a.url}`,
      }));
      set({ projectAudios: resolved, projectAudiosLoading: false });
    } catch {
      set({ projectAudiosLoading: false });
    }
  },

  cancelGenerate: () => {
    if (generateAbortController) {
      generateAbortController.abort();
      generateAbortController = null;
    }
    // Immediately reset generating state so UI returns to ready
    set((s) => ({
      video: { ...s.video, generating: false },
      extend: { ...s.extend, generating: false },
      textToImage: { ...s.textToImage, generating: false },
    }));
    // Also kill the backend spawn process
    fetch(`${API_BASE}/api/render/cancel`, { method: "POST" }).catch(() => {});
  },

  cancelBatch: () => {
    set({ batchCancelRequested: true });
    if (batchAbortController) {
      batchAbortController.abort();
    }
    // Immediately reset running state so UI returns to ready
    set({
      batchRunning: false,
      batchProgress: null,
      batchCancelRequested: false,
    });
    // Also kill the backend spawn process
    fetch(`${API_BASE}/api/render/cancel`, { method: "POST" }).catch(() => {});
  },

  selectImage: (img) => {
    if (!img) {
      set({ selectedImage: null });
      return;
    }
    const fullUrl = img.url.startsWith("http")
      ? img.url
      : `http://localhost:${(window as any).PORT}${img.url}`;
    set({
      selectedImage: { ...img, url: fullUrl },
      uploadedImageUrl: fullUrl,
      uploadedImageFilename: img.filename,
    });
  },

  // ---- Reset ----
  resetAll: () =>
    set({
      activeTab: "movieStudio",
      image: { ...initialImage },
      video: { ...initialVideo },
      extend: { ...initialExtend },
      fastImageEdit: { ...initialFastImageEdit },
      textToImage: { ...initialTextToImage },
      textToImageProjectId: null,
      textToImageHydrated: false,
      agent: { ...initialAgent },
      uploading: false,
      uploadError: null,
      uploadedImageUrl: null,
      uploadedImageFilename: null,
      uploadedImagePath: null,
      projectImages: [],
      characterSheets: [],
      characterSheetsLoading: false,
      selectedImage: null,
      projectVideos: [],
      projectVideosLoading: false,
      selectedVideo: null,
      projectAudios: [],
      projectAudiosLoading: false,
      csvRows: [],
      csvColumns: [],
      csvFilename: null,
      csvSelectedIndices: new Set(),
      batchRunning: false,
      batchProgress: null,
      batchCancelRequested: false,
    }),
}));
