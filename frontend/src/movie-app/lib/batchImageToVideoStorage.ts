import localforage from "localforage";
import type {
  AspectRatio,
  Resolution,
  VideoMode,
} from "../stores/generationStore";

// Persisted "UI state" for the batch image-to-video tab: the editable setup
// (rows with t2i + i2v prompts + shared settings). Generated results are
// intentionally not persisted.
export interface PersistedBatchI2VRow {
  id: string;
  t2iPrompt: string;
  i2vPrompt: string;
  duration: number | null;
}

export interface PersistedBatchImageToVideoState {
  rows: PersistedBatchI2VRow[];
  aspectRatio: AspectRatio;
  resolution: Resolution;
  duration: number;
  mode: VideoMode;
}

const store = localforage.createInstance({
  name: "lambobo-studio",
  storeName: "batch-image-to-video",
});

// Each project keeps its own persisted batch image-to-video UI state, keyed by
// projectId so switching projects restores the right rows + settings.
function storageKey(projectId: string): string {
  return `batch-image-to-video-ui-state:${projectId}`;
}

export async function loadBatchImageToVideoState(
  projectId: string,
): Promise<PersistedBatchImageToVideoState | null> {
  try {
    const value = await store.getItem<PersistedBatchImageToVideoState>(
      storageKey(projectId),
    );
    return value ?? null;
  } catch {
    return null;
  }
}

export async function saveBatchImageToVideoState(
  projectId: string,
  state: PersistedBatchImageToVideoState,
): Promise<void> {
  try {
    await store.setItem(storageKey(projectId), state);
  } catch {
    // Ignore persistence failures — the UI keeps working in memory.
  }
}

export async function clearBatchImageToVideoState(
  projectId: string,
): Promise<void> {
  try {
    await store.removeItem(storageKey(projectId));
  } catch {
    // Ignore — nothing to clear.
  }
}
