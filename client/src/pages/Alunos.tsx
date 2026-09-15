import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/useAuth";
import { isSameDay, startOfDay } from "date-fns";
import {
  Users, Search, Plus, Pencil, Trash2,
  CheckCircle2, X, Loader2, Clock, MoreVertical, Bell, TrendingUp, Activity, Eye, Edit, Download, Send,
  Link as LinkIcon, Copy, ExternalLink, Sparkles
} from "lucide-react";
import { exportToCSV } from "@/lib/exportUtils";
import { formatBRL } from "@/lib/money";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { StudentDetailsModal } from "@/components/modals/StudentDetailsModal";
import { GenerateAccessModal } from "@/components/modals/GenerateAccessModal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
import { Checkbox } from "@/components/ui/checkbox";
import { StudentModal } from "@/components/alunos/StudentModal";
import { DeleteConfirm } from "@/components/alunos/DeleteConfirm";
import { StatusBadge, LevelBadge } from "@/components/alunos/StatusBadge";
import { StudentRow } from "@/components/alunos/types";

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Alunos() {
  const utils = trpc.useUtils();
  const [location, setLocation] = useLocation();
  const [search, setSearch] = useState("");

  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [lessonTypeFilter, setLessonTypeFilter] = useState<string>("todos");
  const [modalOpen, setModalOpen] = useState(false);
  const [detailsStudentId, setDetailsStudentId] = useState<number | null>(null);
  const [generateAccessStudentId, setGenerateAccessStudentId] = useState<number | null>(null);
  const [editStudent, setEditStudent] = useState<StudentRow | null>(null);
  const [deleteStudent, setDeleteStudent] = useState<StudentRow | null>(null);

  // ── Auto-Matrícula Modal State ──────────────────────────────────────────────
  const [isEnrollmentModalOpen, setIsEnrollmentModalOpen] = useState(false);
  const [enrollmentInstrumentId, setEnrollmentInstrumentId] = useState<string>("all");
  const [enrollmentFee, setEnrollmentFee] = useState<string>("");
  const [enrollmentContractTemplateId, setEnrollmentContractTemplateId] = useState<string>("auto");
  const [generatedEnrollmentLink, setGeneratedEnrollmentLink] = useState<{ url: string; fullUrl: string } | null>(null);

  const generateEnrollmentLinkMutation = trpc.enrollment.generateLink.useMutation({
    onSuccess: (data) => {
      setGeneratedEnrollmentLink(data);
      toast.success("Link de matrícula gerado com sucesso!");
    },
    onError: (err) => {
      toast.error(err.message || "Erro ao gerar link de matrícula");
    }
  });

  const { data: students = [], isLoading } = trpc.students.list.useQuery();
  const { data: instruments = [] } = trpc.instruments.list.useQuery();
  const { data: contractTemplates = [] } = trpc.contractTemplates.list.useQuery(undefined, { enabled: isEnrollmentModalOpen });

  // ── Controle de Acesso ──────────────────────────────────────────────────────
  const { user } = useAuth();
  const isProfessor = user?.role === 'professor';
  const userPerms: string[] = (user as any)?.permissions || [];
  const canEdit = !isProfessor || userPerms.includes('alunos_editar');
  const canSeeMensalidade = !isProfessor || userPerms.includes('alunos_mensalidade');
  // ────────────────────────────────────────────────────────────────────────────

  const { data: overduePayments = [] } = trpc.paymentDues.overdue.useQuery();
  const { data: upcomingLessons = [] } = trpc.lessons.upcoming.useQuery();

  const updateStatusMutation = trpc.students.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Status atualizado!");
      utils.students.list.invalidate();
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const deleteMutation = trpc.students.delete.useMutation({
    onSuccess: () => {
      toast.success("Aluno removido!");
      utils.students.list.invalidate();
      setDeleteStudent(null);
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const filtered = useMemo(() => {
    return students
      .filter((s: StudentRow) => {
        // Professores só vêem alunos ATIVOS (nunca pausados ou inativos)
        if (isProfessor && s.status !== 'ativo') return false;
        const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) || (s.instrumentName ?? "").toLowerCase().includes(search.toLowerCase());
        const matchStatus = statusFilter === "todos" || s.status === statusFilter;
        const matchLessonType = lessonTypeFilter === "todos" || s.lessonType === lessonTypeFilter;
        return matchSearch && matchStatus && matchLessonType;
      })
      .sort((a: StudentRow, b: StudentRow) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [students, search, statusFilter, lessonTypeFilter, isProfessor]);

  const stats = {
    total: students.length,
    ativos: students.filter((s: any) => s.status === "ativo").length,
    pausados: students.filter((s: any) => s.status === "pausado").length,
    inativos: students.length - students.filter((s: any) => s.status === "ativo").length - students.filter((s: any) => s.status === "pausado").length,
  };

  const newStudentsLast30Days = useMemo(() => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return students.filter((s: any) => s.startDate && new Date(s.startDate) >= thirtyDaysAgo).length;
  }, [students]);

  const lessonsToday = useMemo(() => {
    const today = startOfDay(new Date());
    return upcomingLessons.filter(l => isSameDay(new Date(l.scheduledAt), today)).length;
  }, [upcomingLessons]);

  const activeRate = stats.total > 0 ? Math.round((stats.ativos / stats.total) * 100) : 0;

  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([]);

  const handleExportCSV = (studentsToExport: StudentRow[]) => {
    const headers = ["ID", "Nome", "E-mail", "Telefone", "Instrumento", "Nível", "Tipo de Aula", "Status", "Mensalidade (R$)", "Dia Vencimento"];
    const rows = studentsToExport.map(s => [
      s.id,
      s.name,
      s.email || "",
      s.phone || "",
      s.instrumentName || "",
      s.level,
      s.lessonType,
      s.status,
      s.monthlyFee,
      s.dueDay || ""
    ]);
    exportToCSV("alunos_musicpro", headers, rows);
    toast.success(`${studentsToExport.length} alunos exportados com sucesso!`);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedStudentIds(filtered.map((s: StudentRow) => s.id));
    } else {
      setSelectedStudentIds([]);
    }
  };

  const handleToggleSelect = (id: number) => {
    setSelectedStudentIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  return (
    <div className="flex flex-col h-full bg-background relative">
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6 lg:space-y-8 scrollbar-thin no-scrollbar">
        {/* SECTION HEADER: Alunos & Action */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 lg:gap-6">
          <div className="flex items-center gap-3 lg:gap-4 w-full md:w-auto">
            <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-2xl bg-primary/5 text-primary flex items-center justify-center shadow-sm shrink-0">
              <Users size={24} />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl lg:text-2xl font-bold text-foreground tracking-tight leading-none">Alunos</h2>
              <p className="text-[10px] lg:text-xs text-muted-foreground font-medium mt-1 lg:mt-2">
                {stats.total} matrículas • {stats.ativos} ativos
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
             <div className="relative flex-1 md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                <Input 
                  placeholder="Buscar..." 
                  className="pl-9 h-10 border-border bg-card rounded-xl shadow-sm text-xs"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
             </div>

             <Button
               variant="outline"
               onClick={() => handleExportCSV(filtered)}
               className="h-10 rounded-xl px-3 lg:px-4 text-xs font-bold gap-2 border-border/80 shadow-sm shrink-0"
               title="Exportar lista atual para Excel/CSV"
             >
               <Download size={16} />
               <span className="hidden sm:inline">Exportar CSV</span>
             </Button>

             {/* Botão Gerar Link de Matrícula (Auto-cadastro pelo aluno) */}
             {canEdit && (
               <Button
                  onClick={() => {
                    setGeneratedEnrollmentLink(null);
                    setEnrollmentInstrumentId("all");
                    setEnrollmentFee("");
                    setEnrollmentContractTemplateId("auto");
                    setIsEnrollmentModalOpen(true);
                  }}
                 variant="outline"
                 className="h-10 rounded-xl px-3.5 lg:px-4 text-xs font-bold gap-2 border-primary/30 text-primary hover:bg-primary/10 shadow-sm shrink-0"
                 title="Gerar link de auto-matrícula para enviar ao aluno"
               >
                 <LinkIcon size={16} className="text-primary" />
                 <span>Link de Matrícula</span>
               </Button>
             )}

             {/* Ocultar botão "Novo aluno" para professores sem permissão de editar */}
             {canEdit && (
               <Button 
                id="tour-new-student"
                onClick={() => setLocation("/alunos/novo")}
                className="h-10 rounded-xl px-4 lg:px-5 bg-primary hover:bg-primary/90 text-white text-xs font-bold gap-2 shadow-lg shadow-primary/20 transition-all active:scale-95 shrink-0"
               >
                 <Plus size={18} />
                 <span className="hidden sm:inline">Novo aluno</span>
               </Button>
             )}
          </div>
        </div>

        {/* ── FILTER BAR ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          {/* Status filters */}
          <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
            <span className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.15em] shrink-0">Status</span>
            <div className="flex bg-muted/40 rounded-xl p-1 gap-1 border border-border/30 shadow-sm flex-wrap w-full sm:w-auto">
              {([
                { value: "todos",   label: "Todos",   count: students.length },
                { value: "ativo",   label: "Ativos",  count: stats.ativos },
                { value: "pausado", label: "Pausados",count: stats.pausados },
                { value: "inativo", label: "Inativos",count: stats.inativos },
              ] as const).map(({ value, label, count }) => (
                <button
                  key={value}
                  onClick={() => setStatusFilter(value)}
                  className={cn(
                    "relative px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 flex-1 sm:flex-initial justify-center",
                    statusFilter === value
                      ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {label}
                  <span className={cn(
                    "text-[8px] font-black px-1 py-0.5 rounded-md min-w-[16px] text-center leading-none",
                    statusFilter === value ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                  )}>
                    {count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div className="hidden sm:block h-6 w-px bg-border" />

          {/* Lesson type filters */}
          <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
            <span className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.15em] shrink-0">Modalidade</span>
            <div className="flex bg-muted/40 rounded-xl p-1 gap-1 border border-border/30 shadow-sm flex-wrap w-full sm:w-auto">
              {([
                { value: "todos",      label: "Todas",      count: students.length },
                { value: "individual", label: "Individual",  count: students.filter((s: any) => s.lessonType === 'individual' || !s.lessonType).length },
                { value: "turma",      label: "Turma",       count: students.filter((s: any) => s.lessonType === 'turma').length },
                { value: "online",     label: "Online",      count: students.filter((s: any) => s.lessonType === 'online').length },
              ] as const).map(({ value, label, count }) => (
                <button
                  key={value}
                  onClick={() => setLessonTypeFilter(value)}
                  className={cn(
                    "relative px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 flex-1 sm:flex-initial justify-center",
                    lessonTypeFilter === value
                      ? "bg-purple-600 text-white shadow-md shadow-purple-500/25"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {label}
                  <span className={cn(
                    "text-[8px] font-black px-1 py-0.5 rounded-md min-w-[16px] text-center leading-none",
                    lessonTypeFilter === value ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
                  )}>
                    {count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Active filter indicator */}
          {(statusFilter !== "todos" || lessonTypeFilter !== "todos") && (
            <button
              onClick={() => { setStatusFilter("todos"); setLessonTypeFilter("todos"); }}
              className="ml-auto flex items-center gap-1.5 text-[10px] font-black text-muted-foreground hover:text-rose-500 transition-colors uppercase tracking-widest px-3 py-1.5 rounded-xl border border-border hover:border-rose-500/30 hover:bg-rose-500/5"
            >
              <X size={10} />
              Limpar filtros
            </button>
          )}
        </div>

        {/* METRICS CARDS - Responsive Grid */}
        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-6">
          {[
            { label: "Total",    filterVal: "todos",   count: stats.total,    sub: "Matrículas", icon: Users,        color: "text-blue-600",   bg: "from-blue-500/10 to-background",   border: "border-blue-500/20" },
            { label: "Ativos",   filterVal: "ativo",   count: stats.ativos,   sub: "Regulares",  icon: CheckCircle2, color: "text-purple-600", bg: "from-purple-500/10 to-background", border: "border-purple-100/50" },
            { label: "Pausados", filterVal: "pausado", count: stats.pausados, sub: "Em pausa",   icon: Clock,        color: "text-red-600",    bg: "from-red-500/10 to-background",    border: "border-red-100/50" },
            { label: "Inativos", filterVal: "inativo", count: stats.inativos, sub: "Desligados", icon: X,            color: "text-emerald-600",bg: "from-emerald-500/10 to-background", border: "border-emerald-100/50" },
          ].map((item, i) => (
            <div
              key={i}
              onClick={() => setStatusFilter(item.filterVal)}
              className={cn(
                "relative lg:h-32 p-3.5 lg:p-6 rounded-2xl backdrop-blur-xl border shadow-xl shadow-primary/5 overflow-hidden group cursor-pointer transition-all hover:shadow-primary/15 hover:-translate-y-1 active:scale-[0.97]",
                item.bg,
                statusFilter === item.filterVal ? "ring-2 ring-primary/40 border-primary/30" : "border-white/10"
              )}
            >
              <div className="relative z-10">
                <div className="flex items-center gap-2 lg:gap-3 mb-2 lg:mb-4">
                  <div className={cn("w-7 h-7 lg:w-9 lg:h-9 rounded-xl flex items-center justify-center bg-card shadow-sm shrink-0", item.color)}>
                    <item.icon size={15} />
                  </div>
                  <div>
                    <p className={cn("text-[8px] lg:text-[10px] font-bold uppercase tracking-wider opacity-60", item.color)}>{item.label}</p>
                    <p className="text-base lg:text-2xl font-black text-foreground leading-none">{item.count}</p>
                  </div>
                </div>
                <p className="text-[8px] lg:text-[10px] text-muted-foreground font-medium">{item.sub}</p>
              </div>
            </div>
          ))}
        </div>


        {/* MAIN CONTENT GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
          {/* TABLE / CARD SECTION */}
          <div id="tour-students-list" className="lg:col-span-9 bg-card/40 backdrop-blur-xl rounded-2xl md:rounded-[2rem] border border-border/60 md:border-white/10 shadow-2xl shadow-primary/5 overflow-hidden flex flex-col">
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto no-scrollbar pb-2">
              <table className="w-full text-left table-fixed">
                <thead>
                  <tr className="border-b border-border">
                    <th className="w-[5%] px-3 py-5 text-center">
                      <Checkbox
                        checked={filtered.length > 0 && selectedStudentIds.length === filtered.length}
                        onCheckedChange={(c) => handleSelectAll(!!c)}
                      />
                    </th>
                    <th className="w-[34%] px-4 lg:px-6 py-5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest whitespace-nowrap">Aluno</th>
                    <th className="w-[24%] px-4 lg:px-6 py-5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest whitespace-nowrap">Instrumento / Nível</th>
                    {canSeeMensalidade && (
                      <th className="w-[17%] px-4 lg:px-6 py-5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest whitespace-nowrap">Mensalidade</th>
                    )}
                    <th className="w-[12%] px-4 lg:px-6 py-5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest text-center whitespace-nowrap">Status</th>
                    {canEdit && (
                      <th className="w-[12%] px-2 lg:px-4 py-5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest text-right whitespace-nowrap">Ações</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {isLoading ? (
                    <tr><td colSpan={6} className="py-20 text-center"><Loader2 size={32} className="animate-spin text-primary/20 mx-auto" /></td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={6} className="py-20 text-center text-xs text-muted-foreground font-medium italic">Nenhum aluno encontrado.</td></tr>
                  ) : (
                    filtered.map((student: StudentRow) => (
                      <tr key={student.id} className={cn("group hover:bg-primary/5 hover:shadow-inner transition-colors cursor-pointer border-b border-transparent hover:border-primary/10", selectedStudentIds.includes(student.id) && "bg-primary/10")} onClick={() => setDetailsStudentId(student.id)}>
                        <td className="px-3 py-4 text-center" onClick={e => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedStudentIds.includes(student.id)}
                            onCheckedChange={() => handleToggleSelect(student.id)}
                          />
                        </td>
                        <td className="px-4 lg:px-6 py-4">
                          <div className="flex items-center gap-4">
                            <Avatar className="w-10 h-10 border-2 border-background shadow-sm shrink-0">
                              <AvatarFallback className="bg-blue-500/10 text-blue-600 text-xs font-bold uppercase">
                                {student.name.substring(0, 2)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-foreground truncate">{student.name}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <p className="text-[11px] text-muted-foreground font-medium truncate">{student.email}</p>
                                {student.lessonType === 'turma' && (
                                  <Badge className="h-4 px-1 text-[8px] bg-purple-500/10 text-purple-600 border-none uppercase font-black">Turma</Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 lg:px-6 py-4">
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full" style={{ background: student.instrumentColor || "#6366f1" }} />
                              <span className="text-xs font-semibold text-muted-foreground">{student.instrumentName}</span>
                            </div>
                            <LevelBadge level={student.level} />
                          </div>
                        </td>
                        {/* Mensalidade: oculta para professor sem permissão */}
                        {canSeeMensalidade && (
                          <td className="px-4 lg:px-6 py-4">
                            <p className="text-sm font-bold text-foreground leading-none">
                              {formatBRL(Number(student.monthlyFee))}
                            </p>
                            <p className="text-[10px] text-muted-foreground font-medium mt-1.5 uppercase">Dia {student.dueDay || 10}</p>
                          </td>
                        )}
                        <td className="px-4 lg:px-6 py-4 text-center">
                          {/* Status: professor sem permissão só vê, não altera */}
                          {canEdit ? (
                            <StatusBadge
                              status={student.status}
                              id={student.id}
                              onUpdate={(id, s, deletePendingData) => updateStatusMutation.mutate({ id, status: s as any, deletePendingData })}
                            />
                          ) : (
                            <span className={cn(
                              "inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded border",
                              student.status === 'ativo' ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                            )}>
                              {student.status}
                            </span>
                          )}
                        </td>
                        {canEdit && (
                          <td className="px-2 lg:px-4 py-4 text-right" onClick={e => e.stopPropagation()}>
                             <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                   <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-muted-foreground">
                                      <MoreVertical size={18} />
                                   </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48 rounded-xl border-white/10 shadow-xl backdrop-blur-xl bg-card/90">
                                   <DropdownMenuItem onClick={() => setDetailsStudentId(student.id)} className="text-xs font-bold uppercase tracking-widest gap-2 cursor-pointer py-2.5">
                                      <Eye size={14} className="text-muted-foreground" /> Ver Detalhes
                                   </DropdownMenuItem>
                                   <DropdownMenuItem onClick={() => setLocation(`/alunos/${student.id}/editar`)} className="text-xs font-bold uppercase tracking-widest gap-2 cursor-pointer py-2.5">
                                      <Edit size={14} className="text-muted-foreground" /> Editar Aluno
                                   </DropdownMenuItem>
                                   <DropdownMenuItem onClick={() => { setGenerateAccessStudentId(student.id); }} className="text-xs font-bold uppercase tracking-widest gap-2 cursor-pointer py-2.5">
                                     <Activity size={14} className="text-muted-foreground" /> Gerar Acesso
                                   </DropdownMenuItem>
                                   <DropdownMenuSeparator className="bg-border/50" />
                                   <DropdownMenuItem onClick={() => setDeleteStudent(student)} className="text-xs font-bold text-rose-500 uppercase tracking-widest gap-2 cursor-pointer py-2.5 hover:text-rose-600 hover:bg-rose-500/10">
                                      <Trash2 size={14} /> Excluir Aluno
                                   </DropdownMenuItem>
                                </DropdownMenuContent>
                             </DropdownMenu>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden grid grid-cols-1 gap-4 p-4">
              {isLoading ? (
                <div className="py-10 text-center"><Loader2 size={32} className="animate-spin text-primary/20 mx-auto" /></div>
              ) : filtered.length === 0 ? (
                <div className="py-10 text-center text-xs text-muted-foreground font-medium italic">Nenhum aluno encontrado.</div>
              ) : (
                filtered.map((student: StudentRow) => (
                  <div 
                    key={student.id} 
                    className="bg-card rounded-2xl p-4 border border-border shadow-sm active:scale-[0.98] transition-all"
                    onClick={() => setDetailsStudentId(student.id)}
                  >
                    <div className="card-head mb-4">
                      <div className="card-head-main">
                        <Avatar className="w-10 h-10 border-2 border-background shadow-sm shrink-0">
                          <AvatarFallback className="bg-blue-500/10 text-blue-600 text-xs font-bold uppercase">
                            {student.name.substring(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-foreground truncate">{student.name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: student.instrumentColor || "#6366f1" }} />
                            <span className="text-[10px] font-bold text-muted-foreground uppercase truncate">{student.instrumentName}</span>
                            {student.lessonType === 'turma' && (
                              <Badge className="h-4 px-1 text-[8px] bg-purple-500/10 text-purple-600 border-none uppercase font-black shrink-0">Turma</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="card-head-fixed">
                        <StatusBadge
                          status={student.status}
                          id={student.id}
                          onUpdate={(id, s, deletePendingData) => updateStatusMutation.mutate({ id, status: s as any, deletePendingData })}
                        />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 py-3 border-y border-border">
                      {canSeeMensalidade && (
                        <div>
                          <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Mensalidade</p>
                          <p className="text-xs font-black text-foreground">
                            {formatBRL(Number(student.monthlyFee))}
                          </p>
                        </div>
                      )}
                      <div>
                        <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Nível</p>
                        <LevelBadge level={student.level} />
                      </div>
                    </div>

                      <div className="flex items-center justify-between gap-2 mt-4 min-w-0">
                        <p className="text-[10px] text-muted-foreground font-bold uppercase truncate">Vencimento: Dia {student.dueDay || 10}</p>
                        {canEdit && (
                          <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-lg text-muted-foreground" onClick={() => setLocation(`/alunos/${student.id}/editar`)}>
                              <Pencil size={14} />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-lg text-rose-400 hover:text-rose-500 hover:bg-rose-500/10" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteStudent(student); }}>
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        )}
                      </div>
                  </div>
                ))
              )}
            </div>
            
            {/* Registros Count - Adjusted for mobile */}
            <div className="p-4 lg:p-6 border-t border-border flex items-center justify-between bg-muted/20">
               <p className="hidden sm:block text-[11px] text-muted-foreground font-medium">Mostrando {filtered.length} de {stats.total} alunos ativos</p>
               <p className="sm:hidden text-[11px] text-muted-foreground font-medium">{filtered.length} registros</p>
            </div>
          </div>

          {/* RIGHT SIDEBAR Area - Adjusted for mobile (stacks at bottom) */}
          <div className="lg:col-span-3 space-y-6 lg:sticky lg:top-8">
             {/* Resumo Rápido Card */}
             <div className="bg-card rounded-[2rem] border border-border p-6 shadow-sm overflow-hidden relative">
                <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full -translate-y-8 translate-x-8 blur-2xl" />
                <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
                  <TrendingUp size={16} className="text-primary" />
                  Resumo rápido
                </h3>
                <div className="space-y-6 relative z-10">
                   <div className="h-16 w-full relative">
                      <svg viewBox="0 0 200 60" className="w-full h-full text-primary" preserveAspectRatio="none">
                        <path d="M0 60 C 20 50, 40 40, 60 45 S 80 20, 100 30 S 140 10, 160 15 S 180 30, 200 20 V 60 H 0 Z" fill="currentColor" fillOpacity="0.05" />
                        <path d="M0 60 C 20 50, 40 40, 60 45 S 80 20, 100 30 S 140 10, 160 15 S 180 30, 200 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                   </div>
                   
                   <div className="grid grid-cols-2 xl:grid-cols-1 gap-4 pt-2">
                      <div>
                        <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Novos (30 dias)</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xl font-black text-foreground">{newStudentsLast30Days}</span>
                        </div>
                      </div>
                      
                      <div>
                        <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Ativos (%)</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xl font-black text-foreground">{activeRate}%</span>
                        </div>
                        <div className="w-full h-1 bg-muted rounded-full mt-2 overflow-hidden">
                           <div className="h-full bg-primary" style={{ width: `${activeRate}%` }} />
                        </div>
                      </div>
                   </div>
                </div>
             </div>

             {/* Lembretes Card */}
             <div className="bg-card rounded-[2rem] border border-border p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <Bell size={16} className="text-primary" />
                  <h3 className="text-sm font-bold text-foreground">Alertas</h3>
                </div>
                <div className="space-y-3">
                   <div 
                     onClick={() => setLocation("/financeiro")}
                     className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-2xl group cursor-pointer hover:bg-rose-500/10 transition-colors"
                   >
                      <div className="flex gap-3">
                         <div className="w-8 h-8 rounded-lg bg-card shadow-sm flex items-center justify-center text-rose-500 shrink-0">
                            <Plus size={16} />
                         </div>
                         <div className="min-w-0">
                            <p className="text-[11px] font-bold text-foreground truncate">Mensalidades em atraso</p>
                            <p className="text-[10px] text-rose-500 font-bold mt-0.5">
                              {overduePayments.length} {overduePayments.length === 1 ? 'pendência' : 'pendências'}
                            </p>
                         </div>
                      </div>
                   </div>
                   
                   <div 
                     onClick={() => setLocation("/aulas")}
                     className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-2xl group cursor-pointer hover:bg-blue-500/10 transition-colors"
                   >
                      <div className="flex gap-3">
                         <div className="w-8 h-8 rounded-lg bg-card shadow-sm flex items-center justify-center text-blue-500 shrink-0">
                            <Users size={16} />
                         </div>
                         <div className="min-w-0">
                            <p className="text-[11px] font-bold text-foreground truncate">Aulas hoje</p>
                            <p className="text-[10px] text-blue-500 font-bold mt-0.5">
                              {lessonsToday} {lessonsToday === 1 ? 'aula agendada' : 'aulas agendadas'}
                            </p>
                         </div>
                      </div>
                   </div>
                </div>
             </div>
          </div>
        </div>
      </div>

      {/* Barra de Ações em Massa (Bulk Actions) */}
      {selectedStudentIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-xl w-[90%] bg-slate-950/90 text-white dark:bg-slate-900/90 backdrop-blur-xl p-4 rounded-2xl shadow-2xl border border-white/20 flex items-center justify-between gap-4 animate-in slide-in-from-bottom duration-300">
          <div className="flex items-center gap-3">
            <Badge className="bg-primary text-white font-bold">{selectedStudentIds.length} selecionados</Badge>
            <button onClick={() => setSelectedStudentIds([])} className="text-xs text-muted-foreground hover:text-white underline">Desmarcar</button>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => {
                const selected = filtered.filter((s: StudentRow) => selectedStudentIds.includes(s.id));
                handleExportCSV(selected);
              }}
              className="h-8 text-xs font-bold gap-1 bg-white/10 hover:bg-white/20 border-white/20 text-white"
            >
              <Download size={14} /> Exportar CSV
            </Button>
            <Button 
              size="sm" 
              onClick={() => {
                const selected = filtered.filter((s: StudentRow) => selectedStudentIds.includes(s.id));
                const names = selected.map((s: StudentRow) => s.name).join(", ");
                toast.success(`Lembrete via WhatsApp enviado para: ${names}`);
                window.open(`https://wa.me/?text=Olá! Passando para confirmar as próximas aulas.`, '_blank');
              }}
              className="h-8 text-xs font-bold gap-1 bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              <Send size={14} /> WhatsApp
            </Button>
          </div>
        </div>
      )}

      {modalOpen && (
        <StudentModal
          open={modalOpen}
          onClose={() => { setModalOpen(false); setEditStudent(null); }}
          editData={editStudent}
          instruments={instruments}
        />
      )}
      <StudentDetailsModal
        open={detailsStudentId !== null}
        onOpenChange={(open) => { if (!open) setDetailsStudentId(null); }}
        studentId={detailsStudentId}
        onEdit={() => {
          const s = (students as StudentRow[]).find(st => st.id === detailsStudentId);
          if (s) { setLocation(`/alunos/${s.id}/editar`); setDetailsStudentId(null); }
        }}
        onDelete={() => {
          const s = (students as StudentRow[]).find(st => st.id === detailsStudentId);
          if (s) { setDeleteStudent(s); setDetailsStudentId(null); }
        }}
      />
      <GenerateAccessModal
        open={generateAccessStudentId !== null}
        onOpenChange={(open) => { if (!open) setGenerateAccessStudentId(null); }}
        studentId={generateAccessStudentId}
      />
      {deleteStudent && (
        <DeleteConfirm
          name={deleteStudent.name}
          onConfirm={() => deleteMutation.mutate({ id: deleteStudent.id })}
          onCancel={() => setDeleteStudent(null)}
          isPending={deleteMutation.isPending}
        />
      )}

      {/* ── MODAL GERAR LINK DE AUTO-MATRÍCULA ────────────────────────── */}
      <Dialog open={isEnrollmentModalOpen} onOpenChange={setIsEnrollmentModalOpen}>
        <DialogContent className="sm:max-w-[480px] bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold font-outfit flex items-center gap-2">
              <Sparkles className="text-primary" size={20} />
              Gerar Link de Matrícula
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Envie este link para o futuro aluno preencher seus próprios dados, escolher horários disponíveis e concluir a matrícula.
            </DialogDescription>
          </DialogHeader>

          {!generatedEnrollmentLink ? (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">Instrumento / Curso (Opcional)</label>
                <Select
                  value={enrollmentInstrumentId}
                  onValueChange={setEnrollmentInstrumentId}
                >
                  <SelectTrigger className="h-10 rounded-xl text-xs">
                    <SelectValue placeholder="Todos os Cursos (Aluno escolhe)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Cursos (Aluno escolhe)</SelectItem>
                    {instruments.map((inst: any) => (
                      <SelectItem key={inst.id} value={String(inst.id)}>
                        {inst.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">
                  Se você não selecionar, o aluno poderá escolher qualquer instrumento ofertado pela escola.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">Mensalidade Fixa R$ (Opcional)</label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Ex: 150.00 (Deixe em branco para usar o padrão)"
                  value={enrollmentFee}
                  onChange={(e) => setEnrollmentFee(e.target.value)}
                  className="h-10 rounded-xl text-xs"
                />
                <p className="text-[10px] text-muted-foreground">
                  Deixe vazio para usar a mensalidade padrão cadastrada nas configurações da escola.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">Contrato para assinatura (Opcional)</label>
                <Select value={enrollmentContractTemplateId} onValueChange={setEnrollmentContractTemplateId}>
                  <SelectTrigger className="h-10 rounded-xl text-xs">
                    <SelectValue placeholder="Automático (recomendado)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Automático (menor de idade se &lt;18)</SelectItem>
                    <SelectItem value="0">Nenhum contrato</SelectItem>
                    {contractTemplates.map((t: any) => (
                      <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">
                  Requer integração Assinafy ativa. O aluno/responsável recebe o link de assinatura ao final da matrícula.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border/60">
                <Button
                  variant="outline"
                  onClick={() => setIsEnrollmentModalOpen(false)}
                  className="h-9 px-4 rounded-xl text-xs"
                >
                  Cancelar
                </Button>
                <Button
                  disabled={generateEnrollmentLinkMutation.isPending}
                  onClick={() => {
                    generateEnrollmentLinkMutation.mutate({
                      instrumentId: enrollmentInstrumentId !== "all" ? Number(enrollmentInstrumentId) : undefined,
                      monthlyFee: enrollmentFee ? Number(enrollmentFee) : undefined,
                      contractTemplateId: enrollmentContractTemplateId !== "auto" ? Number(enrollmentContractTemplateId) : undefined,
                    });
                  }}
                  className="h-9 px-4 rounded-xl text-xs bg-primary hover:bg-primary/90 text-white font-bold gap-1.5"
                >
                  {generateEnrollmentLinkMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <LinkIcon size={14} />}
                  Criar Link Exclusivo
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-2 animate-in fade-in zoom-in-95 duration-200">
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 space-y-1">
                <p className="text-xs font-bold flex items-center gap-1.5">
                  <CheckCircle2 size={16} />
                  Link criado com sucesso!
                </p>
                <p className="text-[11px] text-emerald-600/90 dark:text-emerald-400/90">
                  Qualquer pessoa com este link pode acessar o formulário público e realizar o cadastro com segurança.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">Link de Acesso:</label>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={generatedEnrollmentLink.fullUrl}
                    className="h-10 rounded-xl text-xs bg-muted/40 font-mono"
                  />
                  <Button
                    onClick={() => {
                      navigator.clipboard.writeText(generatedEnrollmentLink.fullUrl);
                      toast.success("Link copiado para a área de transferência!");
                    }}
                    className="h-10 px-3.5 rounded-xl shrink-0 gap-1 text-xs"
                    title="Copiar Link"
                  >
                    <Copy size={14} />
                    <span>Copiar</span>
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/60">
                <Button
                  variant="outline"
                  onClick={() => {
                    window.open(generatedEnrollmentLink.fullUrl, "_blank");
                  }}
                  className="h-9 px-3 rounded-xl text-xs gap-1.5"
                >
                  <ExternalLink size={14} />
                  Abrir Página
                </Button>

                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => {
                      const text = encodeURIComponent(`Olá! 🎵\n\nAqui está o seu link exclusivo para realizar sua matrícula na nossa escola de música:\n\n👉 ${generatedEnrollmentLink.fullUrl}\n\nAcesse o link para preencher seus dados e agendar suas aulas!`);
                      window.open(`https://api.whatsapp.com/send?text=${text}`, "_blank");
                    }}
                    className="h-9 px-3.5 rounded-xl text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold gap-1.5"
                  >
                    <Send size={14} />
                    Enviar no WhatsApp
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setIsEnrollmentModalOpen(false)}
                    className="h-9 px-3 rounded-xl text-xs"
                  >
                    Concluir
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
