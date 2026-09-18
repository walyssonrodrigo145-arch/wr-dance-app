import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Upload, FileUp, Loader2, AlertCircle, Download, FileText,
  Trash2, ChevronLeft, ChevronRight, CheckCircle2,
} from "lucide-react";

const MAX_ROWS = 300;
const PAGE_SIZE = 25;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Row = {
  key: number;
  name: string;
  phone: string;
  email: string;
  birthDate: string;
  include: boolean;
};

type SkippedDetail = { name: string; phone?: string; email?: string; birthDate?: string; reason: string };

type Report = { imported: number; skipped: number; details: SkippedDetail[] };

const digits = (v: string) => (v || "").replace(/\D/g, "");

function normalizeBirthDate(raw: string): string {
  const s = (raw || "").trim();
  if (!s) return "";
  let iso = "";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split("/");
    iso = `${y}-${m}-${d}`;
  } else if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
    const [d, m, y] = s.split("-");
    iso = `${y}-${m}-${d}`;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    iso = s;
  } else {
    return "";
  }
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return "";
  return iso;
}

function detectDelimiter(line: string): string {
  const candidates = [";", ",", "\t"];
  let best = ";";
  let bestCount = -1;
  for (const c of candidates) {
    const count = line.split(c).length - 1;
    if (count > bestCount) { best = c; bestCount = count; }
  }
  return best;
}

/** Parser CSV real: aspas, escapes, BOM, CRLF e delimitador detectado. */
function parseDelimited(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, "");
  const firstLine = clean.split(/\r?\n/)[0] || "";
  const delimiter = detectDelimiter(firstLine);
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  row.push(field);
  rows.push(row);

  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const HEADER_ALIASES: Record<"name" | "phone" | "email" | "birthDate", string[]> = {
  name: ["nome", "nome completo", "nome do aluno", "aluno", "aluna", "name"],
  phone: ["telefone", "telefone celular", "celular", "whatsapp", "fone", "phone"],
  email: ["email", "e-mail", "e mail"],
  birthDate: ["nascimento", "data de nascimento", "nasc", "aniversario", "birthdate", "data nasc"],
};

const normalizeHeader = (v: string) =>
  (v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

function buildRows(text: string): { rows: Row[]; hadHeader: boolean; truncated: boolean } {
  const parsed = parseDelimited(text);
  if (parsed.length === 0) return { rows: [], hadHeader: false, truncated: false };

  const first = parsed[0].map(normalizeHeader);
  const isHeaderCell = (cell: string) =>
    (Object.keys(HEADER_ALIASES) as Array<keyof typeof HEADER_ALIASES>).some((k) => HEADER_ALIASES[k].includes(cell));
  const hadHeader = first.some(isHeaderCell);

  let mapping: Partial<Record<"name" | "phone" | "email" | "birthDate", number>> = { name: 0, phone: 1, email: 2, birthDate: 3 };
  let dataRows = parsed;
  if (hadHeader) {
    mapping = {};
    (Object.keys(HEADER_ALIASES) as Array<keyof typeof HEADER_ALIASES>).forEach((key) => {
      const idx = first.findIndex((cell) => HEADER_ALIASES[key].includes(cell));
      if (idx >= 0) mapping[key] = idx;
    });
    if (mapping.name == null) mapping.name = 0;
    dataRows = parsed.slice(1);
  }

  const truncated = dataRows.length > MAX_ROWS;
  const limited = truncated ? dataRows.slice(0, MAX_ROWS) : dataRows;

  const rows: Row[] = limited.map((cols, i) => {
    const cell = (idx?: number) => (idx != null ? (cols[idx] || "").trim() : "");
    const name = cell(mapping.name);
    let phone = cell(mapping.phone);
    let email = cell(mapping.email).toLowerCase();
    const birthRaw = cell(mapping.birthDate);

    // Tolerância legada: 2ª coluna com e-mail (formato Nome;E-mail;Telefone)
    if (!hadHeader && phone.includes("@")) {
      email = phone.toLowerCase();
      phone = "";
    }

    return { key: i, name, phone, email, birthDate: birthRaw, include: name.length >= 2 };
  });

  return { rows, hadHeader, truncated };
}

function downloadCsv(filename: string, header: string[], data: string[][]) {
  const csv = "\uFEFF" + [header, ...data]
    .map((r) => r.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(";"))
    .join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Importação de alunos por CSV — Fase 1: round-trip, prévia editável, template e relatório. */
export function ImportStudentsModal({ open, onOpenChange }: Props) {
  const utils = trpc.useUtils();
  const fileRef = useRef<HTMLInputElement>(null);
  const [raw, setRaw] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [hadHeader, setHadHeader] = useState(false);
  const [overrides, setOverrides] = useState<Set<number>>(new Set());
  const [page, setPage] = useState(0);
  const [report, setReport] = useState<Report | null>(null);
  const [professorId, setProfessorId] = useState<string>("");
  const [instrumentId, setInstrumentId] = useState<string>("none");
  const [level, setLevel] = useState<"iniciante" | "intermediario" | "avancado">("iniciante");
  const [precheckTick, setPrecheckTick] = useState(0);

  const { data: profs = [] } = trpc.professores.list.useQuery(undefined, { enabled: open });
  const { data: instruments = [] } = trpc.instruments.list.useQuery(undefined, { enabled: open });

  useEffect(() => {
    const t = setTimeout(() => setPrecheckTick((v) => v + 1), 600);
    return () => clearTimeout(t);
  }, [rows]);

  const precheckInput = useMemo(() => ({
    emails: Array.from(new Set(rows.map((r) => r.email.trim().toLowerCase()).filter(Boolean))),
    phones: Array.from(new Set(rows.map((r) => r.phone.trim()).filter((p) => digits(p).length >= 8))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [precheckTick]);

  const { data: precheck, isFetching: isPrechecking } = trpc.students.importPrecheck.useQuery(precheckInput, {
    enabled: open && report == null && (precheckInput.emails.length > 0 || precheckInput.phones.length > 0),
  });

  const existingEmailSet = useMemo(
    () => new Set((precheck?.existingEmails || []).map((e) => e.toLowerCase())),
    [precheck]
  );
  const phoneOwners = precheck?.phoneOwners || {};

  const emailCount = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => { const e = r.email.trim().toLowerCase(); if (e) m.set(e, (m.get(e) || 0) + 1); });
    return m;
  }, [rows]);

  const phoneCount = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => { const p = digits(r.phone); if (p.length >= 8) m.set(p, (m.get(p) || 0) + 1); });
    return m;
  }, [rows]);

  const rowIssues = (r: Row): { errors: string[]; warnings: string[] } => {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (r.name.trim().length < 2) errors.push("Nome inválido");
    const email = r.email.trim().toLowerCase();
    if (email) {
      if (!EMAIL_RE.test(r.email.trim())) warnings.push("E-mail inválido — será ignorado");
      else if (existingEmailSet.has(email)) errors.push("E-mail já cadastrado — importa sem o e-mail");
      else if ((emailCount.get(email) || 0) > 1) warnings.push("E-mail repetido no arquivo — só o 1º mantém");
    }
    const p = digits(r.phone);
    if (r.phone.trim() && p.length < 8) warnings.push("Telefone incompleto");
    if (p.length >= 8) {
      if (phoneOwners[p]) warnings.push(`Telefone já usado por ${phoneOwners[p]}`);
      else if ((phoneCount.get(p) || 0) > 1) warnings.push("Telefone repetido no arquivo");
    }
    if (r.birthDate.trim() && !normalizeBirthDate(r.birthDate)) warnings.push("Data de nascimento inválida — será ignorada");
    return { errors, warnings };
  };

  useEffect(() => {
    if (report != null) return;
    setRows((prev) => {
      let changed = false;
      const next = prev.map((r) => {
        if (overrides.has(r.key)) return r;
        const hasError = rowIssues(r).errors.length > 0;
        if (hasError && r.include) { changed = true; return { ...r, include: false }; }
        if (!hasError && !r.include) { changed = true; return { ...r, include: true }; }
        return r;
      });
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [precheck, rows.length, overrides, report]);

  const applyText = (text: string) => {
    setRaw(text);
    setReport(null);
    setOverrides(new Set());
    setPage(0);
    const built = buildRows(text);
    setRows(built.rows);
    setHadHeader(built.hadHeader);
    if (built.truncated) toast.warning(`O arquivo tem mais de ${MAX_ROWS} linhas — importando as primeiras ${MAX_ROWS}.`);
  };

  const handleFile = (file: File | null | undefined) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("Arquivo muito grande (máx. 2 MB)."); return; }
    const reader = new FileReader();
    reader.onload = () => applyText(String(reader.result || ""));
    reader.onerror = () => toast.error("Falha ao ler o arquivo.");
    reader.readAsText(file, "utf-8");
  };

  const updateRow = (key: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const toggleInclude = (key: number) => {
    setOverrides((prev) => new Set(prev).add(key));
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, include: !r.include } : r)));
  };

  const removeRow = (key: number) => setRows((prev) => prev.filter((r) => r.key !== key));

  const issuesByKey = useMemo(() => {
    const m = new Map<number, { errors: string[]; warnings: string[] }>();
    rows.forEach((r) => m.set(r.key, rowIssues(r)));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, precheck]);

  const problemCount = useMemo(
    () => rows.filter((r) => { const i = issuesByKey.get(r.key); return (i?.errors.length || 0) > 0 || (i?.warnings.length || 0) > 0; }).length,
    [rows, issuesByKey]
  );

  const includedRows = rows.filter((r) => r.include);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = rows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const buildPayload = () => {
    const seenEmails = new Set<string>();
    return includedRows
      .map((r) => {
        const email = r.email.trim().toLowerCase();
        let finalEmail: string | undefined;
        if (email && EMAIL_RE.test(email) && !existingEmailSet.has(email) && !seenEmails.has(email)) {
          finalEmail = email;
          seenEmails.add(email);
        }
        return {
          name: r.name.trim(),
          email: finalEmail,
          phone: r.phone.trim() || undefined,
          birthDate: normalizeBirthDate(r.birthDate) || undefined,
        };
      })
      .filter((r) => r.name.length >= 2);
  };

  const importMutation = trpc.students.importBatch.useMutation({
    onSuccess: (res) => {
      utils.students.list.invalidate();
      const localSkipped: SkippedDetail[] = rows
        .filter((r) => !r.include)
        .map((r) => ({
          name: r.name.trim() || "(sem nome)",
          phone: r.phone.trim() || undefined,
          email: r.email.trim() || undefined,
          birthDate: r.birthDate.trim() || undefined,
          reason: issuesByKey.get(r.key)?.errors[0] || "Linha desmarcada na revisão",
        }));
      const details = [...res.skippedDetails.map((d) => ({ name: d.name, reason: d.reason })), ...localSkipped];
      setReport({ imported: res.imported, skipped: details.length, details });
      if (res.imported > 0) toast.success(`${res.imported} aluno${res.imported === 1 ? "" : "s"} importado${res.imported === 1 ? "" : "s"}!`);
    },
    onError: (err) => toast.error(err.message || "Não foi possível importar os alunos."),
  });

  const submit = () => {
    if (!professorId) { toast.error("Selecione o professor responsável."); return; }
    const payload = buildPayload();
    if (payload.length === 0) { toast.error("Nenhum aluno marcado para importar."); return; }
    importMutation.mutate({
      professorId: Number(professorId),
      instrumentId: instrumentId === "none" ? null : Number(instrumentId),
      level,
      rows: payload,
    });
  };

  const resetAll = () => {
    setRaw("");
    setRows([]);
    setHadHeader(false);
    setOverrides(new Set());
    setPage(0);
    setReport(null);
    setProfessorId("");
    setInstrumentId("none");
    setLevel("iniciante");
  };

  const handleOpenChange = (o: boolean) => {
    if (!o) resetAll();
    onOpenChange(o);
  };

  const downloadTemplate = () => {
    downloadCsv(
      "modelo_importacao_alunos.csv",
      ["Nome", "Telefone", "E-mail", "Nascimento"],
      [
        ["Ana Souza", "(11) 99999-0000", "ana@email.com", "2010-05-14"],
        ["Beatriz Lima", "(11) 98888-1111", "", "12/08/2012"],
      ]
    );
  };

  const downloadSkipped = () => {
    if (!report) return;
    downloadCsv(
      "alunos_nao_importados.csv",
      ["Nome", "Telefone", "E-mail", "Nascimento", "Motivo"],
      report.details.map((d) => [d.name, d.phone || "", d.email || "", d.birthDate || "", d.reason])
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileUp size={18} className="text-primary" /> Importar alunos por CSV
          </DialogTitle>
          <DialogDescription>
            {report
              ? "Resumo da importação."
              : "Aceita o CSV exportado do DancePro, planilhas do Excel/Sheets e o formato Nome; Telefone; E-mail; Nascimento. Você revisa tudo antes de importar."}
          </DialogDescription>
        </DialogHeader>

        {report ? (
          <div className="space-y-4 pt-1">
            <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <CheckCircle2 size={28} className="text-emerald-600 shrink-0" />
              <div>
                <p className="text-sm font-black text-foreground">
                  {report.imported} aluno{report.imported === 1 ? "" : "s"} importado{report.imported === 1 ? "" : "s"}
                </p>
                <p className="text-[11px] text-muted-foreground font-medium">
                  {report.skipped > 0
                    ? `${report.skipped} linha(s) não importada(s) — veja os motivos abaixo.`
                    : "Todas as linhas foram importadas."}
                </p>
              </div>
            </div>

            {report.details.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Não importados</p>
                  <Button type="button" variant="outline" onClick={downloadSkipped} className="h-8 rounded-lg px-3 text-[10px] font-black uppercase tracking-widest gap-1.5">
                    <Download size={12} /> Baixar .csv
                  </Button>
                </div>
                <div className="max-h-48 overflow-y-auto rounded-xl border border-border/60 divide-y divide-border/40">
                  {report.details.map((d, i) => (
                    <div key={i} className="flex items-start gap-2 px-3 py-2 text-[11px]">
                      <AlertCircle size={13} className="text-amber-500 shrink-0 mt-0.5" />
                      <span className="font-bold text-foreground">{d.name}</span>
                      <span className="text-muted-foreground">— {d.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => { setReport(null); }}
                className="h-10 rounded-xl px-4 text-xs font-bold"
              >
                Importar mais
              </Button>
              <Button type="button" onClick={() => handleOpenChange(false)} className="h-10 rounded-xl px-5 text-xs font-bold">
                Concluir
              </Button>
            </div>
          </div>
        ) : (
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
                onChange={(e) => applyText(e.target.value)}
                rows={rows.length > 0 ? 4 : 8}
                placeholder={"Ana Souza; (11) 99999-0000; ana@email.com; 2010-05-14\nBeatriz Lima; (11) 98888-1111"}
                className="w-full rounded-xl border border-border/60 bg-background p-3 text-[11px] font-mono leading-relaxed outline-none focus:ring-2 focus:ring-primary/20 resize-y"
              />
            </div>

            {rows.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                    Prévia ({rows.length} linha{rows.length === 1 ? "" : "s"})
                    {isPrechecking && <Loader2 size={11} className="animate-spin text-muted-foreground" />}
                  </p>
                  <div className="flex items-center gap-3 text-[10px] font-bold">
                    <span className="text-emerald-600">{includedRows.length} marcado(s)</span>
                    {problemCount > 0 && <span className="text-amber-600">{problemCount} com aviso/erro</span>}
                  </div>
                </div>

                <div className="rounded-xl border border-border/60 overflow-hidden">
                  <div className="overflow-x-auto">
                    <div className="min-w-[760px]">
                      <div className="grid grid-cols-[30px_1.2fr_1fr_1.3fr_0.8fr_1.1fr_34px] gap-1.5 px-2.5 py-2 bg-muted/40 text-[9px] font-black uppercase tracking-widest text-muted-foreground items-center">
                        <span />
                        <span>Nome</span>
                        <span>Telefone</span>
                        <span>E-mail</span>
                        <span>Nascimento</span>
                        <span>Status</span>
                        <span />
                      </div>
                      <div className="max-h-[280px] overflow-y-auto divide-y divide-border/40">
                        {pageRows.map((r) => {
                          const issues = issuesByKey.get(r.key) || { errors: [], warnings: [] };
                          return (
                            <div key={r.key} className={`grid grid-cols-[30px_1.2fr_1fr_1.3fr_0.8fr_1.1fr_34px] gap-1.5 px-2.5 py-1.5 items-start ${!r.include ? "opacity-50" : ""}`}>
                              <input
                                type="checkbox"
                                checked={r.include}
                                onChange={() => toggleInclude(r.key)}
                                className="mt-2 w-3.5 h-3.5 accent-primary cursor-pointer"
                              />
                              <input value={r.name} onChange={(e) => updateRow(r.key, { name: e.target.value })} className="h-8 rounded-lg border border-border/60 bg-background px-2 text-[11px] font-bold outline-none focus:ring-2 focus:ring-primary/20 min-w-0" />
                              <input value={r.phone} onChange={(e) => updateRow(r.key, { phone: e.target.value })} className="h-8 rounded-lg border border-border/60 bg-background px-2 text-[11px] outline-none focus:ring-2 focus:ring-primary/20 min-w-0" />
                              <input value={r.email} onChange={(e) => updateRow(r.key, { email: e.target.value })} className="h-8 rounded-lg border border-border/60 bg-background px-2 text-[11px] outline-none focus:ring-2 focus:ring-primary/20 min-w-0" />
                              <input value={r.birthDate} onChange={(e) => updateRow(r.key, { birthDate: e.target.value })} placeholder="AAAA-MM-DD" className="h-8 rounded-lg border border-border/60 bg-background px-2 text-[11px] outline-none focus:ring-2 focus:ring-primary/20 min-w-0" />
                              <div className="pt-1 space-y-0.5 min-w-0">
                                {issues.errors.map((e, i) => (
                                  <p key={`e${i}`} className="text-[9px] font-bold leading-tight text-rose-500 break-words">{e}</p>
                                ))}
                                {issues.warnings.map((w, i) => (
                                  <p key={`w${i}`} className="text-[9px] font-medium leading-tight text-amber-600 break-words">{w}</p>
                                ))}
                                {issues.errors.length === 0 && issues.warnings.length === 0 && (
                                  <p className="text-[9px] font-bold text-emerald-600">Pronto</p>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => removeRow(r.key)}
                                className="mt-1.5 w-7 h-7 rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 flex items-center justify-center transition-colors"
                                title="Remover linha"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-muted/30 border-t border-border/40">
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
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
              <p className="text-[10px] text-muted-foreground leading-snug flex items-start gap-1.5 max-w-md">
                <FileText size={12} className="mt-0.5 shrink-0" />
                Alunos entram como <strong>ativos</strong> com mensalidade zerada — ajuste valores e cobranças depois na edição de cada aluno.
              </p>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} className="h-10 rounded-xl px-4 text-xs font-bold">
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={submit}
                  disabled={importMutation.isPending || includedRows.length === 0 || !professorId}
                  className="h-10 rounded-xl px-5 text-xs font-bold gap-2"
                >
                  {importMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />}
                  Importar {includedRows.length > 0 ? `${includedRows.length} aluno(s)` : ""}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
