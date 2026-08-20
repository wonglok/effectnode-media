export interface MessageContext {
  broadcast: (text: string) => void;
}

/**
 * Route an incoming WebSocket message by its JSON `type`, falling back to a
 * plain echo for non-JSON or untyped input.
 */
export function handleMessage(raw: string, ctx: MessageContext): void {
  let text = raw;
  try {
    const parsed = JSON.parse(raw) as { type?: string; message?: string };
    if (parsed.type === "ping") {
      ctx.broadcast("pong");
      return;
    }
    if (parsed.type === "chat" && typeof parsed.message === "string") {
      text = parsed.message;
    }
  } catch {
    // Non-JSON input — treat as a plain chat string.
  }
  ctx.broadcast(`echo: ${text}`);
}
