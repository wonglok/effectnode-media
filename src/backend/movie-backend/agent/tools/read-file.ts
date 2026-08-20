import { existsSync, readFileSync } from "node:fs";
import { resolveWorkspacePath, classifyFile } from "../workspace";
import type { AgentTool } from "./types";

const tool: AgentTool = {
  name: "read_file",
  description: "Read the text content of a file in the workspace.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "File path relative to the workspace (e.g. memories/foo.md)",
      },
    },
    required: ["path"],
  },
  run: (args, ctx) => {
    const path = typeof args.path === "string" ? args.path : "";
    const abs = resolveWorkspacePath(ctx.projectId, path);
    if (!abs || !existsSync(abs)) return `File not found: ${path}`;
    const kind = classifyFile(path);
    if (kind === "image" || kind === "video") {
      return `Cannot read binary file: ${path}`;
    }
    return readFileSync(abs, "utf-8");
  },
};

export default tool;
