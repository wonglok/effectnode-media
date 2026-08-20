import { useEffect, useRef, useState } from "react";
import { useGenerationStore } from "../../stores/generationStore";
import { useProjectStore } from "../../stores/projectStore";

interface Props {
  projectId: string;
}

export default function FastImageEditTab({ projectId }: Props) {
  const store = useGenerationStore();
  const { openFolder } = useProjectStore();
  const referenceFileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{
    url: string;
    filename: string;
  } | null>(null);

  useEffect(() => {
    store.checkFastImageEditStatus();
    store.fetchProjectImages(projectId);
    store.fetchCharacterSheets(projectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Close the preview modal on Escape.
  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreview(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview]);

  const handleReferenceUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      const uploadedPath = await store.uploadImage(
        projectId,
        base64,
        file.name,
      );
      if (uploadedPath) {
        await store.fetchProjectImages(projectId);
        const { uploadedImageFilename, uploadedImageUrl } =
          useGenerationStore.getState();
        store.toggleFastImageEditImage({
          filename: uploadedImageFilename || file.name,
          url: uploadedImageUrl || "",
          source: "upload",
        });
      }
    };
    reader.readAsDataURL(file);

    e.target.value = "";
  };

  const busy =
    store.fastImageEdit.generating || store.fastImageEdit.downloading;

  const renderStatus = (
    value: boolean | null,
    okText: string,
    missingText: string,
  ) => {
    if (value === null) {
      return (
        <span className="inline-flex items-center gap-1.5 text-ink-500">
          {SpinnerIcon}
          Checking...
        </span>
      );
    }
    if (value) {
      return (
        <span className="inline-flex items-center gap-1.5 text-emerald-600">
          {CheckCircleIcon}
          {okText}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-amber-600">
        {AlertCircleIcon}
        {missingText}
      </span>
    );
  };

  // ========== SVG Icons ==========

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

  const DownloadIcon = (
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
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );

  const SparkleIcon = (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );

  const SpinnerIcon = (
    <svg
      className="animate-spin text-tiffany-600"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" strokeOpacity="0.75" />
    </svg>
  );

  const CheckCircleIcon = (
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
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );

  const AlertCircleIcon = (
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
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );

  const CloseIcon = (
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

  const FolderIcon = (
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
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );

  return (
    <div className="flex flex-col gap-7">
      <div className="flex items-center gap-2">
        <span className="text-tiffany-600">{FastImageEditIcon}</span>
        <h2 className="text-base font-semibold text-ink-900">
          Fast Image Edit
        </h2>
      </div>

      {/* ===== Setup: download model ===== */}
      <div>
        <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
          Model Setup
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => store.downloadFastImageEditModel()}
            disabled={store.fastImageEdit.downloading}
            className="flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-xl border transition-all bg-white border-ink-200 text-ink-600 hover:border-ink-300 disabled:opacity-50"
          >
            {store.fastImageEdit.downloading ? SpinnerIcon : DownloadIcon}
            Download FLUX.2 Klein Model
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2 text-xs font-medium">
          {renderStatus(
            store.fastImageEdit.modelDownloaded,
            "FLUX.2 Klein model downloaded",
            "FLUX.2 Klein model not downloaded",
          )}
        </div>

        {store.fastImageEdit.downloadingLogs.length > 0 && (
          <div className="mt-2 p-4 bg-ink-50 border border-ink-200 rounded-2xl max-h-32 overflow-y-auto">
            <pre className="text-xs text-ink-600 font-mono whitespace-pre-wrap">
              {store.fastImageEdit.downloadingLogs.join("")}
            </pre>
          </div>
        )}
        {store.fastImageEdit.downloadingError && (
          <div className="mt-2 p-4 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-xs">
            {store.fastImageEdit.downloadingError}
          </div>
        )}
      </div>

      {/* ===== Reference images picker ===== */}
      <div>
        <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
          Reference Images
        </label>
        <div className="flex items-center gap-2">
          <input
            ref={referenceFileRef}
            type="file"
            accept="image/*"
            onChange={handleReferenceUpload}
            disabled={store.uploading}
            className="inline-block text-sm text-ink-700 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-medium file:bg-ink-100 file:text-ink-700 hover:file:bg-ink-200 file:cursor-pointer file:transition-colors disabled:opacity-50"
          />
          {store.fastImageEdit.referenceImages.length > 0 && (
            <button
              onClick={() => store.clearFastImageEditImages()}
              disabled={busy}
              className="px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 rounded-xl transition-colors disabled:opacity-50"
            >
              Clear ({store.fastImageEdit.referenceImages.length})
            </button>
          )}
        </div>
        {store.uploading && (
          <p className="text-xs text-ink-600 mt-1">Uploading...</p>
        )}
        {store.uploadError && (
          <p className="text-xs text-red-600 mt-1">{store.uploadError}</p>
        )}
        {store.projectImagesLoading ? (
          <p className="text-xs text-ink-500 italic py-4 text-center">
            Loading images...
          </p>
        ) : store.projectImages.length === 0 ? (
          <p className="text-xs text-ink-500 italic py-4 text-center border border-dashed border-ink-200 rounded-2xl">
            No images yet. Upload reference images above.
          </p>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8 gap-2 p-1">
            {store.projectImages.map((img) => {
              const isSelected = store.fastImageEdit.referenceImages.some(
                (r) => r.filename === img.filename,
              );
              const fullUrl = img.url.startsWith("http")
                ? img.url
                : `http://localhost:${(window as any).PORT}${img.url}`;
              return (
                <div
                  key={`${img.source}-${img.filename}`}
                  className="relative group"
                >
                  <button
                    onClick={() => store.toggleFastImageEditImage(img)}
                    disabled={store.fastImageEdit.generating}
                    className={`w-full relative rounded-xl border-2 overflow-hidden transition-all ${
                      isSelected
                        ? "border-tiffany-500 ring-2 ring-tiffany-500/40"
                        : "border-ink-200 hover:border-ink-300"
                    } disabled:opacity-50`}
                  >
                    <img
                      src={fullUrl}
                      alt={img.filename}
                      className="aspect-square object-cover object-center w-full"
                    />
                    <span className="absolute bottom-0 left-0 right-0 bg-white/80 backdrop-blur-sm px-1.5 py-0.5 text-[10px] text-ink-700 truncate text-center">
                      {img.filename}
                    </span>
                  </button>
                  <button
                    onClick={() =>
                      setPreview({ url: fullUrl, filename: img.filename })
                    }
                    className="absolute top-1.5 right-1.5 flex items-center justify-center w-6 h-6 rounded-full bg-black/50 text-white hover:bg-tiffany-600 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                    title="Preview"
                  >
                    {MaximizeIcon}
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {store.fastImageEdit.referenceImages.length > 0 && (
          <p className="text-xs text-ink-600/60 mt-1.5">
            Selected:{" "}
            <span className="font-medium text-ink-700">
              {store.fastImageEdit.referenceImages
                .map((r) => r.filename)
                .join(", ")}
            </span>
          </p>
        )}
      </div>

      {/* ===== Character sheet picker ===== */}
      {store.characterSheets.length > 0 && (
        <div>
          <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
            Character Sheet
          </label>
          <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8 gap-2 p-1">
            {store.characterSheets.map((sheet) => {
              const isSelected = store.fastImageEdit.referenceImages.some(
                (r) => r.filename === sheet.filename,
              );
              const fullUrl = sheet.url.startsWith("http")
                ? sheet.url
                : `http://localhost:${(window as any).PORT}${sheet.url}`;
              return (
                <div key={sheet.filename} className="relative group">
                  <button
                    onClick={() => store.toggleFastImageEditImage(sheet)}
                    disabled={store.fastImageEdit.generating}
                    className={`w-full relative rounded-xl border-2 overflow-hidden transition-all ${
                      isSelected
                        ? "border-tiffany-500 ring-2 ring-tiffany-500/40"
                        : "border-ink-200 hover:border-ink-300"
                    } disabled:opacity-50`}
                  >
                    <img
                      src={fullUrl}
                      alt={sheet.filename}
                      className="aspect-square object-cover object-center w-full"
                    />
                    <span className="absolute bottom-0 left-0 right-0 bg-white/80 backdrop-blur-sm px-1.5 py-0.5 text-[10px] text-ink-700 truncate text-center">
                      {sheet.filename}
                    </span>
                  </button>
                  <button
                    onClick={() =>
                      setPreview({ url: fullUrl, filename: sheet.filename })
                    }
                    className="absolute top-1.5 right-1.5 flex items-center justify-center w-6 h-6 rounded-full bg-black/50 text-white hover:bg-tiffany-600 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                    title="Preview"
                  >
                    {MaximizeIcon}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===== Prompt ===== */}
      <div>
        <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
          Image Prompt
        </label>
        <textarea
          value={store.fastImageEdit.prompt}
          onChange={(e) => store.setFastImageEditPrompt(e.target.value)}
          placeholder="Describe the composite image, e.g. The lamb and The ninja standing next to each other. taking a photo in a photo shooting studio."
          rows={3}
          disabled={store.fastImageEdit.generating}
          className="w-full px-4 py-3 bg-ink-50 border border-ink-200 rounded-2xl text-ink-900 text-sm placeholder-ink-500/40 focus:outline-none focus:border-tiffany-500 focus:ring-2 focus:ring-tiffany-500/30 transition-all resize-none disabled:opacity-50"
        />
      </div>

      {/* ===== Generate ===== */}
      {store.fastImageEdit.generating ? (
        <div className="flex items-center gap-2 px-4 py-3 bg-ink-50 border border-ink-200 rounded-2xl">
          {SpinnerIcon}
          <span className="text-sm font-medium text-ink-700">
            Generating...
          </span>
        </div>
      ) : (
        <button
          onClick={() => store.generateFastImageEdit(projectId)}
          disabled={
            busy ||
            !store.fastImageEdit.prompt.trim() ||
            store.fastImageEdit.referenceImages.length === 0
          }
          className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-tiffany-500 hover:bg-tiffany-600 active:bg-tiffany-700 disabled:bg-ink-200 disabled:text-ink-500 text-ink-950 text-sm font-semibold rounded-2xl transition-all duration-150 shadow-sm hover:shadow-md disabled:shadow-none"
        >
          {SparkleIcon}
          Generate Image
        </button>
      )}

      {/* ===== Open output folder ===== */}
      <button
        onClick={() => openFolder(projectId, "output")}
        className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-ink-50 hover:bg-ink-200 text-ink-700 text-sm font-medium rounded-2xl border border-ink-200 transition-colors"
      >
        {FolderIcon}
        Open Output Folder
      </button>

      {/* ===== Error ===== */}
      {store.fastImageEdit.error && (
        <div className="p-5 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-sm">
          {store.fastImageEdit.error}
        </div>
      )}

      {/* ===== Logs ===== */}
      {store.fastImageEdit.logs.length > 0 && (
        <div className="p-5 bg-ink-50 border border-ink-200 rounded-2xl max-h-40 overflow-y-auto">
          <p className="text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
            Logs
          </p>
          <pre className="text-xs text-ink-600 font-mono whitespace-pre-wrap">
            {store.fastImageEdit.logs.join("")}
          </pre>
        </div>
      )}

      {/* ===== Result ===== */}
      {store.fastImageEdit.result && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-ink-700 uppercase tracking-wider">
              Generated Image
            </label>
            <button
              onClick={() => store.clearFastImageEditResult()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border border-ink-200 text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors"
            >
              {CloseIcon}
              Remove
            </button>
          </div>
          <div className="rounded-2xl overflow-hidden border border-ink-200 shadow-card inline-block">
            <img
              src={store.fastImageEdit.result}
              alt="Generated"
              className="max-w-full h-auto"
            />
          </div>
        </div>
      )}

      {/* ===== Preview modal ===== */}
      {preview && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-8"
          onClick={() => setPreview(null)}
        >
          <div
            className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={preview.url}
              alt={preview.filename}
              className="max-w-full max-h-[80vh] object-contain rounded-2xl shadow-2xl"
            />
            <span className="text-xs text-white/70 truncate max-w-full">
              {preview.filename}
            </span>
            <button
              onClick={() => setPreview(null)}
              className="absolute -top-3 -right-3 flex items-center justify-center w-9 h-9 bg-white text-ink-700 rounded-full shadow-lg hover:bg-ink-200 transition-colors"
              title="Close (Esc)"
            >
              {CloseIcon}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
