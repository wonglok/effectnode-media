import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useProjectStore, type Project } from "../stores/projectStore";
import {
  useGenerationStore,
  type GenerationTab,
} from "../stores/generationStore";
import FastImageEditTab from "./EditorTabs/FastImageEditTab";
import MovieStudioTab from "./EditorTabs/MovieStudioTab";
import GenerateVideoTab from "./EditorTabs/GenerateVideoTab";
import AgentTab from "./EditorTabs/AgentTab";
import StoryWriterTab from "./EditorTabs/StoryWriterTab";
import TextToImageTab from "./EditorTabs/TextToImageTab";
import BatchVideoTab from "./EditorTabs/BatchVideoTab";
import BatchImageToVideoTab from "./EditorTabs/BatchImageToVideoTab";
import LlmServerTab from "./EditorTabs/LlmServerTab";
import SetupAiModelTab from "./EditorTabs/SetupAiModelTab";
import UpscaleTab from "./EditorTabs/UpscaleTab";
import VoiceCloneTab from "./EditorTabs/VoiceCloneTab";
import AudioToVideoTab from "./EditorTabs/AudioToVideoTab";
import AdvancedVoiceCloneTab from "./EditorTabs/AdvancedVoiceCloneTab";

const TAB_KEYS: GenerationTab[] = [
  "movieStudio",
  "video",
  "fastImageEdit",
  "agent",
  "storyWriter",
  "textToImage",
  "batchVideo",
  "batchImageToVideo",
  "llmServer",
  "aiModels",
  "upscale",
  "voiceClone",
  "advancedVoiceClone",
  "audioToVideo",
];

export default function ProjectEditorPage() {
  const { projectID: id, tab } = useParams<{ projectID: string; tab?: string }>();
  const navigate = useNavigate();
  const { projects, fetchProjects } = useProjectStore();
  const [project, setProject] = useState<Project | null>(null);

  // The active tab is driven by the URL: /projects/:projectID/:tab.
  const activeTab: GenerationTab = TAB_KEYS.includes(tab as GenerationTab)
    ? (tab as GenerationTab)
    : "movieStudio";
  const goToTab = (next: GenerationTab) => navigate(`/projects/${id}/${next}`);

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

  // Redirect bare or unknown tab URLs to the default tab.
  useEffect(() => {
    if (!tab || !TAB_KEYS.includes(tab as GenerationTab)) {
      navigate(`/projects/${id}/movieStudio`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, tab]);

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

  const AiModelIcon = (
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
      <rect x="4" y="4" width="16" height="16" rx="2" ry="2" />
      <rect x="9" y="9" width="6" height="6" />
      <line x1="9" y1="1" x2="9" y2="4" />
      <line x1="15" y1="1" x2="15" y2="4" />
      <line x1="9" y1="20" x2="9" y2="23" />
      <line x1="15" y1="20" x2="15" y2="23" />
      <line x1="20" y1="9" x2="23" y2="9" />
      <line x1="20" y1="14" x2="23" y2="14" />
      <line x1="1" y1="9" x2="4" y2="9" />
      <line x1="1" y1="14" x2="4" y2="14" />
    </svg>
  );

  const UpscaleIcon = (
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
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );

  const VoiceCloneIcon = (
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

  const AudioToVideoIcon = (
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
      <line x1="4" y1="20" x2="8" y2="20" />
    </svg>
  );

  const AdvancedVoiceCloneIcon = (
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
      <path d="M5 3v4" />
      <path d="M3 5h4" />
    </svg>
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
              onClick={() => goToTab("movieStudio")}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-2xl transition-all ${
                activeTab === "movieStudio"
                  ? "bg-tiffany-500/10 text-tiffany-700 shadow-glow-sm"
                  : "text-ink-600 hover:bg-ink-100 hover:text-ink-800"
              }`}
            >
              {MovieStudioIcon}
              Movie Studio
            </button>
            <button
              onClick={() => goToTab("video")}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-2xl transition-all ${
                activeTab === "video"
                  ? "bg-tiffany-500/10 text-tiffany-700 shadow-glow-sm"
                  : "text-ink-600 hover:bg-ink-100 hover:text-ink-800"
              }`}
            >
              {VideoIcon}
              Scene Video Generation
            </button>
            <button
              onClick={() => goToTab("fastImageEdit")}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-2xl transition-all ${
                activeTab === "fastImageEdit"
                  ? "bg-tiffany-500/10 text-tiffany-700 shadow-glow-sm"
                  : "text-ink-600 hover:bg-ink-100 hover:text-ink-800"
              }`}
            >
              {FastImageEditIcon}
              Fast Image Edit
            </button>
            <button
              onClick={() => goToTab("agent")}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-2xl transition-all ${
                activeTab === "agent"
                  ? "bg-tiffany-500/10 text-tiffany-700 shadow-glow-sm"
                  : "text-ink-600 hover:bg-ink-100 hover:text-ink-800"
              }`}
            >
              {AgentIcon}
              Agent
            </button>
            <button
              onClick={() => goToTab("storyWriter")}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-2xl transition-all ${
                activeTab === "storyWriter"
                  ? "bg-tiffany-500/10 text-tiffany-700 shadow-glow-sm"
                  : "text-ink-600 hover:bg-ink-100 hover:text-ink-800"
              }`}
            >
              {StoryWriterIcon}
              Story Writer
            </button>
            <button
              onClick={() => goToTab("textToImage")}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-2xl transition-all ${
                activeTab === "textToImage"
                  ? "bg-tiffany-500/10 text-tiffany-700 shadow-glow-sm"
                  : "text-ink-600 hover:bg-ink-100 hover:text-ink-800"
              }`}
            >
              {TextToImageIcon}
              Text-to-Image
            </button>
            <button
              onClick={() => goToTab("batchVideo")}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-2xl transition-all ${
                activeTab === "batchVideo"
                  ? "bg-tiffany-500/10 text-tiffany-700 shadow-glow-sm"
                  : "text-ink-600 hover:bg-ink-100 hover:text-ink-800"
              }`}
            >
              {BatchVideoIcon}
              Batch Video
            </button>
            <button
              onClick={() => goToTab("batchImageToVideo")}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-2xl transition-all ${
                activeTab === "batchImageToVideo"
                  ? "bg-tiffany-500/10 text-tiffany-700 shadow-glow-sm"
                  : "text-ink-600 hover:bg-ink-100 hover:text-ink-800"
              }`}
            >
              {BatchImageToVideoIcon}
              Batch Image to Video
            </button>
            <button
              onClick={() => goToTab("llmServer")}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-2xl transition-all ${
                activeTab === "llmServer"
                  ? "bg-tiffany-500/10 text-tiffany-700 shadow-glow-sm"
                  : "text-ink-600 hover:bg-ink-100 hover:text-ink-800"
              }`}
            >
              {ServerIcon}
              LLM Server
              <ServerStatusLight />
            </button>
            <button
              onClick={() => goToTab("upscale")}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-2xl transition-all ${
                activeTab === "upscale"
                  ? "bg-tiffany-500/10 text-tiffany-700 shadow-glow-sm"
                  : "text-ink-600 hover:bg-ink-100 hover:text-ink-800"
              }`}
            >
              {UpscaleIcon}
              Upscale Media
            </button>
            <button
              onClick={() => goToTab("voiceClone")}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-2xl transition-all ${
                activeTab === "voiceClone"
                  ? "bg-tiffany-500/10 text-tiffany-700 shadow-glow-sm"
                  : "text-ink-600 hover:bg-ink-100 hover:text-ink-800"
              }`}
            >
              {VoiceCloneIcon}
              Voice Clone
            </button>
            <button
              onClick={() => goToTab("advancedVoiceClone")}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-2xl transition-all ${
                activeTab === "advancedVoiceClone"
                  ? "bg-tiffany-500/10 text-tiffany-700 shadow-glow-sm"
                  : "text-ink-600 hover:bg-ink-100 hover:text-ink-800"
              }`}
            >
              {AdvancedVoiceCloneIcon}
              Advanced Voice Clone
            </button>
            <button
              onClick={() => goToTab("audioToVideo")}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-2xl transition-all ${
                activeTab === "audioToVideo"
                  ? "bg-tiffany-500/10 text-tiffany-700 shadow-glow-sm"
                  : "text-ink-600 hover:bg-ink-100 hover:text-ink-800"
              }`}
            >
              {AudioToVideoIcon}
              Audio to Video
            </button>
            <button
              onClick={() => goToTab("aiModels")}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-2xl transition-all ${
                activeTab === "aiModels"
                  ? "bg-tiffany-500/10 text-tiffany-700 shadow-glow-sm"
                  : "text-ink-600 hover:bg-ink-100 hover:text-ink-800"
              }`}
            >
              {AiModelIcon}
              Setup AI Models
            </button>
          </div>

          {/* ========== MOVIE STUDIO PANEL ========== */}
          {activeTab === "movieStudio" && (
            <MovieStudioTab projectId={id!} />
          )}

          {/* ========== FAST IMAGE EDIT PANEL ========== */}
          {activeTab === "fastImageEdit" && (
            <FastImageEditTab projectId={id!} />
          )}

          {/* ========== VIDEO GENERATION PANEL ========== */}
          {activeTab === "video" && <GenerateVideoTab projectId={id!} />}

          {/* ========== AGENT PANEL ========== */}
          {activeTab === "agent" && <AgentTab projectId={id!} />}

          {/* ========== STORY WRITER PANEL ========== */}
          {activeTab === "storyWriter" && (
            <StoryWriterTab projectId={id!} />
          )}

          {/* ========== TEXT-TO-IMAGE PANEL ========== */}
          {activeTab === "textToImage" && (
            <TextToImageTab projectId={id!} />
          )}

          {/* ========== BATCH VIDEO PANEL ========== */}
          {activeTab === "batchVideo" && (
            <BatchVideoTab projectId={id!} />
          )}

          {/* ========== BATCH IMAGE TO VIDEO PANEL ========== */}
          {activeTab === "batchImageToVideo" && (
            <BatchImageToVideoTab projectId={id!} />
          )}

          {/* ========== LLM SERVER PANEL ========== */}
          {activeTab === "llmServer" && <LlmServerTab />}

          {/* ========== SETUP AI MODELS PANEL ========== */}
          {activeTab === "aiModels" && <SetupAiModelTab />}

          {/* ========== UPSCALE MEDIA PANEL ========== */}
          {activeTab === "upscale" && <UpscaleTab projectId={id!} />}

          {/* ========== VOICE CLONE PANEL ========== */}
          {activeTab === "voiceClone" && (
            <VoiceCloneTab projectId={id!} />
          )}

          {/* ========== ADVANCED VOICE CLONE PANEL ========== */}
          {activeTab === "advancedVoiceClone" && (
            <AdvancedVoiceCloneTab projectId={id!} />
          )}

          {/* ========== AUDIO TO VIDEO PANEL ========== */}
          {activeTab === "audioToVideo" && (
            <AudioToVideoTab projectId={id!} />
          )}
        </div>
      </div>
    </div>
  );
}
