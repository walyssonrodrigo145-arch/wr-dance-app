import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Gauge, Loader2, Plus, Search, Trash2, SmilePlus, Meh, Frown, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

const PERIOD_OPTIONS = [
  { value: "30", label: "Últimos 30 dias" },
  { value: "90", label: "Últimos 90 dias" },
  { value: "365", label: "Último ano" },
  { value: "all", label: "Todo o histórico" },
];

function scoreMeta(score: number) {
  if (score >= 9) return { label: "Promotor", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" };
  if (score >= 7) return { label: "Neutro", className: "bg-amber-500/10 text-amber-600 border-amber-500/30" };
  return { label: "Detrator", className: "bg-rose-500/10 text-rose-600 border-rose-500/30" };
}

function scoreColor(score: number) {
  if (score >= 9) return "bg-emerald-600";
  if (score >= 7) return "bg-amber-500";
  return "bg-rose-600";
}

// ─── Modal de resposta manual ─────────────────────────────────────────────────

function ManualNpsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<{ id: number; name: string } | null>(null);
  const [score, setScore] = useState("10");
  const [comment, setComment] = useState("");
  const [source, setSource] = useState("manual");

  const { data: searchResults = [] } = trpc.turmas.searchAlunos.useQuery(
    { q: studentSearch },
    { enabled: studentSearch.trim().length >= 2 }
  );

  const createManual = trpc.nps.createManual.useMutation({
    onSuccess: () => {
      toast.success("Resposta registrada!");
      utils.nps.list.invalidate();
      onClose();
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            <Gauge className="text-indigo-500" size={20} />
            Registrar resposta (manual)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Aluno (opcional)</Label>
            {selectedStudent ? (
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs font-bold">{selectedStudent.name}</Badge>
                <button onClick={() => setSelectedStudent(null)} className="text-muted-foreground hover:text-rose-500"><X size={14} /></button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                <Input value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} placeholder="Buscar aluno..." className="pl-9" />
                {searchResults.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full rounded-xl border border-border bg-popover shadow-lg max-h-48 overflow-y-auto">
                    {searchResults.map((student: any) => (
                      <button key={student.id} onClick={() => { setSelectedStudent(student); setStudentSearch(""); }}
                        className="w-full text-left px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors">
                        {student.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Nota (0 a 10) *</Label>
              <Select value={score} onValueChange={setScore}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 11 }, (_, index) => index).map((value) => (
                    <SelectItem key={value} value={String(value)}>{value}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Canal</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Presencial / outro</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Comentário</Label>
            <Textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={3} maxLength={2000} placeholder="O que o aluno/responsável disse?" />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose} disabled={createManual.isPending}>Cancelar</Button>
          <Button
            disabled={createManual.isPending}
            onClick={() => createManual.mutate({
              studentId: selectedStudent?.id ?? null,
              score: parseInt(score, 10),
              comment: comment.trim() || null,
              source: source as any,
            })}
          >
            {createManual.isPending && <Loader2 size={16} className="animate-spin mr-2" />}
            Registrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function Nps() {
  const [period, setPeriod] = useState("90");
  const [modalOpen, setModalOpen] = useState(false);
  const [deleting, setDeleting] = useState<any>(null);

  const from = useMemo(() => {
    if (period === "all") return undefined;
    const days = parseInt(period, 10);
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }, [period]);

  const { data, isLoading } = trpc.nps.list.useQuery({ from });
  const utils = trpc.useUtils();

  const deleteMutation = trpc.nps.delete.useMutation({
    onSuccess: () => {
      toast.success("Resposta excluída.");
      setDeleting(null);
      utils.nps.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const summary = data?.summary;
  const responses = data?.responses ?? [];

  const kpis = [
    { label: "NPS", value: summary?.nps ?? 0, icon: Gauge, className: "text-indigo-500", hint: "−100 a +100" },
    { label: "Promotores (9–10)", value: summary?.promotores ?? 0, icon: SmilePlus, className: "text-emerald-500" },
    { label: "Neutros (7–8)", value: summary?.neutros ?? 0, icon: Meh, className: "text-amber-500" },
    { label: "Detratores (0–6)", value: summary?.detratores ?? 0, icon: Frown, className: "text-rose-500" },
    { label: "Média", value: summary?.media ?? 0, icon: Gauge, className: "text-blue-500" },
  ];

  return (
    <div className="flex-1 space-y-6 lg:space-y-8 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-black tracking-tight text-foreground flex items-center gap-2">
            <Gauge className="text-indigo-500" size={28} />
            Satisfação (NPS)
          </h1>
          <p className="text-muted-foreground font-medium text-sm mt-1">
            Alunos respondem pelo portal; você também pode registrar respostas recebidas por WhatsApp ou presencialmente.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => setModalOpen(true)} className="bg-indigo-600 hover:bg-indigo-700">
            <Plus size={16} className="mr-2" /> Registrar resposta
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <Icon size={16} className={kpi.className} />
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{kpi.label}</p>
              </div>
              <p className="text-2xl font-black text-foreground mt-2">{kpi.value}</p>
            </div>
          );
        })}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary" size={32} /></div>
      ) : responses.length === 0 ? (
        <div className="text-center py-20 rounded-3xl border-2 border-dashed border-border">
          <Gauge className="mx-auto text-muted-foreground opacity-20 mb-4" size={48} />
          <p className="font-black text-foreground">Nenhuma resposta no período</p>
          <p className="text-sm text-muted-foreground mt-1">
            Os alunos podem responder pelo portal do aluno (card na aba Avisos) ou você pode registrar manualmente.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {responses.map((response: any) => {
            const meta = scoreMeta(response.score);
            return (
              <div key={response.id} className="rounded-2xl border border-border bg-card p-4 flex flex-col lg:flex-row lg:items-center gap-3">
                <div className={cn("w-12 h-12 rounded-2xl text-white font-black text-lg flex items-center justify-center shrink-0", scoreColor(response.score))}>
                  {response.score}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-foreground truncate">
                    {response.studentName || "Resposta anônima"}
                  </p>
                  {response.comment && (
                    <p className="text-xs font-medium text-muted-foreground mt-0.5 break-words">{response.comment}</p>
                  )}
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-1">
                    {format(new Date(response.respondedAt), "dd/MM/yyyy")} · {response.source}
                    {response.createdByName ? ` · por ${response.createdByName}` : ""}
                  </p>
                </div>
                <Badge variant="outline" className={cn("w-fit text-[10px] font-black", meta.className)}>{meta.label}</Badge>
                <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-rose-500 shrink-0" onClick={() => setDeleting(response)} title="Excluir">
                  <Trash2 size={15} />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {modalOpen && <ManualNpsModal open={modalOpen} onClose={() => setModalOpen(false)} />}

      <AlertDialog open={deleting !== null} onOpenChange={(value) => { if (!value) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir resposta?</AlertDialogTitle>
            <AlertDialogDescription>
              A resposta de {deleting?.studentName || "aluno anônimo"} será removida dos cálculos do NPS.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={() => deleting && deleteMutation.mutate({ id: deleting.id })}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
