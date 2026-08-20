import { existsSync } from "node:fs";
import { workspaceDir, walkFiles } from "../workspace";
import type { AgentTool } from "./types";

const tool: AgentTool = {
  name: "list_files",
  description: "List all files in the agent's workspace (recursive).",
  parameters: { type: "object", properties: {}, additionalProperties: false },
  run: (_args, ctx) => {
    const base = workspaceDir(ctx.projectId);
    if (!existsSync(base)) return "Workspace is empty.";
    const files = walkFiles(base);
    if (files.length === 0) return "Workspace is empty.";
    return JSON.stringify(
      files.map((f) => ({ path: f.path, kind: f.kind, size: f.size })),
    );
  },
};

export default tool;
