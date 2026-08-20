import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveWorkspacePath, workspaceDir, walkFiles } from "../workspace";
import type { AgentTool } from "./types";

const tool: AgentTool = {
  name: "grep_files",
  description: "Search for a regex pattern within text files in the workspace.",
  parameters: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Regular expression to search for" },
      path: {
        type: "string",
        description:
          "Optional directory to search (defaults to the whole workspace)",
      },
    },
    required: ["pattern"],
  },
  run: (args, ctx) => {
    const pattern = typeof args.pattern === "string" ? args.pattern : "";
    if (!pattern) return "grep_files requires a pattern.";
    let re: RegExp;
    try {
      re = new RegExp(pattern, "i");
    } catch {
      return `Invalid regex: ${pattern}`;
    }

    const dirArg =
      typeof args.path === "string" && args.path.trim() ? args.path.trim() : "";
    const base = dirArg
      ? resolveWorkspacePath(ctx.projectId, dirArg)
      : workspaceDir(ctx.projectId);
    if (!base || !existsSync(base)) {
      return `Directory not found: ${dirArg || "(workspace)"}`;
    }

    const results: string[] = [];
    for (const f of walkFiles(base)) {
      if (f.kind !== "text") continue;
      const abs = join(base, f.path);
      let content: string;
      try {
        content = readFileSync(abs, "utf-8");
      } catch {
        continue;
      }
      content.split("\n").forEach((line, i) => {
        if (re.test(line)) {
          results.push(`${f.path}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    return results.length > 0
      ? results.join("\n")
      : `No matches for "${pattern}".`;
  },
};

export default tool;
