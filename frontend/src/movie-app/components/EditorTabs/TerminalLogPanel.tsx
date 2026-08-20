import { useEffect, useRef } from "react";
import { useQueueStore } from "../../stores/queueStore";

const TerminalIcon = (
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
    <polyline points="4 17 10 11 4 5" />
    <line x1="12" y1="19" x2="20" y2="19" />
  </svg>
);

export default function TerminalLogPanel() {
  const logs = useQueueStore((s) => s.logs);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the view pinned to the bottom as new terminal output streams in.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-tiffany-600">{TerminalIcon}</span>
        <h3 className="text-sm font-semibold text-ink-900">Terminal Log</h3>
      </div>

      <div
        ref={scrollRef}
        className="p-3 bg-ink-950 border border-ink-800 rounded-xl max-h-72 overflow-y-auto font-mono text-xs leading-relaxed text-ink-100"
      >
        {logs ? (
          <pre className="whitespace-pre-wrap break-words">{logs}</pre>
        ) : (
          <span className="text-ink-500 italic">No logs yet.</span>
        )}
      </div>
    </div>
  );
}
