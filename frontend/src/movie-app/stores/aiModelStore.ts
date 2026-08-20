import { create } from "zustand";

const API_BASE = `http://localhost:${(window as any).PORT}`;

/** Models that have a dedicated download endpoint in the backend. */
export type AiModelId = "z-image" | "flux" | "qwen";

/** Tools whose "install" step must run before their models can be downloaded. */
export type AiToolId = "mlxgen" | "mlx-vlm";

interface AiModelStore {
  // Tool installation status
  mlxgenInstalled: boolean | null;
  mlxVlmInstalled: boolean | null;
  // Model download status
  zImageDownloaded: boolean | null;
  fluxDownloaded: boolean | null;
  qwenDownloaded: boolean | null;
  // In-flight install/download (a model id or tool id)
  downloading: string | null;
  logs: string[];
  error: string | null;

  checkStatus: () => Promise<void>;
  installTool: (tool: AiToolId) => Promise<void>;
  downloadModel: (id: AiModelId) => Promise<void>;
  clearLogs: () => void;
}

/** Read a server-sent-events response, invoking `onEvent` per parsed event. */
async function readSSE(
  response: Response,
  onEvent: (event: string, data: any) => void,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      let eventType = "message";
      for (const line of lines) {
        if (line.startsWith("event: ")) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          try {
            onEvent(eventType, JSON.parse(line.slice(6)));
          } catch {
            // skip malformed lines
          }
          eventType = "message";
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

const DOWNLOAD_ENDPOINTS: Record<AiModelId, string> = {
  "z-image": "/api/mlxgen/download-z-model",
  flux: "/api/mlxgen/download-flux-model",
  qwen: "/api/mlxgen/download-model",
};

const TOOL_ENDPOINTS: Record<AiToolId, string> = {
  mlxgen: "/api/mlxgen/install",
  "mlx-vlm": "/api/agent/install",
};

export const useAiModelStore = create<AiModelStore>((set, get) => ({
  mlxgenInstalled: null,
  mlxVlmInstalled: null,
  zImageDownloaded: null,
  fluxDownloaded: null,
  qwenDownloaded: null,
  downloading: null,
  logs: [],
  error: null,

  checkStatus: async () => {
    try {
      const [mlxgen, agent] = await Promise.all([
        fetch(`${API_BASE}/api/mlxgen/status`).then((r) =>
          r.ok ? r.json() : null,
        ),
        fetch(`${API_BASE}/api/agent/status`).then((r) =>
          r.ok ? r.json() : null,
        ),
      ]);
      set({
        mlxgenInstalled: mlxgen ? Boolean(mlxgen.installed) : null,
        qwenDownloaded: mlxgen ? Boolean(mlxgen.modelDownloaded) : null,
        zImageDownloaded: mlxgen ? Boolean(mlxgen.zModelDownloaded) : null,
        fluxDownloaded: mlxgen ? Boolean(mlxgen.fluxModelDownloaded) : null,
        mlxVlmInstalled: agent ? Boolean(agent.installed) : null,
      });
    } catch {
      // Leave status unknown (null) if the checks fail.
    }
  },

  installTool: async (tool) => {
    if (get().downloading) return;
    set({ downloading: tool, logs: [], error: null });
    try {
      const res = await fetch(`${API_BASE}${TOOL_ENDPOINTS[tool]}`, {
        method: "POST",
      });
      if (!res.ok) {
        set({ downloading: null, error: await res.text() });
        return;
      }
      await readSSE(res, (event, data) => {
        if (event === "log") {
          set((s) => ({ logs: [...s.logs, data.text ?? ""] }));
        } else if (event === "complete") {
          set({ downloading: null });
        } else if (event === "error") {
          set({ downloading: null, error: data.error ?? "Install failed" });
        }
      });
    } catch (e) {
      set({ downloading: null, error: String(e) });
    } finally {
      get().checkStatus();
    }
  },

  downloadModel: async (id) => {
    if (get().downloading) return;
    set({ downloading: id, logs: [], error: null });
    try {
      const res = await fetch(`${API_BASE}${DOWNLOAD_ENDPOINTS[id]}`, {
        method: "POST",
      });
      if (!res.ok) {
        set({ downloading: null, error: await res.text() });
        return;
      }
      await readSSE(res, (event, data) => {
        if (event === "log") {
          set((s) => ({ logs: [...s.logs, data.text ?? ""] }));
        } else if (event === "complete") {
          set({ downloading: null });
        } else if (event === "error") {
          set({ downloading: null, error: data.error ?? "Download failed" });
        }
      });
    } catch (e) {
      set({ downloading: null, error: String(e) });
    } finally {
      get().checkStatus();
    }
  },

  clearLogs: () => set({ logs: [], error: null }),
}));
