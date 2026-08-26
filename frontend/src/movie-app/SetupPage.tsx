import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useLogStore, type LogEntry } from "./stores/logStore";
import Aurora from "./components/Aurora";

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
    const eventSource = new EventSource(`/api/setup`);

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
            stroke="#4fc3bc"
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
            stroke="#0abab5"
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
            stroke="#fb7185"
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
            stroke="#83a0a7"
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
            stroke="#fb7185"
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
            stroke="#fbbf24"
            strokeWidth="2"
            className="shrink-0"
          >
            <path d="M12 2L2 22h20L12 2z" />
            <line x1="12" y1="9" x2="12" y2="14" />
            <circle cx="12" cy="18" r="0.5" fill="#fbbf24" />
          </svg>
        );
      default:
        return (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#5e7c83"
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
    <div className="relative min-h-screen">
      <Aurora />
      <div className="relative z-10 mx-auto w-full max-w-3xl px-6 py-12">
        {/* Hero */}
        <header>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-tiffany-600">
            EffectNode Media
          </p>
          <h1 className="mt-3 font-display text-4xl font-light leading-[1.06] text-ink-900">
            Setting up{" "}
            <span className="wordmark font-medium italic">your studio</span>
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-ink-600/80">
            Gathering models and starting the local server. The first run takes
            a minute.
          </p>
        </header>

        {error && (
          <div className="mt-8 rounded-2xl border border-rose-200 bg-rose-50/70 px-4 py-3 text-sm text-rose-600 backdrop-blur-sm">
            Error: {error}
          </div>
        )}
        {complete && !error && (
          <div className="glass mt-8 rounded-2xl px-4 py-3 text-sm font-medium text-tiffany-700 shadow-card">
            Setup complete — opening your studio…
          </div>
        )}

        {/* Checks */}
        <div className="glass mt-8 rounded-3xl p-6 shadow-card">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-500">
            Checks
          </p>
          <div className="mt-2">
            {steps.length === 0 ? (
              <p className="py-2 text-sm italic text-ink-500/70">
                Starting the local server…
              </p>
            ) : (
              steps.map((step, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2.5 py-2 transition-opacity"
                  style={{ opacity: step.status === "pending" ? 0.45 : 1 }}
                >
                  <StatusIcon status={step.status} />
                  <span className="text-sm text-ink-800">{step.label}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Log console — the film-editing-bay contrast inside the dream */}
        <div className="glass-dark mt-5 flex min-h-0 flex-col overflow-hidden rounded-3xl shadow-card">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-tiffany-300/80">
              Logs
            </span>
            <span className="text-xs text-ink-400">
              {logs.length} {logs.length === 1 ? "entry" : "entries"}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-5 font-mono text-xs leading-relaxed">
            {logs.length === 0 ? (
              <div className="italic text-ink-400">Waiting for logs…</div>
            ) : (
              logs.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start gap-2 rounded px-1 py-0.5 hover:bg-white/5"
                >
                  <LogIcon level={entry.level} />
                  <span className="shrink-0 select-none text-ink-400">
                    {formatTime(entry.timestamp)}
                  </span>
                  <span
                    className={
                      entry.level === "error"
                        ? "text-rose-300"
                        : entry.level === "warn"
                          ? "text-amber-300"
                          : "text-tiffany-100"
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
    </div>
  );
}

export default SetupPage;
