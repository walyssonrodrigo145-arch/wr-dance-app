import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

interface MediaLightboxProps {
  open: boolean;
  src: string;
  alt?: string;
  onClose: () => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 8;

const clampScale = (v: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, v));

/**
 * Lightbox fullscreen com zoom para imagens do portal do aluno.
 * - Zoom: botões +/−, scroll do mouse (wheel), pinça (2 dedos) e duplo clique.
 * - Pan: arraste quando ampliado (mouse ou toque).
 * - Fecha: ESC, clique no fundo ou botão X.
 */
export default function MediaLightbox({ open, src, alt, onClose }: MediaLightboxProps) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; baseX: number; baseY: number } | null>(null);
  const pinchRef = useRef<{ startDist: number; startScale: number } | null>(null);

  const reset = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  // Reset ao abrir
  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  // ESC fecha com capture para vencer o handler do Dialog (Radix)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  // Zoom por scroll (listener não-passivo para permitir preventDefault)
  useEffect(() => {
    if (!open) return;
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
      setScale((s) => {
        const next = clampScale(s * factor);
        if (next === MIN_SCALE) setOffset({ x: 0, y: 0 });
        return next;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [open]);

  if (!open) return null;

  const zoomBy = (factor: number) =>
    setScale((s) => {
      const next = clampScale(s * factor);
      if (next === MIN_SCALE) setOffset({ x: 0, y: 0 });
      return next;
    });

  // Pinça (touch): zoom pela distância entre 2 dedos
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      pinchRef.current = {
        startDist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        startScale: scale,
      };
    }
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      setScale(clampScale(pinchRef.current.startScale * (dist / pinchRef.current.startDist)));
    }
  };
  const handleTouchEnd = () => {
    pinchRef.current = null;
  };

  // Pan: arraste quando ampliado
  const handlePointerDown = (e: React.PointerEvent) => {
    if (scale <= 1) return;
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      baseX: offset.x,
      baseY: offset.y,
    };
    setIsDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    setOffset({
      x: drag.baseX + (e.clientX - drag.startX),
      y: drag.baseY + (e.clientY - drag.startY),
    });
  };
  const handlePointerUp = (e: React.PointerEvent) => {
    if (dragRef.current?.pointerId === e.pointerId) {
      dragRef.current = null;
      setIsDragging(false);
    }
  };

  return createPortal(
    <div
      ref={containerRef}
      className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center touch-none select-none animate-in fade-in duration-150"
      // RADIX FIX: Dialog modal aplica pointer-events:none no body — sem este
      // pointer-events:auto explícito, TODA interação do lightbox (portal fora
      // do DialogContent) fica morta (zoom, botões, pinça, fechar).
      style={{ pointerEvents: "auto" }}
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      <img
        src={src}
        alt={alt || ""}
        draggable={false}
        className="max-h-full max-w-full object-contain shadow-2xl"
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transition: isDragging ? "none" : "transform 120ms ease-out",
          cursor: scale > 1 ? (isDragging ? "grabbing" : "grab") : "zoom-in",
        }}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (scale > 1) reset();
          else setScale(2.5);
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />

      {/* Fechar */}
      <button
        type="button"
        aria-label="Fechar"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute top-4 right-4 w-11 h-11 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center backdrop-blur-md border border-white/20 transition-all active:scale-95"
      >
        <X size={20} />
      </button>

      {/* Controles de zoom */}
      <div
        className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2 py-1.5 rounded-2xl bg-black/60 backdrop-blur-md border border-white/15 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Diminuir zoom"
          onClick={() => zoomBy(1 / 1.25)}
          disabled={scale <= MIN_SCALE}
          className="w-10 h-10 rounded-xl text-white/90 hover:bg-white/15 disabled:opacity-30 flex items-center justify-center transition-all active:scale-95"
        >
          <ZoomOut size={18} />
        </button>
        <span className="text-[11px] font-black text-white/90 w-12 text-center tabular-nums">
          {Math.round(scale * 100)}%
        </span>
        <button
          type="button"
          aria-label="Aumentar zoom"
          onClick={() => zoomBy(1.25)}
          disabled={scale >= MAX_SCALE}
          className="w-10 h-10 rounded-xl text-white/90 hover:bg-white/15 disabled:opacity-30 flex items-center justify-center transition-all active:scale-95"
        >
          <ZoomIn size={18} />
        </button>
        <div className="w-px h-6 bg-white/15 mx-1" />
        <button
          type="button"
          aria-label="Redefinir zoom"
          onClick={reset}
          disabled={scale === MIN_SCALE && offset.x === 0 && offset.y === 0}
          className={cn(
            "w-10 h-10 rounded-xl text-white/90 hover:bg-white/15 flex items-center justify-center transition-all active:scale-95",
            scale === MIN_SCALE && offset.x === 0 && offset.y === 0 && "opacity-30"
          )}
        >
          <RotateCcw size={17} />
        </button>
      </div>
    </div>,
    document.body
  );
}
