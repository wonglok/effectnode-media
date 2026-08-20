export interface ToolRunContext {
  projectId: string;
  /** Optional SSE emit function so tools can stream events to the client. */
  emit?: (event: string, data: Record<string, unknown>) => void;
  /** The app backend port, for tools that call internal endpoints. */
  backendPort?: number;
  /** Abort signal derived from the incoming request, for cancellable calls. */
  signal?: AbortSignal;
}

export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  run: (
    args: Record<string, unknown>,
    ctx: ToolRunContext,
  ) => string | Promise<string>;
}
