import type { AgentTool, ToolRunContext } from "./types.js";
import getTimeTool from "./get-time.js";
import listFilesTool from "./list-files.js";
import readFileTool from "./read-file.js";
import writeFileTool from "./write-file.js";
import updateFileTool from "./update-file.js";
import removeFileTool from "./remove-file.js";
import renameFileTool from "./rename-file.js";
import grepFilesTool from "./grep-files.js";
import showImageTool from "./show-image.js";
import imageToVideoGenerationTool from "./image-to-video-generation.js";
import textToVideoGenerationTool from "./text-to-video-generation.js";
import stitchVideosTool from "./stitch-videos.js";

export type { AgentTool, ToolRunContext } from "./types.js";

export const TOOLS: AgentTool[] = [
  getTimeTool,
  listFilesTool,
  readFileTool,
  writeFileTool,
  updateFileTool,
  removeFileTool,
  renameFileTool,
  grepFilesTool,
  showImageTool,
  imageToVideoGenerationTool,
  textToVideoGenerationTool,
  stitchVideosTool,
];

/** Build the OpenAI `tools` array from the tool objects. */
export function toolDefinitions(tools: AgentTool[]): any[] {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

/** Dispatch a tool call to the matching tool's `run` function. */
export async function runTool(
  tools: AgentTool[],
  name: string,
  args: string,
  ctx: ToolRunContext,
): Promise<string> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) return `Unknown tool: ${name}`;

  let parsed: Record<string, unknown> = {};
  try {
    parsed = args ? JSON.parse(args) : {};
  } catch {
    // leave empty on malformed args
  }

  try {
    const out = await tool.run(parsed, ctx);
    return typeof out === "string" ? out : String(out);
  } catch (e) {
    return `Tool error: ${String(e)}`;
  }
}
