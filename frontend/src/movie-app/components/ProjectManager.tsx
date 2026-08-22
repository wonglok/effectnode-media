import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useProjectStore, type Project } from "../stores/projectStore";

export default function ProjectManager() {
  const navigate = useNavigate();
  const {
    projects,
    loading,
    error,
    fetchProjects,
    createProject,
    updateProject,
    deleteProject,
    openFolder,
  } = useProjectStore();

  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    if (showCreate && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [showCreate]);

  const resetForm = () => {
    setFormName("");
    setFormDesc("");
    setShowCreate(false);
    setEditingId(null);
  };

  const handleCreate = async () => {
    if (!formName.trim()) return;
    await createProject(formName.trim(), formDesc.trim());
    resetForm();
  };

  const handleUpdate = async () => {
    if (!editingId || !formName.trim()) return;
    await updateProject(editingId, {
      name: formName.trim(),
      description: formDesc.trim(),
    });
    resetForm();
  };

  const handleDelete = async (id: string) => {
    await deleteProject(id);
    setDeleteConfirm(null);
  };

  const startEdit = (p: Project) => {
    setEditingId(p.id);
    setFormName(p.name);
    setFormDesc(p.description);
    setShowCreate(true);
    setTimeout(() => nameInputRef.current?.focus(), 0);
  };

  const openProject = (id: string) => {
    navigate(`/projects/${id}`);
  };

  // ========== SVG Icons ==========

  const PlusIcon = (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );

  const EditIcon = (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );

  const DeleteIcon = (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );

  const UploadFolderIcon = (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      <line x1="12" y1="11" x2="12" y2="17" />
      <polyline points="9 14 12 11 15 14" />
    </svg>
  );

  const OutputFolderIcon = (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      <line x1="12" y1="11" x2="12" y2="17" />
      <polyline points="9 14 12 17 15 14" />
    </svg>
  );

  const OpenIcon = (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );

  // ========== Render ==========

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <header className="flex flex-col gap-7 md:flex-row md:items-end md:justify-between">
        <div className="max-w-xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-tiffany-600">
            EffectNode Media
          </p>
          <h1 className="mt-3 font-display text-4xl font-light leading-[1.06] text-ink-900 md:text-5xl">
            Make the movies{" "}
            <span className="wordmark font-medium italic">you dream of</span>
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-ink-600/80">
            A local AI studio for writing stories, casting characters, and
            turning scenes into motion.
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowCreate(true);
          }}
          className="btn-primary flex w-fit items-center gap-1.5 rounded-2xl px-5 py-2.5 text-sm font-medium"
        >
          {PlusIcon}
          New Project
        </button>
      </header>

      {/* Error */}
      {error && (
        <div className="mt-8 rounded-2xl border border-rose-200 bg-rose-50/70 px-4 py-3 text-sm text-rose-600 backdrop-blur-sm">
          {error}
        </div>
      )}

      {/* Create / Edit Form */}
      {showCreate && (
        <div className="glass mt-8 rounded-3xl p-6 shadow-card">
          <h3 className="font-display text-lg font-medium text-ink-900">
            {editingId ? "Edit Project" : "New Project"}
          </h3>
          <input
            ref={nameInputRef}
            type="text"
            placeholder="Project name"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter")
                editingId ? handleUpdate() : handleCreate();
              if (e.key === "Escape") resetForm();
            }}
            className="mt-4 w-full rounded-2xl border border-white/70 bg-white/70 px-4 py-2.5 text-sm text-ink-900 placeholder-ink-500/40 transition-all focus:border-tiffany-500 focus:outline-none focus:ring-2 focus:ring-tiffany-500/30"
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={formDesc}
            onChange={(e) => setFormDesc(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter")
                editingId ? handleUpdate() : handleCreate();
              if (e.key === "Escape") resetForm();
            }}
            className="mt-3 w-full rounded-2xl border border-white/70 bg-white/70 px-4 py-2.5 text-sm text-ink-900 placeholder-ink-500/40 transition-all focus:border-tiffany-500 focus:outline-none focus:ring-2 focus:ring-tiffany-500/30"
          />
          <div className="mt-4 flex gap-2">
            <button
              onClick={editingId ? handleUpdate : handleCreate}
              className="btn-primary rounded-2xl px-5 py-2 text-sm font-medium"
            >
              {editingId ? "Update" : "Create"}
            </button>
            <button
              onClick={resetForm}
              className="rounded-2xl border border-ink-200 bg-white/60 px-5 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Section label */}
      <div className="mt-12 mb-4 flex items-center gap-3">
        <h2 className="font-display text-xl font-medium text-ink-900">
          Projects
        </h2>
        <span className="text-xs text-ink-500">
          {loading ? "…" : `${projects.length} in the studio`}
        </span>
        <div className="hairline flex-1" />
      </div>

      {/* Project List */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-sm text-ink-600/50">
          Loading…
        </div>
      ) : projects.length === 0 ? (
        <div className="glass flex flex-col items-center justify-center rounded-3xl px-6 py-20 text-center shadow-card">
          <div className="thumb flex h-20 w-20 items-center justify-center rounded-3xl text-ink-900/70 shadow-glow-sm">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <p className="mt-5 font-display text-2xl font-light text-ink-900">
            Your studio is empty
          </p>
          <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-ink-600/70">
            Create your first project and start turning an idea into motion.
          </p>
          <button
            onClick={() => {
              resetForm();
              setShowCreate(true);
            }}
            className="btn-primary mt-6 flex items-center gap-1.5 rounded-2xl px-5 py-2.5 text-sm font-medium"
          >
            {PlusIcon}
            New Project
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {projects.map((p) => (
            <div
              key={p.id}
              className="group flex items-center gap-3 rounded-2xl px-4 py-3.5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover glass"
            >
              {/* Project info */}
              <button
                onClick={() => openProject(p.id)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <div className="thumb flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-ink-900/70">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="truncate font-display text-[15px] font-medium leading-tight text-ink-900">
                    {p.name}
                  </p>
                  {p.description ? (
                    <p className="mt-0.5 truncate text-xs text-ink-600/70">
                      {p.description}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-xs italic text-ink-500/60">
                      No description
                    </p>
                  )}
                </div>
              </button>

              {/* Actions */}
              <div className="flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                <button
                  onClick={() => startEdit(p)}
                  className="rounded-xl p-2 text-ink-600/40 transition-colors hover:bg-ink-100 hover:text-tiffany-700"
                  title="Edit"
                >
                  {EditIcon}
                </button>
                <button
                  onClick={() => openFolder(p.id, "upload")}
                  className="rounded-xl p-2 text-ink-600/40 transition-colors hover:bg-ink-100 hover:text-tiffany-700"
                  title="Open Uploads Folder"
                >
                  {UploadFolderIcon}
                </button>
                <button
                  onClick={() => openFolder(p.id, "output")}
                  className="rounded-xl p-2 text-ink-600/40 transition-colors hover:bg-ink-100 hover:text-tiffany-700"
                  title="Open Outputs Folder"
                >
                  {OutputFolderIcon}
                </button>
                <button
                  onClick={() => setDeleteConfirm(p.id)}
                  className="rounded-xl p-2 text-ink-600/40 transition-colors hover:bg-rose-50 hover:text-rose-600"
                  title="Delete"
                >
                  {DeleteIcon}
                </button>
                <button
                  onClick={() => openProject(p.id)}
                  className="rounded-xl p-2 text-ink-600/40 transition-colors hover:bg-ink-100 hover:text-tiffany-700"
                  title="Open"
                >
                  {OpenIcon}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40 backdrop-blur-sm">
          <div className="w-80 rounded-3xl border border-white/70 bg-white/90 p-8 shadow-modal backdrop-blur-xl">
            <h3 className="font-display text-lg font-medium text-ink-900">
              Delete Project
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-600/80">
              Are you sure you want to delete this project? This action cannot
              be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="rounded-2xl bg-ink-100 px-4 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-300"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="rounded-2xl bg-rose-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-600"
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
