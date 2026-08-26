import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import {
  useWorkspaceStore,
  workspacePreviewUrl,
  type FileScope,
  type WorkspaceFile,
} from "../stores/workspaceStore";

interface Props {
  projectId: string;
  title?: string;
  scope?: FileScope;
}

type ViewMode = "list" | "grid" | "column";
type SortKey = "name" | "kind" | "size" | "mtime";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(ms: number): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

interface DirEntry {
  name: string;
  path: string;
}

/**
 * Split a flat, recursive file list into the immediate children of `dirPath`
 * ("" = root): subdirectories plus files that live directly at that level.
 */
function entriesAt(
  files: WorkspaceFile[],
  dirPath: string,
): { dirs: DirEntry[]; files: WorkspaceFile[] } {
  const prefix = dirPath ? `${dirPath}/` : "";
  const dirSet = new Set<string>();
  const dirs: DirEntry[] = [];
  const levelFiles: WorkspaceFile[] = [];

  for (const f of files) {
    if (!f.path.startsWith(prefix)) continue;
    const rest = f.path.slice(prefix.length);
    const slash = rest.indexOf("/");
    if (slash === -1) {
      levelFiles.push(f);
    } else {
      const seg = rest.slice(0, slash);
      if (!dirSet.has(seg)) {
        dirSet.add(seg);
        dirs.push({ name: seg, path: prefix + seg });
      }
    }
  }

  dirs.sort((a, b) => a.name.localeCompare(b.name));
  levelFiles.sort((a, b) => a.name.localeCompare(b.name));
  return { dirs, files: levelFiles };
}

export default function AgentWorkspace({ projectId, title, scope = "agents" }: Props) {
  const ws = useWorkspaceStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [view, setView] = useState<ViewMode>("list");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [dirStack, setDirStack] = useState<string[]>([]);

  const [preview, setPreview] = useState<WorkspaceFile | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [editing, setEditing] = useState<WorkspaceFile | null>(null);
  const [editContent, setEditContent] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    ws.fetchFiles(projectId, scope);
    setDirStack([]);
    setPreview(null);
    setPreviewContent(null);
    setEditing(null);
    setRenaming(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, scope]);

  const sortedFiles = useMemo(() => {
    const arr = [...ws.files];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "kind":
          cmp = a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name);
          break;
        case "size":
          cmp = a.size - b.size;
          break;
        case "mtime":
          cmp = a.mtime - b.mtime;
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [ws.files, sortKey, sortDir]);

  const columnPaths = useMemo(() => {
    const paths = [""];
    for (let i = 0; i < dirStack.length; i++) {
      paths.push(dirStack.slice(0, i + 1).join("/"));
    }
    return paths;
  }, [dirStack]);

  // ========== Handlers ==========

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      ws.uploadFile(projectId, reader.result as string, file.name, scope);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleSelect = async (f: WorkspaceFile) => {
    setEditing(null);
    setPreview(f);
    if (f.kind === "text") {
      const content = await ws.readFileContent(projectId, f.path, scope);
      setPreviewContent(content ?? "");
    } else {
      setPreviewContent(null);
    }
  };

  const handleEdit = async (f: WorkspaceFile) => {
    setPreview(null);
    const content = await ws.readFileContent(projectId, f.path, scope);
    setEditing(f);
    setEditContent(content ?? "");
  };

  const handleSave = async () => {
    if (!editing) return;
    await ws.writeFileContent(projectId, editing.path, editContent, scope);
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
    const newPath = dir + name;
    await ws.renameFile(projectId, f.path, newPath, scope);
    setRenaming(null);
    // Keep the preview pane pointed at the renamed file.
    setPreview((p) => (p && p.path === f.path ? { ...p, path: newPath, name } : p));
  };

  const handleDelete = (f: WorkspaceFile) => {
    setConfirmDelete(f.path);
  };

  const confirmDeleteAction = async () => {
    if (!confirmDelete) return;
    const path = confirmDelete;
    await ws.removeFile(projectId, path, scope);
    setConfirmDelete(null);
    if (preview?.path === path) {
      setPreview(null);
      setPreviewContent(null);
    }
    if (editing?.path === path) setEditing(null);
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
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
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );

  const RefreshIcon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  );

  const FolderIcon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );

  const TrashIcon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );

  const PencilIcon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );

  const FileIcon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );

  const ImageIcon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );

  const VideoIcon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  );

  const CloseIcon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );

  const ListViewIcon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );

  const GridViewIcon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </svg>
  );

  const ColumnsViewIcon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="5" height="18" rx="1" />
      <rect x="10" y="3" width="5" height="18" rx="1" />
      <rect x="17" y="3" width="5" height="18" rx="1" />
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

  const kindColor = (kind: WorkspaceFile["kind"]) =>
    kind === "image" || kind === "video" || kind === "text"
      ? "text-tiffany-600"
      : "text-ink-500";

  const isSelected = (f: WorkspaceFile) => preview?.path === f.path;

  // ========== Render ==========

  const renderEmpty = (message: string) => (
    <p className="text-xs text-ink-500 italic text-center py-10">{message}</p>
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Header + upload */}
      <div className="flex items-center justify-between gap-3">
        <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider">
          {title ?? "Agent Workspace"}
        </label>
        <div className="flex items-center gap-2">
          <button
            onClick={() => ws.fetchFiles(projectId, scope)}
            title="Refresh"
            className="flex items-center justify-center w-8 h-8 rounded-xl border transition-all bg-white border-ink-200 text-ink-600 hover:border-ink-300"
          >
            {RefreshIcon}
          </button>
          <button
            onClick={() => ws.openWorkspace(projectId, scope)}
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

      {/* View switcher */}
      <div className="flex items-center gap-1 p-1 bg-ink-100/70 rounded-xl w-fit">
        {(
          [
            { key: "list", label: "List", icon: ListViewIcon },
            { key: "grid", label: "Grid", icon: GridViewIcon },
            { key: "column", label: "Columns", icon: ColumnsViewIcon },
          ] as { key: ViewMode; label: string; icon: ReactElement }[]
        ).map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
              view === key
                ? "bg-white text-ink-900 shadow-sm"
                : "text-ink-600 hover:text-ink-800"
            }`}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      <div className="flex gap-3 items-start">
        {/* Left column: file browser + editor */}
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          <div className="border border-ink-200 rounded-2xl overflow-hidden">
            {ws.loading ? (
              <p className="text-xs text-ink-500 italic text-center py-10">
                Loading files...
              </p>
            ) : ws.files.length === 0 ? (
              renderEmpty("No files yet. Upload a file or let the agent save a memory.")
            ) : view === "list" ? (
              /* ========== LIST VIEW ========== */
              <div className="max-h-[28rem] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-ink-50 text-ink-600">
                    <tr>
                      {(
                        [
                          { key: "name", label: "Name", className: "text-left" },
                          { key: "kind", label: "Kind", className: "text-left" },
                          { key: "size", label: "Size", className: "text-right" },
                          { key: "mtime", label: "Modified", className: "text-right" },
                        ] as { key: SortKey; label: string; className: string }[]
                      ).map((col) => (
                        <th key={col.key} className={`px-3 py-2 font-semibold ${col.className}`}>
                          <button
                            onClick={() => handleSort(col.key)}
                            className="inline-flex items-center gap-1 hover:text-ink-900"
                          >
                            {col.label}
                            {sortKey === col.key && (
                              <span className="text-[9px]">
                                {sortDir === "asc" ? "▲" : "▼"}
                              </span>
                            )}
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {sortedFiles.map((f) => (
                      <tr
                        key={f.path}
                        onClick={() => handleSelect(f)}
                        className={`cursor-pointer transition-colors ${
                          isSelected(f) ? "bg-tiffany-500/10" : "hover:bg-ink-100/60"
                        }`}
                      >
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            {kindIcon(f)}
                            <div className="min-w-0">
                              <p className="text-ink-900 truncate">{f.name}</p>
                              <p className="text-[10px] text-ink-500 truncate">{f.path}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-ink-600 capitalize">{f.kind}</td>
                        <td className="px-3 py-2 text-right text-ink-600">{formatSize(f.size)}</td>
                        <td className="px-3 py-2 text-right text-ink-600">{formatDate(f.mtime)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : view === "grid" ? (
              /* ========== GRID VIEW ========== */
              <div className="max-h-[28rem] overflow-y-auto p-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {sortedFiles.map((f) => (
                  <button
                    key={f.path}
                    onClick={() => handleSelect(f)}
                    className={`flex flex-col rounded-xl overflow-hidden border text-left transition-all ${
                      isSelected(f)
                        ? "border-tiffany-500 ring-2 ring-tiffany-500/60"
                        : "border-ink-200 hover:border-ink-300"
                    }`}
                  >
                    <div className="aspect-square w-full bg-ink-100/60 flex items-center justify-center overflow-hidden">
                      {f.kind === "image" ? (
                        <img
                          src={workspacePreviewUrl(projectId, f.path, scope)}
                          alt={f.name}
                          loading="lazy"
                          className="w-full h-full object-cover"
                        />
                      ) : f.kind === "video" ? (
                        <video
                          src={workspacePreviewUrl(projectId, f.path, scope)}
                          preload="metadata"
                          muted
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className={`${kindColor(f.kind)} [&_svg]:w-8 [&_svg]:h-8`}>
                          {kindIcon(f)}
                        </span>
                      )}
                    </div>
                    <div className="px-2 py-1.5 border-t border-ink-100 bg-white">
                      <p className="text-xs text-ink-800 truncate" title={f.path}>
                        {f.name}
                      </p>
                      <p className="text-[10px] text-ink-500">
                        {f.kind} · {formatSize(f.size)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              /* ========== COLUMN VIEW ========== */
              <div className="flex overflow-x-auto max-h-[28rem]">
                {columnPaths.map((dirPath, i) => {
                  const { dirs, files } = entriesAt(ws.files, dirPath);
                  return (
                    <div
                      key={dirPath || "__root__"}
                      className="w-56 shrink-0 border-r border-ink-200 last:border-r-0"
                    >
                      <ul className="divide-y divide-ink-100">
                        {dirs.map((d) => (
                          <li
                            key={d.path}
                            onClick={() => setDirStack([...dirStack.slice(0, i), d.name])}
                            className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-ink-100/60 transition-colors"
                          >
                            <span className="text-tiffany-600">{FolderIcon}</span>
                            <span className="text-xs text-ink-800 truncate">{d.name}</span>
                          </li>
                        ))}
                        {files.map((f) => (
                          <li
                            key={f.path}
                            onClick={() => handleSelect(f)}
                            className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
                              isSelected(f) ? "bg-tiffany-500/10" : "hover:bg-ink-100/60"
                            }`}
                          >
                            {kindIcon(f)}
                            <span className="text-xs text-ink-800 truncate" title={f.path}>
                              {f.name}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
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
            <div className="flex items-center justify-between gap-2 px-3 py-2 bg-ink-50 border-b border-ink-200">
              {renaming === preview?.path ? (
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <input
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") confirmRename(preview!);
                      if (e.key === "Escape") setRenaming(null);
                    }}
                    autoFocus
                    className="flex-1 min-w-0 px-2 py-1 bg-white border border-ink-300 rounded text-xs text-ink-900 focus:outline-none focus:ring-1 focus:ring-tiffany-500"
                  />
                  <button
                    onClick={() => confirmRename(preview!)}
                    className="px-2 py-1 text-[10px] font-medium text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setRenaming(null)}
                    className="p-1 text-tiffany-600 hover:bg-ink-200 rounded transition-colors"
                  >
                    {CloseIcon}
                  </button>
                </div>
              ) : (
                <>
                  <span className="text-xs font-medium text-ink-700 truncate">
                    {preview ? preview.name : "Preview"}
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
                </>
              )}
            </div>
            <div className="p-2 flex justify-center bg-ink-100/60">
              {!preview ? (
                <p className="text-xs text-ink-500 italic text-center py-10">
                  Select a file to preview
                </p>
              ) : preview.kind === "image" ? (
                <img
                  src={workspacePreviewUrl(projectId, preview.path, scope)}
                  alt={preview.name}
                  className="max-h-72 max-w-full object-contain"
                />
              ) : preview.kind === "video" ? (
                <video
                  src={workspacePreviewUrl(projectId, preview.path, scope)}
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
            {preview && !renaming && (
              <div className="flex items-center gap-1.5 px-3 py-2 border-t border-ink-200">
                {preview.kind === "text" && (
                  <button
                    onClick={() => handleEdit(preview)}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-tiffany-700 hover:bg-tiffany-50 rounded transition-colors"
                  >
                    {PencilIcon}
                    Edit
                  </button>
                )}
                <button
                  onClick={() => handleRename(preview)}
                  className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-ink-600 hover:bg-ink-100 rounded transition-colors"
                >
                  {PencilIcon}
                  Rename
                </button>
                <button
                  onClick={() => handleDelete(preview)}
                  className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-red-500 hover:bg-red-50 rounded transition-colors ml-auto"
                >
                  {TrashIcon}
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-3xl shadow-card p-6 w-80">
            <h3 className="text-sm font-semibold text-ink-900 mb-2">Delete File</h3>
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
