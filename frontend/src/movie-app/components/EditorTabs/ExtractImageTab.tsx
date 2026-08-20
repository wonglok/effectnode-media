import { useEffect, useRef, useState } from "react";
import { useGenerationStore, type ProjectVideo } from "../../stores/generationStore";

const API_BASE = `http://localhost:${(window as any).PORT}`;

interface Props {
  projectId: string;
}

/** Seek the video to `time` and draw its current frame into a PNG data URL. */
async function captureFrameAt(
  video: HTMLVideoElement,
  time: number,
): Promise<string> {
  await new Promise<void>((resolve) => {
    if (Math.abs(video.currentTime - time) < 0.001 && !video.seeking) {
      resolve();
      return;
    }
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener("seeked", onSeeked);
    };
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const timer = setTimeout(onSeeked, 1500);
    video.addEventListener("seeked", onSeeked);
    video.currentTime = time;
  });

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

export default function ExtractImageTab({ projectId }: Props) {
  const gen = useGenerationStore();

  const videoRef = useRef<HTMLVideoElement>(null);

  const [selected, setSelected] = useState<ProjectVideo | null>(null);
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(0);
  const [extracting, setExtracting] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [savedName, setSavedName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    gen.fetchProjectVideos(projectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const selectVideo = (v: ProjectVideo) => {
    setSelected(v);
    setPreview(null);
    setSavedName(null);
    setDuration(0);
    setTime(0);
    setError(null);
  };

  const onLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const d = e.currentTarget.duration;
    setDuration(Number.isFinite(d) ? d : 0);
    setTime(0);
  };

  const handleExtract = async () => {
    const video = videoRef.current;
    if (!video) return;
    setExtracting(true);
    setError(null);
    setPreview(null);
    setSavedName(null);
    try {
      const dataUrl = await captureFrameAt(video, time);
      setPreview(dataUrl);

      const res = await fetch(`${API_BASE}/api/extracted-frames`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: dataUrl,
          filename: `frame-${Date.now()}.png`,
          projectId,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setSavedName(data.filename as string);
    } catch (e) {
      setError(String(e));
    } finally {
      setExtracting(false);
    }
  };

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

  const CameraIcon = (
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
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );

  return (
    <div className="flex flex-col gap-7">
      <div className="flex items-center gap-2">
        <span className="text-tiffany-600">{CameraIcon}</span>
        <h2 className="text-base font-semibold text-ink-900">
          Image Extract from Video
        </h2>
      </div>

      {/* Video picker */}
      <div>
        <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
          Videos
        </label>
        {gen.projectVideosLoading ? (
          <p className="text-xs text-ink-500 italic py-4 text-center">
            Loading videos...
          </p>
        ) : gen.projectVideos.length === 0 ? (
          <p className="text-xs text-ink-500 italic py-4 text-center border border-dashed border-ink-200 rounded-2xl">
            No generated videos yet.
          </p>
        ) : (
          <ul className="divide-y divide-ink-200 border border-ink-200 rounded-2xl overflow-hidden max-h-48 overflow-y-auto">
            {gen.projectVideos.map((v) => (
              <li key={v.filename}>
                <button
                  onClick={() => selectVideo(v)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
                    selected?.filename === v.filename
                      ? "bg-ink-100 text-ink-800"
                      : "text-ink-600 hover:bg-ink-100"
                  }`}
                >
                  <span className="text-ink-500">{VideoIcon}</span>
                  <span className="truncate">{v.filename}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected && (
        <div className="flex flex-col gap-6">
          <video
            ref={videoRef}
            src={selected.url}
            crossOrigin="anonymous"
            controls
            onLoadedMetadata={onLoadedMetadata}
            className="w-full max-h-64 rounded-2xl border border-ink-200 bg-black"
          />

          <div>
            <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
              Moment ({time.toFixed(2)}s / {duration.toFixed(2)}s)
            </label>
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.05}
              value={time}
              onChange={(e) => {
                const t = Number(e.target.value);
                setTime(t);
                if (videoRef.current) videoRef.current.currentTime = t;
              }}
              disabled={!duration}
              className="w-full accent-tiffany-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExtract}
              disabled={extracting || !duration}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-xl bg-tiffany-500 hover:bg-tiffany-600 disabled:bg-ink-200 disabled:text-ink-500 text-ink-950 transition-colors"
            >
              {CameraIcon}
              Extract Frame
            </button>
            {extracting && (
              <span className="text-xs text-ink-600 italic">
                Extracting...
              </span>
            )}
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          {preview && (
            <div className="flex flex-col gap-3">
              <div className="rounded-2xl overflow-hidden border border-ink-200 inline-block bg-ink-100">
                <img
                  src={preview}
                  alt="extracted"
                  className="max-h-72 object-contain"
                />
              </div>
              {savedName && (
                <p className="text-xs text-emerald-600">
                  Saved as {savedName} in extracted-frames/{projectId}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
