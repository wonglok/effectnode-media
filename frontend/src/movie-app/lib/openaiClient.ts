import OpenAI from "openai";

/**
 * OpenAI SDK client pointed at the app's `/p8881` proxy, which forwards to the
 * local mlx-vlm server (localhost:8881). Routing through the proxy means the
 * SDK works from any device that can reach this app — not just the host where
 * `localhost:8881` resolves.
 */
export function createLocalOpenAI(): OpenAI {
  return new OpenAI({
    baseURL: `${window.location.origin}/p8881/v1`,
    apiKey: "local",
    dangerouslyAllowBrowser: true,
  });
}
