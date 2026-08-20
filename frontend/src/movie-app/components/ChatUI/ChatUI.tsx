import { useEffect, useRef, useState } from "react";
import { useGenerationStore } from "../../stores/generationStore";
import { useChatStore } from "../../stores/chatStore";
import { MarkdownMessage } from "./MarkdownMessage";

const API_BASE = `http://localhost:${(window as any).PORT}`;

/** Extract a readable summary of a tool call's JSON arguments. */
function summarizeArgs(args?: string): string {
  if (!args) return "";
  try {
    const obj = JSON.parse(args);
    const strings = Object.values(obj).filter((v) => typeof v === "string");
    return strings.join(", ");
  } catch {
    return args;
  }
}

interface Props {
  projectId: string;
  agent?: string;
}

async function uploadToAgentWorkspace(
  projectId: string,
  dataUrl: string,
  filename: string,
): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/api/agent/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: dataUrl, filename, projectId }),
    });
    if (!res.ok) {
      console.error("Failed to upload to agent workspace:", await res.text());
    }
  } catch (e) {
    console.error("Failed to upload to agent workspace:", e);
  }
}

export function ChatUI({ projectId, agent = "default" }: Props) {
  const gen = useGenerationStore();
  const chat = useChatStore();

  const port = gen.agent.port;
  const model = gen.agent.model;
  const serverRunning = gen.agent.serverRunning;

  const activeSession =
    chat.sessions.find((s) => s.id === chat.activeSessionId) ?? null;
  const messages = activeSession?.messages ?? [];

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [confirmDeleteSession, setConfirmDeleteSession] = useState<
    string | null
  >(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, chat.sending]);

  useEffect(() => {
    chat.loadThreads(projectId, agent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, agent]);

  useEffect(() => {
    if (!previewImage) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreviewImage(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewImage]);

  const handleSend = () => {
    const value = inputRef.current?.value ?? "";
    const hasText = value.trim().length > 0;
    const hasImage = Boolean(chat.pendingImage);
    if ((!hasText && !hasImage) || chat.sending || !serverRunning) return;
    if (inputRef.current) inputRef.current.value = "";
    chat.sendMessage(
      value.trim(),
      port,
      model,
      projectId,
      chat.pendingImage ?? undefined,
    );
  };

  const handleAttach = () => fileRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      chat.setPendingImage(dataUrl);
      uploadToAgentWorkspace(
        projectId,
        dataUrl,
        `chat-${Date.now()}-${file.name}`,
      );
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const confirmDeleteSessionAction = () => {
    if (confirmDeleteSession) {
      chat.deleteSession(confirmDeleteSession);
      setConfirmDeleteSession(null);
    }
  };

  useEffect(() => {
    if (!confirmDeleteSession) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setConfirmDeleteSession(null);
      } else if (e.key === "Enter") {
        e.preventDefault();
        confirmDeleteSessionAction();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmDeleteSession]);

  // ========== SVG Icons ==========

  const SendIcon = (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );

  const BotIcon = (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <circle cx="9" cy="9" r="1" />
      <circle cx="15" cy="9" r="1" />
      <line x1="9" y1="14" x2="15" y2="14" />
    </svg>
  );

  const WrenchIcon = (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );

  const SpinnerIcon = (
    <svg
      className="animate-spin text-tiffany-600"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" strokeOpacity="0.75" />
    </svg>
  );

  const AttachIcon = (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );

  const RemoveIcon = (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );

  const ResetIcon = (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  );

  const PlusIcon = (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );

  const TrashIcon = (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );

  const StopIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <rect x="5" y="5" width="14" height="14" rx="2" />
    </svg>
  );

  const CloseIcon = (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );

  const canSend = serverRunning && !chat.sending;

  return (
    <div className="flex border border-tiffany-200/70 rounded-2xl overflow-hidden bg-white">
      {/* ===== Session sidebar ===== */}
      <div className="w-44 shrink-0 border-r border-tiffany-100 bg-tiffany-50/60 flex flex-col">
        <div className="p-2 border-b border-tiffany-100">
          <button
            onClick={() => chat.createSession()}
            className="flex items-center justify-center gap-1.5 w-full px-2 py-1.5 text-xs font-medium rounded-xl border border-tiffany-500 bg-tiffany-500 text-ink-950 hover:bg-tiffany-600 hover:border-tiffany-600 transition-colors"
          >
            {PlusIcon}
            New Session
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {chat.sessions.map((sess) => {
            const active = sess.id === chat.activeSessionId;
            return (
              <div
                key={sess.id}
                onClick={() => chat.selectSession(sess.id)}
                className={`group flex items-center gap-1 px-2.5 py-2 cursor-pointer text-xs border-b border-tiffany-100 transition-colors ${
                  active
                    ? "bg-tiffany-100 text-tiffany-900"
                    : "text-ink-600 hover:bg-tiffany-50"
                }`}
              >
                <span className="flex-1 truncate">{sess.title}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmDeleteSession(sess.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 text-red-400 hover:bg-red-50 rounded transition-opacity"
                  title="Delete session"
                >
                  {TrashIcon}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ===== Chat area ===== */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 bg-tiffany-600 border-b border-tiffany-700">
          <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-white/15 text-white">
            {BotIcon}
          </span>
          <span className="text-sm font-semibold text-white truncate">
            {activeSession?.title ?? "Agent Chat"}
          </span>
          <span className="ml-auto text-xs font-medium text-white/90">
            {serverRunning ? "Connected" : "Server offline"}
          </span>
          <button
            onClick={() => chat.resetActiveSession()}
            disabled={messages.length === 0}
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-xl border border-white/30 text-white hover:bg-white/10 transition-colors disabled:opacity-40"
            title="Reset chat history"
          >
            {ResetIcon}
            Reset
          </button>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex flex-col gap-3 p-5 h-[500px] overflow-y-auto bg-tiffany-50/40"
        >
          {messages.length === 0 && (
            <div className="m-auto text-center text-xs text-tiffany-600/70 italic max-w-xs">
              {serverRunning
                ? "Ask the agent anything. It can use tools like get_time or list_projects."
                : "Start the mlx-vlm server above to begin chatting."}
            </div>
          )}

          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[80%] px-3 py-2 rounded-2xl bg-tiffany-500 text-ink-950 text-sm whitespace-pre-wrap font-serif">
                  {m.image && (
                    <img
                      src={m.image}
                      alt="uploaded"
                      onClick={() => setPreviewImage(m.image!)}
                      className="mb-2 max-w-48 rounded-xl cursor-pointer hover:opacity-80 transition-opacity"
                    />
                  )}
                  {m.content}
                </div>
              </div>
            ) : (
              <div key={m.id} className="flex flex-col gap-1.5">
                {m.steps.length > 0 && (
                  <div className="flex flex-col gap-1">
                    {m.steps.map((step, i) => {
                      const argSummary = summarizeArgs(step.args);
                      return (
                        <div
                          key={i}
                          className="flex items-start gap-1.5 text-[11px] text-tiffany-700/80"
                        >
                          <span className="mt-0.5 shrink-0 text-tiffany-500">
                            {WrenchIcon}
                          </span>
                          <span className="truncate">
                            <span className="font-medium">
                              Tool: {step.text}
                            </span>
                            {argSummary && (
                              <span className="text-tiffany-600/60">
                                {" "}
                                · {argSummary}
                              </span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {m.thinking && (
                  <details className="text-[11px] text-tiffany-600/80">
                    <summary className="cursor-pointer select-none">
                      Thinking
                    </summary>
                    <p className="mt-1 whitespace-pre-wrap italic">
                      {m.thinking}
                    </p>
                  </details>
                )}

                {m.notices && m.notices.length > 0 && (
                  <div className="flex flex-col gap-1">
                    {m.notices.map((n, i) => (
                      <div
                        key={i}
                        className="text-xs text-tiffany-600/70 italic whitespace-pre-wrap"
                      >
                        {n}
                      </div>
                    ))}
                  </div>
                )}

                {m.images && m.images.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {m.images.map((img, i) => (
                      <img
                        key={i}
                        src={img}
                        alt={`result ${i + 1}`}
                        onClick={() => setPreviewImage(img)}
                        className="max-w-48 max-h-48 rounded-xl border border-ink-200 object-contain cursor-pointer hover:opacity-80 transition-opacity"
                      />
                    ))}
                  </div>
                )}

                {m.videos && m.videos.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {m.videos.map((v, i) => (
                      <video
                        key={i}
                        src={v}
                        controls
                        className="max-w-64 max-h-48 rounded-xl border border-ink-200"
                      />
                    ))}
                  </div>
                )}

                {m.content ? (
                  <div className="flex justify-start">
                    <div className="max-w-[80%] px-3 py-2 rounded-2xl bg-white border border-tiffany-100 text-ink-900 text-sm">
                      <MarkdownMessage content={m.content} />
                    </div>
                  </div>
                ) : (
                  chat.sending && (
                    <div className="flex justify-start">
                      <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-white border border-tiffany-100 text-tiffany-600 text-sm">
                        {SpinnerIcon}
                        Thinking...
                      </div>
                    </div>
                  )
                )}

                {m.trace && (
                  <details className="text-[11px] text-tiffany-600/70">
                    <summary className="cursor-pointer">
                      Trace ({m.trace.length} messages)
                    </summary>
                    <pre className="mt-1 max-h-48 overflow-auto p-2 bg-ink-50 rounded-xl whitespace-pre-wrap text-ink-600">
                      {JSON.stringify(m.trace, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            ),
          )}

          {chat.error && (
            <div className="px-3 py-2 rounded-2xl bg-red-50 border border-red-200 text-red-600 text-xs">
              {chat.error}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-ink-200 bg-white">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />

          {chat.pendingImage && (
            <div className="flex items-center gap-2 px-3 pt-2">
              <img
                src={chat.pendingImage}
                alt="pending"
                className="w-14 h-14 rounded-xl object-cover border border-ink-200"
              />
              <button
                onClick={() => chat.setPendingImage(null)}
                className="flex items-center justify-center w-6 h-6 rounded-full bg-tiffany-100 text-tiffany-700 hover:bg-tiffany-200 transition-colors"
                title="Remove image"
              >
                {RemoveIcon}
              </button>
            </div>
          )}

          <div className="flex items-end gap-2 px-3 py-3">
            <button
              onClick={handleAttach}
              disabled={!serverRunning || chat.sending}
              className="flex items-center justify-center w-10 h-10 shrink-0 rounded-2xl border border-ink-200 text-ink-600 hover:border-tiffany-400 hover:text-tiffany-600 disabled:opacity-50 transition-all"
              title="Attach image"
            >
              {AttachIcon}
            </button>
            <textarea
              ref={inputRef}
              rows={2}
              placeholder="Type a message..."
              onKeyDown={handleKeyDown}
              disabled={!serverRunning || chat.sending}
              className="flex-1 px-3 py-2 bg-tiffany-50/40 border border-tiffany-200/60 rounded-2xl text-ink-900 text-sm placeholder-ink-500/40 focus:outline-none focus:border-tiffany-500 focus:ring-2 focus:ring-tiffany-500/30 transition-all resize-none disabled:opacity-50"
            />
            {chat.sending ? (
              <button
                onClick={() => {
                  chat.stop();
                  fetch(`${API_BASE}/api/render/cancel`, {
                    method: "POST",
                  }).catch(() => {});
                }}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white text-sm font-semibold rounded-2xl transition-all duration-150 shadow-sm"
              >
                {StopIcon}
                Stop
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!canSend}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-tiffany-500 hover:bg-tiffany-600 active:bg-tiffany-700 disabled:bg-ink-200 disabled:text-ink-500 text-ink-950 text-sm font-semibold rounded-2xl transition-all duration-150 shadow-glow"
              >
                {SendIcon}
                Send
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Session delete confirmation modal */}
      {confirmDeleteSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-3xl shadow-card p-6 w-80">
            <h3 className="text-sm font-semibold text-ink-900 mb-2">
              Delete Session
            </h3>
            <p className="text-xs text-ink-600 mb-4">
              Are you sure you want to delete this chat session?
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDeleteSession(null)}
                className="px-3 py-2 text-xs font-medium rounded-xl border border-ink-200 text-ink-600 hover:bg-ink-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteSessionAction}
                className="px-3 py-2 text-xs font-medium rounded-xl bg-red-500 hover:bg-red-600 text-white transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image preview modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-8"
          onClick={() => setPreviewImage(null)}
        >
          <button
            onClick={() => setPreviewImage(null)}
            className="absolute top-4 right-4 flex items-center justify-center w-9 h-9 rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors"
            title="Close"
          >
            {CloseIcon}
          </button>
          <img
            src={previewImage}
            alt="preview"
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-full rounded-xl shadow-2xl object-contain"
          />
        </div>
      )}
    </div>
  );
}
