import { create } from "zustand";

export interface LogEntry {
  id: number;
  message: string;
  level: "info" | "warn" | "error";
  timestamp: number;
}

interface LogStore {
  logs: LogEntry[];
  addLog: (entry: Omit<LogEntry, "id" | "timestamp">) => void;
  clearLogs: () => void;
}

let nextId = 1;

export const useLogStore = create<LogStore>((set) => ({
  logs: [],
  addLog: (entry) =>
    set((state) => ({
      logs: [...state.logs, { ...entry, id: nextId++, timestamp: Date.now() }],
    })),
  clearLogs: () => set({ logs: [] }),
}));
