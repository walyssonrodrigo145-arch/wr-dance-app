import { useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Upload, FileUp, Loader2, AlertCircle, Download, CalendarPlus, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { MAX_CSV_ROWS, parseDelimited, normalizeHeader, downloadCsv } from "@/lib/csv";

const PAGE_SIZE = 20;

const WEEKDAY_LABELS: Record<string, number> = {
  dom: 0, domingo: 0,
  seg: 1, segunda: 1,
  ter: 2, terca: 2,
  qua: 3, quarta: 3,
  qui: 4, quinta: 4,
  sex: 5, sexta: 5,
  sab: 6, sabado: 6,
};

type Row = {
  key: number;
  name: string;
  modalidade: string;
  professor: string;
  sala: string;
  dias: string;
  horario: string;
  duracao: string;
  capacidade: string;
  idadeMin: string;
  idadeMax: string;
  turno: string;
  nivel: string;
  include: boolean;
};

const HEADER_ALIASES: Record<keyof Omit<Row, "key" | "include">, string[]> = {
  name: ["nome", "turma", "nome da turma"],
  modalidade: ["modalidade", "ritmo", "estilo"],
  professor: ["professor", "coreografo", "professora"],
  sala: ["sala", "estudio", "sala de ensaio"],
  dias: ["dias", "dias da semana", "grade"],
  horario: ["horario", "hora", "inicio"],
  duracao: ["duracao", "duracao minutos", "minutos"],
  capacidade: ["capacidade", "vagas", "limite"],
  idadeMin: ["idade minima", "idade min", "faixa etaria minima"],
  idadeMax: ["idade maxima", "idade max", "faixa etaria maxima"],
  turno: ["turno"],
  nivel: ["nivel"],
};

function parseDias(raw: string): number[] {
  return Array.from(new Set(
    (raw || "")
      .split(/[,;/|]+/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const n = Number(p);
        if (Number.isInteger(n) && n >= 0 && n <= 6 && String(n) === p) return n;
        return WEEKDAY_LABELS[normalizeHeader(p)] ?? Number.NaN;
      })
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
  )).sort((a, b) => a - b);
}

function parseHorario(raw: string): string | null {
  const s = (raw || "").trim().toLowerCase();
  let m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (m) return `${String(Number(m[1])).padStart(2, "0")}:${m[2]}`;
  m = /^(\d{1,2})h(\d{2})?$/.exec(s);
  if (m) return `${String(Number(m[1])).padStart(2, "0")}:${m[2] || "00"}`;
  return null;
}

function buildRows(text: string): { rows: Row[]; hadHeader: boolean; truncated: boolean } {
  const parsed = parseDelimited(text);
  if (parsed.length === 0) return { rows: [], hadHeader: false, truncated: false };

  const first = parsed[0].map(normalizeHeader);
  const hasHeader = first.some((cell) => Object.values(HEADER_ALIASES).flat().includes(cell));
  if (!hasHeader) return { rows: [], hadHeader: false, truncated: false };

  const mapping: Partial<Record<keyof typeof HEADER_ALIASES, number>> = {};
  (Object.keys(HEADER_ALIASES) as Array<keyof typeof HEADER_ALIASES>).forEach((key) => {
    const idx = first.findIndex((cell) => HEADER_ALIASES[key].includes(cell));
    if (idx >= 0) mapping[key] = idx;
  });

  const dataRows = parsed.slice(1);
  const truncated = dataRows.length > MAX_CSV_ROWS;
  const limited = truncated ? dataRows.slice(0, MAX_CSV_ROWS) : dataRows;

  const rows: Row[] = limited.map((cols, i) => {
    const cell = (key: keyof typeof HEADER_ALIASES) => {
      const idx = mapping[key];
      return idx != null ? (cols[idx] || "").trim() : "";
    };
    const name = cell("name");
    return {
      key: i,
      name,
      modalidade: cell("modalidade"),
      professor: cell("professor"),
      sala: cell("sala"),
      dias: cell("dias"),
      horario: cell("horario"),
      duracao: cell("duracao"),
      capacidade: cell("capacidade"),
      idadeMin: cell("idadeMin"),
      idadeMax: cell("idadeMax"),
      turno: cell("turno"),
      nivel: cell("nivel"),
      include: name.length >= 2,
    };
  });

  return { rows, hadHeader: true, truncated };
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Migração de escola: importação de turmas por CSV (cria a grade de uma vez). */
export function ImportTurmasModal({ open, onOpenChange }: Props) {
  const utils = trpc.useUtils();
  const fileRef = useRef<HTMLInputElement>(null);
  const [raw, setRaw] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [hadHeader, setHadHeader] = useState(false);
  const [page, setPage] = useState(0);

  const { data: instruments = [] } = trpc.instruments.list.useQuery(undefined, { enabled: open });
  const { data: profs = [] } = trpc.professores.list.useQuery(undefined, { enabled: open });
  const { data: rooms = [] } = trpc.studioRooms.list.useQuery(undefined, { enabled: open });

  const byName = (list: any[], name: string) => {
    const target = normalizeHeader(name);
    if (!target) return undefined;
    return list.find((item) => normalizeHeader(item.name) === target);
  };

  const resolve = (r: Row) => {
    const errors: string[] = [];
    const modalidade = r.modalidade ? byName(instruments as any[], r.modalidade) : undefined;
    if (r.modalidade && !modalidade) errors.push(`Modalidade "${r.modalidade}" não encontrada`);
    const professor = r.professor ? byName(profs as any[], r.professor) : undefined;
    if (r.professor && !professor) errors.push(`Professor "${r.professor}" não encontrado`);
    const sala = r.sala ? byName(rooms as any[], r.sala) : undefined;
    if (r.sala && !sala) errors.push(`Sala "${r.sala}" não encontrada`);
    const weekdays = parseDias(r.dias);
    const timeStr = r.horario ? parseHorario(r.horario) : null;
    if (r.horario && !timeStr) errors.push(`Horário inválido: "${r.horario}"`);

    return {
      errors,
      payload: {
        name: r.name.trim(),
        modalidadeId: modalidade?.id ?? null,
        professorId: professor?.userId ?? null,
        studioRoomId: sala?.id ?? null,
        weekdays,
        timeStr,
        durationMinutes: Number(r.duracao) > 0 ? Math.min(600, Math.max(15, Number(r.duracao))) : 60,
        capacity: Number(r.capacidade) > 0 ? Math.min(500, Math.max(1, Number(r.capacidade))) : 20,
        ageMin: r.idadeMin && Number.isFinite(Number(r.idadeMin)) ? Number(r.idadeMin) : null,
        ageMax: r.idadeMax && Number.isFinite(Number(r.idadeMax)) ? Number(r.idadeMax) : null,
        shift: r.turno || null,
        level: (["iniciante", "intermediario", "avancado", "todas"].includes(normalizeHeader(r.nivel))
          ? normalizeHeader(r.nivel)
          : "todas") as "iniciante" | "intermediario" | "avancado" | "todas",
      },
    };
  };

  const evaluated = useMemo(() => rows.map((r) => ({ row: r, ...resolve(r) })), [rows, instruments, profs, rooms]);
  const ready = evaluated.filter((e) => e.row.include && e.errors.length === 0);
  const errorCount = evaluated.filter((e) => e.row.include && e.errors.length > 0).length;

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = evaluated.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const applyText = (text: string) => {
    setRaw(text);
    setPage(0);
    const built = buildRows(text);
    setRows(built.rows);
    setHadHeader(built.hadHeader);
    if (built.truncated) toast.warning(`O arquivo tem mais de ${MAX_CSV_ROWS} linhas — importando as primeiras ${MAX_CSV_ROWS}.`);
  };

  const handleFile = (file: File | null | undefined) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("Arquivo muito grande (máx. 2 MB)."); return; }
    const reader = new FileReader();
    reader.onload = () => applyText(String(reader.result || ""));
    reader.onerror = () => toast.error("Falha ao ler o arquivo.");
    reader.readAsText(file, "utf-8");
  };

  const importMutation = trpc.turmas.importBatch.useMutation({
    onSuccess: (res: { imported: number }) => {
      toast.success(`${res.imported} turma(s) importada(s)! Gere as aulas em "Gerar aulas" de cada turma.`);
      utils.turmas.list.invalidate();
      setRaw("");
      setRows([]);
      onOpenChange(false);
    },
    onError: (err: { message?: string }) => toast.error(err.message || "Não foi possível importar as turmas."),
  });

  const submit = () => {
    if (ready.length === 0) { toast.error("Nenhuma turma válida para importar."); return; }
    importMutation.mutate({ rows: ready.map((e) => e.payload) as any });
  };

  const downloadTemplate = () => {
    downloadCsv(
      "modelo_importacao_turmas.csv",
      ["Nome", "Modalidade", "Professor", "Sala", "Dias", "Horário", "Duração", "Capacidade", "Idade mínima", "Idade máxima", "Turno", "Nível"],
      [
        ["Ballet Infantil I", "Ballet", "Maria Silva", "Estúdio 1", "Seg, Qua", "17:00", "60", "20", "6", "9", "Tarde", "iniciante"],
        ["Jazz Juvenil", "Jazz", "Ana Souza", "Estúdio 2", "Ter, Qui", "18:30", "60", "18", "10", "14", "Noite", "intermediario"],
      ]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus size={18} className="text-primary" /> Importar turmas por CSV
          </DialogTitle>
          <DialogDescription>
            Migração de escola: crie a grade de uma vez. Colunas: <strong>Nome; Modalidade; Professor; Sala; Dias; Horário; Duração; Capacidade; Idade mínima; Idade máxima; Turno; Nível</strong> (só o Nome é obrigatório). As aulas são geradas depois em "Gerar aulas".
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Arquivo ou conteúdo {hadHeader && <span className="text-emerald-600">• cabeçalho reconhecido</span>}
              </label>
              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" onClick={downloadTemplate} className="h-8 rounded-lg px-3 text-[10px] font-black uppercase tracking-widest gap-1.5">
                  <Download size={12} /> Modelo
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.txt"
                  className="hidden"
                  onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }}
                />
                <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} className="h-8 rounded-lg px-3 text-[10px] font-black uppercase tracking-widest gap-1.5">
                  <Upload size={12} /> Escolher arquivo
                </Button>
              </div>
            </div>
            <textarea
              value={raw}
              onChange={(e) => applyText(e.target.value)}
              rows={rows.length > 0 ? 3 : 7}
              placeholder={"Ballet Infantil I;Ballet;Maria Silva;Estúdio 1;Seg, Qua;17:00;60;20;6;9;Tarde;iniciante"}
              className="w-full rounded-xl border border-border/60 bg-background p-3 text-[11px] font-mono leading-relaxed outline-none focus:ring-2 focus:ring-primary/20 resize-y"
            />
          </div>

          {rows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Prévia ({rows.length} linha{rows.length === 1 ? "" : "s"})
                </p>
                <div className="flex items-center gap-3 text-[10px] font-bold">
                  <span className="text-emerald-600">{ready.length} pronta(s)</span>
                  {errorCount > 0 && <span className="text-rose-500">{errorCount} com erro</span>}
                </div>
              </div>

              <div className="rounded-xl border border-border/60 overflow-hidden divide-y divide-border/40 max-h-[320px] overflow-y-auto">
                {pageRows.map((e) => (
                  <div key={e.row.key} className={e.errors.length > 0 ? "opacity-70" : ""}>
                    <div className="flex items-start gap-2 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={e.row.include}
                        onChange={() => setRows((prev) => prev.map((r) => r.key === e.row.key ? { ...r, include: !r.include } : r))}
                        className="mt-1 w-3.5 h-3.5 accent-primary cursor-pointer"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-foreground truncate">{e.row.name || "(sem nome)"}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {[
                            e.row.modalidade || null,
                            e.row.dias ? `Dias ${e.row.dias}` : null,
                            e.row.horario ? e.row.horario : null,
                            e.row.professor ? `Prof. ${e.row.professor}` : null,
                            e.row.sala ? `Sala ${e.row.sala}` : null,
                          ].filter(Boolean).join(" • ")}
                        </p>
                        {e.errors.length > 0 ? (
                          e.errors.map((err, i) => (
                            <p key={i} className="text-[9px] font-bold text-rose-500 leading-tight">{err}</p>
                          ))
                        ) : (
                          <p className="text-[9px] font-bold text-emerald-600">Pronto</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setRows((prev) => prev.filter((r) => r.key !== e.row.key))}
                        className="mt-0.5 w-7 h-7 rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 flex items-center justify-center transition-colors"
                        title="Remover linha"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setPage(Math.max(0, safePage - 1))}
                    disabled={safePage === 0}
                    className="w-7 h-7 rounded-lg border border-border/60 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40"
                  >
                    <ChevronLeft size={13} />
                  </button>
                  <span className="text-[10px] font-bold text-muted-foreground">Página {safePage + 1} de {totalPages}</span>
                  <button
                    type="button"
                    onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))}
                    disabled={safePage >= totalPages - 1}
                    className="w-7 h-7 rounded-lg border border-border/60 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40"
                  >
                    <ChevronRight size={13} />
                  </button>
                </div>
              )}

              {!hadHeader && (
                <p className="text-[10px] text-amber-600 flex items-center gap-1.5">
                  <AlertCircle size={11} /> A primeira linha precisa ser o cabeçalho (baixe o modelo).
                </p>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="h-10 rounded-xl px-4 text-xs font-bold">
              Cancelar
            </Button>
            <Button type="button" onClick={submit} disabled={importMutation.isPending || ready.length === 0} className="h-10 rounded-xl px-5 text-xs font-bold gap-2">
              {importMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />}
              Importar {ready.length > 0 ? `${ready.length} turma(s)` : ""}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
