import type { AgentTool } from "./types";

const tool: AgentTool = {
  name: "get_time",
  description: "Return the current date and time.",
  parameters: { type: "object", properties: {}, additionalProperties: false },
  run: () => new Date().toString(),
};

export default tool;
