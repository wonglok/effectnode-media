import localforage from "localforage";

// Persisted "UI state" for the references-to-video tab: the editable setup
// (prompt + generation params + ordered references). Transient generation
// state (result, logs, downloading) is intentionally not persisted.
export interface PersistedReferenceRef {
  kind: "image" | "video" | "audio";
  filename: string | null;
}

export interface PersistedReferencesToVideoState {
  prompt: string;
  steps: number;
  width: number;
  height: number;
  seconds: number;
  seed: number;
  refs: PersistedReferenceRef[];
}

const store = localforage.createInstance({
  name: "lambobo-studio",
  storeName: "references-to-video",
});

// Each project keeps its own persisted references-to-video UI state, keyed by
// projectId so switching projects restores the right refs + settings.
function storageKey(projectId: string): string {
  return `references-to-video-ui-state:${projectId}`;
}

export async function loadReferencesToVideoState(
  projectId: string,
): Promise<PersistedReferencesToVideoState | null> {
  try {
    const value = await store.getItem<PersistedReferencesToVideoState>(
      storageKey(projectId),
    );
    return value ?? null;
  } catch {
    return null;
  }
}

export async function saveReferencesToVideoState(
  projectId: string,
  state: PersistedReferencesToVideoState,
): Promise<void> {
  try {
    await store.setItem(storageKey(projectId), state);
  } catch {
    // Ignore persistence failures — the UI keeps working in memory.
  }
}

export async function clearReferencesToVideoState(
  projectId: string,
): Promise<void> {
  try {
    await store.removeItem(storageKey(projectId));
  } catch {
    // Ignore — nothing to clear.
  }
}
