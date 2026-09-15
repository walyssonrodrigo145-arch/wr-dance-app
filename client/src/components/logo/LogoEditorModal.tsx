import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  ZoomIn,
  ZoomOut,
  RotateCw,
  RotateCcw,
  Maximize,
  Undo,
  Redo,
  Sparkles,
  Sun,
  Moon,
  Loader2,
  Image as ImageIcon,
} from "lucide-react";

export interface LogoEditParams {
  /** Resultado otimizado em data URL (PNG com transparência). */
  dataUrl: string;
  /** Posição X em percentual (-1 a 1) relativo ao centro da máscara. */
  x: number;
  /** Posição Y em percentual (-1 a 1) relativo ao centro da máscara. */
  y: number;
  /** Escala (zoom). */
  scale: number;
  /** Rotação em graus. */
  rotation: number;
  /** Variante favicon (32x32). */
  favicon?: string;
  /** Variante miniatura (96x96). */
  thumbnail?: string;
}

interface LogoEditorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Imagem de origem (data URL) a ser editada. */
  src: string;
  /** Tamanho (px) do quadrado exportado. */
  exportSize?: number;
  onSave: (params: LogoEditParams) => void;
}

/** Tamanho do canvas de edição (tela de máscara). */
const VIEW_SIZE = 420;
/** Resolução de exportação (também usada para o preview interno). */
const EXPORT_SIZE = 512;
/** Tamanho mínimo de zoom (% do tamanho base). */
const MIN_ZOOM = 0.2;
/** Tamanho máximo de zoom (% do tamanho base). */
const MAX_ZOOM = 5;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Falha ao carregar a imagem"));
    img.src = src;
  });
}

/** Remove fundo branco/monocromático claro próximo de bordas brancas. */
function removeWhiteBackground(img: HTMLImageElement, tolerance = 40): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imageData.data;
  const w = canvas.width, h = canvas.height;

  // Fundo referência: média dos pixels de borda (mais robusto que um único canto).
  let sumR = 0, sumG = 0, sumB = 0, sumA = 0, n = 0;
  const sample = (x: number, y: number) => {
    const o = (y * w + x) * 4;
    sumR += d[o]; sumG += d[o + 1]; sumB += d[o + 2]; sumA += d[o + 3]; n++;
  };
  for (let x = 0; x < w; x++) { sample(x, 0); sample(x, h - 1); }
  for (let y = 0; y < h; y++) { sample(0, y); sample(w - 1, y); }
  const refR = sumR / n, refG = sumG / n, refB = sumB / n;
  const refIsTransparent = sumA / n < 16;

  const isSimilar = (r: number, g: number, b: number, a: number) => {
    if (refIsTransparent) return a < 16;
    if (a < 16) return true; // já transparente
    return Math.abs(r - refR) < tolerance && Math.abs(g - refG) < tolerance && Math.abs(b - refB) < tolerance;
  };

  // Marca os pixels de fundo conectados às bordas (flood fill).
  const isBg = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    const i = y * w + x;
    if (x < 0 || y < 0 || x >= w || y >= h || isBg[i]) return;
    const o = i * 4;
    if (isSimilar(d[o], d[o + 1], d[o + 2], d[o + 3])) {
      isBg[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w, y = (i / w) | 0;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }

  // Torna transparentes os pixels de fundo conectados.
  for (let i = 0; i < isBg.length; i++) {
    if (isBg[i]) d[i * 4 + 3] = 0;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** Redimensiona um data URL mantendo proporção e transparência. */
function resizeDataUrl(dataUrl: string, size: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const img = new Image();
  img.src = dataUrl;
  ctx.drawImage(img, 0, 0, size, size);
  return canvas.toDataURL("image/png");
}

export function LogoEditorModal({
  open,
  onOpenChange,
  src,
  exportSize = EXPORT_SIZE,
  onSave,
}: LogoEditorModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const imgRef = useRef<HTMLImageElement | null>(null);

  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);

  // Estado de arrasto.
  const dragState = useRef<{ pointerId: number; startX: number; startY: number; ox: number; oy: number; lastDist: number } | null>(null);

  const historyRef = useRef<{ x: number; y: number; scale: number; rotation: number }[]>([]);
  const historyIndex = useRef(-1);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const [removeBg, setRemoveBg] = useState(false);
  const [isRemovingBg, setIsRemovingBg] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  // Pré-visualização em tempo real (captura do canvas).
  const [livePreview, setLivePreview] = useState("");

  // Renderiza a logo aplicando as transformações num fundo transparente (sem quadriculado),
  // exatamente como será exportada. Usada no preview ao vivo e no salvamento.
  const renderLogoToDataUrl = useCallback(
    (size: number): string => {
      const img = imgRef.current;
      if (!img) return "";
      const out = document.createElement("canvas");
      out.width = size;
      out.height = size;
      const ctx = out.getContext("2d")!;
      const drawImg = removeBg ? removeWhiteBackground(img) : img;
      const s = scale * (size / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
      ctx.save();
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.translate(size / 2, size / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.translate(x * size, y * size);
      ctx.drawImage(drawImg as any, (-img.naturalWidth / 2) * s, (-img.naturalHeight / 2) * s, img.naturalWidth * s, img.naturalHeight * s);
      ctx.restore();
      return out.toDataURL("image/png");
    },
    [removeBg, rotation, scale, x, y]
  );

  // Atualiza o preview ao vivo a cada redesenho.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      setLivePreview(renderLogoToDataUrl(EXPORT_SIZE));
    }, 80);
    return () => clearTimeout(t);
  }, [open, x, y, scale, rotation, removeBg, renderLogoToDataUrl]);

  // Carrega a imagem e aplica enquadramento inicial inteligente.
  useEffect(() => {
    if (!open || !src) return;
    let cancelled = false;
    (async () => {
      const img = await loadImage(src).catch(() => null);
      if (cancelled || !img) return;
      imgRef.current = img;

      // Enquadramento inicial: preencher o círculo com margem confortável.
      const base = Math.min(1, (exportSize / 2) / Math.max(img.naturalWidth || 1, img.naturalHeight || 1) * 1.8);
      const initialScale = Math.max(base, 0.5);

      setX(0);
      setY(0);
      setScale(initialScale);
      setRotation(0);
      historyRef.current = [{ x: 0, y: 0, scale: initialScale, rotation: 0 }];
      historyIndex.current = 0;
      setCanUndo(false);
      setCanRedo(false);
      setRemoveBg(false);
    })();
    return () => { cancelled = true; };
  }, [open, src, exportSize]);

  // Renderiza o canvas a cada mudança.
  useEffect(() => {
    if (!open) return;
    draw();
  }, [open, src, x, y, scale, rotation, removeBg]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext("2d")!;
    const size = canvas.width;
    ctx.clearRect(0, 0, size, size);

    // Fundo quadriculado (transparência) — sutil para não parecer parte da logo.
    const cell = size / 14;
    ctx.fillStyle = "#f3f4f6";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < 14; i++) {
      for (let j = 0; j < 14; j++) {
        if ((i + j) % 2 === 0) ctx.fillRect(i * cell, j * cell, cell, cell);
      }
    }

    // Recorte circular.
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();

    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(x * size, y * size);
    const s = scale * (size / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    const drawImg = removeBg ? removeWhiteBackground(img) : img;
    ctx.drawImage(drawImg as any, (-img.naturalWidth / 2) * s, (-img.naturalHeight / 2) * s, img.naturalWidth * s, img.naturalHeight * s);
    ctx.restore();

    // Borda da máscara.
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 1.5, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(99,102,241,0.6)";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.restore();
  }, [removeBg, rotation, scale, x, y]);

  // Exporta o recorte circular otimizado.
  const handleSave = useCallback(() => {
    const img = imgRef.current;
    if (!img) return;
    const dataUrl = renderLogoToDataUrl(exportSize);
    onSave({
      dataUrl,
      x,
      y,
      scale,
      rotation,
      favicon: resizeDataUrl(dataUrl, 32),
      thumbnail: resizeDataUrl(dataUrl, 96),
    });
  }, [renderLogoToDataUrl, exportSize, x, y, scale, rotation, onSave]);

  // Centraliza a logo.
  const handleCenter = useCallback(() => {
    setX(0);
    setY(0);
    const img = imgRef.current;
    if (!img) return;
    const base = Math.min(1, (exportSize / 2) / Math.max(img.naturalWidth || 1, img.naturalHeight || 1) * 1.8);
    setScale(Math.max(base, 0.5));
    pushHistory(0, 0, Math.max(base, 0.5), rotation);
  }, [exportSize, rotation]);

  const pushHistory = (nx: number, ny: number, ns: number, nr: number) => {
    const h = historyRef.current;
    const idx = historyIndex.current;
    const next = h.slice(0, idx + 1);
    next.push({ x: nx, y: ny, scale: ns, rotation: nr });
    historyRef.current = next;
    historyIndex.current = next.length - 1;
    setCanUndo(true);
    setCanRedo(false);
  };

  const applyTransform = (nx: number, ny: number, ns: number, nr: number) => {
    setX(nx); setY(ny); setScale(ns); setRotation(nr);
    pushHistory(nx, ny, ns, nr);
  };

  const undo = () => {
    if (historyIndex.current <= 0) return;
    historyIndex.current -= 1;
    const s = historyRef.current[historyIndex.current];
    setX(s.x); setY(s.y); setScale(s.scale); setRotation(s.rotation);
    setCanUndo(historyIndex.current > 0);
    setCanRedo(true);
  };

  const redo = () => {
    if (historyIndex.current >= historyRef.current.length - 1) return;
    historyIndex.current += 1;
    const s = historyRef.current[historyIndex.current];
    setX(s.x); setY(s.y); setScale(s.scale); setRotation(s.rotation);
    setCanUndo(true);
    setCanRedo(historyIndex.current < historyRef.current.length - 1);
  };

  // Arrasto / pinch com pointer events.
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      ox: x,
      oy: y,
      lastDist: 0,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragState.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / VIEW_SIZE;
    const dy = (e.clientY - d.startY) / VIEW_SIZE;
    setX(d.ox + dx);
    setY(d.oy + dy);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current) return;
    const dx = (e.clientX - dragState.current.startX) / VIEW_SIZE;
    const dy = (e.clientY - dragState.current.startY) / VIEW_SIZE;
    const nx = dragState.current.ox + dx;
    const ny = dragState.current.oy + dy;
    dragState.current = null;
    if (Math.abs(nx - x) > 0.001 || Math.abs(ny - y) > 0.001) {
      pushHistory(nx, ny, scale, rotation);
    }
  };

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const ns = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale * factor));
    if (ns !== scale) pushHistory(x, y, ns, rotation);
  };

  const zoomBy = (factor: number) => {
    const ns = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale * factor));
    if (ns !== scale) pushHistory(x, y, ns, rotation);
  };

  const handleRemoveBg = useCallback(async () => {
    if (isRemovingBg) return;
    setIsRemovingBg(true);
    // Pequeno atraso para feedback visual.
    await new Promise((r) => setTimeout(r, 60));
    setRemoveBg((prev) => !prev);
    setIsRemovingBg(false);
  }, [isRemovingBg]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-[560px] max-h-[92vh] overflow-hidden flex flex-col gap-0 p-0">
        <DialogHeader className="px-5 pt-5 pb-2 border-b">
          <DialogTitle className="text-lg font-black flex items-center gap-2">
            <Sparkles size={18} className="text-indigo-500" /> Ajuste sua Logo
          </DialogTitle>
          <DialogDescription className="text-xs">
            Arraste, aplique zoom e rotação. A área circular mostra exatamente como ficará.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Preview em tempo real */}
          <div className="flex items-center justify-center gap-3">
            {(["light", "dark"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                  theme === t ? "bg-indigo-500 text-white border-indigo-500" : "bg-muted text-muted-foreground border-border"
                }`}
                aria-pressed={theme === t}
              >
                {t === "light" ? <Sun size={14} /> : <Moon size={14} />} {t === "light" ? "Claro" : "Escuro"}
              </button>
            ))}
          </div>

          {/* Preview em tempo real — menu lateral e portal do aluno */}
          <div className="grid grid-cols-2 gap-3">
            <div className={`rounded-2xl border p-3 ${theme === "dark" ? "bg-slate-900 border-white/10" : "bg-white border-border"}`}>
              <p className={`text-[9px] font-black uppercase tracking-widest mb-2 ${theme === "dark" ? "text-slate-400" : "text-muted-foreground"}`}>Menu Lateral</p>
              <div className="flex items-center gap-2">
                <div className="relative w-9 h-9 rounded-full overflow-hidden border bg-background/40 flex-shrink-0 flex items-center justify-center">
                  {livePreview ? (
                    <img src={livePreview} alt="Preview menu lateral" className="w-full h-full object-contain" />
                  ) : (
                    <ImageIcon size={16} className="opacity-40" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className={`text-[11px] font-black truncate ${theme === "dark" ? "text-white" : "text-slate-900"}`}>Sua Escola</p>
                  <p className={`text-[8px] uppercase tracking-widest font-bold ${theme === "dark" ? "text-slate-400/60" : "text-slate-400"}`}>Escola de Música</p>
                </div>
              </div>
            </div>
            <div className={`rounded-2xl border p-3 ${theme === "dark" ? "bg-slate-900 border-white/10" : "bg-white border-border"}`}>
              <p className={`text-[9px] font-black uppercase tracking-widest mb-2 ${theme === "dark" ? "text-slate-400" : "text-muted-foreground"}`}>Portal do Aluno</p>
              <div className="flex items-center justify-center gap-2">
                <div className="relative w-8 h-8 rounded-full overflow-hidden border bg-background/40 flex-shrink-0 flex items-center justify-center">
                  {livePreview ? (
                    <img src={livePreview} alt="Preview portal do aluno" className="w-full h-full object-contain" />
                  ) : (
                    <ImageIcon size={14} className="opacity-40" />
                  )}
                </div>
                <p className={`text-[11px] font-black truncate ${theme === "dark" ? "text-white" : "text-slate-900"}`}>Bem-vindo!</p>
              </div>
            </div>
          </div>

          {/* Área circular com máscara */}
          <div
            ref={containerRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => (dragState.current = null)}
            onWheel={onWheel}
            className="relative w-full max-w-[420px] mx-auto aspect-square rounded-full overflow-hidden cursor-grab active:cursor-grabbing touch-none select-none"
            role="img"
            aria-label="Editor de logo. Arraste para mover, use a roda do mouse para zoom."
            tabIndex={0}
          >
            <canvas
              ref={canvasRef}
              width={exportSize}
              height={exportSize}
              className="w-full h-full"
            />
          </div>

          {/* Controles */}
          <div className="space-y-5">
            {/* Zoom */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-muted-foreground uppercase tracking-wider">
                <span>Zoom</span>
                <span>{Math.round(scale * 100)}%</span>
              </div>
              <div className="flex items-center gap-3">
                <Button variant="outline" size="icon" onClick={() => zoomBy(1 / 1.2)} aria-label="Diminuir zoom">
                  <ZoomOut size={16} />
                </Button>
                <Slider
                  value={[scale]}
                  min={MIN_ZOOM}
                  max={MAX_ZOOM}
                  step={0.01}
                  onValueChange={([v]) => setScale(v)}
                />
                <Button variant="outline" size="icon" onClick={() => zoomBy(1.2)} aria-label="Aumentar zoom">
                  <ZoomIn size={16} />
                </Button>
              </div>
            </div>

            {/* Rotação */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-muted-foreground uppercase tracking-wider">
                <span>Rotação</span>
                <span>{Math.round(rotation)}°</span>
              </div>
              <div className="flex items-center gap-3">
                <Button variant="outline" size="icon" onClick={() => applyTransform(x, y, scale, (rotation - 90 + 360) % 360)} aria-label="Girar 90 graus para a esquerda">
                  <RotateCcw size={16} />
                </Button>
                <Slider
                  value={[rotation]}
                  min={0}
                  max={360}
                  step={1}
                  onValueChange={([v]) => setRotation(v)}
                />
                <Button variant="outline" size="icon" onClick={() => applyTransform(x, y, scale, (rotation + 90) % 360)} aria-label="Girar 90 graus para a direita">
                  <RotateCw size={16} />
                </Button>
              </div>
            </div>

            {/* Centralizar + Histórico */}
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="secondary" onClick={handleCenter} className="flex-1">
                <Maximize size={16} className="mr-2" /> Centralizar Logo
              </Button>
              <Button variant="outline" size="icon" onClick={undo} disabled={!canUndo} aria-label="Desfazer">
                <Undo size={16} />
              </Button>
              <Button variant="outline" size="icon" onClick={redo} disabled={!canRedo} aria-label="Refazer">
                <Redo size={16} />
              </Button>
            </div>

            {/* Remoção de fundo simples */}
            <Button variant="outline" onClick={handleRemoveBg} disabled={isRemovingBg} className="w-full">
              {isRemovingBg ? <Loader2 size={16} className="animate-spin mr-2" /> : <ImageIcon size={16} className="mr-2" />}
              {removeBg ? "Restaurar Fundo" : "Remover Fundo (branco)"}
            </Button>
          </div>
        </div>

        <DialogFooter className="px-5 py-4 border-t gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} className="bg-indigo-600 hover:bg-indigo-700">
            Salvar Logo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
