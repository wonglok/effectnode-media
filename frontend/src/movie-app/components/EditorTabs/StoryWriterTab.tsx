import { useGenerationStore } from "../../stores/generationStore";
import { ChatUI } from "../ChatUI/ChatUI";
import MlxVlmServerPanel from "./MlxVlmServerPanel";

interface Props {
  projectId: string;
}

export default function StoryWriterTab({ projectId }: Props) {
  const store = useGenerationStore();

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

  return (
    <div className="flex flex-col gap-7">
      <div className="flex items-center gap-2">
        <span className="text-tiffany-600">{StoryWriterIcon}</span>
        <h2 className="text-base font-semibold text-ink-900">Story Writer</h2>
      </div>

      {store.agent.serverRunning && store.agent.serverOnline ? null : (
        <MlxVlmServerPanel />
      )}

      {store.agent.serverRunning && store.agent.serverOnline ? (
        <ChatUI projectId={projectId} agent="story-writer" />
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 p-8 border border-dashed border-ink-200 rounded-2xl">
          <span className="text-ink-500">{StoryWriterIcon}</span>
          <p className="text-xs text-ink-500 italic">
            Start the LLM server to plan videos and build scene CSV scripts.
          </p>
        </div>
      )}
    </div>
  );
}
