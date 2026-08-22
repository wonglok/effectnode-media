import { create } from "zustand";

const API_BASE = `http://localhost:${(window as any).PORT}`;

export type QueueTaskType =
  | "generate"
  | "render"
  | "render-assets"
  | "render-videos"
  | "render-scene-images"
  | "render-asset"
  | "render-scene-image"
  | "render-video"
  | "regenerate-asset"
  | "regenerate-video"
  | "regenerate-scene-image"
  | "fast-image-edit"
  | "image-to-video"
  | "upscale"
  | "voice-clone"
  | "audio-to-video"
  | "advanced-voice-clone";

export type QueueTaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "paused";

export interface QueueTask {
  id: string;
  type: QueueTaskType;
  label: string;
  status: QueueTaskStatus;
  progress: { current: number; total: number } | null;
  statusText: string | null;
  error: string | null;
  payload: any;
  result: any;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  /** Only present in the "all projects" view — the task's owning project. */
  projectId?: string;
}

interface QueueStore {
  tasks: QueueTask[];
  loading: boolean;
  projectId: string | null;
  paused: boolean;
  logs: string;
  showAll: boolean;
  allTasks: QueueTask[];
  refresh: (projectId: string) => Promise<void>;
  refreshLogs: (projectId: string) => Promise<void>;
  refreshAll: () => Promise<void>;
  startStreaming: (projectId: string) => void;
  stopStreaming: () => void;
  setShowAll: (show: boolean) => void;
  cancel: (projectId: string, taskId: string) => Promise<void>;
  cancelActive: (projectId: string) => Promise<void>;
  clearFinished: (projectId: string) => Promise<void>;
  clearQueue: (projectId: string) => Promise<void>;
  pause: (projectId: string) => Promise<void>;
  resume: (projectId: string) => Promise<void>;
}

let eventSource: EventSource | null = null;
let allEventSource: EventSource | null = null;

/** Upsert a task into the list, replacing any existing entry with the same id. */
function upsertTask(tasks: QueueTask[], task: QueueTask): QueueTask[] {
  const index = tasks.findIndex((t) => t.id === task.id);
  if (index === -1) return [...tasks, task];
  const next = tasks.slice();
  next[index] = task;
  return next;
}

/** Task ids already observed as completed, so we only ding once per task. */
const completedTaskIds = new Set<string>();

/** Play a short "ding" notification tone via the Web Audio API. */
function playDing() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1046.5, now); // C6
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.3, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.95);
    osc.onended = () => ctx.close();
  } catch {
    // Ignore audio failures (e.g. blocked autoplay).
  }
}

/** Ding once when a task first reports `completed`. */
function maybeDing(task: QueueTask) {
  if (task.status !== "completed") return;
  if (completedTaskIds.has(task.id)) return;
  completedTaskIds.add(task.id);
  // Bound the set so a very long-lived session never grows it unboundedly.
  if (completedTaskIds.size > 1000) completedTaskIds.clear();
  playDing();
}

export const useQueueStore = create<QueueStore>((set, get) => ({
  tasks: [],
  loading: false,
  projectId: null,
  paused: false,
  logs: "",
  showAll: false,
  allTasks: [],

  refresh: async (projectId) => {
    try {
      const res = await fetch(
        `${API_BASE}/api/queue?projectId=${encodeURIComponent(projectId)}`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as { tasks: QueueTask[]; paused: boolean };
      set({
        tasks: Array.isArray(data.tasks) ? data.tasks : [],
        paused: Boolean(data.paused),
        projectId,
        loading: false,
      });
    } catch {
      set({ loading: false });
    }
  },

  refreshLogs: async (projectId) => {
    try {
      const res = await fetch(
        `${API_BASE}/api/logs?projectId=${encodeURIComponent(projectId)}`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as { logs: string };
      set({ logs: data.logs ?? "" });
    } catch {
      // ignore log fetch failures
    }
  },

  refreshAll: async () => {
    try {
      const res = await fetch(`${API_BASE}/api/queue/all`);
      if (!res.ok) return;
      const data = (await res.json()) as { tasks: QueueTask[] };
      const tasks = Array.isArray(data.tasks) ? data.tasks : [];
      tasks.sort((a, b) => a.createdAt - b.createdAt);
      set({ allTasks: tasks });
    } catch {
      // ignore fetch failures
    }
  },

  startStreaming: (projectId) => {
    get().stopStreaming();
    set({ projectId, loading: true });
    void get().refresh(projectId);
    void get().refreshLogs(projectId);

    const es = new EventSource(
      `${API_BASE}/api/events?projectId=${encodeURIComponent(projectId)}`,
    );
    eventSource = es;

    es.addEventListener("task", (event) => {
      try {
        const task = JSON.parse((event as MessageEvent).data) as QueueTask;
        set((s) => ({ tasks: upsertTask(s.tasks, task) }));
        maybeDing(task);
      } catch {
        // ignore malformed events
      }
    });

    es.addEventListener("log", (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data) as {
          text: string;
        };
        set((s) => ({ logs: s.logs + (data.text ?? "") }));
      } catch {
        // ignore malformed events
      }
    });

    // On (re)connect, re-sync full state to catch anything missed while offline.
    es.onopen = () => {
      void get().refresh(projectId);
      void get().refreshLogs(projectId);
    };
  },

  stopStreaming: () => {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    if (allEventSource) {
      allEventSource.close();
      allEventSource = null;
    }
    set({
      tasks: [],
      allTasks: [],
      projectId: null,
      loading: false,
      paused: false,
      logs: "",
      showAll: false,
    });
  },

  setShowAll: (show) => {
    if (show) {
      if (allEventSource) allEventSource.close();
      set({ showAll: true });
      void get().refreshAll();

      const es = new EventSource(`${API_BASE}/api/events?projectId=*`);
      allEventSource = es;
      es.addEventListener("task", (event) => {
        try {
          const task = JSON.parse((event as MessageEvent).data) as QueueTask;
          set((s) => ({ allTasks: upsertTask(s.allTasks, task) }));
          maybeDing(task);
        } catch {
          // ignore malformed events
        }
      });
      es.onopen = () => {
        void get().refreshAll();
      };
    } else {
      if (allEventSource) {
        allEventSource.close();
        allEventSource = null;
      }
      set({ showAll: false, allTasks: [] });
    }
  },

  cancel: async (projectId, taskId) => {
    try {
      await fetch(`${API_BASE}/api/queue/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, taskId }),
      });
    } catch {
      // ignore cancel failures
    }
    void get().refresh(projectId);
  },

  cancelActive: async (projectId) => {
    try {
      await fetch(`${API_BASE}/api/queue/cancel-active`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
    } catch {
      // ignore cancel failures
    }
    void get().refresh(projectId);
  },

  clearFinished: async (projectId) => {
    try {
      await fetch(`${API_BASE}/api/queue/clear`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
    } catch {
      // ignore clear failures
    }
    void get().refresh(projectId);
  },

  clearQueue: async (projectId) => {
    try {
      await fetch(`${API_BASE}/api/queue/clear-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
    } catch {
      // ignore clear failures
    }
    void get().refresh(projectId);
  },

  pause: async (projectId) => {
    try {
      await fetch(`${API_BASE}/api/queue/pause`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
    } catch {
      // ignore pause failures
    }
    void get().refresh(projectId);
  },

  resume: async (projectId) => {
    try {
      await fetch(`${API_BASE}/api/queue/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
    } catch {
      // ignore resume failures
    }
    void get().refresh(projectId);
  },
}));
