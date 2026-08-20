import { useEffect, useRef, useState } from "react";
import {
  useReferencesToVideoStore,
  type ReferenceKind,
} from "../../stores/referencesToVideoStore";
import { useGenerationStore } from "../../stores/generationStore";

interface Props {
  projectId: string;
}

// ========== Video thumbnail with hover-to-play + preview ==========

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

function VideoThumb({
  src,
  onSelect,
  onPreview,
}: {
  src: string;
  onSelect: () => void;
  onPreview: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleMouseEnter = () => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = 0;
    v.muted = false;
    v.play().catch(() => {});
  };

  const handleMouseLeave = () => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    v.muted = true;
    v.currentTime = 0;
  };

  const handlePreview = (e: React.MouseEvent) => {
    e.stopPropagation();
    onPreview();
  };

  return (
    <div
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <video
        ref={videoRef}
        src={src}
        muted
        preload="metadata"
        playsInline
        loop
        onClick={onSelect}
        className="aspect-video object-cover w-full bg-black cursor-pointer"
      />
      <button
        onClick={handlePreview}
        className="absolute top-1.5 right-1.5 flex items-center justify-center w-7 h-7 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
        title="Preview"
      >
        {ExpandIcon}
      </button>
    </div>
  );
}

export default function ReferencesToVideoTab({ projectId }: Props) {
  const store = useReferencesToVideoStore();
  const genStore = useGenerationStore();

  const [activeSlot, setActiveSlot] = useState(0);
  const [previewVideo, setPreviewVideo] = useState<{
    url: string;
    filename: string;
  } | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    store.hydrate(projectId);
    store.checkStatus();
    genStore.fetchProjectImages(projectId);
    genStore.fetchProjectVideos(projectId);
    genStore.fetchProjectAudios(projectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [store.genLogs]);

  // Close the video preview modal on Escape.
  useEffect(() => {
    if (!previewVideo) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreviewVideo(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewVideo]);

  const activeRef = store.refs[activeSlot] ?? null;

  const findImage = (filename: string | null) =>
    genStore.projectImages.find((img) => img.filename === filename) || null;

  const findVideo = (filename: string | null) =>
    genStore.projectVideos.find((v) => v.filename === filename) || null;

  const findAudio = (filename: string | null) =>
    genStore.projectAudios.find((a) => a.filename === filename) || null;

  const kindLabel = (kind: ReferenceKind) =>
    kind === "image" ? "Image" : kind === "video" ? "Video" : "Audio";

  const labelFor = (index: number) => {
    const ref = store.refs[index];
    const count = store.refs
      .slice(0, index + 1)
      .filter((r) => r.kind === ref.kind).length;
    return `${kindLabel(ref.kind)} ${count}`;
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      const path = await genStore.uploadImage(projectId, base64, file.name);
      if (path) {
        genStore.fetchProjectImages(projectId);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      const filename = await store.uploadVideo(base64, file.name, projectId);
      if (filename) {
        genStore.fetchProjectVideos(projectId);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      const filename = await store.uploadAudio(base64, file.name, projectId);
      if (filename) {
        genStore.fetchProjectAudios(projectId);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // ========== SVG Icons ==========

  const BookIcon = (
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
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
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

  const CheckIcon = (
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
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );

  const SpinnerIcon = (
    <svg
      className="animate-spin"
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

  const VideoIcon = (
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
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  );

  const AudioIcon = (
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
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
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

  const renderRefCard = (index: number) => {
    const ref = store.refs[index];
    const isActive = activeSlot === index;
    const img = ref.kind === "image" ? findImage(ref.filename) : null;
    const video = ref.kind === "video" ? findVideo(ref.filename) : null;
    const audio = ref.kind === "audio" ? findAudio(ref.filename) : null;

    return (
      <div
        key={index}
        className={`relative flex flex-col items-center gap-1.5 p-2 rounded-2xl border-2 transition-all text-left w-32 ${
          isActive
            ? "border-tiffany-500 ring-2 ring-tiffany-500/40"
            : "border-ink-200 hover:border-ink-300"
        }`}
      >
        <div
          onClick={() => setActiveSlot(index)}
          className="flex flex-col items-center gap-1.5 w-full cursor-pointer"
        >
          <span className="text-[10px] font-semibold text-ink-600 uppercase tracking-wider">
            {labelFor(index)}
          </span>
          {ref.kind === "image" ? (
            img ? (
              <img
                src={img.url}
                alt={img.filename}
                className="w-24 h-24 object-cover rounded-xl"
              />
            ) : (
              <span className="w-24 h-24 rounded-xl bg-ink-50 border border-dashed border-ink-200 flex items-center justify-center text-tiffany-600">
                {ImageIcon}
              </span>
            )
          ) : ref.kind === "video" ? (
            video ? (
              <div className="w-24 rounded-xl overflow-hidden">
                <VideoThumb
                  src={video.url}
                  onSelect={() => setActiveSlot(index)}
                  onPreview={() =>
                    setPreviewVideo({
                      url: video.url,
                      filename: video.filename,
                    })
                  }
                />
              </div>
            ) : (
              <span className="w-24 h-24 rounded-xl bg-ink-50 border border-dashed border-ink-200 flex items-center justify-center text-tiffany-600">
                {VideoIcon}
              </span>
            )
          ) : (
            <span
              className={`w-24 h-24 rounded-xl border flex items-center justify-center ${
                audio
                  ? "bg-ink-100 border-ink-200 text-ink-600"
                  : "bg-ink-50 border-dashed border-ink-200 text-tiffany-600"
              }`}
            >
              {AudioIcon}
            </span>
          )}
          <span className="text-[10px] text-ink-600 truncate max-w-[100px]">
            {ref.filename || "Not selected"}
          </span>
        </div>
        <button
          onClick={() => {
            store.removeRef(index);
            setActiveSlot((s) => Math.min(s, store.refs.length - 2));
          }}
          disabled={store.generating}
          className="absolute top-1 right-1 flex items-center justify-center w-5 h-5 rounded-full bg-ink-100 text-ink-600 hover:bg-red-100 hover:text-red-600 transition-colors disabled:opacity-50"
          title="Remove reference"
        >
          {CloseIcon}
        </button>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-7">
      <div className="flex items-center gap-2">
        {BookIcon}
        <h2 className="text-base font-semibold text-ink-900">
          References to Video
        </h2>
      </div>

      {/* Model download */}
      <div className="border border-ink-200 rounded-2xl p-5 flex flex-col gap-3 bg-ink-100/60">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-ink-800">
            AI Model
          </span>
          <span className="text-xs text-ink-600">
            appautomaton/minimax-h3-base-8bit-mlx
          </span>
        </div>

        <button
          onClick={() => store.downloadModel()}
          disabled={store.downloading || store.downloaded}
          className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-2xl bg-tiffany-500 hover:bg-tiffany-600 disabled:bg-ink-100 disabled:text-tiffany-600 text-ink-950 transition-colors"
        >
          {store.downloading
            ? SpinnerIcon
            : store.downloaded
              ? CheckIcon
              : DownloadIcon}
          {store.downloading
            ? "Downloading..."
            : store.downloaded
              ? "Model Downloaded"
              : "Download Model"}
        </button>

        {store.error && <p className="text-xs text-red-600">{store.error}</p>}

        {store.logs.length > 0 && (
          <div className="p-2 bg-ink-50 border border-ink-200 rounded-xl max-h-40 overflow-y-auto">
            <pre className="text-[10px] text-ink-600 font-mono whitespace-pre-wrap">
              {store.logs.join("")}
            </pre>
          </div>
        )}
      </div>

      {/* Prompt */}
      <div>
        <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
          Prompt
        </label>
        <textarea
          value={store.prompt}
          onChange={(e) => store.setPrompt(e.target.value)}
          placeholder="Describe the scene using [image1], [video1] placeholders..."
          rows={3}
          disabled={store.generating}
          className="w-full px-4 py-3 bg-ink-50 border border-ink-200 rounded-2xl text-ink-900 text-sm placeholder-ink-500/40 focus:outline-none focus:border-tiffany-500 focus:ring-2 focus:ring-tiffany-500/30 transition-all resize-none disabled:opacity-50"
        />
        <p className="text-xs text-ink-600/50 mt-1.5">
          Use{" "}
          <code className="text-[11px] bg-ink-100 px-1 rounded">
            [image1]
          </code>
          ,{" "}
          <code className="text-[11px] bg-ink-100 px-1 rounded">
            [image2]
          </code>
          ,{" "}
          <code className="text-[11px] bg-ink-100 px-1 rounded">
            [video1]
          </code>{" "}
          … in order to reference the media below.
        </p>
      </div>

      {/* References */}
      <div>
        <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
          References
        </label>

        <div className="flex flex-wrap gap-2 mb-3">
          {store.refs.map((_, index) => renderRefCard(index))}
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          <button
            onClick={() => {
              store.addRef("image");
              setActiveSlot(store.refs.length);
            }}
            disabled={store.generating}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border transition-all bg-white border-ink-200 text-ink-600 hover:border-ink-300 disabled:opacity-50"
          >
            {PlusIcon}
            Add Image
          </button>
          <button
            onClick={() => {
              store.addRef("video");
              setActiveSlot(store.refs.length);
            }}
            disabled={store.generating}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border transition-all bg-white border-ink-200 text-ink-600 hover:border-ink-300 disabled:opacity-50"
          >
            {PlusIcon}
            Add Video
          </button>
          <button
            onClick={() => {
              store.addRef("audio");
              setActiveSlot(store.refs.length);
            }}
            disabled={store.generating}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border transition-all bg-white border-ink-200 text-ink-600 hover:border-ink-300 disabled:opacity-50"
          >
            {PlusIcon}
            Add Audio
          </button>
        </div>

        {activeRef ? (
          activeRef.kind === "image" ? (
            <>
              <div className="flex items-center gap-2 mb-2">
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  disabled={store.generating}
                  className="flex-1 text-sm text-ink-700 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-medium file:bg-ink-100 file:text-ink-700 hover:file:bg-ink-200 file:cursor-pointer file:transition-colors disabled:opacity-50"
                />
              </div>
              {genStore.projectImagesLoading ? (
                <p className="text-xs text-ink-500 italic py-4 text-center">
                  Loading images...
                </p>
              ) : genStore.projectImages.length === 0 ? (
                <p className="text-xs text-ink-500 italic py-4 text-center border border-dashed border-ink-200 rounded-2xl">
                  No images yet. Upload one above.
                </p>
              ) : (
                <div className="grid grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-2">
                  {genStore.projectImages.map((img) => {
                    const isSelected = img.filename === activeRef.filename;
                    return (
                      <button
                        key={`${img.source}-${img.filename}`}
                        onClick={() =>
                          store.setRefFilename(activeSlot, img.filename)
                        }
                        disabled={store.generating}
                        className={`relative rounded-xl border-2 transition-all ${
                          isSelected
                            ? "border-tiffany-500 ring-2 ring-tiffany-500/40"
                            : "border-ink-200 hover:border-ink-300"
                        } disabled:opacity-50`}
                      >
                        <img
                          src={img.url}
                          alt={img.filename}
                          className="aspect-square object-cover object-center"
                        />
                        <span className="absolute bottom-0 left-0 right-0 bg-white/80 backdrop-blur-sm px-1.5 py-0.5 text-[10px] text-ink-700 truncate text-center">
                          {img.filename}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          ) : activeRef.kind === "video" ? (
            <>
              <div className="flex items-center gap-2 mb-2">
                <input
                  ref={videoInputRef}
                  type="file"
                  accept="video/*"
                  onChange={handleVideoUpload}
                  disabled={store.generating}
                  className="flex-1 text-sm text-ink-700 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-medium file:bg-ink-100 file:text-ink-700 hover:file:bg-ink-200 file:cursor-pointer file:transition-colors disabled:opacity-50"
                />
              </div>
              {genStore.projectVideosLoading ? (
                <p className="text-xs text-ink-500 italic py-4 text-center">
                  Loading videos...
                </p>
              ) : genStore.projectVideos.length === 0 ? (
                <p className="text-xs text-ink-500 italic py-4 text-center border border-dashed border-ink-200 rounded-2xl">
                  No videos yet. Upload one above.
                </p>
              ) : (
                <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8 gap-2">
                  {genStore.projectVideos.map((video) => {
                    const isSelected = video.filename === activeRef.filename;
                    return (
                      <div
                        key={video.filename}
                        className={`relative rounded-xl border-2 overflow-hidden transition-all ${
                          isSelected
                            ? "border-tiffany-500 ring-2 ring-tiffany-500/40"
                            : "border-ink-200 hover:border-ink-300"
                        }`}
                      >
                        <VideoThumb
                          src={video.url}
                          onSelect={() => {
                            if (!store.generating) {
                              store.setRefFilename(activeSlot, video.filename);
                            }
                          }}
                          onPreview={() =>
                            setPreviewVideo({
                              url: video.url,
                              filename: video.filename,
                            })
                          }
                        />
                        <span className="absolute bottom-0 left-0 right-0 bg-white/80 backdrop-blur-sm px-1.5 py-0.5 text-[10px] text-ink-700 truncate text-center pointer-events-none">
                          {video.filename}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-2">
                <input
                  ref={audioInputRef}
                  type="file"
                  accept="audio/*"
                  onChange={handleAudioUpload}
                  disabled={store.generating}
                  className="flex-1 text-sm text-ink-700 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-medium file:bg-ink-100 file:text-ink-700 hover:file:bg-ink-200 file:cursor-pointer file:transition-colors disabled:opacity-50"
                />
              </div>
              {genStore.projectAudiosLoading ? (
                <p className="text-xs text-ink-500 italic py-4 text-center">
                  Loading audio...
                </p>
              ) : genStore.projectAudios.length === 0 ? (
                <p className="text-xs text-ink-500 italic py-4 text-center border border-dashed border-ink-200 rounded-2xl">
                  No audio yet. Upload one above.
                </p>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                  {genStore.projectAudios.map((audio) => {
                    const isSelected = audio.filename === activeRef.filename;
                    return (
                      <button
                        key={audio.filename}
                        onClick={() =>
                          store.setRefFilename(activeSlot, audio.filename)
                        }
                        disabled={store.generating}
                        className={`relative flex items-center gap-2 rounded-xl border-2 px-3 py-2 transition-all text-left ${
                          isSelected
                            ? "border-tiffany-500 ring-2 ring-tiffany-500/40"
                            : "border-ink-200 hover:border-ink-300"
                        } disabled:opacity-50`}
                      >
                        <span className="text-tiffany-600 shrink-0">
                          {AudioIcon}
                        </span>
                        <span className="flex-1 text-[11px] text-ink-700 truncate">
                          {audio.filename}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )
        ) : (
          <p className="text-xs text-ink-500 italic py-4 text-center border border-dashed border-ink-200 rounded-2xl">
            Add a reference above to get started.
          </p>
        )}
      </div>

      {/* Parameters */}
      <div>
        <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
          Parameters
        </label>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {(
            [
              { label: "Steps", value: store.steps, set: store.setSteps },
              { label: "Width", value: store.width, set: store.setWidth },
              { label: "Height", value: store.height, set: store.setHeight },
              { label: "Seconds", value: store.seconds, set: store.setSeconds },
              { label: "Seed", value: store.seed, set: store.setSeed },
            ] as const
          ).map((p) => (
            <div key={p.label} className="flex flex-col gap-1">
              <label className="text-xs font-medium text-ink-700">
                {p.label}
              </label>
              <input
                type="number"
                value={p.value}
                onChange={(e) => p.set(Number(e.target.value))}
                disabled={store.generating}
                step={0.5}
                className="px-3 py-2 bg-ink-50 border border-ink-200 rounded-xl text-ink-900 text-sm focus:outline-none focus:border-tiffany-500 focus:ring-2 focus:ring-tiffany-500/30 transition-all disabled:opacity-50"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Generate / Stop */}
      {store.generating ? (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 flex-1 px-4 py-3 bg-ink-50 border border-ink-200 rounded-2xl">
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
          onClick={() => store.generate(projectId)}
          disabled={
            !store.prompt.trim() ||
            store.refs.every((r) => !r.filename) ||
            !store.downloaded
          }
          className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-tiffany-500 hover:bg-tiffany-600 active:bg-tiffany-700 disabled:bg-ink-200 disabled:text-ink-500 text-ink-950 text-sm font-semibold rounded-2xl transition-all duration-150 shadow-sm hover:shadow-md disabled:shadow-none"
        >
          {SparkleIcon}
          Generate Video
        </button>
      )}
      {!store.downloaded && (
        <p className="text-xs text-tiffany-600 -mt-2">
          Download the AI model above before generating.
        </p>
      )}

      {/* Error */}
      {store.genError && (
        <div className="p-5 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-sm">
          {store.genError}
        </div>
      )}

      {/* Logs */}
      {store.genLogs.length > 0 && (
        <div
          ref={logRef}
          className="p-5 bg-ink-50 border border-ink-200 rounded-2xl max-h-40 overflow-y-auto"
        >
          <p className="text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
            Logs
          </p>
          <pre className="text-xs text-ink-600 font-mono whitespace-pre-wrap">
            {store.genLogs.join("")}
          </pre>
        </div>
      )}

      {/* Result */}
      {store.result && (
        <div>
          <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
            Generated Video
          </label>
          <div className="relative rounded-2xl overflow-hidden border border-ink-200 shadow-card bg-black w-full max-w-[500px]">
            <video src={store.result} controls className="w-full h-auto" />
          </div>
        </div>
      )}

      {/* ===== Video Preview Modal ===== */}
      {previewVideo && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-8"
          onClick={() => setPreviewVideo(null)}
        >
          <div
            className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <video
              src={previewVideo.url}
              controls
              autoPlay
              className="max-w-full max-h-[80vh] rounded-2xl shadow-2xl bg-black"
            />
            <span className="text-xs text-white/70 truncate max-w-full">
              {previewVideo.filename}
            </span>
            <button
              onClick={() => setPreviewVideo(null)}
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
