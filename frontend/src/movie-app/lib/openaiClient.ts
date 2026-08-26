import OpenAI from "openai";

/**
 * OpenAI SDK client pointed at the backend's `/p8881` proxy, which forwards to
 * the local mlx-vlm server (localhost:8881). Routing through the proxy means
 * the SDK works from any device that can reach this app's backend — not just
 * the host machine where `localhost` resolves.
 */
export function createLocalOpenAI(): OpenAI {
  // Absolute origin required — the SDK builds request URLs with `new URL(baseURL + path)`.
  return new OpenAI({
    baseURL: `${window.location.origin}/p8881/v1`,
    apiKey: "local",
    dangerouslyAllowBrowser: true,
  });
}
