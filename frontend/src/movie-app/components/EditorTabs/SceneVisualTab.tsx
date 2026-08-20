import { useEffect, useRef } from "react";
import { useSceneVisualStore } from "../../stores/sceneVisualStore";

interface Props {
  projectId: string;
}

export default function SceneVisualTab({ projectId }: Props) {
  const sceneStore = useSceneVisualStore();

  useEffect(() => {
    sceneStore.ensureProject(projectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const anyGenerating = sceneStore.items.some((i) => i.generating);

  const uploadFileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<string | null>(null);

  const handleUploadFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const targetId = uploadTargetRef.current;
    e.target.value = "";
    if (!file || !targetId) return;
    const reader = new FileReader();
    reader.onload = () => {
      sceneStore.uploadItemImage(
        projectId,
        targetId,
        reader.result as string,
        file.name,
      );
    };
    reader.readAsDataURL(file);
  };

  // ========== SVG Icons ==========

  const SceneIcon = (
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

  const PlusIcon = (
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
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );

  const TrashIcon = (
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
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );

  const SparkleIcon = (
    <svg
      width="14"
      height="14"
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

  const StopIcon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <rect x="4" y="4" width="16" height="16" rx="2" />
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

  return (
    <div className="flex flex-col gap-7">
      <div className="flex items-center gap-2">
        <span className="text-tiffany-600">{SceneIcon}</span>
        <h2 className="text-base font-semibold text-ink-900">
          Scene Visual
        </h2>
      </div>

      {/* Halt generation */}
      {anyGenerating && (
        <button
          onClick={() => sceneStore.haltAll()}
          className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-semibold rounded-2xl border border-red-200 transition-colors"
        >
          {StopIcon}
          Stop Generation
        </button>
      )}

      {/* Add scene */}
      <button
        onClick={() => sceneStore.addItem()}
        className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-ink-50 hover:bg-ink-200 text-ink-700 text-sm font-medium rounded-2xl border border-ink-200 transition-colors"
      >
        {PlusIcon}
        Add Scene
      </button>

      <input
        ref={uploadFileInputRef}
        type="file"
        accept="image/*"
        onChange={handleUploadFileChange}
        className="hidden"
      />

      {/* Scene items */}
      {sceneStore.items.length === 0 ? (
        <p className="text-xs text-ink-500 italic text-center py-8 border border-dashed border-ink-200 rounded-2xl">
          No scenes yet. Add one to generate a scene visual.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {sceneStore.items.map((item, index) => (
            <div
              key={item.id}
              className="border border-ink-200 rounded-2xl p-5 flex flex-col gap-3 bg-ink-100/60"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-ink-700 uppercase tracking-wider">
                  Scene {index + 1}
                </span>
                <button
                  onClick={() => sceneStore.removeItem(item.id)}
                  disabled={item.generating}
                  className="flex items-center justify-center w-6 h-6 rounded-full text-ink-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 transition-colors"
                  title="Remove scene"
                >
                  {TrashIcon}
                </button>
              </div>

              <textarea
                value={item.prompt}
                onChange={(e) => sceneStore.setPrompt(item.id, e.target.value)}
                placeholder="Describe the scene, e.g. a little lamb standing in a sunny meadow."
                rows={2}
                disabled={item.generating}
                className="w-full px-3 py-2 bg-white border border-ink-200 rounded-xl text-ink-900 text-sm placeholder-ink-500 focus:outline-none focus:border-tiffany-500 focus:ring-2 focus:ring-tiffany-500/30 transition-all resize-none disabled:opacity-50"
              />

              {item.generating || item.uploading ? (
                <div className="flex items-center gap-2 px-3 py-2 bg-ink-50 border border-ink-200 rounded-xl text-xs text-ink-700">
                  {SpinnerIcon}
                  {item.generating ? "Generating..." : "Uploading..."}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => sceneStore.generateItem(projectId, item.id)}
                    disabled={!item.prompt.trim()}
                    className="flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium rounded-xl bg-tiffany-500 hover:bg-tiffany-600 disabled:bg-ink-200 disabled:text-ink-500 text-ink-950 transition-colors"
                  >
                    {SparkleIcon}
                    Generate
                  </button>
                  <button
                    onClick={() => {
                      uploadTargetRef.current = item.id;
                      uploadFileInputRef.current?.click();
                    }}
                    className="flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium rounded-xl border border-ink-200 bg-white text-ink-600 hover:border-ink-300 transition-colors"
                  >
                    {UploadIcon}
                    Upload Image
                  </button>
                </div>
              )}

              {item.error && (
                <p className="text-xs text-red-600">{item.error}</p>
              )}

              {item.logs.length > 0 && (
                <div className="p-2 bg-ink-50 border border-ink-200 rounded-xl max-h-24 overflow-y-auto">
                  <pre className="text-[10px] text-ink-600 font-mono whitespace-pre-wrap">
                    {item.logs.join("")}
                  </pre>
                </div>
              )}

              {item.result && (
                <div className="rounded-xl overflow-hidden border border-ink-200 inline-block">
                  <img
                    src={item.result}
                    alt={`Scene ${index + 1}`}
                    className="max-w-full h-auto"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
