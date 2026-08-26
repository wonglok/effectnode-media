import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  realpathSync,
  readdirSync,
  statSync,
  unlinkSync,
  rmSync,
  copyFileSync,
} from "node:fs";
import { type Application } from "express";
import { homedir } from "node:os";
import { dirname, join, sep } from "node:path";
import { spawn, type Subprocess, whichSync, mimeType } from "./process.js";

// Track the currently active spawn process so it can be cancelled
let activeProc: Subprocess | null = null;

// Track the long-running mlx-vlm server process (separate from render jobs).
let agentServerProc: Subprocess | null = null;
let agentStopRequested = false;
let agentServerPort: number | null = null;

/** Port the app started the mlx-vlm server on (null when the server is not running). */
export function getAgentServerPort(): number | null {
  return agentServerPort;
}

const APP_DATA_DIR = join(homedir(), "media-studio");
const PROJECTS_DIR = join(APP_DATA_DIR, "projects");
const JSON_DIR = join(APP_DATA_DIR, "json");
const PYTHON_DIR = join(APP_DATA_DIR, "python-src");
const PROJECTS_FILE = join(JSON_DIR, "projects.json");
const CHARACTERS_FILE = join(JSON_DIR, "characters.json");

const Z_IMAGE_MODEL = "AbstractFramework/z-image-turbo-8bit";
const FLUX_KLEIN_MODEL = "AbstractFramework/flux.2-klein-4b-8bit"; // AbstractFramework/flux.2-klein-base-4b-8bit // AbstractFramework/flux.2-klein-4b-8bit
const SEEDVR2_MODEL = "AbstractFramework/seedvr2-7b-8bit";
const QWEN_IMAGE_EDIT_MODEL = "AbstractFramework/qwen-image-edit-2511-8bit";
// Resolution values accepted by the advanced image edit's optional upscale step.
const ALLOWED_UPSCALES = new Set(["1x", "1500", "2000", "2500"]);
const MLX_VLM_MODEL = "mlx-community/gemma-4-e4b-it-8bit";
const LTX_MODEL_HIGH_QUALITY = "dgrauet/ltx-2.3-mlx";
const LTX_MODEL_STANDARD = "dgrauet/ltx-2.3-mlx-q8";

const VIDEO_STAGE_FLAGS: Record<string, string> = {
  distilled: "--distilled",
  "one-stage": "--one-stage",
  "two-stage": "--two-stage",
};

const TTS_MODELS: Record<string, string> = {
  low: "Qwen/Qwen3-TTS-12Hz-0.6B-Base",
  high: "Qwen/Qwen3-TTS-12Hz-1.7B-Base",
};

/** Resolve the CLI stage flag for a video generation mode (defaults to distilled). */
function stageFlagFor(mode: unknown): string {
  return typeof mode === "string"
    ? (VIDEO_STAGE_FLAGS[mode] ?? "--distilled")
    : "--distilled";
}

/** Resolve a ltx-2-mlx model id, falling back to the q8 standard model. */
function resolveLtxModel(model: unknown): string {
  return String(model) === LTX_MODEL_HIGH_QUALITY
    ? LTX_MODEL_HIGH_QUALITY
    : LTX_MODEL_STANDARD;
}

// ========== Project Types ==========

export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface Character {
  id: string;
  projectId: string;
  name: string;
  filename: string;
  source: "upload" | "generated";
  createdAt: string;
}

// ========== Project Helpers ==========

function ensureDir(dir: string) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/** Resolve the per-project root directory (projects/<projectId>). */
function projectDir(projectId: string): string {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(projectId)) {
    throw new Error("Invalid project ID");
  }
  return join(PROJECTS_DIR, projectId);
}

const PROJECT_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

function isValidProjectId(id: string): boolean {
  return PROJECT_ID_RE.test(id);
}

/**
 * Resolve an output directory for generated media. Returns the directory path,
 * or null when the project id or supplied directory is invalid / outside the
 * allowed roots.
 */
function resolveOutputDir(
  outputDir: unknown,
  projectId: string,
): string | null {
  if (!isValidProjectId(projectId)) return null;

  const base =
    typeof outputDir === "string" && outputDir.trim()
      ? outputDir.trim()
      : join(projectDir(projectId), "output");

  // Defense in depth: reject null bytes and `..` traversal segments.
  if (base.includes("\0") || base.split(/[/\\]/).includes("..")) return null;

  ensureDir(base);
  let realBase: string;
  try {
    realBase = realpathSync(base);
  } catch {
    return null;
  }

  for (const root of [
    join(projectDir(projectId), "output"),
    join(projectDir(projectId), "upload"),
    join(projectDir(projectId), "agents"),
  ]) {
    ensureDir(root);
    const realRoot = realpathSync(root);
    if (realBase === realRoot || realBase.startsWith(realRoot + sep)) {
      return base;
    }
  }
  return null;
}

function readProjects(): Project[] {
  ensureDir(JSON_DIR);
  if (!existsSync(PROJECTS_FILE)) {
    writeFileSync(PROJECTS_FILE, "[]", "utf-8");
    return [];
  }
  try {
    const raw = readFileSync(PROJECTS_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeProjects(projects: Project[]) {
  ensureDir(JSON_DIR);
  writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2), "utf-8");
}

function readCharacters(): Character[] {
  ensureDir(JSON_DIR);
  if (!existsSync(CHARACTERS_FILE)) {
    writeFileSync(CHARACTERS_FILE, "[]", "utf-8");
    return [];
  }
  try {
    return JSON.parse(readFileSync(CHARACTERS_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function writeCharacters(characters: Character[]) {
  ensureDir(JSON_DIR);
  writeFileSync(CHARACTERS_FILE, JSON.stringify(characters, null, 2), "utf-8");
}

function makeId(): string {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function openInFinder(dirPath: string) {
  // Use Bun.spawn instead of execSync — non-blocking and native to Bun
  spawn(["open", dirPath], {
    stdout: "ignore",
    stderr: "ignore",
    onExit: (_proc, exitCode, _signalCode, _error) => {
      if (exitCode !== 0) {
        console.error(
          `openInFinder: "open ${dirPath}" exited with code ${exitCode}`,
        );
      }
    },
  });
}

// ========== SSE Helper ==========

/** Validate that `resolvedPath` is inside the projects root. */
function isPathAllowed(resolvedPath: string): boolean {
  ensureDir(PROJECTS_DIR);
  const realProjects = realpathSync(PROJECTS_DIR);
  return resolvedPath.startsWith(realProjects + sep);
}

/** Resolve and validate a user-supplied filename. Looks in both upload and output dirs. */
function resolveSafePath(candidate: string, projectId: string): string | null {
  // Reject anything that looks like a path — only bare filenames allowed
  const base = candidate.split(/[/\\]/).pop() || candidate;
  if (base !== candidate || base.includes("..") || base.startsWith(".")) {
    return null;
  }

  // Try the agent-upload dir first, then upload and output dirs.
  for (const sub of ["agent-upload", "upload", "output"]) {
    const candidatePath = join(projectDir(projectId), sub, base);
    if (existsSync(candidatePath)) {
      const resolved = realpathSync(candidatePath);
      if (isPathAllowed(resolved)) return resolved;
    }
  }

  // TTS voiceovers are stored under <output>/<projectId>/voices/<id>/. Search
  // each voice folder for the basename so muxing can resolve the audio.
  const voicesRoot = join(projectDir(projectId), "output", "voices");
  let voiceSubdirs: string[] = [];
  try {
    voiceSubdirs = readdirSync(voicesRoot).map((entry) =>
      join(voicesRoot, entry),
    );
  } catch {
    // voices dir does not exist yet — nothing to search
  }
  for (const voiceDir of voiceSubdirs) {
    const candidatePath = join(voiceDir, base);
    if (existsSync(candidatePath)) {
      const resolved = realpathSync(candidatePath);
      if (isPathAllowed(resolved)) return resolved;
    }
  }

  return null;
}

/**
 * Resolve the `mlxgen` executable installed via `uv tool install --upgrade mlx-gen`.
 * uv tool installs binaries into `~/.local/bin`; fall back to relying on PATH.
 */
async function getMlxgenBin(): Promise<string> {
  const candidates = [
    join(homedir(), ".local", "bin", "mlxgen"),
    "/opt/homebrew/bin/mlxgen",
    "/usr/local/bin/mlxgen",
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return "mlxgen";
}

/** Resolve the `dots-tts` executable installed via `uv tool install dots-tts`. */
async function getDotsTtsBin(): Promise<string> {
  const candidates = [
    join(homedir(), ".local", "bin", "dots-tts"),
    "/opt/homebrew/bin/dots-tts",
    "/usr/local/bin/dots-tts",
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return "dots-tts";
}

/** The cloned dots-tts-mlx project directory. */
const DOTS_TTS_FOLDER = join(APP_DATA_DIR, "python-src", "dots-tts-mlx");

/** Base directory where dots-tts MLX weights live (inside the project folder). */
const DOTS_TTS_WEIGHTS_DIR = join(DOTS_TTS_FOLDER, "dots-tts-mlx-weights");

/**
 * Resolve a dots-tts `--model` value. Accepts `./dots-tts-mlx-weights/int4`
 * (relative to the dots-tts-mlx folder), a bare variant (`int4`), or an
 * explicit path.
 */
function resolveDotsTtsModel(model: string): string {
  if (!model) return join(DOTS_TTS_WEIGHTS_DIR, "int4");
  if (model.startsWith("./")) return join(DOTS_TTS_FOLDER, model.slice(2));
  if (model.includes("/")) return model;
  return join(DOTS_TTS_WEIGHTS_DIR, model);
}

/** True when the dots-tts `int4` weights have been downloaded. */
function isDotsTtsModelDownloaded(): boolean {
  return existsSync(join(DOTS_TTS_WEIGHTS_DIR, "int4"));
}

/** Resolve the ffmpeg binary installed via Homebrew (Apple Silicon then Intel). */
async function getFfmpegBin(): Promise<string> {
  const candidates = ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return "ffmpeg";
}

/** True when the `mlxgen` executable is installed (known paths or PATH). */
function isMlxgenInstalled(): boolean {
  const candidates = [
    join(homedir(), ".local", "bin", "mlxgen"),
    "/opt/homebrew/bin/mlxgen",
    "/usr/local/bin/mlxgen",
  ];
  for (const p of candidates) {
    if (existsSync(p)) return true;
  }
  // Fall back to PATH lookup (Bun native, synchronous).
  try {
    return whichSync("mlxgen") !== null;
  } catch {
    return false;
  }
}

/**
 * Resolve the `mlx_vlm.server` executable installed via `uv tool install mlx-vlm`.
 * uv tool installs binaries into `~/.local/bin`; fall back to relying on PATH.
 */
async function getMlxVlmServerBin(): Promise<string> {
  const candidates = [
    join(homedir(), ".local", "bin", "mlx_vlm.server"),
    "/opt/homebrew/bin/mlx_vlm.server",
    "/usr/local/bin/mlx_vlm.server",
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return "mlx_vlm.server";
}

/** Kill any process listening on the given port (returns the PIDs that were killed). */
async function killProcessOnPort(port: number): Promise<string[]> {
  try {
    const proc = spawn(["lsof", "-ti", `:${port}`], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = await new Response(
      proc.stdout as ReadableStream<Uint8Array>,
    ).text();
    const exitCode = await proc.exited;
    if (exitCode !== 0) return [];
    const pids = output.trim().split(/\s+/).filter(Boolean);
    for (const pid of pids) {
      spawn(["kill", "-9", pid], { stdout: "ignore", stderr: "ignore" });
    }
    return pids;
  } catch {
    return [];
  }
}

/** True when the `mlx_vlm.server` executable is installed (known paths or PATH). */
function isMlxVlmInstalled(): boolean {
  const candidates = [
    join(homedir(), ".local", "bin", "mlx_vlm.server"),
    "/opt/homebrew/bin/mlx_vlm.server",
    "/usr/local/bin/mlx_vlm.server",
  ];
  for (const p of candidates) {
    if (existsSync(p)) return true;
  }
  try {
    return whichSync("mlx_vlm.server") !== null;
  } catch {
    return false;
  }
}

/** Fixed filename mlx_audio.tts.generate writes its output clip as. */
const TTS_OUTPUT_FILENAME = "audio_000.mp3";

/**
 * Resolve the TTS output clip for a voice folder. mlx_audio.tts.generate always
 * writes its single generated clip as `audio_000.mp3` directly into `--output`,
 * so the path is deterministic and there is no need to scan for a newest file.
 */
function resolveAudioFile(root: string): string | null {
  const path = join(root, TTS_OUTPUT_FILENAME);
  return existsSync(path) ? path : null;
}

/** Directory where Hugging Face Hub caches downloaded models. */
function huggingfaceCacheDir(): string {
  if (process.env.HF_HUB_CACHE) return process.env.HF_HUB_CACHE;
  if (process.env.HF_HOME) return join(process.env.HF_HOME, "hub");
  return join(homedir(), ".cache", "huggingface", "hub");
}

/** True when the given MLX-Gen model has already been downloaded to the HF cache. */
function isModelDownloaded(model: string): boolean {
  const modelDirName = `models--${model.replace("/", "--")}`;
  const snapshotsDir = join(huggingfaceCacheDir(), modelDirName, "snapshots");
  if (!existsSync(snapshotsDir)) return false;
  try {
    return readdirSync(snapshotsDir).some((name) => {
      try {
        return statSync(join(snapshotsDir, name)).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

/** Directory the H3 model weights are downloaded into (mlx-h3/weights). */
function h3WeightsDir(): string {
  return join(PYTHON_DIR, "mlx-h3", "weights");
}

/** True when the H3 model has been downloaded into <mlx-h3>/weights. */
function isH3ModelDownloaded(): boolean {
  const dir = h3WeightsDir();
  if (!existsSync(dir)) return false;
  try {
    return readdirSync(dir).length > 0;
  } catch {
    return false;
  }
}

/**
 * Strip ANSI escape sequences (colors, cursor control, etc.) from a string.
 * Tools like `uv` emit these when streaming to a TTY; forwarding them to the
 * browser renders them as raw control glyphs (e.g. `␛[2m`) instead of text.
 */
function stripAnsi(input: string): string {
  // Matches CSI (`ESC [ ...`) and other two-byte control sequences (`ESC @`–`ESC _`).
  // eslint-disable-next-line no-control-regex
  return input.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}

/** Stream stdout/stderr from a Bun subprocess to an SSE response. */
async function streamToSSE(
  readable: ReadableStream<Uint8Array> | undefined,
  prefix: string,
  send: (event: string, data: object) => void,
): Promise<string> {
  let text = "";
  const reader = readable?.getReader();
  if (!reader) return text;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      // Use { stream: true } so multi-byte UTF-8 characters split across
      // chunks are reassembled correctly instead of producing mojibake.
      const chunk = stripAnsi(decoder.decode(value, { stream: true }));
      if (chunk) {
        console.log(`[${prefix}]`, chunk);
        text += chunk;
        send("log", { text: chunk });
      }
    }
    // Flush any remaining bytes buffered in the decoder.
    const final = stripAnsi(decoder.decode());
    if (final) {
      console.log(`[${prefix}]`, final);
      text += final;
      send("log", { text: final });
    }
  } finally {
    reader.releaseLock();
  }
  return text;
}

/** Read a process stream, decoding UTF-8 and stripping ANSI, emitting chunks. */
async function readStream(
  readable: ReadableStream<Uint8Array> | undefined,
  onChunk: (text: string) => void,
): Promise<void> {
  const reader = readable?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = stripAnsi(decoder.decode(value, { stream: true }));
      if (chunk) onChunk(chunk);
    }
    const final = stripAnsi(decoder.decode());
    if (final) onChunk(final);
  } finally {
    reader.releaseLock();
  }
}

/** Run a command to completion, returning its exit status and combined output. */
async function runCommand(
  args: string[],
  opts: { cwd?: string; onLog?: (text: string) => void } = {},
): Promise<{ success: boolean; output: string }> {
  const proc = spawn(args, {
    env: process.env,
    stdout: "pipe",
    stderr: "pipe",
    ...(opts.cwd ? { cwd: opts.cwd } : {}),
  });
  activeProc = proc;

  let output = "";
  const onLog = opts.onLog;
  const collect = (text: string) => {
    output += text;
    if (onLog) onLog(text);
  };

  await Promise.all([
    readStream(proc.stdout as ReadableStream<Uint8Array>, collect),
    readStream(proc.stderr as ReadableStream<Uint8Array>, collect),
  ]);
  const exitCode = await proc.exited;
  return { success: exitCode === 0, output: output.trim() };
}

/** Copy a generated file into the project's backup folder with a timestamped name. */
function backupFile(sourcePath: string, projectId: string): string | null {
  try {
    const backupDir = join(projectDir(String(projectId)), "output", "backup");
    ensureDir(backupDir);
    const base = sourcePath.split(sep).pop() || "file";
    const dot = base.lastIndexOf(".");
    const stem = dot > 0 ? base.slice(0, dot) : base;
    const ext = dot > 0 ? base.slice(dot) : "";
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = join(backupDir, `${stem}-${ts}${ext}`);
    copyFileSync(sourcePath, backupPath);
    return backupPath;
  } catch {
    return null;
  }
}

/** Kill the currently active spawn process (used to cancel a running task). */
export function cancelActiveRender(): void {
  if (activeProc) {
    try {
      activeProc.kill();
    } catch {
      // process may already be dead
    }
    activeProc = null;
  }
}

/**
 * Refine an already-generated image in-place at native resolution via SeedVR2
 * ("1x"). Best-effort: if refinement fails, the original image is kept.
 */
async function refineImage1x(
  outputPath: string,
  onLog?: (text: string) => void,
): Promise<void> {
  const mlxgen = await getMlxgenBin();
  const tmpPath = join(dirname(outputPath), `refine-1x-${Date.now()}.png`);
  if (onLog) onLog("Refining with SeedVR2 (1x)…\n");
  const result = await runCommand(
    [
      mlxgen,
      "upscale",
      "--model",
      SEEDVR2_MODEL,
      "--image-path",
      outputPath,
      "--resolution",
      "1x",
      "--seed",
      "42",
      "--mlx-cache-limit-gb",
      "100",
      "--output",
      tmpPath,
    ],
    { onLog },
  );
  if (!result.success || !existsSync(tmpPath)) {
    if (onLog) {
      onLog("SeedVR2 1x refinement failed; keeping the original image.\n");
    }
    return;
  }
  // Replace the original with the refined result.
  try {
    copyFileSync(tmpPath, outputPath);
  } catch {
    // Ignore — keep the original image on failure.
  } finally {
    try {
      unlinkSync(tmpPath);
    } catch {
      // already removed
    }
  }
}

/** Generate a single character/place image (text-to-image) and back it up. */
export async function generateAssetImage(
  projectId: string,
  kind: "character" | "place",
  slug: string,
  prompt: string,
  onLog?: (text: string) => void,
): Promise<{ filename: string; url: string } | { error: string }> {
  const mlxgen = await getMlxgenBin();
  const outputDir = join(projectDir(projectId), "output");
  ensureDir(outputDir);
  const outputFile = `${kind}-${slug}.png`;
  const outputPath = join(outputDir, outputFile);

  const result = await runCommand(
    [
      mlxgen,
      "generate",
      "--model",
      Z_IMAGE_MODEL,
      "--prompt",
      prompt,
      "--output",
      outputPath,
      "--steps",
      "4",
      "--width",
      "1024",
      "--height",
      "1024",
    ],
    { onLog },
  );

  if (!result.success || !existsSync(outputPath)) {
    return { error: result.output || `Failed to generate ${kind} ${slug}` };
  }

  await refineImage1x(outputPath, onLog);
  backupFile(outputPath, projectId);
  return {
    filename: outputFile,
    url: `/api/files?path=${encodeURIComponent(outputPath)}`,
  };
}

/** Build the LTX image-to-video prompt for a scene (dialogue + voiceover). */
function buildVideoPrompt(scene: any, characters: any[]): string {
  const nameOf = (slug: unknown): string =>
    characters.find((c) => String(c?.slug) === String(slug))?.name ||
    String(slug || "");
  const lines = Array.isArray(scene.scriptLines)
    ? scene.scriptLines
        .map((l: any) => `${nameOf(l?.characterSlug)} says: "${l?.line || ""}"`)
        .join(" ")
    : "";
  const vo = scene.voiceOver ? ` Voiceover: "${scene.voiceOver}"` : "";
  return `${scene.description || ""} ${lines}${vo}`.trim();
}

/** Configurable settings for a scene video generation. */
export interface SceneVideoSettings {
  width?: number;
  height?: number;
  mode?: string;
  stage1Steps?: number;
  stage2Steps?: number;
}

/** Generate a single scene video (LTX-2.3) from its scene image, and back it up. */
export async function generateSceneVideo(
  uvPath: string,
  projectId: string,
  scene: any,
  characters: any[],
  settings?: SceneVideoSettings,
  onLog?: (text: string) => void,
): Promise<{ filename: string; url: string } | { error: string }> {
  const s = String(scene?.slug || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_");
  if (!s) return { error: "Invalid scene slug" };

  const outputDir = join(projectDir(projectId), "output");
  const sceneImagePath = join(outputDir, `scene-${s}.png`);
  if (!existsSync(sceneImagePath)) {
    return {
      error: `Scene image not found for "${s}". Generate scene images first.`,
    };
  }

  const ltxFolder = join(PYTHON_DIR, "ltx-2-mlx");
  const videoFile = `scene-${s}.mp4`;
  const videoPath = join(outputDir, videoFile);
  const frames = Math.max(1, Math.round((Number(scene?.duration) + 3) * 24));

  const videoWidth = Math.max(1, Math.round(Number(settings?.width)) || 320);
  const videoHeight = Math.max(1, Math.round(Number(settings?.height)) || 569);
  const stage1Steps = Math.max(
    1,
    Math.round(Number(settings?.stage1Steps)) || 15,
  );
  const stage2Steps = Math.max(
    1,
    Math.round(Number(settings?.stage2Steps)) || 3,
  );

  const result = await runCommand(
    [
      uvPath,
      "run",
      "ltx-2-mlx",
      "generate",
      "--model",
      "dgrauet/ltx-2.3-mlx-q8",
      "--prompt",
      buildVideoPrompt(scene, characters),
      stageFlagFor(settings?.mode),
      "--stage1-steps",
      String(stage1Steps),
      "--stage2-steps",
      String(stage2Steps),
      "--frames",
      String(frames),
      "--width",
      String(videoWidth),
      "--height",
      String(videoHeight),
      "--frame-rate",
      "24",
      "--image",
      sceneImagePath,
      "--output",
      videoPath,
    ],
    { cwd: ltxFolder, onLog },
  );

  if (!result.success || !existsSync(videoPath)) {
    return { error: result.output || `Failed to generate video ${s}` };
  }

  backupFile(videoPath, projectId);
  return {
    filename: videoFile,
    url: `/api/files?path=${encodeURIComponent(videoPath)}`,
  };
}

/**
 * Generate a video from a project image via LTX-2.3. `imagePath` must be a bare
 * filename previously uploaded/generated for this project. Used by the queue
 * worker for the "Scene Video Generation" tab.
 */
export async function generateImageToVideo(
  uvPath: string,
  projectId: string,
  params: {
    prompt: string;
    imagePath: string;
    width?: number;
    height?: number;
    frames?: number;
    frameRate?: number;
    mode?: string;
    model?: string;
    stage1Steps?: number;
    stage2Steps?: number;
  },
  onLog?: (text: string) => void,
): Promise<{ filename: string; url: string } | { error: string }> {
  const { prompt, imagePath, mode } = params;

  if (!isValidProjectId(projectId)) return { error: "Invalid project ID" };
  if (!prompt || !prompt.trim()) return { error: "Prompt is required" };
  if (!imagePath) return { error: "Image path is required" };

  const resolvedImage = resolveSafePath(imagePath, projectId);
  if (!resolvedImage) {
    return {
      error:
        "Invalid image path. Provide a filename previously uploaded to this project.",
    };
  }

  const ltxFolder = join(PYTHON_DIR, "ltx-2-mlx");
  if (!existsSync(ltxFolder)) {
    return { error: "ltx-2-mlx not found. Run setup first." };
  }

  const projectOutputDir = resolveOutputDir(undefined, projectId);
  if (!projectOutputDir) return { error: "Invalid output directory." };

  const outputFile = `video-${Date.now()}.mp4`;
  const outputPath = join(projectOutputDir, outputFile);

  const videoWidth = Number(params.width) || 480;
  const videoHeight = Number(params.height) || 480;
  const videoFrames = Number(params.frames) || 121;
  const videoFps = Number(params.frameRate) || 24;
  const stage1Steps = Math.max(1, Math.round(Number(params.stage1Steps)) || 30);
  const stage2Steps = Math.max(1, Math.round(Number(params.stage2Steps)) || 3);

  const result = await runCommand(
    [
      uvPath,
      "run",
      "ltx-2-mlx",
      "generate",
      "--model",
      resolveLtxModel(params.model),
      "--prompt",
      prompt.trim(),
      stageFlagFor(mode),
      "--stage1-steps",
      String(stage1Steps),
      "--stage2-steps",
      String(stage2Steps),
      "--frames",
      String(videoFrames),
      "--width",
      String(videoWidth),
      "--height",
      String(videoHeight),
      "--frame-rate",
      String(videoFps),
      "--image",
      resolvedImage,
      "--output",
      outputPath,
    ],
    { cwd: ltxFolder, onLog },
  );

  if (!result.success || !existsSync(outputPath)) {
    return { error: result.output || "Video generation failed" };
  }

  backupFile(outputPath, projectId);
  return {
    filename: outputFile,
    url: `/api/files?path=${encodeURIComponent(outputPath)}`,
  };
}

/** Normalize a value into a safe filesystem slug. */
function slugify(v: unknown): string {
  return String(v || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_");
}

/**
 * Generate a single scene image via fast-image-edit (FLUX.2 Klein), using the
 * already-generated character/place images referenced by the scene's slugs.
 */
export async function generateSceneImage(
  projectId: string,
  scene: any,
  steps?: number,
  onLog?: (text: string) => void,
): Promise<{ filename: string; url: string } | { error: string }> {
  const s = slugify(scene?.slug);
  if (!s) return { error: "Invalid scene slug" };
  const stepCount = Math.max(1, Number(steps) || 4);

  const outputDir = join(projectDir(projectId), "output");
  const mlxgen = await getMlxgenBin();

  const refImages: string[] = [];
  for (const cs of Array.isArray(scene?.characterSlugs)
    ? scene.characterSlugs
    : []) {
    const f = join(outputDir, `character-${slugify(cs)}.png`);
    if (existsSync(f)) refImages.push(f);
  }
  const placeFile = join(outputDir, `place-${slugify(scene?.placeSlug)}.png`);
  if (existsSync(placeFile)) refImages.push(placeFile);

  if (refImages.length === 0) {
    return {
      error: `Scene "${s}": no matching character/place images. Render assets first.`,
    };
  }

  const sceneImageFile = `scene-${s}.png`;
  const sceneImagePath = join(outputDir, sceneImageFile);

  const fluxArgs = [mlxgen, "generate", "--model", FLUX_KLEIN_MODEL];
  for (const p of refImages) fluxArgs.push("--image", p);
  fluxArgs.push(
    "--prompt",
    String(scene?.imagePrompt || ""),
    "--output",
    sceneImagePath,
    "--mlx-cache-limit-gb",
    "20",
    "--steps",
    String(stepCount),
    "--seed",
    "42",
    "--width",
    "1024",
    "--height",
    "1024",
  );

  const result = await runCommand(fluxArgs, { onLog });
  if (!result.success || !existsSync(sceneImagePath)) {
    return { error: result.output || `Failed to generate scene image ${s}` };
  }

  await refineImage1x(sceneImagePath, onLog);
  backupFile(sceneImagePath, projectId);
  return {
    filename: sceneImageFile,
    url: `/api/files?path=${encodeURIComponent(sceneImagePath)}`,
  };
}

/**
 * Upscale/refine a project image via mlxgen (SeedVR2). `imagePath` must be a
 * bare filename previously uploaded/generated for this project. `resolution` is
 * either "1x" (refine at native resolution) or "2048" (upscale to 2048px).
 */
export async function generateUpscale(
  projectId: string,
  imagePath: string,
  resolution: string,
  onLog?: (text: string) => void,
): Promise<{ filename: string; url: string } | { error: string }> {
  if (!isValidProjectId(projectId)) return { error: "Invalid project ID" };
  if (!imagePath) return { error: "Image path is required" };

  const resolvedImage = resolveSafePath(imagePath, projectId);
  if (!resolvedImage) {
    return {
      error:
        "Invalid image path. Provide a filename previously uploaded to this project.",
    };
  }

  const target = /^(1x|\d+)$/.test(resolution) ? resolution : "1x";

  const mlxgen = await getMlxgenBin();
  const projectOutputDir = join(projectDir(projectId), "output");
  ensureDir(projectOutputDir);

  const outputFile = `upscale-${target}-${Date.now()}.png`;
  const outputPath = join(projectOutputDir, outputFile);

  const result = await runCommand(
    [
      mlxgen,
      "upscale",
      "--model",
      SEEDVR2_MODEL,
      "--image-path",
      resolvedImage,
      "--resolution",
      target,
      "--seed",
      "42",
      "--mlx-cache-limit-gb",
      "100",
      "--output",
      outputPath,
    ],
    { onLog },
  );

  if (!result.success || !existsSync(outputPath)) {
    return { error: result.output || "Upscale failed" };
  }

  backupFile(outputPath, projectId);
  return {
    filename: outputFile,
    url: `/api/files?path=${encodeURIComponent(outputPath)}`,
  };
}

/**
 * Clone a reference voice and speak `text` via mlx_audio.tts.generate. `refAudioPath`
 * must be a bare filename previously uploaded to this project. `quality` is "low"
 * or "high" (maps to a TTS model). Output is saved under <output>/voices/.
 */
export async function generateVoiceClone(
  uvPath: string,
  projectId: string,
  text: string,
  refAudioPath: string,
  quality: string,
  onLog?: (text: string) => void,
): Promise<{ filename: string; url: string } | { error: string }> {
  if (!isValidProjectId(projectId)) return { error: "Invalid project ID" };
  if (!refAudioPath) return { error: "Reference audio is required" };

  // Sanitize the transcript: strip control characters (incl. newlines) and
  // collapse whitespace. spawn() runs with shell:false (array args), so shell
  // metacharacters cannot execute, but this keeps `--text` a single well-formed
  // argument and out of the terminal log.
  const cleanText = text
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleanText) return { error: "Text is required" };

  const resolvedRef = resolveSafePath(refAudioPath, projectId);
  if (!resolvedRef) {
    return {
      error:
        "Invalid reference audio path. Provide a filename previously uploaded to this project.",
    };
  }

  const model = quality === "low" ? TTS_MODELS.low : TTS_MODELS.high;

  const projectOutputDir = resolveOutputDir(undefined, projectId);
  if (!projectOutputDir) return { error: "Invalid output directory." };

  const voiceId = `voice-${Date.now()}`;
  const voiceDir = join(projectOutputDir, "voices", voiceId);
  ensureDir(voiceDir);

  const result = await runCommand(
    [
      uvPath,
      "run",
      "mlx_audio.tts.generate",
      "--model",
      model,
      "--text",
      cleanText,
      "--ref_audio",
      resolvedRef,
      "--output",
      voiceDir,
      "--audio_format",
      "mp3",
      "--play",
      "--instruct",
      "slow down speech",
    ],
    { cwd: voiceDir, onLog },
  );

  if (!result.success) {
    return { error: result.output || "Voice generation failed" };
  }

  const path = resolveAudioFile(voiceDir);
  if (!path) {
    return { error: "TTS completed but no audio file was produced" };
  }

  const filename = path.split(sep).pop() || TTS_OUTPUT_FILENAME;

  // Persist a per-voice metadata file so the generated-voice list can be rebuilt
  // from the folder structure (each voice in its own folder with meta.json), with
  // no central JSON index.
  const meta = {
    id: voiceId,
    transcript: cleanText,
    quality,
    refAudioFilename: refAudioPath,
    filename,
    createdAt: new Date().toISOString(),
  };
  writeFileSync(
    join(voiceDir, "meta.json"),
    JSON.stringify(meta, null, 2),
    "utf-8",
  );

  return {
    filename,
    url: `/api/files?path=${encodeURIComponent(path)}`,
  };
}

/** Find the newest video file (mp4/webm/mov) inside a directory. */
function findNewestVideo(dir: string): string | null {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }
  let newest: { path: string; mtime: number } | null = null;
  for (const name of entries) {
    const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
    if (ext !== ".mp4" && ext !== ".webm" && ext !== ".mov") continue;
    const full = join(dir, name);
    try {
      const st = statSync(full);
      if (!st.isFile()) continue;
      if (!newest || st.mtimeMs > newest.mtime) {
        newest = { path: full, mtime: st.mtimeMs };
      }
    } catch {
      // skip unreadable entries
    }
  }
  return newest ? newest.path : null;
}

/**
 * Generate a video from an image + audio via ltx-2-mlx `a2v` (audio-to-video).
 * `imagePath` and `audioPath` must be bare filenames previously uploaded/generated
 * for this project. `stage1Steps` maps to `--stage1-steps` (15 default, 30 HD).
 */
export async function generateAudioToVideo(
  uvPath: string,
  projectId: string,
  params: {
    imagePath: string;
    audioPath: string;
    prompt: string;
    stage1Steps: number;
    frames: number;
    width?: number;
    height?: number;
  },
  onLog?: (text: string) => void,
): Promise<{ filename: string; url: string } | { error: string }> {
  if (!isValidProjectId(projectId)) return { error: "Invalid project ID" };
  if (!params.imagePath) return { error: "Image path is required" };
  if (!params.audioPath) return { error: "Audio path is required" };

  const resolvedImage = resolveSafePath(params.imagePath, projectId);
  if (!resolvedImage) {
    return {
      error:
        "Invalid image path. Provide a filename previously uploaded to this project.",
    };
  }

  const resolvedAudio = resolveSafePath(params.audioPath, projectId);
  if (!resolvedAudio) {
    return {
      error:
        "Invalid audio path. Provide a filename previously uploaded to this project.",
    };
  }

  // Collapse whitespace so the prompt stays a single well-formed CLI argument.
  const cleanPrompt =
    String(params.prompt || "")
      .replace(/\s+/g, " ")
      .trim() || "scene";
  const stage1Steps = Math.max(1, Math.round(Number(params.stage1Steps)) || 15);
  // 1 second = 24 frames, plus a terminal frame (24n + 1).
  const frames = Math.max(1, Math.round(Number(params.frames)) || 25);
  // Output dimensions, falling back to the ltx-2-mlx a2v CLI defaults.
  const width = Math.max(64, Math.round(Number(params.width)) || 704);
  const height = Math.max(64, Math.round(Number(params.height)) || 480);

  const ltxFolder = join(PYTHON_DIR, "ltx-2-mlx");
  if (!existsSync(ltxFolder)) {
    return { error: "ltx-2-mlx not found. Run setup first." };
  }

  const outputDir = join(projectDir(projectId), "output", `a2v-${Date.now()}`);
  ensureDir(outputDir);

  const result = await runCommand(
    [
      uvPath,
      "run",
      "ltx-2-mlx",
      "a2v",
      "--image",
      resolvedImage,
      "--audio",
      resolvedAudio,
      "--frame-rate",
      "24",
      "--frames",
      String(frames),
      "--width",
      String(width),
      "--height",
      String(height),
      "--output",
      join(outputDir, "video.mp4"),
      "--prompt",
      cleanPrompt,
      "--stage1-steps",
      String(stage1Steps),
      "--stage2-steps",
      "3",
    ],
    { cwd: ltxFolder, onLog },
  );

  if (!result.success) {
    return { error: result.output || "Audio-to-video generation failed" };
  }

  const videoPath = findNewestVideo(outputDir);
  if (!videoPath) {
    return { error: "a2v completed but no video file was produced" };
  }

  backupFile(videoPath, projectId);
  return {
    filename: videoPath.split(sep).pop() || "a2v.mp4",
    url: `/api/files?path=${encodeURIComponent(videoPath)}`,
  };
}

/**
 * Clone a reference voice via dots-tts. Output is written to
 * <output>/<projectId>/dots-tts/ as `<prefix>_000.wav`.
 */
export async function generateAdvancedVoiceClone(
  projectId: string,
  params: {
    text: string;
    refAudioPath: string;
    language: string;
    outPrefix: string;
    model: string;
  },
  onLog?: (text: string) => void,
): Promise<{ filename: string; url: string } | { error: string }> {
  if (!isValidProjectId(projectId)) return { error: "Invalid project ID" };

  const cleanText = String(params.text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleanText) return { error: "Text is required" };
  if (!params.refAudioPath) return { error: "Reference audio is required" };

  const resolvedRef = resolveSafePath(params.refAudioPath, projectId);
  if (!resolvedRef) {
    return {
      error:
        "Invalid reference audio path. Provide a filename previously uploaded to this project.",
    };
  }

  const language = String(params.language || "YUE").trim() || "YUE";
  const prefix =
    String(params.outPrefix || "voice")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 64) || "voice";
  const model = resolveDotsTtsModel(String(params.model || ""));

  // dots-tts expects a WAV reference — convert mp3/other formats to 16-bit PCM WAV.
  let refAudio = resolvedRef;
  if (!resolvedRef.toLowerCase().endsWith(".wav")) {
    const tempDir = join(projectDir(String(projectId)), "temp");
    ensureDir(tempDir);
    const convertedRef = join(tempDir, `avc-ref-${Date.now()}.wav`);
    const ffmpegBin = await getFfmpegBin();
    const conv = await runCommand(
      [
        ffmpegBin,
        "-y",
        "-i",
        resolvedRef,
        "-c:a",
        "pcm_s16le",
        "-ar",
        "44100",
        "-ac",
        "2",
        convertedRef,
      ],
      { onLog },
    );
    if (!conv.success || !existsSync(convertedRef)) {
      return { error: "Failed to convert reference audio to WAV" };
    }
    refAudio = convertedRef;
  }

  const dotsTtsBin = await getDotsTtsBin();
  // Mirror the voice-clone tab's timestamped-folder layout so outputs never
  // overwrite each other.
  const voiceId = `voice-${Date.now()}`;
  const outDir = join(projectDir(projectId), "output", "dots-tts", voiceId);
  ensureDir(outDir);

  console.log("debug-info:", [
    dotsTtsBin,
    "--model",
    model,
    "--text",
    cleanText || "please provide text",
    "--ref-audio",
    refAudio,
    "--language",
    language,
    "--out-path",
    outDir,
    "--out-prefix",
    prefix,
    "--max-generate-length",
    "3000",
  ]);

  const result = await runCommand(
    [
      dotsTtsBin,
      "--model",
      model,
      "--text",
      cleanText || "please provide text",
      "--ref-audio",
      refAudio,
      "--language",
      language,
      "--out-path",
      outDir,
      "--out-prefix",
      prefix,
      "--max-generate-length",
      "3000",
    ],
    { cwd: dirname(dotsTtsBin), onLog },
  );

  if (!result.success) {
    return { error: result.output || "Advanced voice clone failed" };
  }

  const outputFile = `${prefix}_000.wav`;
  const outputPath = join(outDir, outputFile);
  if (!existsSync(outputPath)) {
    return { error: `Expected output ${outputFile} was not produced` };
  }

  // Mirror the voice-clone tab's on-disk conventions: a timestamped backup copy
  // plus a per-voice meta.json so the output can be listed without a central index.
  backupFile(outputPath, projectId);

  const meta = {
    id: voiceId,
    transcript: cleanText,
    language,
    model,
    refAudioFilename: params.refAudioPath,
    outPrefix: prefix,
    filename: outputFile,
    createdAt: new Date().toISOString(),
  };
  writeFileSync(
    join(outDir, "meta.json"),
    JSON.stringify(meta, null, 2),
    "utf-8",
  );

  return {
    filename: outputFile,
    url: `/api/files?path=${encodeURIComponent(outputPath)}`,
  };
}

/**
 * Generate a composite image via fast-image-edit (FLUX.2 Klein). `images` are
 * base64 data URLs that are decoded into temp files and passed to the model as
 * separate `--image` inputs. Used by the generation queue worker.
 */
export async function generateFastImageEditImage(
  projectId: string,
  prompt: string,
  images: string[],
  steps?: number,
  upscaleResolution?: string,
  onLog?: (text: string) => void,
): Promise<{ filename: string; url: string } | { error: string }> {
  if (!isValidProjectId(projectId)) return { error: "Invalid project ID" };
  if (!prompt || !prompt.trim()) return { error: "Prompt is required" };
  if (!Array.isArray(images) || images.length === 0) {
    return { error: "At least one reference image is required" };
  }
  const stepCount = Math.max(1, Number(steps) || 4);

  // Decode each base64 reference image into a temp workspace file so the
  // FLUX model receives them as separate `--image` inputs.
  const tempDir = join(projectDir(String(projectId)), "temp");
  ensureDir(tempDir);
  const tempImagePaths: string[] = [];
  try {
    images.forEach((image, i) => {
      const base64 = String(image).replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64, "base64");
      const path = join(tempDir, `flux-ref-${Date.now()}-${i}.png`);
      writeFileSync(path, buffer);
      tempImagePaths.push(path);
    });
  } catch {
    return { error: "Invalid reference image data" };
  }

  try {
    const mlxgen = await getMlxgenBin();
    const projectOutputDir = join(projectDir(projectId), "output");
    ensureDir(projectOutputDir);

    const outputFile = `flux-edit-${Date.now()}.png`;
    const outputPath = join(projectOutputDir, outputFile);

    const args: string[] = [mlxgen, "generate", "--model", FLUX_KLEIN_MODEL];
    for (const path of tempImagePaths) args.push("--image", path);
    args.push(
      "--prompt",
      prompt.trim(),
      "--output",
      outputPath,
      "--mlx-cache-limit-gb",
      "20",
      "--steps",
      String(stepCount),
      "--seed",
      "42",
      "--width",
      "1024",
      "--height",
      "1024",
    );

    const result = await runCommand(args, { onLog });
    if (!result.success || !existsSync(outputPath)) {
      return { error: result.output || "Fast image edit failed" };
    }

    backupFile(outputPath, projectId);

    // Optionally upscale the generated result (1x / 1500px / 2000px).
    if (upscaleResolution && upscaleResolution !== "none") {
      if (onLog) onLog(`Upscaling result (${upscaleResolution})…\n`);
      const upscaled = await generateUpscale(
        projectId,
        outputFile,
        upscaleResolution,
        onLog,
      );
      if ("error" in upscaled) return { error: upscaled.error };
      return upscaled;
    }

    return {
      filename: outputFile,
      url: `/api/files?path=${encodeURIComponent(outputPath)}`,
    };
  } finally {
    for (const path of tempImagePaths) {
      try {
        unlinkSync(path);
      } catch {
        // already removed
      }
    }
    try {
      rmSync(tempDir, { force: true });
    } catch {
      // ignore cleanup failures
    }
  }
}

/**
 * Edit a project image via mlxgen (Qwen Image Edit). `imagePath` must be a
 * bare filename previously uploaded/generated into the project. Used by the
 * generation queue worker.
 */
export async function generateAdvancedImageEditImage(
  projectId: string,
  prompt: string,
  imagePath: string,
  width: number,
  height: number,
  steps: number,
  seed: number,
  lowRam: boolean,
  upscaleResolution: string,
  onLog?: (text: string) => void,
): Promise<{ filename: string; url: string } | { error: string }> {
  if (!isValidProjectId(projectId)) return { error: "Invalid project ID" };
  if (!prompt || !prompt.trim()) return { error: "Prompt is required" };
  if (!imagePath) return { error: "An input image is required" };

  const resolvedImage = resolveSafePath(imagePath, projectId);
  if (!resolvedImage || !existsSync(resolvedImage)) {
    return { error: "Input image not found" };
  }

  const resolvedSteps = Math.max(1, Number(steps) || 8);
  const resolvedSeed = Number.isFinite(Number(seed)) ? Number(seed) : 42;

  const mlxgen = await getMlxgenBin();
  const projectOutputDir = join(projectDir(projectId), "output");
  ensureDir(projectOutputDir);

  const outputFile = `qwen-edit-${Date.now()}.png`;
  const outputPath = join(projectOutputDir, outputFile);

  const args: string[] = [
    mlxgen,
    "generate",
    "--model",
    QWEN_IMAGE_EDIT_MODEL,
    "--task",
    "image-to-image",
    "--i2i-mode",
    "edit",
    "--image",
    resolvedImage,
    "--output",
    outputPath,
    "--prompt",
    prompt.trim(),
    "--steps",
    String(resolvedSteps),
    "--seed",
    String(resolvedSeed),
    "--mlx-cache-limit-gb",
    "20",
  ];

  const outWidth = Number(width);
  const outHeight = Number(height);
  if (
    Number.isInteger(outWidth) &&
    outWidth > 0 &&
    Number.isInteger(outHeight) &&
    outHeight > 0
  ) {
    args.push("--width", String(outWidth), "--height", String(outHeight));
  }

  if (lowRam === true) {
    args.push("--low-ram");
  }

  const result = await runCommand(args, { onLog });
  if (!result.success || !existsSync(outputPath)) {
    return { error: result.output || "Advanced image edit failed" };
  }

  backupFile(outputPath, projectId);

  // Optionally upscale the generated result (1x / 1500px / 2000px / 2500px).
  if (upscaleResolution && upscaleResolution !== "none") {
    // Allowlist before consuming the resolution in a subprocess (defense in depth).
    if (!ALLOWED_UPSCALES.has(upscaleResolution)) {
      return { error: "Invalid upscale resolution" };
    }
    if (onLog) onLog(`Upscaling result (${upscaleResolution})…\n`);
    const upscaled = await generateUpscale(
      projectId,
      outputFile,
      upscaleResolution,
      onLog,
    );
    if ("error" in upscaled) return { error: upscaled.error };
    return upscaled;
  }

  return {
    filename: outputFile,
    url: `/api/files?path=${encodeURIComponent(outputPath)}`,
  };
}

// ========== Routes ==========

export async function renderMediaRoutes({
  app,
  getUvPath,
}: {
  app: Application;
  getUvPath: () => Promise<string>;
}) {
  // ========== Upload ==========

  // Serve generated files so the browser can display them
  app.get("/api/files", async (req, res) => {
    const filePath = req.query.path as string;
    if (!filePath) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    // Resolve and verify the path is within allowed directories
    let resolved: string;
    try {
      resolved = realpathSync(filePath);
    } catch {
      res.status(404).json({ error: "File not found" });
      return;
    }

    if (!isPathAllowed(resolved)) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    try {
      const buffer = readFileSync(resolved);
      res.setHeader(
        "Content-Type",
        mimeType(resolved) || "application/octet-stream",
      );
      res.setHeader("Content-Length", String(buffer.length));
      res.setHeader("Cache-Control", "no-cache");
      res.end(buffer);
    } catch (e) {
      res
        .status(500)
        .json({ error: "Failed to read file", details: String(e) });
    }
  });

  app.post("/api/upload/image", async (req, res) => {
    const { image, filename, projectId } = req.body || {};

    if (!image) {
      res.status(400).json({ error: "Image data is required (base64)" });
      return;
    }
    if (!projectId) {
      res.status(400).json({ error: "Project ID is required" });
      return;
    }

    try {
      // Decode base64 (strip data URL prefix if present)
      const base64 = image.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64, "base64");

      const projectUploadDir = join(projectDir(projectId), "upload");
      ensureDir(projectUploadDir);

      const safeName = (filename || `upload-${Date.now()}.png`).replace(
        /[^a-zA-Z0-9._-]/g,
        "_",
      );
      const filePath = join(projectUploadDir, safeName);

      writeFileSync(filePath, buffer);

      res.json({
        success: true,
        path: filePath,
        filename: safeName,
        size: buffer.length,
      });
    } catch (e) {
      res
        .status(500)
        .json({ error: "Failed to save image", details: String(e) });
    }
  });

  app.post("/api/upload/video", async (req, res) => {
    const { video, filename, projectId } = req.body || {};

    if (!video) {
      res.status(400).json({ error: "Video data is required (base64)" });
      return;
    }
    if (!projectId || !isValidProjectId(String(projectId))) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }

    try {
      // Decode base64 (strip any data URL prefix if present)
      const base64 = String(video).replace(/^data:[^;]+;base64,/, "");
      const buffer = Buffer.from(base64, "base64");

      const projectUploadDir = join(projectDir(String(projectId)), "upload");
      ensureDir(projectUploadDir);

      const safeName = (filename || `upload-${Date.now()}.mp4`).replace(
        /[^a-zA-Z0-9._-]/g,
        "_",
      );
      const filePath = join(projectUploadDir, safeName);

      writeFileSync(filePath, buffer);

      res.json({
        success: true,
        path: filePath,
        filename: safeName,
        size: buffer.length,
      });
    } catch (e) {
      res
        .status(500)
        .json({ error: "Failed to save video", details: String(e) });
    }
  });

  app.post("/api/upload/audio", async (req, res) => {
    const { audio, filename, projectId } = req.body || {};

    if (!audio) {
      res.status(400).json({ error: "Audio data is required (base64)" });
      return;
    }
    if (!projectId || !isValidProjectId(String(projectId))) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }

    try {
      // Decode base64 (strip data URL prefix if present)
      const base64 = String(audio).replace(/^data:audio\/\w+;base64,/, "");
      const buffer = Buffer.from(base64, "base64");

      const projectUploadDir = join(projectDir(projectId), "upload");
      ensureDir(projectUploadDir);

      const safeName = (filename || `upload-${Date.now()}.mp3`).replace(
        /[^a-zA-Z0-9._-]/g,
        "_",
      );
      const filePath = join(projectUploadDir, safeName);

      writeFileSync(filePath, buffer);

      res.json({
        success: true,
        path: filePath,
        filename: safeName,
        size: buffer.length,
      });
    } catch (e) {
      res
        .status(500)
        .json({ error: "Failed to save audio", details: String(e) });
    }
  });

  // List project images (from uploads and generated outputs)
  app.get("/api/projects/:id/images", (req, res) => {
    const { id } = req.params;
    if (!isValidProjectId(id)) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    const imageExts = new Set([
      ".png",
      ".jpg",
      ".jpeg",
      ".webp",
      ".gif",
      ".bmp",
    ]);
    const results: {
      filename: string;
      url: string;
      source: "upload" | "generated";
    }[] = [];

    for (const [source, dir] of [
      ["upload", "upload"],
      ["generated", "output"],
    ] as const) {
      const projRoot = join(projectDir(id), dir);
      if (!existsSync(projRoot)) continue;

      let entries: string[];
      try {
        entries = readdirSync(projRoot);
      } catch {
        continue;
      }

      for (const entry of entries) {
        const ext = entry.slice(entry.lastIndexOf(".")).toLowerCase();
        if (!imageExts.has(ext)) continue;

        const fullPath = join(projRoot, entry);
        try {
          if (!statSync(fullPath).isFile()) continue;
        } catch {
          continue;
        }

        results.push({
          filename: entry,
          url: `/api/files?path=${encodeURIComponent(fullPath)}`,
          source,
        });
      }
    }

    // Sort newest first (by filename which often includes timestamp)
    results.sort((a, b) => b.filename.localeCompare(a.filename));
    res.json(results);
  });

  // List project videos (from generated outputs)
  app.get("/api/projects/:id/videos", (req, res) => {
    const { id } = req.params;
    if (!isValidProjectId(id)) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    const videoExts = new Set([".mp4"]);

    const raw: { filename: string; url: string; birthtime: number }[] = [];

    // Videos can live in both the output dir (generated) and the upload dir.
    for (const dir of ["output", "upload"]) {
      const projRoot = join(projectDir(id), dir);
      if (!existsSync(projRoot)) continue;

      let entries: string[];
      try {
        entries = readdirSync(projRoot);
      } catch {
        continue;
      }

      for (const entry of entries) {
        const ext = entry.slice(entry.lastIndexOf(".")).toLowerCase();
        if (!videoExts.has(ext)) continue;

        const fullPath = join(projRoot, entry);
        let stats;
        try {
          stats = statSync(fullPath);
          if (!stats.isFile()) continue;
        } catch {
          continue;
        }

        raw.push({
          filename: entry,
          url: `/api/files?path=${encodeURIComponent(fullPath)}`,
          birthtime: stats.birthtimeMs,
        });
      }
    }

    // Sort newest first by file creation date
    raw.sort((a, b) => b.birthtime - a.birthtime);
    const results = raw.map(({ filename, url }) => ({ filename, url }));
    res.json(results);
  });

  // List project audio (from uploads)
  app.get("/api/projects/:id/audios", (req, res) => {
    const { id } = req.params;
    if (!isValidProjectId(id)) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    const audioExts = new Set([
      ".mp3",
      ".wav",
      ".m4a",
      ".flac",
      ".aac",
      ".ogg",
      ".opus",
    ]);

    const raw: { filename: string; url: string; birthtime: number }[] = [];

    for (const dir of ["upload", "output"]) {
      const projRoot = join(projectDir(id), dir);
      if (!existsSync(projRoot)) continue;

      let entries: string[];
      try {
        entries = readdirSync(projRoot);
      } catch {
        continue;
      }

      for (const entry of entries) {
        const ext = entry.slice(entry.lastIndexOf(".")).toLowerCase();
        if (!audioExts.has(ext)) continue;

        const fullPath = join(projRoot, entry);
        let stats;
        try {
          stats = statSync(fullPath);
          if (!stats.isFile()) continue;
        } catch {
          continue;
        }

        raw.push({
          filename: entry,
          url: `/api/files?path=${encodeURIComponent(fullPath)}`,
          birthtime: stats.birthtimeMs,
        });
      }
    }

    raw.sort((a, b) => b.birthtime - a.birthtime);
    res.json(raw.map(({ filename, url }) => ({ filename, url })));
  });

  // List previously generated voice clones by scanning the voices folder. Each
  // voice lives in its own subfolder with a meta.json (no central JSON index).
  app.get("/api/projects/:id/voices", (req, res) => {
    const { id } = req.params;
    if (!isValidProjectId(id)) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }

    const voicesRoot = join(projectDir(id), "output", "voices");
    const results: {
      id: string;
      transcript: string;
      quality: string;
      refAudioFilename: string | null;
      filename: string;
      createdAt: string | null;
      url: string;
    }[] = [];

    if (existsSync(voicesRoot)) {
      let names: string[] = [];
      try {
        names = readdirSync(voicesRoot);
      } catch {
        names = [];
      }

      for (const name of names) {
        const voiceDir = join(voicesRoot, name);
        let isDir = false;
        try {
          isDir = statSync(voiceDir).isDirectory();
        } catch {
          isDir = false;
        }
        if (!isDir) continue;

        let meta: any = null;
        try {
          meta = JSON.parse(readFileSync(join(voiceDir, "meta.json"), "utf-8"));
        } catch {
          continue; // folder without a meta.json — skip
        }

        const filename = String(meta?.filename || TTS_OUTPUT_FILENAME);
        const audioPath = join(voiceDir, filename);
        if (!existsSync(audioPath)) continue;

        results.push({
          id: name,
          transcript: String(meta?.transcript ?? ""),
          quality: String(meta?.quality ?? "high"),
          refAudioFilename: meta?.refAudioFilename ?? null,
          filename,
          createdAt: meta?.createdAt ?? null,
          url: `/api/files?path=${encodeURIComponent(audioPath)}`,
        });
      }
    }

    results.sort((a, b) =>
      String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")),
    );
    res.json(results);
  });

  // ========== Render: Text-to-Image ==========

  app.post("/api/render/text-to-image", async (req, res) => {
    const {
      prompt,
      projectId,
      width = 512,
      height = 512,
      steps,
    } = req.body || {};

    if (!prompt) {
      res.status(400).json({ error: "Prompt is required" });
      return;
    }
    if (!projectId) {
      res.status(400).json({ error: "Project ID is required" });
      return;
    }

    // SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (event: string, data: object) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const mlxgen = await getMlxgenBin();
      const projectOutputDir = join(projectDir(projectId), "output");
      ensureDir(projectOutputDir);

      const outputFile = `img-${Date.now()}.png`;
      const outputPath = join(projectOutputDir, outputFile);

      send("progress", {
        status: "starting",
        label: "Generating image...",
        outputFile,
      });

      // z-image-turbo is a few-step distillation model; default to 4 steps.
      const resolvedSteps = Number(steps) > 0 ? Number(steps) : 4;

      const args: string[] = [
        mlxgen,
        "generate",
        "--model",
        Z_IMAGE_MODEL,
        "--prompt",
        prompt,
        "--output",
        outputPath,
        "--steps",
        String(resolvedSteps),
      ];

      const outWidth = Number(width);
      const outHeight = Number(height);
      if (
        Number.isInteger(outWidth) &&
        outWidth > 0 &&
        Number.isInteger(outHeight) &&
        outHeight > 0
      ) {
        args.push("--width", String(outWidth), "--height", String(outHeight));
      }

      const proc = spawn(args, {
        stdout: "pipe",
        stderr: "pipe",
      });

      activeProc = proc;

      // Stream stdout/stderr concurrently
      const stdoutPromise = streamToSSE(
        proc.stdout as ReadableStream<Uint8Array>,
        "MLXGen",
        send,
      );
      const stderrText = await streamToSSE(
        proc.stderr as ReadableStream<Uint8Array>,
        "MLXGen",
        send,
      );
      await stdoutPromise;

      const exitCode = await proc.exited;
      const success = exitCode === 0 && existsSync(outputPath);

      if (success) {
        send("complete", {
          success: true,
          path: outputPath,
          filename: outputFile,
        });
      } else {
        send("error", {
          error: stderrText || `Process exited with code ${exitCode}`,
          exitCode,
        });
      }
    } catch (e) {
      send("error", { error: String(e) });
    } finally {
      activeProc = null;
      res.end();
    }
  });

  // ========== Render: Image-to-Video ==========

  app.post("/api/render/image-to-video", async (req, res) => {
    const {
      prompt,
      imagePath,
      projectId,
      outputDir,
      width = 480,
      height = 480,
      frames = 121,
      frameRate = 24,
      mode = "distilled",
      stage1Steps,
      stage2Steps,
      model,
    } = req.body || {};

    if (!prompt) {
      res.status(400).json({ error: "Prompt is required" });
      return;
    }
    if (!imagePath) {
      res.status(400).json({ error: "Image path is required" });
      return;
    }
    if (!projectId || !isValidProjectId(String(projectId))) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    if (
      typeof mode !== "string" ||
      !Object.keys(VIDEO_STAGE_FLAGS).includes(mode)
    ) {
      res.status(400).json({ error: "Invalid mode" });
      return;
    }

    // Resolve image path — only allow project-relative paths (no absolute paths)
    const resolvedImage = resolveSafePath(imagePath, projectId);
    if (!resolvedImage) {
      res.status(400).json({
        error:
          "Invalid image path. Provide a filename previously uploaded to this project.",
      });
      return;
    }

    // SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (event: string, data: object) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const ltxFolder = join(PYTHON_DIR, "ltx-2-mlx");
      if (!existsSync(ltxFolder)) {
        send("error", { error: "ltx-2-mlx not found. Run setup first." });
        res.end();
        return;
      }

      const uvPath = await getUvPath();
      const projectOutputDir = resolveOutputDir(outputDir, projectId);
      if (!projectOutputDir) {
        send("error", { error: "Invalid output directory." });
        res.end();
        return;
      }

      const outputFile = `video-${Date.now()}.mp4`;
      const outputPath = join(projectOutputDir, outputFile);

      const videoWidth = Number(width) || 480;
      const videoHeight = Number(height) || 480;
      const videoFrames = Number(frames) || 121;
      const videoFps = Number(frameRate) || 24;
      const stage1 = Math.max(1, Math.round(Number(stage1Steps)) || 30);
      const stage2 = Math.max(1, Math.round(Number(stage2Steps)) || 3);

      send("progress", {
        status: "starting",
        label: "Generating video...",
        outputFile,
        settings: {
          width: videoWidth,
          height: videoHeight,
          frames: videoFrames,
          fps: videoFps,
        },
      });

      const proc = spawn(
        [
          uvPath,
          "run",
          "ltx-2-mlx",
          "generate",
          "--model",
          resolveLtxModel(model),
          "--prompt",
          prompt,
          stageFlagFor(mode),
          "--stage1-steps",
          String(stage1),
          "--stage2-steps",
          String(stage2),
          // "--low-ram",
          "--frames",
          String(videoFrames),
          "--width",
          String(videoWidth),
          "--height",
          String(videoHeight),
          "--frame-rate",
          String(videoFps),
          "--image",
          resolvedImage,
          "--output",
          outputPath,
        ],
        {
          env: process.env,
          cwd: ltxFolder,
          stdout: "pipe",
          stderr: "pipe",
        },
      );

      activeProc = proc;

      // Stream stdout/stderr concurrently
      const stdoutPromise = streamToSSE(
        proc.stdout as ReadableStream<Uint8Array>,
        "Video",
        send,
      );
      const stderrText = await streamToSSE(
        proc.stderr as ReadableStream<Uint8Array>,
        "Video",
        send,
      );
      await stdoutPromise;

      const exitCode = await proc.exited;
      const success = exitCode === 0 && existsSync(outputPath);

      if (success) {
        send("complete", {
          success: true,
          path: outputPath,
          filename: outputFile,
        });
      } else {
        send("error", {
          error: stderrText || `Process exited with code ${exitCode}`,
          exitCode,
        });
      }
    } catch (e) {
      send("error", { error: String(e) });
    } finally {
      activeProc = null;
      res.end();
    }
  });

  // ========== Movie Studio: Render (characters/places/scenes → images/videos) ==========

  app.post("/api/movie-studio/render", async (req, res) => {
    const { projectId, characters, places, scenes } = req.body || {};

    if (!projectId || !isValidProjectId(String(projectId))) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    if (
      !Array.isArray(characters) ||
      !Array.isArray(places) ||
      !Array.isArray(scenes)
    ) {
      res
        .status(400)
        .json({ error: "characters, places, scenes are required" });
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (event: string, data: object) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const outputDir = join(projectDir(String(projectId)), "output");
    ensureDir(outputDir);

    let stepCount = 0;
    const totalSteps =
      (Array.isArray(characters) ? characters.length : 0) +
      (Array.isArray(places) ? places.length : 0) +
      (Array.isArray(scenes) ? scenes.length : 0) * 2;
    const progress = (label: string) => {
      stepCount += 1;
      send("progress", { label, current: stepCount, total: totalSteps });
    };

    const runStep = async (
      args: string[],
      opts: { cwd?: string; label: string; outputPath?: string },
    ): Promise<{ success: boolean; stderr: string }> => {
      const proc = spawn(args, {
        env: process.env,
        stdout: "pipe",
        stderr: "pipe",
        ...(opts.cwd ? { cwd: opts.cwd } : {}),
      });
      activeProc = proc;
      const stdoutPromise = streamToSSE(
        proc.stdout as ReadableStream<Uint8Array>,
        opts.label,
        send,
      );
      const stderrText = await streamToSSE(
        proc.stderr as ReadableStream<Uint8Array>,
        opts.label,
        send,
      );
      await stdoutPromise;
      const exitCode = await proc.exited;
      const success =
        exitCode === 0 && (!opts.outputPath || existsSync(opts.outputPath));
      return { success, stderr: stderrText };
    };

    const slug = (v: unknown): string =>
      String(v || "")
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, "_");

    try {
      const mlxgen = await getMlxgenBin();

      // 1. Character images (text-to-image).
      for (const c of characters) {
        const s = slug(c?.slug);
        const prompt = String(c?.imagePrompt || "").trim();
        if (!s || !prompt) continue;
        progress(`Generating character: ${c?.name || s}`);
        const outputFile = `character-${s}.png`;
        const outputPath = join(outputDir, outputFile);
        const result = await runStep(
          [
            mlxgen,
            "generate",
            "--model",
            Z_IMAGE_MODEL,
            "--prompt",
            prompt,
            "--output",
            outputPath,
            "--steps",
            "4",
            "--width",
            "1024",
            "--height",
            "1024",
          ],
          { label: "Character", outputPath },
        );
        if (!result.success) {
          send("error", { error: `Character "${s}" failed: ${result.stderr}` });
          return;
        }
        send("image", {
          kind: "character",
          slug: s,
          filename: outputFile,
          url: `/api/files?path=${encodeURIComponent(outputPath)}`,
        });
      }

      // 2. Place images (text-to-image).
      for (const p of places) {
        const s = slug(p?.slug);
        const prompt = String(p?.imagePrompt || "").trim();
        if (!s || !prompt) continue;
        progress(`Generating place: ${p?.name || s}`);
        const outputFile = `place-${s}.png`;
        const outputPath = join(outputDir, outputFile);
        const result = await runStep(
          [
            mlxgen,
            "generate",
            "--model",
            Z_IMAGE_MODEL,
            "--prompt",
            prompt,
            "--output",
            outputPath,
            "--steps",
            "4",
            "--width",
            "1024",
            "--height",
            "1024",
          ],
          { label: "Place", outputPath },
        );
        if (!result.success) {
          send("error", { error: `Place "${s}" failed: ${result.stderr}` });
          return;
        }
        send("image", {
          kind: "place",
          slug: s,
          filename: outputFile,
          url: `/api/files?path=${encodeURIComponent(outputPath)}`,
        });
      }

      // 3. Scenes: image (fast-image-edit) then video (ltx-2.3).
      const uvPath = await getUvPath();
      const sceneResults: any[] = [];

      for (const sc of scenes) {
        const s = slug(sc?.slug);
        if (!s) continue;

        // 3a. Scene image via fast-image-edit (FLUX.2 Klein).
        progress(`Generating scene image: ${s}`);
        const image = await generateSceneImage(String(projectId), sc);
        if ("error" in image) {
          send("error", {
            error: `Scene image "${s}" failed: ${image.error}`,
          });
          continue;
        }
        send("image", {
          kind: "scene",
          slug: s,
          filename: image.filename,
          url: image.url,
        });

        // 3b. Scene video via LTX-2.3 (320p, 9:16, distilled).
        progress(`Generating scene video: ${s}`);
        const video = await generateSceneVideo(
          uvPath,
          String(projectId),
          sc,
          characters,
        );
        if ("error" in video) {
          send("error", {
            error: `Scene video "${s}" failed: ${video.error}`,
          });
          continue;
        }
        send("video", {
          slug: s,
          filename: video.filename,
          url: video.url,
        });
        sceneResults.push({
          slug: s,
          image: image.filename,
          video: video.filename,
        });
      }

      send("complete", { scenes: sceneResults });
    } catch (e) {
      send("error", { error: String(e) });
    } finally {
      activeProc = null;
      res.end();
    }
  });

  // ========== Movie Studio: Render Assets (characters + places images) ==========

  app.post("/api/movie-studio/render-assets", async (req, res) => {
    const { projectId, characters, places } = req.body || {};

    if (!projectId || !isValidProjectId(String(projectId))) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    if (!Array.isArray(characters) || !Array.isArray(places)) {
      res.status(400).json({ error: "characters and places are required" });
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (event: string, data: object) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const slugify = (v: unknown): string =>
      String(v || "")
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, "_");

    const assets: {
      characters: { slug: string; filename: string; url: string }[];
      places: { slug: string; filename: string; url: string }[];
    } = { characters: [], places: [] };

    try {
      for (const c of characters) {
        const slug = slugify(c?.slug);
        const prompt = String(c?.imagePrompt || "").trim();
        if (!slug || !prompt) continue;
        send("progress", { label: `Generating character: ${c?.name || slug}` });
        const r = await generateAssetImage(
          String(projectId),
          "character",
          slug,
          prompt,
        );
        if ("error" in r) {
          send("error", { error: r.error });
          continue;
        }
        assets.characters.push({ slug, ...r });
        send("image", { kind: "character", slug, ...r });
      }

      for (const p of places) {
        const slug = slugify(p?.slug);
        const prompt = String(p?.imagePrompt || "").trim();
        if (!slug || !prompt) continue;
        send("progress", { label: `Generating place: ${p?.name || slug}` });
        const r = await generateAssetImage(
          String(projectId),
          "place",
          slug,
          prompt,
        );
        if ("error" in r) {
          send("error", { error: r.error });
          continue;
        }
        assets.places.push({ slug, ...r });
        send("image", { kind: "place", slug, ...r });
      }

      send("complete", { assets });
    } catch (e) {
      send("error", { error: String(e) });
    } finally {
      activeProc = null;
      res.end();
    }
  });

  // Regenerate a single character/place image.
  app.post("/api/movie-studio/render-asset", async (req, res) => {
    const { projectId, kind, slug, prompt } = req.body || {};

    if (!projectId || !isValidProjectId(String(projectId))) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    if (kind !== "character" && kind !== "place") {
      res.status(400).json({ error: "kind must be 'character' or 'place'" });
      return;
    }
    const safeSlug = String(slug || "")
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, "_");
    const safePrompt = String(prompt || "").trim();
    if (!safeSlug || !safePrompt) {
      res.status(400).json({ error: "slug and prompt are required" });
      return;
    }

    try {
      const r = await generateAssetImage(
        String(projectId),
        kind,
        safeSlug,
        safePrompt,
      );
      if ("error" in r) {
        res.status(500).json({ error: r.error });
        return;
      }
      res.json(r);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    } finally {
      activeProc = null;
    }
  });

  // Upload a character reference image (saved as character-<slug>.png so it is
  // picked up by scene-image generation).
  app.post("/api/movie-studio/upload-character-image", async (req, res) => {
    const { projectId, slug, image } = req.body || {};

    if (!projectId || !isValidProjectId(String(projectId))) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    const safeSlug = String(slug || "")
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, "_");
    if (!safeSlug) {
      res.status(400).json({ error: "slug is required" });
      return;
    }
    const base64 = String(image || "").replace(/^data:image\/\w+;base64,/, "");
    if (!base64) {
      res.status(400).json({ error: "Image data is required (base64)" });
      return;
    }

    try {
      const buffer = Buffer.from(base64, "base64");
      const outputDir = join(projectDir(String(projectId)), "output");
      ensureDir(outputDir);
      const outputFile = `character-${safeSlug}.png`;
      const outputPath = join(outputDir, outputFile);
      writeFileSync(outputPath, buffer);
      backupFile(outputPath, String(projectId));
      res.json({
        filename: outputFile,
        url: `/api/files?path=${encodeURIComponent(outputPath)}`,
      });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // ========== Movie Studio: Render Videos (scene videos only) ==========

  app.post("/api/movie-studio/render-videos", async (req, res) => {
    const { projectId, characters, scenes } = req.body || {};

    if (!projectId || !isValidProjectId(String(projectId))) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    if (!Array.isArray(characters) || !Array.isArray(scenes)) {
      res.status(400).json({ error: "characters and scenes are required" });
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (event: string, data: object) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const total = scenes.length;
    let current = 0;

    try {
      const uvPath = await getUvPath();
      const videos: { slug: string; filename: string; url: string }[] = [];

      for (const sc of scenes) {
        const slug = String(sc?.slug || "")
          .trim()
          .replace(/[^a-zA-Z0-9_-]/g, "_");
        if (!slug) continue;
        current += 1;
        send("progress", {
          label: `Generating video: ${slug}`,
          current,
          total,
        });
        const r = await generateSceneVideo(
          uvPath,
          String(projectId),
          sc,
          characters,
        );
        if ("error" in r) {
          send("error", { error: r.error });
          continue;
        }
        videos.push({ slug, ...r });
        send("video", { slug, ...r });
      }

      send("complete", { videos });
    } catch (e) {
      send("error", { error: String(e) });
    } finally {
      activeProc = null;
      res.end();
    }
  });

  // Regenerate a single scene video.
  app.post("/api/movie-studio/render-video", async (req, res) => {
    const { projectId, scene, characters } = req.body || {};

    if (!projectId || !isValidProjectId(String(projectId))) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    if (!scene || typeof scene !== "object") {
      res.status(400).json({ error: "scene is required" });
      return;
    }

    try {
      const uvPath = await getUvPath();
      const r = await generateSceneVideo(
        uvPath,
        String(projectId),
        scene,
        Array.isArray(characters) ? characters : [],
      );
      if ("error" in r) {
        res.status(500).json({ error: r.error });
        return;
      }
      res.json(r);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    } finally {
      activeProc = null;
    }
  });

  // ========== Movie Studio: Render Scene Images (fast-image-edit) ==========

  app.post("/api/movie-studio/render-scene-images", async (req, res) => {
    const { projectId, scenes } = req.body || {};

    if (!projectId || !isValidProjectId(String(projectId))) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    if (!Array.isArray(scenes)) {
      res.status(400).json({ error: "scenes are required" });
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (event: string, data: object) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const total = scenes.length;
    let current = 0;

    try {
      const images: { slug: string; filename: string; url: string }[] = [];

      for (const sc of scenes) {
        const slug = slugify(sc?.slug);
        if (!slug) continue;
        current += 1;
        send("progress", {
          label: `Generating scene image: ${slug}`,
          current,
          total,
        });
        const r = await generateSceneImage(String(projectId), sc);
        if ("error" in r) {
          send("error", { error: r.error });
          continue;
        }
        images.push({ slug, ...r });
        send("image", { slug, ...r });
      }

      send("complete", { images });
    } catch (e) {
      send("error", { error: String(e) });
    } finally {
      activeProc = null;
      res.end();
    }
  });

  // Regenerate a single scene image.
  app.post("/api/movie-studio/render-scene-image", async (req, res) => {
    const { projectId, scene } = req.body || {};

    if (!projectId || !isValidProjectId(String(projectId))) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    if (!scene || typeof scene !== "object") {
      res.status(400).json({ error: "scene is required" });
      return;
    }

    try {
      const r = await generateSceneImage(String(projectId), scene);
      if ("error" in r) {
        res.status(500).json({ error: r.error });
        return;
      }
      res.json(r);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    } finally {
      activeProc = null;
    }
  });

  // ========== Render: Text-to-Video ==========

  app.post("/api/render/text-to-video", async (req, res) => {
    const {
      prompt,
      projectId,
      outputDir,
      width = 480,
      height = 480,
      frames = 121,
      frameRate = 24,
      mode = "distilled",
    } = req.body || {};

    if (!prompt) {
      res.status(400).json({ error: "Prompt is required" });
      return;
    }
    if (!projectId || !isValidProjectId(String(projectId))) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    if (
      typeof mode !== "string" ||
      !Object.keys(VIDEO_STAGE_FLAGS).includes(mode)
    ) {
      res.status(400).json({ error: "Invalid mode" });
      return;
    }

    // SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (event: string, data: object) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const ltxFolder = join(PYTHON_DIR, "ltx-2-mlx");
      if (!existsSync(ltxFolder)) {
        send("error", { error: "ltx-2-mlx not found. Run setup first." });
        res.end();
        return;
      }

      const uvPath = await getUvPath();
      const projectOutputDir = resolveOutputDir(outputDir, projectId);
      if (!projectOutputDir) {
        send("error", { error: "Invalid output directory." });
        res.end();
        return;
      }

      const outputFile = `video-${Date.now()}.mp4`;
      const outputPath = join(projectOutputDir, outputFile);

      const videoWidth = Number(width) || 480;
      const videoHeight = Number(height) || 480;
      const videoFrames = Number(frames) || 121;
      const videoFps = Number(frameRate) || 24;

      send("progress", {
        status: "starting",
        label: "Generating video...",
        outputFile,
        settings: {
          width: videoWidth,
          height: videoHeight,
          frames: videoFrames,
          fps: videoFps,
        },
      });

      const proc = spawn(
        [
          uvPath,
          "run",
          "ltx-2-mlx",
          "generate",
          "--model",
          "dgrauet/ltx-2.3-mlx-q8",
          "--prompt",
          prompt,
          stageFlagFor(mode),
          // "--low-ram",
          "--frames",
          String(videoFrames),
          "--width",
          String(videoWidth),
          "--height",
          String(videoHeight),
          "--frame-rate",
          String(videoFps),
          "--output",
          outputPath,
        ],
        {
          env: process.env,
          cwd: ltxFolder,
          stdout: "pipe",
          stderr: "pipe",
        },
      );

      activeProc = proc;

      const stdoutPromise = streamToSSE(
        proc.stdout as ReadableStream<Uint8Array>,
        "TextVideo",
        send,
      );
      const stderrText = await streamToSSE(
        proc.stderr as ReadableStream<Uint8Array>,
        "TextVideo",
        send,
      );
      await stdoutPromise;

      const exitCode = await proc.exited;
      const success = exitCode === 0 && existsSync(outputPath);

      if (success) {
        send("complete", {
          success: true,
          path: outputPath,
          filename: outputFile,
        });
      } else {
        send("error", {
          error: stderrText || `Process exited with code ${exitCode}`,
          exitCode,
        });
      }
    } catch (e) {
      send("error", { error: String(e) });
    } finally {
      activeProc = null;
      res.end();
    }
  });

  // ========== MLX-Audio: Status ==========

  app.get("/api/mlxaudio/status", async (_req, res) => {
    // Never throw on a missing uv — installation state is based on the folder.
    try {
      await getUvPath();
    } catch {
      // uv not found; installed is still reported from the folder below.
    }
    res.json({
      installed: existsSync(join(PYTHON_DIR, "mlx-audio")),
    });
  });

  // ========== Render: Voice Chat (TTS with reference voice) ==========

  app.post("/api/render/voice-chat", async (req, res) => {
    const { text, refAudioPath, projectId } = req.body || {};

    if (!text || typeof text !== "string" || !text.trim()) {
      res.status(400).json({ error: "Text is required" });
      return;
    }
    if (!refAudioPath) {
      res.status(400).json({ error: "Reference audio is required" });
      return;
    }
    if (!projectId || !isValidProjectId(String(projectId))) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }

    // Resolve reference audio — only bare filenames in this project's dirs.
    const resolvedRef = resolveSafePath(refAudioPath, String(projectId));
    if (!resolvedRef) {
      res.status(400).json({
        error:
          "Invalid reference audio path. Provide a filename previously uploaded to this project.",
      });
      return;
    }

    // SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (event: string, data: object) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const uvPath = await getUvPath();
      const projectOutputDir = resolveOutputDir(null, String(projectId));
      if (!projectOutputDir) {
        send("error", { error: "Invalid output directory." });
        res.end();
        return;
      }

      // Isolate each utterance so a new response never overwrites a previous
      // one. mlx_audio writes the clip as <dir>/audio_000.mp3.
      const voiceDir = join(
        projectOutputDir,
        "voice-chat",
        `chat-${Date.now()}`,
      );
      ensureDir(voiceDir);

      send("progress", {
        status: "starting",
        label: "Generating voice...",
      });

      const proc = spawn(
        [
          uvPath,
          "run",
          "mlx_audio.tts.generate",
          "--model",
          TTS_MODELS.high,
          "--text",
          text.trim(),
          "--ref_audio",
          resolvedRef,
          // "--play",
          "--output",
          voiceDir,
          "--audio_format",
          "mp3",
          // "--stream",
          // "--save",
          "--instruct",
          "slow down",
        ],
        {
          env: process.env,
          cwd: voiceDir,
          stdout: "pipe",
          stderr: "pipe",
        },
      );

      activeProc = proc;

      const stdoutPromise = streamToSSE(
        proc.stdout as ReadableStream<Uint8Array>,
        "VoiceChat",
        send,
      );
      const stderrText = await streamToSSE(
        proc.stderr as ReadableStream<Uint8Array>,
        "VoiceChat",
        send,
      );
      await stdoutPromise;

      const exitCode = await proc.exited;
      if (exitCode === 0) {
        const path = resolveAudioFile(voiceDir);
        if (path) {
          send("complete", {
            success: true,
            path,
            filename: path.split(sep).pop(),
          });
        } else {
          send("error", {
            error: "TTS completed but no audio file was produced",
          });
        }
      } else {
        send("error", {
          error: stderrText || `Process exited with code ${exitCode}`,
          exitCode,
        });
      }
    } catch (e) {
      send("error", { error: String(e) });
    } finally {
      activeProc = null;
      res.end();
    }
  });

  // ========== MLX-Gen: Status ==========

  app.get("/api/mlxgen/status", (_req, res) => {
    res.json({
      installed: isMlxgenInstalled(),
      zModelDownloaded: isModelDownloaded(Z_IMAGE_MODEL),
      fluxModelDownloaded: isModelDownloaded(FLUX_KLEIN_MODEL),
      seedvr2Downloaded: isModelDownloaded(SEEDVR2_MODEL),
      qwenImageEditDownloaded: isModelDownloaded(QWEN_IMAGE_EDIT_MODEL),
    });
  });

  // ========== MLX-Gen: Install ==========

  app.post("/api/mlxgen/install", async (_req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (event: string, data: object) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const uvPath = await getUvPath();
      send("progress", {
        status: "starting",
        label: "Installing mlx-gen...",
      });

      const proc = spawn([uvPath, "tool", "install", "--upgrade", "mlx-gen"], {
        stdout: "pipe",
        stderr: "pipe",
      });

      activeProc = proc;

      const stdoutPromise = streamToSSE(
        proc.stdout as ReadableStream<Uint8Array>,
        "Install",
        send,
      );
      const stderrText = await streamToSSE(
        proc.stderr as ReadableStream<Uint8Array>,
        "Install",
        send,
      );
      await stdoutPromise;

      const exitCode = await proc.exited;
      if (exitCode === 0) {
        send("complete", { success: true });
      } else {
        send("error", {
          error: stderrText || `Process exited with code ${exitCode}`,
          exitCode,
        });
      }
    } catch (e) {
      send("error", { error: String(e) });
    } finally {
      activeProc = null;
      res.end();
    }
  });

  // ========== MLX-Gen: Download Z-Image Model ==========

  app.post("/api/mlxgen/download-z-model", async (_req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (event: string, data: object) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const model = Z_IMAGE_MODEL;

    try {
      const mlxgen = await getMlxgenBin();
      send("progress", {
        status: "starting",
        label: `Downloading model ${model}...`,
      });

      const proc = spawn([mlxgen, "download", "--model", model], {
        stdout: "pipe",
        stderr: "pipe",
      });

      activeProc = proc;

      const stdoutPromise = streamToSSE(
        proc.stdout as ReadableStream<Uint8Array>,
        "Download",
        send,
      );
      const stderrText = await streamToSSE(
        proc.stderr as ReadableStream<Uint8Array>,
        "Download",
        send,
      );
      await stdoutPromise;

      const exitCode = await proc.exited;
      if (exitCode === 0) {
        send("complete", { success: true });
      } else {
        send("error", {
          error: stderrText || `Process exited with code ${exitCode}`,
          exitCode,
        });
      }
    } catch (e) {
      send("error", { error: String(e) });
    } finally {
      activeProc = null;
      res.end();
    }
  });

  // ========== MLX-Gen: Download FLUX.2 Klein Model ==========

  app.post("/api/mlxgen/download-flux-model", async (_req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (event: string, data: object) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const mlxgen = await getMlxgenBin();
      send("progress", {
        status: "starting",
        label: `Downloading model ${FLUX_KLEIN_MODEL}...`,
      });

      const proc = spawn([mlxgen, "download", "--model", FLUX_KLEIN_MODEL], {
        stdout: "pipe",
        stderr: "pipe",
      });

      activeProc = proc;

      const stdoutPromise = streamToSSE(
        proc.stdout as ReadableStream<Uint8Array>,
        "Download",
        send,
      );
      const stderrText = await streamToSSE(
        proc.stderr as ReadableStream<Uint8Array>,
        "Download",
        send,
      );
      await stdoutPromise;

      const exitCode = await proc.exited;
      if (exitCode === 0) {
        send("complete", { success: true });
      } else {
        send("error", {
          error: stderrText || `Process exited with code ${exitCode}`,
          exitCode,
        });
      }
    } catch (e) {
      send("error", { error: String(e) });
    } finally {
      activeProc = null;
      res.end();
    }
  });

  // ========== MLX-Gen: Download SeedVR2 Model ==========

  app.post("/api/mlxgen/download-seedvr2-model", async (_req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (event: string, data: object) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const mlxgen = await getMlxgenBin();
      send("progress", {
        status: "starting",
        label: `Downloading model ${SEEDVR2_MODEL}...`,
      });

      const proc = spawn([mlxgen, "download", "--model", SEEDVR2_MODEL], {
        stdout: "pipe",
        stderr: "pipe",
      });

      activeProc = proc;

      const stdoutPromise = streamToSSE(
        proc.stdout as ReadableStream<Uint8Array>,
        "Download",
        send,
      );
      const stderrText = await streamToSSE(
        proc.stderr as ReadableStream<Uint8Array>,
        "Download",
        send,
      );
      await stdoutPromise;

      const exitCode = await proc.exited;
      if (exitCode === 0) {
        send("complete", { success: true });
      } else {
        send("error", {
          error: stderrText || `Process exited with code ${exitCode}`,
          exitCode,
        });
      }
    } catch (e) {
      send("error", { error: String(e) });
    } finally {
      activeProc = null;
      res.end();
    }
  });

  // ========== MLX-Gen: Download Qwen Image Edit Model ==========

  app.post("/api/mlxgen/download-qwen-image-edit-model", async (_req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (event: string, data: object) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const mlxgen = await getMlxgenBin();
      send("progress", {
        status: "starting",
        label: `Downloading model ${QWEN_IMAGE_EDIT_MODEL}...`,
      });

      const proc = spawn(
        [mlxgen, "download", "--model", QWEN_IMAGE_EDIT_MODEL],
        {
          stdout: "pipe",
          stderr: "pipe",
        },
      );

      activeProc = proc;

      const stdoutPromise = streamToSSE(
        proc.stdout as ReadableStream<Uint8Array>,
        "Download",
        send,
      );
      const stderrText = await streamToSSE(
        proc.stderr as ReadableStream<Uint8Array>,
        "Download",
        send,
      );
      await stdoutPromise;

      const exitCode = await proc.exited;
      if (exitCode === 0) {
        send("complete", { success: true });
      } else {
        send("error", {
          error: stderrText || `Process exited with code ${exitCode}`,
          exitCode,
        });
      }
    } catch (e) {
      send("error", { error: String(e) });
    } finally {
      activeProc = null;
      res.end();
    }
  });

  // ========== H3: Download Model ==========

  app.get("/api/h3/status", (_req, res) => {
    res.json({ downloaded: isH3ModelDownloaded() });
  });

  // ========== Hugging Face CLI + LTX Video Model ==========

  app.get("/api/hf/status", (_req, res) => {
    res.json({
      installed: whichSync("hf") !== null,
      ltxDownloaded: isModelDownloaded("dgrauet/ltx-2.3-mlx-q8"),
      ltxBaseDownloaded: isModelDownloaded("dgrauet/ltx-2.3-mlx"),
      ttsDownloaded: isModelDownloaded("Qwen/Qwen3-TTS-12Hz-1.7B-Base"),
      mlxVlmDownloaded: isModelDownloaded(MLX_VLM_MODEL),
    });
  });

  // ========== Dots-TTS: Status + Model Download ==========

  app.get("/api/dots-tts/status", (_req, res) => {
    res.json({ downloaded: isDotsTtsModelDownloaded() });
  });

  app.post("/api/dots-tts/download-model", async (_req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (event: string, data: object) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      ensureDir(DOTS_TTS_FOLDER);
      send("progress", {
        status: "starting",
        label: "Downloading dots-tts model (int4)...",
      });

      const proc = spawn(
        [
          "hf",
          "download",
          "shraey/dots-tts-mlx",
          "--include",
          "int4/*",
          "--local-dir",
          "./dots-tts-mlx-weights",
        ],
        { cwd: DOTS_TTS_FOLDER, stdout: "pipe", stderr: "pipe" },
      );

      activeProc = proc;

      const stdoutPromise = streamToSSE(
        proc.stdout as ReadableStream<Uint8Array>,
        "dots-tts",
        send,
      );
      const stderrText = await streamToSSE(
        proc.stderr as ReadableStream<Uint8Array>,
        "dots-tts",
        send,
      );
      await stdoutPromise;

      const exitCode = await proc.exited;
      if (exitCode === 0) {
        send("complete", { success: true });
      } else {
        send("error", {
          error: stderrText || `Process exited with code ${exitCode}`,
          exitCode,
        });
      }
    } catch (e) {
      send("error", { error: String(e) });
    } finally {
      activeProc = null;
      res.end();
    }
  });

  app.post("/api/hf/install", async (_req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (event: string, data: object) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      send("progress", {
        status: "starting",
        label: "Installing huggingface-cli...",
      });

      const proc = spawn(
        ["bash", "-c", "curl -LsSf https://hf.co/cli/install.sh | bash"],
        { stdout: "pipe", stderr: "pipe" },
      );

      activeProc = proc;

      const stdoutPromise = streamToSSE(
        proc.stdout as ReadableStream<Uint8Array>,
        "HF Install",
        send,
      );
      const stderrText = await streamToSSE(
        proc.stderr as ReadableStream<Uint8Array>,
        "HF Install",
        send,
      );
      await stdoutPromise;

      const exitCode = await proc.exited;
      if (exitCode === 0) {
        send("complete", { success: true });
      } else {
        send("error", {
          error: stderrText || `Process exited with code ${exitCode}`,
          exitCode,
        });
      }
    } catch (e) {
      send("error", { error: String(e) });
    } finally {
      activeProc = null;
      res.end();
    }
  });

  app.post("/api/hf/download-ltx", async (_req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (event: string, data: object) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      send("progress", {
        status: "starting",
        label: "Downloading dgrauet/ltx-2.3-mlx-q8...",
      });

      const proc = spawn(["hf", "download", "dgrauet/ltx-2.3-mlx-q8"], {
        stdout: "pipe",
        stderr: "pipe",
      });

      activeProc = proc;

      const stdoutPromise = streamToSSE(
        proc.stdout as ReadableStream<Uint8Array>,
        "HF Download",
        send,
      );
      const stderrText = await streamToSSE(
        proc.stderr as ReadableStream<Uint8Array>,
        "HF Download",
        send,
      );
      await stdoutPromise;

      const exitCode = await proc.exited;
      if (exitCode === 0) {
        send("complete", { success: true });
      } else {
        send("error", {
          error: stderrText || `Process exited with code ${exitCode}`,
          exitCode,
        });
      }
    } catch (e) {
      send("error", { error: String(e) });
    } finally {
      activeProc = null;
      res.end();
    }
  });

  app.post("/api/hf/download-ltx-base", async (_req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (event: string, data: object) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      send("progress", {
        status: "starting",
        label: "Downloading dgrauet/ltx-2.3-mlx...",
      });

      const proc = spawn(["hf", "download", "dgrauet/ltx-2.3-mlx"], {
        stdout: "pipe",
        stderr: "pipe",
      });

      activeProc = proc;

      const stdoutPromise = streamToSSE(
        proc.stdout as ReadableStream<Uint8Array>,
        "HF Download",
        send,
      );
      const stderrText = await streamToSSE(
        proc.stderr as ReadableStream<Uint8Array>,
        "HF Download",
        send,
      );
      await stdoutPromise;

      const exitCode = await proc.exited;
      if (exitCode === 0) {
        send("complete", { success: true });
      } else {
        send("error", {
          error: stderrText || `Process exited with code ${exitCode}`,
          exitCode,
        });
      }
    } catch (e) {
      send("error", { error: String(e) });
    } finally {
      activeProc = null;
      res.end();
    }
  });

  app.post("/api/hf/download-mlx-vlm", async (_req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (event: string, data: object) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      send("progress", {
        status: "starting",
        label: `Downloading ${MLX_VLM_MODEL}...`,
      });

      const proc = spawn(["hf", "download", MLX_VLM_MODEL], {
        stdout: "pipe",
        stderr: "pipe",
      });

      activeProc = proc;

      const stdoutPromise = streamToSSE(
        proc.stdout as ReadableStream<Uint8Array>,
        "HF Download",
        send,
      );
      const stderrText = await streamToSSE(
        proc.stderr as ReadableStream<Uint8Array>,
        "HF Download",
        send,
      );
      await stdoutPromise;

      const exitCode = await proc.exited;
      if (exitCode === 0) {
        send("complete", { success: true });
      } else {
        send("error", {
          error: stderrText || `Process exited with code ${exitCode}`,
          exitCode,
        });
      }
    } catch (e) {
      send("error", { error: String(e) });
    } finally {
      activeProc = null;
      res.end();
    }
  });

  app.post("/api/hf/download-tts", async (_req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (event: string, data: object) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      send("progress", {
        status: "starting",
        label: "Downloading Qwen/Qwen3-TTS-12Hz-1.7B-Base...",
      });

      const proc = spawn(["hf", "download", "Qwen/Qwen3-TTS-12Hz-1.7B-Base"], {
        stdout: "pipe",
        stderr: "pipe",
      });

      activeProc = proc;

      const stdoutPromise = streamToSSE(
        proc.stdout as ReadableStream<Uint8Array>,
        "HF Download",
        send,
      );
      const stderrText = await streamToSSE(
        proc.stderr as ReadableStream<Uint8Array>,
        "HF Download",
        send,
      );
      await stdoutPromise;

      const exitCode = await proc.exited;
      if (exitCode === 0) {
        send("complete", { success: true });
      } else {
        send("error", {
          error: stderrText || `Process exited with code ${exitCode}`,
          exitCode,
        });
      }
    } catch (e) {
      send("error", { error: String(e) });
    } finally {
      activeProc = null;
      res.end();
    }
  });

  // ========== MLX-Gen: Fast Image Edit (FLUX.2 Klein) ==========

  app.post("/api/mlxgen/fast-image-edit", async (req, res) => {
    const { prompt, images, projectId } = req.body || {};

    if (!prompt) {
      res.status(400).json({ error: "Prompt is required" });
      return;
    }
    if (!projectId) {
      res.status(400).json({ error: "Project ID is required" });
      return;
    }
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(String(projectId))) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    if (!Array.isArray(images) || images.length === 0) {
      res
        .status(400)
        .json({ error: "At least one reference image is required" });
      return;
    }

    // Decode each base64 reference image into a temp workspace file so the
    // FLUX model receives them as separate `--image` inputs.
    const tempDir = join(projectDir(String(projectId)), "temp");
    ensureDir(tempDir);
    const tempImagePaths: string[] = [];
    try {
      images.forEach((image, i) => {
        const base64 = String(image).replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64, "base64");
        const path = join(tempDir, `flux-ref-${Date.now()}-${i}.png`);
        writeFileSync(path, buffer);
        tempImagePaths.push(path);
      });
    } catch {
      res.status(400).json({ error: "Invalid reference image data" });
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (event: string, data: object) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const mlxgen = await getMlxgenBin();
      const projectOutputDir = join(projectDir(projectId), "output");
      ensureDir(projectOutputDir);

      const outputFile = `flux-edit-${Date.now()}.png`;
      const outputPath = join(projectOutputDir, outputFile);

      send("progress", {
        status: "starting",
        label: "Generating image...",
        outputFile,
      });

      const args: string[] = [mlxgen, "generate", "--model", FLUX_KLEIN_MODEL];

      console.log(tempImagePaths);

      for (const path of tempImagePaths) {
        args.push("--image", path);
      }

      args.push(
        "--prompt",
        prompt,
        "--output",
        outputPath,
        "--mlx-cache-limit-gb",
        "20",
        "--steps",
        "5",
        "--seed",
        "42",
        "--width",
        "1024",
        "--height",
        "1024",
      );

      const proc = spawn(args, {
        stdout: "pipe",
        stderr: "pipe",
      });

      activeProc = proc;

      const stdoutPromise = streamToSSE(
        proc.stdout as ReadableStream<Uint8Array>,
        "MLXGen",
        send,
      );
      const stderrText = await streamToSSE(
        proc.stderr as ReadableStream<Uint8Array>,
        "MLXGen",
        send,
      );
      await stdoutPromise;

      const exitCode = await proc.exited;
      const success = exitCode === 0 && existsSync(outputPath);

      if (success) {
        send("complete", {
          success: true,
          path: outputPath,
          filename: outputFile,
        });
      } else {
        send("error", {
          error: stderrText || `Process exited with code ${exitCode}`,
          exitCode,
        });
      }
    } catch (e) {
      send("error", { error: String(e) });
    } finally {
      activeProc = null;
      // Clean up the temporary reference images.
      for (const path of tempImagePaths) {
        try {
          unlinkSync(path);
        } catch {
          // already removed
        }
      }
      try {
        rmSync(tempDir, { force: true });
      } catch {
        // ignore cleanup failures
      }
      res.end();
    }
  });

  // ========== MLX-Gen: Advanced Image Edit (Qwen) ==========

  app.post("/api/mlxgen/advanced-image-edit", async (req, res) => {
    const {
      prompt,
      imagePath,
      projectId,
      width,
      height,
      steps,
      seed,
      lowRam,
    } = req.body || {};

    if (!prompt) {
      res.status(400).json({ error: "Prompt is required" });
      return;
    }
    if (!imagePath) {
      res.status(400).json({ error: "An input image is required" });
      return;
    }
    if (!projectId || !/^[a-zA-Z0-9_-]{1,64}$/.test(String(projectId))) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }

    const resolvedImage = resolveSafePath(String(imagePath), String(projectId));
    if (!resolvedImage || !existsSync(resolvedImage)) {
      res.status(404).json({ error: "Input image not found" });
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (event: string, data: object) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const mlxgen = await getMlxgenBin();
      const projectOutputDir = join(projectDir(String(projectId)), "output");
      ensureDir(projectOutputDir);

      const outputFile = `qwen-edit-${Date.now()}.png`;
      const outputPath = join(projectOutputDir, outputFile);

      send("progress", {
        status: "starting",
        label: "Generating image...",
        outputFile,
      });

      const resolvedSteps = Number(steps) > 0 ? Number(steps) : 8;
      const resolvedSeed = Number.isFinite(Number(seed)) ? Number(seed) : 42;

      const args: string[] = [
        mlxgen,
        "generate",
        "--model",
        QWEN_IMAGE_EDIT_MODEL,
        "--task",
        "image-to-image",
        "--i2i-mode",
        "edit",
        "--image",
        resolvedImage,
        "--output",
        outputPath,
        "--prompt",
        String(prompt),
        "--steps",
        String(resolvedSteps),
        "--seed",
        String(resolvedSeed),
        "--mlx-cache-limit-gb",
        "20",
      ];

      const outWidth = Number(width);
      const outHeight = Number(height);
      if (
        Number.isInteger(outWidth) &&
        outWidth > 0 &&
        Number.isInteger(outHeight) &&
        outHeight > 0
      ) {
        args.push("--width", String(outWidth), "--height", String(outHeight));
      }

      if (lowRam === true) {
        args.push("--low-ram");
      }

      const proc = spawn(args, {
        stdout: "pipe",
        stderr: "pipe",
      });

      activeProc = proc;

      const stdoutPromise = streamToSSE(
        proc.stdout as ReadableStream<Uint8Array>,
        "MLXGen",
        send,
      );
      const stderrText = await streamToSSE(
        proc.stderr as ReadableStream<Uint8Array>,
        "MLXGen",
        send,
      );
      await stdoutPromise;

      const exitCode = await proc.exited;
      const success = exitCode === 0 && existsSync(outputPath);

      if (success) {
        send("complete", {
          success: true,
          path: outputPath,
          filename: outputFile,
        });
      } else {
        send("error", {
          error: stderrText || `Process exited with code ${exitCode}`,
          exitCode,
        });
      }
    } catch (e) {
      send("error", { error: String(e) });
    } finally {
      activeProc = null;
      res.end();
    }
  });

  // ========== MLX-Gen: Generate (Text-to-Image) ==========

  app.post("/api/mlxgen/text-to-image", async (req, res) => {
    const { prompt, projectId, width, height, steps } = req.body || {};

    if (!prompt) {
      res.status(400).json({ error: "Prompt is required" });
      return;
    }
    if (!projectId) {
      res.status(400).json({ error: "Project ID is required" });
      return;
    }
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(String(projectId))) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (event: string, data: object) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const mlxgen = await getMlxgenBin();
      const projectOutputDir = join(projectDir(projectId), "output");
      ensureDir(projectOutputDir);

      const outputFile = `zimage-${Date.now()}.png`;
      const outputPath = join(projectOutputDir, outputFile);

      send("progress", {
        status: "starting",
        label: "Generating image...",
        outputFile,
      });

      // z-image-turbo is a few-step distillation model; default to 4 steps.
      const resolvedSteps = Number(steps) > 0 ? Number(steps) : 6;

      const model = Z_IMAGE_MODEL;

      const args: string[] = [
        mlxgen,
        "generate",
        "--model",
        model,
        "--prompt",
        prompt,
        "--output",
        outputPath,
        "--steps",
        String(resolvedSteps),
      ];

      const outWidth = Number(width);
      const outHeight = Number(height);
      if (
        Number.isInteger(outWidth) &&
        outWidth > 0 &&
        Number.isInteger(outHeight) &&
        outHeight > 0
      ) {
        args.push("--width", String(outWidth), "--height", String(outHeight));
      }

      const proc = spawn(args, {
        stdout: "pipe",
        stderr: "pipe",
      });

      activeProc = proc;

      const stdoutPromise = streamToSSE(
        proc.stdout as ReadableStream<Uint8Array>,
        "MLXGen",
        send,
      );
      const stderrText = await streamToSSE(
        proc.stderr as ReadableStream<Uint8Array>,
        "MLXGen",
        send,
      );
      await stdoutPromise;

      const exitCode = await proc.exited;
      const success = exitCode === 0 && existsSync(outputPath);

      if (success) {
        send("complete", {
          success: true,
          path: outputPath,
          filename: outputFile,
        });
      } else {
        send("error", {
          error: stderrText || `Process exited with code ${exitCode}`,
          exitCode,
        });
      }
    } catch (e) {
      send("error", { error: String(e) });
    } finally {
      activeProc = null;
      res.end();
    }
  });

  // ========== Agent (mlx-vlm) ==========

  app.get("/api/agent/status", (_req, res) => {
    res.json({
      installed: isMlxVlmInstalled(),
      serverRunning: agentServerProc !== null,
    });
  });

  app.post("/api/agent/install", async (_req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (event: string, data: object) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const uvPath = await getUvPath();
      send("progress", {
        status: "starting",
        label: "Installing mlx-vlm...",
      });

      const proc = spawn([uvPath, "tool", "install", "mlx-vlm"], {
        stdout: "pipe",
        stderr: "pipe",
      });

      activeProc = proc;

      const stdoutPromise = streamToSSE(
        proc.stdout as ReadableStream<Uint8Array>,
        "Install mlx-vlm",
        send,
      );
      const stderrText = await streamToSSE(
        proc.stderr as ReadableStream<Uint8Array>,
        "Install mlx-vlm",
        send,
      );
      await stdoutPromise;

      const exitCode = await proc.exited;
      if (exitCode === 0) {
        send("complete", { success: true });
      } else {
        send("error", {
          error: stderrText || `Process exited with code ${exitCode}`,
          exitCode,
        });
      }
    } catch (e) {
      send("error", { error: String(e) });
    } finally {
      activeProc = null;
      res.end();
    }
  });

  app.post("/api/agent/start", async (req, res) => {
    const { port, model } = req.body || {};
    const portNum = Number(port);
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      res
        .status(400)
        .json({ error: "Port must be an integer between 1 and 65535" });
      return;
    }
    const modelName =
      typeof model === "string" && model.trim() ? model.trim() : MLX_VLM_MODEL;

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (event: string, data: object) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const bin = await getMlxVlmServerBin();

      const killedPids = await killProcessOnPort(portNum);
      if (killedPids.length > 0) {
        send("log", {
          text: `Freed port ${portNum} (killed PID(s): ${killedPids.join(", ")})\n`,
        });
      }

      send("progress", {
        status: "starting",
        label: `Starting mlx-vlm server (${modelName}) on port ${portNum}...`,
      });

      const args: string[] = [
        bin,
        "--model",
        modelName,
        "--port",
        String(portNum),
        "--max-tokens",
        "256000",
      ];

      // const draftModel = DRAFT_MODELS[modelName];
      // if (draftModel) {
      //   args.push(
      //     "--draft-model",
      //     draftModel,
      //     "--draft-kind",
      //     "mtp",
      //     "--draft-block-size",
      //     "4",
      //   );
      // }

      const proc = spawn(args, {
        stdout: "pipe",
        stderr: "pipe",
      });

      agentServerProc = proc;
      agentServerPort = portNum;

      const stdoutPromise = streamToSSE(
        proc.stdout as ReadableStream<Uint8Array>,
        "Agent",
        send,
      );
      const stderrText = await streamToSSE(
        proc.stderr as ReadableStream<Uint8Array>,
        "Agent",
        send,
      );
      await stdoutPromise;

      const exitCode = await proc.exited;
      if (agentStopRequested) {
        send("complete", { success: true, stopped: true });
        agentStopRequested = false;
      } else if (exitCode === 0) {
        send("complete", { success: true });
      } else {
        send("error", {
          error: stderrText || `Server exited with code ${exitCode}`,
          exitCode,
        });
      }
    } catch (e) {
      send("error", { error: String(e) });
    } finally {
      agentServerProc = null;
      agentServerPort = null;
      res.end();
    }
  });

  app.post("/api/agent/stop", (_req, res) => {
    agentStopRequested = true;
    if (agentServerProc) {
      try {
        agentServerProc.kill();
      } catch {
        // process may already be dead
      }
    }
    agentServerPort = null;
    res.json({ ok: true });
  });

  app.post("/api/agent/open", (req, res) => {
    const { url } = req.body || {};
    const target = typeof url === "string" ? url.trim() : "";

    // Only open localhost http(s) URLs (avoid opening arbitrary schemes/files).
    if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/i.test(target)) {
      res.status(400).json({ error: "Invalid URL" });
      return;
    }

    spawn(["open", target], {
      stdout: "ignore",
      stderr: "ignore",
      onExit: (_proc, exitCode, _signalCode, _error) => {
        if (exitCode !== 0) {
          console.error(`open: "open ${target}" exited with code ${exitCode}`);
        }
      },
    });
    res.json({ ok: true });
  });

  // List all projects
  app.get("/api/open-output", (_req, res) => {
    try {
      openInFinder(PROJECTS_DIR);
    } catch {}

    res.json({ ok: true });
  });

  // ========== Render: Cancel ==========

  app.post("/api/render/cancel", (_req, res) => {
    cancelActiveRender();
    res.json({ ok: true });
  });

  // ========== Project CRUD ==========

  // List all projects
  app.get("/api/projects", (_req, res) => {
    const projects = readProjects();
    res.json(projects);
  });

  // Get single project
  app.get("/api/projects/:id", (req, res) => {
    const projects = readProjects();
    const project = projects.find((p) => p.id === req.params.id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    res.json(project);
  });

  // Create project
  app.post("/api/projects", (req, res) => {
    const { name, description } = req.body || {};
    if (!name) {
      res.status(400).json({ error: "Name is required" });
      return;
    }

    const projects = readProjects();
    const now = new Date().toISOString();
    const project: Project = {
      id: makeId(),
      name: String(name),
      description: String(description || ""),
      createdAt: now,
      updatedAt: now,
    };

    // Create project folders
    ensureDir(join(projectDir(project.id), "upload"));
    ensureDir(join(projectDir(project.id), "output"));

    projects.push(project);
    writeProjects(projects);

    res.status(201).json(project);
  });

  // Update project
  app.put("/api/projects/:id", (req, res) => {
    const projects = readProjects();
    const index = projects.findIndex((p) => p.id === req.params.id);
    if (index === -1) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const { name, description } = req.body || {};
    if (name !== undefined) projects[index].name = String(name);
    if (description !== undefined)
      projects[index].description = String(description);
    projects[index].updatedAt = new Date().toISOString();

    writeProjects(projects);
    res.json(projects[index]);
  });

  // Delete project
  app.delete("/api/projects/:id", (req, res) => {
    const projects = readProjects();
    const index = projects.findIndex((p) => p.id === req.params.id);
    if (index === -1) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const [removed] = projects.splice(index, 1);
    writeProjects(projects);
    res.json(removed);
  });

  // ===== Character CRUD =====

  app.get("/api/characters", (req, res) => {
    const projectId = String(req.query.projectId ?? "");
    if (!isValidProjectId(projectId)) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    const characters = readCharacters().filter(
      (c) => c.projectId === projectId,
    );
    res.json(characters);
  });

  app.post("/api/characters", (req, res) => {
    const { projectId, name, filename, source } = req.body || {};
    if (!projectId || !isValidProjectId(String(projectId))) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    if (!filename || !String(filename).trim()) {
      res.status(400).json({ error: "Filename is required" });
      return;
    }
    const safeFilename = String(filename).split(/[/\\]/).pop() || "";
    const characters = readCharacters();
    const character: Character = {
      id: makeId(),
      projectId: String(projectId),
      name: String(name ?? "").trim() || safeFilename,
      filename: safeFilename,
      source: source === "generated" ? "generated" : "upload",
      createdAt: new Date().toISOString(),
    };
    characters.push(character);
    writeCharacters(characters);
    res.status(201).json(character);
  });

  app.put("/api/characters/:id", (req, res) => {
    const projectId = String(req.query.projectId ?? "");
    if (!isValidProjectId(projectId)) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    const characters = readCharacters();
    const index = characters.findIndex(
      (c) => c.id === req.params.id && c.projectId === projectId,
    );
    if (index === -1) {
      res.status(404).json({ error: "Character not found" });
      return;
    }
    const { name, filename, source } = req.body || {};
    if (name !== undefined && String(name).trim()) {
      characters[index].name = String(name).trim();
    }
    if (filename !== undefined && String(filename).trim()) {
      characters[index].filename = String(filename).split(/[/\\]/).pop() || "";
      characters[index].source =
        source === "generated" ? "generated" : "upload";
    }
    writeCharacters(characters);
    res.json(characters[index]);
  });

  app.delete("/api/characters/:id", (req, res) => {
    const projectId = String(req.query.projectId ?? "");
    if (!isValidProjectId(projectId)) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    const characters = readCharacters();
    const index = characters.findIndex(
      (c) => c.id === req.params.id && c.projectId === projectId,
    );
    if (index === -1) {
      res.status(404).json({ error: "Character not found" });
      return;
    }
    const [removed] = characters.splice(index, 1);
    writeCharacters(characters);
    res.json(removed);
  });

  // Open project folder in Finder
  app.post("/api/projects/:id/open-folder", (req, res) => {
    const { type } = req.body || {};
    const projects = readProjects();
    const project = projects.find((p) => p.id === req.params.id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    let targetPath: string;
    switch (type) {
      case "upload":
        targetPath = join(projectDir(project.id), "upload");
        break;
      case "output":
        targetPath = join(projectDir(project.id), "output");
        break;
      default:
        targetPath = join(projectDir(project.id), "output");
    }

    ensureDir(targetPath);
    try {
      openInFinder(targetPath);
      res.json({ success: true, path: targetPath });
    } catch (e) {
      res
        .status(500)
        .json({ error: "Failed to open folder", details: String(e) });
    }
  });

  // Open project in Finder (root project folder - opens output dir)
  app.post("/api/projects/:id/open-in-finder", (_req, res) => {
    const projects = readProjects();
    const project = projects.find((p) => p.id === _req.params.id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const projectOutputDir = join(projectDir(project.id), "output");
    ensureDir(projectOutputDir);
    try {
      openInFinder(projectOutputDir);
      res.json({ success: true, path: projectOutputDir });
    } catch (e) {
      res
        .status(500)
        .json({ error: "Failed to open in Finder", details: String(e) });
    }
  });
}
