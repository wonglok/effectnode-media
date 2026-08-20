import { useEffect, useRef } from "react";
import { useGenerationStore } from "../../stores/generationStore";

const MODEL_PRESETS = [
  "mlx-community/gemma-4-e2b-it-8bit",
  "mlx-community/gemma-4-e4b-it-8bit",
  "mlx-community/gemma-4-26b-a4b-it-8bit",
];

const InstallIcon = (
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
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </svg>
);

const PlayIcon = (
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
    <polygon points="6 3 20 12 6 21 6 3" />
  </svg>
);

const StopIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <rect x="5" y="5" width="14" height="14" rx="2" />
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

const CheckCircleIcon = (
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
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const AlertCircleIcon = (
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
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

const ExternalLinkIcon = (
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
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

export function OnlyStartButton() {
  const store = useGenerationStore();
  // const serverUrl = `http://localhost:${store.agent.port}`;

  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        {/* <div>
          <label className="block text-xs font-medium text-ink-700 mb-1.5">
            Port
          </label>
          <input
            type="number"
            min={1}
            max={65535}
            value={store.agent.port}
            onChange={(e) => store.setAgentPort(Number(e.target.value))}
            disabled={store.agent.serverRunning || store.agent.starting}
            className="w-32 px-3 py-2 bg-ink-50 border border-ink-200 rounded-xl text-ink-900 text-sm focus:outline-none focus:border-tiffany-500 focus:ring-2 focus:ring-tiffany-500/30 transition-all disabled:opacity-50"
          />
        </div> */}

        {store.agent.serverRunning || store.agent.starting ? (
          <button
            onClick={() => store.stopAgentServer()}
            className="flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-xl border transition-all bg-red-50 border-red-200 text-red-600 hover:border-red-300"
          >
            {StopIcon}
            Stop Server
          </button>
        ) : (
          <button
            onClick={() => store.startAgentServer()}
            disabled={store.agent.installing || store.agent.installed === false}
            className="flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-xl border transition-all bg-white border-ink-200 text-ink-600 hover:border-ink-300 disabled:opacity-50"
          >
            {PlayIcon}
            Start Server
          </button>
        )}
      </div>
    </>
  );
}

/**
 * Shared mlx-vlm LLM server management panel (Setup + Server sections).
 * Both the Agent page and the References-to-Video page reuse this so they
 * control the same single backend server process.
 */
export default function MlxVlmServerPanel() {
  const store = useGenerationStore();
  const serverLogsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    store.checkAgentStatus();
    store.checkServerOnline();
    const interval = setInterval(() => {
      store.checkServerOnline();
    }, 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (serverLogsRef.current) {
      serverLogsRef.current.scrollTop = serverLogsRef.current.scrollHeight;
    }
  }, [store.agent.serverLogs]);

  const serverUrl = `http://localhost:${store.agent.port}`;
  const modelOptions = MODEL_PRESETS.includes(store.agent.model)
    ? MODEL_PRESETS
    : [store.agent.model, ...MODEL_PRESETS];

  // ========== SVG Icons ==========

  const InstallIcon = (
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
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );

  const PlayIcon = (
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
      <polygon points="6 3 20 12 6 21 6 3" />
    </svg>
  );

  const StopIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <rect x="5" y="5" width="14" height="14" rx="2" />
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

  const CheckCircleIcon = (
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
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );

  const AlertCircleIcon = (
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
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );

  const ExternalLinkIcon = (
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
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );

  const renderStatus = (
    value: boolean | null,
    okText: string,
    missingText: string,
  ) => {
    if (value === null) {
      return (
        <span className="inline-flex items-center gap-1.5 text-ink-500">
          {SpinnerIcon}
          Checking...
        </span>
      );
    }
    if (value) {
      return (
        <span className="inline-flex items-center gap-1.5 text-emerald-600">
          {CheckCircleIcon}
          {okText}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-amber-600">
        {AlertCircleIcon}
        {missingText}
      </span>
    );
  };

  return (
    <>
      {/* ===== Install mlx-vlm ===== */}
      <div>
        <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
          Setup
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => store.installMlxVlm()}
            disabled={store.agent.installing}
            className="flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-xl border transition-all bg-white border-ink-200 text-ink-600 hover:border-ink-300 disabled:opacity-50"
          >
            {store.agent.installing ? SpinnerIcon : InstallIcon}
            Install mlx-vlm
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2 text-xs font-medium">
          {renderStatus(
            store.agent.installed,
            "mlx-vlm installed",
            "mlx-vlm not installed",
          )}
        </div>

        {store.agent.installingLogs.length > 0 && (
          <div className="mt-2 p-4 bg-ink-50 border border-ink-200 rounded-2xl max-h-32 overflow-y-auto">
            <pre className="text-xs text-ink-600 font-mono whitespace-pre-wrap">
              {store.agent.installingLogs.join("")}
            </pre>
          </div>
        )}
        {store.agent.installingError && (
          <div className="mt-2 p-4 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-xs">
            {store.agent.installingError}
          </div>
        )}
      </div>

      {/* ===== Server ===== */}
      <div>
        <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
          Server
        </label>

        <div className="flex flex-wrap items-end gap-3 mb-3">
          <div className="flex-1 min-w-[260px]">
            <label className="block text-xs font-medium text-ink-700 mb-1.5">
              Model
            </label>
            <div className=" gap-2 mb-2">
              <select
                value={store.agent.model}
                onChange={(e) => store.setAgentModel(e.target.value)}
                disabled={store.agent.serverRunning || store.agent.starting}
                title="Choose a model"
                className="shrink-0 w-[350px]  px-2 py-2 bg-ink-50 border border-ink-200 rounded-xl text-ink-900 text-sm focus:outline-none focus:border-tiffany-500 focus:ring-2 focus:ring-tiffany-500/30 transition-all disabled:opacity-50 cursor-pointer"
              >
                {modelOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className=" gap-2">
              <input
                value={store.agent.model}
                onChange={(e) => store.setAgentModel(e.target.value)}
                disabled={store.agent.serverRunning || store.agent.starting}
                title="enter a model name"
                className="shrink-0 w-[350px]  px-2 py-2 bg-ink-50 border border-ink-200 rounded-xl text-ink-900 text-sm focus:outline-none focus:border-tiffany-500 focus:ring-2 focus:ring-tiffany-500/30 transition-all disabled:opacity-50 cursor-pointer"
              ></input>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-ink-700 mb-1.5">
              Port
            </label>
            <input
              type="number"
              min={1}
              max={65535}
              value={store.agent.port}
              onChange={(e) => store.setAgentPort(Number(e.target.value))}
              disabled={store.agent.serverRunning || store.agent.starting}
              className="w-32 px-3 py-2 bg-ink-50 border border-ink-200 rounded-xl text-ink-900 text-sm focus:outline-none focus:border-tiffany-500 focus:ring-2 focus:ring-tiffany-500/30 transition-all disabled:opacity-50"
            />
          </div>

          {store.agent.serverRunning || store.agent.starting ? (
            <button
              onClick={() => store.stopAgentServer()}
              className="flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-xl border transition-all bg-red-50 border-red-200 text-red-600 hover:border-red-300"
            >
              {StopIcon}
              Stop Server
            </button>
          ) : (
            <button
              onClick={() => store.startAgentServer()}
              disabled={
                store.agent.installing || store.agent.installed === false
              }
              className="flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-xl border transition-all bg-white border-ink-200 text-ink-600 hover:border-ink-300 disabled:opacity-50"
            >
              {PlayIcon}
              Start Server
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2 text-xs font-medium">
          {store.agent.starting ? (
            <span className="inline-flex items-center gap-1.5 text-ink-500">
              {SpinnerIcon}
              Starting server...
            </span>
          ) : store.agent.serverOnline === true ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-600">
              {CheckCircleIcon}
              Server online at {serverUrl}
            </span>
          ) : store.agent.serverOnline === false ? (
            <span className="inline-flex items-center gap-1.5 text-amber-600">
              {AlertCircleIcon}
              Server offline
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-ink-500">
              {SpinnerIcon}
              Checking server...
            </span>
          )}
          {store.agent.serverOnline === true && (
            <button
              onClick={() => store.openAgentServer()}
              className="inline-flex items-center gap-1.5 text-ink-600 hover:text-ink-900 transition-colors cursor-pointer"
            >
              {ExternalLinkIcon}
              Open {serverUrl}
            </button>
          )}
        </div>

        {store.agent.serverLogs.length > 0 && (
          <div
            ref={serverLogsRef}
            className="mt-2 p-4 bg-ink-50 border border-ink-200 rounded-2xl max-h-48 overflow-y-auto"
          >
            <p className="text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
              Server Logs
            </p>
            <pre className="text-xs text-ink-600 font-mono whitespace-pre-wrap">
              {store.agent.serverLogs.join("")}
            </pre>
          </div>
        )}
        {store.agent.serverError && (
          <div className="mt-2 p-4 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-xs">
            {store.agent.serverError}
          </div>
        )}
      </div>
    </>
  );
}
