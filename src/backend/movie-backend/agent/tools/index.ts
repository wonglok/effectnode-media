import type { AgentTool, ToolRunContext } from "./types";
import getTimeTool from "./get-time";
import listFilesTool from "./list-files";
import readFileTool from "./read-file";
import writeFileTool from "./write-file";
import updateFileTool from "./update-file";
import removeFileTool from "./remove-file";
import renameFileTool from "./rename-file";
import grepFilesTool from "./grep-files";
import showImageTool from "./show-image";
import editImageTool from "./edit-image";
import imageToVideoGenerationTool from "./image-to-video-generation";
import textToVideoGenerationTool from "./text-to-video-generation";
import stitchVideosTool from "./stitch-videos";

export type { AgentTool, ToolRunContext } from "./types";

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
  editImageTool,
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
