import { create } from "zustand";

const API_BASE = `http://localhost:${(window as any).PORT}`;

interface VoiceChatStore {
  // Reference voice (voice clone source)
  refAudioPath: string | null;
  refAudioUrl: string | null;
  refAudioFilename: string | null;

  // Message text
  text: string;

  // Generation state
  generating: boolean;
  resultUrl: string | null;
  error: string | null;
  logs: string[];

  // Speech-to-text state
  listening: boolean;

  setText: (v: string) => void;
  setListening: (v: boolean) => void;
  uploadRefAudio: (
    base64: string,
    filename: string,
    projectId: string,
  ) => Promise<string | null>;
  generate: (projectId: string) => Promise<void>;
}

async function readSSEStream(
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

export const useVoiceChatStore = create<VoiceChatStore>((set, get) => ({
  refAudioPath: null,
  refAudioUrl: null,
  refAudioFilename: null,

  text: "",

  generating: false,
  resultUrl: null,
  error: null,
  logs: [],

  listening: false,

  setText: (text) => set({ text }),
  setListening: (listening) => set({ listening }),

  uploadRefAudio: async (base64, filename, projectId) => {
    try {
      const res = await fetch(`${API_BASE}/api/upload/audio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audio: base64,
          filename: filename || `voice-${Date.now()}.mp3`,
          projectId,
        }),
      });

      if (!res.ok) {
        set({ error: await res.text() });
        return null;
      }

      const data = await res.json();
      set({
        refAudioPath: data.path,
        refAudioUrl: `http://localhost:${(window as any).PORT}/api/files?path=${encodeURIComponent(data.path)}`,
        refAudioFilename: data.filename,
      });
      return data.path as string;
    } catch (e) {
      set({ error: String(e) });
      return null;
    }
  },

  generate: async (projectId) => {
    if (get().generating) return;

    const { text, refAudioFilename } = get();
    if (!text.trim()) return;
    if (!refAudioFilename) {
      set({ error: "Upload a reference voice first." });
      return;
    }

    set({ generating: true, error: null, resultUrl: null, logs: [] });

    try {
      const res = await fetch(`${API_BASE}/api/render/voice-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text.trim(),
          refAudioPath: refAudioFilename,
          projectId,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        set({ generating: false, error: err });
        return;
      }

      await readSSEStream(res, (event, data) => {
        switch (event) {
          case "log":
            set((s) => ({ logs: [...s.logs, data.text as string] }));
            break;
          case "complete":
            set({
              generating: false,
              resultUrl: `http://localhost:${(window as any).PORT}/api/files?path=${encodeURIComponent(data.path)}`,
            });
            break;
          case "error":
            set({
              generating: false,
              error: data.error || "Voice generation failed",
            });
            break;
        }
      });
    } catch (e) {
      set({ generating: false, error: String(e) });
    }
  },
}));
