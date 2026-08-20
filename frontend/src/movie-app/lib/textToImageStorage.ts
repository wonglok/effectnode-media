import localforage from "localforage";

// Persisted "UI state" for the text-to-image tab: the editable setup (prompt +
// generation params). Transient state (result, logs, install/download flags) is
// intentionally not persisted.
export interface PersistedTextToImageState {
  prompt: string;
  aspectRatio: "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
  resolution:
    | "320p"
    | "480p"
    | "512p"
    | "640p"
    | "720p"
    | "1080p"
    | "2048p";
  steps: number;
}

const store = localforage.createInstance({
  name: "lambobo-studio",
  storeName: "text-to-image",
});

// Each project keeps its own persisted text-to-image UI state, keyed by
// projectId so switching projects restores the right settings.
function storageKey(projectId: string): string {
  return `text-to-image-ui-state:${projectId}`;
}

export async function loadTextToImageState(
  projectId: string,
): Promise<PersistedTextToImageState | null> {
  try {
    const value = await store.getItem<PersistedTextToImageState>(
      storageKey(projectId),
    );
    return value ?? null;
  } catch {
    return null;
  }
}

export async function saveTextToImageState(
  projectId: string,
  state: PersistedTextToImageState,
): Promise<void> {
  try {
    await store.setItem(storageKey(projectId), state);
  } catch {
    // Ignore persistence failures — the UI keeps working in memory.
  }
}

export async function clearTextToImageState(projectId: string): Promise<void> {
  try {
    await store.removeItem(storageKey(projectId));
  } catch {
    // Ignore — nothing to clear.
  }
}
