import { create } from "zustand";
import type { QueueTask } from "./queueStore";

const API_BASE = `http://localhost:${(window as any).PORT}`;

/** Play three short "ding" sounds to signal a finished generation task. */
function playDing3x() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    for (let i = 0; i < 3; i++) {
      const t = ctx.currentTime + i * 0.35;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.32);
    }
  } catch {
    // silently ignore if audio is unavailable
  }
}

/** Track task ids whose completed result has already been applied. */
const appliedCompleted = new Set<string>();

/** Track task ids already counted toward their batch's completion. */
const countedBatch = new Set<string>();

interface BatchTracker {
  kind: "assets" | "sceneImages" | "videos" | "render";
  total: number;
  finished: number;
}

/** In-flight bulk render batches, keyed by the batchId stamped on each task. */
const batches = new Map<string, BatchTracker>();

function makeBatchId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `b-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

/** Reset the aggregate spinner once a batch finishes and play a completion ding. */
function finalizeBatch(batchId: string, set: (patch: any) => void): void {
  const b = batches.get(batchId);
  if (!b) return;
  batches.delete(batchId);
  switch (b.kind) {
    case "assets":
      set({
        assetsRendering: false,
        assetStatus: b.finished > 0 ? "Assets rendered" : null,
      });
      break;
    case "sceneImages":
      set({
        sceneImagesRendering: false,
        sceneImageStatus: b.finished > 0 ? "Scene images rendered" : null,
        sceneImageProgress: null,
      });
      break;
    case "videos":
      set({
        videosRendering: false,
        videoStatus: b.finished > 0 ? "Videos rendered" : null,
        videoProgress: null,
      });
      break;
    case "render":
      set({
        rendering: false,
        renderStatus: b.finished > 0 ? "Render complete" : null,
        renderProgress: null,
      });
      break;
  }
  if (b.finished > 0) playDing3x();
}

/** Count one finished batch task; update progress and finalize when complete. */
function finishBatch(batchId: string, set: (patch: any) => void): void {
  const b = batches.get(batchId);
  if (!b) return;
  b.finished += 1;
  if (b.finished < b.total) {
    const status = `${b.finished}/${b.total} rendered`;
    if (b.kind === "assets") set({ assetStatus: status });
    else if (b.kind === "sceneImages") set({ sceneImageStatus: status });
    else if (b.kind === "videos") set({ videoStatus: status });
    else if (b.kind === "render") set({ renderStatus: status });
    return;
  }
  finalizeBatch(batchId, set);
}

/** Surface a per-item failure and count it toward its batch on terminal status. */
function handleBatchTerminal(task: QueueTask, set: (patch: any) => void): void {
  const batchId = task.payload?.batchId;
  if (!batchId) return;
  if (countedBatch.has(task.id)) return;
  countedBatch.add(task.id);

  if (task.status === "failed") {
    const b = batches.get(batchId);
    if (b) {
      if (b.kind === "assets") set({ assetsError: task.error });
      else if (b.kind === "sceneImages") set({ sceneImagesError: task.error });
      else if (b.kind === "videos") set({ videosError: task.error });
      else if (b.kind === "render") set({ renderError: task.error });
    }
  }
  finishBatch(batchId, set);
}

export interface MovieCharacter {
  slug: string;
  name: string;
  imagePrompt: string;
}

export interface MoviePlace {
  slug: string;
  name: string;
  imagePrompt: string;
}

export interface MovieScriptLine {
  characterSlug: string;
  line: string;
}

export interface MovieScene {
  slug: string;
  duration: number;
  description: string;
  characterSlugs: string[];
  placeSlug: string;
  scriptLines: MovieScriptLine[];
  voiceOver: string;
  imagePrompt: string;
}

export interface MovieStudioResult {
  characters: MovieCharacter[];
  places: MoviePlace[];
  scenes: MovieScene[];
}

export interface AssetImage {
  kind: "character" | "place";
  slug: string;
  filename: string;
  url: string;
  updatedAt: number;
}

export interface RenderedScene {
  slug: string;
  imageUrl: string | null;
  videoUrl: string | null;
}

export interface SceneVideo {
  slug: string;
  filename: string;
  url: string;
  updatedAt: number;
}

function upsertVideo(
  videos: SceneVideo[],
  slug: string,
  patch: Partial<SceneVideo>,
): SceneVideo[] {
  const existing = videos.find((v) => v.slug === slug);
  if (existing) {
    return videos.map((v) => (v.slug === slug ? { ...v, ...patch } : v));
  }
  return [...videos, { slug, filename: "", url: "", updatedAt: 0, ...patch }];
}

export interface SceneImage {
  slug: string;
  filename: string;
  url: string;
  updatedAt: number;
}

function upsertSceneImage(
  images: SceneImage[],
  slug: string,
  patch: Partial<SceneImage>,
): SceneImage[] {
  const existing = images.find((v) => v.slug === slug);
  if (existing) {
    return images.map((v) => (v.slug === slug ? { ...v, ...patch } : v));
  }
  return [...images, { slug, filename: "", url: "", updatedAt: 0, ...patch }];
}

function upsertRenderedScene(
  scenes: RenderedScene[],
  slug: string,
  patch: Partial<RenderedScene>,
): RenderedScene[] {
  const existing = scenes.find((s) => s.slug === slug);
  if (existing) {
    return scenes.map((s) => (s.slug === slug ? { ...s, ...patch } : s));
  }
  return [...scenes, { slug, imageUrl: null, videoUrl: null, ...patch }];
}

/** Enqueue a generation task in the backend worker. */
async function enqueueTask(
  projectId: string,
  type: string,
  label: string,
  payload: any,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/queue/enqueue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, type, label, payload }),
    });
    if (!res.ok) {
      return { ok: false, error: await res.text() };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

interface MovieStudioStore {
  idea: string;
  projectId: string | null;
  hydrated: boolean;
  generating: boolean;
  generateStatus: string | null;
  generateProgress: { current: number; total: number } | null;
  result: MovieStudioResult | null;
  error: string | null;
  rendering: boolean;
  renderStatus: string | null;
  renderLogs: string[];
  renderError: string | null;
  renderProgress: { current: number; total: number } | null;
  assets: AssetImage[];
  assetsRendering: boolean;
  assetStatus: string | null;
  assetsError: string | null;
  regenerating: string[];
  renderedScenes: RenderedScene[];
  videos: SceneVideo[];
  videosRendering: boolean;
  videoStatus: string | null;
  videosError: string | null;
  videoProgress: { current: number; total: number } | null;
  regeneratingVideos: string[];
  sceneImages: SceneImage[];
  sceneImagesRendering: boolean;
  sceneImageStatus: string | null;
  sceneImagesError: string | null;
  sceneImageProgress: { current: number; total: number } | null;
  regeneratingSceneImages: string[];
  sceneImageSteps: number;
  setIdea: (v: string) => void;
  setSceneImageSteps: (v: number) => void;
  hydrate: (projectId: string) => Promise<void>;
  generate: (projectId: string, model: string) => Promise<void>;
  render: (projectId: string) => Promise<void>;
  renderAssets: (projectId: string) => Promise<void>;
  regenerateAsset: (
    projectId: string,
    kind: "character" | "place",
    slug: string,
    prompt: string,
  ) => Promise<void>;
  renderVideos: (projectId: string) => Promise<void>;
  regenerateVideo: (projectId: string, slug: string) => Promise<void>;
  renderSceneImages: (projectId: string) => Promise<void>;
  regenerateSceneImage: (projectId: string, slug: string) => Promise<void>;
  updateCharacter: (slug: string, patch: Partial<MovieCharacter>) => void;
  updatePlace: (slug: string, patch: Partial<MoviePlace>) => void;
  updateScene: (slug: string, patch: Partial<MovieScene>) => void;
  applyQueueTask: (task: QueueTask) => void;
  primeAppliedQueue: (tasks: QueueTask[]) => void;
  stop: () => void;
  reset: () => void;
}

export const useMovieStudioStore = create<MovieStudioStore>((set, get) => ({
  idea: "",
  projectId: null,
  hydrated: false,
  generating: false,
  generateStatus: null,
  generateProgress: null,
  result: null,
  error: null,
  rendering: false,
  renderStatus: null,
  renderLogs: [],
  renderError: null,
  renderProgress: null,
  assets: [],
  assetsRendering: false,
  assetStatus: null,
  assetsError: null,
  regenerating: [],
  renderedScenes: [],
  videos: [],
  videosRendering: false,
  videoStatus: null,
  videosError: null,
  videoProgress: null,
  regeneratingVideos: [],
  sceneImages: [],
  sceneImagesRendering: false,
  sceneImageStatus: null,
  sceneImagesError: null,
  sceneImageProgress: null,
  regeneratingSceneImages: [],
  sceneImageSteps: 4,

  setIdea: (idea) => {
    set({ idea, error: null });
    persistMovieStudioState();
  },

  setSceneImageSteps: (steps) =>
    set({ sceneImageSteps: Math.max(1, Math.round(Number(steps)) || 1) }),

  hydrate: async (projectId) => {
    // Switching projects: reset to defaults so the previous project's idea
    // doesn't leak through, then load the stored state (if any) below.
    const previous = get().projectId;
    if (previous !== null && previous !== projectId) {
      get().reset();
    }
    set({ hydrated: true, projectId });

    try {
      const res = await fetch(
        `${API_BASE}/api/movie-studio/state?projectId=${encodeURIComponent(projectId)}`,
      );
      if (!res.ok) return;
      const stored = await res.json();
      if (!stored) return;
      set({
        idea: stored.idea ?? "",
        result: stored.result ?? null,
        assets: Array.isArray(stored.assets) ? stored.assets : [],
        videos: Array.isArray(stored.videos) ? stored.videos : [],
        sceneImages: Array.isArray(stored.sceneImages) ? stored.sceneImages : [],
        renderedScenes: Array.isArray(stored.renderedScenes)
          ? stored.renderedScenes
          : [],
      });
    } catch {
      // Ignore — keep in-memory defaults.
    }
  },

  generate: async (projectId, model) => {
    const idea = get().idea.trim();
    if (!idea || get().generating) return;

    set({ generating: true, error: null });
    const r = await enqueueTask(
      projectId,
      "generate",
      "Generate production bible",
      { idea, model },
    );
    if (!r.ok) set({ generating: false, error: r.error });
  },

  render: async (projectId) => {
    const result = get().result;
    if (!result || get().rendering) return;

    const assets: { kind: "character" | "place"; slug: string; prompt: string }[] = [
      ...result.characters
        .filter((c) => c.slug && String(c.imagePrompt || "").trim())
        .map((c) => ({
          kind: "character" as const,
          slug: c.slug,
          prompt: c.imagePrompt,
        })),
      ...result.places
        .filter((p) => p.slug && String(p.imagePrompt || "").trim())
        .map((p) => ({
          kind: "place" as const,
          slug: p.slug,
          prompt: p.imagePrompt,
        })),
    ];
    const scenes = result.scenes.filter((s) => s.slug);
    // One queue task per output: each asset image, scene image, and scene video.
    const total = assets.length + scenes.length * 2;
    if (total === 0) return;

    const batchId = makeBatchId();
    batches.set(batchId, { kind: "render", total, finished: 0 });

    set({
      rendering: true,
      renderStatus: "Queued…",
      renderLogs: [],
      renderError: null,
      renderProgress: null,
    });

    // FIFO order matters: assets → scene images → scene videos.
    for (const item of assets) {
      const r = await enqueueTask(
        projectId,
        "render-asset",
        `Render ${item.kind}: ${item.slug}`,
        { ...item, batchId },
      );
      if (!r.ok) {
        const b = batches.get(batchId);
        if (b) b.total -= 1;
      }
    }
    for (const scene of scenes) {
      const r = await enqueueTask(
        projectId,
        "render-scene-image",
        `Render scene image: ${scene.slug}`,
        { scene, batchId, steps: get().sceneImageSteps },
      );
      if (!r.ok) {
        const b = batches.get(batchId);
        if (b) b.total -= 1;
      }
    }
    for (const scene of scenes) {
      const r = await enqueueTask(
        projectId,
        "render-video",
        `Render video: ${scene.slug}`,
        { scene, characters: result.characters, batchId },
      );
      if (!r.ok) {
        const b = batches.get(batchId);
        if (b) b.total -= 1;
      }
    }

    // If nothing could be enqueued, reset the spinner immediately.
    const b = batches.get(batchId);
    if (b && b.total <= b.finished) finalizeBatch(batchId, set);
  },

  renderAssets: async (projectId) => {
    const result = get().result;
    if (!result || get().assetsRendering) return;

    const items: { kind: "character" | "place"; slug: string; prompt: string }[] = [
      ...result.characters
        .filter((c) => c.slug && String(c.imagePrompt || "").trim())
        .map((c) => ({
          kind: "character" as const,
          slug: c.slug,
          prompt: c.imagePrompt,
        })),
      ...result.places
        .filter((p) => p.slug && String(p.imagePrompt || "").trim())
        .map((p) => ({
          kind: "place" as const,
          slug: p.slug,
          prompt: p.imagePrompt,
        })),
    ];

    if (items.length === 0) return;

    const batchId = makeBatchId();
    batches.set(batchId, { kind: "assets", total: items.length, finished: 0 });

    set({ assetsRendering: true, assetStatus: "Queued…", assetsError: null });

    for (const item of items) {
      const r = await enqueueTask(
        projectId,
        "render-asset",
        `Render ${item.kind}: ${item.slug}`,
        { ...item, batchId },
      );
      if (!r.ok) {
        const b = batches.get(batchId);
        if (b) b.total -= 1;
      }
    }

    const b = batches.get(batchId);
    if (b && b.total <= b.finished) finalizeBatch(batchId, set);
  },

  regenerateAsset: async (projectId, kind, slug, prompt) => {
    const key = `${kind}:${slug}`;
    if (get().regenerating.includes(key)) return;

    set((s) => ({
      regenerating: [...s.regenerating, key],
      assetsError: null,
    }));
    const r = await enqueueTask(
      projectId,
      "regenerate-asset",
      `Regenerate ${kind}: ${slug}`,
      { kind, slug, prompt },
    );
    if (!r.ok) {
      set((s) => ({
        regenerating: s.regenerating.filter((k) => k !== key),
        assetsError: r.error,
      }));
    }
  },

  renderVideos: async (projectId) => {
    const result = get().result;
    if (!result || get().videosRendering) return;

    const scenes = result.scenes.filter((s) => s.slug);
    if (scenes.length === 0) return;

    const batchId = makeBatchId();
    batches.set(batchId, { kind: "videos", total: scenes.length, finished: 0 });

    set({
      videosRendering: true,
      videoStatus: "Queued…",
      videosError: null,
      videoProgress: null,
    });

    for (const scene of scenes) {
      const r = await enqueueTask(
        projectId,
        "render-video",
        `Render video: ${scene.slug}`,
        { scene, characters: result.characters, batchId },
      );
      if (!r.ok) {
        const b = batches.get(batchId);
        if (b) b.total -= 1;
      }
    }

    const b = batches.get(batchId);
    if (b && b.total <= b.finished) finalizeBatch(batchId, set);
  },

  regenerateVideo: async (projectId, slug) => {
    const result = get().result;
    if (!result || get().regeneratingVideos.includes(slug)) return;
    const scene = result.scenes.find((s) => s.slug === slug);
    if (!scene) return;

    set((s) => ({
      regeneratingVideos: [...s.regeneratingVideos, slug],
      videosError: null,
    }));
    const r = await enqueueTask(
      projectId,
      "regenerate-video",
      `Regenerate video: ${slug}`,
      { slug, scene, characters: result.characters },
    );
    if (!r.ok) {
      set((s) => ({
        regeneratingVideos: s.regeneratingVideos.filter((k) => k !== slug),
        videosError: r.error,
      }));
    }
  },

  renderSceneImages: async (projectId) => {
    const result = get().result;
    if (!result || get().sceneImagesRendering) return;

    const scenes = result.scenes.filter((s) => s.slug);
    if (scenes.length === 0) return;

    const batchId = makeBatchId();
    batches.set(batchId, {
      kind: "sceneImages",
      total: scenes.length,
      finished: 0,
    });

    set({
      sceneImagesRendering: true,
      sceneImageStatus: "Queued…",
      sceneImagesError: null,
      sceneImageProgress: null,
    });

    for (const scene of scenes) {
      const r = await enqueueTask(
        projectId,
        "render-scene-image",
        `Render scene image: ${scene.slug}`,
        { scene, batchId, steps: get().sceneImageSteps },
      );
      if (!r.ok) {
        const b = batches.get(batchId);
        if (b) b.total -= 1;
      }
    }

    const b = batches.get(batchId);
    if (b && b.total <= b.finished) finalizeBatch(batchId, set);
  },

  regenerateSceneImage: async (projectId, slug) => {
    const result = get().result;
    if (!result || get().regeneratingSceneImages.includes(slug)) return;
    const scene = result.scenes.find((s) => s.slug === slug);
    if (!scene) return;

    set((s) => ({
      regeneratingSceneImages: [...s.regeneratingSceneImages, slug],
      sceneImagesError: null,
    }));
    const r = await enqueueTask(
      projectId,
      "regenerate-scene-image",
      `Regenerate scene image: ${slug}`,
      { slug, scene, steps: get().sceneImageSteps },
    );
    if (!r.ok) {
      set((s) => ({
        regeneratingSceneImages: s.regeneratingSceneImages.filter(
          (k) => k !== slug,
        ),
        sceneImagesError: r.error,
      }));
    }
  },

  updateCharacter: (slug, patch) => {
    const result = get().result;
    if (!result) return;
    set({
      result: {
        ...result,
        characters: result.characters.map((c) =>
          c.slug === slug ? { ...c, ...patch } : c,
        ),
      },
    });
    scheduleMovieStudioPersist();
  },

  updatePlace: (slug, patch) => {
    const result = get().result;
    if (!result) return;
    set({
      result: {
        ...result,
        places: result.places.map((p) =>
          p.slug === slug ? { ...p, ...patch } : p,
        ),
      },
    });
    scheduleMovieStudioPersist();
  },

  updateScene: (slug, patch) => {
    const result = get().result;
    if (!result) return;
    set({
      result: {
        ...result,
        scenes: result.scenes.map((s) =>
          s.slug === slug ? { ...s, ...patch } : s,
        ),
      },
    });
    scheduleMovieStudioPersist();
  },

  // Reconcile the movie studio store with the latest queue task state.
  applyQueueTask: (task) => {
    const isActive = task.status === "pending" || task.status === "running";
    const err = task.status === "failed" ? task.error : null;
    const terminal =
      task.status === "completed" ||
      task.status === "failed" ||
      task.status === "cancelled" ||
      task.status === "paused";
    const batchKind = batches.get(task.payload?.batchId)?.kind;

    switch (task.type) {
      case "generate": {
        if (task.status === "completed" && task.result) {
          if (!appliedCompleted.has(task.id)) {
            appliedCompleted.add(task.id);
            set({
              result: task.result,
              generating: false,
              generateStatus: null,
              generateProgress: null,
            });
            persistMovieStudioState();
            playDing3x();
          }
        } else if (err) {
          set({
            generating: false,
            error: err,
            generateStatus: null,
            generateProgress: null,
          });
        } else {
          set({
            generating: isActive,
            generateStatus: task.status === "running" ? task.statusText : null,
            generateProgress: task.progress,
          });
        }
        break;
      }

      case "render-assets": {
        if (task.status === "completed" && task.result) {
          if (!appliedCompleted.has(task.id)) {
            appliedCompleted.add(task.id);
            set({
              assets: task.result.assets ?? [],
              assetsRendering: false,
              assetStatus: "Assets rendered",
            });
            persistMovieStudioState();
            playDing3x();
          }
        } else if (err) {
          set({ assetsRendering: false, assetsError: err });
        } else {
          set((s) => ({
            assetsRendering: isActive,
            assetStatus: task.status === "running" ? task.statusText : null,
            assetsError: null,
            assets: task.result?.assets ?? s.assets,
          }));
        }
        break;
      }

      case "render-scene-images": {
        if (task.status === "completed" && task.result) {
          if (!appliedCompleted.has(task.id)) {
            appliedCompleted.add(task.id);
            set({
              sceneImages: task.result.sceneImages ?? [],
              sceneImagesRendering: false,
              sceneImageStatus: "Scene images rendered",
              sceneImageProgress: null,
            });
            persistMovieStudioState();
            playDing3x();
          }
        } else if (err) {
          set({ sceneImagesRendering: false, sceneImagesError: err });
        } else {
          set((s) => ({
            sceneImagesRendering: isActive,
            sceneImageStatus: task.status === "running" ? task.statusText : null,
            sceneImageProgress: task.progress,
            sceneImagesError: null,
            sceneImages: task.result?.sceneImages ?? s.sceneImages,
          }));
        }
        break;
      }

      case "render-videos": {
        if (task.status === "completed" && task.result) {
          if (!appliedCompleted.has(task.id)) {
            appliedCompleted.add(task.id);
            set({
              videos: task.result.videos ?? [],
              videosRendering: false,
              videoStatus: "Videos rendered",
              videoProgress: null,
            });
            persistMovieStudioState();
            playDing3x();
          }
        } else if (err) {
          set({ videosRendering: false, videosError: err });
        } else {
          set((s) => ({
            videosRendering: isActive,
            videoStatus: task.status === "running" ? task.statusText : null,
            videoProgress: task.progress,
            videosError: null,
            videos: task.result?.videos ?? s.videos,
          }));
        }
        break;
      }

      case "render": {
        if (task.status === "completed" && task.result) {
          if (!appliedCompleted.has(task.id)) {
            appliedCompleted.add(task.id);
            set({
              renderedScenes: task.result.renderedScenes ?? [],
              assets: task.result.assets ?? get().assets,
              sceneImages: task.result.sceneImages ?? get().sceneImages,
              videos: task.result.videos ?? get().videos,
              rendering: false,
              renderStatus: "Render complete",
              renderProgress: null,
            });
            persistMovieStudioState();
            playDing3x();
          }
        } else if (err) {
          set({ rendering: false, renderError: err });
        } else {
          set((s) => ({
            rendering: isActive,
            renderStatus: task.status === "running" ? task.statusText : null,
            renderProgress: task.progress,
            renderError: null,
            assets: task.result?.assets ?? s.assets,
            sceneImages: task.result?.sceneImages ?? s.sceneImages,
            videos: task.result?.videos ?? s.videos,
          }));
        }
        break;
      }

      case "render-asset": {
        const key = `${task.payload?.kind}:${task.payload?.slug}`;
        if (task.status === "completed" && task.result) {
          if (!appliedCompleted.has(task.id)) {
            appliedCompleted.add(task.id);
            const r = task.result;
            set((s) => ({
              assets: [
                ...s.assets.filter((a) => `${a.kind}:${a.slug}` !== key),
                r,
              ],
            }));
            persistMovieStudioState();
          }
        }
        if (terminal) handleBatchTerminal(task, set);
        break;
      }

      case "render-scene-image": {
        const slug = task.payload?.slug;
        if (task.status === "completed" && task.result) {
          if (!appliedCompleted.has(task.id)) {
            appliedCompleted.add(task.id);
            const r = task.result;
            set((s) => ({
              sceneImages: upsertSceneImage(s.sceneImages, slug, r),
              renderedScenes:
                batchKind === "render"
                  ? upsertRenderedScene(s.renderedScenes, slug, {
                      imageUrl: r.url,
                    })
                  : s.renderedScenes,
            }));
            persistMovieStudioState();
          }
        }
        if (terminal) handleBatchTerminal(task, set);
        break;
      }

      case "render-video": {
        const slug = task.payload?.slug;
        if (task.status === "completed" && task.result) {
          if (!appliedCompleted.has(task.id)) {
            appliedCompleted.add(task.id);
            const r = task.result;
            set((s) => ({
              videos: upsertVideo(s.videos, slug, r),
              renderedScenes:
                batchKind === "render"
                  ? upsertRenderedScene(s.renderedScenes, slug, {
                      videoUrl: r.url,
                    })
                  : s.renderedScenes,
            }));
            persistMovieStudioState();
          }
        }
        if (terminal) handleBatchTerminal(task, set);
        break;
      }

      case "regenerate-asset": {
        const key = `${task.payload?.kind}:${task.payload?.slug}`;
        if (task.status === "completed" && task.result) {
          if (!appliedCompleted.has(task.id)) {
            appliedCompleted.add(task.id);
            const r = task.result;
            set((s) => ({
              assets: [
                ...s.assets.filter((a) => `${a.kind}:${a.slug}` !== key),
                r,
              ],
              regenerating: s.regenerating.filter((k) => k !== key),
            }));
            persistMovieStudioState();
          }
        } else if (
          task.status === "failed" ||
          task.status === "cancelled" ||
          task.status === "paused"
        ) {
          set((s) => ({
            regenerating: s.regenerating.filter((k) => k !== key),
            assetsError: err,
          }));
        }
        break;
      }

      case "regenerate-video": {
        const slug = task.payload?.slug;
        if (task.status === "completed" && task.result) {
          if (!appliedCompleted.has(task.id)) {
            appliedCompleted.add(task.id);
            const r = task.result;
            set((s) => ({
              videos: upsertVideo(s.videos, slug, r),
              regeneratingVideos: s.regeneratingVideos.filter((k) => k !== slug),
            }));
            persistMovieStudioState();
          }
        } else if (
          task.status === "failed" ||
          task.status === "cancelled" ||
          task.status === "paused"
        ) {
          set((s) => ({
            regeneratingVideos: s.regeneratingVideos.filter((k) => k !== slug),
            videosError: err,
          }));
        }
        break;
      }

      case "regenerate-scene-image": {
        const slug = task.payload?.slug;
        if (task.status === "completed" && task.result) {
          if (!appliedCompleted.has(task.id)) {
            appliedCompleted.add(task.id);
            const r = task.result;
            set((s) => ({
              sceneImages: upsertSceneImage(s.sceneImages, slug, r),
              regeneratingSceneImages: s.regeneratingSceneImages.filter(
                (k) => k !== slug,
              ),
            }));
            persistMovieStudioState();
          }
        } else if (
          task.status === "failed" ||
          task.status === "cancelled" ||
          task.status === "paused"
        ) {
          set((s) => ({
            regeneratingSceneImages: s.regeneratingSceneImages.filter(
              (k) => k !== slug,
            ),
            sceneImagesError: err,
          }));
        }
        break;
      }
    }
  },

  // Mark already-finished tasks as applied so re-opening a project does not
  // re-apply stale results over newer persisted state.
  primeAppliedQueue: (tasks) => {
    for (const t of tasks) {
      if (t.status === "completed" || t.status === "failed" || t.status === "cancelled") {
        appliedCompleted.add(t.id);
      }
    }
  },

  stop: () => {
    batches.clear();
    countedBatch.clear();
    fetch(`${API_BASE}/api/render/cancel`, { method: "POST" }).catch(() => {});
    const projectId = get().projectId;
    if (projectId) {
      fetch(`${API_BASE}/api/queue/cancel-active`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      }).catch(() => {});
    }
    set({
      generating: false,
      rendering: false,
      assetsRendering: false,
      videosRendering: false,
      sceneImagesRendering: false,
      regenerating: [],
      regeneratingVideos: [],
      regeneratingSceneImages: [],
    });
  },

  reset: () => {
    flushMovieStudioPersist();
    batches.clear();
    countedBatch.clear();
    set({
      idea: "",
      generating: false,
      generateStatus: null,
      generateProgress: null,
      result: null,
      error: null,
      rendering: false,
      renderStatus: null,
      renderLogs: [],
      renderError: null,
      renderProgress: null,
      assets: [],
      assetsRendering: false,
      assetStatus: null,
      assetsError: null,
      regenerating: [],
      renderedScenes: [],
      videos: [],
      videosRendering: false,
      videoStatus: null,
      videosError: null,
      videoProgress: null,
      regeneratingVideos: [],
      sceneImages: [],
      sceneImagesRendering: false,
      sceneImageStatus: null,
      sceneImagesError: null,
      sceneImageProgress: null,
      regeneratingSceneImages: [],
      sceneImageSteps: 4,
    });
  },
}));

/** Timer for the debounced autosave of table edits. */
let persistTimer: ReturnType<typeof setTimeout> | null = null;

/** Write the current state to disk immediately. */
function persistMovieStudioState() {
  const s = useMovieStudioStore.getState();
  if (!s.projectId) return;
  fetch(`${API_BASE}/api/movie-studio/state`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: s.projectId,
      idea: s.idea,
      result: s.result,
      assets: s.assets,
      videos: s.videos,
      sceneImages: s.sceneImages,
      renderedScenes: s.renderedScenes,
    }),
  }).catch(() => {});
}

/**
 * Debounced autosave: coalesce rapid table edits into a single write shortly
 * after the user pauses typing.
 */
function scheduleMovieStudioPersist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistMovieStudioState();
  }, 500);
}

/** Flush any pending debounced save (e.g. before switching projects). */
function flushMovieStudioPersist() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
    persistMovieStudioState();
  }
}
