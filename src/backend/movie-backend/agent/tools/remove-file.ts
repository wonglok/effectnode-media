import { existsSync, rmSync } from "node:fs";
import { resolveWorkspacePath } from "../workspace";
import type { AgentTool } from "./types";

const tool: AgentTool = {
  name: "remove_file",
  description: "Delete a file (or directory) in the workspace.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path relative to the workspace" },
    },
    required: ["path"],
  },
  run: (args, ctx) => {
    const path = typeof args.path === "string" ? args.path : "";
    const abs = resolveWorkspacePath(ctx.projectId, path);
    if (!abs || !existsSync(abs)) return `File not found: ${path}`;
    rmSync(abs, { recursive: true, force: true });
    return `Removed ${path}`;
  },
};

export default tool;
