import { useEffect, useState } from "react";
import { useGenerationStore } from "../../stores/generationStore";
import { useProjectStore } from "../../stores/projectStore";

interface Props {
  projectId: string;
}

export default function TextToImageTab({ projectId }: Props) {
  const store = useGenerationStore();
  const { openFolder } = useProjectStore();
  const [preview, setPreview] = useState<{
    url: string;
    filename: string;
  } | null>(null);

  useEffect(() => {
    store.hydrateTextToImage(projectId);
    store.checkTextToImageStatus();
    store.fetchProjectImages(projectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Close the preview modal on Escape.
  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreview(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview]);

  const busy =
    store.textToImage.generating ||
    store.textToImage.installing ||
    store.textToImage.downloading;

  const generatedImages = store.projectImages.filter(
    (img) => img.source === "generated",
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

  // ========== SVG Icons ==========

  const ImageIcon = (
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
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );

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

  const DownloadIcon = (
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
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );

  const SparkleIcon = (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
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

  const CloseIcon = (
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
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );

  const FolderIcon = (
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
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );

  return (
    <div className="flex flex-col gap-7">
      <div className="flex items-center gap-2">
        <span className="text-tiffany-600">{ImageIcon}</span>
        <h2 className="text-base font-semibold text-ink-900">
          Text-to-Image Generation
        </h2>
      </div>

      {/* ===== Presets ===== */}
      <div>
        <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
          Presets
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => store.applyTextToImagePreset("prototype")}
            disabled={busy}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-xl border transition-all bg-white border-ink-200 text-ink-600 hover:border-ink-300 disabled:opacity-50"
          >
            Prototype
          </button>
          <button
            onClick={() => store.applyTextToImagePreset("medium")}
            disabled={busy}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-xl border transition-all bg-white border-ink-200 text-ink-600 hover:border-ink-300 disabled:opacity-50"
          >
            Medium
          </button>
          <button
            onClick={() => store.applyTextToImagePreset("optimal")}
            disabled={busy}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-xl border transition-all bg-white border-ink-200 text-ink-600 hover:border-ink-300 disabled:opacity-50"
          >
            Optimal
          </button>
        </div>
        <p className="text-xs text-tiffany-600 mt-1.5">
          Prototype: 1:1 · 320p · 4 steps · faster model. Medium: 1:1 · 720p · 7
          steps · high quality model. Optimal: 1:1 · 1080p · 6 steps · high
          quality model.
        </p>
      </div>

      {/* ===== Setup: install + download model ===== */}
      <div>
        <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
          Model Setup
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => store.installTextToImage()}
            disabled={store.textToImage.installing}
            className="flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-xl border transition-all bg-white border-ink-200 text-ink-600 hover:border-ink-300 disabled:opacity-50"
          >
            {store.textToImage.installing ? SpinnerIcon : InstallIcon}
            Install mlx-gen
          </button>
          <button
            onClick={() => store.downloadTextToImageModel()}
            disabled={store.textToImage.downloading}
            className="flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-xl border transition-all bg-white border-ink-200 text-ink-600 hover:border-ink-300 disabled:opacity-50"
          >
            {store.textToImage.downloading ? SpinnerIcon : DownloadIcon}
            Download z-image Model
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2 text-xs font-medium">
          {renderStatus(
            store.textToImage.mlxgenInstalled,
            "mlx-gen installed",
            "mlx-gen not installed",
          )}
          {renderStatus(
            store.textToImage.zModelDownloaded,
            "z-image model downloaded",
            "z-image model not downloaded",
          )}
        </div>

        {store.textToImage.installingLogs.length > 0 && (
          <div className="mt-2 p-4 bg-ink-50 border border-ink-200 rounded-2xl max-h-32 overflow-y-auto">
            <pre className="text-xs text-ink-600 font-mono whitespace-pre-wrap">
              {store.textToImage.installingLogs.join("")}
            </pre>
          </div>
        )}
        {store.textToImage.installingError && (
          <div className="mt-2 p-4 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-xs">
            {store.textToImage.installingError}
          </div>
        )}

        {store.textToImage.downloadingLogs.length > 0 && (
          <div className="mt-2 p-4 bg-ink-50 border border-ink-200 rounded-2xl max-h-32 overflow-y-auto">
            <pre className="text-xs text-ink-600 font-mono whitespace-pre-wrap">
              {store.textToImage.downloadingLogs.join("")}
            </pre>
          </div>
        )}
        {store.textToImage.downloadingError && (
          <div className="mt-2 p-4 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-xs">
            {store.textToImage.downloadingError}
          </div>
        )}
      </div>

      {/* ===== Prompt ===== */}
      <div>
        <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
          Image Prompt
        </label>
        <textarea
          value={store.textToImage.prompt}
          onChange={(e) => store.setTextToImagePrompt(e.target.value)}
          placeholder="Describe the image to generate, e.g. a little lamb standing in a sunny meadow."
          rows={4}
          disabled={busy}
          className="w-full px-4 py-3 bg-ink-50 border border-ink-200 rounded-2xl text-ink-900 text-sm placeholder-ink-500/40 focus:outline-none focus:border-tiffany-500 focus:ring-2 focus:ring-tiffany-500/30 transition-all resize-none disabled:opacity-50"
        />
      </div>

      {/* ===== Aspect Ratio ===== */}
      <div>
        <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
          Aspect Ratio
        </label>
        <div className="flex flex-wrap gap-2">
          {(["1:1", "16:9", "9:16", "4:3", "3:4"] as const).map((ratio) => (
            <button
              key={ratio}
              onClick={() => store.setTextToImageAspectRatio(ratio)}
              disabled={busy}
              className={`px-4 py-1.5 text-xs font-medium rounded-xl border transition-all ${
                store.textToImage.aspectRatio === ratio
                  ? "bg-ink-100 border-ink-300 text-ink-800"
                  : "bg-white border-ink-200 text-ink-600 hover:border-ink-300"
              } disabled:opacity-50`}
            >
              {ratio}
            </button>
          ))}
        </div>
      </div>

      {/* ===== Resolution ===== */}
      <div>
        <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
          Resolution
        </label>
        <div className="flex flex-wrap gap-2">
          {(
            ["320p", "480p", "512p", "640p", "720p", "1080p", "2048p"] as const
          ).map((res) => (
            <button
              key={res}
              onClick={() => store.setTextToImageResolution(res)}
              disabled={busy}
              className={`px-4 py-1.5 text-xs font-medium rounded-xl border transition-all ${
                store.textToImage.resolution === res
                  ? "bg-ink-100 border-ink-300 text-ink-800"
                  : "bg-white border-ink-200 text-ink-600 hover:border-ink-300"
              } disabled:opacity-50`}
            >
              {res}
            </button>
          ))}
        </div>
      </div>

      {/* ===== Steps ===== */}
      <div>
        <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
          Steps
        </label>
        <div className="flex flex-wrap gap-2">
          {[4, 5, 6, 7, 8, 9, 10, 11, 12].map((s) => (
            <button
              key={s}
              onClick={() => store.setTextToImageSteps(s)}
              disabled={busy}
              className={`px-4 py-1.5 text-xs font-medium rounded-xl border transition-all ${
                store.textToImage.steps === s
                  ? "bg-ink-100 border-ink-300 text-ink-800"
                  : "bg-white border-ink-200 text-ink-600 hover:border-ink-300"
              } disabled:opacity-50`}
            >
              {s} steps
            </button>
          ))}
        </div>
      </div>

      {/* ===== Generate ===== */}
      {store.textToImage.generating ? (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 flex-1 px-4 py-3 bg-ink-50 border border-ink-200 rounded-2xl">
            {SpinnerIcon}
            <span className="text-sm font-medium text-ink-700">
              Generating...
            </span>
          </div>
          <button
            onClick={() => store.cancelGenerate()}
            className="flex items-center justify-center gap-1.5 px-5 py-3 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white text-sm font-semibold rounded-2xl transition-all duration-150 shadow-sm"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <rect x="4" y="4" width="16" height="16" rx="2" />
            </svg>
            Stop
          </button>
        </div>
      ) : (
        <button
          onClick={() => store.generateTextToImage(projectId)}
          disabled={busy || !store.textToImage.prompt.trim()}
          className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-tiffany-500 hover:bg-tiffany-600 active:bg-tiffany-700 disabled:bg-ink-200 disabled:text-ink-500 text-ink-950 text-sm font-semibold rounded-2xl transition-all duration-150 shadow-sm hover:shadow-md disabled:shadow-none"
        >
          {SparkleIcon}
          Generate Image
        </button>
      )}

      {/* ===== Open output folder ===== */}
      <button
        onClick={() => openFolder(projectId, "output")}
        className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-ink-50 hover:bg-ink-200 text-ink-700 text-sm font-medium rounded-2xl border border-ink-200 transition-colors"
      >
        {FolderIcon}
        Open Output Folder
      </button>

      {/* ===== Error ===== */}
      {store.textToImage.error && (
        <div className="p-5 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-sm">
          {store.textToImage.error}
        </div>
      )}

      {/* ===== Logs ===== */}
      {store.textToImage.logs.length > 0 && (
        <div className="p-5 bg-ink-50 border border-ink-200 rounded-2xl max-h-40 overflow-y-auto">
          <p className="text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
            Logs
          </p>
          <pre className="text-xs text-ink-600 font-mono whitespace-pre-wrap">
            {store.textToImage.logs.join("")}
          </pre>
        </div>
      )}

      {/* ===== Result ===== */}
      {store.textToImage.result && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-ink-700 uppercase tracking-wider">
              Generated Image
            </label>
            <button
              onClick={() => store.clearTextToImageResult()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border border-ink-200 text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors"
            >
              {CloseIcon}
              Remove
            </button>
          </div>
          <div className="rounded-2xl overflow-hidden border border-ink-200 shadow-card inline-block">
            <img
              src={store.textToImage.result}
              alt="Generated"
              className="max-w-full h-auto"
            />
          </div>
        </div>
      )}

      {/* ===== Generated Images Grid ===== */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider">
            Generated Images
          </label>
          <button
            onClick={() => openFolder(projectId, "output")}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border border-ink-200 text-ink-600 hover:border-ink-300 hover:text-ink-900 transition-colors"
          >
            {FolderIcon}
            Open Folder
          </button>
        </div>
        {store.projectImagesLoading ? (
          <p className="text-xs text-ink-500 italic py-4 text-center">
            Loading images...
          </p>
        ) : generatedImages.length === 0 ? (
          <p className="text-xs text-ink-500 italic py-4 text-center border border-dashed border-ink-200 rounded-2xl">
            No generated images yet.
          </p>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8 gap-2 p-1">
            {generatedImages.map((img) => {
              const fullUrl = img.url.startsWith("http")
                ? img.url
                : `http://localhost:${(window as any).PORT}${img.url}`;
              return (
                <button
                  key={`${img.source}-${img.filename}`}
                  onClick={() =>
                    setPreview({ url: fullUrl, filename: img.filename })
                  }
                  className="relative rounded-xl border border-ink-200 hover:border-tiffany-500 overflow-hidden transition-all cursor-zoom-in group"
                >
                  <img
                    src={fullUrl}
                    alt={img.filename}
                    className="aspect-square object-cover object-center w-full"
                  />
                  <span className="absolute bottom-0 left-0 right-0 bg-white/80 backdrop-blur-sm px-1.5 py-0.5 text-[10px] text-ink-700 truncate text-center">
                    {img.filename}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ===== Preview Modal ===== */}
      {preview && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-8"
          onClick={() => setPreview(null)}
        >
          <div
            className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={preview.url}
              alt={preview.filename}
              className="max-w-full max-h-[80vh] object-contain rounded-2xl shadow-2xl"
            />
            <span className="text-xs text-white/70 truncate max-w-full">
              {preview.filename}
            </span>
            <button
              onClick={() => setPreview(null)}
              className="absolute -top-3 -right-3 flex items-center justify-center w-9 h-9 bg-white text-ink-700 rounded-full shadow-lg hover:bg-ink-200 transition-colors"
              title="Close (Esc)"
            >
              {CloseIcon}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
