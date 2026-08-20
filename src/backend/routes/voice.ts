import { Router, type Request, type Response } from "express";

export const voiceRouter = Router();

const VOICE_API_URL = process.env.VOICE_API_URL ?? "http://127.0.0.1:11234";
const DEFAULT_MODEL = "mlx-community/Qwen3-TTS-12Hz-1.7B-Base-bf16";

/**
 * Proxy to the mlx-serve OpenAI-compatible TTS endpoint so the browser never
 * talks to it directly (avoids CORS and keeps the URL configurable via
 * VOICE_API_URL). Expects { model?, input, ref_audio? } and returns WAV bytes.
 */
voiceRouter.post("/voice/speech", async (req: Request, res: Response) => {
  const { model, input, ref_audio } = req.body ?? {};

  if (typeof input !== "string" || !input.trim()) {
    res.status(400).json({ error: "'input' is required" });
    return;
  }

  const payload = {
    model: typeof model === "string" && model ? model : DEFAULT_MODEL,
    input: input.trim(),
    ...(typeof ref_audio === "string" && ref_audio ? { ref_audio } : {}),
  };

  try {
    const upstream = await fetch(`${VOICE_API_URL}/v1/audio/speech`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      res.status(upstream.status).json({ error: text });
      return;
    }

    const audio = Buffer.from(await upstream.arrayBuffer());
    res.set("Content-Type", "audio/wav");
    res.send(audio);
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});
