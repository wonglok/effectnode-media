import localforage from "localforage";
import type {
  AspectRatio,
  Resolution,
  VideoMode,
} from "../stores/generationStore";

// TTS quality tier: "high" = Qwen3 1.7B, "low" = Qwen3 0.6B.
export type VoiceQuality = "low" | "high";

// Persisted "UI state" for the batch custom voice video tab: the editable
// setup (rows + shared video settings + voice reference). Transient
// generation state (status, results, logs) is intentionally not persisted.
export interface PersistedBatchVoiceRow {
  id: string;
  prompt: string;
  script: string;
  imagePath: string | null;
  imageUrl: string | null;
  imageFilename: string | null;
}

export interface PersistedBatchVoiceState {
  rows: PersistedBatchVoiceRow[];
  duration: number;
  aspectRatio: AspectRatio;
  resolution: Resolution;
  mode: VideoMode;
  quality: VoiceQuality;
  voiceRefPath: string | null;
  voiceRefFilename: string | null;
}

const store = localforage.createInstance({
  name: "lambobo-studio",
  storeName: "batch-voice",
});

// Each project keeps its own persisted batch-voice UI state, keyed by
// projectId so switching projects restores the right rows + settings.
function storageKey(projectId: string): string {
  return `batch-voice-ui-state:${projectId}`;
}

export async function loadBatchVoiceState(
  projectId: string,
): Promise<PersistedBatchVoiceState | null> {
  try {
    const value = await store.getItem<PersistedBatchVoiceState>(
      storageKey(projectId),
    );
    return value ?? null;
  } catch {
    return null;
  }
}

export async function saveBatchVoiceState(
  projectId: string,
  state: PersistedBatchVoiceState,
): Promise<void> {
  try {
    await store.setItem(storageKey(projectId), state);
  } catch {
    // Ignore persistence failures — the UI keeps working in memory.
  }
}

export async function clearBatchVoiceState(projectId: string): Promise<void> {
  try {
    await store.removeItem(storageKey(projectId));
  } catch {
    // Ignore — nothing to clear.
  }
}
