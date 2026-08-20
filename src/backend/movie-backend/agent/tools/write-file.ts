import { writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { resolveWorkspacePath, ensureDir } from "../workspace";
import type { AgentTool } from "./types";

const tool: AgentTool = {
  name: "write_file",
  description: "Write (create or overwrite) a file with the given text content.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path relative to the workspace" },
      content: { type: "string", description: "Text content to write" },
    },
    required: ["path", "content"],
  },
  run: (args, ctx) => {
    const path = typeof args.path === "string" ? args.path : "";
    const content = typeof args.content === "string" ? args.content : "";
    const abs = resolveWorkspacePath(ctx.projectId, path);
    if (!abs) return `Invalid path: ${path}`;
    ensureDir(dirname(abs));
    writeFileSync(abs, content, "utf-8");
    return `Wrote ${content.length} chars to ${path}`;
  },
};

export default tool;
