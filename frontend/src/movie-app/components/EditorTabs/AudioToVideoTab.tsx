import { useEffect, useRef } from "react";
import { useQueueStore } from "../../stores/queueStore";
import { useProjectStore } from "../../stores/projectStore";
import { useAudioToVideoStore } from "../../stores/audioToVideoStore";
import TaskQueuePanel from "./TaskQueuePanel";
import TerminalLogPanel from "./TerminalLogPanel";

interface Props {
  projectId: string;
}

export default function AudioToVideoTab({ projectId }: Props) {
  const queue = useQueueStore();
  const { openFolder } = useProjectStore();
  const a2v = useAudioToVideoStore();

  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    a2v.fetchImages(projectId);
    a2v.fetchAudios(projectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Stream the generation queue so audio-to-video tasks surface here.
  useEffect(() => {
    queue.startStreaming(projectId);
    return () => queue.stopStreaming();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Reconcile audio-to-video state with the latest queue task state.
  useEffect(() => {
    for (const task of queue.tasks) a2v.applyQueueTask(task);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue.tasks, projectId]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      a2v.uploadImage(projectId, reader.result as string, file.name);
    };
    reader.readAsDataURL(file);
  };

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      a2v.uploadAudio(projectId, reader.result as string, file.name);
    };
    reader.readAsDataURL(file);
  };

  const busy =
    a2v.generating || a2v.uploadingImage || a2v.uploadingAudio;

  // ========== SVG Icons ==========

  const VideoIcon = (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
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
        <span className="text-tiffany-600">{VideoIcon}</span>
        <h2 className="text-base font-semibold text-ink-900">Audio to Video</h2>
      </div>

      <TaskQueuePanel projectId={projectId} />
      <TerminalLogPanel />

      {/* ===== Image ===== */}
      <div>
        <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
          Image
        </label>
        <div className="flex items-center gap-2">
          <button
            onClick={() => imageInputRef.current?.click()}
            disabled={a2v.uploadingImage || a2v.generating}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-xl border border-ink-200 bg-white text-ink-600 hover:border-ink-300 disabled:opacity-50 transition-colors"
          >
            {UploadIcon}
            Upload Image
          </button>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />
          {a2v.image && (
            <span className="truncate text-xs text-ink-600">
              {a2v.image.filename}
            </span>
          )}
        </div>

        {a2v.imagesLoading ? (
          <p className="text-xs text-ink-500 italic py-3 text-center">
            Loading images…
          </p>
        ) : a2v.images.length === 0 ? null : (
          <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-2 p-1 mt-2">
            {a2v.images.map((img) => {
              const isSelected = a2v.image?.filename === img.filename;
              return (
                <button
                  key={img.filename}
                  onClick={() => a2v.setImage(img)}
                  disabled={a2v.generating}
                  className={`relative rounded-xl border-2 overflow-hidden transition-all ${
                    isSelected
                      ? "border-tiffany-500 ring-2 ring-tiffany-500/40"
                      : "border-ink-200 hover:border-ink-300"
                  } disabled:opacity-50`}
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
              );
            })}
          </div>
        )}
      </div>

      {/* ===== Audio ===== */}
      <div>
        <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
          Audio (MP3 / WAV)
        </label>
        <div className="flex items-center gap-2">
          <button
            onClick={() => audioInputRef.current?.click()}
            disabled={a2v.uploadingAudio || a2v.generating}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-xl border border-ink-200 bg-white text-ink-600 hover:border-ink-300 disabled:opacity-50 transition-colors"
          >
            {UploadIcon}
            Upload Audio
          </button>
          <input
            ref={audioInputRef}
            type="file"
            accept="audio/*"
            onChange={handleAudioUpload}
            className="hidden"
          />
          {a2v.audio && (
            <span className="truncate text-xs text-ink-600">
              {a2v.audio.filename}
            </span>
          )}
        </div>

        {a2v.audiosLoading ? (
          <p className="text-xs text-ink-500 italic py-3 text-center">
            Loading audios…
          </p>
        ) : a2v.audios.length === 0 ? null : (
          <ul className="mt-2 divide-y divide-ink-200 border border-ink-200 rounded-2xl overflow-hidden max-h-48 overflow-y-auto">
            {a2v.audios.map((a) => {
              const isSelected = a2v.audio?.filename === a.filename;
              return (
                <li key={a.filename}>
                  <button
                    onClick={() => a2v.setAudio(a)}
                    disabled={a2v.generating}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors disabled:opacity-50 ${
                      isSelected
                        ? "bg-ink-100 text-ink-800"
                        : "text-ink-600 hover:bg-ink-100"
                    }`}
                  >
                    <span className="truncate">{a.filename}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ===== Steps ===== */}
      <div>
        <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
          Stage-1 Steps
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => a2v.setSteps(15)}
            disabled={a2v.generating}
            className={`px-4 py-1.5 text-xs font-medium rounded-xl border transition-all ${
              a2v.steps === 15
                ? "bg-ink-100 border-ink-300 text-ink-800"
                : "bg-white border-ink-200 text-ink-600 hover:border-ink-300"
            } disabled:opacity-50`}
          >
            15 (default)
          </button>
          <button
            onClick={() => a2v.setSteps(30)}
            disabled={a2v.generating}
            className={`px-4 py-1.5 text-xs font-medium rounded-xl border transition-all ${
              a2v.steps === 30
                ? "bg-ink-100 border-ink-300 text-ink-800"
                : "bg-white border-ink-200 text-ink-600 hover:border-ink-300"
            } disabled:opacity-50`}
          >
            30 (high quality)
          </button>
          <input
            type="number"
            min={1}
            step={1}
            value={a2v.steps}
            onChange={(e) => a2v.setSteps(Number(e.target.value))}
            disabled={a2v.generating}
            className="w-24 px-3 py-1.5 text-xs bg-ink-50 border border-ink-200 rounded-xl text-ink-800 focus:outline-none focus:border-tiffany-500 focus:ring-2 focus:ring-tiffany-500/25 disabled:opacity-50"
          />
        </div>
      </div>

      {/* ===== Duration ===== */}
      <div>
        <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
          Duration (seconds)
        </label>
        <input
          type="number"
          min={1}
          step={1}
          value={a2v.duration}
          onChange={(e) => a2v.setDuration(Number(e.target.value))}
          disabled={a2v.generating}
          className="w-32 px-4 py-2.5 bg-ink-50 border border-ink-200 rounded-2xl text-ink-900 text-sm placeholder-ink-500/40 focus:outline-none focus:border-tiffany-500 focus:ring-2 focus:ring-tiffany-500/30 transition-all disabled:opacity-50"
        />
      </div>

      {/* ===== Frames ===== */}
      <div>
        <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
          Frames
        </label>
        <input
          type="number"
          min={1}
          step={1}
          value={a2v.frames}
          onChange={(e) => a2v.setFrames(Number(e.target.value))}
          disabled={a2v.generating}
          className="w-32 px-4 py-2.5 bg-ink-50 border border-ink-200 rounded-2xl text-ink-900 text-sm placeholder-ink-500/40 focus:outline-none focus:border-tiffany-500 focus:ring-2 focus:ring-tiffany-500/30 transition-all disabled:opacity-50"
        />
        <p className="text-xs text-ink-600/50 mt-1.5">
          Auto-updated from duration: 1 second = 24 frames + 1 (24n+1)
        </p>
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
              onClick={() => a2v.setAspectRatio(ratio)}
              disabled={a2v.generating}
              className={`px-3 py-1 text-xs font-medium rounded-xl border transition-all ${
                a2v.aspectRatio === ratio
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
          {(["320p", "480p", "512p", "640p", "720p", "1080p"] as const).map((res) => (
            <button
              key={res}
              onClick={() => a2v.setResolution(res)}
              disabled={a2v.generating}
              className={`px-3 py-1 text-xs font-medium rounded-xl border transition-all ${
                a2v.resolution === res
                  ? "bg-ink-100 border-ink-300 text-ink-800"
                  : "bg-white border-ink-200 text-ink-600 hover:border-ink-300"
              } disabled:opacity-50`}
            >
              {res}
            </button>
          ))}
        </div>
      </div>

      {/* ===== Prompt ===== */}
      <div>
        <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
          Scene Prompt
        </label>
        <textarea
          value={a2v.prompt}
          onChange={(e) => a2v.setPrompt(e.target.value)}
          placeholder="Describe the scene, e.g. scene at restaurant"
          rows={3}
          disabled={a2v.generating}
          className="w-full px-4 py-3 bg-ink-50 border border-ink-200 rounded-2xl text-ink-900 text-sm placeholder-ink-500/40 focus:outline-none focus:border-tiffany-500 focus:ring-2 focus:ring-tiffany-500/30 transition-all resize-none disabled:opacity-50"
        />
      </div>

      {/* ===== Generate ===== */}
      {a2v.generating ? (
        <div className="flex items-center gap-2 px-4 py-3 bg-ink-50 border border-ink-200 rounded-2xl">
          {SpinnerIcon}
          <span className="text-sm font-medium text-ink-700">
            Generating video…
          </span>
        </div>
      ) : (
        <button
          onClick={() => a2v.generate(projectId)}
          disabled={busy || !a2v.image || !a2v.audio}
          className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-tiffany-500 hover:bg-tiffany-600 active:bg-tiffany-700 disabled:bg-ink-200 disabled:text-ink-500 text-ink-950 text-sm font-semibold rounded-2xl transition-all duration-150 shadow-sm hover:shadow-md disabled:shadow-none"
        >
          {SparkleIcon}
          Generate Video
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
      {a2v.error && (
        <div className="p-5 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-sm">
          {a2v.error}
        </div>
      )}

      {/* ===== Result ===== */}
      {a2v.result && (
        <div>
          <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
            Generated Video
          </label>
          <div className="relative rounded-2xl overflow-hidden border border-ink-200 shadow-card bg-black">
            <video src={a2v.result} controls className="w-full h-auto" />
          </div>
        </div>
      )}
    </div>
  );
}
