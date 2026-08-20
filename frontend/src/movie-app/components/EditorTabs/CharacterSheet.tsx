import { useEffect, useRef, useState } from "react";

export interface SheetItem {
  id: string;
  name: string;
  url: string;
}

interface Props {
  items: SheetItem[];
  projectId: string;
}

const API_BASE = `http://localhost:${(window as any).PORT}`;

// Base layout in "cell units"; scaled up so the sheet's longest edge is TARGET px.
const CELL_W = 160;
const CELL_H = 160;
const LABEL_H = 18;
const GAP = 12;
const PADDING = 12;
const COLUMNS = 5;
const TARGET = 4096;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

/** Draw a contain-fit image into a cell, centered. */
function drawContain(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  cellW: number,
  cellH: number,
) {
  const scale = Math.min(cellW / img.width, cellH / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, x + (cellW - dw) / 2, y + (cellH - dh) / 2, dw, dh);
}

export default function CharacterSheet({ items, projectId }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveInfo, setSaveInfo] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const cols = Math.max(1, COLUMNS);
    const rows = Math.ceil(items.length / cols) || 1;

    const baseWidth = cols * CELL_W + (cols - 1) * GAP + PADDING * 2;
    const baseHeight =
      rows * (CELL_H + LABEL_H) + (rows - 1) * GAP + PADDING * 2;
    const scale = TARGET / Math.max(baseWidth, baseHeight);

    const cellW = CELL_W * scale;
    const cellH = CELL_H * scale;
    const labelH = LABEL_H * scale;
    const gap = GAP * scale;
    const pad = PADDING * scale;
    const width = Math.round(baseWidth * scale);
    const height = Math.round(baseHeight * scale);

    canvas.width = width;
    canvas.height = height;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    if (items.length === 0) {
      ctx.fillStyle = "#94a3b8";
      ctx.font = `${Math.round(12 * scale)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("No characters yet", width / 2, height / 2);
      return;
    }

    // Guard against stale async draws if `items` changes mid-load.
    let cancelled = false;

    items.forEach(async (item, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = pad + col * (cellW + gap);
      const y = pad + row * (cellH + labelH + gap);

      // Cell background
      ctx.fillStyle = "#f0fdfa";
      ctx.fillRect(x, y, cellW, cellH + labelH);

      let img: HTMLImageElement | null = null;
      try {
        img = await loadImage(item.url);
      } catch {
        img = null;
      }
      if (cancelled) return;

      if (img) drawContain(ctx, img, x, y, cellW, cellH);

      // Label bar
      ctx.fillStyle = "rgba(0,0,0,0.65)";
      ctx.fillRect(x, y + cellH, cellW, labelH);
      ctx.fillStyle = "#ffffff";
      ctx.font = `${Math.round(11 * scale)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(item.name, x + cellW / 2, y + cellH + labelH / 2);
    });

    return () => {
      cancelled = true;
    };
  }, [items]);

  const downloadSheet = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = "character-sheet.png";
    a.click();
  };

  const saveSheet = async () => {
    const canvas = canvasRef.current;
    if (!canvas || items.length === 0) return;
    setSaving(true);
    setSaveError(null);
    setSaveInfo(null);
    try {
      const dataUrl = canvas.toDataURL("image/png");
      const res = await fetch(`${API_BASE}/api/character-sheet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl, projectId }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setSaveInfo(`Saved current.png (+ backup ${data.backupFilename})`);
    } catch (e) {
      setSaveError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const SaveIcon = (
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
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  );

  const DownloadIcon = (
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
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink-600/60">
          {items.length} character{items.length === 1 ? "" : "s"}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={saveSheet}
            disabled={saving || items.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl bg-tiffany-500 hover:bg-tiffany-600 disabled:bg-ink-200 disabled:text-ink-500 text-ink-950 transition-colors"
          >
            {SaveIcon}
            {saving ? "Saving..." : "Save Sheet"}
          </button>
          <button
            onClick={downloadSheet}
            disabled={items.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl border border-ink-200 bg-white text-ink-600 hover:border-ink-300 disabled:opacity-50 transition-colors"
          >
            {DownloadIcon}
            Download Sheet
          </button>
        </div>
      </div>

      {saveInfo && (
        <p className="text-xs text-emerald-600">{saveInfo}</p>
      )}
      {saveError && <p className="text-xs text-red-600">{saveError}</p>}

      <canvas
        ref={canvasRef}
        className="rounded-2xl border border-ink-200 max-w-full h-auto"
      />
    </div>
  );
}
