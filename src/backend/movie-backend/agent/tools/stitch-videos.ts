import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  isValidProjectId,
  resolveWorkspacePath,
  classifyFile,
  workspaceDir,
} from "../workspace";
import type { AgentTool } from "./types";

const CORE_BASE = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm";

const tool: AgentTool = {
  name: "stitch_videos",
  description:
    "Concatenate multiple videos in the workspace into a single video file.",
  parameters: {
    type: "object",
    properties: {
      videos: {
        type: "array",
        items: { type: "string" },
        description: "List of workspace video paths, in order",
      },
      output: {
        type: "string",
        description: "Output filename (default stitched-<timestamp>.mp4)",
      },
    },
    required: ["videos"],
  },
  run: async (args, ctx) => {
    if (!isValidProjectId(ctx.projectId)) return "Invalid project ID.";

    const videos = (Array.isArray(args.videos) ? args.videos : [])
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .map((v) => v.trim());
    if (videos.length < 2) return "stitch_videos requires at least two videos.";

    // Resolve and validate each input video.
    const resolved: string[] = [];
    for (const v of videos) {
      const abs = resolveWorkspacePath(ctx.projectId, v);
      if (!abs || !existsSync(abs) || classifyFile(v) !== "video") {
        return `Video not found or not a video: ${v}`;
      }
      resolved.push(abs);
    }

    const outputName = (
      typeof args.output === "string" && args.output.trim()
        ? args.output.trim()
        : `stitched-${Date.now()}.mp4`
    ).replace(/[^a-zA-Z0-9._-]/g, "_");

    ctx.emit?.("notice", { text: "Loading ffmpeg..." });

    const ffmpeg = new FFmpeg();
    try {
      await ffmpeg.load({
        coreURL: await toBlobURL(
          `${CORE_BASE}/ffmpeg-core.js`,
          "text/javascript",
        ),
        wasmURL: await toBlobURL(
          `${CORE_BASE}/ffmpeg-core.wasm`,
          "application/wasm",
        ),
      });

      // Stream stitching progress via SSE.
      let lastPct = -1;
      ffmpeg.on("progress", ({ progress }) => {
        if (typeof progress !== "number") return;
        const pct = Math.round(progress * 100);
        if (pct >= lastPct + 5) {
          lastPct = pct;
          ctx.emit?.("notice", { text: `Stitching: ${pct}%` });
        }
      });

      // Write inputs and a concat list into ffmpeg's virtual filesystem.
      const listLines: string[] = [];
      for (let i = 0; i < resolved.length; i++) {
        const name = `input${i}.mp4`;
        await ffmpeg.writeFile(name, readFileSync(resolved[i]));
        listLines.push(`file '${name}'`);
      }
      await ffmpeg.writeFile("list.txt", listLines.join("\n"));

      await ffmpeg.exec([
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        "list.txt",
        "-c",
        "copy",
        outputName,
      ]);

      const outData = await ffmpeg.readFile(outputName);

      const outDir = workspaceDir(ctx.projectId);
      if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
      writeFileSync(join(outDir, outputName), Buffer.from(outData as Uint8Array));

      const url = `/api/agent/file/preview?projectId=${encodeURIComponent(
        ctx.projectId,
      )}&path=${encodeURIComponent(outputName)}`;
      ctx.emit?.("video", { url });

      return `Stitched ${videos.length} videos into ${outputName}.`;
    } finally {
      ffmpeg.terminate();
    }
  },
};

export default tool;
