import { useGenerationStore } from "../../stores/generationStore";
import { ChatUI } from "../ChatUI/ChatUI";
import AgentWorkspace from "../AgentWorkspace";
import MlxVlmServerPanel from "./MlxVlmServerPanel";
// import MlxVlmServerPanel from "./MlxVlmServerPanel";

interface Props {
  projectId: string;
}

export default function AgentTab({ projectId }: Props) {
  const store = useGenerationStore();

  // ========== SVG Icons ==========

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

  return (
    <div className="flex flex-col gap-7">
      <div className="flex items-center gap-2">
        <span className="text-tiffany-600">{AgentIcon}</span>
        <h2 className="text-base font-semibold text-ink-900">Agent</h2>
      </div>

      {store.agent.serverRunning && store.agent.serverOnline ? null : (
        <MlxVlmServerPanel />
      )}

      {store.agent.serverRunning && store.agent.serverOnline ? (
        <div className="">
          <ChatUI projectId={projectId} />
          <div className="h-4" />
          <AgentWorkspace projectId={projectId} />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 p-8 border border-dashed border-ink-200 rounded-2xl">
          <span className="text-ink-500">{AgentIcon}</span>
          <p className="text-xs text-ink-500 italic">
            Start the LLM server to chat with the agent.{" "}
          </p>
        </div>
      )}
    </div>
  );
}
