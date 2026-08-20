import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useProjectStore, type Project } from "../stores/projectStore";
import { useGenerationStore } from "../stores/generationStore";
import ExtendVideoTab from "./EditorTabs/ExtendVideoTab";
import FastImageEditTab from "./EditorTabs/FastImageEditTab";
import MovieStudioTab from "./EditorTabs/MovieStudioTab";
import GenerateVideoTab from "./EditorTabs/GenerateVideoTab";
import AgentTab from "./EditorTabs/AgentTab";
import StoryWriterTab from "./EditorTabs/StoryWriterTab";
import CharactersTab from "./EditorTabs/CharactersTab";
import ExtractImageTab from "./EditorTabs/ExtractImageTab";
import SceneVisualTab from "./EditorTabs/SceneVisualTab";
import TextToImageTab from "./EditorTabs/TextToImageTab";
import ReferencesToVideoTab from "./EditorTabs/ReferencesToVideoTab";
import BatchVideoTab from "./EditorTabs/BatchVideoTab";
import BatchImageToVideoTab from "./EditorTabs/BatchImageToVideoTab";
import BatchVoiceVideoTab from "./EditorTabs/BatchVoiceVideoTab";
import LlmServerTab from "./EditorTabs/LlmServerTab";

export default function ProjectEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { projects, fetchProjects } = useProjectStore();
  const [project, setProject] = useState<Project | null>(null);

  // Zustand generation store
  const store = useGenerationStore();

  useEffect(() => {
    if (projects.length === 0) {
      fetchProjects();
    }
  }, []);

  useEffect(() => {
    const found = projects.find((p) => p.id === id) || null;
    setProject(found);
  }, [id, projects]);

  // Fetch project images and videos on mount
  useEffect(() => {
    if (id) {
      store.fetchProjectImages(id);
      store.fetchProjectVideos(id);
    }
  }, [id]);

  // Poll the LLM server status so the tab label light stays accurate
  // regardless of which tab is active.
  useEffect(() => {
    store.checkAgentStatus();
    store.checkServerOnline();
    const interval = setInterval(() => {
      store.checkServerOnline();
    }, 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ========== SVG Icons ==========

  const BackIcon = (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );

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

  const ExtendIcon = (
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
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
      <line x1="5" y1="12" x2="11" y2="12" />
      <line x1="8" y1="9" x2="8" y2="15" />
    </svg>
  );

  const FastImageEditIcon = (
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
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );

  const MovieStudioIcon = (
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

  const AgentIcon = (
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
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <circle cx="9" cy="9" r="1" />
      <circle cx="15" cy="9" r="1" />
      <line x1="9" y1="14" x2="15" y2="14" />
    </svg>
  );

  const StoryWriterIcon = (
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
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );

  const CharacterIcon = (
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
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );

  const ExtractIcon = (
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
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );

  const SceneVisualIcon = (
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

  const TextToImageIcon = (
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
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );

  const ReferencesToVideoIcon = (
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
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );

  const BatchVideoIcon = (
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
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
      <line x1="9" y1="3" x2="9" y2="21" />
    </svg>
  );

  const BatchVoiceIcon = (
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

  const BatchImageToVideoIcon = (
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
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );

  const ServerIcon = (
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
      <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
      <line x1="6" y1="6" x2="6.01" y2="6" />
      <line x1="6" y1="18" x2="6.01" y2="18" />
    </svg>
  );

  const ServerStatusLight = () => (
    <span
      className={`w-2.5 h-2.5 rounded-full ${
        store.agent.serverOnline === true
          ? "bg-emerald-500 shadow-[0_0_6px_2px_rgba(16,185,129,0.5)]"
          : store.agent.serverOnline === false
            ? "bg-red-500 shadow-[0_0_6px_2px_rgba(239,68,68,0.5)]"
            : "bg-tiffany-500"
      }`}
    />
  );

  // ========== Loading / Not Found ==========

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-ink-50">
        <div className="w-16 h-16 bg-ink-100 rounded-3xl flex items-center justify-center mb-4">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#81d8d0"
            strokeWidth="1.5"
          >
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-ink-800 mb-3">
          Project not found
        </p>
        <button
          onClick={() => navigate("/app")}
          className="flex items-center gap-1.5 px-4 py-2 bg-ink-100 hover:bg-ink-300 text-ink-700 text-sm font-medium rounded-2xl transition-colors"
        >
          {BackIcon}
          Back to Projects
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-ink-50">
      {/* Top bar */}
      <div className="flex items-center gap-6 px-8 py-5 bg-white border-b border-ink-200 mb-8">
        <button
          onClick={() => {
            store.resetAll();
            navigate("/app");
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-ink-50 hover:bg-ink-200 text-ink-700 text-sm font-medium rounded-2xl transition-colors border border-ink-200/60"
        >
          {BackIcon}
          Back
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-ink-900 tracking-tight">
            {project.name}
          </h1>
          {project.description && (
            <p className="text-xs text-ink-600/60 mt-0.5">
              {project.description}
            </p>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-8 pb-8">
        <div className="bg-white border border-ink-200 rounded-3xl shadow-card p-8 min-h-full">
          {/* ========== TAB BAR ========== */}
          <div className="flex items-center gap-1.5 border-b border-ink-200 pb-5 mb-4 flex-wrap">
            <button
              onClick={() => store.setActiveTab("movieStudio")}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-2xl transition-all ${
                store.activeTab === "movieStudio"
                  ? "bg-tiffany-500/10 text-tiffany-700 shadow-glow-sm"
                  : "text-ink-600 hover:bg-ink-100 hover:text-ink-800"
              }`}
            >
              {MovieStudioIcon}
              Movie Studio
            </button>
            <button
              onClick={() => store.setActiveTab("video")}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-2xl transition-all ${
                store.activeTab === "video"
                  ? "bg-tiffany-500/10 text-tiffany-700 shadow-glow-sm"
                  : "text-ink-600 hover:bg-ink-100 hover:text-ink-800"
              }`}
            >
              {VideoIcon}
              Generate Avatar ideo
            </button>
            <button
              onClick={() => store.setActiveTab("extend")}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-2xl transition-all ${
                store.activeTab === "extend"
                  ? "bg-tiffany-500/10 text-tiffany-700 shadow-glow-sm"
                  : "text-ink-600 hover:bg-ink-100 hover:text-ink-800"
              }`}
            >
              {ExtendIcon}
              Extend Video
            </button>
            <button
              onClick={() => store.setActiveTab("fastImageEdit")}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-2xl transition-all ${
                store.activeTab === "fastImageEdit"
                  ? "bg-tiffany-500/10 text-tiffany-700 shadow-glow-sm"
                  : "text-ink-600 hover:bg-ink-100 hover:text-ink-800"
              }`}
            >
              {FastImageEditIcon}
              Fast Image Edit
            </button>
            <button
              onClick={() => store.setActiveTab("agent")}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-2xl transition-all ${
                store.activeTab === "agent"
                  ? "bg-tiffany-500/10 text-tiffany-700 shadow-glow-sm"
                  : "text-ink-600 hover:bg-ink-100 hover:text-ink-800"
              }`}
            >
              {AgentIcon}
              Agent
            </button>
            <button
              onClick={() => store.setActiveTab("storyWriter")}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-2xl transition-all ${
                store.activeTab === "storyWriter"
                  ? "bg-tiffany-500/10 text-tiffany-700 shadow-glow-sm"
                  : "text-ink-600 hover:bg-ink-100 hover:text-ink-800"
              }`}
            >
              {StoryWriterIcon}
              Story Writer
            </button>
            <button
              onClick={() => store.setActiveTab("characters")}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-2xl transition-all ${
                store.activeTab === "characters"
                  ? "bg-tiffany-500/10 text-tiffany-700 shadow-glow-sm"
                  : "text-ink-600 hover:bg-ink-100 hover:text-ink-800"
              }`}
            >
              {CharacterIcon}
              Characters
            </button>
            <button
              onClick={() => store.setActiveTab("extract")}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-2xl transition-all ${
                store.activeTab === "extract"
                  ? "bg-tiffany-500/10 text-tiffany-700 shadow-glow-sm"
                  : "text-ink-600 hover:bg-ink-100 hover:text-ink-800"
              }`}
            >
              {ExtractIcon}
              Extract Image
            </button>
            <button
              onClick={() => store.setActiveTab("sceneVisual")}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-2xl transition-all ${
                store.activeTab === "sceneVisual"
                  ? "bg-tiffany-500/10 text-tiffany-700 shadow-glow-sm"
                  : "text-ink-600 hover:bg-ink-100 hover:text-ink-800"
              }`}
            >
              {SceneVisualIcon}
              Scene Visual
            </button>
            <button
              onClick={() => store.setActiveTab("textToImage")}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-2xl transition-all ${
                store.activeTab === "textToImage"
                  ? "bg-tiffany-500/10 text-tiffany-700 shadow-glow-sm"
                  : "text-ink-600 hover:bg-ink-100 hover:text-ink-800"
              }`}
            >
              {TextToImageIcon}
              Text-to-Image
            </button>
            <button
              onClick={() => store.setActiveTab("referencesToVideo")}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-2xl transition-all ${
                store.activeTab === "referencesToVideo"
                  ? "bg-tiffany-500/10 text-tiffany-700 shadow-glow-sm"
                  : "text-ink-600 hover:bg-ink-100 hover:text-ink-800"
              }`}
            >
              {ReferencesToVideoIcon}
              References to Video
            </button>
            <button
              onClick={() => store.setActiveTab("batchVideo")}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-2xl transition-all ${
                store.activeTab === "batchVideo"
                  ? "bg-tiffany-500/10 text-tiffany-700 shadow-glow-sm"
                  : "text-ink-600 hover:bg-ink-100 hover:text-ink-800"
              }`}
            >
              {BatchVideoIcon}
              Batch Video
            </button>
            <button
              onClick={() => store.setActiveTab("batchImageToVideo")}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-2xl transition-all ${
                store.activeTab === "batchImageToVideo"
                  ? "bg-tiffany-500/10 text-tiffany-700 shadow-glow-sm"
                  : "text-ink-600 hover:bg-ink-100 hover:text-ink-800"
              }`}
            >
              {BatchImageToVideoIcon}
              Batch Image to Video
            </button>
            <button
              onClick={() => store.setActiveTab("batchVoice")}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-2xl transition-all ${
                store.activeTab === "batchVoice"
                  ? "bg-tiffany-500/10 text-tiffany-700 shadow-glow-sm"
                  : "text-ink-600 hover:bg-ink-100 hover:text-ink-800"
              }`}
            >
              {BatchVoiceIcon}
              Batch Videos with Voice Over
            </button>
            <button
              onClick={() => store.setActiveTab("llmServer")}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-2xl transition-all ${
                store.activeTab === "llmServer"
                  ? "bg-tiffany-500/10 text-tiffany-700 shadow-glow-sm"
                  : "text-ink-600 hover:bg-ink-100 hover:text-ink-800"
              }`}
            >
              {ServerIcon}
              LLM Server
              <ServerStatusLight />
            </button>
          </div>

          {/* ========== MOVIE STUDIO PANEL ========== */}
          {store.activeTab === "movieStudio" && (
            <MovieStudioTab projectId={id!} />
          )}

          {/* ========== FAST IMAGE EDIT PANEL ========== */}
          {store.activeTab === "fastImageEdit" && (
            <FastImageEditTab projectId={id!} />
          )}

          {/* ========== VIDEO GENERATION PANEL ========== */}
          {store.activeTab === "video" && <GenerateVideoTab projectId={id!} />}

          {/* ========== EXTEND VIDEO PANEL ========== */}
          {store.activeTab === "extend" && <ExtendVideoTab projectId={id!} />}

          {/* ========== AGENT PANEL ========== */}
          {store.activeTab === "agent" && <AgentTab projectId={id!} />}

          {/* ========== STORY WRITER PANEL ========== */}
          {store.activeTab === "storyWriter" && (
            <StoryWriterTab projectId={id!} />
          )}

          {/* ========== CHARACTERS PANEL ========== */}
          {store.activeTab === "characters" && (
            <CharactersTab projectId={id!} />
          )}

          {/* ========== EXTRACT IMAGE PANEL ========== */}
          {store.activeTab === "extract" && <ExtractImageTab projectId={id!} />}

          {/* ========== SCENE VISUAL PANEL ========== */}
          {store.activeTab === "sceneVisual" && (
            <SceneVisualTab projectId={id!} />
          )}

          {/* ========== TEXT-TO-IMAGE PANEL ========== */}
          {store.activeTab === "textToImage" && (
            <TextToImageTab projectId={id!} />
          )}

          {/* ========== REFERENCES TO VIDEO PANEL ========== */}
          {store.activeTab === "referencesToVideo" && (
            <ReferencesToVideoTab projectId={id!} />
          )}

          {/* ========== BATCH VIDEO PANEL ========== */}
          {store.activeTab === "batchVideo" && (
            <BatchVideoTab projectId={id!} />
          )}

          {/* ========== BATCH IMAGE TO VIDEO PANEL ========== */}
          {store.activeTab === "batchImageToVideo" && (
            <BatchImageToVideoTab projectId={id!} />
          )}

          {/* ========== BATCH VOICE VIDEO PANEL ========== */}
          {store.activeTab === "batchVoice" && (
            <BatchVoiceVideoTab projectId={id!} />
          )}

          {/* ========== LLM SERVER PANEL ========== */}
          {store.activeTab === "llmServer" && <LlmServerTab />}
        </div>
      </div>
    </div>
  );
}
