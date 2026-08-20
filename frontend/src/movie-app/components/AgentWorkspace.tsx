import { useEffect, useRef, useState } from "react";
import {
  useWorkspaceStore,
  workspacePreviewUrl,
  type WorkspaceFile,
} from "../stores/workspaceStore";

interface Props {
  projectId: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AgentWorkspace({ projectId }: Props) {
  const ws = useWorkspaceStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const [preview, setPreview] = useState<WorkspaceFile | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [editing, setEditing] = useState<WorkspaceFile | null>(null);
  const [editContent, setEditContent] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    ws.fetchFiles(projectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    if (!preview || !listRef.current) return;
    const index = ws.files.findIndex((f) => f.path === preview.path);
    if (index < 0) return;
    const items = listRef.current.querySelectorAll("li");
    if (items[index]) items[index].scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview]);

  // ========== Handlers ==========

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      ws.uploadFile(projectId, reader.result as string, file.name);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleSelect = async (f: WorkspaceFile) => {
    setEditing(null);
    setPreview(f);
    if (f.kind === "text") {
      const content = await ws.readFileContent(projectId, f.path);
      setPreviewContent(content ?? "");
    } else {
      setPreviewContent(null);
    }
  };

  const handleListKeyDown = (e: React.KeyboardEvent<HTMLUListElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
    if (ws.files.length === 0) return;

    e.preventDefault();
    const currentIndex = preview
      ? ws.files.findIndex((f) => f.path === preview.path)
      : -1;
    let nextIndex = e.key === "ArrowDown" ? currentIndex + 1 : currentIndex - 1;
    if (nextIndex < 0) nextIndex = 0;
    if (nextIndex >= ws.files.length) nextIndex = ws.files.length - 1;

    if (nextIndex !== currentIndex) handleSelect(ws.files[nextIndex]);
  };

  const handleEdit = async (f: WorkspaceFile) => {
    setPreview(null);
    const content = await ws.readFileContent(projectId, f.path);
    setEditing(f);
    setEditContent(content ?? "");
  };

  const handleSave = async () => {
    if (!editing) return;
    await ws.writeFileContent(projectId, editing.path, editContent);
    setEditing(null);
  };

  const handleRename = (f: WorkspaceFile) => {
    setRenaming(f.path);
    setRenameValue(f.name);
  };

  const confirmRename = async (f: WorkspaceFile) => {
    const name = renameValue.trim();
    // Only bare filenames — no separators, `..`, or leading dots.
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) {
      setRenaming(null);
      return;
    }
    const dir = f.path.slice(0, f.path.lastIndexOf("/") + 1);
    await ws.renameFile(projectId, f.path, dir + name);
    setRenaming(null);
  };

  const handleDelete = (f: WorkspaceFile) => {
    setConfirmDelete(f.path);
  };

  const confirmDeleteAction = async () => {
    if (!confirmDelete) return;
    const path = confirmDelete;
    await ws.removeFile(projectId, path);
    setConfirmDelete(null);
    if (preview?.path === path) {
      setPreview(null);
      setPreviewContent(null);
    }
    if (editing?.path === path) setEditing(null);
  };

  useEffect(() => {
    if (!confirmDelete) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setConfirmDelete(null);
      } else if (e.key === "Enter") {
        e.preventDefault();
        confirmDeleteAction();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmDelete]);

  // ========== SVG Icons ==========

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

  const RefreshIcon = (
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
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  );

  const FolderIcon = (
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
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
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

  const PencilIcon = (
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
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );

  const FileIcon = (
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
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );

  const ImageIcon = (
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
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );

  const VideoIcon = (
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
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  );

  const CloseIcon = (
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
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );

  const kindIcon = (f: WorkspaceFile) => {
    if (f.kind === "image")
      return <span className="text-tiffany-600">{ImageIcon}</span>;
    if (f.kind === "video")
      return <span className="text-tiffany-600">{VideoIcon}</span>;
    if (f.kind === "text")
      return <span className="text-tiffany-600">{FileIcon}</span>;
    return <span className="text-ink-500">{FileIcon}</span>;
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Header + upload */}
      <div className="flex items-center justify-between">
        <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider">
          Agent Workspace
        </label>
        <div className="flex items-center gap-2">
          <button
            onClick={() => ws.fetchFiles(projectId)}
            title="Refresh"
            className="flex items-center justify-center w-8 h-8 rounded-xl border transition-all bg-white border-ink-200 text-ink-600 hover:border-ink-300"
          >
            {RefreshIcon}
          </button>
          <button
            onClick={() => ws.openWorkspace(projectId)}
            title="Open workspace folder"
            className="flex items-center justify-center w-8 h-8 rounded-xl border transition-all bg-white border-ink-200 text-ink-600 hover:border-ink-300"
          >
            {FolderIcon}
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border transition-all bg-white border-ink-200 text-ink-600 hover:border-ink-300"
          >
            {UploadIcon}
            Upload File
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*,text/*,.csv,.md,.txt,.json,.log"
          onChange={handleUpload}
          className="hidden"
        />
      </div>

      {ws.error && (
        <div className="p-2 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs">
          {ws.error}
        </div>
      )}

      <div className="flex gap-3 items-start">
        {/* Left column: file list + editor */}
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          {/* File list */}
          <div className="border border-ink-200 rounded-2xl overflow-hidden">
            <div className="max-h-64 overflow-y-auto">
              {ws.loading ? (
                <p className="text-xs text-ink-500 italic text-center py-6">
                  Loading files...
                </p>
              ) : ws.files.length === 0 ? (
                <p className="text-xs text-ink-500 italic text-center py-6">
                  No files yet. Upload a file or let the agent save a memory.
                </p>
              ) : (
                <ul
                  ref={listRef}
                  tabIndex={0}
                  onKeyDown={handleListKeyDown}
                  className="divide-y divide-ink-200 outline-none focus:ring-2 focus:ring-inset focus:ring-tiffany-500"
                >
                  {ws.files.map((f) => (
                    <li
                      key={f.path}
                      onClick={() => handleSelect(f)}
                      className={`flex items-center gap-2 px-3 py-2 hover:bg-ink-100/60 transition-colors cursor-pointer ${
                        preview?.path === f.path ? "bg-ink-100/60" : ""
                      }`}
                    >
                      {kindIcon(f)}
                      <div className="flex-1 min-w-0">
                        {renaming === f.path ? (
                          <input
                            type="text"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") confirmRename(f);
                              if (e.key === "Escape") setRenaming(null);
                            }}
                            autoFocus
                            className="w-full px-2 py-1 bg-white border border-ink-300 rounded text-xs text-ink-900 focus:outline-none focus:ring-1 focus:ring-tiffany-500"
                          />
                        ) : (
                          <p
                            className="text-xs text-ink-800 truncate"
                            title={f.path}
                          >
                            {f.path}
                          </p>
                        )}
                        <p className="text-[10px] text-ink-500">
                          {f.kind} · {formatSize(f.size)}
                        </p>
                      </div>

                      {renaming === f.path ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            confirmRename(f);
                          }}
                          className="px-2 py-1 text-[10px] font-medium text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                        >
                          Save
                        </button>
                      ) : (
                        <>
                          {f.kind === "text" && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEdit(f);
                              }}
                              className="p-1.5 text-tiffany-600 hover:bg-ink-200 rounded transition-colors"
                              title="Edit"
                            >
                              {PencilIcon}
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRename(f);
                            }}
                            className="p-1.5 text-tiffany-600 hover:bg-ink-200 rounded transition-colors"
                            title="Rename"
                          >
                            {PencilIcon}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(f);
                            }}
                            className="p-1.5 text-red-400 hover:bg-red-50 rounded transition-colors"
                            title="Delete"
                          >
                            {TrashIcon}
                          </button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Editor panel */}
          {editing && (
            <div className="border border-ink-200 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-ink-50 border-b border-ink-200">
                <span className="text-xs font-medium text-ink-700 truncate">
                  Editing {editing.path}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleSave}
                    className="px-2 py-1 text-[10px] font-medium text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditing(null)}
                    className="p-1 text-tiffany-600 hover:bg-ink-200 rounded transition-colors"
                    title="Close"
                  >
                    {CloseIcon}
                  </button>
                </div>
              </div>
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={10}
                className="w-full px-3 py-2 bg-white text-ink-900 text-xs font-mono focus:outline-none resize-y"
              />
            </div>
          )}
        </div>

        {/* Right column: preview pane */}
        <div className="w-72 shrink-0">
          <div className="border border-ink-200 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-ink-50 border-b border-ink-200">
              <span className="text-xs font-medium text-ink-700 truncate">
                {preview ? preview.path : "Preview"}
              </span>
              {preview && (
                <button
                  onClick={() => {
                    setPreview(null);
                    setPreviewContent(null);
                  }}
                  className="p-1 text-tiffany-600 hover:bg-ink-200 rounded transition-colors"
                  title="Close"
                >
                  {CloseIcon}
                </button>
              )}
            </div>
            <div className="p-2 flex justify-center bg-ink-100/60">
              {!preview ? (
                <p className="text-xs text-ink-500 italic text-center py-10">
                  Select a file to preview
                </p>
              ) : preview.kind === "image" ? (
                <img
                  src={workspacePreviewUrl(projectId, preview.path)}
                  alt={preview.name}
                  className="max-h-72 max-w-full object-contain"
                />
              ) : preview.kind === "video" ? (
                <video
                  src={workspacePreviewUrl(projectId, preview.path)}
                  controls
                  className="max-h-72 max-w-full"
                />
              ) : preview.kind === "text" ? (
                <pre className="w-full max-h-72 overflow-auto p-2 bg-white rounded text-[11px] text-ink-800 whitespace-pre-wrap break-words">
                  {previewContent ?? ""}
                </pre>
              ) : (
                <p className="text-xs text-ink-500 italic text-center py-10">
                  No preview available
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-3xl shadow-card p-6 w-80">
            <h3 className="text-sm font-semibold text-ink-900 mb-2">
              Delete File
            </h3>
            <p className="text-xs text-ink-600 mb-4">
              Are you sure you want to delete "{confirmDelete}"? This action
              cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-3 py-2 text-xs font-medium rounded-xl border border-ink-200 text-ink-600 hover:bg-ink-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteAction}
                className="px-3 py-2 text-xs font-medium rounded-xl bg-red-500 hover:bg-red-600 text-white transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
