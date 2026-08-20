import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  realpathSync,
} from "node:fs";
import { join, sep } from "node:path";
import {
  isValidProjectId,
  resolveWorkspacePath,
  classifyFile,
  AGENT_UPLOAD_DIR,
  workspaceDir,
} from "../workspace";
import sharp from "sharp";
import type { AgentTool } from "./types";

/** Default output resolution (px) when the tool is called without one. */
const DEFAULT_RESOLUTION = 512;

/** Allowed resolution values (px). */
const ALLOWED_RESOLUTIONS = [512, 1024];

/** Resize an image to at most `maxDim` on the longest edge, keeping aspect ratio. */
async function resizeToMax(
  input: Buffer,
  maxDim: number,
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const resized = await sharp(input)
    .resize({
      width: maxDim,
      height: maxDim,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();
  const meta = await sharp(resized).metadata();
  return {
    buffer: resized,
    width: meta.width ?? maxDim,
    height: meta.height ?? maxDim,
  };
}

async function readSSE(
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

const tool: AgentTool = {
  name: "edit_image",
  description:
    "Edit an image in the workspace using a text prompt (e.g. change the background, style, or expression).",
  parameters: {
    type: "object",
    properties: {
      prompt: { type: "string", description: "The edit instruction" },
      image: {
        type: "string",
        description: "Path of the image in the workspace to edit",
      },
      resolution: {
        type: "number",
        enum: [512, 1024],
        description: "Output resolution in pixels (512 or 1024, default 512)",
      },
    },
    required: ["prompt", "image"],
  },
  run: async (args, ctx) => {
    if (!isValidProjectId(ctx.projectId)) return "Invalid project ID.";

    const prompt = typeof args.prompt === "string" ? args.prompt.trim() : "";
    if (!prompt) return "edit_image requires a prompt.";

    const image = typeof args.image === "string" ? args.image.trim() : "";
    if (!image) return "edit_image requires an image from the workspace.";

    const resolution =
      typeof args.resolution === "number" &&
      ALLOWED_RESOLUTIONS.includes(args.resolution)
        ? args.resolution
        : DEFAULT_RESOLUTION;

    const abs = resolveWorkspacePath(ctx.projectId, image);
    if (!abs || !existsSync(abs)) {
      return `Image not found: ${image}`;
    }

    // Classify the resolved real path (resolves symlinks) so a symlink named
    // like an image but pointing at another file is not treated as an image.
    let realAbs: string;
    try {
      realAbs = realpathSync(abs);
    } catch {
      return `Image not found: ${image}`;
    }
    // Confirm the resolved (symlink-followed) path is still inside the
    // project's workspace before reading it.
    const realBase = realpathSync(workspaceDir(ctx.projectId));
    if (realAbs !== realBase && !realAbs.startsWith(realBase + sep)) {
      return `Image outside workspace: ${image}`;
    }
    if (classifyFile(realAbs) !== "image") {
      return `Not an image: ${image}`;
    }

    if (!ctx.backendPort) return "Image backend not available.";

    // Resize the source image to at most the chosen resolution (keeping aspect
    // ratio) and re-encode as PNG, then stage it into the project's
    // agent-upload dir so the mlxgen endpoint can resolve it by bare filename.
    let resized: { buffer: Buffer; width: number; height: number };
    try {
      resized = await resizeToMax(readFileSync(realAbs), resolution);
    } catch (e) {
      return `Failed to process image: ${String(e)}`;
    }

    const uploadProjectDir = join(AGENT_UPLOAD_DIR, ctx.projectId);
    if (!existsSync(uploadProjectDir)) {
      mkdirSync(uploadProjectDir, { recursive: true });
    }
    const origBase = (image.split("/").pop() || "image.png").replace(
      /\.[^.]+$/,
      "",
    );
    const imageName = `agent-${Date.now()}-${origBase.replace(
      /[^a-zA-Z0-9._-]/g,
      "_",
    )}.png`;
    writeFileSync(join(uploadProjectDir, imageName), resized.buffer);

    ctx.emit?.("notice", { text: `Editing image "${image}"...` });

    try {
      const body: Record<string, unknown> = {
        prompt,
        imagePath: imageName,
        projectId: ctx.projectId,
        width: resized.width,
        height: resized.height,
      };

      const res = await fetch(
        `http://localhost:${ctx.backendPort}/api/mlxgen/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: ctx.signal,
        },
      );

      if (!res.ok) {
        return `Image edit failed: ${await res.text()}`;
      }

      let resultPath: string | null = null;
      let resultFilename: string | null = null;
      let error: string | null = null;

      await readSSE(res, (event, data) => {
        switch (event) {
          case "log":
            ctx.emit?.("notice", { text: data.text as string });
            break;
          case "complete":
            resultPath = data.path as string;
            resultFilename = data.filename as string;
            break;
          case "error":
            error = data.error || "Image edit failed";
            break;
        }
      });

      if (error) return error;
      if (!resultPath) return "Image edit did not produce a result.";

      // Copy the edited image into the workspace so it is previewable and
      // usable in subsequent steps.
      const outName =
        resultFilename ||
        (resultPath as string).split("/").pop() ||
        "edited.png";
      const outDir = workspaceDir(ctx.projectId);
      if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
      writeFileSync(join(outDir, outName), readFileSync(resultPath));

      const url = `/api/agent/file/preview?projectId=${encodeURIComponent(
        ctx.projectId,
      )}&path=${encodeURIComponent(outName)}`;
      ctx.emit?.("image", { url, path: outName });

      return `Edited image saved to "${outName}".`;
    } catch (e) {
      return `Image edit error: ${String(e)}`;
    }
  },
};

export default tool;
