import { type Application, type Request, type Response } from "express";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import {
  generateAssetImage,
  generateSceneImage,
  generateSceneVideo,
  generateFastImageEditImage,
  generateImageToVideo,
  generateUpscale,
  generateVoiceClone,
  generateAudioToVideo,
  generateAdvancedVoiceClone,
  cancelActiveRender,
} from "./render-media.js";
import { generateMovieStudioBible } from "./agent/agent-backend.js";
import { movieStudioStateFile } from "./agent/workspace.js";

const APP_DATA_DIR = join(homedir(), "media-studio");
const PROJECTS_DIR = join(APP_DATA_DIR, "projects");

function projectDir(projectId: string): string {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(projectId)) {
    throw new Error("Invalid project ID");
  }
  return join(PROJECTS_DIR, projectId);
}

const PROJECT_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

// ========== Types ==========

export type QueueTaskType =
  | "generate"
  | "render"
  | "render-assets"
  | "render-videos"
  | "render-scene-images"
  // Single-output tasks: one media file per queue entry.
  | "render-asset"
  | "render-scene-image"
  | "render-video"
  | "regenerate-asset"
  | "regenerate-video"
  | "regenerate-scene-image"
  | "fast-image-edit"
  | "image-to-video"
  | "upscale"
  | "voice-clone"
  | "audio-to-video"
  | "advanced-voice-clone";

export type QueueTaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "paused";

export interface QueueTask {
  id: string;
  type: QueueTaskType;
  label: string;
  status: QueueTaskStatus;
  progress: { current: number; total: number } | null;
  statusText: string | null;
  error: string | null;
  payload: any;
  result: any;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
}

// ========== Queue file persistence ==========

function queueDir(projectId: string): string {
  return join(projectDir(projectId), "tasks");
}

function queueFile(projectId: string): string {
  return join(queueDir(projectId), "queue.json");
}

function logFile(projectId: string): string {
  return join(projectDir(projectId), "logs", "logs.txt");
}

/** Append a chunk of terminal output to the project's persistent log file. */
function appendLog(projectId: string, text: string): void {
  if (!text) return;
  const file = logFile(projectId);
  const dir = dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  appendFileSync(file, text, "utf-8");
  broadcast(projectId, "log", { text });
}

function slugify(v: unknown): string {
  return String(v || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_");
}

function isValidProjectId(id: string): boolean {
  return PROJECT_ID_RE.test(id);
}

/** Return an existing output file's metadata if already generated, else null. */
function existingOutput(
  projectId: string,
  filename: string,
): { filename: string; url: string; updatedAt: number } | null {
  const path = join(projectDir(projectId), "output", filename);
  if (!existsSync(path)) return null;
  let updatedAt = Date.now();
  try {
    updatedAt = statSync(path).mtimeMs;
  } catch {
    // Fall back to now — only affects the cache-busting query param.
  }
  return {
    filename,
    url: `/api/files?path=${encodeURIComponent(path)}`,
    updatedAt,
  };
}

interface QueueState {
  tasks: QueueTask[];
}

// In-memory queues, keyed by project id. Persisted to disk on every mutation so
// the queue survives app restarts and is visible at projects/:projectId/tasks/queue.json.
const queues = new Map<string, QueueState>();

// Global FIFO enqueue order so pending tasks are picked in submission order
// across projects (there is a single GPU worker).
const order: { projectId: string; taskId: string }[] = [];

let pumping = false;
let runningRef: { projectId: string; taskId: string } | null = null;
let runningAbort: AbortController | null = null;

// Resolves the `uv` binary, injected by core.ts on startup.
let resolveUvPath: () => Promise<string> = async () => {
  throw new Error("uv path not configured");
};

// Projects whose queue is paused. While a project is paused, its running task
// is killed and remembered as "paused", and no new tasks are started for that
// project until it is resumed.
const pausedProjects = new Set<string>();

// Connected SSE clients (one per open Movie Studio tab), keyed by project id.
interface SseClient {
  res: Response;
  // The project this client watches, or null to watch every project.
  projectId: string | null;
}
const sseClients = new Set<SseClient>();

/** Push an event to every SSE client watching the given project. */
function broadcast(projectId: string, event: string, data: any): void {
  for (const client of sseClients) {
    if (client.projectId !== null && client.projectId !== projectId) continue;
    let payload = data;
    // Global watchers need to know which project each task belongs to.
    if (
      client.projectId === null &&
      event === "task" &&
      data &&
      typeof data === "object"
    ) {
      payload = { ...data, projectId };
    }
    try {
      client.res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    } catch {
      sseClients.delete(client);
    }
  }
}

function loadState(projectId: string): QueueState {
  const existing = queues.get(projectId);
  if (existing) return existing;

  const file = queueFile(projectId);
  let tasks: QueueTask[] = [];
  if (existsSync(file)) {
    try {
      const parsed = JSON.parse(readFileSync(file, "utf-8"));
      if (Array.isArray(parsed)) {
        tasks = parsed;
      }
    } catch {
      // Corrupt queue file — start fresh.
      tasks = [];
    }
  }

  // A task left "running" (or "paused") by a previous session was interrupted —
  // reset it so the worker picks it back up on restart.
  for (const t of tasks) {
    if (t.status === "running" || t.status === "paused") {
      t.status = "pending";
      t.startedAt = null;
    }
  }

  const state: QueueState = { tasks };
  queues.set(projectId, state);

  // Rebuild the FIFO order for persisted pending tasks so they resume.
  let hasPending = false;
  for (const t of tasks) {
    if (t.status !== "pending") continue;
    hasPending = true;
    if (
      !order.some(
        (o) => o.projectId === projectId && o.taskId === t.id,
      )
    ) {
      order.push({ projectId, taskId: t.id });
    }
  }
  if (hasPending) void pump();

  return state;
}

/** Load every persisted project queue into memory so it is visible and resumed. */
function loadAllStates(): void {
  let entries: string[] = [];
  try {
    entries = existsSync(PROJECTS_DIR) ? readdirSync(PROJECTS_DIR) : [];
  } catch {
    entries = [];
  }
  entries.sort();
  for (const entry of entries) {
    if (!isValidProjectId(entry)) continue;
    if (!existsSync(queueFile(entry))) continue;
    loadState(entry);
  }
}

function persist(projectId: string): void {
  const state = queues.get(projectId);
  if (!state) return;
  const dir = queueDir(projectId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(queueFile(projectId), JSON.stringify(state.tasks, null, 2), "utf-8");
}

function updateTask(
  projectId: string,
  taskId: string,
  patch: Partial<QueueTask>,
): QueueTask | null {
  const state = queues.get(projectId);
  if (!state) return null;
  const index = state.tasks.findIndex((t) => t.id === taskId);
  if (index === -1) return null;
  state.tasks[index] = { ...state.tasks[index], ...patch };
  persist(projectId);
  broadcast(projectId, "task", state.tasks[index]);
  return state.tasks[index];
}

function getTask(projectId: string, taskId: string): QueueTask | null {
  const state = queues.get(projectId);
  return state?.tasks.find((t) => t.id === taskId) ?? null;
}

function enqueue(
  projectId: string,
  type: QueueTaskType,
  label: string,
  payload: any,
): QueueTask {
  const state = loadState(projectId);
  const task: QueueTask = {
    id: randomUUID(),
    type,
    label,
    status: "pending",
    progress: null,
    statusText: null,
    error: null,
    payload,
    result: null,
    createdAt: Date.now(),
    startedAt: null,
    completedAt: null,
  };
  state.tasks.push(task);
  order.push({ projectId, taskId: task.id });
  persist(projectId);
  broadcast(projectId, "task", task);
  void pump();
  return task;
}

function nextPending(): { projectId: string; taskId: string } | null {
  for (const entry of order) {
    if (pausedProjects.has(entry.projectId)) continue;
    const state = queues.get(entry.projectId);
    if (!state) continue;
    const task = state.tasks.find((t) => t.id === entry.taskId);
    if (task && task.status === "pending") return entry;
  }
  return null;
}

// ========== Task handlers ==========

interface TaskContext {
  projectId: string;
  task: QueueTask;
  update: (patch: Partial<QueueTask>) => void;
  signal: AbortSignal;
  log: (text: string) => void;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new Error("Aborted");
}

async function runRenderAssets(
  ctx: TaskContext,
  characters: any,
  places: any,
): Promise<{ assets: any[] }> {
  const chars = Array.isArray(characters) ? characters : [];
  const placesList = Array.isArray(places) ? places : [];
  const total = chars.length + placesList.length;
  const assets: any[] = [];
  let current = 0;

  for (const c of chars) {
    throwIfAborted(ctx.signal);
    const slug = slugify(c?.slug);
    const prompt = String(c?.imagePrompt || "").trim();
    if (!slug || !prompt) continue;
    current += 1;
    ctx.update({
      statusText: `Generating character: ${c?.name || slug}`,
      progress: { current, total },
    });

    // Skip media that's already been generated for this character.
    const existing = existingOutput(ctx.projectId, `character-${slug}.png`);
    let entry: any;
    if (existing) {
      ctx.log(`Already generated: character-${slug}.png — skipping\n`);
      entry = { kind: "character", slug, ...existing };
    } else {
      const r = await generateAssetImage(
        ctx.projectId,
        "character",
        slug,
        prompt,
        ctx.log,
      );
      throwIfAborted(ctx.signal);
      if ("error" in r) throw new Error(r.error);
      entry = {
        kind: "character",
        slug,
        filename: r.filename,
        url: r.url,
        updatedAt: Date.now(),
      };
    }
    assets.push(entry);
    ctx.update({ result: { assets: [...assets] } });
  }

  for (const p of placesList) {
    throwIfAborted(ctx.signal);
    const slug = slugify(p?.slug);
    const prompt = String(p?.imagePrompt || "").trim();
    if (!slug || !prompt) continue;
    current += 1;
    ctx.update({
      statusText: `Generating place: ${p?.name || slug}`,
      progress: { current, total },
    });

    const existing = existingOutput(ctx.projectId, `place-${slug}.png`);
    let entry: any;
    if (existing) {
      ctx.log(`Already generated: place-${slug}.png — skipping\n`);
      entry = { kind: "place", slug, ...existing };
    } else {
      const r = await generateAssetImage(
        ctx.projectId,
        "place",
        slug,
        prompt,
        ctx.log,
      );
      throwIfAborted(ctx.signal);
      if ("error" in r) throw new Error(r.error);
      entry = {
        kind: "place",
        slug,
        filename: r.filename,
        url: r.url,
        updatedAt: Date.now(),
      };
    }
    assets.push(entry);
    ctx.update({ result: { assets: [...assets] } });
  }

  ctx.update({ result: { assets } });
  return { assets };
}

async function runRenderSceneImages(
  ctx: TaskContext,
  scenes: any,
): Promise<{ sceneImages: any[] }> {
  const list = Array.isArray(scenes) ? scenes : [];
  const total = list.length;
  const sceneImages: any[] = [];
  let current = 0;

  for (const sc of list) {
    throwIfAborted(ctx.signal);
    const slug = slugify(sc?.slug);
    if (!slug) continue;
    current += 1;
    ctx.update({
      statusText: `Generating scene image: ${slug}`,
      progress: { current, total },
    });

    const existing = existingOutput(ctx.projectId, `scene-${slug}.png`);
    let entry: any;
    if (existing) {
      ctx.log(`Already generated: scene-${slug}.png — skipping\n`);
      entry = { slug, ...existing };
    } else {
      const r = await generateSceneImage(ctx.projectId, sc, undefined, ctx.log);
      throwIfAborted(ctx.signal);
      if ("error" in r) throw new Error(r.error);
      entry = {
        slug,
        filename: r.filename,
        url: r.url,
        updatedAt: Date.now(),
      };
    }
    sceneImages.push(entry);
    ctx.update({ result: { sceneImages: [...sceneImages] } });
  }

  ctx.update({ result: { sceneImages } });
  return { sceneImages };
}

async function runRenderVideos(
  ctx: TaskContext,
  uvPath: string,
  scenes: any,
  characters: any,
): Promise<{ videos: any[] }> {
  const list = Array.isArray(scenes) ? scenes : [];
  const chars = Array.isArray(characters) ? characters : [];
  const total = list.length;
  const videos: any[] = [];
  let current = 0;

  for (const sc of list) {
    throwIfAborted(ctx.signal);
    const slug = slugify(sc?.slug);
    if (!slug) continue;
    current += 1;
    ctx.update({
      statusText: `Generating video: ${slug}`,
      progress: { current, total },
    });

    const existing = existingOutput(ctx.projectId, `scene-${slug}.mp4`);
    let entry: any;
    if (existing) {
      ctx.log(`Already generated: scene-${slug}.mp4 — skipping\n`);
      entry = { slug, ...existing };
    } else {
      const r = await generateSceneVideo(uvPath, ctx.projectId, sc, chars, undefined, ctx.log);
      throwIfAborted(ctx.signal);
      if ("error" in r) throw new Error(r.error);
      entry = {
        slug,
        filename: r.filename,
        url: r.url,
        updatedAt: Date.now(),
      };
    }
    videos.push(entry);
    ctx.update({ result: { videos: [...videos] } });
  }

  ctx.update({ result: { videos } });
  return { videos };
}

async function runFullRender(
  ctx: TaskContext,
  uvPath: string,
  characters: any,
  places: any,
  scenes: any,
): Promise<{
  assets: any[];
  sceneImages: any[];
  videos: any[];
  renderedScenes: any[];
}> {
  const { assets } = await runRenderAssets(ctx, characters, places);
  const { sceneImages } = await runRenderSceneImages(ctx, scenes);
  const { videos } = await runRenderVideos(ctx, uvPath, scenes, characters);

  const imgBySlug = new Map(sceneImages.map((i) => [i.slug, i.url]));
  const vidBySlug = new Map(videos.map((v) => [v.slug, v.url]));
  const renderedScenes = (Array.isArray(scenes) ? scenes : [])
    .map((sc) => {
      const slug = slugify(sc?.slug);
      if (!slug) return null;
      return {
        slug,
        imageUrl: imgBySlug.get(slug) ?? null,
        videoUrl: vidBySlug.get(slug) ?? null,
      };
    })
    .filter(Boolean);

  const result = { assets, sceneImages, videos, renderedScenes };
  ctx.update({ result });
  return result;
}

type Handler = (
  ctx: TaskContext,
  getUvPath: () => Promise<string>,
) => Promise<any>;

const handlers: Record<QueueTaskType, Handler> = {
  generate: async (ctx) => {
    const { idea, model } = ctx.task.payload || {};
    if (typeof idea !== "string" || !idea.trim()) {
      throw new Error("Idea is required");
    }
    ctx.log(`Planning production bible (characters → places → scenes)…\n`);
    const result = await generateMovieStudioBible(
      ctx.projectId,
      idea.trim(),
      typeof model === "string" && model.trim() ? model.trim() : undefined,
      (statusText, current, total) => {
        ctx.update({ statusText, progress: { current, total } });
      },
    );
    ctx.log("Production bible ready.\n");
    return result;
  },

  // Generate a composite image via fast-image-edit (FLUX.2 Klein).
  "fast-image-edit": async (ctx) => {
    const { prompt, images, steps, upscale } = ctx.task.payload || {};
    ctx.log("Generating composite image (FLUX.2 Klein)…\n");
    const r = await generateFastImageEditImage(
      ctx.projectId,
      String(prompt || ""),
      Array.isArray(images) ? images : [],
      Number(steps),
      String(upscale || "none"),
      ctx.log,
    );
    if ("error" in r) throw new Error(r.error);
    return r;
  },

  // Generate a video from a project image via LTX-2.3 (Scene Video Generation).
  "image-to-video": async (ctx, getUvPath) => {
    const {
      prompt,
      imagePath,
      width,
      height,
      frames,
      frameRate,
      mode,
      model,
      stage1Steps,
      stage2Steps,
    } = ctx.task.payload || {};
    ctx.log("Generating scene video (LTX-2.3)…\n");
    const r = await generateImageToVideo(
      await getUvPath(),
      ctx.projectId,
      {
        prompt: String(prompt || ""),
        imagePath: String(imagePath || ""),
        width,
        height,
        frames,
        frameRate,
        mode,
        model,
        stage1Steps,
        stage2Steps,
      },
      ctx.log,
    );
    if ("error" in r) throw new Error(r.error);
    return r;
  },

  // Upscale/refine a project image via mlxgen (SeedVR2).
  "upscale": async (ctx) => {
    const { imagePath, resolution } = ctx.task.payload || {};
    ctx.log(`Upscaling image (${resolution || "1x"})…\n`);
    const r = await generateUpscale(
      ctx.projectId,
      String(imagePath || ""),
      String(resolution || "1x"),
      ctx.log,
    );
    if ("error" in r) throw new Error(r.error);
    return r;
  },

  // Clone a reference voice and speak the transcript.
  "voice-clone": async (ctx, getUvPath) => {
    const { text, refAudioPath, quality } = ctx.task.payload || {};
    ctx.log("Cloning voice…\n");
    const r = await generateVoiceClone(
      await getUvPath(),
      ctx.projectId,
      String(text || ""),
      String(refAudioPath || ""),
      String(quality || "high"),
      ctx.log,
    );
    if ("error" in r) throw new Error(r.error);
    return r;
  },

  // Clone a reference voice via dots-tts.
  "advanced-voice-clone": async (ctx) => {
    const { text, refAudioPath, language, outPrefix, model } =
      ctx.task.payload || {};
    ctx.log("Cloning voice (dots-tts)…\n");
    const r = await generateAdvancedVoiceClone(
      ctx.projectId,
      {
        text: String(text || ""),
        refAudioPath: String(refAudioPath || ""),
        language: String(language || "YUE"),
        outPrefix: String(outPrefix || ""),
        model: String(model || ""),
      },
      ctx.log,
    );
    if ("error" in r) throw new Error(r.error);
    return r;
  },

  // Generate a video from an image + audio via ltx-2-mlx a2v.
  "audio-to-video": async (ctx, getUvPath) => {
    const { imagePath, audioPath, prompt, stage1Steps, frames, width, height } =
      ctx.task.payload || {};
    ctx.log("Generating audio-to-video…\n");
    const r = await generateAudioToVideo(
      await getUvPath(),
      ctx.projectId,
      {
        imagePath: String(imagePath || ""),
        audioPath: String(audioPath || ""),
        prompt: String(prompt || ""),
        stage1Steps: Number(stage1Steps),
        frames: Number(frames),
        width: Number(width),
        height: Number(height),
      },
      ctx.log,
    );
    if ("error" in r) throw new Error(r.error);
    return r;
  },

  "render-assets": async (ctx) => {
    const { characters, places } = ctx.task.payload || {};
    return runRenderAssets(ctx, characters, places);
  },

  "render-scene-images": async (ctx) => {
    return runRenderSceneImages(ctx, ctx.task.payload?.scenes);
  },

  "render-videos": async (ctx, getUvPath) => {
    const { scenes, characters } = ctx.task.payload || {};
    return runRenderVideos(ctx, await getUvPath(), scenes, characters);
  },

  render: async (ctx, getUvPath) => {
    const { characters, places, scenes } = ctx.task.payload || {};
    return runFullRender(
      ctx,
      await getUvPath(),
      characters,
      places,
      scenes,
    );
  },

  // Generate a single character/place image, skipping if it already exists.
  "render-asset": async (ctx) => {
    const { kind, slug, prompt } = ctx.task.payload || {};
    if (kind !== "character" && kind !== "place") {
      throw new Error("kind must be 'character' or 'place'");
    }
    const s = slugify(slug);
    const p = String(prompt || "").trim();
    if (!s || !p) throw new Error("slug and prompt are required");

    const existing = existingOutput(ctx.projectId, `${kind}-${s}.png`);
    if (existing) {
      ctx.log(`Already generated: ${kind}-${s}.png — skipping\n`);
      return { kind, slug: s, ...existing };
    }

    const r = await generateAssetImage(ctx.projectId, kind, s, p, ctx.log);
    if ("error" in r) throw new Error(r.error);
    return {
      kind,
      slug: s,
      filename: r.filename,
      url: r.url,
      updatedAt: Date.now(),
    };
  },

  // Generate a single scene image, skipping if it already exists.
  "render-scene-image": async (ctx) => {
    const { scene, steps } = ctx.task.payload || {};
    if (!scene || typeof scene !== "object") throw new Error("scene is required");
    const s = slugify(scene?.slug);
    if (!s) throw new Error("Invalid scene slug");

    const existing = existingOutput(ctx.projectId, `scene-${s}.png`);
    if (existing) {
      ctx.log(`Already generated: scene-${s}.png — skipping\n`);
      return { slug: s, ...existing };
    }

    const r = await generateSceneImage(ctx.projectId, scene, Number(steps), ctx.log);
    if ("error" in r) throw new Error(r.error);
    return {
      slug: s,
      filename: r.filename,
      url: r.url,
      updatedAt: Date.now(),
    };
  },

  // Generate a single scene video, skipping if it already exists.
  "render-video": async (ctx, getUvPath) => {
    const { scene, characters, video } = ctx.task.payload || {};
    if (!scene || typeof scene !== "object") throw new Error("scene is required");
    const s = slugify(scene?.slug);
    if (!s) throw new Error("Invalid scene slug");

    const existing = existingOutput(ctx.projectId, `scene-${s}.mp4`);
    if (existing) {
      ctx.log(`Already generated: scene-${s}.mp4 — skipping\n`);
      return { slug: s, ...existing };
    }

    const r = await generateSceneVideo(
      await getUvPath(),
      ctx.projectId,
      scene,
      Array.isArray(characters) ? characters : [],
      video,
      ctx.log,
    );
    if ("error" in r) throw new Error(r.error);
    return {
      slug: s,
      filename: r.filename,
      url: r.url,
      updatedAt: Date.now(),
    };
  },

  "regenerate-asset": async (ctx) => {
    const { kind, slug, prompt } = ctx.task.payload || {};
    if (kind !== "character" && kind !== "place") {
      throw new Error("kind must be 'character' or 'place'");
    }
    const s = slugify(slug);
    const p = String(prompt || "").trim();
    if (!s || !p) throw new Error("slug and prompt are required");
    const r = await generateAssetImage(ctx.projectId, kind, s, p, ctx.log);
    if ("error" in r) throw new Error(r.error);
    return {
      kind,
      slug: s,
      filename: r.filename,
      url: r.url,
      updatedAt: Date.now(),
    };
  },

  "regenerate-video": async (ctx, getUvPath) => {
    const { scene, characters, video } = ctx.task.payload || {};
    if (!scene || typeof scene !== "object") throw new Error("scene is required");
    const r = await generateSceneVideo(
      await getUvPath(),
      ctx.projectId,
      scene,
      Array.isArray(characters) ? characters : [],
      video,
      ctx.log,
    );
    if ("error" in r) throw new Error(r.error);
    return {
      slug: slugify(scene?.slug),
      filename: r.filename,
      url: r.url,
      updatedAt: Date.now(),
    };
  },

  "regenerate-scene-image": async (ctx) => {
    const { scene, steps } = ctx.task.payload || {};
    if (!scene || typeof scene !== "object") throw new Error("scene is required");
    const r = await generateSceneImage(ctx.projectId, scene, Number(steps), ctx.log);
    if ("error" in r) throw new Error(r.error);
    return {
      slug: slugify(scene?.slug),
      filename: r.filename,
      url: r.url,
      updatedAt: Date.now(),
    };
  },
};

// ========== Worker ==========

async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
  try {
    while (true) {
      const next = nextPending();
      if (!next) break;

      const state = queues.get(next.projectId);
      const task = state?.tasks.find((t) => t.id === next.taskId);
      if (!task) break;

      const handler = handlers[task.type];
      if (!handler) {
        updateTask(next.projectId, task.id, {
          status: "failed",
          error: `Unknown task type: ${task.type}`,
          completedAt: Date.now(),
        });
        continue;
      }

      updateTask(next.projectId, task.id, {
        status: "running",
        startedAt: Date.now(),
        statusText: "Starting…",
        error: null,
      });

      const controller = new AbortController();
      runningRef = next;
      runningAbort = controller;

      const ctx: TaskContext = {
        projectId: next.projectId,
        task,
        update: (patch) => updateTask(next.projectId, task.id, patch),
        signal: controller.signal,
        log: (text) => appendLog(next.projectId, text),
      };

      try {
        const result = await handler(ctx, resolveUvPath);
        if (controller.signal.aborted) {
          const current = getTask(next.projectId, task.id);
          if (current && current.status === "running") {
            updateTask(next.projectId, task.id, {
              status: pausedProjects.has(next.projectId)
                ? "paused"
                : "cancelled",
              statusText: null,
              completedAt: Date.now(),
            });
          }
        } else {
          updateTask(next.projectId, task.id, {
            status: "completed",
            result,
            statusText: null,
            error: null,
            completedAt: Date.now(),
          });
          try {
            syncToMovieStudioState(next.projectId, task.type, result);
          } catch {
            // State sync is best-effort; the queue file is still authoritative.
          }
        }
      } catch (e) {
        if (controller.signal.aborted) {
          const current = getTask(next.projectId, task.id);
          if (current && current.status === "running") {
            updateTask(next.projectId, task.id, {
              status: pausedProjects.has(next.projectId)
                ? "paused"
                : "cancelled",
              statusText: null,
              completedAt: Date.now(),
            });
          }
        } else {
          updateTask(next.projectId, task.id, {
            status: "failed",
            error: String(e),
            statusText: null,
            completedAt: Date.now(),
          });
        }
      } finally {
        runningRef = null;
        runningAbort = null;
      }
    }
  } finally {
    pumping = false;
  }
}

/** Merge a completed task's result into the movie studio persisted UI state. */
function syncToMovieStudioState(
  projectId: string,
  type: QueueTaskType,
  result: any,
): void {
  const file = movieStudioStateFile(projectId);
  let state: any = {};
  if (existsSync(file)) {
    try {
      state = JSON.parse(readFileSync(file, "utf-8")) || {};
    } catch {
      state = {};
    }
  }

  if (type === "generate" && result) {
    state.result = result;
  }
  if (type === "render-assets" || type === "render") {
    state.assets = Array.isArray(result?.assets) ? result.assets : state.assets ?? [];
  }
  if (type === "render-scene-images" || type === "render") {
    state.sceneImages = Array.isArray(result?.sceneImages)
      ? result.sceneImages
      : state.sceneImages ?? [];
  }
  if (type === "render-videos" || type === "render") {
    state.videos = Array.isArray(result?.videos) ? result.videos : state.videos ?? [];
  }
  if (type === "render") {
    state.renderedScenes = Array.isArray(result?.renderedScenes)
      ? result.renderedScenes
      : state.renderedScenes ?? [];
  }
  if ((type === "render-asset" || type === "regenerate-asset") && result) {
    const key = `${result.kind}:${result.slug}`;
    const arr = Array.isArray(state.assets) ? state.assets : [];
    state.assets = [
      ...arr.filter((a: any) => `${a.kind}:${a.slug}` !== key),
      result,
    ];
  }
  if ((type === "render-video" || type === "regenerate-video") && result) {
    const arr = Array.isArray(state.videos) ? state.videos : [];
    state.videos = [
      ...arr.filter((v: any) => v.slug !== result.slug),
      result,
    ];
  }
  if (
    (type === "render-scene-image" || type === "regenerate-scene-image") &&
    result
  ) {
    const arr = Array.isArray(state.sceneImages) ? state.sceneImages : [];
    state.sceneImages = [
      ...arr.filter((i: any) => i.slug !== result.slug),
      result,
    ];
  }

  const dir = dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify(state, null, 2), "utf-8");
}

// ========== Routes ==========

/**
 * CSRF guard for the localhost server. Rejects mutating requests whose Origin
 * points at another site (a malicious page in the user's browser). Same-origin
 * and custom-protocol (views://) clients send no Origin or an Origin of
 * "null"/localhost, so they pass through.
 */
function assertLocalRequest(req: Request, res: Response): boolean {
  const origin = req.headers.origin;
  if (!origin || origin === "null") return true;
  try {
    const host = new URL(origin).hostname;
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
      return true;
    }
  } catch {
    // Fall through to reject malformed origins.
  }
  res.status(403).json({ error: "Forbidden" });
  return false;
}

export function generationQueueSetup({
  app,
  getUvPath,
}: {
  app: Application;
  getUvPath: () => Promise<string>;
}) {
  resolveUvPath = getUvPath;

  // List the current queue for a project (plus whether that project is paused).
  app.get("/api/queue", (req, res) => {
    const projectId = String(req.query.projectId ?? "");
    if (!isValidProjectId(projectId)) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    res.json({
      tasks: loadState(projectId).tasks,
      paused: pausedProjects.has(projectId),
    });
  });

  // List every task across all projects, each tagged with its project id.
  app.get("/api/queue/all", (_req, res) => {
    loadAllStates();
    const tasks: (QueueTask & { projectId: string })[] = [];
    for (const [projectId, state] of queues) {
      for (const t of state.tasks) {
        tasks.push({ ...t, projectId });
      }
    }
    tasks.sort((a, b) => a.createdAt - b.createdAt);
    res.json({ tasks });
  });

  // Read a project's persisted terminal log (tail, so large logs stay bounded).
  app.get("/api/logs", (req, res) => {
    const projectId = String(req.query.projectId ?? "");
    if (!isValidProjectId(projectId)) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    const file = logFile(projectId);
    if (!existsSync(file)) {
      res.json({ logs: "" });
      return;
    }
    try {
      const content = readFileSync(file, "utf-8");
      const MAX = 200_000;
      const tail =
        content.length > MAX ? content.slice(content.length - MAX) : content;
      res.json({ logs: tail });
    } catch {
      res.json({ logs: "" });
    }
  });

  // Server-Sent Events: push queue/task and log updates to a watching client.
  app.get("/api/events", (req, res) => {
    const projectId = String(req.query.projectId ?? "");
    const all = projectId === "*";
    if (!all && !isValidProjectId(projectId)) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(`event: hello\ndata: {}\n\n`);

    const client: SseClient = { res, projectId: all ? null : projectId };
    sseClients.add(client);
    req.on("close", () => {
      sseClients.delete(client);
    });
  });

  // Enqueue a new generation task.
  app.post("/api/queue/enqueue", (req, res) => {
    if (!assertLocalRequest(req, res)) return;
    const { projectId, type, label, payload } = req.body || {};
    if (!projectId || !isValidProjectId(String(projectId))) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    if (!type || !(type in handlers)) {
      res.status(400).json({ error: "Invalid task type" });
      return;
    }
    const task = enqueue(
      String(projectId),
      type as QueueTaskType,
      typeof label === "string" && label.trim()
        ? label.trim()
        : String(type),
      payload ?? {},
    );
    res.status(201).json(task);
  });

  // Pause a project's queue: kill its running task but remember it as "paused".
  app.post("/api/queue/pause", (req, res) => {
    if (!assertLocalRequest(req, res)) return;
    const { projectId } = req.body || {};
    if (!projectId || !isValidProjectId(String(projectId))) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    pausedProjects.add(String(projectId));
    if (runningRef && runningRef.projectId === String(projectId)) {
      const current = getTask(runningRef.projectId, runningRef.taskId);
      if (current && current.status === "running") {
        updateTask(runningRef.projectId, runningRef.taskId, {
          status: "paused",
          statusText: null,
        });
      }
      runningAbort?.abort();
      cancelActiveRender();
    }
    res.json({ paused: true });
  });

  // Resume a project's queue and re-queue any of its paused tasks.
  app.post("/api/queue/resume", (req, res) => {
    if (!assertLocalRequest(req, res)) return;
    const { projectId } = req.body || {};
    if (!projectId || !isValidProjectId(String(projectId))) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    pausedProjects.delete(String(projectId));
    const state = queues.get(String(projectId));
    if (state) {
      for (const t of state.tasks) {
        if (t.status === "paused") {
          updateTask(String(projectId), t.id, {
            status: "pending",
            startedAt: null,
          });
        }
      }
    }
    void pump();
    res.json({ paused: false });
  });

  // Cancel a single task (pending or running).
  app.post("/api/queue/cancel", (req, res) => {
    if (!assertLocalRequest(req, res)) return;
    const { projectId, taskId } = req.body || {};
    if (!projectId || !isValidProjectId(String(projectId))) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    const state = queues.get(String(projectId));
    const task = state?.tasks.find((t) => t.id === String(taskId ?? ""));
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    if (task.status === "pending" || task.status === "paused") {
      updateTask(String(projectId), task.id, {
        status: "cancelled",
        completedAt: Date.now(),
      });
    } else if (task.status === "running") {
      if (runningRef && runningRef.taskId === task.id) {
        runningAbort?.abort();
        cancelActiveRender();
      }
    }
    res.json({ ok: true });
  });

  // Cancel every queued/running task for a project (the "Stop" button).
  app.post("/api/queue/cancel-active", (req, res) => {
    if (!assertLocalRequest(req, res)) return;
    const { projectId } = req.body || {};
    if (!projectId || !isValidProjectId(String(projectId))) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    const state = queues.get(String(projectId));
    if (state) {
      for (const task of state.tasks) {
        if (task.status === "pending" || task.status === "paused") {
          updateTask(String(projectId), task.id, {
            status: "cancelled",
            completedAt: Date.now(),
          });
        }
      }
    }
    if (
      runningRef &&
      runningRef.projectId === String(projectId)
    ) {
      runningAbort?.abort();
      cancelActiveRender();
    }
    res.json({ ok: true });
  });

  // Remove finished tasks (completed/failed/cancelled) from the queue.
  app.post("/api/queue/clear", (req, res) => {
    if (!assertLocalRequest(req, res)) return;
    const { projectId } = req.body || {};
    if (!projectId || !isValidProjectId(String(projectId))) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    const state = queues.get(String(projectId));
    if (state) {
      state.tasks = state.tasks.filter(
        (t) =>
          t.status === "pending" ||
          t.status === "running" ||
          t.status === "paused",
      );
      persist(String(projectId));
    }
    res.json({ ok: true });
  });

  // Remove every non-running task (pending/finished/paused) from the queue,
  // leaving only the currently running task (if any).
  app.post("/api/queue/clear-all", (req, res) => {
    if (!assertLocalRequest(req, res)) return;
    const { projectId } = req.body || {};
    if (!projectId || !isValidProjectId(String(projectId))) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    const state = queues.get(String(projectId));
    if (state) {
      state.tasks = state.tasks.filter((t) => t.status === "running");
      persist(String(projectId));
    }
    res.json({ ok: true });
  });
}
