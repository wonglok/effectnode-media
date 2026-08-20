import { create } from "zustand";

const API_BASE = `http://localhost:${(window as any).PORT}`;

export interface AgentStep {
  type: "thought" | "tool";
  text: string;
  detail?: string;
  args?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  image?: string;
  images?: string[];
  videos?: string[];
  notices?: string[];
  thinking?: string;
  trace?: any[];
  steps: AgentStep[];
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
}

let msgCounter = 0;
function nextMsgId(): string {
  msgCounter += 1;
  return `msg-${msgCounter}`;
}

let sessionCounter = 0;
function nextSessionId(): string {
  sessionCounter += 1;
  return `sess-${Date.now().toString(36)}-${sessionCounter}`;
}

function newSession(): ChatSession {
  return {
    id: nextSessionId(),
    title: "New chat",
    messages: [],
    createdAt: Date.now(),
  };
}

// ========== SSE Stream Reader ==========

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
            const data = JSON.parse(line.slice(6));
            onEvent(eventType, data);
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

// ========== Store ==========

async function persistThreads(
  projectId: string,
  sessions: ChatSession[],
  agent: string,
): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/agent/threads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        agent,
        threads: sessions.map((s) => ({
          id: s.id,
          title: s.title,
          createdAt: s.createdAt,
        })),
      }),
    });
  } catch {
    // ignore persistence failures
  }
}

async function persistThreadChat(
  projectId: string,
  session: ChatSession,
  agent: string,
): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/agent/thread/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        agent,
        threadId: session.id,
        messages: session.messages,
      }),
    });
  } catch {
    // ignore persistence failures
  }
}

interface ChatStore {
  sessions: ChatSession[];
  activeSessionId: string | null;
  projectId: string | null;
  agentType: string;
  sending: boolean;
  error: string | null;
  pendingImage: string | null;
  setPendingImage: (dataUrl: string | null) => void;
  loadThreads: (projectId: string, agent?: string) => Promise<void>;
  createSession: () => void;
  selectSession: (id: string) => void;
  deleteSession: (id: string) => void;
  resetActiveSession: () => void;
  stop: () => void;
  sendMessage: (
    content: string,
    port: number,
    model: string,
    projectId: string,
    image?: string,
  ) => Promise<void>;
}

let chatAbortController: AbortController | null = null;

const firstSession = newSession();

export const useChatStore = create<ChatStore>((set, get) => ({
  sessions: [firstSession],
  activeSessionId: firstSession.id,
  projectId: null,
  agentType: "default",
  sending: false,
  error: null,
  pendingImage: null,

  setPendingImage: (dataUrl) => set({ pendingImage: dataUrl }),

  loadThreads: async (projectId, agent = "default") => {
    set({ projectId, agentType: agent });
    try {
      const res = await fetch(
        `${API_BASE}/api/agent/threads?projectId=${encodeURIComponent(
          projectId,
        )}&agent=${encodeURIComponent(agent)}`,
      );
      if (!res.ok) return;
      const data = await res.json();
      const metas = (data.threads || []) as {
        id: string;
        title: string;
        createdAt: number;
      }[];

      const sessions: ChatSession[] = [];
      for (const meta of metas) {
        const chatRes = await fetch(
          `${API_BASE}/api/agent/thread/chat?projectId=${encodeURIComponent(
            projectId,
          )}&agent=${encodeURIComponent(agent)}&threadId=${encodeURIComponent(
            meta.id,
          )}`,
        );
        let messages: ChatMessage[] = [];
        if (chatRes.ok) {
          const chatData = await chatRes.json();
          messages = (chatData.messages || []) as ChatMessage[];
        }
        sessions.push({
          id: meta.id,
          title: meta.title,
          messages,
          createdAt: meta.createdAt,
        });
      }

      if (sessions.length === 0) {
        sessions.push(newSession());
      }
      set({ sessions, activeSessionId: sessions[0].id, sending: false });
    } catch {
      // keep current in-memory sessions
    }
  },

  createSession: () => {
    const session = newSession();
    set((s) => ({
      sessions: [...s.sessions, session],
      activeSessionId: session.id,
      error: null,
    }));
    const st = get();
    if (st.projectId) persistThreads(st.projectId, st.sessions, st.agentType);
  },

  selectSession: (id) => set({ activeSessionId: id, error: null }),

  deleteSession: (id) => {
    set((s) => {
      let sessions = s.sessions.filter((x) => x.id !== id);
      let activeSessionId = s.activeSessionId;
      if (activeSessionId === id) {
        if (sessions.length > 0) {
          activeSessionId = sessions[sessions.length - 1].id;
        } else {
          const fresh = newSession();
          sessions = [fresh];
          activeSessionId = fresh.id;
        }
      }
      return { sessions, activeSessionId };
    });
    const st = get();
    if (st.projectId) persistThreads(st.projectId, st.sessions, st.agentType);
  },

  resetActiveSession: () => {
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === s.activeSessionId
          ? { ...sess, title: "New chat", messages: [] }
          : sess,
      ),
      error: null,
    }));
    const st = get();
    if (st.projectId) {
      persistThreads(st.projectId, st.sessions, st.agentType);
      const session = st.sessions.find((x) => x.id === st.activeSessionId);
      if (session) persistThreadChat(st.projectId, session, st.agentType);
    }
  },

  sendMessage: async (content, port, model, projectId, image) => {
    const text = content.trim();
    if ((!text && !image) || get().sending) return;

    const agent = get().agentType;

    let sessionId = get().activeSessionId;
    if (!sessionId) {
      const fresh = newSession();
      sessionId = fresh.id;
      set((s) => ({
        sessions: [...s.sessions, fresh],
        activeSessionId: fresh.id,
      }));
    }

    const session = get().sessions.find((sess) => sess.id === sessionId);
    if (!session) return;

    // History sent to the backend: prior turns plus the new user message.
    const history = [
      ...session.messages
        .filter((m) => m.content.trim() || (m.image && m.image.trim()))
        .map((m) => ({ role: m.role, content: m.content, image: m.image })),
      { role: "user" as const, content: text, image },
    ];

    const userMsg: ChatMessage = {
      id: nextMsgId(),
      role: "user",
      content: text,
      image,
      steps: [],
    };
    const assistantMsg: ChatMessage = {
      id: nextMsgId(),
      role: "assistant",
      content: "",
      steps: [],
    };

    // Set the session title from the first user message.
    const title =
      session.title === "New chat" && text
        ? text.length > 40
          ? `${text.slice(0, 40)}…`
          : text
        : session.title;

    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === sessionId
          ? {
              ...sess,
              title,
              messages: [...sess.messages, userMsg, assistantMsg],
            }
          : sess,
      ),
      sending: true,
      error: null,
      pendingImage: null,
    }));

    const updateAssistant = (fn: (m: ChatMessage) => ChatMessage) =>
      set((s) => ({
        sessions: s.sessions.map((sess) =>
          sess.id === sessionId
            ? {
                ...sess,
                messages: sess.messages.map((m) =>
                  m.id === assistantMsg.id ? fn(m) : m,
                ),
              }
            : sess,
        ),
      }));

    chatAbortController = new AbortController();

    try {
      const res = await fetch(`${API_BASE}/api/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, port, model, projectId, agent }),
        signal: chatAbortController.signal,
      });

      if (!res.ok) {
        const err = await res.text();
        updateAssistant((m) => ({ ...m, content: err || "Request failed" }));
        set({ error: err || "Request failed" });
        return;
      }

      await readSSEStream(res, (event, data) => {
        switch (event) {
          case "tool":
            updateAssistant((m) => ({
              ...m,
              steps: [
                ...m.steps,
                {
                  type: "tool",
                  text: data.name as string,
                  detail: data.output as string,
                  args: data.arguments as string,
                },
              ],
            }));
            break;
          case "delta":
            updateAssistant((m) => ({
              ...m,
              content: m.content + (data.text as string),
            }));
            break;
          case "image": {
            const url = data.url as string;
            const fullUrl = url.startsWith("http") ? url : `${API_BASE}${url}`;
            updateAssistant((m) => ({
              ...m,
              images: [...(m.images ?? []), fullUrl],
            }));
            break;
          }
          case "notice":
            updateAssistant((m) => ({
              ...m,
              notices: [...(m.notices ?? []), data.text as string],
            }));
            break;
          case "thinking":
            updateAssistant((m) => ({
              ...m,
              thinking: (m.thinking ?? "") + (data.text as string),
            }));
            break;
          case "video": {
            const url = data.url as string;
            const fullUrl = url.startsWith("http") ? url : `${API_BASE}${url}`;
            updateAssistant((m) => ({
              ...m,
              videos: [...(m.videos ?? []), fullUrl],
            }));
            break;
          }
          case "messages":
            updateAssistant((m) => ({
              ...m,
              trace: data.messages as any[],
            }));
            break;
          case "error":
            set({ error: data.error || "Something went wrong" });
            break;
          case "done":
            break;
        }
      });
    } catch (e) {
      if ((e as any)?.name !== "AbortError") {
        set({ error: String(e) });
      }
    } finally {
      chatAbortController = null;
      set({ sending: false });
      const st = get();
      if (st.projectId) {
        const session = st.sessions.find((x) => x.id === sessionId);
        if (session) persistThreadChat(st.projectId, session, agent);
        persistThreads(st.projectId, st.sessions, agent);
      }
    }
  },

  stop: () => {
    if (chatAbortController) {
      chatAbortController.abort();
      chatAbortController = null;
    }
    set({ sending: false });
  },
}));
