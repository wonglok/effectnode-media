import { useEffect, useRef, useState } from "react";
import { useBatchVideoStore, type BatchRowStatus } from "../../stores/batchVideoStore";
import { useGenerationStore } from "../../stores/generationStore";
import { useProjectStore } from "../../stores/projectStore";

interface Props {
  projectId: string;
}

// ========== SVG Icons ==========

const TableIcon = (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="text-tiffany-600"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <line x1="3" y1="9" x2="21" y2="9" />
    <line x1="3" y1="15" x2="21" y2="15" />
    <line x1="9" y1="3" x2="9" y2="21" />
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

const UploadIcon = (
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
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const ImageIcon = (
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
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
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

const FilmIcon = (
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
    <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
    <line x1="7" y1="2" x2="7" y2="22" />
    <line x1="17" y1="2" x2="17" y2="22" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <line x1="2" y1="7" x2="7" y2="7" />
    <line x1="2" y1="17" x2="7" y2="17" />
    <line x1="17" y1="17" x2="22" y2="17" />
    <line x1="17" y1="7" x2="22" y2="7" />
  </svg>
);

const CloseIcon = (
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
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
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
    <polyline points="20 6 9 17 4 12" />
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

// ========== Status badge ==========

function StatusBadge({ status }: { status: BatchRowStatus }) {
  switch (status) {
    case "uploading":
    case "generating":
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-600">
          {SpinnerIcon}
          {status === "uploading" ? "Uploading" : "Generating"}
        </span>
      );
    case "done":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
          {CheckIcon}
          Done
        </span>
      );
    case "error":
      return (
        <span className="text-xs font-medium text-red-600">Error</span>
      );
    default:
      return (
        <span className="text-xs font-medium text-ink-500">—</span>
      );
  }
}

// ========== Component ==========

export default function BatchVideoTab({ projectId }: Props) {
  const store = useBatchVideoStore();
  const genStore = useGenerationStore();
  const { openFolder } = useProjectStore();

  const logRef = useRef<HTMLDivElement | null>(null);
  const stitchLogRef = useRef<HTMLDivElement | null>(null);
  const [pickRowId, setPickRowId] = useState<string | null>(null);

  // Restore persisted UI state (rows + settings) for the active project,
  // re-loading whenever the project changes.
  useEffect(() => {
    store.hydrate(projectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [store.logs]);

  useEffect(() => {
    if (stitchLogRef.current) {
      stitchLogRef.current.scrollTop = stitchLogRef.current.scrollHeight;
    }
  }, [store.stitchLogs]);

  // Close the picker modal on Escape.
  useEffect(() => {
    if (!pickRowId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPickRowId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickRowId]);

  const openPicker = (rowId: string) => {
    genStore.fetchProjectImages(projectId);
    setPickRowId(rowId);
  };

  const handleImageSelect = async (
    e: React.ChangeEvent<HTMLInputElement>,
    rowId: string,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      const path = await store.uploadRowImage(
        rowId,
        base64,
        file.name,
        projectId,
      );
      if (path) {
        genStore.fetchProjectImages(projectId);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const readyCount = store.rows.filter(
    (r) => r.prompt.trim() && r.imagePath,
  ).length;

  const resultCount = store.rows.filter((r) => r.result).length;

  return (
    <div className="flex flex-col gap-7">
      <div className="flex items-center gap-2">
        {TableIcon}
        <h2 className="text-base font-semibold text-ink-900">
          Batch Video Creation
        </h2>
      </div>

      {/* Shared settings */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Duration */}
        <div>
          <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
            Duration (seconds)
          </label>
          <div className="flex flex-wrap gap-1.5">
            {[0.5, 3, 5, 7.5, 10, 15, 20].map((d) => (
              <button
                key={d}
                onClick={() => store.setDuration(d)}
                disabled={store.running}
                className={`px-3 py-1 text-xs font-medium rounded-xl border transition-all ${
                  store.duration === d
                    ? "bg-ink-100 border-ink-300 text-ink-800"
                    : "bg-white border-ink-200 text-ink-600 hover:border-ink-300"
                } disabled:opacity-50`}
              >
                {d}s
              </button>
            ))}
          </div>
        </div>

        {/* Aspect ratio */}
        <div>
          <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
            Aspect Ratio
          </label>
          <div className="flex flex-wrap gap-1.5">
            {(["1:1", "16:9", "9:16", "4:3", "3:4"] as const).map((ratio) => (
              <button
                key={ratio}
                onClick={() => store.setAspectRatio(ratio)}
                disabled={store.running}
                className={`px-3 py-1 text-xs font-medium rounded-xl border transition-all ${
                  store.aspectRatio === ratio
                    ? "bg-ink-100 border-ink-300 text-ink-800"
                    : "bg-white border-ink-200 text-ink-600 hover:border-ink-300"
                } disabled:opacity-50`}
              >
                {ratio}
              </button>
            ))}
          </div>
        </div>

        {/* Resolution */}
        <div>
          <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
            Resolution
          </label>
          <div className="flex flex-wrap gap-1.5">
            {(["320p", "480p", "576p", "640p", "720p", "1080p"] as const).map(
              (res: any) => (
                <button
                  key={res}
                  onClick={() => store.setResolution(res)}
                  disabled={store.running}
                  className={`px-3 py-1 text-xs font-medium rounded-xl border transition-all ${
                    store.resolution === res
                      ? "bg-ink-100 border-ink-300 text-ink-800"
                      : "bg-white border-ink-200 text-ink-600 hover:border-ink-300"
                  } disabled:opacity-50`}
                >
                  {res}
                </button>
              ),
            )}
          </div>
        </div>

        {/* Quality */}
        <div>
          <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
            Quality
          </label>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { label: "Low", value: "distilled" },
                { label: "Standard", value: "one-stage" },
                { label: "High", value: "two-stage" },
              ] as const
            ).map((q) => (
              <button
                key={q.value}
                onClick={() => store.setMode(q.value)}
                disabled={store.running}
                className={`px-3 py-1 text-xs font-medium rounded-xl border transition-all ${
                  store.mode === q.value
                    ? "bg-ink-100 border-ink-300 text-ink-800"
                    : "bg-white border-ink-200 text-ink-600 hover:border-ink-300"
                } disabled:opacity-50`}
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold text-ink-700 uppercase tracking-wider">
            Batch Rows
          </label>
          <div className="flex items-center gap-1.5">
            <button
              onClick={store.clear}
              disabled={store.running || store.stitching}
              title="Clear all rows and settings"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border transition-all bg-white border-ink-200 text-red-600 hover:border-red-200 hover:bg-red-50 disabled:opacity-50"
            >
              {CloseIcon}
              Clear
            </button>
            <button
              onClick={store.addRow}
              disabled={store.running}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border transition-all bg-white border-ink-200 text-ink-600 hover:border-ink-300 disabled:opacity-50"
            >
              {PlusIcon}
              Add Row
            </button>
          </div>
        </div>

        <div className="border border-ink-200 rounded-2xl overflow-hidden">
          <div className="overflow-auto max-h-[480px]">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-ink-50 border-b border-ink-200">
                  <th className="sticky top-0 bg-ink-50 px-3 py-2 text-left font-semibold text-ink-700 w-10">
                    #
                  </th>
                  <th className="sticky top-0 bg-ink-50 px-3 py-2 text-left font-semibold text-ink-700 w-36">
                    Starting Image
                  </th>
                  <th className="sticky top-0 bg-ink-50 px-3 py-2 text-left font-semibold text-ink-700 min-w-[260px]">
                    Prompt
                  </th>
                  <th className="sticky top-0 bg-ink-50 px-3 py-2 text-left font-semibold text-ink-700 w-28">
                    Status
                  </th>
                  <th className="sticky top-0 bg-ink-50 px-3 py-2 text-left font-semibold text-ink-700 w-40">
                    Result
                  </th>
                  <th className="sticky top-0 bg-ink-50 px-3 py-2 text-left font-semibold text-ink-700 w-24">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {store.rows.map((row, idx) => (
                  <tr
                    key={row.id}
                    className="border-b border-ink-200 last:border-b-0 align-top transition-colors hover:bg-ink-100/40"
                  >
                    <td className="px-3 py-2 text-ink-600/60 font-medium tabular-nums">
                      {idx + 1}
                    </td>

                    {/* Starting image */}
                    <td className="px-3 py-2">
                      <div className="flex flex-col items-start gap-1.5">
                        <div className="flex items-center gap-1">
                          <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-ink-200 bg-white text-ink-600 text-[11px] font-medium cursor-pointer hover:border-ink-300 hover:bg-ink-100 transition-colors">
                            {UploadIcon}
                            {row.imageFilename ? "Replace" : "Upload"}
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => handleImageSelect(e, row.id)}
                              disabled={store.running}
                              className="hidden"
                            />
                          </label>
                          <button
                            onClick={() => openPicker(row.id)}
                            disabled={store.running}
                            title="Pick from project images"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-ink-200 bg-white text-ink-600 text-[11px] font-medium hover:border-ink-300 hover:bg-ink-100 transition-colors disabled:opacity-50"
                          >
                            {ImageIcon}
                            Pick
                          </button>
                        </div>
                        {row.imageUrl ? (
                          <img
                            src={row.imageUrl}
                            alt={row.imageFilename || "Starting image"}
                            className="w-20 h-20 object-cover rounded-xl border border-ink-200"
                          />
                        ) : (
                          <span className="text-[10px] text-ink-500 italic">
                            No image
                          </span>
                        )}
                        {row.imageFilename && (
                          <span className="text-[10px] text-ink-600 truncate max-w-[120px]">
                            {row.imageFilename}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Prompt */}
                    <td className="px-3 py-2">
                      <textarea
                        value={row.prompt}
                        onChange={(e) =>
                          store.updatePrompt(row.id, e.target.value)
                        }
                        placeholder="Describe the video scene..."
                        rows={3}
                        disabled={store.running}
                        className="w-full px-2.5 py-1.5 bg-transparent border border-ink-200 rounded-xl text-ink-800 text-xs placeholder-ink-500/40 focus:outline-none focus:border-tiffany-500 focus:ring-1 focus:ring-tiffany-500/30 transition-all resize-none disabled:opacity-50"
                      />
                    </td>

                    {/* Status */}
                    <td className="px-3 py-2">
                      <StatusBadge status={row.status} />
                      {row.status === "error" && row.error && (
                        <p className="text-[10px] text-red-600 mt-1 break-words max-w-[120px]">
                          {row.error}
                        </p>
                      )}
                    </td>

                    {/* Result */}
                    <td className="px-3 py-2">
                      {row.result ? (
                        <video
                          src={row.result}
                          controls
                          className="w-full max-w-[160px] h-auto rounded-xl bg-black"
                        />
                      ) : (
                        <span className="text-[10px] text-ink-500 italic">
                          —
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => store.generateRow(projectId, row.id)}
                          disabled={
                            store.running ||
                            !row.prompt.trim() ||
                            !row.imagePath
                          }
                          title="Generate this row"
                          className="flex items-center justify-center w-7 h-7 rounded-xl border border-ink-200 text-ink-600 hover:bg-ink-200 hover:border-ink-300 transition-colors disabled:opacity-40"
                        >
                          {SparkleIcon}
                        </button>
                        <button
                          onClick={() => store.removeRow(row.id)}
                          disabled={store.running}
                          title="Remove row"
                          className="flex items-center justify-center w-7 h-7 rounded-xl border border-ink-200 text-ink-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors disabled:opacity-40"
                        >
                          {CloseIcon}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {store.rows.length === 0 && (
          <p className="text-xs text-ink-500 italic py-6 text-center border border-dashed border-ink-200 rounded-2xl mt-2">
            No rows yet. Click "Add Row" to get started.
          </p>
        )}
      </div>

      {/* Open output folder */}
      <button
        onClick={() => openFolder(projectId, "output")}
        className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-ink-50 hover:bg-ink-200 text-ink-700 text-sm font-medium rounded-2xl border border-ink-200 transition-colors"
      >
        {FolderIcon}
        Open Output Folder
      </button>

      {/* Progress */}
      {store.progress && (
        <div className="flex items-center gap-3 p-4 bg-ink-50 border border-ink-200 rounded-2xl">
          <span className="text-xs font-medium text-ink-700">
            Batch Progress
          </span>
          <div className="flex-1 h-2 bg-ink-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-tiffany-500 rounded-full transition-all duration-300"
              style={{
                width: `${(store.progress.current / store.progress.total) * 100}%`,
              }}
            />
          </div>
          <span className="text-xs font-semibold text-ink-700 tabular-nums">
            {store.progress.current}/{store.progress.total}
          </span>
        </div>
      )}

      {/* Logs */}
      {store.logs.length > 0 && (
        <div
          ref={logRef}
          className="p-5 bg-ink-50 border border-ink-200 rounded-2xl max-h-40 overflow-y-auto"
        >
          <p className="text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
            Progress Logs
          </p>
          <pre className="text-xs text-ink-600 font-mono whitespace-pre-wrap">
            {store.logs.join("\n")}
          </pre>
        </div>
      )}

      {/* Generate all / cancel */}
      {store.running ? (
        <button
          onClick={store.cancel}
          className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-semibold rounded-2xl border border-red-200 transition-colors"
        >
          Cancel Batch
        </button>
      ) : (
        <button
          onClick={() => store.generateAll(projectId)}
          disabled={readyCount === 0}
          className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-tiffany-500 hover:bg-tiffany-600 active:bg-tiffany-700 disabled:bg-ink-200 disabled:text-ink-500 text-ink-950 text-sm font-semibold rounded-2xl transition-all duration-150 shadow-sm hover:shadow-md disabled:shadow-none"
        >
          {SparkleIcon}
          Generate All ({readyCount} videos)
        </button>
      )}

      {readyCount === 0 && !store.running && (
        <p className="text-xs text-tiffany-600 -mt-2">
          Each row needs both a prompt and a starting image before it can be
          generated.
        </p>
      )}

      {/* ===== Stitch Videos ===== */}
      <div className="pt-3 border-t border-ink-200">
        <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
          Stitch Videos
        </label>

        {store.stitching ? (
          <div className="flex items-center gap-2 w-full px-4 py-3 bg-ink-50 border border-ink-200 rounded-2xl">
            {SpinnerIcon}
            <span className="text-sm font-medium text-ink-700">
              Stitching...
            </span>
          </div>
        ) : (
          <button
            onClick={() => store.stitchVideos()}
            disabled={resultCount < 2}
            className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-tiffany-500 hover:bg-tiffany-600 active:bg-tiffany-700 disabled:bg-ink-200 disabled:text-ink-500 text-ink-950 text-sm font-semibold rounded-2xl transition-all duration-150 shadow-sm"
          >
            {FilmIcon}
            Stitch All Videos ({resultCount})
          </button>
        )}

        {store.stitchError && (
          <div className="mt-2 p-5 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-sm">
            {store.stitchError}
          </div>
        )}

        {store.stitchLogs.length > 0 && (
          <div
            ref={stitchLogRef}
            className="mt-2 p-5 bg-ink-50 border border-ink-200 rounded-2xl max-h-40 overflow-y-auto"
          >
            <p className="text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
              Stitch Logs
            </p>
            <pre className="text-xs text-ink-600 font-mono whitespace-pre-wrap">
              {store.stitchLogs.join("\n")}
            </pre>
          </div>
        )}

        {store.stitchResult && (
          <div className="mt-3">
            <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
              Stitched Video
            </label>
            <div className="relative rounded-2xl overflow-hidden border border-ink-200 shadow-card bg-black w-full max-w-[500px]">
              <video
                src={store.stitchResult}
                controls
                className="w-full h-auto"
              />
            </div>
            <a
              href={store.stitchResult}
              download="stitched.mp4"
              className="inline-flex items-center gap-1.5 mt-2 text-xs font-medium text-ink-600 hover:text-ink-900 transition-colors"
            >
              {UploadIcon}
              Download stitched.mp4
            </a>
          </div>
        )}
      </div>

      {/* ===== Project Images Picker Modal ===== */}
      {pickRowId && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-8"
          onClick={() => setPickRowId(null)}
        >
          <div
            className="w-full max-w-3xl max-h-[80vh] flex flex-col bg-white rounded-3xl border border-ink-200 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-ink-200">
              <span className="text-sm font-semibold text-ink-900">
                Pick Starting Image
              </span>
              <button
                onClick={() => setPickRowId(null)}
                className="flex items-center justify-center w-7 h-7 rounded-xl text-ink-600 hover:bg-ink-200 transition-colors"
                title="Close (Esc)"
              >
                {CloseIcon}
              </button>
            </div>

            <div className="p-6 overflow-y-auto">
              {genStore.projectImagesLoading ? (
                <p className="text-xs text-ink-500 italic py-8 text-center">
                  Loading images...
                </p>
              ) : genStore.projectImages.length === 0 ? (
                <p className="text-xs text-ink-500 italic py-8 text-center border border-dashed border-ink-200 rounded-2xl">
                  No images yet. Upload one first.
                </p>
              ) : (
                <div className="grid grid-cols-3 lg:grid-cols-5 gap-2">
                  {genStore.projectImages.map((img) => (
                    <button
                      key={`${img.source}-${img.filename}`}
                      onClick={() => {
                        store.setRowImage(pickRowId, img);
                        setPickRowId(null);
                      }}
                      className="relative rounded-xl border-2 border-ink-200 hover:border-ink-300 transition-all overflow-hidden"
                    >
                      <img
                        src={img.url}
                        alt={img.filename}
                        className="aspect-square object-cover object-center w-full"
                      />
                      <span className="absolute bottom-0 left-0 right-0 bg-white/80 backdrop-blur-sm px-1.5 py-0.5 text-[10px] text-ink-700 truncate text-center">
                        {img.filename}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
