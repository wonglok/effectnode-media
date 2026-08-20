import localforage from "localforage";
import type {
  AspectRatio,
  Resolution,
  VideoMode,
} from "../stores/generationStore";

// Persisted "UI state" for the batch video tab: the editable setup (rows +
// shared settings). Transient generation state (status, results, logs) is
// intentionally not persisted.
export interface PersistedBatchRow {
  id: string;
  prompt: string;
  imagePath: string | null;
  imageUrl: string | null;
  imageFilename: string | null;
}

export interface PersistedBatchVideoState {
  rows: PersistedBatchRow[];
  duration: number;
  aspectRatio: AspectRatio;
  resolution: Resolution;
  mode: VideoMode;
}

const store = localforage.createInstance({
  name: "lambobo-studio",
  storeName: "batch-video",
});

// Each project keeps its own persisted batch-video UI state, keyed by
// projectId so switching projects restores the right rows + settings.
function storageKey(projectId: string): string {
  return `batch-video-ui-state:${projectId}`;
}

export async function loadBatchVideoState(
  projectId: string,
): Promise<PersistedBatchVideoState | null> {
  try {
    const value = await store.getItem<PersistedBatchVideoState>(
      storageKey(projectId),
    );
    return value ?? null;
  } catch {
    return null;
  }
}

export async function saveBatchVideoState(
  projectId: string,
  state: PersistedBatchVideoState,
): Promise<void> {
  try {
    await store.setItem(storageKey(projectId), state);
  } catch {
    // Ignore persistence failures — the UI keeps working in memory.
  }
}

export async function clearBatchVideoState(projectId: string): Promise<void> {
  try {
    await store.removeItem(storageKey(projectId));
  } catch {
    // Ignore — nothing to clear.
  }
}
