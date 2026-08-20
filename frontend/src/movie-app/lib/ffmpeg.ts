import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";

const API_BASE = `http://localhost:${(window as any).PORT}`;

let ffmpeg: FFmpeg | null = null;
let loading: Promise<FFmpeg> | null = null;

/**
 * Lazily load a single shared FFmpeg instance. The core .js/.wasm files are
 * served by the backend at `/ffmpeg/...` (see src/bun/core.ts) so they work
 * offline in both dev and packaged builds.
 */
export async function loadFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg?.loaded) return ffmpeg;
  if (loading) return loading;

  loading = (async () => {
    const base = `${API_BASE}/ffmpeg`;
    const coreURL = await toBlobURL(
      `${base}/ffmpeg-core.js`,
      "text/javascript",
    );
    const wasmURL = await toBlobURL(
      `${base}/ffmpeg-core.wasm`,
      "application/wasm",
    );

    const instance = new FFmpeg();
    await instance.load({ coreURL, wasmURL });
    ffmpeg = instance;
    return instance;
  })();

  try {
    return await loading;
  } catch (e) {
    // Allow a retry on the next call if loading failed part-way.
    loading = null;
    throw e;
  }
}
