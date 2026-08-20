import { useEffect, useRef, useState } from "react";
import {
  useCharacterStore,
  type Character,
} from "../../stores/characterStore";
import {
  useGenerationStore,
  type ProjectImage,
} from "../../stores/generationStore";
import CropTool from "./CropTool";
import CharacterSheet from "./CharacterSheet";

const API_BASE = `http://localhost:${(window as any).PORT}`;

/** Fetch an image URL and return it as a data URL (avoids canvas tainting). */
async function urlToDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load image (${res.status})`);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(blob);
  });
}

interface Props {
  projectId: string;
}

function CharacterCard({ imageUrl, name }: { imageUrl: string; name: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = 160;
    const H = 160;
    const BAR = 18;
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, W, H + BAR);
      const scale = Math.max(W / img.width, H / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
      ctx.fillStyle = "rgba(0,0,0,0.65)";
      ctx.fillRect(0, H, W, BAR);
      ctx.fillStyle = "#fff";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(name, W / 2, H + BAR / 2);
    };
    img.src = imageUrl;
  }, [imageUrl, name]);

  return (
    <canvas
      ref={canvasRef}
      width={160}
      height={178}
      className="rounded-xl border border-ink-200"
    />
  );
}

export default function CharactersTab({ projectId }: Props) {
  const characterStore = useCharacterStore();
  const gen = useGenerationStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editImage, setEditImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showImageModal, setShowImageModal] = useState(false);
  const [previewCharacter, setPreviewCharacter] = useState<Character | null>(
    null,
  );

  useEffect(() => {
    characterStore.fetchCharacters(projectId);
    gen.fetchProjectImages(projectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Close any open modal with the Escape key
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setShowImageModal(false);
      setPreviewCharacter(null);
      setConfirmDeleteId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const editing =
    characterStore.characters.find((c) => c.id === editingId) ?? null;

  const charUrl = (filename: string): string | null => {
    const img = gen.projectImages.find((i) => i.filename === filename);
    if (!img) return null;
    return img.url.startsWith("http") ? img.url : `${API_BASE}${img.url}`;
  };

  const sheetItems = characterStore.characters
    .map((c) => {
      const url = charUrl(c.filename);
      return url ? { id: c.id, name: c.name, url } : null;
    })
    .filter(
      (x): x is { id: string; name: string; url: string } => x !== null,
    );

  const uploadImage = async (dataUrl: string): Promise<string | null> => {
    const res = await fetch(`${API_BASE}/api/upload/image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image: dataUrl,
        filename: `character-${Date.now()}.png`,
        projectId,
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return data.filename as string;
  };

  const finishCharacter = async (dataUrl: string) => {
    setUploading(true);
    setError(null);
    try {
      const filename = await uploadImage(dataUrl);
      if (!filename) throw new Error("Upload failed");
      await characterStore.createCharacter(projectId, name.trim(), filename);
      await gen.fetchProjectImages(projectId);
      setName("");
      setPendingImage(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setUploading(false);
    }
  };

  const startEdit = (c: Character) => {
    setEditingId(c.id);
    setEditName(c.name);
    setEditImage(null);
    setPendingImage(null);
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditImage(null);
    setError(null);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    await characterStore.updateCharacter(editingId, projectId, {
      name: editName.trim(),
    });
    setEditingId(null);
    setEditImage(null);
  };

  const handleEditFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setEditImage(reader.result as string);
      setError(null);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleCropApply = async (dataUrl: string) => {
    if (editImage) {
      setUploading(true);
      setError(null);
      try {
        const filename = await uploadImage(dataUrl);
        if (!filename) throw new Error("Upload failed");
        if (editingId) {
          await characterStore.updateCharacter(editingId, projectId, {
            filename,
          });
        }
        await gen.fetchProjectImages(projectId);
        setEditImage(null);
      } catch (e) {
        setError(String(e));
      } finally {
        setUploading(false);
      }
    } else {
      await finishCharacter(dataUrl);
    }
  };

  const handleCropCancel = () => {
    setPendingImage(null);
    setEditImage(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPendingImage(reader.result as string);
      setError(null);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleDelete = async () => {
    if (!confirmDeleteId) return;
    await characterStore.deleteCharacter(confirmDeleteId, projectId);
    setConfirmDeleteId(null);
    if (editingId === confirmDeleteId) {
      setEditingId(null);
      setEditImage(null);
    }
  };

  const selectProjectImage = async (img: ProjectImage) => {
    setShowImageModal(false);
    setError(null);
    try {
      const dataUrl = await urlToDataUrl(img.url);
      setPendingImage(dataUrl);
    } catch (e) {
      setError(String(e));
    }
  };

  // ========== SVG Icons ==========

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

  const PencilIcon = (
    <svg
      width="12"
      height="12"
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

  const TrashIcon = (
    <svg
      width="12"
      height="12"
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

  const ImagesIcon = (
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

  const CloseIcon = (
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
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );

  const MaximizeIcon = (
    <svg
      width="12"
      height="12"
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

  return (
    <div className="flex flex-col gap-7">
      <div className="flex items-center gap-2">
        <span className="text-tiffany-600">{CharacterIcon}</span>
        <h2 className="text-base font-semibold text-ink-900">Characters</h2>
      </div>

      {/* Create / Edit panel */}
      {!editing ? (
        <div className="border border-ink-200 rounded-2xl p-5 flex flex-col gap-3 bg-ink-100/60">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Character name"
            className="px-3 py-2 bg-white border border-ink-200 rounded-xl text-sm text-ink-900 placeholder-ink-500 focus:outline-none focus:border-tiffany-500 focus:ring-2 focus:ring-tiffany-500/30"
          />
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl border border-ink-200 bg-white text-ink-600 hover:border-ink-300 transition-colors"
            >
              {UploadIcon}
              Upload Image
            </button>
            <button
              onClick={() => setShowImageModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl border border-ink-200 bg-white text-ink-600 hover:border-ink-300 transition-colors"
            >
              {ImagesIcon}
              Select Project Image
            </button>
          </div>
        </div>
      ) : (
        <div className="border border-ink-200 rounded-2xl p-5 flex flex-col gap-3 bg-ink-100/60">
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="Character name"
            className="px-3 py-2 bg-white border border-ink-200 rounded-xl text-sm text-ink-900 placeholder-ink-500 focus:outline-none focus:border-tiffany-500 focus:ring-2 focus:ring-tiffany-500/30"
          />
          {editing && charUrl(editing.filename) && (
            <img
              src={charUrl(editing.filename)!}
              alt={editing.name}
              className="w-16 h-16 rounded-xl object-cover border border-ink-200"
            />
          )}
          <div className="flex items-center gap-2">
            <input
              ref={editFileInputRef}
              type="file"
              accept="image/*"
              onChange={handleEditFileChange}
              className="hidden"
            />
            <button
              onClick={() => editFileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl border border-ink-200 bg-white text-ink-600 hover:border-ink-300 transition-colors"
            >
              {UploadIcon}
              Replace Image
            </button>
            <button
              onClick={saveEdit}
              className="px-3 py-2 text-xs font-medium rounded-xl bg-tiffany-500 hover:bg-tiffany-600 text-ink-950 transition-colors"
            >
              Save
            </button>
            <button
              onClick={cancelEdit}
              className="px-3 py-2 text-xs font-medium rounded-xl border border-ink-200 text-ink-600 hover:bg-ink-100 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {uploading && (
        <p className="text-xs text-ink-600 italic">Saving character...</p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}

      {/* Crop tool (create or edit) */}
      {(pendingImage || editImage) && (
        <CropTool
          image={pendingImage ?? editImage!}
          onCancel={handleCropCancel}
          onApply={handleCropApply}
        />
      )}

      {/* Character grid */}
      {characterStore.loading ? (
        <p className="text-xs text-ink-500 italic text-center py-8">
          Loading characters...
        </p>
      ) : characterStore.characters.length === 0 ? (
        <p className="text-xs text-ink-500 italic text-center py-8 border border-dashed border-ink-200 rounded-2xl">
          No characters yet. Upload one.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {characterStore.characters.map((c) => {
            const url = charUrl(c.filename);
            return (
              <div
                key={c.id}
                className="relative group cursor-pointer"
                onClick={() => setPreviewCharacter(c)}
                title="Preview image"
              >
                {url ? (
                  <CharacterCard imageUrl={url} name={c.name} />
                ) : (
                  <div className="w-[160px] h-[178px] rounded-xl border border-ink-200 bg-ink-100 flex items-center justify-center text-ink-500">
                    {CharacterIcon}
                  </div>
                )}
                <div
                  className="absolute top-1 right-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => setPreviewCharacter(c)}
                    className="w-6 h-6 rounded-full bg-black/50 text-ink-950 flex items-center justify-center hover:bg-tiffany-600 transition-colors"
                    title="Preview image"
                  >
                    {MaximizeIcon}
                  </button>
                  <button
                    onClick={() => startEdit(c)}
                    className="w-6 h-6 rounded-full bg-black/50 text-ink-950 flex items-center justify-center hover:bg-tiffany-600 transition-colors"
                    title="Edit character"
                  >
                    {PencilIcon}
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(c.id)}
                    className="w-6 h-6 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
                    title="Delete character"
                  >
                    {TrashIcon}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Character sheet (canvas 2d grid) */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="text-tiffany-600">{ImagesIcon}</span>
          <h3 className="text-sm font-semibold text-ink-900">
            Character Sheet
          </h3>
        </div>
        <CharacterSheet items={sheetItems} projectId={projectId} />
      </div>

      {/* Select project image modal */}
      {showImageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-3xl shadow-card p-6 w-[480px] max-w-full max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-ink-900">
                Select Project Image
              </h3>
              <button
                onClick={() => setShowImageModal(false)}
                className="w-6 h-6 rounded-full text-tiffany-600 hover:bg-ink-200 hover:text-ink-800 flex items-center justify-center transition-colors"
                title="Close"
              >
                {CloseIcon}
              </button>
            </div>

            {gen.projectImagesLoading ? (
              <p className="text-xs text-ink-500 italic text-center py-8">
                Loading images...
              </p>
            ) : gen.projectImages.length === 0 ? (
              <p className="text-xs text-ink-500 italic text-center py-8 border border-dashed border-ink-200 rounded-2xl">
                No project images yet. Upload or generate one first.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2 overflow-y-auto pr-1">
                {gen.projectImages.map((img) => (
                  <button
                    key={`${img.source}-${img.filename}`}
                    onClick={() => selectProjectImage(img)}
                    className="relative rounded-xl border border-ink-200 hover:border-tiffany-500 overflow-hidden transition-colors"
                    title={img.filename}
                  >
                    <img
                      src={img.url}
                      alt={img.filename}
                      className="aspect-square object-cover w-full"
                    />
                    <span className="absolute bottom-0 left-0 right-0 bg-white/80 backdrop-blur-sm px-1 py-0.5 text-[10px] text-ink-700 truncate text-center">
                      {img.filename}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Character image preview modal */}
      {previewCharacter && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5"
          onClick={() => setPreviewCharacter(null)}
        >
          <div
            className="bg-white rounded-3xl shadow-card p-6 w-full max-w-2xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-ink-900">
                {previewCharacter.name}
              </h3>
              <button
                onClick={() => setPreviewCharacter(null)}
                className="w-6 h-6 rounded-full text-tiffany-600 hover:bg-ink-200 hover:text-ink-800 flex items-center justify-center transition-colors"
                title="Close"
              >
                {CloseIcon}
              </button>
            </div>

            <div className="flex-1 min-h-0 flex items-center justify-center bg-ink-50 rounded-2xl overflow-hidden">
              {charUrl(previewCharacter.filename) ? (
                <img
                  src={charUrl(previewCharacter.filename)!}
                  alt={previewCharacter.name}
                  className="max-h-[65vh] max-w-full object-contain"
                />
              ) : (
                <div className="text-ink-500 py-16">{CharacterIcon}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-3xl shadow-card p-6 w-80">
            <h3 className="text-sm font-semibold text-ink-900 mb-2">
              Delete Character
            </h3>
            <p className="text-xs text-ink-600 mb-4">
              Are you sure you want to delete this character?
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="px-3 py-2 text-xs font-medium rounded-xl border border-ink-200 text-ink-600 hover:bg-ink-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
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
