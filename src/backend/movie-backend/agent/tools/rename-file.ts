import { existsSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { resolveWorkspacePath } from "../workspace";
import type { AgentTool } from "./types";

const tool: AgentTool = {
  name: "rename_file",
  description: "Rename a file in the workspace.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Current file path relative to the workspace",
      },
      new_name: {
        type: "string",
        description: "New file name (no directory separators)",
      },
    },
    required: ["path", "new_name"],
  },
  run: (args, ctx) => {
    const path = typeof args.path === "string" ? args.path.trim() : "";
    if (!path) return "rename_file requires a path.";

    const newName =
      typeof args.new_name === "string" ? args.new_name.trim() : "";
    // Only bare filenames — no separators, `..`, or leading dots.
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(newName)) {
      return `Invalid new name: ${newName}`;
    }

    const abs = resolveWorkspacePath(ctx.projectId, path);
    if (!abs || !existsSync(abs)) return `File not found: ${path}`;

    renameSync(abs, join(dirname(abs), newName));

    return `Renamed ${path} to ${newName}`;
  },
};

export default tool;
