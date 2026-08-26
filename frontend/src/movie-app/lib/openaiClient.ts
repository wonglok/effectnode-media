import OpenAI from "openai";

/**
 * OpenAI SDK client pointed directly at the local mlx-vlm server.
 */
export function createLocalOpenAI(): OpenAI {
  return new OpenAI({
    baseURL: "http://localhost:8881/v1",
    apiKey: "local",
    dangerouslyAllowBrowser: true,
  });
}
