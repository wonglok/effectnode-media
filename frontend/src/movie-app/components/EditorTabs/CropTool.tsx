import { useEffect, useRef, useState } from "react";

interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Props {
  image: string;
  onApply: (dataUrl: string) => void;
  onCancel: () => void;
}

const MAX_W = 420;
const MAX_H = 320;
const MIN_SIZE = 20;

const ASPECTS: { label: string; value: number | null }[] = [
  { label: "Free", value: null },
  { label: "1:1", value: 1 },
  { label: "4:3", value: 4 / 3 },
  { label: "3:4", value: 3 / 4 },
  { label: "16:9", value: 16 / 9 },
  { label: "9:16", value: 9 / 16 },
];

function fitDisplay(nw: number, nh: number): { w: number; h: number } {
  const scale = Math.min(MAX_W / nw, MAX_H / nh, 1);
  return {
    w: Math.max(1, Math.round(nw * scale)),
    h: Math.max(1, Math.round(nh * scale)),
  };
}

function initialCrop(w: number, h: number, aspect: number | null): CropRect {
  if (!aspect) return { x: 0, y: 0, w, h };
  let cw = w;
  let ch = cw / aspect;
  if (ch > h) {
    ch = h;
    cw = ch * aspect;
  }
  return { x: (w - cw) / 2, y: (h - ch) / 2, w: cw, h: ch };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export default function CropTool({ image, onApply, onCancel }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    mode: "move" | "resize";
    startX: number;
    startY: number;
    orig: CropRect;
  } | null>(null);

  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [display, setDisplay] = useState<{ w: number; h: number } | null>(null);
  const [aspect, setAspect] = useState<number | null>(null);
  const [crop, setCrop] = useState<CropRect | null>(null);

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    if (!nw || !nh) return;
    setNatural({ w: nw, h: nh });
    const d = fitDisplay(nw, nh);
    setDisplay(d);
    setCrop(initialCrop(d.w, d.h, aspect));
  };

  const changeAspect = (a: number | null) => {
    setAspect(a);
    if (display) setCrop(initialCrop(display.w, display.h, a));
  };

  const startDrag = (mode: "move" | "resize") => (e: React.MouseEvent) => {
    if (!crop || !display) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { mode, startX: e.clientX, startY: e.clientY, orig: crop };
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag || !display) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;

      if (drag.mode === "move") {
        setCrop({
          ...drag.orig,
          x: clamp(drag.orig.x + dx, 0, display.w - drag.orig.w),
          y: clamp(drag.orig.y + dy, 0, display.h - drag.orig.h),
        });
        return;
      }

      // resize (bottom-right handle, anchored at top-left)
      const maxW = display.w - drag.orig.x;
      const maxH = display.h - drag.orig.y;
      let w = clamp(drag.orig.w + dx, MIN_SIZE, maxW);
      let h = aspect
        ? w / aspect
        : clamp(drag.orig.h + dy, MIN_SIZE, maxH);
      if (aspect && h > maxH) {
        h = maxH;
        w = h * aspect;
      }
      setCrop({ ...drag.orig, w, h });
    };

    const onUp = () => {
      dragRef.current = null;
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [aspect, display]);

  const apply = () => {
    if (!crop || !natural || !display) return;
    const sx = natural.w / display.w;
    const sy = natural.h / display.h;
    const outW = Math.max(1, Math.round(crop.w * sx));
    const outH = Math.max(1, Math.round(crop.h * sy));

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(
        img,
        crop.x * sx,
        crop.y * sy,
        crop.w * sx,
        crop.h * sy,
        0,
        0,
        outW,
        outH,
      );
      onApply(canvas.toDataURL("image/png"));
    };
    img.src = image;
  };

  const cropPx =
    crop && natural && display
      ? {
          w: Math.round((crop.w / display.w) * natural.w),
          h: Math.round((crop.h / display.h) * natural.h),
        }
      : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
          Aspect Ratio
        </label>
        <div className="flex flex-wrap gap-2">
          {ASPECTS.map((a) => (
            <button
              key={a.label}
              onClick={() => changeAspect(a.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-xl border transition-all ${
                aspect === a.value
                  ? "bg-ink-100 border-ink-300 text-ink-800"
                  : "bg-white border-ink-200 text-ink-600 hover:border-ink-300"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-center">
        <div
          ref={containerRef}
          className="relative overflow-hidden rounded-xl border border-ink-200 bg-ink-100"
          style={{ width: display?.w, height: display?.h }}
        >
          <img
            src={image}
            alt="crop"
            draggable={false}
            onLoad={handleLoad}
            className="block select-none"
            style={{ width: display?.w, height: display?.h }}
          />
          {crop && display && (
            <div
              onMouseDown={startDrag("move")}
              className="absolute border-2 border-ink-300 cursor-move"
              style={{
                left: crop.x,
                top: crop.y,
                width: crop.w,
                height: crop.h,
                boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)",
              }}
            >
              <div
                onMouseDown={startDrag("resize")}
                className="absolute right-0 bottom-0 w-4 h-4 bg-white border border-tiffany-500 rounded-md cursor-nwse-resize"
              />
            </div>
          )}
        </div>
      </div>

      {cropPx && (
        <p className="text-xs text-ink-600 text-center">
          Crop size: {cropPx.w} × {cropPx.h}px
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-xs font-medium rounded-xl border border-ink-200 text-ink-600 hover:bg-ink-100 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={apply}
          className="px-4 py-2 text-xs font-medium rounded-xl bg-tiffany-500 hover:bg-tiffany-600 text-ink-950 transition-colors"
        >
          Apply Crop
        </button>
      </div>
    </div>
  );
}
