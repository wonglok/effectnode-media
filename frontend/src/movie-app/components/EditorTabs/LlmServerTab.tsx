import MlxVlmServerPanel from "./MlxVlmServerPanel";

/**
 * Dedicated LLM Server tab. Reuses the shared mlx-vlm server panel so it
 * controls the same single backend server process as the Agent and
 * References-to-Video pages.
 */
export default function LlmServerTab() {
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
      className="text-tiffany-600"
    >
      <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
      <line x1="6" y1="6" x2="6.01" y2="6" />
      <line x1="6" y1="18" x2="6.01" y2="18" />
    </svg>
  );

  return (
    <div className="flex flex-col gap-7">
      <div className="flex items-center gap-2">
        {ServerIcon}
        <h2 className="text-base font-semibold text-ink-900">
          LLM Server
        </h2>
      </div>

      <MlxVlmServerPanel />
    </div>
  );
}
