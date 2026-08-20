import { existsSync } from "node:fs";
import { resolveWorkspacePath, classifyFile } from "../workspace";
import type { AgentTool } from "./types";

const tool: AgentTool = {
  name: "show_image",
  description: "Display an image from the workspace to the user.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path of the image file relative to the workspace",
      },
    },
    required: ["path"],
  },
  run: (args, ctx) => {
    const path = typeof args.path === "string" ? args.path : "";
    const abs = resolveWorkspacePath(ctx.projectId, path);
    if (!abs || !existsSync(abs)) return `Image not found: ${path}`;
    if (classifyFile(path) !== "image") return `Not an image file: ${path}`;

    const url = `/api/agent/file/preview?projectId=${encodeURIComponent(
      ctx.projectId,
    )}&path=${encodeURIComponent(path)}`;
    ctx.emit?.("image", { url, path });

    return `Displayed image "${path}" to the user.`;
  },
};

export default tool;
