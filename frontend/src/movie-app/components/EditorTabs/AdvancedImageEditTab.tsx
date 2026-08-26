import { useEffect, useRef } from "react";
import { useGenerationStore } from "../../stores/generationStore";
import { useProjectStore } from "../../stores/projectStore";
import { useQueueStore } from "../../stores/queueStore";
import {
  useAdvancedImageEditStore,
  RESOLUTIONS,
  STEPS_OPTIONS,
} from "../../stores/advancedImageEditStore";
import TaskQueuePanel from "./TaskQueuePanel";
import TerminalLogPanel from "./TerminalLogPanel";

interface Props {
  projectId: string;
}

export default function AdvancedImageEditTab({ projectId }: Props) {
  const gen = useGenerationStore();
  const adv = useAdvancedImageEditStore();
  const { openFolder } = useProjectStore();
  const queue = useQueueStore();
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    gen.fetchProjectImages(projectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Stream the generation queue so advanced-image-edit tasks surface here.
  useEffect(() => {
    queue.startStreaming(projectId);
    return () => queue.stopStreaming();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Reconcile advanced-image-edit state with the latest queue task state.
  useEffect(() => {
    for (const task of queue.tasks) adv.applyQueueTask(task);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue.tasks, projectId]);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      const path = await gen.uploadImage(projectId, base64, file.name);
      if (path) {
        const { uploadedImageFilename, uploadedImageUrl } =
          useGenerationStore.getState();
        adv.setImage({
          filename: uploadedImageFilename || file.name,
          url: uploadedImageUrl || "",
        });
        await gen.fetchProjectImages(projectId);
      }
    };
    reader.readAsDataURL(file);
  };

  const busy = adv.generating || gen.uploading;

  // ========== SVG Icons ==========

  const AdvancedImageEditIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      <path d="M19 3v4" />
      <path d="M21 5h-4" />
    </svg>
  );

  const UploadIcon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );

  const SparkleIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );

  const SpinnerIcon = (
    <svg className="animate-spin text-tiffany-600" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" strokeOpacity="0.75" />
    </svg>
  );

  const FolderIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );

  return (
    <div className="flex flex-col gap-7">
      <div className="flex items-center gap-2">
        <span className="text-tiffany-600">{AdvancedImageEditIcon}</span>
        <h2 className="text-base font-semibold text-ink-900">
          Advanced Image Edit
        </h2>
      </div>

      <TaskQueuePanel projectId={projectId} />
      <TerminalLogPanel />

      {/* ===== Input image picker ===== */}
      <div>
        <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
          Input Image
        </label>
        <div className="flex items-center gap-2">
          <button
            onClick={() => imageInputRef.current?.click()}
            disabled={busy}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-xl border border-ink-200 bg-white text-ink-600 hover:border-ink-300 disabled:opacity-50 transition-colors"
          >
            {UploadIcon}
            Upload Image
          </button>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            onChange={handleUpload}
            className="hidden"
          />
          {adv.image && (
            <span className="truncate text-xs text-ink-600">
              {adv.image.filename}
            </span>
          )}
        </div>

        {gen.uploading && (
          <p className="text-xs text-ink-600 mt-1">Uploading…</p>
        )}
        {gen.uploadError && (
          <p className="text-xs text-red-600 mt-1">{gen.uploadError}</p>
        )}

        {gen.projectImagesLoading ? (
          <p className="text-xs text-ink-500 italic py-4 text-center">
            Loading images…
          </p>
        ) : gen.projectImages.length === 0 ? (
          <p className="text-xs text-ink-500 italic py-4 text-center border border-dashed border-ink-200 rounded-2xl">
            No images yet. Upload an image above.
          </p>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-2 p-1 mt-2">
            {gen.projectImages.map((img) => {
              const isSelected = adv.image?.filename === img.filename;
              const fullUrl = img.url.startsWith("http") ? img.url : img.url;
              return (
                <button
                  key={`${img.source}-${img.filename}`}
                  onClick={() =>
                    adv.setImage({ filename: img.filename, url: fullUrl })
                  }
                  disabled={adv.generating}
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
      </div>

      {/* ===== Prompt ===== */}
      <div>
        <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
          Edit Prompt
        </label>
        <textarea
          value={adv.prompt}
          onChange={(e) => adv.setPrompt(e.target.value)}
          placeholder="e.g. make the character stand naturally and have a victory pose with his hand with a happy smile. white background"
          rows={3}
          disabled={adv.generating}
          className="w-full px-4 py-3 bg-ink-50 border border-ink-200 rounded-2xl text-ink-900 text-sm placeholder-ink-500/40 focus:outline-none focus:border-tiffany-500 focus:ring-2 focus:ring-tiffany-500/30 transition-all resize-none disabled:opacity-50"
        />
      </div>

      {/* ===== Aspect Ratio ===== */}
      <div>
        <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
          Aspect Ratio
        </label>
        <div className="flex flex-wrap gap-1.5">
          {(["1:1", "16:9", "9:16", "4:3", "3:4"] as const).map((ratio) => (
            <button
              key={ratio}
              onClick={() => adv.setAspectRatio(ratio)}
              disabled={adv.generating}
              className={`px-3 py-1 text-xs font-medium rounded-xl border transition-all ${
                adv.aspectRatio === ratio
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
        <div className="flex flex-wrap gap-1.5">
          {RESOLUTIONS.map((res) => (
            <button
              key={res}
              onClick={() => adv.setResolution(res)}
              disabled={adv.generating}
              className={`px-3 py-1 text-xs font-medium rounded-xl border transition-all ${
                adv.resolution === res
                  ? "bg-ink-100 border-ink-300 text-ink-800"
                  : "bg-white border-ink-200 text-ink-600 hover:border-ink-300"
              } disabled:opacity-50`}
            >
              {res}px
            </button>
          ))}
        </div>
      </div>

      {/* ===== Steps ===== */}
      <div>
        <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
          Steps
        </label>
        <div className="flex flex-wrap gap-1.5">
          {STEPS_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => adv.setSteps(s)}
              disabled={adv.generating}
              className={`px-3 py-1 text-xs font-medium rounded-xl border transition-all ${
                adv.steps === s
                  ? "bg-ink-100 border-ink-300 text-ink-800"
                  : "bg-white border-ink-200 text-ink-600 hover:border-ink-300"
              } disabled:opacity-50`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* ===== Seed ===== */}
      <div>
        <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
          Seed
        </label>
        <input
          type="number"
          step={1}
          value={adv.seed}
          onChange={(e) => adv.setSeed(Number(e.target.value))}
          disabled={adv.generating}
          className="w-32 px-4 py-2.5 bg-ink-50 border border-ink-200 rounded-2xl text-ink-900 text-sm placeholder-ink-500/40 focus:outline-none focus:border-tiffany-500 focus:ring-2 focus:ring-tiffany-500/30 transition-all disabled:opacity-50"
        />
      </div>

      {/* ===== Low RAM ===== */}
      <div className="flex items-center gap-2">
        <button
          role="switch"
          aria-checked={adv.lowRam}
          onClick={() => adv.setLowRam(!adv.lowRam)}
          disabled={adv.generating}
          className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
            adv.lowRam ? "bg-tiffany-500" : "bg-ink-200"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
              adv.lowRam ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
        <span className="text-xs font-medium text-ink-700">Low RAM</span>
      </div>

      {/* ===== Generate ===== */}
      {adv.generating ? (
        <div className="flex items-center gap-2 px-4 py-3 bg-ink-50 border border-ink-200 rounded-2xl">
          {SpinnerIcon}
          <span className="text-sm font-medium text-ink-700">
            Generating…
          </span>
        </div>
      ) : (
        <button
          onClick={() => adv.generate(projectId)}
          disabled={busy || !adv.image || !adv.prompt.trim()}
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
      {adv.error && (
        <div className="p-5 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-sm">
          {adv.error}
        </div>
      )}

      {/* ===== Result ===== */}
      {adv.result && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-ink-700 uppercase tracking-wider">
              Generated Image
            </label>
            <button
              onClick={() => adv.clearResult()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border border-ink-200 text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors"
            >
              Remove
            </button>
          </div>
          <div className="rounded-2xl overflow-hidden border border-ink-200 shadow-card inline-block">
            <img src={adv.result} alt="Generated" className="max-w-full h-auto" />
          </div>
        </div>
      )}
    </div>
  );
}
