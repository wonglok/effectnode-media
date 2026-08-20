import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useLogStore, type LogEntry } from "./stores/logStore";

interface StepStatus {
  step: string;
  label: string;
  status: "pending" | "running" | "completed" | "error";
  error?: string;
}

function SetupPage({ port = 8765 }) {
  const [steps, setSteps] = useState<StepStatus[]>([]);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const addLog = useLogStore((s) => s.addLog);
  const logs = useLogStore((s) => s.logs);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const eventSource = new EventSource(`http://localhost:${port}/api/setup`);

    eventSource.addEventListener("progress", (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setSteps((prev) => {
        const existing = prev.findIndex((s) => s.step === data.step);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = {
            step: data.step,
            label: data.label,
            status: data.status,
            error: data.error,
          };
          return updated;
        }
        return [
          ...prev,
          {
            step: data.step,
            label: data.label,
            status: data.status,
            error: data.error,
          },
        ];
      });
    });

    eventSource.addEventListener("error", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setError(data.error);
      } catch {
        setError("Setup failed");
      }
      eventSource.close();
    });

    eventSource.addEventListener("complete", (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      console.log("Setup complete:", data);
      setComplete(true);

      if (data.success) {
        navigate("/app");
      }

      eventSource.close();
    });

    eventSource.addEventListener("log", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        addLog({
          message: data.text ?? JSON.stringify(data),
          level: data.level ?? "info",
        });
      } catch {
        addLog({ message: e.data, level: "info" });
      }
    });

    eventSource.onerror = () => {
      setError("Connection lost");
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [navigate, addLog]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const StatusIcon = ({ status }: { status: StepStatus["status"] }) => {
    switch (status) {
      case "running":
        return (
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle
              cx="12"
              cy="12"
              r="10"
              strokeDasharray="32"
              strokeDashoffset="32"
            >
              <animate
                attributeName="stroke-dashoffset"
                from="64"
                to="0"
                dur="1.5s"
                repeatCount="indefinite"
              />
            </circle>
          </svg>
        );
      case "completed":
        return (
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#22c55e"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M8 12l3 3 5-5" />
          </svg>
        );
      case "error":
        return (
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#ef4444"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M15 9l-6 6M9 9l6 6" />
          </svg>
        );
      default:
        return (
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#9ca3af"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
          </svg>
        );
    }
  };

  const LogIcon = ({ level }: { level: LogEntry["level"] }) => {
    switch (level) {
      case "error":
        return (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#ef4444"
            strokeWidth="2"
            className="shrink-0"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M15 9l-6 6M9 9l6 6" />
          </svg>
        );
      case "warn":
        return (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#f59e0b"
            strokeWidth="2"
            className="shrink-0"
          >
            <path d="M12 2L2 22h20L12 2z" />
            <line x1="12" y1="9" x2="12" y2="14" />
            <circle cx="12" cy="18" r="0.5" fill="#f59e0b" />
          </svg>
        );
      default:
        return (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#6b7280"
            strokeWidth="2"
            className="shrink-0"
          >
            <circle cx="12" cy="12" r="3" />
            <circle cx="12" cy="12" r="10" />
          </svg>
        );
    }
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString();
  };

  return (
    <div className="flex flex-col h-screen p-8 font-sans bg-ink-50 text-ink-800">
      <h2 className="text-lg font-semibold mb-4 text-ink-900">
        Media Studio Setup
      </h2>

      {error && <div className="text-red-600 mb-4">Error: {error}</div>}
      {complete && !error && (
        <div className="text-ink-600 mb-4 font-bold">
          Setup complete! Server running on port {port}
        </div>
      )}
      <div className="mb-4">
        {steps.map((step, i) => (
          <div
            key={i}
            className="flex items-center gap-2 py-2 transition-opacity"
            style={{ opacity: step.status === "pending" ? 0.5 : 1 }}
          >
            <StatusIcon status={step.status} />
            <span className="text-sm">{step.label}</span>
          </div>
        ))}
      </div>
      {/* Log display panel */}
      <div className="flex-1 flex flex-col min-h-0 border border-ink-200 rounded-2xl overflow-hidden bg-white shadow-card">
        <div className="flex items-center justify-between px-4 py-2.5 bg-ink-50 border-b border-ink-200">
          <span className="text-xs font-semibold text-ink-600/80 uppercase tracking-wider">
            Logs
          </span>
          <span className="text-xs text-ink-500">{logs.length} entries</span>
        </div>
        <div className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed">
          {logs.length === 0 ? (
            <div className="text-ink-500 italic">Waiting for logs...</div>
          ) : (
            logs.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start gap-2 py-0.5 hover:bg-ink-100 rounded px-1"
              >
                <LogIcon level={entry.level} />
                <span className="text-ink-500 shrink-0 select-none">
                  {formatTime(entry.timestamp)}
                </span>
                <span
                  className={
                    entry.level === "error"
                      ? "text-red-600"
                      : entry.level === "warn"
                        ? "text-amber-600"
                        : "text-ink-700"
                  }
                >
                  {entry.message}
                </span>
              </div>
            ))
          )}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  );
}

export default SetupPage;
