import { useEffect, useRef, useState } from "react";
import {
  useBatchImageToVideoStore,
  type BatchI2VRowStatus,
} from "../../stores/batchImageToVideoStore";
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

const ClipboardIcon = (
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
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
  </svg>
);

const FileIcon = (
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
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

const ImageIcon = (
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
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
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

const ExpandIcon = (
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
    <polyline points="15 3 21 3 21 9" />
    <polyline points="9 21 3 21 3 15" />
    <line x1="21" y1="3" x2="14" y2="10" />
    <line x1="3" y1="21" x2="10" y2="14" />
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

const RefreshCwIcon = (
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
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
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

function StatusBadge({ status }: { status: BatchI2VRowStatus }) {
  switch (status) {
    case "generating":
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-600">
          {SpinnerIcon}
          Generating
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
      return <span className="text-xs font-medium text-red-600">Error</span>;
    default:
      return <span className="text-xs font-medium text-ink-500">—</span>;
  }
}

// ========== Duration cell (text input) ==========

function DurationCell({
  value,
  shared,
  disabled,
  onCommit,
}: {
  value: number | null;
  shared: number;
  disabled: boolean;
  onCommit: (v: number | null) => void;
}) {
  const [text, setText] = useState(value == null ? "" : String(value));

  // Sync local text when the row's value changes externally (e.g. CSV re-parse).
  useEffect(() => {
    setText(value == null ? "" : String(value));
  }, [value]);

  const commit = () => {
    const t = text.trim();
    if (t === "") {
      onCommit(null);
      return;
    }
    const n = Number(t);
    if (Number.isFinite(n) && n > 0) {
      onCommit(n);
    } else {
      setText(value == null ? "" : String(value));
    }
  };

  return (
    <input
      type="text"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
      }}
      placeholder={`Default (${shared}s)`}
      disabled={disabled}
      title="Override video duration in seconds (empty = shared default)"
      className="w-full px-2 py-1.5 bg-white border border-ink-200 rounded-xl text-ink-800 text-xs placeholder-ink-500/40 focus:outline-none focus:border-tiffany-500 focus:ring-1 focus:ring-tiffany-500/30 transition-all disabled:opacity-50"
    />
  );
}

// ========== Component ==========

export default function BatchImageToVideoTab({ projectId }: Props) {
  const store = useBatchImageToVideoStore();
  const { openFolder } = useProjectStore();

  const logRef = useRef<HTMLDivElement | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [csvFilename, setCsvFilename] = useState<string | null>(null);
  const [csvText, setCsvText] = useState("");
  const [preview, setPreview] = useState<{
    url: string;
    filename: string;
    type: "image" | "video";
  } | null>(null);

  useEffect(() => {
    store.hydrate(projectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [store.logs]);

  // Close the preview modal on Escape.
  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreview(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview]);

  const handleCsvSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      store.uploadCsv(base64, file.name);
      setCsvFilename(file.name);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handlePasteCsv = () => {
    if (!csvText.trim()) return;
    store.parseCsvText(csvText);
    setCsvFilename(null);
    setCsvText("");
  };

  const imageCount = store.rows.filter((r) => r.t2iPrompt.trim()).length;
  const videoCount = store.rows.filter(
    (r) => r.imagePath && r.i2vPrompt.trim(),
  ).length;
  const bothCount = store.rows.filter(
    (r) => r.t2iPrompt.trim() && r.i2vPrompt.trim(),
  ).length;

  return (
    <div className="flex flex-col gap-7">
      <div className="flex items-center gap-2">
        {TableIcon}
        <h2 className="text-base font-semibold text-ink-900">
          Batch Image to Video
        </h2>
      </div>

      {/* CSV upload */}
      <div className="border border-ink-200 rounded-2xl p-5 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          {FileIcon}
          <span className="text-sm font-semibold text-ink-900">
            Import Scenes (CSV)
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv"
            onChange={handleCsvSelect}
            disabled={store.running}
            className="hidden"
          />
          <button
            onClick={() => csvInputRef.current?.click()}
            disabled={store.running}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-ink-200 bg-white text-ink-600 text-xs font-medium cursor-pointer hover:border-ink-300 hover:bg-ink-100 transition-colors disabled:opacity-50"
          >
            {UploadIcon}
            Upload CSV
          </button>
          {csvFilename && (
            <span className="text-[11px] text-ink-600 truncate max-w-[240px]">
              {csvFilename}
            </span>
          )}
        </div>

        <div className="flex items-start gap-2">
          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder={`Paste CSV here, e.g.\nt2i,i2v,duration\nA student sleeping in class...,Slow pan across the classroom...,5`}
            rows={4}
            disabled={store.running}
            className="flex-1 px-2.5 py-1.5 bg-white border border-ink-200 rounded-xl text-ink-800 text-xs placeholder-ink-500/40 focus:outline-none focus:border-tiffany-500 focus:ring-1 focus:ring-tiffany-500/30 transition-all resize-y disabled:opacity-50 font-mono"
          />
          <button
            onClick={handlePasteCsv}
            disabled={store.running || !csvText.trim()}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-ink-200 bg-white text-ink-600 text-xs font-medium cursor-pointer hover:border-ink-300 hover:bg-ink-100 transition-colors disabled:opacity-50"
          >
            {ClipboardIcon}
            Parse CSV
          </button>
        </div>

        <p className="text-xs text-tiffany-600 italic">
          CSV must contain columns <code className="text-[11px] bg-ink-100 px-1 rounded">t2i</code>{" "}
          (text-to-image prompt) and{" "}
          <code className="text-[11px] bg-ink-100 px-1 rounded">i2v</code>{" "}
          (image-to-video prompt). An optional{" "}
          <code className="text-[11px] bg-ink-100 px-1 rounded">duration</code>{" "}
          column (seconds) overrides the shared duration for that row.
        </p>
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

        {/* Video mode */}
        <div>
          <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
            Mode
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
            Scenes
          </label>
          <div className="flex items-center gap-1.5">
            <button
              onClick={store.clear}
              disabled={store.running}
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
                  <th className="sticky top-0 bg-ink-50 px-3 py-2 text-left font-semibold text-ink-700 min-w-[220px]">
                    Text-to-Image Prompt
                  </th>
                  <th className="sticky top-0 bg-ink-50 px-3 py-2 text-left font-semibold text-ink-700 min-w-[220px]">
                    Image-to-Video Prompt
                  </th>
                  <th className="sticky top-0 bg-ink-50 px-3 py-2 text-left font-semibold text-ink-700 w-28">
                    Duration
                  </th>
                  <th className="sticky top-0 bg-ink-50 px-3 py-2 text-left font-semibold text-ink-700 w-32">
                    Image
                  </th>
                  <th className="sticky top-0 bg-ink-50 px-3 py-2 text-left font-semibold text-ink-700 w-40">
                    Video
                  </th>
                  <th className="sticky top-0 bg-ink-50 px-3 py-2 text-left font-semibold text-ink-700 w-32">
                    Status
                  </th>
                  <th className="sticky top-0 bg-ink-50 px-3 py-2 text-left font-semibold text-ink-700 w-36">
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

                    {/* Text-to-image prompt */}
                    <td className="px-3 py-2">
                      <textarea
                        value={row.t2iPrompt}
                        onChange={(e) =>
                          store.updateT2IPrompt(row.id, e.target.value)
                        }
                        placeholder="Describe the starting image..."
                        rows={3}
                        disabled={store.running}
                        className="w-full px-2.5 py-1.5 bg-transparent border border-ink-200 rounded-xl text-ink-800 text-xs placeholder-ink-500/40 focus:outline-none focus:border-tiffany-500 focus:ring-1 focus:ring-tiffany-500/30 transition-all resize-none disabled:opacity-50"
                      />
                    </td>

                    {/* Image-to-video prompt */}
                    <td className="px-3 py-2">
                      <textarea
                        value={row.i2vPrompt}
                        onChange={(e) =>
                          store.updateI2VPrompt(row.id, e.target.value)
                        }
                        placeholder="Describe the motion..."
                        rows={3}
                        disabled={store.running}
                        className="w-full px-2.5 py-1.5 bg-transparent border border-ink-200 rounded-xl text-ink-800 text-xs placeholder-ink-500/40 focus:outline-none focus:border-tiffany-500 focus:ring-1 focus:ring-tiffany-500/30 transition-all resize-none disabled:opacity-50"
                      />
                    </td>

                    {/* Duration override */}
                    <td className="px-3 py-2">
                      <DurationCell
                        value={row.duration}
                        shared={store.duration}
                        disabled={store.running}
                        onCommit={(v) => store.updateRowDuration(row.id, v)}
                      />
                    </td>

                    {/* Generated image */}
                    <td className="px-3 py-2">
                      {row.imageUrl ? (
                        <img
                          src={row.imageUrl}
                          alt={row.imageFilename || "Generated image"}
                          onClick={() =>
                            setPreview({
                              url: row.imageUrl!,
                              filename: row.imageFilename || "Image",
                              type: "image",
                            })
                          }
                          className="w-20 h-20 object-cover rounded-xl border border-ink-200 cursor-zoom-in hover:opacity-80 transition-opacity"
                        />
                      ) : (
                        <span className="text-[10px] text-ink-500 italic">
                          —
                        </span>
                      )}
                    </td>

                    {/* Generated video */}
                    <td className="px-3 py-2">
                      {row.videoResult ? (
                        <div className="relative inline-block">
                          <video
                            src={row.videoResult}
                            controls
                            className="w-full max-w-[160px] h-auto rounded-xl bg-black"
                          />
                          <button
                            onClick={() =>
                              setPreview({
                                url: row.videoResult!,
                                filename: "Video",
                                type: "video",
                              })
                            }
                            className="absolute top-1.5 right-1.5 flex items-center justify-center w-6 h-6 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
                            title="Preview"
                          >
                            {ExpandIcon}
                          </button>
                        </div>
                      ) : (
                        <span className="text-[10px] text-ink-500 italic">
                          —
                        </span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-tiffany-600 w-10">
                            Img:
                          </span>
                          <StatusBadge status={row.imageStatus} />
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-tiffany-600 w-10">
                            Vid:
                          </span>
                          <StatusBadge status={row.videoStatus} />
                        </div>
                      </div>
                      {row.error && (
                        <p className="text-[10px] text-red-600 mt-1 break-words max-w-[120px]">
                          {row.error}
                        </p>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        <button
                          onClick={() =>
                            store.regenerateImage(projectId, row.id)
                          }
                          disabled={store.running || !row.t2iPrompt.trim()}
                          title="Regenerate image"
                          className="flex items-center justify-center w-7 h-7 rounded-xl border border-ink-200 text-ink-600 hover:bg-ink-100 hover:text-ink-800 hover:border-ink-300 transition-colors disabled:opacity-40"
                        >
                          {ImageIcon}
                        </button>
                        <button
                          onClick={() =>
                            store.regenerateVideo(projectId, row.id)
                          }
                          disabled={
                            store.running ||
                            !row.imagePath ||
                            !row.i2vPrompt.trim()
                          }
                          title="Regenerate video"
                          className="flex items-center justify-center w-7 h-7 rounded-xl border border-ink-200 text-ink-600 hover:bg-ink-100 hover:text-ink-800 hover:border-ink-300 transition-colors disabled:opacity-40"
                        >
                          {FilmIcon}
                        </button>
                        <button
                          onClick={() => store.regenerateBoth(projectId, row.id)}
                          disabled={
                            store.running ||
                            !row.t2iPrompt.trim() ||
                            !row.i2vPrompt.trim()
                          }
                          title="Regenerate image + video"
                          className="flex items-center justify-center w-7 h-7 rounded-xl border border-ink-200 text-ink-600 hover:bg-ink-100 hover:text-ink-800 hover:border-ink-300 transition-colors disabled:opacity-40"
                        >
                          {RefreshCwIcon}
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
            No scenes yet. Click "Add Row" or upload a CSV.
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

      {/* Generate buttons */}
      {store.running ? (
        <button
          onClick={store.cancel}
          className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-semibold rounded-2xl border border-red-200 transition-colors"
        >
          Cancel Batch
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          <button
            onClick={() => store.generateAll(projectId)}
            disabled={bothCount === 0}
            className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-tiffany-500 hover:bg-tiffany-600 active:bg-tiffany-700 disabled:bg-ink-200 disabled:text-ink-500 text-ink-950 text-sm font-semibold rounded-2xl transition-all duration-150 shadow-glow hover:shadow-glow disabled:shadow-none"
          >
            {SparkleIcon}
            Generate All Images &amp; Videos ({bothCount})
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => store.generateAllImages(projectId)}
              disabled={imageCount === 0}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white hover:bg-ink-100 disabled:bg-ink-50 disabled:text-ink-500 text-ink-700 text-sm font-medium rounded-2xl border border-ink-200 transition-colors disabled:border-ink-200"
            >
              {ImageIcon}
              Generate All Images ({imageCount})
            </button>
            <button
              onClick={() => store.generateAllVideos(projectId)}
              disabled={videoCount === 0}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white hover:bg-ink-100 disabled:bg-ink-50 disabled:text-ink-500 text-ink-700 text-sm font-medium rounded-2xl border border-ink-200 transition-colors disabled:border-ink-200"
            >
              {FilmIcon}
              Generate All Videos ({videoCount})
            </button>
          </div>
        </div>
      )}

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
            {preview.type === "image" ? (
              <img
                src={preview.url}
                alt={preview.filename}
                className="max-w-full max-h-[80vh] object-contain rounded-2xl shadow-2xl"
              />
            ) : (
              <video
                src={preview.url}
                controls
                autoPlay
                className="max-w-full max-h-[80vh] rounded-2xl shadow-2xl bg-black"
              />
            )}
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
