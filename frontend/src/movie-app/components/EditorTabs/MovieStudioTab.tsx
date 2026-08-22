import { useEffect, useRef, useState } from "react";
import { useMovieStudioStore } from "../../stores/movieStudioStore";
import { useGenerationStore } from "../../stores/generationStore";
import { useProjectStore } from "../../stores/projectStore";
import { useQueueStore } from "../../stores/queueStore";
import MlxVlmServerPanel, { OnlyStartButton } from "./MlxVlmServerPanel";
import TaskQueuePanel from "./TaskQueuePanel";
import TerminalLogPanel from "./TerminalLogPanel";

interface Props {
  projectId: string;
}

// ========== Module-scope icons & helper components ==========
// Defined outside the component so their identity stays stable across renders.
// (Components defined *inside* a component are recreated every render, which
// remounts their subtree and makes text inputs lose focus on each keystroke.)

const ClapperIcon = (
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
    <path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z" />
    <path d="m6.2 5.3 3.1 3.9" />
    <path d="m12.4 3.4 3.1 4" />
    <path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
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

const RefreshIcon = (
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
    <polyline points="23 4 23 10 17 10" />
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
  </svg>
);

const StopIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <rect x="5" y="5" width="14" height="14" rx="2" />
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
    width="20"
    height="20"
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

function TableHead({
  columns,
}: {
  columns: { key: string; label: string; className?: string }[];
}) {
  return (
    <thead className="bg-ink-50">
      <tr className="border-b border-ink-200">
        {columns.map((c) => (
          <th
            key={c.key}
            className={`border border-ink-200 px-2 py-1.5 text-left font-semibold text-ink-700 whitespace-nowrap ${
              c.className ?? ""
            }`}
          >
            {c.label}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function EditableInput({
  value,
  onChange,
  type = "text",
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  className?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full rounded-lg border border-ink-200 bg-ink-50 px-2 py-1.5 text-xs text-ink-800 placeholder-ink-400 transition-all focus:border-tiffany-500 focus:outline-none focus:ring-2 focus:ring-tiffany-500/25 ${className}`}
    />
  );
}

function EditableTextarea({
  value,
  onChange,
  rows = 3,
  mono = false,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  mono?: boolean;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      className={`w-full min-w-[150px] resize-y rounded-lg border border-ink-200 bg-ink-50 px-2 py-1.5 leading-relaxed text-ink-800 placeholder-ink-400 transition-all focus:border-tiffany-500 focus:outline-none focus:ring-2 focus:ring-tiffany-500/25 ${
        mono ? "font-mono text-[11px]" : "text-xs"
      }`}
    />
  );
}

function RegenerateButton({
  onClick,
  spinning,
}: {
  onClick: () => void;
  spinning: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={spinning}
      className="mt-1 flex items-center gap-1 whitespace-nowrap rounded-md border border-ink-200 px-2 py-1 text-[10px] font-medium text-ink-600 transition-colors hover:border-tiffany-400 hover:text-tiffany-600 disabled:opacity-50"
    >
      {spinning ? SpinnerIcon : RefreshIcon}
      Regenerate
    </button>
  );
}

function Thumb({
  url,
  filename,
  onOpen,
}: {
  url: string | null;
  filename?: string;
  onOpen: (url: string, filename: string) => void;
}) {
  return url ? (
    <img
      src={url}
      alt={filename || ""}
      onClick={() => onOpen(url, filename || "")}
      className="w-full h-full object-cover rounded-lg border border-ink-200 cursor-zoom-in hover:border-tiffany-500 transition-colors"
    />
  ) : (
    <span className="text-ink-300 text-xs">—</span>
  );
}

export default function MovieStudioTab({ projectId }: Props) {
  const store = useMovieStudioStore();
  const gen = useGenerationStore();
  const queue = useQueueStore();
  const { openFolder } = useProjectStore();
  const model = gen.agent.model;
  const [preview, setPreview] = useState<{
    url: string;
    filename: string;
    type: "image" | "video";
  } | null>(null);

  // Hydrate the persisted idea for this project.
  useEffect(() => {
    store.hydrate(projectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Poll the generation queue for this project.
  useEffect(() => {
    queue.startStreaming(projectId);
    return () => queue.stopStreaming();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Reconcile the movie studio store with the latest queue task state.
  // Prime once per project so already-finished tasks aren't re-applied.
  const primedProjectRef = useRef<string | null>(null);
  const completedTaskIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (primedProjectRef.current !== projectId) {
      store.primeAppliedQueue(queue.tasks);
      primedProjectRef.current = projectId;
      completedTaskIdsRef.current = new Set();
    }
    let newlyCompleted = false;
    for (const task of queue.tasks) {
      store.applyQueueTask(task);
      if (
        task.status === "completed" &&
        !completedTaskIdsRef.current.has(task.id)
      ) {
        completedTaskIdsRef.current.add(task.id);
        newlyCompleted = true;
      }
    }
    if (newlyCompleted) {
      // A generation just finished — refresh the output-folder listing so
      // table thumbnails pick up the new files immediately.
      gen.fetchProjectImages(projectId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue.tasks, projectId]);

  // List output-folder images so the tables can show generated thumbnails.
  useEffect(() => {
    gen.fetchProjectImages(projectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    projectId,
    store.assets.length,
    store.sceneImages.length,
    store.renderedScenes.length,
  ]);

  // Close the preview modal on Escape.
  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreview(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview]);

  const slugify = (v: string): string =>
    (v || "").trim().replace(/[^a-zA-Z0-9_-]/g, "_");
  const resolveUrl = (url?: string): string | null =>
    url
      ? url.startsWith("http")
        ? url
        : `http://localhost:${(window as any).PORT}${url}`
      : null;
  const imageUrlFor = (prefix: string, slug: string): string | null => {
    const img = gen.projectImages.find(
      (i) => i.filename === `${prefix}-${slugify(slug)}.png`,
    );
    if (!img) return null;
    const base = resolveUrl(img.url);
    // Cache-bust with the generated file's timestamp so a regenerated image
    // (same filename) refreshes in the table without a hard reload.
    const updatedAt =
      prefix === "scene"
        ? store.sceneImages.find((i) => i.slug === slug)?.updatedAt
        : store.assets.find((a) => a.kind === prefix && a.slug === slug)
            ?.updatedAt;
    return updatedAt ? `${base}&t=${updatedAt}` : base;
  };

  const openPreview = (
    url: string,
    filename: string,
    type: "image" | "video",
  ) => setPreview({ url, filename, type });

  return (
    <div className="flex flex-col gap-7">
      <div className="flex items-center gap-2">
        <span className="text-tiffany-600">{ClapperIcon}</span>
        <h2 className="text-base font-semibold text-ink-900">Movie Studio</h2>
        <button
          onClick={() => openFolder(projectId, "output")}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border border-ink-200 text-ink-600 hover:border-ink-300 hover:text-ink-900 transition-colors"
        >
          {FolderIcon}
          Show Output Folder
        </button>
      </div>

      <TaskQueuePanel projectId={projectId} />

      <TerminalLogPanel />

      {gen.agent.serverRunning && gen.agent.serverOnline ? (
        <>
          {/* ===== Idea box ===== */}
          <div>
            <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
              Story Idea
            </label>
            <textarea
              value={store.idea}
              onChange={(e) => store.setIdea(e.target.value)}
              placeholder="Describe your movie or story idea, e.g. A little lamb and a ninja become unlikely friends and open a photo studio together."
              rows={5}
              disabled={store.generating}
              className="w-full px-4 py-3 bg-ink-50 border border-ink-200 rounded-2xl text-ink-900 text-sm placeholder-ink-500/40 focus:outline-none focus:border-tiffany-500 focus:ring-2 focus:ring-tiffany-500/30 transition-all resize-none disabled:opacity-50"
            />
          </div>

          {/* ===== Submit ===== */}
          {store.generating ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 flex-1 px-4 py-3 bg-ink-50 border border-ink-200 rounded-2xl">
                  {SpinnerIcon}
                  <span className="text-sm font-medium text-ink-700">
                    {store.generateStatus ?? "Generating production bible..."}
                  </span>
                </div>
                <button
                  onClick={() => store.stop()}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white text-sm font-semibold rounded-2xl transition-all duration-150 shadow-sm"
                >
                  {StopIcon}
                  Stop
                </button>
              </div>
              {store.generateProgress && store.generateProgress.total > 0 && (
                <div className="flex items-center gap-3 px-1">
                  <div className="flex-1 h-2 bg-ink-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-tiffany-500 rounded-full transition-all duration-300"
                      style={{
                        width: `${(store.generateProgress.current / store.generateProgress.total) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-ink-700 tabular-nums whitespace-nowrap">
                    {store.generateProgress.current}/
                    {store.generateProgress.total}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => store.generate(projectId, model)}
              disabled={!store.idea.trim()}
              className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-tiffany-500 hover:bg-tiffany-600 active:bg-tiffany-700 disabled:bg-ink-200 disabled:text-ink-500 text-ink-950 text-sm font-semibold rounded-2xl transition-all duration-150 shadow-sm hover:shadow-md disabled:shadow-none"
            >
              {SparkleIcon}
              Generate
            </button>
          )}

          {/* ===== Error ===== */}
          {store.error && (
            <div className="p-5 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-sm">
              {store.error}
            </div>
          )}

          {/* ===== Result tables ===== */}
          {store.result && (
            <>
              {/* Characters */}
              <div>
                <h3 className="text-sm font-semibold text-ink-900 mb-2">
                  Characters
                </h3>
                {store.result.characters.length === 0 ? (
                  <p className="text-xs text-ink-500 italic py-3 border border-dashed border-ink-200 rounded-2xl text-center">
                    No characters found.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-ink-200">
                    <table className="w-full border-collapse text-xs">
                      <TableHead
                        columns={[
                          { key: "slug", label: "Slug", className: "w-32" },
                          { key: "name", label: "Name", className: "w-40" },
                          { key: "image", label: "Image", className: "w-16" },
                          { key: "prompt", label: "Image Prompt" },
                        ]}
                      />
                      <tbody>
                        {store.result.characters.map((c) => {
                          const url = imageUrlFor("character", c.slug);
                          const spinning = store.regenerating.includes(
                            `character:${c.slug}`,
                          );
                          return (
                            <tr
                              key={c.slug}
                              className="border-b border-ink-200"
                            >
                              <td className="border border-ink-200 px-2 py-1.5 align-top font-mono text-[11px] text-tiffany-700">
                                {c.slug}
                              </td>
                              <td className="border border-ink-200 px-2 py-1.5 align-top min-w-[140px]">
                                <EditableInput
                                  value={c.name}
                                  onChange={(v) =>
                                    store.updateCharacter(c.slug, { name: v })
                                  }
                                />
                              </td>
                              <td className="border border-ink-200 px-2 py-1.5 align-top">
                                {url ? (
                                  <div className="flex flex-col items-start">
                                    <div className="h-16 w-16">
                                      <Thumb
                                        url={url}
                                        filename={c.slug}
                                        onOpen={(u, f) =>
                                          openPreview(u, f, "image")
                                        }
                                      />
                                    </div>
                                    <RegenerateButton
                                      spinning={spinning}
                                      onClick={() =>
                                        store.regenerateAsset(
                                          projectId,
                                          "character",
                                          c.slug,
                                          c.imagePrompt,
                                        )
                                      }
                                    />
                                  </div>
                                ) : (
                                  <span className="text-ink-300 text-xs">
                                    —
                                  </span>
                                )}
                              </td>
                              <td className="border border-ink-200 px-2 py-1.5 align-top">
                                <EditableTextarea
                                  value={c.imagePrompt}
                                  onChange={(v) =>
                                    store.updateCharacter(c.slug, {
                                      imagePrompt: v,
                                    })
                                  }
                                  rows={3}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Places */}
              <div>
                <h3 className="text-sm font-semibold text-ink-900 mb-2">
                  Places
                </h3>
                {store.result.places.length === 0 ? (
                  <p className="text-xs text-ink-500 italic py-3 border border-dashed border-ink-200 rounded-2xl text-center">
                    No places found.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-ink-200">
                    <table className="w-full border-collapse text-xs">
                      <TableHead
                        columns={[
                          { key: "slug", label: "Slug", className: "w-32" },
                          { key: "name", label: "Name", className: "w-40" },
                          { key: "image", label: "Image", className: "w-16" },
                          { key: "prompt", label: "Image Prompt" },
                        ]}
                      />
                      <tbody>
                        {store.result.places.map((p) => {
                          const url = imageUrlFor("place", p.slug);
                          const spinning = store.regenerating.includes(
                            `place:${p.slug}`,
                          );
                          return (
                            <tr
                              key={p.slug}
                              className="border-b border-ink-200"
                            >
                              <td className="border border-ink-200 px-2 py-1.5 align-top font-mono text-[11px] text-tiffany-700">
                                {p.slug}
                              </td>
                              <td className="border border-ink-200 px-2 py-1.5 align-top min-w-[140px]">
                                <EditableInput
                                  value={p.name}
                                  onChange={(v) =>
                                    store.updatePlace(p.slug, { name: v })
                                  }
                                />
                              </td>
                              <td className="border border-ink-200 px-2 py-1.5 align-top">
                                {url ? (
                                  <div className="flex flex-col items-start">
                                    <div className="h-16 w-16">
                                      <Thumb
                                        url={url}
                                        filename={p.slug}
                                        onOpen={(u, f) =>
                                          openPreview(u, f, "image")
                                        }
                                      />
                                    </div>
                                    <RegenerateButton
                                      spinning={spinning}
                                      onClick={() =>
                                        store.regenerateAsset(
                                          projectId,
                                          "place",
                                          p.slug,
                                          p.imagePrompt,
                                        )
                                      }
                                    />
                                  </div>
                                ) : (
                                  <span className="text-ink-300 text-xs">
                                    —
                                  </span>
                                )}
                              </td>
                              <td className="border border-ink-200 px-2 py-1.5 align-top">
                                <EditableTextarea
                                  value={p.imagePrompt}
                                  onChange={(v) =>
                                    store.updatePlace(p.slug, {
                                      imagePrompt: v,
                                    })
                                  }
                                  rows={3}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Scenes */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-ink-900">Scenes</h3>
                  {store.videosRendering ? (
                    <span className="flex items-center gap-1.5 text-xs text-tiffany-600">
                      {SpinnerIcon}
                      {store.videoStatus ?? "Rendering..."}
                    </span>
                  ) : (
                    <button
                      onClick={() => store.renderVideos(projectId)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl bg-tiffany-500 hover:bg-tiffany-600 text-ink-950 transition-colors"
                    >
                      {SparkleIcon}
                      Generate All Videos
                    </button>
                  )}
                </div>

                {store.videosRendering &&
                  store.videoProgress &&
                  store.videoProgress.total > 0 && (
                    <div className="flex items-center gap-3 mb-2 px-1">
                      <div className="flex-1 h-2 bg-ink-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-tiffany-500 rounded-full transition-all duration-300"
                          style={{
                            width: `${(store.videoProgress.current / store.videoProgress.total) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="text-xs font-semibold text-ink-700 tabular-nums whitespace-nowrap">
                        {store.videoProgress.current}/{store.videoProgress.total}
                      </span>
                    </div>
                  )}

                {store.videosError && (
                  <div className="mb-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs">
                    {store.videosError}
                  </div>
                )}
                {store.result.scenes.length === 0 ? (
                  <p className="text-xs text-ink-500 italic py-3 border border-dashed border-ink-200 rounded-2xl text-center">
                    No scenes found.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-ink-200">
                    <table className="w-full border-collapse text-xs min-w-[1000px]">
                      <TableHead
                        columns={[
                          { key: "slug", label: "Slug", className: "w-24" },
                          {
                            key: "duration",
                            label: "Duration",
                            className: "w-16",
                          },
                          {
                            key: "description",
                            label: "Description",
                            className: "w-44",
                          },
                          {
                            key: "characters",
                            label: "Characters",
                            className: "w-28",
                          },
                          { key: "place", label: "Place", className: "w-24" },
                          { key: "image", label: "Image", className: "w-16" },
                          { key: "video", label: "Video", className: "w-40" },
                          { key: "script", label: "Script", className: "w-60" },
                          {
                            key: "voiceover",
                            label: "Voice Over",
                            className: "w-60",
                          },
                          { key: "prompt", label: "Image Prompt" },
                        ]}
                      />
                      <tbody>
                        {store.result.scenes.map((s) => {
                          const url = imageUrlFor("scene", s.slug);
                          const spinning =
                            store.regeneratingSceneImages.includes(s.slug);
                          const video = store.videos.find(
                            (v) => v.slug === s.slug,
                          );
                          const videoUrl = resolveUrl(video?.url);
                          const videoSpinning =
                            store.regeneratingVideos.includes(s.slug);
                          return (
                            <tr
                              key={s.slug}
                              className="border-b border-ink-200"
                            >
                              <td className="border border-ink-200 px-2 py-1.5 align-top font-mono text-[11px] text-tiffany-700">
                                {s.slug}
                              </td>
                              <td className="border border-ink-200 px-2 py-1.5 align-top">
                                <EditableInput
                                  type="number"
                                  value={
                                    s.duration > 0 ? String(s.duration) : ""
                                  }
                                  onChange={(v) =>
                                    store.updateScene(s.slug, {
                                      duration: Number(v) || 0,
                                    })
                                  }
                                  className="w-20"
                                />
                              </td>
                              <td className="border border-ink-200 px-2 py-1.5 align-top min-w-[150px]">
                                <EditableTextarea
                                  value={s.description}
                                  onChange={(v) =>
                                    store.updateScene(s.slug, {
                                      description: v,
                                    })
                                  }
                                  rows={3}
                                />
                              </td>
                              <td className="border border-ink-200 px-2 py-1.5 align-top min-w-[150px]">
                                <EditableTextarea
                                  mono
                                  value={s.characterSlugs.join(", ")}
                                  onChange={(v) =>
                                    store.updateScene(s.slug, {
                                      characterSlugs: v
                                        .split(",")
                                        .map((x) => x.trim())
                                        .filter(Boolean),
                                    })
                                  }
                                  rows={2}
                                />
                              </td>
                              <td className="border border-ink-200 px-2 py-1.5 align-top min-w-[150px]">
                                <EditableInput
                                  value={s.placeSlug}
                                  onChange={(v) =>
                                    store.updateScene(s.slug, { placeSlug: v })
                                  }
                                  className="font-mono text-[11px]"
                                />
                              </td>
                              <td className="border border-ink-200 px-2 py-1.5 align-top min-w-[200px]">
                                {url ? (
                                  <div className="flex flex-col items-start">
                                    <div className="h-16 w-16">
                                      <Thumb
                                        url={url}
                                        filename={s.slug}
                                        onOpen={(u, f) =>
                                          openPreview(u, f, "image")
                                        }
                                      />
                                    </div>
                                    <RegenerateButton
                                      spinning={spinning}
                                      onClick={() =>
                                        store.regenerateSceneImage(
                                          projectId,
                                          s.slug,
                                        )
                                      }
                                    />
                                  </div>
                                ) : (
                                  <span className="text-ink-300 text-xs">
                                    —
                                  </span>
                                )}
                              </td>
                              <td className="border border-ink-200 px-2 py-1.5 align-top min-w-[180px]">
                                {videoUrl ? (
                                  <div className="flex flex-col items-start">
                                    <video
                                      src={`${videoUrl}&t=${video?.updatedAt}`}
                                      controls
                                      muted
                                      className="w-40 rounded-lg border border-ink-200 cursor-pointer"
                                      onClick={() =>
                                        openPreview(videoUrl, s.slug, "video")
                                      }
                                    />
                                    <RegenerateButton
                                      spinning={videoSpinning}
                                      onClick={() =>
                                        store.regenerateVideo(projectId, s.slug)
                                      }
                                    />
                                  </div>
                                ) : (
                                  <span className="text-ink-300 text-xs">—</span>
                                )}
                              </td>
                              <td className="border border-ink-200 px-2 py-1.5 align-top min-w-[300px]">
                                <EditableTextarea
                                  mono
                                  value={s.scriptLines
                                    .map((l) => `${l.characterSlug}: ${l.line}`)
                                    .join("\n")}
                                  onChange={(v) =>
                                    store.updateScene(s.slug, {
                                      scriptLines: v
                                        .split("\n")
                                        .map((ln) => {
                                          const i = ln.indexOf(":");
                                          return i === -1
                                            ? {
                                                characterSlug: "",
                                                line: ln.trim(),
                                              }
                                            : {
                                                characterSlug: ln
                                                  .slice(0, i)
                                                  .trim(),
                                                line: ln.slice(i + 1).trim(),
                                              };
                                        })
                                        .filter((l) =>
                                          Boolean(l.characterSlug || l.line),
                                        ),
                                    })
                                  }
                                  rows={4}
                                />
                              </td>
                              <td className="border border-ink-200 px-2 py-1.5 align-top min-w-[300px]">
                                <EditableTextarea
                                  value={s.voiceOver}
                                  onChange={(v) =>
                                    store.updateScene(s.slug, { voiceOver: v })
                                  }
                                  rows={3}
                                />
                              </td>
                              <td className="border border-ink-200 px-2 py-1.5 align-top min-w-[300px]">
                                <EditableTextarea
                                  value={s.imagePrompt}
                                  onChange={(v) =>
                                    store.updateScene(s.slug, {
                                      imagePrompt: v,
                                    })
                                  }
                                  rows={3}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ===== Assets ===== */}
          {store.result && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-ink-900">
                  Character &amp; Place Images
                </h3>
                {store.assetsRendering ? (
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1.5 text-xs text-tiffany-600">
                      {SpinnerIcon}
                      {store.assetStatus ?? "Rendering..."}
                    </span>
                    <button
                      onClick={() => store.stop()}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-xl bg-red-500 hover:bg-red-600 text-white transition-colors"
                    >
                      {StopIcon}
                      Stop
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => store.renderAssets(projectId)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl bg-tiffany-500 hover:bg-tiffany-600 text-ink-950 transition-colors"
                  >
                    {SparkleIcon}
                    Render Characters & Places Images
                  </button>
                )}
              </div>

              {store.assetsError && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-xs">
                  {store.assetsError}
                </div>
              )}

              {store.assets.length > 0 && (
                <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                  {store.assets.map((asset) => {
                    const key = `${asset.kind}:${asset.slug}`;
                    const isRegenerating = store.regenerating.includes(key);
                    const fullUrl = asset.url.startsWith("http")
                      ? asset.url
                      : `http://localhost:${(window as any).PORT}${asset.url}`;
                    const prompt =
                      asset.kind === "character"
                        ? (store.result?.characters.find(
                            (c) => c.slug === asset.slug,
                          )?.imagePrompt ?? "")
                        : (store.result?.places.find(
                            (p) => p.slug === asset.slug,
                          )?.imagePrompt ?? "");
                    return (
                      <div key={key} className="flex flex-col gap-1.5">
                        <div className="relative rounded-xl border border-ink-200 overflow-hidden">
                          <img
                            src={`${fullUrl}&t=${asset.updatedAt}`}
                            alt={asset.slug}
                            onClick={() =>
                              openPreview(fullUrl, asset.slug, "image")
                            }
                            className="aspect-square object-cover object-center w-full cursor-zoom-in"
                          />
                          <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/50 text-white text-[10px] font-medium uppercase">
                            {asset.kind}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[11px] text-ink-600 truncate font-mono">
                            {asset.slug}
                          </span>
                          <button
                            onClick={() =>
                              store.regenerateAsset(
                                projectId,
                                asset.kind,
                                asset.slug,
                                prompt,
                              )
                            }
                            disabled={isRegenerating}
                            className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-lg border border-ink-200 text-ink-600 hover:border-tiffany-400 hover:text-tiffany-600 transition-colors disabled:opacity-50"
                          >
                            {isRegenerating ? SpinnerIcon : RefreshIcon}
                            Regenerate
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ===== Scene Images ===== */}
          {store.result && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-ink-900">
                  Scene Images
                </h3>
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="scene-image-steps"
                    className="text-xs font-medium text-ink-600"
                  >
                    Steps
                  </label>
                  <input
                    id="scene-image-steps"
                    type="number"
                    min={1}
                    step={1}
                    value={store.sceneImageSteps}
                    onChange={(e) =>
                      store.setSceneImageSteps(Number(e.target.value))
                    }
                    disabled={store.sceneImagesRendering}
                    className="w-20 px-2 py-1.5 text-xs bg-ink-50 border border-ink-200 rounded-lg text-ink-800 focus:outline-none focus:border-tiffany-500 focus:ring-2 focus:ring-tiffany-500/25 disabled:opacity-50"
                  />
                  {store.sceneImagesRendering ? (
                    <span className="flex items-center gap-1.5 text-xs text-tiffany-600">
                      {SpinnerIcon}
                      {store.sceneImageStatus ?? "Rendering..."}
                    </span>
                  ) : (
                    <button
                      onClick={() => store.renderSceneImages(projectId)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl bg-tiffany-500 hover:bg-tiffany-600 text-ink-950 transition-colors"
                    >
                      {SparkleIcon}
                      Render Scene Images
                    </button>
                  )}
                </div>
              </div>

              {store.sceneImagesRendering &&
                store.sceneImageProgress &&
                store.sceneImageProgress.total > 0 && (
                  <div className="flex items-center gap-3 px-1">
                    <div className="flex-1 h-2 bg-ink-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-tiffany-500 rounded-full transition-all duration-300"
                        style={{
                          width: `${(store.sceneImageProgress.current / store.sceneImageProgress.total) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-ink-700 tabular-nums whitespace-nowrap">
                      {store.sceneImageProgress.current}/
                      {store.sceneImageProgress.total}
                    </span>
                  </div>
                )}

              {store.sceneImagesError && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-xs">
                  {store.sceneImagesError}
                </div>
              )}

              {store.sceneImages.length > 0 && (
                <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                  {store.sceneImages.map((img) => {
                    const isRegenerating =
                      store.regeneratingSceneImages.includes(img.slug);
                    const fullUrl = img.url.startsWith("http")
                      ? img.url
                      : `http://localhost:${(window as any).PORT}${img.url}`;
                    return (
                      <div key={img.slug} className="flex flex-col gap-1.5">
                        <div className="relative rounded-xl border border-ink-200 overflow-hidden">
                          <img
                            src={`${fullUrl}&t=${img.updatedAt}`}
                            alt={img.slug}
                            onClick={() =>
                              openPreview(fullUrl, img.slug, "image")
                            }
                            className="aspect-square object-cover object-center w-full cursor-zoom-in"
                          />
                        </div>
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[11px] font-mono text-ink-600 truncate">
                            {img.slug}
                          </span>
                          <button
                            onClick={() =>
                              store.regenerateSceneImage(projectId, img.slug)
                            }
                            disabled={isRegenerating}
                            className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-lg border border-ink-200 text-ink-600 hover:border-tiffany-400 hover:text-tiffany-600 transition-colors disabled:opacity-50"
                          >
                            {isRegenerating ? SpinnerIcon : RefreshIcon}
                            Regenerate
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ===== Render ===== */}
          {store.result && (
            <div className="flex flex-col gap-3">
              {store.rendering ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 flex-1 px-4 py-3 bg-ink-50 border border-ink-200 rounded-2xl">
                      {SpinnerIcon}
                      <span className="text-sm font-medium text-ink-700">
                        {store.renderStatus ?? "Rendering..."}
                      </span>
                    </div>
                    <button
                      onClick={() => store.stop()}
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white text-sm font-semibold rounded-2xl transition-all duration-150 shadow-sm"
                    >
                      {StopIcon}
                      Stop
                    </button>
                  </div>
                  {store.renderProgress && store.renderProgress.total > 0 && (
                    <div className="flex items-center gap-3 px-1">
                      <div className="flex-1 h-2 bg-ink-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-tiffany-500 rounded-full transition-all duration-300"
                          style={{
                            width: `${(store.renderProgress.current / store.renderProgress.total) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="text-xs font-semibold text-ink-700 tabular-nums whitespace-nowrap">
                        {store.renderProgress.current}/
                        {store.renderProgress.total}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => store.render(projectId)}
                  className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-tiffany-500 hover:bg-tiffany-600 active:bg-tiffany-700 text-ink-950 text-sm font-semibold rounded-2xl transition-all duration-150 shadow-sm hover:shadow-md"
                >
                  {SparkleIcon}
                  Render Movie
                </button>
              )}

              {store.renderError && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-xs">
                  {store.renderError}
                </div>
              )}

              {store.renderedScenes.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {store.renderedScenes.map((scene) => {
                    const imgUrl = scene.imageUrl
                      ? scene.imageUrl.startsWith("http")
                        ? scene.imageUrl
                        : `http://localhost:${(window as any).PORT}${scene.imageUrl}`
                      : null;
                    const vidUrl = scene.videoUrl
                      ? scene.videoUrl.startsWith("http")
                        ? scene.videoUrl
                        : `http://localhost:${(window as any).PORT}${scene.videoUrl}`
                      : null;
                    return (
                      <div
                        key={scene.slug}
                        className="flex flex-col gap-1.5 border border-ink-200 rounded-xl p-2 bg-white"
                      >
                        <span className="text-[11px] font-mono text-ink-600 truncate">
                          {scene.slug}
                        </span>
                        {imgUrl && (
                          <img
                            src={imgUrl}
                            alt={scene.slug}
                            onClick={() =>
                              openPreview(imgUrl, scene.slug, "image")
                            }
                            className="w-full rounded-lg border border-ink-200 cursor-zoom-in"
                          />
                        )}
                        {vidUrl && (
                          <video
                            src={vidUrl}
                            controls
                            muted
                            onClick={() =>
                              openPreview(vidUrl, scene.slug, "video")
                            }
                            className="w-full rounded-lg border border-ink-200 cursor-pointer"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          {/* <OnlyStartButton></OnlyStartButton> */}
          <MlxVlmServerPanel />
          <div className="flex flex-col items-center justify-center gap-2 p-8 border border-dashed border-ink-200 rounded-2xl">
            <span className="text-ink-500">{ClapperIcon}</span>
            <p className="text-xs text-ink-500 italic">
              Start the LLM server to begin planning your movie.
            </p>
          </div>
        </>
      )}

      {/* ===== Preview modal ===== */}
      {preview && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-8"
          onClick={() => setPreview(null)}
        >
          <div
            className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            {preview.type === "video" ? (
              <video
                src={preview.url}
                controls
                autoPlay
                className="max-w-full max-h-[80vh] rounded-2xl shadow-2xl"
              />
            ) : (
              <img
                src={preview.url}
                alt={preview.filename}
                className="max-w-full max-h-[80vh] object-contain rounded-2xl shadow-2xl"
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
