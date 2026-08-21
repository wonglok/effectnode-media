import { useEffect, useRef } from "react";
import { useGenerationStore } from "../../stores/generationStore";
import { useProjectStore } from "../../stores/projectStore";
import { useQueueStore } from "../../stores/queueStore";
import { useAiModelStore } from "../../stores/aiModelStore";
import { useUpscaleStore, type UpscaleMode } from "../../stores/upscaleStore";
import TaskQueuePanel from "./TaskQueuePanel";
import TerminalLogPanel from "./TerminalLogPanel";

interface Props {
  projectId: string;
}

export default function UpscaleTab({ projectId }: Props) {
  const gen = useGenerationStore();
  const { openFolder } = useProjectStore();
  const queue = useQueueStore();
  const ai = useAiModelStore();
  const up = useUpscaleStore();

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    gen.fetchProjectImages(projectId);
    ai.checkStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Stream the generation queue so upscale tasks surface here.
  useEffect(() => {
    queue.startStreaming(projectId);
    return () => queue.stopStreaming();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Reconcile upscale state with the latest queue task state.
  useEffect(() => {
    for (const task of queue.tasks) up.applyQueueTask(task);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue.tasks, projectId]);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const uploadedPath = await gen.uploadImage(
        projectId,
        reader.result as string,
        file.name,
      );
      if (uploadedPath) {
        gen.fetchProjectImages(projectId);
        const { uploadedImageFilename, uploadedImageUrl } =
          useGenerationStore.getState();
        up.setImage({
          filename: uploadedImageFilename || file.name,
          url: uploadedImageUrl || "",
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const busy = up.generating || ai.downloading !== null;

  // ========== SVG Icons ==========

  const UpscaleIcon = (
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
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
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
        <span className="text-tiffany-600">{UpscaleIcon}</span>
        <h2 className="text-base font-semibold text-ink-900">Upscale Media</h2>
        <button
          onClick={() => ai.downloadModel("seedvr2")}
          disabled={ai.downloading !== null}
          className="ml-auto flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-xl border transition-all bg-white border-ink-200 text-ink-600 hover:border-ink-300 disabled:opacity-50"
        >
          {ai.downloading === "seedvr2" ? SpinnerIcon : DownloadIcon}
          {ai.downloading === "seedvr2"
            ? "Downloading…"
            : "Download SeedVR2 Model"}
        </button>
      </div>

      <TaskQueuePanel projectId={projectId} />
      <TerminalLogPanel />

      {/* ===== Model status ===== */}
      <div className="flex items-center gap-1.5 text-xs font-medium">
        {ai.seedvr2Downloaded === null ? (
          <span className="inline-flex items-center gap-1.5 text-ink-500">
            {SpinnerIcon}
            Checking…
          </span>
        ) : ai.seedvr2Downloaded ? (
          <span className="text-emerald-600">✓ SeedVR2 model downloaded</span>
        ) : (
          <span className="text-amber-600">SeedVR2 model not downloaded</span>
        )}
      </div>

      {/* ===== Upload ===== */}
      <div>
        <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
          Upload Image
        </label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleUpload}
          disabled={gen.uploading || up.generating}
          className="inline-block text-sm text-ink-700 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-medium file:bg-ink-100 file:text-ink-700 hover:file:bg-ink-200 file:cursor-pointer file:transition-colors disabled:opacity-50"
        />
        {gen.uploading && (
          <p className="text-xs text-ink-600 mt-1">Uploading...</p>
        )}
        {gen.uploadError && (
          <p className="text-xs text-red-600 mt-1">{gen.uploadError}</p>
        )}
      </div>

      {/* ===== Pick image ===== */}
      <div>
        <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
          Pick Image
        </label>
        {gen.projectImagesLoading ? (
          <p className="text-xs text-ink-500 italic py-4 text-center">
            Loading images...
          </p>
        ) : gen.projectImages.length === 0 ? (
          <p className="text-xs text-ink-500 italic py-4 text-center border border-dashed border-ink-200 rounded-2xl">
            No images yet. Upload one above.
          </p>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8 gap-2 p-1">
            {gen.projectImages.map((img) => {
              const isSelected = up.image?.filename === img.filename;
              const fullUrl = img.url.startsWith("http")
                ? img.url
                : `http://localhost:${(window as any).PORT}${img.url}`;
              return (
                <button
                  key={`${img.source}-${img.filename}`}
                  onClick={() =>
                    up.setImage({ filename: img.filename, url: fullUrl })
                  }
                  disabled={up.generating}
                  className={`relative rounded-xl border-2 overflow-hidden transition-all ${
                    isSelected
                      ? "border-tiffany-500 ring-2 ring-tiffany-500/40"
                      : "border-ink-200 hover:border-ink-300"
                  } disabled:opacity-50`}
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
        {up.image && (
          <p className="text-xs text-ink-600/60 mt-1.5">
            Selected:{" "}
            <span className="font-medium text-ink-700">
              {up.image.filename}
            </span>
          </p>
        )}
      </div>

      {/* ===== Mode ===== */}
      <div>
        <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
          Mode
        </label>
        <div className="flex flex-wrap gap-2">
          {[
            { value: "1x" as UpscaleMode, label: "Refine (1x)" },
            { value: "1000" as UpscaleMode, label: "Upscale to 1000px" },
            { value: "1500" as UpscaleMode, label: "Upscale to 1500px" },
            { value: "2000" as UpscaleMode, label: "Upscale to 2000px" },
            { value: "3000" as UpscaleMode, label: "Upscale to 3000px" },
            { value: "3500" as UpscaleMode, label: "Upscale to 3500px" },
          ].map((m) => (
            <button
              key={m.value}
              onClick={() => up.setMode(m.value)}
              disabled={up.generating}
              className={`px-4 py-1.5 text-xs font-medium rounded-xl border transition-all ${
                up.mode === m.value
                  ? "bg-ink-100 border-ink-300 text-ink-800"
                  : "bg-white border-ink-200 text-ink-600 hover:border-ink-300"
              } disabled:opacity-50`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* ===== Generate ===== */}
      {up.generating ? (
        <div className="flex items-center gap-2 px-4 py-3 bg-ink-50 border border-ink-200 rounded-2xl">
          {SpinnerIcon}
          <span className="text-sm font-medium text-ink-700">Upscaling...</span>
        </div>
      ) : (
        <button
          onClick={() => up.generate(projectId)}
          disabled={busy || !up.image}
          className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-tiffany-500 hover:bg-tiffany-600 active:bg-tiffany-700 disabled:bg-ink-200 disabled:text-ink-500 text-ink-950 text-sm font-semibold rounded-2xl transition-all duration-150 shadow-sm hover:shadow-md disabled:shadow-none"
        >
          {SparkleIcon}
          Upscale Image
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
      {up.error && (
        <div className="p-5 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-sm">
          {up.error}
        </div>
      )}

      {/* ===== Result ===== */}
      {up.result && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-ink-700 uppercase tracking-wider">
              Upscaled Image
            </label>
            <button
              onClick={() => up.clearResult()}
              className="px-3 py-1.5 text-xs font-medium rounded-xl border border-ink-200 text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors"
            >
              Remove
            </button>
          </div>
          <div className="rounded-2xl overflow-hidden border border-ink-200 shadow-card inline-block">
            <img src={up.result} alt="Upscaled" className="max-w-full h-auto" />
          </div>
        </div>
      )}
    </div>
  );
}
