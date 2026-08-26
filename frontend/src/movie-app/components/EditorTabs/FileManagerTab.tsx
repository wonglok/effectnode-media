import AgentWorkspace from "../AgentWorkspace";

interface Props {
  projectId: string;
}

export default function FileManagerTab({ projectId }: Props) {
  const FileManagerIcon = (
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
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );

  return (
    <div className="flex flex-col gap-7">
      <div className="flex items-center gap-2">
        <span className="text-tiffany-600">{FileManagerIcon}</span>
        <h2 className="text-base font-semibold text-ink-900">File Manager</h2>
      </div>

      <AgentWorkspace projectId={projectId} title="Project Files" scope="project" />
    </div>
  );
}
