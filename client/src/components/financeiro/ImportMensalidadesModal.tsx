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
import { Upload, FileUp, Loader2, AlertCircle, Download, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { MAX_CSV_ROWS, parseDelimited, normalizeHeader, downloadCsv } from "@/lib/csv";

const PAGE_SIZE = 20;
const MONTHS_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

type Row = {
  key: number;
  aluno: string;
  valor: string;
  vencimento: string;
  pagoAte: string;
  include: boolean;
};

const HEADER_ALIASES: Record<keyof Omit<Row, "key" | "include">, string[]> = {
  aluno: ["aluno", "nome", "estudante", "cliente"],
  valor: ["valor", "mensalidade", "valor mensal", "preco"],
  vencimento: ["vencimento", "dia vencimento", "dia de vencimento", "dia"],
  pagoAte: ["pago ate", "pagou ate", "saldo ate", "quitado ate", "pago até"],
};

/** Aceita "MM/AAAA", "MM-AAAA" ou "AAAA-MM". */
function parsePagoAte(raw: string): { month: number; year: number } | null {
  const s = (raw || "").trim();
  let m = /^(\d{1,2})[\/\-.](\d{4})$/.exec(s);
  if (m) {
    const month = Number(m[1]);
    const year = Number(m[2]);
    return month >= 1 && month <= 12 ? { month, year } : null;
  }
  m = /^(\d{4})[\/\-.](\d{1,2})$/.exec(s);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    return month >= 1 && month <= 12 ? { month, year } : null;
  }
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
    const aluno = cell("aluno");
    return {
      key: i,
      aluno,
      valor: cell("valor"),
      vencimento: cell("vencimento"),
      pagoAte: cell("pagoAte"),
      include: aluno.length >= 2,
    };
  });

  return { rows, hadHeader: true, truncated };
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Migração: importa mensalidades em aberto com "pago até" (saldo de meses). */
export function ImportMensalidadesModal({ open, onOpenChange }: Props) {
  const utils = trpc.useUtils();
  const fileRef = useRef<HTMLInputElement>(null);
  const [raw, setRaw] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [hadHeader, setHadHeader] = useState(false);
  const [page, setPage] = useState(0);
  const [report, setReport] = useState<{ created: number; skipped: number; details: Array<{ name: string; reason: string }> } | null>(null);

  const { data: students = [] } = trpc.students.list.useQuery(undefined, { enabled: open });

  const studentsByName = useMemo(() => {
    const m = new Map<string, any[]>();
    (students as any[]).forEach((s) => {
      const key = normalizeHeader(s.name || "");
      if (!key) return;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(s);
    });
    return m;
  }, [students]);

  const studentsByEmail = useMemo(() => {
    const m = new Map<string, any>();
    (students as any[]).forEach((s) => {
      if (s.email) m.set(String(s.email).toLowerCase().trim(), s);
    });
    return m;
  }, [students]);

  const now = new Date();
  const curMonth = now.getMonth() + 1;
  const curYear = now.getFullYear();

  const resolve = (r: Row) => {
    const raw = r.aluno.trim();
    let student: any | undefined;
    if (raw.includes("@")) {
      student = studentsByEmail.get(raw.toLowerCase());
      if (!student) return { error: `E-mail "${raw}" não encontrado` };
    } else {
      const list = studentsByName.get(normalizeHeader(raw)) || [];
      if (list.length === 0) return { error: `Aluno "${raw}" não encontrado` };
      if (list.length > 1) return { error: `Mais de um aluno com o nome "${raw}" — use o e-mail` };
      student = list[0];
    }

    const valor = r.valor ? Number(String(r.valor).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")) : undefined;
    const dueDay = r.vencimento ? Number(String(r.vencimento).replace(/\D/g, "")) : undefined;
    const pagoAte = r.pagoAte ? parsePagoAte(r.pagoAte) : null;
    if (r.pagoAte && !pagoAte) return { error: `"Pago até" inválido ("${r.pagoAte}") — use MM/AAAA` };

    let openMonths = 1;
    if (pagoAte) {
      const startMonth = pagoAte.month === 12 ? 1 : pagoAte.month + 1;
      const startYear = pagoAte.month === 12 ? pagoAte.year + 1 : pagoAte.year;
      openMonths = (curYear - startYear) * 12 + (curMonth - startMonth) + 1;
    }

    return {
      student,
      payload: {
        studentId: student.id,
        amount: valor != null && Number.isFinite(valor) ? valor : undefined,
        dueDay: dueDay && dueDay >= 1 && dueDay <= 31 ? dueDay : undefined,
        paidThroughMonth: pagoAte?.month ?? null,
        paidThroughYear: pagoAte?.year ?? null,
      },
      openMonths,
      openLabel: openMonths <= 0
        ? "nada em aberto"
        : `${openMonths} mês(es): ${(() => {
            const startMonth = pagoAte ? (pagoAte.month === 12 ? 1 : pagoAte.month + 1) : curMonth;
            const startYear = pagoAte ? (pagoAte.month === 12 ? pagoAte.year + 1 : pagoAte.year) : curYear;
            const first = `${MONTHS_PT[startMonth - 1]}/${startYear}`;
            const last = `${MONTHS_PT[curMonth - 1]}/${curYear}`;
            return startMonth === curMonth && startYear === curYear ? first : `${first} a ${last}`;
          })()}`,
    };
  };

  const evaluated = useMemo(() => rows.map((r) => ({ row: r, ...resolve(r) })), [rows, studentsByName, studentsByEmail]);
  const ready = evaluated.filter((e) => e.row.include && "payload" in e && (e as any).openMonths > 0);
  const errorCount = evaluated.filter((e) => e.row.include && (!("payload" in e) || (e as any).openMonths <= 0)).length;

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = evaluated.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const applyText = (text: string) => {
    setRaw(text);
    setReport(null);
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

  const importMutation = trpc.paymentDues.importBatch.useMutation({
    onSuccess: (res: { created: number; skipped: number; details: Array<{ name: string; reason: string }> }) => {
      toast.success(`${res.created} mensalidade(s) criada(s)${res.skipped > 0 ? ` • ${res.skipped} aluno(s) sem mudança` : ""}.`);
      utils.paymentDues.list.invalidate();
      setReport({ created: res.created, skipped: res.skipped, details: res.details || [] });
    },
    onError: (err: { message?: string }) => toast.error(err.message || "Não foi possível importar as mensalidades."),
  });

  const submit = () => {
    if (ready.length === 0) { toast.error("Nenhuma linha válida com meses em aberto."); return; }
    importMutation.mutate({ rows: ready.map((e) => (e as any).payload) });
  };

  const downloadTemplate = () => {
    downloadCsv(
      "modelo_mensalidades_migracao.csv",
      ["Aluno", "Valor", "Vencimento", "Pago até"],
      [
        ["Ana Souza", "250,00", "10", "06/2026"],
        ["Beatriz Lima", "180,00", "5", ""],
      ]
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setReport(null); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileUp size={18} className="text-primary" /> Importar mensalidades (migração)
          </DialogTitle>
          <DialogDescription>
            Colunas: <strong>Aluno; Valor; Vencimento (dia); Pago até (MM/AAAA)</strong>. O sistema cria as cobranças
            do mês seguinte ao "Pago até" até o mês atual — sem duplicar o que já existe. Sem "Pago até", cria só o mês atual.
          </DialogDescription>
        </DialogHeader>

        {report ? (
          <div className="space-y-4 pt-1">
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <p className="text-sm font-black text-foreground">{report.created} mensalidade(s) criada(s)</p>
              <p className="text-[11px] text-muted-foreground font-medium">
                {report.skipped > 0 ? `${report.skipped} aluno(s) sem mudança (já quitados ou já lançados).` : "Todas as linhas foram processadas."}
              </p>
            </div>
            {report.details.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-xl border border-border/60 divide-y divide-border/40">
                {report.details.map((d, i) => (
                  <div key={i} className="flex items-start gap-2 px-3 py-2 text-[11px]">
                    <AlertCircle size={13} className="text-amber-500 shrink-0 mt-0.5" />
                    <span className="font-bold text-foreground">{d.name}</span>
                    <span className="text-muted-foreground">— {d.reason}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setReport(null)} className="h-10 rounded-xl px-4 text-xs font-bold">Importar mais</Button>
              <Button type="button" onClick={() => onOpenChange(false)} className="h-10 rounded-xl px-5 text-xs font-bold">Concluir</Button>
            </div>
          </div>
        ) : (
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
                  <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }} />
                  <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} className="h-8 rounded-lg px-3 text-[10px] font-black uppercase tracking-widest gap-1.5">
                    <Upload size={12} /> Escolher arquivo
                  </Button>
                </div>
              </div>
              <textarea
                value={raw}
                onChange={(e) => applyText(e.target.value)}
                rows={rows.length > 0 ? 3 : 7}
                placeholder={"Ana Souza; 250,00; 10; 06/2026\nBeatriz Lima; 180,00; 5"}
                className="w-full rounded-xl border border-border/60 bg-background p-3 text-[11px] font-mono leading-relaxed outline-none focus:ring-2 focus:ring-primary/20 resize-y"
              />
            </div>

            {rows.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Prévia ({rows.length})</p>
                  <div className="flex items-center gap-3 text-[10px] font-bold">
                    <span className="text-emerald-600">{ready.length} pronta(s)</span>
                    {errorCount > 0 && <span className="text-amber-600">{errorCount} sem mês em aberto/erro</span>}
                  </div>
                </div>
                <div className="rounded-xl border border-border/60 overflow-hidden divide-y divide-border/40 max-h-[320px] overflow-y-auto">
                  {pageRows.map((e) => (
                    <div key={e.row.key} className="flex items-start gap-2 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={e.row.include}
                        onChange={() => setRows((prev) => prev.map((r) => r.key === e.row.key ? { ...r, include: !r.include } : r))}
                        className="mt-1 w-3.5 h-3.5 accent-primary cursor-pointer"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-foreground truncate">{e.row.aluno || "(sem nome)"}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {e.row.valor ? `R$ ${e.row.valor}` : "valor do cadastro"}
                          {e.row.vencimento ? ` • vence dia ${e.row.vencimento}` : ""}
                          {e.row.pagoAte ? ` • pago até ${e.row.pagoAte}` : ""}
                        </p>
                        {"error" in e && e.error ? (
                          <p className="text-[9px] font-bold text-rose-500">{e.error}</p>
                        ) : ("payload" in e) ? (
                          <p className={`text-[9px] font-bold ${(e as any).openMonths > 0 ? "text-emerald-600" : "text-amber-600"}`}>
                            {(e as any).openLabel}
                          </p>
                        ) : null}
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
                  ))}
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-between gap-2">
                    <button type="button" onClick={() => setPage(Math.max(0, safePage - 1))} disabled={safePage === 0}
                      className="w-7 h-7 rounded-lg border border-border/60 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40">
                      <ChevronLeft size={13} />
                    </button>
                    <span className="text-[10px] font-bold text-muted-foreground">Página {safePage + 1} de {totalPages}</span>
                    <button type="button" onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))} disabled={safePage >= totalPages - 1}
                      className="w-7 h-7 rounded-lg border border-border/60 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40">
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
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="h-10 rounded-xl px-4 text-xs font-bold">Cancelar</Button>
              <Button type="button" onClick={submit} disabled={importMutation.isPending || ready.length === 0} className="h-10 rounded-xl px-5 text-xs font-bold gap-2">
                {importMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />}
                Importar {ready.length > 0 ? `${ready.length} aluno(s)` : ""}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
