import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { resolveWorkspacePath, ensureDir } from "../workspace";
import type { AgentTool } from "./types";

const tool: AgentTool = {
  name: "update_file",
  description: "Append text to the end of a file in the workspace.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path relative to the workspace" },
      content: { type: "string", description: "Text content to append" },
    },
    required: ["path", "content"],
  },
  run: (args, ctx) => {
    const path = typeof args.path === "string" ? args.path : "";
    const content = typeof args.content === "string" ? args.content : "";
    const abs = resolveWorkspacePath(ctx.projectId, path);
    if (!abs) return `Invalid path: ${path}`;
    ensureDir(dirname(abs));
    const existing = existsSync(abs) ? readFileSync(abs, "utf-8") : "";
    writeFileSync(abs, existing + content, "utf-8");
    return `Appended ${content.length} chars to ${path}`;
  },
};

export default tool;
