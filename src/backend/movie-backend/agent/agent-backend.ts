import { type Application } from "express";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  rmSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { spawn } from "../process.js";
import OpenAI from "openai";
import { getAgentServerPort } from "../render-media.js";
import {
  workspaceDir,
  resolveWorkspacePath,
  walkFiles,
  classifyFile,
  ensureDir,
  movieStudioDataDir,
  movieStudioStateFile,
} from "./workspace.js";
import { TOOLS, toolDefinitions, runTool } from "./tools/index.js";

// Node.js cannot `import` a bare `.txt` file (Bun allowed `with { type: "txt" }`).
// Read the bundled prompt as UTF-8 text at module load instead.
const story = readFileSync(
  new URL("./prompt/story-writer.txt", import.meta.url),
  "utf-8",
);

// ========== Constants ==========

const DEFAULT_MODEL = "mlx-community/gemma-4-e4b-it-8bit";
const MAX_ITERATIONS = 500;
const STORY_WRITER_AGENT = "story-writer";
// const STORY_WRITER_PROMPT_FILE = "vid-script-buidler.md";

type Role = "system" | "user" | "assistant" | "tool";

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface ChatMessage {
  role: Role;
  content: string | null;
  image?: string;
  tool_call_id?: string;
  name?: string;
  tool_calls?: ToolCall[];
}

/** Only accept inline base64 image data URLs (SSRF guard). */
function isValidImageDataUrl(url: string): boolean {
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(url);
}

/** Convert internal messages into OpenAI-compatible message params. */
function toOpenAIMessages(messages: ChatMessage[]): any[] {
  return messages.map((m) => {
    if (m.role === "tool") {
      return {
        role: "tool",
        tool_call_id: m.tool_call_id,
        content: m.content ?? "",
      };
    }
    if (m.role === "assistant" && m.tool_calls) {
      return {
        role: "assistant",
        content: m.content,
        tool_calls: m.tool_calls,
      };
    }
    if (m.role === "user" && m.image) {
      const parts: any[] = [];
      if (m.content && m.content.trim()) {
        parts.push({ type: "text", text: m.content });
      }
      parts.push({ type: "image_url", image_url: { url: m.image } });
      return { role: "user", content: parts };
    }
    return { role: m.role, content: m.content ?? "" };
  });
}

/** Build the system prompt, listing every tool and its description. */
function buildSystemPrompt(): string {
  const toolList = TOOLS.map((t) => `- ${t.name}: ${t.description}`).join("\n");
  return [
    "You are a media assistant that helps the user render videos in their workspace.",
    "",
    "Available tools:",
    toolList,
    "",
    "Rules:",
    "- Call a tool only when you actually need its result. Once you have enough information, answer the user directly WITHOUT calling any tool.",
    "- Do not call the same tool twice with the same arguments.",
    "- ALWAYS confirm with the user before generating. Never call `image_to_video_generation` or `text_to_video_generation` until the user has explicitly said yes.",
    "",
    "## Getting started",
    "",
    'When the user greets you (e.g. says "hi" or "hello") or asks for help, FIRST ask them what they want to do:',
    "1. Render a video from text",
    "2. Render a video from an image",
    "",
    "Then follow the matching workflow below.",
    "",
    "## Workflow: Render a video",
    "",
    "To generate a video you need a motion PROMPT and a DURATION. An IMAGE is optional but recommended.",
    "",
    "### Step 1 — Image (optional)",
    "- Ask the user whether they want to animate an image or generate a video from text alone.",
    "- If they want an image, call `list_files` to see what is in the agent workspace.",
    '- List every image file (files whose `kind` is "image") to the user as a numbered list so they can pick one.',
    "- You may call `show_image` to preview an image before the user decides.",
    "- If there are no images, tell the user and ask them to upload one, or offer to proceed with text only.",
    "",
    "### Step 2 — Prompt",
    "- Plan the prompt together with the user. Ask what they want the video to show: the subject, the action or motion, camera movement, style, lighting, and mood.",
    "- Ask the user to specify the character's NAME, its EMOTION, and WHAT IT WILL SAY in the video.",
    "- Discuss and refine the prompt with them until it clearly describes the desired animation. Confirm the wording before moving on.",
    "",
    "### Step 3 — Duration",
    "- Estimate a sensible duration in seconds based on the complexity of the prompt, then add 1–2 seconds to your estimate.",
    "- The duration must never exceed 20 seconds.",
    "- Propose the duration to the user and let them accept it or give a different duration (still capped at 20 seconds).",
    "",
    "### Step 4 — Mode",
    "- Ask the user which generation mode they want and explain the tradeoff:",
    "  - `distilled` (default): fastest, lower quality.",
    "  - `one-stage`: balanced speed and quality.",
    "  - `two-stage`: slowest, highest quality.",
    "- If the user has no preference, use `distilled`.",
    "",
    "### Step 5 — Summary and confirmation",
    "- Prepare a short summary containing the image (if any), the final prompt, the duration, and the mode, and ask the user to confirm.",
    "- Do NOT start generation yet. Wait for the user to say yes.",
    "- After the user confirms:",
    "  - If an image was chosen, call `image_to_video_generation` with the image, prompt, duration, and mode.",
    "  - Otherwise, call `text_to_video_generation` with the prompt, duration, and mode.",
  ].join("\n");
}

/** Normalize a client-supplied agent id to a safe storage key (defaults to "default"). */
function safeAgent(value: unknown): string {
  const s = typeof value === "string" ? value : "";
  return /^[a-zA-Z0-9_-]{1,32}$/.test(s) ? s : "default";
}

/** Load the Story Writer system prompt from the bundled `prompt/` file. */
function storyWriterSystemPrompt(): string {
  return `${story}`;
}

/** Build a sanitized trace of the conversation for the client (no secrets/system). */
function sanitizeTrace(messages: ChatMessage[]): any[] {
  return messages
    .filter((m) => m.role !== "system")
    .map((m) => {
      if (m.role === "tool") {
        const text = typeof m.content === "string" ? m.content : "";
        return {
          role: "tool",
          name: m.name ?? "",
          content: text.length > 500 ? `${text.slice(0, 500)}…` : text,
        };
      }
      const out: any = { role: m.role, content: m.content ?? "" };
      if (m.tool_calls) out.tool_calls = m.tool_calls;
      if (m.image) out.image = "(image)";
      return out;
    });
}

// ========== Movie Studio ==========

const MOVIE_STUDIO_CHARACTERS_PLAN_PROMPT = [
  "You are a movie pre-production planner. Given a movie or story idea, identify the characters and the places/locations.",
  "",
  "Return ONLY valid JSON (no markdown fences, no commentary) matching this exact shape:",
  "",
  '{"artStyle":"string","characters":[{"slug":"string","name":"string"}],"places":[{"slug":"string","name":"string"}]}',
  "",
  "Rules:",
  '- "slug" is a short lowercase hyphenated identifier (e.g. "the-lamb" for a character, "sunny-meadow" for a place).',
  '- "artStyle" is ONE consistent art style for the entire film (e.g. cinematic photorealistic, 3D animation, hand-painted watercolor, anime).',
  '- If the idea does not mention an art style, set "artStyle" to "photo realistic render".',
  '- Identify every place/location the story uses, each with its own slug and name.',
].join("\n");

const CHARACTER_IMAGE_PROMPT = [
  "You are a movie pre-production planner. Given a movie idea, its art style, and one character, write that character's standalone character-reference image prompt.",
  "",
  "Return ONLY valid JSON (no markdown fences, no commentary) matching this exact shape:",
  "",
  '{"imagePrompt":"string"}',
  "",
  "Rules:",
  "- The imagePrompt describes a close-up portrait shot of the character's face on a plain solid white background, framed head and shoulders, facing the camera, evenly lit with soft neutral studio lighting and no props, scenery or background elements.",
  "- The imagePrompt begins with the character's name and then concentrates on the face: age, face shape, skin tone and texture, eyes, eyebrows, nose, mouth, facial hair, hairstyle and hair colour, expression, and any distinctive facial features such as scars, freckles or markings.",
  "- Include the character's cultural background — the era/age, culture, ethnicity, and region they belong to — so the face is historically and culturally accurate and consistent.",
  "- Mention clothing only as far as the collar or neckline is visible in a head-and-shoulders crop; do not describe the full outfit, body build, pose, or action.",
  "- Apply the given artStyle.",
  "- Write the prompt as natural-language English sentences, never comma-separated keyword tags.",
].join("\n");

const PLACE_IMAGE_PROMPT = [
  "You are a movie pre-production planner. Given a movie idea, its art style, and one place, write that place's standalone image prompt.",
  "",
  "Return ONLY valid JSON (no markdown fences, no commentary) matching this exact shape:",
  "",
  '{"imagePrompt":"string"}',
  "",
  "Rules:",
  "- The imagePrompt fully describes the location/environment (time of day, lighting, atmosphere, visual style).",
  "- Apply the given artStyle.",
  "- Write the prompt as natural-language English sentences, never comma-separated keyword tags.",
].join("\n");

const MOVIE_STUDIO_SCENES_PLAN_PROMPT = [
  "You are a movie pre-production planner. Given a movie idea, its art style, its characters, and its places, break the story into scenes.",
  "",
  "Return ONLY valid JSON (no markdown fences, no commentary) matching this exact shape:",
  "",
  '{"scenes":[{"slug":"string","duration":number,"characterSlugs":["string"],"placeSlug":"string"}]}',
  "",
  "Rules:",
  '- "slug" is a short lowercase hyphenated identifier (e.g. "opening-meadow").',
  "- Break the story into a natural number of scenes. Group related action beats and dialogue together — do not inflate the scene count by splitting every moment into its own scene.",
  "- Never reduce or summarize the dialogue: keep every spoken line, grouping multiple lines into a scene where it reads naturally.",
  "- Each scene references the characters and the place involved via their slugs (characterSlugs is a list; placeSlug is a single slug).",
  "- Each scene has a duration in seconds (typically 3-20) matching how long the shot should last.",
].join("\n");

const SCENE_DETAIL_PROMPT = [
  "You are a movie pre-production planner. Given a movie idea, its art style, its characters, its places, and one scene, write that scene's full details.",
  "",
  "Return ONLY valid JSON (no markdown fences, no commentary) matching this exact shape:",
  "",
  '{"description":"string","scriptLines":[{"characterSlug":"string","line":"string"}],"voiceOver":"string","imagePrompt":"string"}',
  "",
  "Rules:",
  "- description is a short description of the scene's action.",
  "- scriptLines is one entry per spoken line, each with the speaking character's slug and the exact spoken line. Include every line of dialogue that belongs to this scene.",
  "- voiceOver is the narration/voiceover for that scene (use an empty string when there is none).",
  "- imagePrompt is ONE coherent shot that combines the referenced characters AND the place together, using the given artStyle.",
  "- Apply the given artStyle to the imagePrompt.",
  "- Write descriptions, prompts and dialogue as natural-language English sentences, never comma-separated keyword tags.",
].join("\n");

/** Extract the first JSON object from a model response (handles code fences). */
function extractJsonObject(text: string): any {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model did not return valid JSON");
  }
  return JSON.parse(t.slice(start, end + 1));
}

/**
 * Generate the movie production bible (characters, places, scenes) from an idea.
 * Persists the result to studio/:projectId/data/*.json and returns the parsed
 * result. Used both by the HTTP route below and by the generation queue worker.
 */
export async function generateMovieStudioBible(
  projectId: string,
  idea: string,
  model?: string,
  onProgress?: (statusText: string, current: number, total: number) => void,
): Promise<{ characters: any[]; places: any[]; scenes: any[] }> {
  const resolvedModel =
    typeof model === "string" && model.trim() ? model.trim() : DEFAULT_MODEL;

  const client = new OpenAI({
    baseURL: "http://localhost:8881/v1",
    apiKey: "local",
  });

  const toStr = (v: unknown): string => (typeof v === "string" ? v : "");
  const toNum = (v: unknown): number => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const ask = async (
    systemPrompt: string,
    userContent: string,
  ): Promise<any> => {
    let prompt = systemPrompt;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const completion = await client.chat.completions.create({
          model: resolvedModel,
          messages: [
            { role: "system", content: prompt },
            { role: "user", content: userContent },
          ],
          temperature: 0.7,
          max_tokens: 8192,
        });
        const text = completion.choices?.[0]?.message?.content ?? "";
        return extractJsonObject(text);
      } catch (e) {
        lastError = e;
        // The model likely truncated its JSON — retry with an explicit
        // instruction to emit one complete, valid JSON object.
        prompt = `${systemPrompt}\n\nIMPORTANT: Return the complete JSON object in a single response. Do not truncate; close every string, object, and array.`;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error("Failed to parse model JSON response");
  };

  // Generate one item through the model, falling back to `fallback` on failure
  // (after the ask-level retries) so a single bad item never fails the whole
  // production bible.
  const generateItem = async (
    systemPrompt: string,
    userContent: string,
    fallback: any,
  ): Promise<any> => {
    try {
      return await ask(systemPrompt, userContent);
    } catch {
      return fallback;
    }
  };

  // Progress reporting (SSE-synced to the UI by the queue worker).
  let current = 0;
  let total = 0;
  const addTotal = (n: number) => {
    total += n;
  };
  const note = (statusText: string) => onProgress?.(statusText, current, total);
  const advance = (statusText: string) => {
    current += 1;
    onProgress?.(statusText, current, total);
  };

  // 1. Character + place plan — compact slugs/names for both + the film's art style.
  note("Identifying characters and places…");
  const charPlan = await ask(MOVIE_STUDIO_CHARACTERS_PLAN_PROMPT, idea.trim());
  const artStyle = toStr(charPlan?.artStyle) || "photo realistic render";
  const charList: { slug: string; name: string }[] = (
    Array.isArray(charPlan.characters) ? charPlan.characters : []
  )
    .map((c: any) => ({ slug: toStr(c?.slug), name: toStr(c?.name) }))
    .filter((c: any) => c.slug);
  const placeList: { slug: string; name: string }[] = (
    Array.isArray(charPlan.places) ? charPlan.places : []
  )
    .map((p: any) => ({ slug: toStr(p?.slug), name: toStr(p?.name) }))
    .filter((p: any) => p.slug);
  addTotal(charList.length + placeList.length);

  // 2. Character details — one image prompt per character (agentic loop).
  const characters: any[] = [];
  for (const c of charList) {
    advance(`Generating character image: ${c.name || c.slug}`);
    const detail = await generateItem(
      CHARACTER_IMAGE_PROMPT,
      `Art style: ${artStyle}\n\nIdea: ${idea.trim()}\n\nCharacter slug: ${c.slug}\nCharacter name: ${c.name}`,
      { imagePrompt: "" },
    );
    characters.push({
      slug: c.slug,
      name: c.name,
      imagePrompt: toStr(detail?.imagePrompt),
    });
  }

  // 3. Place details — one image prompt per place (agentic loop).
  const places: any[] = [];
  for (const p of placeList) {
    advance(`Generating place image: ${p.name || p.slug}`);
    const detail = await generateItem(
      PLACE_IMAGE_PROMPT,
      `Art style: ${artStyle}\n\nIdea: ${idea.trim()}\n\nPlace slug: ${p.slug}\nPlace name: ${p.name}`,
      { imagePrompt: "" },
    );
    places.push({
      slug: p.slug,
      name: p.name,
      imagePrompt: toStr(detail?.imagePrompt),
    });
  }

  // 4. Scene plan + details — one scene's full details per request.
  note("Planning scenes…");
  const scenePlan = await ask(
    MOVIE_STUDIO_SCENES_PLAN_PROMPT,
    `Art style: ${artStyle}\n\nIdea: ${idea.trim()}\n\nCharacters:\n${JSON.stringify(characters.map((c) => ({ slug: c.slug, name: c.name })))}\n\nPlaces:\n${JSON.stringify(places.map((p) => ({ slug: p.slug, name: p.name })))}`,
  );
  const sceneList: {
    slug: string;
    duration: number;
    characterSlugs: string[];
    placeSlug: string;
  }[] = (Array.isArray(scenePlan.scenes) ? scenePlan.scenes : [])
    .map((s: any) => ({
      slug: toStr(s?.slug),
      duration: toNum(s?.duration),
      characterSlugs: Array.isArray(s?.characterSlugs)
        ? s.characterSlugs.map(toStr).filter(Boolean)
        : [],
      placeSlug: toStr(s?.placeSlug),
    }))
    .filter((s: any) => s.slug);
  addTotal(sceneList.length);

  const scenes: any[] = [];
  for (const s of sceneList) {
    advance(`Writing scene: ${s.slug}`);
    const detail = await generateItem(
      SCENE_DETAIL_PROMPT,
      `Art style: ${artStyle}\n\nIdea: ${idea.trim()}\n\nCharacters:\n${JSON.stringify(characters.map((c) => ({ slug: c.slug, name: c.name })))}\n\nPlaces:\n${JSON.stringify(places.map((p) => ({ slug: p.slug, name: p.name })))}\n\nScene slug: ${s.slug}\nDuration: ${s.duration}s\nCharacter slugs: ${s.characterSlugs.join(", ")}\nPlace slug: ${s.placeSlug}`,
      { description: "", scriptLines: [], voiceOver: "", imagePrompt: "" },
    );
    scenes.push({
      slug: s.slug,
      duration: s.duration,
      description: toStr(detail?.description),
      characterSlugs: s.characterSlugs,
      placeSlug: s.placeSlug,
      scriptLines: Array.isArray(detail?.scriptLines)
        ? detail.scriptLines
            .map((l: any) => ({
              characterSlug: toStr(l?.characterSlug),
              line: toStr(l?.line),
            }))
            .filter((l: any) => l.line)
        : [],
      voiceOver: toStr(detail?.voiceOver),
      imagePrompt: toStr(detail?.imagePrompt),
    });
  }

  // Persist the generated production bible to studio/:projectId/data/*.json
  const dataDir = movieStudioDataDir(projectId);
  ensureDir(dataDir);
  writeFileSync(
    join(dataDir, "characters.json"),
    JSON.stringify(characters, null, 2),
    "utf-8",
  );
  writeFileSync(
    join(dataDir, "places.json"),
    JSON.stringify(places, null, 2),
    "utf-8",
  );
  writeFileSync(
    join(dataDir, "scenes.json"),
    JSON.stringify(scenes, null, 2),
    "utf-8",
  );

  return { characters, places, scenes };
}

// ========== Routes ==========

export async function agentBackend({
  app,
  getUvPath: _getUvPath,
  backendPort,
}: {
  app: Application;
  getUvPath: () => Promise<string>;
  backendPort: number;
}) {
  // ===== Workspace file manager =====

  app.get("/api/agent/files", (req, res) => {
    const projectId = String(req.query.projectId ?? "");
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(projectId)) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    const base = workspaceDir(projectId);
    if (!existsSync(base)) {
      res.json({ files: [] });
      return;
    }
    res.json({ files: walkFiles(base) });
  });

  app.get("/api/agent/file/content", (req, res) => {
    const projectId = String(req.query.projectId ?? "");
    const path = String(req.query.path ?? "");
    const abs = resolveWorkspacePath(projectId, path);
    if (!abs || !existsSync(abs)) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    res.json({ content: readFileSync(abs, "utf-8") });
  });

  app.post("/api/agent/file/content", (req, res) => {
    const { projectId, path, content } = req.body || {};
    const abs = resolveWorkspacePath(projectId, path);
    if (!abs) {
      res.status(400).json({ error: "Invalid path" });
      return;
    }
    ensureDir(dirname(abs));
    writeFileSync(abs, String(content ?? ""), "utf-8");
    res.json({ ok: true });
  });

  app.post("/api/agent/rename", (req, res) => {
    const { projectId, path, newName } = req.body || {};
    const abs = resolveWorkspacePath(projectId, path);
    const newAbs = resolveWorkspacePath(projectId, newName);
    if (!abs || !newAbs) {
      res.status(400).json({ error: "Invalid path" });
      return;
    }
    if (!existsSync(abs)) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    ensureDir(dirname(newAbs));
    renameSync(abs, newAbs);
    res.json({ ok: true });
  });

  app.post("/api/agent/delete", (req, res) => {
    const { projectId, path } = req.body || {};
    const abs = resolveWorkspacePath(projectId, path);
    if (!abs) {
      res.status(400).json({ error: "Invalid path" });
      return;
    }
    if (!existsSync(abs)) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    rmSync(abs, { recursive: true, force: true });
    res.json({ ok: true });
  });

  app.get("/api/agent/file/preview", (req, res) => {
    const projectId = String(req.query.projectId ?? "");
    const path = String(req.query.path ?? "");
    const abs = resolveWorkspacePath(projectId, path);
    if (!abs || !existsSync(abs)) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    // Only serve non-executable media; block HTML/SVG/JS/etc. to prevent
    // stored XSS from being served in the app's origin.
    const kind = classifyFile(path);
    if (kind !== "image" && kind !== "video") {
      res
        .status(415)
        .json({ error: "Preview only supports images and videos" });
      return;
    }
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "sandbox");
    res.sendFile(abs);
  });

  // Save user-uploaded images/videos into the agent's workspace.
  app.post("/api/agent/upload", async (req, res) => {
    const { image, filename, projectId } = req.body || {};

    if (!image) {
      res.status(400).json({ error: "File data is required (base64)" });
      return;
    }
    if (!projectId || !/^[a-zA-Z0-9_-]{1,64}$/.test(String(projectId))) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }

    try {
      const base64 = String(image).replace(/^data:[^;]+;base64,/, "");
      const buffer = Buffer.from(base64, "base64");
      const dir = workspaceDir(String(projectId));
      ensureDir(dir);
      const safeName = (filename || `upload-${Date.now()}`).replace(
        /[^a-zA-Z0-9._-]/g,
        "_",
      );
      const filePath = join(dir, safeName);
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
        .json({ error: "Failed to save file", details: String(e) });
    }
  });

  app.post("/api/agent/open-workspace", (req, res) => {
    const { projectId } = req.body || {};
    if (!projectId || !/^[a-zA-Z0-9_-]{1,64}$/.test(String(projectId))) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    const dir = workspaceDir(String(projectId));
    ensureDir(dir);
    spawn(["open", dir], { stdout: "ignore", stderr: "ignore" });
    res.json({ ok: true });
  });

  // ===== Chat threads persistence =====

  app.get("/api/agent/threads", (req, res) => {
    const projectId = String(req.query.projectId ?? "");
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(projectId)) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    const agent = safeAgent(req.query.agent);
    const file = join(workspaceDir(projectId), "chat", agent, "threads.json");
    if (!existsSync(file)) {
      res.json({ threads: [] });
      return;
    }
    try {
      res.json({ threads: JSON.parse(readFileSync(file, "utf-8")) });
    } catch {
      res.json({ threads: [] });
    }
  });

  app.post("/api/agent/threads", (req, res) => {
    const { projectId, threads, agent } = req.body || {};
    if (!projectId || !/^[a-zA-Z0-9_-]{1,64}$/.test(String(projectId))) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    const dir = join(workspaceDir(String(projectId)), "chat", safeAgent(agent));
    ensureDir(dir);
    writeFileSync(
      join(dir, "threads.json"),
      JSON.stringify(threads ?? [], null, 2),
      "utf-8",
    );
    res.json({ ok: true });
  });

  app.get("/api/agent/thread/chat", (req, res) => {
    const projectId = String(req.query.projectId ?? "");
    const threadId = String(req.query.threadId ?? "");
    if (
      !/^[a-zA-Z0-9_-]{1,64}$/.test(projectId) ||
      !/^[a-zA-Z0-9_-]{1,64}$/.test(threadId)
    ) {
      res.status(400).json({ error: "Invalid ID" });
      return;
    }
    const agent = safeAgent(req.query.agent);
    const file = join(
      workspaceDir(projectId),
      "chat",
      agent,
      threadId,
      "chat.json",
    );
    if (!existsSync(file)) {
      res.json({ messages: [] });
      return;
    }
    try {
      res.json({ messages: JSON.parse(readFileSync(file, "utf-8")) });
    } catch {
      res.json({ messages: [] });
    }
  });

  app.post("/api/agent/thread/chat", (req, res) => {
    const { projectId, threadId, messages, agent } = req.body || {};
    if (!projectId || !/^[a-zA-Z0-9_-]{1,64}$/.test(String(projectId))) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    if (!threadId || !/^[a-zA-Z0-9_-]{1,64}$/.test(String(threadId))) {
      res.status(400).json({ error: "Invalid thread ID" });
      return;
    }
    const dir = join(
      workspaceDir(String(projectId)),
      "chat",
      safeAgent(agent),
      String(threadId),
    );
    ensureDir(dir);
    writeFileSync(
      join(dir, "chat.json"),
      JSON.stringify(messages ?? [], null, 2),
      "utf-8",
    );
    res.json({ ok: true });
  });

  app.post("/api/agent/chat", async (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (event: string, data: object) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const body = req.body || {};

    // Use the port the app itself started the mlx-vlm server on (SSRF guard).
    const port = getAgentServerPort();
    if (port === null) {
      send("error", {
        error:
          "Model server is not running. Start it from the Agent tab first.",
      });
      res.end();
      return;
    }

    const model =
      typeof body.model === "string" && body.model.trim()
        ? body.model.trim()
        : DEFAULT_MODEL;

    const projectId =
      typeof body.projectId === "string" &&
      /^[a-zA-Z0-9_-]{1,64}$/.test(body.projectId)
        ? body.projectId
        : null;

    if (projectId === null) {
      send("error", { error: "Invalid project ID" });
      res.end();
      return;
    }

    const incoming = Array.isArray(body.messages) ? body.messages : [];
    const history: ChatMessage[] = incoming.map((m: any) => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content : "",
      image:
        typeof m.image === "string" && isValidImageDataUrl(m.image)
          ? m.image
          : undefined,
    }));

    const agent = safeAgent(body.agent);
    const systemPrompt =
      agent === STORY_WRITER_AGENT
        ? storyWriterSystemPrompt()
        : buildSystemPrompt();

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...history,
    ];

    const client = new OpenAI({
      baseURL: `http://localhost:${port}/v1`,
      apiKey: "local",
    });

    try {
      const seenToolKeys = new Set<string>();
      let streamedAny = false;

      for (let i = 0; i < MAX_ITERATIONS; i++) {
        const stream = await client.chat.completions.create(
          {
            model,
            messages: toOpenAIMessages(messages),
            tools: toolDefinitions(TOOLS),
            tool_choice: "auto",
            temperature: 0.7,
            reasoning_effort: "max",
            stream: true,
          },
          { signal: (req as { signal?: AbortSignal }).signal },
        );

        let content = "";
        const toolCalls: {
          id: string;
          function: { name: string; arguments: string };
        }[] = [];

        for await (const chunk of stream) {
          const choice = chunk.choices?.[0];
          const delta = choice?.delta;
          if (!delta) {
            continue;
          }

          // Reasoning / thinking tokens (reasoning models emit these in a
          // separate field from the final answer).
          const reasoning =
            (delta as any).reasoning ?? (delta as any).reasoning_content;
          if (reasoning) {
            send("thinking", { text: reasoning });
          }

          if (delta.content) {
            content += delta.content;
            send("delta", { text: delta.content });
            streamedAny = true;
          }

          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const index = tc.index ?? 0;
              if (!toolCalls[index]) {
                toolCalls[index] = {
                  id: tc.id ?? "",
                  function: { name: "", arguments: "" },
                };
              }
              if (tc.id) toolCalls[index].id = tc.id;
              if (tc.function?.name) {
                toolCalls[index].function.name += tc.function.name;
              }
              if (tc.function?.arguments) {
                toolCalls[index].function.arguments += tc.function.arguments;
              }
            }
          }
        }

        // If the model requested tools, run them and feed results back in.
        if (toolCalls.length > 0) {
          const toolKey = toolCalls
            .map((tc) => `${tc.function.name}:${tc.function.arguments}`)
            .join("||");
          if (toolKey && seenToolKeys.has(toolKey)) {
            // Stuck repeating a tool call — stop.
            break;
          }
          if (toolKey) seenToolKeys.add(toolKey);

          messages.push({
            role: "assistant",
            content: content || null,
            tool_calls: toolCalls.map((tc) => ({
              id: tc.id,
              type: "function" as const,
              function: {
                name: tc.function.name,
                arguments: tc.function.arguments,
              },
            })),
          });

          for (const tc of toolCalls) {
            const output = await runTool(
              TOOLS,
              tc.function.name,
              tc.function.arguments,
              {
                projectId,
                emit: send,
                backendPort,
                signal: (req as { signal?: AbortSignal }).signal,
              },
            );
            send("tool", {
              name: tc.function.name,
              arguments: tc.function.arguments,
              output,
            });
            messages.push({
              role: "tool",
              tool_call_id: tc.id,
              name: tc.function.name,
              content: output,
            });
          }
          continue;
        }

        // No tool calls → the streamed content is the final answer.
        break;
      }

      if (!streamedAny) {
        send("delta", { text: "Done." });
      }
      send("messages", { messages: sanitizeTrace(messages) });
      send("done", {});
    } catch (e) {
      send("error", { error: String(e) });
    } finally {
      res.end();
    }
  });

  // ===== Movie Studio: idea → characters / places / scenes =====

  app.post("/api/movie-studio/generate", async (req, res) => {
    const { idea, model, projectId } = req.body || {};
    if (typeof idea !== "string" || !idea.trim()) {
      res.status(400).json({ error: "Idea is required" });
      return;
    }
    if (
      typeof projectId !== "string" ||
      !/^[a-zA-Z0-9_-]{1,64}$/.test(projectId)
    ) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }

    try {
      const result = await generateMovieStudioBible(
        projectId,
        idea.trim(),
        model,
      );
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // ===== Movie Studio: persisted UI state (JSON on disk) =====

  app.get("/api/movie-studio/state", (req, res) => {
    const projectId = String(req.query.projectId ?? "");
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(projectId)) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    const file = movieStudioStateFile(projectId);
    if (!existsSync(file)) {
      res.json(null);
      return;
    }
    try {
      res.json(JSON.parse(readFileSync(file, "utf-8")));
    } catch {
      res.json(null);
    }
  });

  app.post("/api/movie-studio/state", (req, res) => {
    const {
      projectId,
      idea,
      result,
      assets,
      videos,
      sceneImages,
      renderedScenes,
    } = req.body || {};
    if (!projectId || !/^[a-zA-Z0-9_-]{1,64}$/.test(String(projectId))) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    const file = movieStudioStateFile(String(projectId));
    ensureDir(dirname(file));
    writeFileSync(
      file,
      JSON.stringify(
        {
          idea: String(idea ?? ""),
          result: result ?? null,
          assets: Array.isArray(assets) ? assets : [],
          videos: Array.isArray(videos) ? videos : [],
          sceneImages: Array.isArray(sceneImages) ? sceneImages : [],
          renderedScenes: Array.isArray(renderedScenes) ? renderedScenes : [],
        },
        null,
        2,
      ),
      "utf-8",
    );
    res.json({ ok: true });
  });
}
