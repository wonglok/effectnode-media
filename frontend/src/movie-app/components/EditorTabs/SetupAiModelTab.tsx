import { useEffect, type ReactNode } from "react";
import { useAiModelStore, type AiModelId } from "../../stores/aiModelStore";

const DownloadIcon = (
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
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const InstallIcon = (
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
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </svg>
);

const CheckIcon = (
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

const AlertIcon = (
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

const SpinnerIcon = (
  <svg
    className="animate-spin"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
    <path d="M12 2a10 10 0 0 1 10 10" strokeOpacity="0.75" />
  </svg>
);

const RefreshIcon = (
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
    <polyline points="23 4 23 10 17 10" />
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
  </svg>
);

const ChipIcon = (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="4" y="4" width="16" height="16" rx="2" ry="2" />
    <rect x="9" y="9" width="6" height="6" />
    <line x1="9" y1="1" x2="9" y2="4" />
    <line x1="15" y1="1" x2="15" y2="4" />
    <line x1="9" y1="20" x2="9" y2="23" />
    <line x1="15" y1="20" x2="15" y2="23" />
    <line x1="20" y1="9" x2="23" y2="9" />
    <line x1="20" y1="14" x2="23" y2="14" />
    <line x1="1" y1="9" x2="4" y2="9" />
    <line x1="1" y1="14" x2="4" y2="14" />
  </svg>
);

function StatusBadge({
  value,
  okText = "Downloaded",
  missingText = "Not downloaded",
}: {
  value: boolean | null;
  okText?: string;
  missingText?: string;
}) {
  if (value === null) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-ink-500">
        {SpinnerIcon}
        Checking…
      </span>
    );
  }
  if (value) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
        {CheckIcon}
        {okText}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600">
      {AlertIcon}
      {missingText}
    </span>
  );
}

function ModelRow({
  name,
  desc,
  children,
}: {
  name: string;
  desc: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-ink-200 bg-white px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-sm text-ink-900">{name}</p>
        <p className="mt-0.5 text-xs text-ink-500">{desc}</p>
      </div>
      {children}
    </div>
  );
}

const DOWNLOAD_MODELS: {
  id: AiModelId;
  name: string;
  desc: string;
}[] = [
  {
    id: "z-image",
    name: "AbstractFramework/z-image-turbo-8bit",
    desc: "Text-to-image",
  },
  {
    id: "flux",
    name: "AbstractFramework/flux.2-klein-4b-8bit",
    desc: "Character, place & scene images",
  },
  {
    id: "seedvr2",
    name: "AbstractFramework/seedvr2-7b-8bit",
    desc: "Video generation (SeedVR2)",
  },
  {
    id: "ltx",
    name: "dgrauet/ltx-2.3-mlx-q8",
    desc: "Video generation",
  },
  {
    id: "ltx-base",
    name: "dgrauet/ltx-2.3-mlx",
    desc: "Video generation (full precision)",
  },
  {
    id: "tts",
    name: "Qwen/Qwen3-TTS-12Hz-1.7B-Base",
    desc: "Voice-over & speech",
  },
  {
    id: "gemma",
    name: "mlx-community/gemma-4-e4b-it-8bit",
    desc: "Story planning & dialogue (LLM)",
  },
  {
    id: "dots-tts",
    name: "shraey/dots-tts-mlx (int4)",
    desc: "Advanced voice clone (dots-tts)",
  },
];

export default function SetupAiModelTab() {
  const store = useAiModelStore();

  useEffect(() => {
    store.checkStatus();
    const interval = setInterval(() => store.checkStatus(), 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const busy = store.downloading !== null;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-tiffany-600">{ChipIcon}</span>
        <h2 className="text-base font-semibold text-ink-900">AI Models</h2>
        <button
          onClick={() => store.checkStatus()}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border border-ink-200 text-ink-600 hover:border-ink-300 hover:text-ink-900 transition-colors"
        >
          {RefreshIcon}
          Refresh
        </button>
      </div>

      {/* Engines */}
      <section>
        <h3 className="mb-2 text-sm font-semibold text-ink-900">Engines</h3>
        <div className="space-y-2">
          <ModelRow
            name="mlx-gen"
            desc="Image generation engine (z-image · flux)"
          >
            <StatusBadge
              value={store.mlxgenInstalled}
              okText="Installed"
              missingText="Not installed"
            />
            <button
              onClick={() => store.installTool("mlxgen")}
              disabled={busy}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-tiffany-500 px-3 py-1.5 text-xs font-medium text-tiffany-700 transition-colors hover:bg-tiffany-50 disabled:opacity-50"
            >
              {store.downloading === "mlxgen" ? SpinnerIcon : InstallIcon}
              {store.downloading === "mlxgen" ? "Installing…" : "Install"}
            </button>
          </ModelRow>

          <ModelRow name="mlx-vlm" desc="LLM server (gemma) for story planning">
            <StatusBadge
              value={store.mlxVlmInstalled}
              okText="Installed"
              missingText="Not installed"
            />
            <button
              onClick={() => store.installTool("mlx-vlm")}
              disabled={busy}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-tiffany-500 px-3 py-1.5 text-xs font-medium text-tiffany-700 transition-colors hover:bg-tiffany-50 disabled:opacity-50"
            >
              {store.downloading === "mlx-vlm" ? SpinnerIcon : InstallIcon}
              {store.downloading === "mlx-vlm" ? "Installing…" : "Install"}
            </button>
          </ModelRow>

          <ModelRow name="huggingface-cli" desc="HF CLI for downloading models">
            <StatusBadge
              value={store.hfInstalled}
              okText="Installed"
              missingText="Not installed"
            />
            <button
              onClick={() => store.installTool("hf-cli")}
              disabled={busy}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-tiffany-500 px-3 py-1.5 text-xs font-medium text-tiffany-700 transition-colors hover:bg-tiffany-50 disabled:opacity-50"
            >
              {store.downloading === "hf-cli" ? SpinnerIcon : InstallIcon}
              {store.downloading === "hf-cli" ? "Installing…" : "Install"}
            </button>
          </ModelRow>
        </div>
      </section>

      {/* Models */}
      <section>
        <h3 className="mb-2 text-sm font-semibold text-ink-900">Models</h3>
        <div className="space-y-2">
          {DOWNLOAD_MODELS.map((m) => {
            const downloaded =
              m.id === "z-image"
                ? store.zImageDownloaded
                : m.id === "flux"
                  ? store.fluxDownloaded
                  : m.id === "seedvr2"
                    ? store.seedvr2Downloaded
                    : m.id === "ltx"
                      ? store.ltxDownloaded
                      : m.id === "ltx-base"
                        ? store.ltxBaseDownloaded
                        : m.id === "gemma"
                          ? store.gemmaDownloaded
                          : m.id === "dots-tts"
                            ? store.dotsTtsDownloaded
                            : store.ttsDownloaded;
            return (
              <ModelRow key={m.id} name={m.name} desc={m.desc}>
                <StatusBadge value={downloaded} />
                <button
                  onClick={() => store.downloadModel(m.id)}
                  disabled={busy}
                  className="flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-tiffany-500 px-3 py-1.5 text-xs font-medium text-ink-950 transition-colors hover:bg-tiffany-600 disabled:opacity-50"
                >
                  {store.downloading === m.id ? SpinnerIcon : DownloadIcon}
                  {store.downloading === m.id ? "Downloading…" : "Download"}
                </button>
              </ModelRow>
            );
          })}
        </div>
      </section>

      {/* Error */}
      {store.error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/70 px-4 py-3 text-xs text-rose-600">
          {store.error}
        </div>
      )}

      {/* Download logs */}
      {store.logs.length > 0 && (
        <div className="rounded-2xl border border-ink-200 bg-ink-50 p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-500">
            Output
          </p>
          <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-ink-700">
            {store.logs.join("")}
          </pre>
        </div>
      )}
    </div>
  );
}
