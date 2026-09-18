import { useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload, FileUp, Loader2, AlertCircle } from "lucide-react";

type ParsedRow = {
  name: string;
  phone?: string;
  email?: string;
  birthDate?: string;
};

function parseCsvText(text: string): { rows: ParsedRow[]; invalid: number } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows: ParsedRow[] = [];
  let invalid = 0;

  for (const line of lines) {
    const cols = line.split(/[;,\t]/).map((c) => c.trim());
    const name = cols[0] || "";
    if (/^nome$/i.test(name)) continue;
    if (name.length < 2) { invalid++; continue; }

    let phone = cols[1] || "";
    let email = cols[2] || "";
    let birthDate = cols[3] || "";

    // Tolerância: se a 2ª coluna for e-mail, aceita ordem e-mail;telefone
    if (phone.includes("@")) {
      email = phone;
      phone = cols[2] || "";
      birthDate = cols[3] || "";
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      email = "";
    }

    // DD/MM/AAAA → AAAA-MM-DD
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(birthDate)) {
      const [d, m, y] = birthDate.split("/");
      birthDate = `${y}-${m}-${d}`;
    }

    // Data inválida é descartada (não derruba o lote)
    if (birthDate && !(/^\d{4}-\d{2}-\d{2}$/.test(birthDate) && !Number.isNaN(Date.parse(birthDate)))) {
      birthDate = "";
    }

    rows.push({
      name,
      phone: phone || undefined,
      email: email || undefined,
      birthDate: birthDate || undefined,
    });
  }

  return { rows, invalid };
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Fase 3 — Importação de alunos por CSV colado (uma linha por aluno). */
export function ImportStudentsModal({ open, onOpenChange }: Props) {
  const utils = trpc.useUtils();
  const fileRef = useRef<HTMLInputElement>(null);
  const [raw, setRaw] = useState("");
  const [professorId, setProfessorId] = useState<string>("");
  const [instrumentId, setInstrumentId] = useState<string>("none");
  const [level, setLevel] = useState<"iniciante" | "intermediario" | "avancado">("iniciante");

  const { data: profs = [] } = trpc.professores.list.useQuery(undefined, { enabled: open });
  const { data: instruments = [] } = trpc.instruments.list.useQuery(undefined, { enabled: open });

  const { rows, invalid } = useMemo(() => parseCsvText(raw), [raw]);

  const importMutation = trpc.students.importBatch.useMutation({
    onSuccess: (res) => {
      toast.success(`${res.imported} aluno${res.imported === 1 ? "" : "s"} importado${res.imported === 1 ? "" : "s"}${res.skipped > 0 ? ` • ${res.skipped} linha(s) ignorada(s)` : ""}`);
      if (res.skippedNames && res.skippedNames.length > 0) {
        toast.warning(`E-mail já cadastrado — não importados: ${res.skippedNames.slice(0, 5).join(", ")}${res.skippedNames.length > 5 ? "…" : ""}`, { duration: 8000 });
      }
      utils.students.list.invalidate();
      setRaw("");
      setProfessorId("");
      setInstrumentId("none");
      onOpenChange(false);
    },
    onError: (err) => toast.error(err.message || "Não foi possível importar os alunos."),
  });

  const handleFile = (file: File | null | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setRaw(String(reader.result || ""));
    reader.onerror = () => toast.error("Falha ao ler o arquivo.");
    reader.readAsText(file, "utf-8");
  };

  const submit = () => {
    if (!professorId) { toast.error("Selecione o professor responsável."); return; }
    if (rows.length === 0) { toast.error("Cole ou importe o CSV com ao menos um aluno."); return; }
    importMutation.mutate({
      professorId: Number(professorId),
      instrumentId: instrumentId === "none" ? null : Number(instrumentId),
      level,
      rows,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileUp size={18} className="text-primary" /> Importar alunos por CSV
          </DialogTitle>
          <DialogDescription>
            Uma linha por aluno no formato <strong>Nome; Telefone; E-mail; Nascimento</strong> (telefone, e-mail e nascimento são opcionais; nascimento em AAAA-MM-DD ou DD/MM/AAAA).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Professor responsável *</label>
              <Select value={professorId} onValueChange={setProfessorId}>
                <SelectTrigger className="h-10 rounded-xl text-xs font-bold">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {profs.map((p: any) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Modalidade padrão</label>
              <Select value={instrumentId} onValueChange={setInstrumentId}>
                <SelectTrigger className="h-10 rounded-xl text-xs font-bold">
                  <SelectValue placeholder="Sem modalidade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem modalidade</SelectItem>
                  {instruments.map((i: any) => (
                    <SelectItem key={i.id} value={String(i.id)}>{i.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Nível inicial</label>
              <Select value={level} onValueChange={(v) => setLevel(v as typeof level)}>
                <SelectTrigger className="h-10 rounded-xl text-xs font-bold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="iniciante">Iniciante</SelectItem>
                  <SelectItem value="intermediario">Intermediário</SelectItem>
                  <SelectItem value="avancado">Avançado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Cole o CSV aqui</label>
              <div className="flex items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.txt"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileRef.current?.click()}
                  className="h-8 rounded-lg px-3 text-[10px] font-black uppercase tracking-widest gap-1.5"
                >
                  <Upload size={12} /> Escolher arquivo
                </Button>
              </div>
            </div>
            <textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              rows={8}
              placeholder={"Ana Souza; (11) 99999-0000; ana@email.com; 2010-05-14\nBeatriz Lima; (11) 98888-1111"}
              className="w-full rounded-xl border border-border/60 bg-background p-3 text-[11px] font-mono leading-relaxed outline-none focus:ring-2 focus:ring-primary/20 resize-y"
            />
            <div className="flex items-center gap-2 text-[10px] font-bold">
              {rows.length > 0 ? (
                <span className="text-emerald-600 dark:text-emerald-400">{rows.length} aluno(s) prontos para importar{invalid > 0 ? ` • ${invalid} linha(s) ignorada(s)` : ""}</span>
              ) : (
                <span className="text-muted-foreground flex items-center gap-1"><AlertCircle size={11} /> Nenhum aluno válido ainda.</span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-10 rounded-xl px-4 text-xs font-bold"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={submit}
              disabled={importMutation.isPending || rows.length === 0 || !professorId}
              className="h-10 rounded-xl px-5 text-xs font-bold gap-2"
            >
              {importMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />}
              Importar {rows.length > 0 ? `${rows.length} aluno(s)` : ""}
            </Button>
          </div>

          <p className="text-[10px] text-muted-foreground leading-snug">
            Os alunos entram como <strong>ativos</strong> com mensalidade zerada — ajuste valores e cobranças depois na edição de cada aluno.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
