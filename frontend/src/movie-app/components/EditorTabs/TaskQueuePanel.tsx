import {
  useQueueStore,
  type QueueTask,
  type QueueTaskStatus,
} from "../../stores/queueStore";

interface Props {
  projectId: string;
}

const STATUS_META: Record<
  QueueTaskStatus,
  { label: string; badgeClass: string; dotClass: string }
> = {
  pending: {
    label: "Queued",
    badgeClass: "bg-ink-100 text-ink-600 border-ink-200",
    dotClass: "bg-ink-400",
  },
  running: {
    label: "Running",
    badgeClass: "bg-tiffany-50 text-tiffany-700 border-tiffany-200",
    dotClass: "bg-tiffany-500",
  },
  completed: {
    label: "Done",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dotClass: "bg-emerald-500",
  },
  failed: {
    label: "Failed",
    badgeClass: "bg-red-50 text-red-700 border-red-200",
    dotClass: "bg-red-500",
  },
  cancelled: {
    label: "Cancelled",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
    dotClass: "bg-amber-500",
  },
  paused: {
    label: "Paused",
    badgeClass: "bg-violet-50 text-violet-700 border-violet-200",
    dotClass: "bg-violet-500",
  },
};

const QueueIcon = (
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
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" />
    <line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);

const StopIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <rect x="5" y="5" width="14" height="14" rx="2" />
  </svg>
);

const ClearIcon = (
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
    <path d="M3 6h18" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);

const PauseIcon = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="currentColor"
  >
    <rect x="6" y="4" width="4" height="16" rx="1" />
    <rect x="14" y="4" width="4" height="16" rx="1" />
  </svg>
);

const PlayIcon = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="currentColor"
  >
    <path d="M8 5v14l11-7z" />
  </svg>
);

function StatusBadge({ status }: { status: QueueTaskStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${meta.badgeClass}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dotClass}`} />
      {meta.label}
    </span>
  );
}

function TaskRow({
  task,
  onCancel,
}: {
  task: QueueTask;
  onCancel: () => void;
}) {
  const active = task.status === "pending" || task.status === "running";
  const cancellable = active || task.status === "paused";
  const progress =
    task.progress && task.progress.total > 0
      ? Math.round((task.progress.current / task.progress.total) * 100)
      : null;

  return (
    <li className="flex flex-col gap-1.5 px-3 py-2 rounded-xl border border-ink-200 bg-white">
      <div className="flex items-center gap-2">
        <StatusBadge status={task.status} />
        <span className="flex-1 text-sm font-medium text-ink-800 truncate">
          {task.label}
        </span>
        {cancellable && (
          <button
            onClick={onCancel}
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-lg border border-ink-200 text-ink-600 hover:border-red-300 hover:text-red-600 transition-colors"
          >
            {StopIcon}
            Cancel
          </button>
        )}
      </div>

      {active && task.statusText && (
        <span className="text-xs text-ink-600 truncate">{task.statusText}</span>
      )}

      {active && progress !== null && (
        <progress
          value={task.progress!.current}
          max={task.progress!.total}
          className="w-full h-2 [&::-webkit-progress-bar]:bg-ink-100 [&::-webkit-progress-value]:bg-tiffany-500"
        />
      )}

      {task.status === "failed" && task.error && (
        <span className="text-xs text-red-600 whitespace-pre-wrap">
          {task.error}
        </span>
      )}
    </li>
  );
}

export default function TaskQueuePanel({ projectId }: Props) {
  const tasks = useQueueStore((s) => s.tasks);
  const paused = useQueueStore((s) => s.paused);
  const cancel = useQueueStore((s) => s.cancel);
  const pause = useQueueStore((s) => s.pause);
  const resume = useQueueStore((s) => s.resume);
  const clearFinished = useQueueStore((s) => s.clearFinished);

  if (tasks.length === 0 && !paused) return null;

  const hasActive = tasks.some(
    (t) => t.status === "pending" || t.status === "running",
  );
  const hasFinished = tasks.some(
    (t) => t.status !== "pending" && t.status !== "running" && t.status !== "paused",
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-tiffany-600">{QueueIcon}</span>
        <h3 className="text-sm font-semibold text-ink-900">Generation Queue</h3>
        <span className="text-xs text-ink-500">{tasks.length}</span>
        <div className="ml-auto flex items-center gap-2">
          {paused ? (
            <button
              onClick={() => resume(projectId)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-xl bg-tiffany-500 hover:bg-tiffany-600 text-ink-950 transition-colors"
            >
              {PlayIcon}
              Resume
            </button>
          ) : (
            hasActive && (
              <button
                onClick={() => pause(projectId)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-xl border border-ink-200 text-ink-600 hover:border-ink-300 hover:text-ink-900 transition-colors"
              >
                {PauseIcon}
                Pause
              </button>
            )
          )}
          {hasFinished && (
            <button
              onClick={() => clearFinished(projectId)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-xl border border-ink-200 text-ink-600 hover:border-ink-300 hover:text-ink-900 transition-colors"
            >
              {ClearIcon}
              Clear finished
            </button>
          )}
        </div>
      </div>

      <ul className="flex flex-col gap-1.5">
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            onCancel={() => cancel(projectId, task.id)}
          />
        ))}
      </ul>
    </div>
  );
}
