import { useEffect, useRef } from "react";
import { useQueueStore } from "../../stores/queueStore";
import {
  useVoiceCloneStore,
  type VoiceQuality,
} from "../../stores/voiceCloneStore";
import TaskQueuePanel from "./TaskQueuePanel";
import TerminalLogPanel from "./TerminalLogPanel";

interface Props {
  projectId: string;
}

export default function VoiceCloneTab({ projectId }: Props) {
  const queue = useQueueStore();
  const vc = useVoiceCloneStore();

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    vc.fetchAudios(projectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Stream the generation queue so voice-clone tasks surface here.
  useEffect(() => {
    queue.startStreaming(projectId);
    return () => queue.stopStreaming();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Reconcile voice-clone state with the latest queue task state.
  useEffect(() => {
    for (const task of queue.tasks) vc.applyQueueTask(task);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue.tasks, projectId]);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      vc.uploadAudio(projectId, reader.result as string, file.name);
    };
    reader.readAsDataURL(file);
  };

  // ========== SVG Icons ==========

  const MicIcon = (
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
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
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

  return (
    <div className="flex flex-col gap-7">
      <div className="flex items-center gap-2">
        <span className="text-tiffany-600">{MicIcon}</span>
        <h2 className="text-base font-semibold text-ink-900">Voice Clone</h2>
      </div>

      <TaskQueuePanel projectId={projectId} />
      <TerminalLogPanel />

      {/* ===== Reference voice ===== */}
      <div>
        <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
          Reference Voice
        </label>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={vc.uploading || vc.generating}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-xl border border-ink-200 bg-white text-ink-600 hover:border-ink-300 disabled:opacity-50 transition-colors"
          >
            {UploadIcon}
            Upload Reference Voice
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleUpload}
            className="hidden"
          />
          {vc.uploading && (
            <span className="text-xs text-ink-600 italic">Uploading…</span>
          )}
        </div>

        {vc.refAudio && (
          <div className="mt-3 flex items-center gap-3 rounded-2xl border border-ink-200 bg-ink-50 p-3">
            <audio src={vc.refAudio.url} controls className="h-9" />
            <span className="truncate text-xs text-ink-600">
              {vc.refAudio.filename}
            </span>
          </div>
        )}

        {/* Pick from uploaded folder */}
        <div className="mt-3">
          {vc.audiosLoading ? (
            <p className="text-xs text-ink-500 italic py-3 text-center">
              Loading voices…
            </p>
          ) : vc.audios.length === 0 ? (
            <p className="text-xs text-ink-500 italic py-3 text-center border border-dashed border-ink-200 rounded-2xl">
              No uploaded voices yet. Upload one above.
            </p>
          ) : (
            <ul className="divide-y divide-ink-200 border border-ink-200 rounded-2xl overflow-hidden max-h-48 overflow-y-auto">
              {vc.audios.map((a) => {
                const isSelected = vc.refAudio?.filename === a.filename;
                return (
                  <li key={a.filename}>
                    <button
                      onClick={() => vc.setRefAudio(a)}
                      disabled={vc.generating}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors disabled:opacity-50 ${
                        isSelected
                          ? "bg-ink-100 text-ink-800"
                          : "text-ink-600 hover:bg-ink-100"
                      }`}
                    >
                      <span className="text-ink-500">{MicIcon}</span>
                      <span className="truncate">{a.filename}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* ===== Voice quality ===== */}
      <div>
        <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
          Voice Quality
        </label>
        <div className="flex flex-wrap gap-2">
          {(
            [
              { value: "high" as VoiceQuality, label: "High" },
              { value: "low" as VoiceQuality, label: "Low" },
            ]
          ).map((q) => (
            <button
              key={q.value}
              onClick={() => vc.setQuality(q.value)}
              disabled={vc.generating}
              className={`px-4 py-1.5 text-xs font-medium rounded-xl border transition-all ${
                vc.quality === q.value
                  ? "bg-ink-100 border-ink-300 text-ink-800"
                  : "bg-white border-ink-200 text-ink-600 hover:border-ink-300"
              } disabled:opacity-50`}
            >
              {q.label}
            </button>
          ))}
        </div>
      </div>

      {/* ===== Transcript ===== */}
      <div>
        <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
          Transcript
        </label>
        <textarea
          value={vc.transcript}
          onChange={(e) => vc.setTranscript(e.target.value)}
          placeholder="What should the cloned voice say?"
          rows={4}
          disabled={vc.generating}
          className="w-full px-4 py-3 bg-ink-50 border border-ink-200 rounded-2xl text-ink-900 text-sm placeholder-ink-500/40 focus:outline-none focus:border-tiffany-500 focus:ring-2 focus:ring-tiffany-500/30 transition-all resize-none disabled:opacity-50"
        />
      </div>

      {/* ===== Generate ===== */}
      {vc.generating ? (
        <div className="flex items-center gap-2 px-4 py-3 bg-ink-50 border border-ink-200 rounded-2xl">
          {SpinnerIcon}
          <span className="text-sm font-medium text-ink-700">
            Generating voice…
          </span>
        </div>
      ) : (
        <button
          onClick={() => vc.generate(projectId)}
          disabled={!vc.refAudio || !vc.transcript.trim()}
          className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-tiffany-500 hover:bg-tiffany-600 active:bg-tiffany-700 disabled:bg-ink-200 disabled:text-ink-500 text-ink-950 text-sm font-semibold rounded-2xl transition-all duration-150 shadow-sm hover:shadow-md disabled:shadow-none"
        >
          {SparkleIcon}
          Generate Voice
        </button>
      )}

      {/* ===== Error ===== */}
      {vc.error && (
        <div className="p-5 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-sm">
          {vc.error}
        </div>
      )}

      {/* ===== Result ===== */}
      {vc.result && (
        <div>
          <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
            Generated Voice
          </label>
          <audio src={vc.result} controls className="w-full" />
        </div>
      )}
    </div>
  );
}
