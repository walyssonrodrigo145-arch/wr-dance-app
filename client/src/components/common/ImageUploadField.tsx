import { useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Upload, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SmartImage } from "@/components/common/SmartImage";

/**
 * Campo de imagem com DOIS caminhos: enviar do dispositivo (upload com
 * validação server-side) ou colar uma URL externa. Mostra preview com
 * fallback elegante quando a imagem não carrega.
 */
export function ImageUploadField({
  value,
  onChange,
  label,
  hint,
  fallbackIcon,
}: {
  value: string;
  onChange: (url: string) => void;
  label: string;
  hint?: string;
  fallbackIcon?: React.ReactNode;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const upload = trpc.uploads.image.useMutation({
    onSuccess: (result) => {
      toast.success("Imagem enviada!");
      onChange(result.url);
    },
    onError: (error) => toast.error(error.message),
  });

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Envie um arquivo de imagem (JPG, PNG, WEBP ou GIF).");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Imagem maior que 8MB. Reduza o tamanho e tente novamente.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      upload.mutate({
        fileName: file.name || "imagem.jpg",
        fileType: file.type,
        base64Data: String(reader.result || ""),
      });
    };
    reader.onerror = () => toast.error("Falha ao ler o arquivo. Tente novamente.");
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-start gap-3">
        <SmartImage
          src={value || null}
          alt="Pré-visualização"
          className="h-16 w-16 rounded-xl object-cover border border-border shrink-0"
          fallback={
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-dashed border-border bg-muted/40 text-muted-foreground/60">
              {fallbackIcon ?? <Upload size={18} />}
            </span>
          }
        />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) handleFile(file);
                event.target.value = "";
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={upload.isPending}
              onClick={() => fileRef.current?.click()}
            >
              {upload.isPending ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Upload size={13} className="mr-1.5" />}
              {upload.isPending ? "Enviando..." : "Enviar do dispositivo"}
            </Button>
            {value && (
              <Button type="button" size="sm" variant="ghost" className="text-muted-foreground hover:text-rose-500" onClick={() => onChange("")}>
                <X size={13} className="mr-1" /> Remover
              </Button>
            )}
          </div>
          <Input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="ou cole uma URL de imagem (https://...)"
            maxLength={1000}
          />
        </div>
      </div>
      {hint && <p className="text-[10px] text-muted-foreground font-medium">{hint}</p>}
    </div>
  );
}
