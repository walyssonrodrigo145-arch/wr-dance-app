import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface LogoUploadZoneProps {
  value: string | null;
  onImageSelected: (dataUrl: string, file: File) => void;
  onRemove: () => void;
  maxSizeMB?: number;
  acceptHint?: string;
}

const ACCEPTED_EXT = ["png", "jpg", "jpeg", "webp", "svg"];

function isAcceptable(file: File): boolean {
  const name = file.name.toLowerCase();
  const ext = name.split(".").pop() || "";
  return ACCEPTED_EXT.includes(ext) || file.type.startsWith("image/");
}

export function LogoUploadZone({
  value,
  onImageSelected,
  onRemove,
  maxSizeMB = 5,
  acceptHint = "PNG • JPG • JPEG • SVG • WEBP",
}: LogoUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(
    (file: File) => {
      if (!file) return;
      if (!isAcceptable(file)) {
        toast.error("Formato não suportado. Use PNG, JPG, JPEG, SVG ou WEBP.");
        return;
      }
      if (file.size > maxSizeMB * 1024 * 1024) {
        toast.error(`A imagem deve ter no máximo ${maxSizeMB}MB.`);
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        onImageSelected(reader.result as string, file);
      };
      reader.onerror = () => toast.error("Erro ao ler a imagem.");
      reader.readAsDataURL(file);
    },
    [maxSizeMB, onImageSelected]
  );

  // Colar imagem (CTRL+V) quando a área está focada.
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            handleFile(file);
          }
          break;
        }
      }
    };
    document.addEventListener("paste", handler);
    return () => document.removeEventListener("paste", handler);
  }, [handleFile]);

  if (value) {
    return (
      <div className="flex items-center gap-4 w-full">
        <div className="relative w-16 h-16 rounded-2xl overflow-hidden shrink-0 border border-border bg-muted">
          <img src={value} alt="Logo selecionada" className="w-full h-full object-contain" />
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-wider shadow-md transition-all active:scale-95"
          >
            <ImagePlus size={14} /> Trocar Imagem
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-rose-500 hover:bg-rose-500/10 text-xs font-bold transition-colors"
          >
            <X size={14} /> Remover
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) handleFile(f);
      }}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      aria-label="Enviar logo. Arraste a imagem ou clique para selecionar."
      className={cn(
        "w-full border-2 border-dashed rounded-2xl py-10 px-6 text-center cursor-pointer transition-all select-none",
        dragOver
          ? "border-indigo-500 bg-indigo-500/10 scale-[1.01]"
          : "border-border/60 hover:border-indigo-400/60 hover:bg-muted/30"
      )}
    >
      <div className="flex flex-col items-center gap-3">
        {dragOver ? (
          <UploadCloud size={36} className="text-indigo-500" />
        ) : (
          <ImagePlus size={36} className="text-indigo-400" />
        )}
        <p className="text-sm font-bold text-foreground">
          {dragOver ? "Solte sua logo aqui" : "Arraste sua logo aqui"}
        </p>
        <p className="text-xs text-muted-foreground">ou clique para selecionar • Ctrl+V para colar</p>
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/50 border border-border/40 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
          {acceptHint} • Máx {maxSizeMB}MB
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
