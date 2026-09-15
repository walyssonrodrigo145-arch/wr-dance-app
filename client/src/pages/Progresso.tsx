import { useState, useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { getInstrumentEmoji } from "@/lib/status";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Search,
  Star,
  BookOpen,
  Calendar,
  Clock,
  Plus,
  Activity,
  Edit2,
  Trash2,
  ChevronRight,
  ChevronLeft,
  Loader2,
  FileText,
  Music,
  Folder,
  UploadCloud,
  Filter,
  CheckCircle2,
  Target,
  Zap,
  ExternalLink,
  CalendarDays,
  AlertTriangle,
  Play,
  PenTool,
  Flame,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { BibliotecaMusical } from "@/components/progresso/BibliotecaMusical";
import { MetasMusicais } from "@/components/progresso/MetasMusicais";
import { RepertoireTab } from "@/components/progresso/RepertoireTab";
import { Observacoes } from "@/components/progresso/Observacoes";
import { PlanEditor } from "@/components/progresso/PlanEditor";

// --- Components ---

export default function Progresso() {
  const [searchQuery, setSearchQuery] = useState("");
  const [showOnlyActive, setShowOnlyActive] = useState(() => localStorage.getItem("progresso_showOnlyActive") === "true");
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"jornada" | "biblioteca" | "observacoes" | "metas" | "desempenho" | "repertorio">("jornada");
  const [isListCollapsed, setIsListCollapsed] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);


  // IA Lesson Plan Modal State
  const [isAILessonModalOpen, setIsAILessonModalOpen] = useState(false);
  const [lessonPlanContent, setLessonPlanContent] = useState<string | null>(null);
  const [suggestedTopic, setSuggestedTopic] = useState("");

  const utils = trpc.useUtils();

  const { data: students = [], isLoading: studentsLoading } = trpc.students.list.useQuery();
  
  const { data: timeline = [], isLoading: timelineLoading } = trpc.progress.getTimeline.useQuery(
    { studentId: selectedStudentId! },
    { enabled: !!selectedStudentId }
  );
  
  const { data: summary, isLoading: summaryLoading } = trpc.progress.getSummary.useQuery(
    { studentId: selectedStudentId! },
    { enabled: !!selectedStudentId }
  );

  const { data: goals = [], isLoading: goalsLoading } = trpc.progress.getGoals.useQuery(
    { studentId: selectedStudentId! },
    { enabled: !!selectedStudentId }
  );

  const { data: upcomingLessons = [] } = trpc.lessons.upcoming.useQuery();


  const suggestNextLessonTopicMutation = trpc.progress.suggestNextLessonTopic.useMutation({
    onSuccess: (data) => {
      setSuggestedTopic(data.suggestion);
      toast.success("Tópico sugerido pela IA! Você pode editá-lo antes de gerar o plano.");
    },
    onError: (e) => toast.error("Erro ao sugerir tópico: " + e.message)
  });

  const generateNextLessonMutation = trpc.progress.generateNextLessonPlan.useMutation({
    onSuccess: (data) => {
      setLessonPlanContent(data.plan);
      toast.success("Plano de aula gerado com sucesso!");
    },
    onError: (e) => toast.error("Erro ao gerar plano: " + e.message)
  });

  const [isUploadingMethodology, setIsUploadingMethodology] = useState(false);
  const methodologyFileInputRef = useRef<HTMLInputElement>(null);

  const uploadMethodologyMutation = trpc.progress.uploadMethodologyPdf.useMutation({
    onSuccess: () => {
      utils.students.list.invalidate();
      setIsUploadingMethodology(false);
      toast.success("Metodologia importada com sucesso!");
    },
    onError: (e) => {
      setIsUploadingMethodology(false);
      toast.error("Erro ao importar metodologia: " + e.message);
    }
  });

  const removeMethodologyMutation = trpc.progress.removeMethodology.useMutation({
    onSuccess: () => {
      utils.students.list.invalidate();
      toast.success("Metodologia removida com sucesso!");
    },
    onError: (e) => toast.error("Erro ao remover metodologia: " + e.message)
  });

  const handleMethodologyUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast.error("Por favor, selecione um arquivo PDF.");
      return;
    }
    setIsUploadingMethodology(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      uploadMethodologyMutation.mutate({
        studentId: selectedStudentId!,
        filename: file.name,
        pdfBase64: base64
      });
    };
    reader.onerror = () => {
      setIsUploadingMethodology(false);
      toast.error("Erro ao ler o arquivo PDF.");
    };
    reader.readAsDataURL(file);
    if (methodologyFileInputRef.current) methodologyFileInputRef.current.value = "";
  };

  const [isStudyPlanModalOpen, setIsStudyPlanModalOpen] = useState(false);
  const [studyPlanContent, setStudyPlanContent] = useState<string | null>(null);
  const [isEditingStudyPlan, setIsEditingStudyPlan] = useState(false);
  const [editStudyPlanText, setEditStudyPlanText] = useState("");
  const [studyPlanId, setStudyPlanId] = useState<number | null>(null);
  const [studyPlanStatus, setStudyPlanStatus] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState(0);
  const [targetDailyStudyMinutes, setTargetDailyStudyMinutes] = useState(30);
  const [planDaysCount, setPlanDaysCount] = useState<5 | 10 | 15>(5);
  const [selectedPlanMode, setSelectedPlanMode] = useState<"direto" | "didatico" | "desafio">("direto");
  // PRD 02 — especialista escolhido na etapa de seleção ("builtin:teclado" | "custom:12" | null = automático)
  const [selectedSpecialistRef, setSelectedSpecialistRef] = useState<string | null>(null);
  const [selectedGoalScope, setSelectedGoalScope] = useState<"somente_metas" | "metas_complementares">("somente_metas");
  const [studyPlanMobileTab, setStudyPlanMobileTab] = useState<"controls" | "plan">("controls");

  const { data: planHistory = [], isLoading: historyLoading } = trpc.progress.getStudentPlanHistory.useQuery(
    { studentId: selectedStudentId! },
    { enabled: isStudyPlanModalOpen && !!selectedStudentId }
  );

  // PRD 02 — especialistas disponíveis (padrões + personalizados da escola)
  const { data: specialists = [] } = trpc.aiSpecialists.listMerged.useQuery(undefined, {
    enabled: isStudyPlanModalOpen,
  });

  const { data: currentTeacherPlan, isLoading: currentPlanLoading } = trpc.progress.getStudentPlanForTeacher.useQuery(
    { studentId: selectedStudentId! },
    { enabled: !!selectedStudentId }
  );

  const publishStudyPlanMutation = trpc.progress.publishStudyPlan.useMutation({
    onSuccess: () => {
      utils.progress.getStudentPlanHistory.invalidate({ studentId: selectedStudentId! });
      utils.progress.getStudentPlanForTeacher.invalidate({ studentId: selectedStudentId! });
      setStudyPlanStatus('publicado');
      toast.success("Plano liberado para o aluno com sucesso!");
    },
    onError: (e) => toast.error("Erro ao liberar plano: " + e.message)
  });

  const unpublishStudyPlanMutation = trpc.progress.unpublishStudyPlan.useMutation({
    onSuccess: () => {
      utils.progress.getStudentPlanHistory.invalidate({ studentId: selectedStudentId! });
      utils.progress.getStudentPlanForTeacher.invalidate({ studentId: selectedStudentId! });
      setStudyPlanStatus('rascunho');
      toast.success("Plano despublicado com sucesso! Agora ele voltou a ser um rascunho.");
    },
    onError: (e) => toast.error("Erro ao despublicar plano: " + e.message)
  });

  const deleteStudyPlanMutation = trpc.progress.deleteStudyPlan.useMutation({
    onSuccess: () => {
      utils.progress.getStudentPlanHistory.invalidate({ studentId: selectedStudentId! });
      utils.progress.getStudentPlanForTeacher.invalidate({ studentId: selectedStudentId! });
      setStudyPlanContent(null);
      setStudyPlanId(null);
      setStudyPlanStatus(null);
      toast.success("Plano excluído com sucesso.");
    },
    onError: (e) => toast.error("Erro ao excluir: " + e.message)
  });

  const generateDailyStudyPlanMutation = trpc.progress.generateDailyStudyPlan.useMutation({
    onSuccess: (data) => {
      toast.success("Plano gerado! Agora revise e clique em Liberar.");
      setStudyPlanContent(data.plan);
      setStudyPlanId(data.planId);
      setStudyPlanStatus('rascunho');
      setIsEditingStudyPlan(false);
      utils.progress.getStudentPlanHistory.invalidate({ studentId: selectedStudentId! });
    },
    onError: (e) => toast.error("Erro ao gerar plano diário: " + e.message)
  });

  const [isSendingViaBot, setIsSendingViaBot] = useState(false);
  const sendPlanViaWhatsAppMutation = trpc.progress.sendPlanViaWhatsApp.useMutation({
    onSuccess: (res) => {
      if (res.sentTo === "guardian") {
        toast.success("Plano enviado para o responsável via WhatsApp! (aluno sem telefone cadastrado)");
      } else {
        toast.success("Plano enviado para o aluno via WhatsApp com sucesso!");
      }
    },
    onError: (e) => toast.error(e.message)
  });

  const updateStudyPlanMutation = trpc.progress.updateStudyPlan.useMutation({
    onSuccess: (_data, variables) => {
      toast.success("Plano atualizado com sucesso!");
      setIsEditingStudyPlan(false);
      setStudyPlanContent(variables.planText);
      utils.progress.getStudentPlanHistory.invalidate({ studentId: selectedStudentId! });
      utils.progress.getStudentPlanForTeacher.invalidate({ studentId: selectedStudentId! });
    },
    onError: (e) => toast.error(e.message),
  });

  const isSendingRef = useRef(false);

  // --- Parsing utils para o Plano ---
  interface Exercise {
    title: string;
    subtitle?: string;
    duration?: string;
    points?: string[];
    icon?: string;
  }
  interface DayPlan {
    dayName: string;
    focus?: { title: string; description: string };
    exercises?: Exercise[];
  }
  interface StudyPlan {
    weeklyGoal?: string;
    importantMessage?: string;
    days: DayPlan[];
  }

  function parsePlanData(planText: string | null | undefined): StudyPlan | null {
    if (!planText) return null;
    try {
      let cleanText = planText.trim();
      if (cleanText.startsWith('```')) {
        cleanText = cleanText.replace(/^```(json)?\n?/, '').replace(/\n?```$/, '').trim();
      }
      const parsed = JSON.parse(cleanText);
      if (!parsed || !Array.isArray(parsed.days) || parsed.days.length === 0) return null;
      return parsed as StudyPlan;
    } catch {
      return null;
    }
  }

  function parseDaysCompleted(raw: any): boolean[] {
    if (!raw) return [false, false, false, false, false];
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (Array.isArray(parsed)) {
        return parsed.map(Boolean);
      }
    } catch { /* noop */ }
    return [false, false, false, false, false];
  }

  function ExerciseIcon({ icon, title }: { icon?: string; title?: string }) {
    // RF-002 (PRD_OTIMIZACAO_PLANO_DIARIO): deriva o ícone pelo título do bloco
    // (planos novos não incluem "icon"); mantém o icon do JSON para planos antigos.
    const t = (title || "").toLowerCase();
    const derived = t.startsWith("revis") ? "refresh"
      : t.startsWith("aquec") ? "music"
      : t.startsWith("téc") || t.startsWith("tec") ? "star"
      : t.startsWith("conceit") ? "book"
      : t.startsWith("aplic") ? "headphones"
      : t.startsWith("desaf") ? "pen"
      : null;
    switch (icon || derived) {
      case "play": return <Play size={20} className="text-indigo-600" />;
      case "pen": return <PenTool size={20} className="text-indigo-600" />;
      case "music": return <Music size={20} className="text-indigo-600" />;
      case "metronome": return <Clock size={20} className="text-indigo-600" />;
      case "star": return <Star size={20} className="text-indigo-600" />;
      default: return <BookOpen size={20} className="text-indigo-600" />;
    }
  }

  const activePlanData = useMemo(() => parsePlanData(currentTeacherPlan?.planText), [currentTeacherPlan?.planText]);
  const activeDaysCompleted = useMemo(() => parseDaysCompleted(currentTeacherPlan?.daysCompleted as string | undefined), [currentTeacherPlan?.daysCompleted]);

  // Converte o JSON do plano diário em texto legível e limpo para humanos
  const formatPlanAsText = (content: string): string => {
    try {
      const planData = JSON.parse(content);
      if (!planData?.days) return content; // não é JSON do plano
      let text = "";
      if (planData.weeklyGoal) {
        text += `🎯 *Objetivo da semana*: ${planData.weeklyGoal}\n\n`;
      }
      planData.days?.forEach((day: any) => {
        text += `📅 *${day.dayName}*: ${day.focus?.title}\n`;
        if (day.focus?.description) text += `_${day.focus.description}_\n`;
        day.exercises?.forEach((ex: any) => {
          text += `\n🔹 *${ex.title}* (${ex.duration})\n`;
          if (ex.subtitle && !ex.subtitle.toLowerCase().includes("execução direta") && !ex.subtitle.toLowerCase().includes("específico de") && !ex.subtitle.toLowerCase().includes("meta cadastrada")) {
            text += `_${ex.subtitle}_\n`;
          }
          ex.points?.forEach((p: string) => { text += `• ${p}\n`; });
        });
        text += `\n`;
      });
      if (planData.importantMessage) {
        text += `💡 *Dica*: ${planData.importantMessage}\n`;
      }
      return text.trim();
    } catch {
      return content; // retorna original se não for JSON válido
    }
  };

  const handleSendManualWhatsApp = (content: string, type: "aula" | "diario") => {
    // Tenta primeiro o telefone do aluno; se não tiver, usa o do responsável
    const targetPhone = selectedStudent?.phone?.trim() || selectedStudent?.guardianPhone?.trim();
    const sendingToGuardian = !selectedStudent?.phone?.trim() && !!selectedStudent?.guardianPhone?.trim();

    if (!targetPhone) {
      toast.error("Este aluno não possui telefone cadastrado e nem o do responsável.");
      return;
    }
    const emoji = getInstrumentEmoji(selectedStudent?.instrumentName);
    // Saudação diferente quando enviando para o responsável
    const saudacao = sendingToGuardian
      ? (type === "aula"
          ? `Olá! Segue o plano de aula de ${selectedStudent?.name} ${emoji}\n\n`
          : `Olá! Aqui está o cronograma de treino de ${selectedStudent?.name} para essa semana! 📅👇\n\n`)
      : (type === "aula"
          ? `Olá ${selectedStudent?.name}! Preparado para a nossa próxima aula? ${emoji} Aqui está o que vamos fazer:\n\n`
          : `Olá ${selectedStudent?.name}! Aqui está o seu cronograma de treino para arrebentar essa semana! 📅👇\n\n`);
    
    const finalContent = type === "diario" ? formatPlanAsText(content) : content;
    const text = encodeURIComponent(saudacao + finalContent);
    const url = `https://api.whatsapp.com/send?phone=55${targetPhone.replace(/\D/g, '')}&text=${text}`;
    window.open(url, "_blank");
  };

  const handleSendBotWhatsApp = async (content: string, type: "aula" | "diario") => {
    setIsSendingViaBot(true);
    try {
      await sendPlanViaWhatsAppMutation.mutateAsync({ studentId: selectedStudentId!, planText: content, type });
    } finally {
      setIsSendingViaBot(false);
    }
  };

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    category: "geral" as any,
    grade: "",
    achievedAt: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
  });

  const resetForm = () => {
    setFormData({
      title: "",
      description: "",
      category: "geral",
      grade: "",
      achievedAt: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    });
    setEditingEvent(null);
  };

  const createMutation = trpc.progress.createTimelineEvent.useMutation({
    onSuccess: () => {
      utils.progress.getTimeline.invalidate({ studentId: selectedStudentId! });
      utils.progress.getSummary.invalidate({ studentId: selectedStudentId! });
      toast.success("Registro adicionado com sucesso!");
      setIsModalOpen(false);
      resetForm();
    },
    onError: (e) => toast.error("Erro ao salvar: " + e.message),
  });

  const updateMutation = trpc.progress.updateTimelineEvent.useMutation({
    onSuccess: () => {
      utils.progress.getTimeline.invalidate({ studentId: selectedStudentId! });
      utils.progress.getSummary.invalidate({ studentId: selectedStudentId! });
      toast.success("Registro atualizado com sucesso!");
      setIsModalOpen(false);
      resetForm();
    },
    onError: (e) => toast.error("Erro ao atualizar: " + e.message),
  });

  const deleteMutation = trpc.progress.deleteTimelineEvent.useMutation({
    onSuccess: () => {
      utils.progress.getTimeline.invalidate({ studentId: selectedStudentId! });
      utils.progress.getSummary.invalidate({ studentId: selectedStudentId! });
      toast.success("Registro removido");
    },
    onError: (e) => toast.error("Erro ao remover: " + e.message),
  });

  const createGoalMutation = trpc.progress.createGoal.useMutation({
    onSuccess: () => {
      utils.progress.getGoals.invalidate({ studentId: selectedStudentId! });
      toast.success("Meta adicionada com sucesso!");
    },
    onError: (e) => toast.error("Erro ao adicionar meta: " + e.message)
  });

  const updateGoalMutation = trpc.progress.updateGoal.useMutation({
    onSuccess: () => {
      utils.progress.getGoals.invalidate({ studentId: selectedStudentId! });
    },
    onError: (e) => toast.error("Erro ao atualizar meta: " + e.message)
  });

  const deleteGoalMutation = trpc.progress.deleteGoal.useMutation({
    onSuccess: () => {
      utils.progress.getGoals.invalidate({ studentId: selectedStudentId! });
      toast.success("Meta removida");
    },
    onError: (e) => toast.error("Erro ao remover meta: " + e.message)
  });
  
  const uploadAvatarMutation = trpc.musicLibrary.upload.useMutation();
  const updateAvatarMutation = trpc.students.updateAvatar.useMutation({
    onSuccess: () => {
      utils.students.list.invalidate();
      utils.students.getDetails.invalidate({ id: selectedStudentId! });
      toast.success("Foto de perfil atualizada!");
    },
    onError: (e) => toast.error("Erro ao atualizar foto: " + e.message)
  });

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedStudentId) return;

    if (file.size > 2 * 1024 * 1024) {
      return toast.error("A foto deve ter no máximo 2MB");
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      try {
        const { url } = await uploadAvatarMutation.mutateAsync({
          fileName: file.name,
          fileType: file.type,
          base64Data: base64
        });
        await updateAvatarMutation.mutateAsync({
          id: selectedStudentId,
          avatar: url
        });
      } catch (err) {
        console.error(err);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleEdit = (event: any) => {
    setEditingEvent(event);
    setFormData({
      title: event.title,
      description: event.description || "",
      category: event.category,
      grade: event.grade || "",
      achievedAt: format(new Date(event.achievedAt), "yyyy-MM-dd'T'HH:mm"),
    });
    setIsModalOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm("Deseja realmente excluir este registro?")) {
      deleteMutation.mutate({ id });
    }
  };

  const handleSubmit = () => {
    if (!selectedStudentId) return;
    if (!formData.title) return toast.error("Título é obrigatório");

    const data = {
      studentId: selectedStudentId,
      title: formData.title,
      description: formData.description,
      category: formData.category,
      grade: formData.grade,
      achievedAt: formData.achievedAt,
    };

    if (editingEvent) {
      updateMutation.mutate({ id: editingEvent.id, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  const filteredStudents = useMemo(() => {
    return students
      .filter((s: any) => s.name.toLowerCase().includes(searchQuery.toLowerCase()))
      .filter((s: any) => showOnlyActive ? s.status === "ativo" : true)
      .sort((a: any, b: any) => a.name.localeCompare(b.name));
  }, [students, searchQuery, showOnlyActive]);

  const selectedStudent = useMemo(() => {
    return students.find((s: any) => s.id === selectedStudentId);
  }, [students, selectedStudentId]);

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] lg:h-[calc(100vh-4rem)] overflow-hidden -m-4 sm:-m-6 bg-background">
      <div className="flex flex-1 overflow-hidden">
        
        {/* COLUNA 1: TIMELINE ALUNOS */}
        <div className={cn(
          "flex flex-col bg-card border-r border-border z-20 transition-all duration-500 ease-in-out relative group/sidebar",
          isListCollapsed ? "w-[84px]" : "w-full md:w-[35%] lg:w-[22%]",
          selectedStudentId && "hidden md:flex"
        )}>
          {/* Toggle Button for Column */}
          <button 
            onClick={() => setIsListCollapsed(!isListCollapsed)}
            className="absolute -right-3 top-24 z-30 w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-lg opacity-0 group-hover/sidebar:opacity-100 transition-all hover:scale-110"
          >
            {isListCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>

          <div className={cn("p-6 pb-4", isListCollapsed && "px-3")}>
             <div className={cn("flex items-center justify-between mb-6", isListCollapsed && "flex-col gap-4")}>
                {!isListCollapsed && (
                   <div className="animate-in fade-in slide-in-from-left-2 duration-300">
                      <h2 className="text-xl font-black text-foreground tracking-tight">Progresso</h2>
                      <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-[0.2em] mt-1">Timeline</p>
                   </div>
                )}
                <div className={cn("w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center shadow-inner shrink-0", isListCollapsed && "w-12 h-12")}>
                   <Activity size={20} />
                </div>
             </div>
             
             {!isListCollapsed ? (
                  <div className="flex items-center gap-2 animate-in fade-in duration-300">
                    <div className="relative group flex-1">
                       <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-indigo-500 transition-colors" size={14} />
                       <Input
                         placeholder="Buscar..."
                         className="pl-10 h-11 text-xs rounded-xl border-border bg-muted/50 focus:bg-card transition-all shadow-sm focus:ring-2 focus:ring-indigo-500/10"
                         value={searchQuery}
                         onChange={(e) => setSearchQuery(e.target.value)}
                       />
                    </div>
                    <Button
                      variant={showOnlyActive ? "default" : "outline"}
                      className={cn("h-11 w-11 p-0 shrink-0 rounded-xl transition-all", showOnlyActive ? "bg-indigo-600 hover:bg-indigo-700 text-white" : "text-muted-foreground")}
                      onClick={() => {
                        const nextValue = !showOnlyActive;
                        setShowOnlyActive(nextValue);
                        localStorage.setItem("progresso_showOnlyActive", String(nextValue));
                      }}
                      title="Mostrar somente alunos ativos"
                    >
                      <Filter size={16} />
                    </Button>
                  </div>
             ) : (
                <button 
                  onClick={() => setIsListCollapsed(false)}
                  className="w-full h-10 rounded-xl bg-muted/50 flex items-center justify-center text-muted-foreground hover:bg-indigo-500/10 hover:text-indigo-600 transition-colors"
                >
                  <Search size={16} />
                </button>
             )}
          </div>

          <div className={cn("flex-1 overflow-y-auto px-4 py-4 space-y-2 scrollbar-none", isListCollapsed && "px-2")}>
            {studentsLoading ? (
              <div className="flex justify-center p-8"><Loader2 className="animate-spin text-slate-200" /></div>
            ) : filteredStudents.map((student: any) => (
              <motion.button
                key={student.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                onClick={() => setSelectedStudentId(student.id)}
                className={cn(
                  "w-full flex items-center gap-3 p-4 rounded-2xl transition-all duration-300 relative group overflow-hidden",
                  selectedStudentId === student.id
                    ? "bg-indigo-600 text-white shadow-xl shadow-indigo-500/10"
                    : "hover:bg-muted/80 text-slate-600",
                  isListCollapsed && "p-2 justify-center"
                )}
                title={isListCollapsed ? student.name : undefined}
              >
                {selectedStudentId === student.id && (
                  <motion.div 
                    layoutId="activeGlow"
                    className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-indigo-500 z-0"
                  />
                )}
                
                <div className="relative z-10 shrink-0">
                  <Avatar className={cn("w-10 h-10 border-2 border-white/20", isListCollapsed && "w-12 h-12")}>
                    <AvatarImage src={student.avatar} className="object-cover" />
                    <AvatarFallback className={cn(
                      "text-[10px] font-black uppercase",
                      selectedStudentId === student.id ? "bg-card/20 text-white" : "bg-indigo-500/20 text-indigo-600",
                      isListCollapsed && "text-xs"
                    )}>
                      {student.name.substring(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div className={cn(
                    "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white",
                    student.status === 'ativo' ? 'bg-emerald-500/100' : 'bg-slate-300'
                  )} />
                </div>
                
                {!isListCollapsed && (
                  <>
                    <div className="flex-1 text-left min-w-0 relative z-10 animate-in fade-in slide-in-from-left-2 duration-300">
                      <p className="text-xs font-black truncate mb-1 tracking-tight">{student.name}</p>
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-md",
                          selectedStudentId === student.id ? "bg-card/10 text-white/80" : "bg-muted text-muted-foreground"
                        )}>
                          {student.level || "Iniciante"}
                        </span>
                        <span className={cn(
                          "text-[8px] font-bold",
                          selectedStudentId === student.id ? "text-white/40" : "text-muted-foreground/40"
                        )}>
                          • {student.instrumentName || "Voz"}
                        </span>
                      </div>
                    </div>
                    
                    <ChevronRight size={14} className={cn(
                      "relative z-10 transition-all shrink-0",
                      selectedStudentId === student.id ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2 group-hover:opacity-40 group-hover:translate-x-0"
                    )} />
                  </>
                )}
              </motion.button>
            ))}
          </div>
        </div>

        {/* COLUNA 2: CONTEÚDO PRINCIPAL (53%) */}
        <div className={cn(
          "flex-1 flex flex-col min-w-0 bg-muted/30 overflow-hidden relative",
          !selectedStudentId && "hidden md:flex"
        )}>
          {!selectedStudentId ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-24 h-24 rounded-[2.5rem] bg-card border border-border shadow-xl shadow-foreground/5 flex items-center justify-center mb-8 relative"
              >
                <div className="absolute inset-0 bg-indigo-500/10 blur-2xl rounded-full" />
                <Activity size={40} className="text-indigo-400 relative z-10" />
              </motion.div>
              <h2 className="text-2xl font-black text-foreground tracking-tight">Evolução Musical</h2>
              <p className="text-sm text-muted-foreground max-w-[320px] mt-3 font-medium leading-relaxed">
                Selecione um aluno na lista lateral para visualizar sua jornada, biblioteca de materiais e métricas de desempenho.
              </p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              
              {/* TOP ACTIONS */}
              <div className="px-4 sm:px-8 py-4 shrink-0 flex items-center justify-between relative z-10 bg-transparent">
                <div className="flex items-center gap-3 min-w-0">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => setSelectedStudentId(null)}
                    className="md:hidden w-10 h-10 rounded-xl bg-card border border-border shadow-sm text-muted-foreground hover:text-foreground shrink-0"
                  >
                    <ChevronLeft size={20} />
                  </Button>
                  <h2 className="md:hidden text-lg font-black tracking-tight text-foreground truncate">{selectedStudent?.name}</h2>
                </div>
                
                <div className="flex items-center gap-4 shrink-0 ml-2">
                  <div className="hidden xl:flex flex-col items-end justify-center">
                     <span className="text-[10px] font-bold text-muted-foreground mb-1">Status de Evolução</span>
                     <div className="flex items-center gap-1.5 px-2">
                        <Zap size={14} className="text-emerald-500 fill-emerald-500/20" />
                        <span className="text-xs font-bold text-emerald-600">Excelente desempenho</span>
                     </div>
                  </div>
                  <Button 
                    onClick={() => { resetForm(); setIsModalOpen(true); }}
                    className="h-10 px-3 sm:px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all border-none flex items-center gap-2"
                  >
                     <Plus size={16} />
                     <span className="font-medium text-sm hidden sm:inline">Novo</span>
                  </Button>
                </div>
              </div>

              {/* STATS AND STUDENT INFO GRID */}
              <div className="px-4 sm:px-8 pb-4 sm:pb-6 shrink-0">
                <div className="flex flex-col lg:flex-row gap-4 sm:gap-6">
                  {/* STUDENT CARD */}
                  <div className="lg:w-1/3 bg-card p-4 sm:p-6 rounded-2xl border border-border shadow-sm flex flex-col justify-between min-h-[90px] sm:min-h-[140px]">
                    <div className="flex items-center gap-3 sm:gap-4">
                      <div className="relative shrink-0">
                        <Avatar className="w-12 h-12 sm:w-14 sm:h-14 shadow-md">
                          <AvatarImage src={selectedStudent?.avatar} className="object-cover" />
                          <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-xl font-bold uppercase">
                            {selectedStudent?.name.substring(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <input 
                          type="file" 
                          ref={avatarInputRef} 
                          className="hidden" 
                          accept="image/*" 
                          onChange={handleAvatarChange} 
                        />
                        <motion.div 
                          whileHover={{ scale: 1.1 }}
                          onClick={() => avatarInputRef.current?.click()}
                          className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-card border border-border shadow-sm flex items-center justify-center text-indigo-600 cursor-pointer z-10 hover:bg-indigo-50 transition-colors"
                        >
                          {uploadAvatarMutation.isPending ? (
                            <Loader2 size={10} className="animate-spin" />
                          ) : (
                            <Edit2 size={10} />
                          )}
                        </motion.div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col items-start gap-1">
                          <h2 className="hidden md:block text-sm font-bold text-foreground leading-tight truncate w-full">{selectedStudent?.name}</h2>
                          <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[10px] font-black uppercase rounded-md tracking-wider">
                            {selectedStudent?.level || "Iniciante"}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-col gap-1.5">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Frequência</span>
                        <span className="text-[10px] font-black text-indigo-600">{summary?.frequency || 0}%</span>
                      </div>
                      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${summary?.frequency || 0}%` }}
                          className="h-full bg-indigo-600 rounded-full" 
                        />
                      </div>
                    </div>
                  </div>

                  {/* STATS CARDS - Grid responsivo (2x2 no mobile, 4 colunas no desktop) */}
                  <div className="lg:w-2/3 grid grid-cols-2 md:grid-cols-4 gap-2.5 md:gap-3">
                    {[
                      { label: "Média Geral", value: summary?.averageGrade ? Number(summary.averageGrade).toFixed(1) : "0.0", icon: Star, color: "text-amber-500", bg: "bg-amber-500/10" },
                      { label: "Aulas", value: summary?.completedCount || 0, icon: BookOpen, color: "text-indigo-500", bg: "bg-indigo-500/10" },
                      { label: "Última", value: summary?.lastLesson ? format(new Date(summary.lastLesson), "dd MMM", { locale: ptBR }) : "—", icon: Calendar, color: "text-rose-500", bg: "bg-rose-500/10" },
                      { label: "Tempo", value: summary?.totalTimeMinutes ? `${Math.floor(summary.totalTimeMinutes / 60)}h ${summary.totalTimeMinutes % 60}m` : "0h 0m", icon: Clock, color: "text-emerald-500", bg: "bg-emerald-500/10" },
                    ].map((stat, i) => (
                      <div key={i} className="bg-card p-3 md:p-4 rounded-2xl border border-border shadow-sm flex flex-col items-start justify-center h-[92px] sm:h-[140px] hover:border-indigo-500/30 transition-colors">
                        <div className={cn("w-7 h-7 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center mb-2 sm:mb-4", stat.bg)}>
                           <stat.icon className={cn("w-3.5 h-3.5 sm:w-5 sm:h-5", stat.color)} strokeWidth={2.5} />
                        </div>
                        <p className="text-[9px] sm:text-xs font-black uppercase tracking-widest text-muted-foreground mb-0.5 sm:mb-1 truncate w-full">{stat.label}</p>
                        <p className="text-lg sm:text-2xl font-black text-foreground leading-none">{stat.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

               {/* INTERNAL HEADER - TABS */}
               <div className="shrink-0 border-b border-border bg-card/30">
                  <div className="flex items-center gap-2 lg:gap-6 overflow-x-auto subtle-scrollbar px-4 sm:px-8 py-3 md:py-0">
                    {[
                      { id: "jornada", label: "Jornada", icon: Activity },
                      { id: "biblioteca", label: "Biblioteca", icon: Folder },
                      { id: "repertorio", label: "Repertório", icon: Music },
                      { id: "observacoes", label: "Notas", icon: BookOpen },
                      { id: "metas", label: "Metas", icon: Target },
                    ].map((tab) => {
                      const isActive = activeTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          onClick={() => setActiveTab(tab.id as any)}
                          className={cn(
                            "flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-2 md:py-4 text-[10px] md:text-xs font-black uppercase tracking-widest transition-all relative whitespace-nowrap shrink-0 rounded-full md:rounded-none",
                            isActive 
                              ? "bg-indigo-600 text-white md:bg-transparent md:text-indigo-600 shadow-md shadow-indigo-500/20 md:shadow-none" 
                              : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground md:bg-transparent"
                          )}
                        >
                          <tab.icon className={cn("w-3.5 h-3.5 md:w-4 md:h-4 transition-colors", isActive ? "text-white md:text-indigo-600" : "text-muted-foreground")} />
                          {tab.label}
                          {/* Desktop active border */}
                          {isActive && <div className="hidden md:block absolute bottom-0 left-0 right-0 h-[3px] bg-indigo-600 rounded-t-full" />}
                        </button>
                      );
                    })}
                  </div>
               </div>

              {/* CONTENT AREA */}
              <div className="flex-1 p-4 sm:p-8 overflow-y-auto no-scrollbar">
                 <AnimatePresence mode="wait">
                    {activeTab === "jornada" && (
                      <motion.div 
                        key="jornada"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="space-y-8"
                      >

                         {/* PLANO DE ESTUDO ATIVO (VISÃO PROFESSOR) */}
                         <div className="space-y-4 pt-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-2 h-6 bg-orange-500 rounded-full shrink-0" />
                                <h3 className="text-base sm:text-lg font-black text-foreground uppercase tracking-tighter leading-tight">Plano Diário Ativo</h3>
                              </div>
                              {currentTeacherPlan && (
                                <span className={cn(
                                  "text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full",
                                  currentTeacherPlan.publishedStatus === 'publicado' ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                                )}>
                                  {currentTeacherPlan.publishedStatus === 'publicado' ? 'PUBLICADO' : 'RASCUNHO'}
                                </span>
                              )}
                            </div>
                            
                            {currentPlanLoading ? (
                              <div className="flex justify-center p-6"><Loader2 className="animate-spin text-orange-500/20" /></div>
                            ) : currentTeacherPlan ? (
                              <div className="bg-card p-6 rounded-[2rem] border border-border shadow-sm">
                                {(() => {
                                  if (!activePlanData) {
                                    return (
                                      <div className="prose prose-sm dark:prose-invert max-w-none text-sm text-slate-700 whitespace-pre-wrap">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{formatPlanAsText(currentTeacherPlan.planText)}</ReactMarkdown>
                                      </div>
                                    );
                                  }

                                  const totalDays = activePlanData.days.length;
                                  const safeDayIndex = Math.min(selectedDay, totalDays - 1);
                                  const currentDayData = activePlanData.days[safeDayIndex];
                                  const isCurrentDayCompleted = Boolean(activeDaysCompleted[safeDayIndex]);

                                  return (
                                    <div className="space-y-6">
                                      {/* Objetivo Semanal */}
                                      {activePlanData.weeklyGoal && (
                                        <div className="bg-indigo-50/50 dark:bg-indigo-500/10 p-4 rounded-2xl border border-indigo-100/50 dark:border-indigo-500/20 flex items-start gap-3">
                                          <Target size={20} className="text-indigo-500 shrink-0 mt-0.5" />
                                          <div>
                                            <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase mb-1">Objetivo da Semana</p>
                                            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{activePlanData.weeklyGoal}</p>
                                          </div>
                                        </div>
                                      )}

                                      {/* Header + Seletor de dia */}
                                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                        <div className="flex items-center gap-3 bg-card border border-border p-2 rounded-xl shadow-sm">
                                          <div className="flex items-center gap-2 px-3">
                                            <CalendarDays size={17} className="text-indigo-600 dark:text-indigo-400" />
                                            <span className="font-bold text-sm text-foreground">
                                              {currentDayData?.dayName || "Dia " + (safeDayIndex + 1)}
                                            </span>
                                          </div>
                                          <div className="flex gap-1">
                                            <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg"
                                              onClick={() => setSelectedDay((d) => Math.max(0, d - 1))} disabled={safeDayIndex === 0}>
                                              <ChevronLeft size={16} />
                                            </Button>
                                            <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg"
                                              onClick={() => setSelectedDay((d) => Math.min(totalDays - 1, d + 1))} disabled={safeDayIndex === totalDays - 1}>
                                              <ChevronRight size={16} />
                                            </Button>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Foco do dia */}
                                      <AnimatePresence mode="wait">
                                        <motion.div key={"focus-" + safeDayIndex}
                                          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
                                          <div className="bg-indigo-50/30 dark:bg-indigo-500/10 border border-indigo-100/50 dark:border-indigo-500/20 p-6 rounded-2xl flex flex-col md:flex-row justify-between gap-6 items-center shadow-sm">
                                            <div className="flex gap-4 items-center flex-1">
                                              <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-600/20 shrink-0">
                                                <Music size={28} />
                                              </div>
                                              <div>
                                                <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 mb-1">FOCO DO DIA</p>
                                                <h2 className="text-lg font-black text-slate-900 dark:text-slate-100 leading-tight mb-1">
                                                  {currentDayData?.focus?.title || "Treino Prático"}
                                                </h2>
                                                <p className="text-sm text-slate-600 dark:text-slate-400 font-medium leading-relaxed max-w-sm">
                                                  {currentDayData?.focus?.description || "Siga os exercícios para concluir a rotina de hoje."}
                                                </p>
                                              </div>
                                            </div>
                                            <div className="bg-card p-4 rounded-xl border border-border shadow-sm w-full md:w-auto min-w-[200px] text-center">
                                              <h3 className="font-bold text-foreground mb-1">Status do Aluno</h3>
                                              {isCurrentDayCompleted ? (
                                                <div className="flex items-center justify-center gap-2 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 py-2 rounded-lg font-bold text-sm">
                                                  <CheckCircle2 size={16} /> Treino Concluído
                                                </div>
                                              ) : (
                                                <div className="flex items-center justify-center gap-2 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 py-2 rounded-lg font-bold text-sm">
                                                  <AlertTriangle size={16} /> Pendente
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        </motion.div>
                                      </AnimatePresence>

                                      {/* Lista de exercícios */}
                                      <AnimatePresence mode="wait">
                                        <motion.div key={"list-" + safeDayIndex}
                                          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
                                          {!currentDayData?.exercises || currentDayData.exercises.length === 0 ? (
                                            <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 p-4 rounded-xl text-amber-700">
                                              <AlertTriangle size={18} className="shrink-0" />
                                              <p className="text-sm font-medium">Nenhum exercício registrado.</p>
                                            </div>
                                          ) : (
                                            <div className="flex flex-col gap-3">
                                              {currentDayData.exercises.map((exercise, idx) => (
                                                <div key={idx} className="bg-card dark:bg-slate-800/50 border border-border p-4 rounded-xl flex flex-col md:flex-row items-start md:items-center gap-4 shadow-sm">
                                                  <div className="flex items-center gap-3 flex-1">
                                                    <span className="text-slate-300 dark:text-slate-600 font-black text-lg w-6 text-center shrink-0">
                                                      {String(idx + 1).padStart(2, "0")}
                                                    </span>
                                                    <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-500/10 rounded-lg flex items-center justify-center shrink-0">
                                                      <ExerciseIcon icon={exercise.icon} title={exercise.title} />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                      <h4 className="font-bold text-foreground text-sm">{exercise.title}</h4>
                                                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{exercise.subtitle}</p>
                                                    </div>
                                                  </div>
                                                  {exercise.duration && (
                                                    <div className="text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-2.5 py-1 rounded-md text-xs font-bold shrink-0">
                                                      ⏱ {exercise.duration}
                                                    </div>
                                                  )}
                                                  {exercise.points && exercise.points.length > 0 && (
                                                    <div className="flex-1 text-xs text-slate-600 min-w-[150px]">
                                                      <ul className="list-disc pl-3 space-y-0.5">
                                                        {exercise.points.map((point, pIdx) => <li key={pIdx}>{point}</li>)}
                                                      </ul>
                                                    </div>
                                                  )}
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </motion.div>
                                      </AnimatePresence>
                                    </div>
                                  );
                                })()}
                                
                                <div className="mt-6 pt-4 border-t border-border flex flex-wrap justify-end gap-2">
                                  {currentTeacherPlan.publishedStatus === 'rascunho' ? (
                                    <Button 
                                      onClick={() => publishStudyPlanMutation.mutate({ planId: currentTeacherPlan.id, studentId: selectedStudentId! })}
                                      className="bg-green-500 hover:bg-green-600 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-green-500/20 h-8 rounded-lg px-3"
                                      disabled={publishStudyPlanMutation.isPending}
                                    >
                                      {publishStudyPlanMutation.isPending ? <Loader2 size={16} className="animate-spin mr-2" /> : <CheckCircle2 size={16} className="mr-2" />}
                                      Liberar para o Aluno
                                    </Button>
                                  ) : (
                                    <>
                                      <Button 
                                        variant="outline"
                                        onClick={() => {
                                          // Tenta telefone do aluno; fallback para responsável
                                          const targetPhone = selectedStudent?.phone?.trim() || selectedStudent?.guardianPhone?.trim();
                                          if (!targetPhone) {
                                            toast.error("Este aluno não possui telefone cadastrado e nem o do responsável.");
                                            return;
                                          }
                                          const emoji = getInstrumentEmoji(selectedStudent?.instrumentName);
                                          const text = encodeURIComponent(`Olá! Passando para lembrar ${selectedStudent?.name} de treinar os exercícios do plano de estudo hoje! Bora praticar? ${emoji}🚀`);
                                          window.open(`https://api.whatsapp.com/send?phone=55${targetPhone.replace(/\D/g, '')}&text=${text}`, "_blank");
                                        }}
                                        className="h-8 rounded-lg px-3 text-[10px] font-black uppercase tracking-widest border-indigo-200 text-indigo-600 hover:bg-indigo-50"
                                      >
                                        <Zap size={14} className="mr-2" /> Lembrar de Praticar
                                      </Button>
                                      <Button 
                                        variant="outline"
                                        onClick={() => unpublishStudyPlanMutation.mutate({ planId: currentTeacherPlan.id })}
                                        disabled={unpublishStudyPlanMutation.isPending}
                                        className="h-8 rounded-lg px-3 text-[10px] font-black uppercase tracking-widest border-amber-200 text-amber-600 hover:bg-amber-50"
                                      >
                                        {unpublishStudyPlanMutation.isPending ? <Loader2 size={14} className="animate-spin mr-2" /> : <AlertTriangle size={14} className="mr-2" />}
                                        Despublicar
                                      </Button>
                                      <Button 
                                        variant="destructive"
                                        onClick={() => deleteStudyPlanMutation.mutate({ planId: currentTeacherPlan.id })}
                                        disabled={deleteStudyPlanMutation.isPending}
                                        className="h-8 rounded-lg px-3 text-[10px] font-black uppercase tracking-widest"
                                      >
                                        {deleteStudyPlanMutation.isPending ? <Loader2 size={14} className="animate-spin mr-2" /> : <Trash2 size={14} className="mr-2" />}
                                        Excluir Plano
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="py-8 bg-muted/30 border border-dashed border-border rounded-[2rem] text-center flex flex-col items-center justify-center">
                                <Calendar size={32} className="text-muted-foreground/30 mb-2" />
                                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Nenhum plano publicado no momento</p>
                                <p className="text-[10px] text-muted-foreground mt-1">Gere ou libere um rascunho no botão Plano de Estudo Diário.</p>
                              </div>
                            )}
                         </div>

                         {/* LISTA DE REGISTROS (TIMELINE) */}
                         <div className="space-y-6 pt-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                               <div className="flex items-center gap-3">
                                  <div className="w-2 h-6 bg-indigo-600 rounded-full shrink-0" />
                                  <h3 className="text-base sm:text-lg font-black text-foreground uppercase tracking-tighter leading-tight">Timeline de Evolução</h3>
                               </div>
                               <div className="flex flex-col sm:flex-row gap-3">
                                  <Button 
                                    onClick={() => {
                                      setIsAILessonModalOpen(true);
                                      setLessonPlanContent(null);
                                      setSuggestedTopic("");
                                      suggestNextLessonTopicMutation.mutate({ studentId: selectedStudentId! });
                                    }}
                                    className="w-full sm:w-auto h-10 rounded-xl px-5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white text-[10px] font-black uppercase tracking-widest gap-2 shadow-lg shadow-violet-500/20"
                                    disabled={suggestNextLessonTopicMutation.isPending || generateNextLessonMutation.isPending}
                                  >
                                    {suggestNextLessonTopicMutation.isPending || generateNextLessonMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                                    Sugerir Próxima Aula
                                  </Button>
                                  <Button 
                                    onClick={() => {
                                      setIsStudyPlanModalOpen(true);
                                      // If there's a draft or published plan, we should show it instead of auto-generating
                                      // The modal itself will show the history and a 'Gerar Novo' button
                                    }}
                                    className="w-full sm:w-auto h-10 rounded-xl px-5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-[10px] font-black uppercase tracking-widest gap-2 shadow-lg shadow-amber-500/20"
                                  >
                                    <Calendar size={16} />
                                    Plano de Estudo Diário
                                  </Button>
                                  <Button 
                                    onClick={() => { resetForm(); setIsModalOpen(true); }}
                                    className="w-full sm:w-auto h-10 rounded-xl px-5 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black uppercase tracking-widest gap-2"
                                  >
                                    <Plus size={16} /> Novo Registro
                                  </Button>
                               </div>
                            </div>

                            <div className="space-y-6">
                               {timelineLoading ? (
                                 <div className="flex justify-center p-12"><Loader2 className="animate-spin text-indigo-500/20" /></div>
                               ) : timeline.length === 0 ? (
                                 <div className="py-20 bg-card border border-dashed border-border rounded-[3rem] text-center">
                                    <Activity size={40} className="mx-auto text-slate-100 mb-4" />
                                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Nenhum registro encontrado</p>
                                 </div>
                               ) : (
                                 timeline.map((event) => (
                                   <motion.div 
                                      key={event.id}
                                      initial={{ opacity: 0, x: -20 }}
                                      animate={{ opacity: 1, x: 0 }}
                                      className="group flex gap-6"
                                   >
                                      <div className="flex flex-col items-center gap-2 mt-2 shrink-0">
                                         <div className={cn(
                                           "w-3 h-3 rounded-full border-2 border-white ring-4 shadow-sm",
                                           event.category === 'tecnica' ? 'bg-indigo-500/100 ring-indigo-500/10' :
                                           event.category === 'teoria' ? 'bg-amber-500/100 ring-amber-500/10' :
                                           event.category === 'repertorio' ? 'bg-emerald-500/100 ring-emerald-500/10' :
                                           'bg-slate-400 ring-slate-100'
                                         )} />
                                         <div className="w-0.5 h-full bg-muted group-last:bg-transparent" />
                                      </div>

                                      <div className="flex-1 bg-card border border-border p-6 rounded-[2.5rem] shadow-sm group-hover:shadow-md transition-all">
                                         <div className="flex items-start justify-between mb-4">
                                            <div>
                                               <div className="flex items-center gap-3 mb-2">
                                                  <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest bg-muted/50 px-2 py-1 rounded-lg border border-border/50">
                                                    {format(new Date(event.achievedAt), "dd 'de' MMMM, yyyy", { locale: ptBR })}
                                                  </span>
                                                  <span className={cn(
                                                    "text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg border",
                                                    event.category === 'tecnica' ? 'bg-indigo-500/10 text-indigo-600 border-indigo-100' :
                                                    event.category === 'teoria' ? 'bg-amber-500/10 text-amber-600 border-amber-100' :
                                                    'bg-emerald-500/10 text-emerald-600 border-emerald-100'
                                                  )}>
                                                    {event.category}
                                                  </span>
                                               </div>
                                               <h4 className="text-base font-black text-foreground tracking-tight">{event.title}</h4>
                                            </div>
                                            {event.grade && (
                                              <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 border border-border rounded-xl">
                                                 <Star size={14} className="text-amber-500 fill-amber-500" />
                                                 <span className="text-xs font-black text-foreground">{Number(event.grade).toFixed(1)}</span>
                                              </div>
                                            )}
                                         </div>
                                         <p className="text-xs text-muted-foreground font-medium leading-relaxed mb-6">{event.description}</p>
                                         
                                         <div className="flex items-center justify-between pt-4 border-t border-slate-100 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <span className="text-[10px] font-bold text-muted-foreground">Registrado no sistema</span>
                                            <div className="flex gap-2">
                                                <Button 
                                                  variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-indigo-600 hover:bg-indigo-500/10"
                                                  onClick={() => handleEdit(event)}
                                                >
                                                   <Edit2 size={14} />
                                                </Button>
                                                <Button 
                                                  variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-rose-600 hover:bg-rose-50"
                                                  onClick={() => handleDelete(event.id)}
                                                >
                                                   <Trash2 size={14} />
                                                </Button>
                                            </div>
                                         </div>
                                      </div>
                                   </motion.div>
                                 ))
                               )}
                            </div>
                         </div>
                      </motion.div>
                    )}

                     {activeTab === "biblioteca" && (
                       <motion.div 
                         key="biblioteca"
                         initial={{ opacity: 0, scale: 0.98 }}
                         animate={{ opacity: 1, scale: 1 }}
                         exit={{ opacity: 0, scale: 0.98 }}
                       >
                          <BibliotecaMusical studentId={selectedStudentId!} />
                       </motion.div>
                     )}

                     {activeTab === "repertorio" && selectedStudentId != null && (
                       <motion.div
                         key="repertorio"
                         initial={{ opacity: 0, scale: 0.98 }}
                         animate={{ opacity: 1, scale: 1 }}
                         exit={{ opacity: 0, scale: 0.98 }}
                       >
                          <RepertoireTab
                            studentId={selectedStudentId}
                            studentName={students.find((s: any) => s.id === selectedStudentId)?.name}
                          />
                       </motion.div>
                     )}

                     {activeTab === "metas" && (
                      <motion.div 
                        key="metas"
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                      >
                         <MetasMusicais 
                           studentId={selectedStudentId!} 
                           goals={goals} 
                           createGoalMutation={createGoalMutation} 
                           updateGoalMutation={updateGoalMutation} 
                           deleteGoalMutation={deleteGoalMutation} 
                         />
                      </motion.div>
                    )}

                    {activeTab === "observacoes" && (
                      <motion.div 
                        key="observacoes"
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                      >
                         <Observacoes timeline={timeline} />
                      </motion.div>
                    )}
                 </AnimatePresence>
              </div>
            </div>
          )}
        </div>


      </div>

      {/* MODAL PARA NOVO REGISTRO */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[480px] w-[95vw] max-h-[90dvh] sm:max-h-[85vh] p-0 gap-0 border-none shadow-2xl rounded-[2rem] sm:rounded-[2.5rem] flex flex-col overflow-hidden">
          <div className="px-6 py-5 sm:px-8 sm:py-6 border-b border-border bg-muted/50 shrink-0">
             <DialogHeader>
                <DialogTitle className="text-lg sm:text-xl font-black text-foreground uppercase tracking-tighter">
                   {editingEvent ? "Editar Registro" : "Novo Registro de Evolução"}
                </DialogTitle>
                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-[0.2em] mt-1">Documente o desempenho e feedback do aluno</p>
             </DialogHeader>
          </div>
          
          <div className="p-6 sm:p-8 space-y-5 bg-card overflow-y-auto subtle-scrollbar flex-1">
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Data da Atividade</label>
                   <Input 
                     type="datetime-local" 
                     className="rounded-2xl h-11 sm:h-12 bg-muted/50 border-border text-xs font-bold"
                     value={formData.achievedAt}
                     onChange={e => setFormData({...formData, achievedAt: e.target.value})}
                   />
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Categoria</label>
                   <Select value={formData.category} onValueChange={v => setFormData({...formData, category: v as any})}>
                      <SelectTrigger className="rounded-2xl h-11 sm:h-12 bg-muted/50 border-border text-xs font-bold">
                         <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-2xl border-border">
                         <SelectItem value="tecnica">Técnica</SelectItem>
                         <SelectItem value="teoria">Teoria</SelectItem>
                         <SelectItem value="repertorio">Repertório</SelectItem>
                         <SelectItem value="geral">Geral</SelectItem>
                      </SelectContent>
                   </Select>
                </div>
             </div>

             <div className="space-y-2">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Título do Evento</label>
                <Input 
                  placeholder="Ex: Escala Pentatônica Am" 
                  className="rounded-2xl h-11 sm:h-12 bg-muted/50 border-border text-xs font-bold"
                  value={formData.title}
                  onChange={e => setFormData({...formData, title: e.target.value})}
                />
             </div>

             <div className="space-y-2">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Observações / Feedback</label>
                <Textarea 
                  placeholder="Detalhes sobre o progresso..." 
                  className="rounded-2xl bg-muted/50 border-border text-xs font-bold min-h-[110px] max-h-[220px] p-4 resize-y"
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                />
             </div>

             <div className="space-y-2">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Avaliação Final (0-10)</label>
                <div className="flex items-center gap-3">
                   <Input 
                     type="number" 
                     min="0" max="10" step="0.5"
                     className="rounded-2xl h-11 sm:h-12 w-20 sm:w-24 bg-muted/50 border-border text-center font-black text-base sm:text-lg"
                     value={formData.grade}
                     onChange={e => setFormData({...formData, grade: e.target.value})}
                   />
                   <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-600" style={{ width: `${Number(formData.grade) * 10}%` }} />
                   </div>
                </div>
             </div>
          </div>

          <DialogFooter className="p-4 sm:p-6 bg-muted/50 border-t border-border flex flex-row gap-3 shrink-0">
             <Button variant="ghost" className="flex-1 h-11 sm:h-12 rounded-2xl text-[10px] font-black uppercase tracking-widest text-muted-foreground" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
             <Button 
               className="flex-1 h-11 sm:h-12 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-500/10"
               onClick={handleSubmit}
               disabled={createMutation.isPending || updateMutation.isPending}
             >
                {(createMutation.isPending || updateMutation.isPending) ? (
                  <Loader2 className="animate-spin mr-2" size={14} />
                ) : null}
                {editingEvent ? "Salvar Alterações" : "Registrar Progresso"}
             </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
        {/* MODAL PLANO DE AULA IA */}
        <Dialog open={isAILessonModalOpen} onOpenChange={setIsAILessonModalOpen}>
          <DialogContent className="sm:max-w-[700px] bg-card p-0 overflow-hidden rounded-[2.5rem] border-none shadow-2xl">
            <div className="p-8 pb-4 bg-gradient-to-r from-violet-600 to-indigo-600">
               <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-white backdrop-blur-sm">
                     <Zap size={20} />
                  </div>
                  <div>
                    <DialogTitle className="text-xl font-black text-white uppercase tracking-tight">Sua Próxima Aula</DialogTitle>
                    <p className="text-[10px] font-bold text-white/80 uppercase tracking-widest mt-1">Plano gerado pela Inteligência Artificial</p>
                  </div>
               </div>
            </div>
            
            <div className="p-8 max-h-[60vh] overflow-y-auto subtle-scrollbar">
               {suggestNextLessonTopicMutation.isPending ? (
                 <div className="flex flex-col items-center justify-center py-16 space-y-4">
                    <Loader2 size={40} className="animate-spin text-indigo-500/50" />
                    <p className="text-sm font-bold text-muted-foreground animate-pulse">Analisando histórico e sugerindo assunto...</p>
                 </div>
               ) : generateNextLessonMutation.isPending ? (
                 <div className="flex flex-col items-center justify-center py-16 space-y-4">
                    <Loader2 size={40} className="animate-spin text-indigo-500/50" />
                    <p className="text-sm font-bold text-muted-foreground animate-pulse">Gerando plano de aula completo com base no assunto...</p>
                 </div>
               ) : lessonPlanContent ? (
                 <div className="prose prose-sm dark:prose-invert max-w-none prose-h1:text-xl prose-h1:font-black prose-h2:text-lg prose-h2:text-indigo-600 prose-h2:font-black prose-h3:text-base prose-strong:text-indigo-500">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                       {lessonPlanContent}
                    </ReactMarkdown>
                 </div>
               ) : suggestedTopic ? (
                 <div className="space-y-6">
                   <div className="bg-indigo-50 dark:bg-indigo-900/20 p-5 rounded-2xl border border-indigo-100 dark:border-indigo-800">
                     <p className="text-sm font-bold text-indigo-800 dark:text-indigo-200 leading-relaxed">{suggestedTopic}</p>
                   </div>
                   
                   <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
                     <div className="flex items-center justify-between mb-2">
                       <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">Metodologia Personalizada</h4>
                       {students.find((s: any) => s.id === selectedStudentId)?.methodologyFilename && (
                         <Button
                           variant="ghost"
                           size="sm"
                           onClick={() => removeMethodologyMutation.mutate({ studentId: selectedStudentId! })}
                           disabled={removeMethodologyMutation.isPending}
                           className="h-6 px-2 text-[10px] text-red-500 hover:bg-red-50 hover:text-red-600 uppercase tracking-widest disabled:opacity-50"
                         >
                           {removeMethodologyMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                           Remover PDF
                         </Button>
                       )}
                     </div>
                     
                     <div className="flex items-center gap-4">
                       <input 
                         type="file" 
                         accept="application/pdf" 
                         className="hidden" 
                         ref={methodologyFileInputRef}
                         onChange={handleMethodologyUpload}
                       />
                       <Button 
                         variant="outline" 
                         onClick={() => methodologyFileInputRef.current?.click()}
                         disabled={isUploadingMethodology}
                         className="flex-1 bg-white hover:bg-slate-50 text-slate-700 h-10 rounded-xl text-xs"
                       >
                         {isUploadingMethodology ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UploadCloud className="w-4 h-4 mr-2" />}
                         {isUploadingMethodology ? "Enviando..." : "Importar PDF de Metodologia"}
                       </Button>
                       
                       <div className="flex-1 text-xs font-medium text-slate-500 truncate">
                         {students.find((s: any) => s.id === selectedStudentId)?.methodologyFilename ? (
                           <span className="flex items-center text-indigo-600 font-bold"><FileText className="w-3 h-3 mr-1" /> {students.find((s: any) => s.id === selectedStudentId)?.methodologyFilename}</span>
                         ) : (
                           "Nenhum arquivo. A IA usará seu conhecimento geral."
                         )}
                       </div>
                     </div>
                   </div>

                   <div className="space-y-2">
                     <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Defina o Assunto Principal para a IA criar o plano</label>
                     <Textarea 
                       value={suggestedTopic} 
                       onChange={(e) => setSuggestedTopic(e.target.value)}
                       className="min-h-[100px] resize-none text-sm font-medium rounded-2xl border-border bg-card p-4"
                       placeholder="Ex: Escala pentatônica e improvisação básica..."
                     />
                     <p className="text-xs text-muted-foreground mt-2 ml-1">Você pode modificar o assunto sugerido acima ou aceitá-lo como está.</p>
                   </div>
                   <div className="flex justify-end pt-2">
                     <Button 
                       onClick={() => generateNextLessonMutation.mutate({ studentId: selectedStudentId!, topic: suggestedTopic })}
                       className="h-12 rounded-2xl px-8 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-indigo-500/20"
                     >
                       Gerar Plano de Aula Completo
                     </Button>
                   </div>
                 </div>
               ) : (
                 <p className="text-center text-muted-foreground py-8">Nenhum plano gerado ainda.</p>
               )}
            </div>

            <DialogFooter className="p-6 bg-muted/30 border-t border-border flex flex-col sm:flex-row justify-between gap-3">
               <div className="flex gap-2">
                 <Button type="button" variant="ghost" onClick={() => setIsAILessonModalOpen(false)} className="h-11 rounded-xl px-6 text-xs font-black uppercase tracking-widest hover:bg-muted">
                    Fechar
                 </Button>
                 {lessonPlanContent && (
                   <Button 
                     onClick={() => {
                       navigator.clipboard.writeText(lessonPlanContent);
                       toast.success("Copiado para a área de transferência!");
                     }}
                     className="h-11 rounded-xl px-6 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-indigo-500/20"
                   >
                      Copiar Plano
                   </Button>
                 )}
               </div>
               
               {lessonPlanContent && (
                 <div className="flex gap-2">
                   <Button 
                     onClick={() => handleSendManualWhatsApp(lessonPlanContent, "aula")}
                     className="h-11 rounded-xl px-4 bg-green-500 hover:bg-green-600 text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-green-500/20"
                   >
                      WhatsApp Manual
                   </Button>
                   <Button 
                     onClick={() => handleSendBotWhatsApp(lessonPlanContent, "aula")}
                     disabled={isSendingViaBot}
                     className="h-11 rounded-xl px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20"
                   >
                      {isSendingViaBot ? <Loader2 className="animate-spin mr-2" size={16} /> : null}
                      WhatsApp Robô
                   </Button>
                 </div>
               )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* MODAL PLANO DE ESTUDO IA */}
        <Dialog open={isStudyPlanModalOpen} onOpenChange={(open) => { setIsStudyPlanModalOpen(open); if (!open) { setStudyPlanMobileTab("controls"); setSelectedSpecialistRef(null); } }}>
          <DialogContent className="w-[96vw] max-w-5xl sm:max-w-5xl lg:max-w-6xl bg-card p-0 overflow-hidden rounded-2xl sm:rounded-3xl border border-border/60 shadow-2xl flex flex-col h-[85dvh] max-h-[85dvh] md:h-[88vh] md:max-h-[850px] md:flex-row gap-0">
            
            {/* === MOBILE: Tab Bar === */}
            <div className="flex md:hidden shrink-0 bg-muted/40 border-b border-border/70">
              <button
                onClick={() => setStudyPlanMobileTab("controls")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-3 text-xs font-black uppercase tracking-wide transition-all",
                  studyPlanMobileTab === "controls"
                    ? "text-orange-600 dark:text-orange-400 border-b-2 border-orange-500 bg-card"
                    : "text-muted-foreground"
                )}
              >
                <Sparkles size={14} />
                Configurar
              </button>
              <button
                onClick={() => setStudyPlanMobileTab("plan")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-3 text-xs font-black uppercase tracking-wide transition-all relative",
                  studyPlanMobileTab === "plan"
                    ? "text-orange-600 dark:text-orange-400 border-b-2 border-orange-500 bg-card"
                    : "text-muted-foreground"
                )}
              >
                <Calendar size={14} />
                Plano
                {studyPlanContent && (
                  <span className="absolute top-1.5 right-6 w-2 h-2 rounded-full bg-orange-500" />
                )}
              </button>
            </div>

            {/* === COLUNA ESQUERDA (desktop: lateral | mobile: aba "Configurar") === */}
            <div className={cn(
              "w-full md:w-[340px] lg:w-[360px] shrink-0 bg-muted/20 border-b md:border-b-0 md:border-r border-border/70 flex flex-col min-h-0 flex-1 md:flex-none",
              "md:flex",
              studyPlanMobileTab === "controls" ? "flex" : "hidden"
            )}>
              
              {/* Histórico de Planos */}
              <div className="flex flex-col min-h-0" style={{flex: "0 1 auto", maxHeight: "35%"}}>
                <div className="px-5 py-3 border-b border-border/60 bg-muted/40 flex justify-between items-center shrink-0">
                  <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <Clock size={14} className="text-orange-500" />
                    Histórico de Planos
                  </h3>
                  {planHistory.length > 0 && (
                    <span className="text-[10px] font-bold bg-orange-500/10 text-orange-600 dark:text-orange-400 px-2 py-0.5 rounded-full border border-orange-500/20">
                      {planHistory.length}
                    </span>
                  )}
                </div>
                <div className="overflow-y-auto p-3 space-y-2 subtle-scrollbar flex-1">
                  {historyLoading ? (
                    <div className="flex justify-center py-4"><Loader2 className="animate-spin text-orange-500/50" size={20} /></div>
                  ) : planHistory.length === 0 ? (
                    <div className="text-center py-5 px-4">
                      <p className="text-xs font-semibold text-muted-foreground">Nenhum plano gerado ainda.</p>
                      <p className="text-[11px] text-muted-foreground/70 mt-1">Configure abaixo e clique em Gerar Plano.</p>
                    </div>
                  ) : (
                    planHistory.map((plan: any) => (
                      <button
                        key={plan.id}
                        onClick={() => {
                          setStudyPlanContent(plan.planText);
                          setStudyPlanId(plan.id);
                          setStudyPlanStatus(plan.publishedStatus);
                          setStudyPlanMobileTab("plan");
                        }}
                        className={cn(
                          "w-full text-left p-2.5 rounded-xl border text-xs transition-all cursor-pointer",
                          studyPlanId === plan.id 
                            ? "border-orange-500 bg-orange-500/10 text-foreground font-bold shadow-sm ring-1 ring-orange-500/30" 
                            : "border-border/60 bg-card hover:border-orange-300 hover:bg-muted/30 text-muted-foreground"
                        )}
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-foreground text-xs">
                            {format(new Date(plan.createdAt), "dd MMM, HH:mm", { locale: ptBR })}
                          </span>
                          <span className={cn(
                            "text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full",
                            plan.publishedStatus === 'publicado' 
                              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30" 
                              : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                          )}>
                            {plan.publishedStatus}
                          </span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* Controles de Geração */}
              <div className="p-4 border-t border-border/70 bg-card/95 space-y-3 flex-1 overflow-y-auto subtle-scrollbar">
                {/* PRD 02 §23 — Etapa de seleção: "Qual especialista deve criar este plano?" */}
                <div>
                  <span className="text-xs font-black text-foreground flex items-center gap-1.5 mb-2">
                    <Users size={13} className="text-orange-500" />
                    Especialista
                  </span>
                  <div className="grid grid-cols-2 gap-1.5 max-h-[150px] overflow-y-auto subtle-scrollbar pr-0.5">
                    <button
                      type="button"
                      onClick={() => setSelectedSpecialistRef(null)}
                      className={cn(
                        "rounded-xl transition-all border cursor-pointer flex flex-col items-center justify-center p-2 gap-0.5 text-center",
                        selectedSpecialistRef === null
                          ? "bg-orange-500 text-white border-orange-600 shadow-md shadow-orange-500/25"
                          : "bg-muted/50 hover:bg-muted text-muted-foreground border-border/60 hover:text-foreground"
                      )}
                    >
                      <span className="text-base leading-none">🎯</span>
                      <span className="text-[10px] font-black leading-tight">Automático</span>
                      <span className="text-[8px] opacity-80 leading-tight">Pelo instrumento</span>
                    </button>
                    {specialists.filter((s: any) => s.active !== false).map((s: any) => (
                      <button
                        key={s.ref}
                        type="button"
                        onClick={() => setSelectedSpecialistRef(s.ref)}
                        title={s.description}
                        className={cn(
                          "rounded-xl transition-all border cursor-pointer flex flex-col items-center justify-center p-2 gap-0.5 text-center",
                          selectedSpecialistRef === s.ref
                            ? "bg-orange-500 text-white border-orange-600 shadow-md shadow-orange-500/25"
                            : "bg-muted/50 hover:bg-muted text-muted-foreground border-border/60 hover:text-foreground"
                        )}
                      >
                        <span className="text-base leading-none">{s.icon}</span>
                        <span className="text-[10px] font-black leading-tight truncate w-full">{s.name}</span>
                        {s.source === "personalizado" && (
                          <span className={cn("text-[7px] font-black uppercase px-1 rounded", selectedSpecialistRef === s.ref ? "bg-white/20" : "bg-violet-500/15 text-violet-600 dark:text-violet-400")}>
                            Personalizado
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                  <p className="text-[9px] text-muted-foreground mt-1.5 leading-snug">
                    Crie especialistas personalizados em Configurações → Prompts IA.
                  </p>
                </div>

                {/* Estilo */}
                <div>
                  <span className="text-xs font-black text-foreground flex items-center gap-1.5 mb-2">
                    <Sparkles size={13} className="text-orange-500" />
                    Estilo do Plano
                  </span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(["direto", "didatico", "desafio"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setSelectedPlanMode(mode)}
                        className={cn(
                          "h-12 rounded-xl transition-all border cursor-pointer flex flex-col items-center justify-center p-1",
                          selectedPlanMode === mode
                            ? "bg-orange-500 text-white border-orange-600 shadow-md shadow-orange-500/25"
                            : "bg-muted/50 hover:bg-muted text-muted-foreground border-border/60 hover:text-foreground"
                        )}
                      >
                        <span className="flex items-center gap-1 text-[11px] font-black">
                          {mode === "direto" ? <Zap size={12} /> : mode === "didatico" ? <BookOpen size={12} /> : <Flame size={12} />}
                          {mode === "direto" ? "Direto" : mode === "didatico" ? "Didático" : "Ritmo"}
                        </span>
                        <span className="text-[9px] opacity-80 font-normal leading-none mt-0.5">
                          {mode === "direto" ? "Checklist" : mode === "didatico" ? "Detalhado" : "Desafio"}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Escopo do Conteúdo (2 opções) */}
                <div>
                  <span className="text-xs font-black text-foreground flex items-center gap-1.5 mb-2">
                    <BookOpen size={13} className="text-orange-500" />
                    Escopo do Conteúdo
                  </span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(["somente_metas", "metas_complementares"] as const).map((scope) => (
                      <button
                        key={scope}
                        type="button"
                        onClick={() => setSelectedGoalScope(scope)}
                        className={cn(
                          "h-14 rounded-xl transition-all border cursor-pointer flex flex-col items-center justify-center p-1",
                          selectedGoalScope === scope
                            ? "bg-orange-500 text-white border-orange-600 shadow-md shadow-orange-500/25"
                            : "bg-muted/50 hover:bg-muted text-muted-foreground border-border/60 hover:text-foreground"
                        )}
                      >
                        <span className="flex items-center gap-1 text-[11px] font-black">
                          {scope === "somente_metas" ? <Zap size={12} /> : <Sparkles size={12} />}
                          {scope === "somente_metas" ? "Só Metas" : "Metas +"}
                        </span>
                        <span className="text-[9px] opacity-80 font-normal leading-none mt-0.5">
                          {scope === "somente_metas" ? "Exclusivo do cadastrado" : "Assuntos na mesma linha"}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tempo */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-black text-foreground flex items-center gap-1.5">
                      <Clock size={13} className="text-orange-500" />
                      Tempo Diário
                    </span>
                    <span className="text-[11px] font-black text-orange-600 dark:text-orange-400 bg-orange-500/10 px-2.5 py-0.5 rounded-lg border border-orange-500/20">
                      {targetDailyStudyMinutes}min
                    </span>
                  </div>
                  <div className="grid grid-cols-6 gap-1.5">
                    {[10, 20, 30, 40, 50, 60].map((mins) => (
                      <button
                        key={mins}
                        type="button"
                        onClick={() => setTargetDailyStudyMinutes(mins)}
                        className={cn(
                          "h-9 rounded-xl text-xs font-bold transition-all border cursor-pointer flex items-center justify-center",
                          targetDailyStudyMinutes === mins
                            ? "bg-orange-500 text-white border-orange-600 shadow-sm"
                            : "bg-muted/50 hover:bg-muted text-muted-foreground border-border/60"
                        )}
                      >
                        {mins}m
                      </button>
                    ))}
                  </div>
                </div>

                {/* Botão Gerar */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-black text-foreground flex items-center gap-1.5">
                      <CalendarDays size={13} className="text-orange-500" />
                      Duração do Plano
                    </span>
                    <span className="text-[11px] font-black text-orange-600 dark:text-orange-400 bg-orange-500/10 px-2.5 py-0.5 rounded-lg border border-orange-500/20">
                      {planDaysCount} dias
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[5, 10, 15].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setPlanDaysCount(d as 5 | 10 | 15)}
                        className={cn(
                          "h-9 rounded-xl text-xs font-bold transition-all border cursor-pointer flex items-center justify-center",
                          planDaysCount === d
                            ? "bg-orange-500 text-white border-orange-600 shadow-sm"
                            : "bg-muted/50 hover:bg-muted text-muted-foreground border-border/60"
                        )}
                      >
                        {d} dias
                      </button>
                    ))}
                  </div>
                </div>

                <Button 
                  onClick={() => {
                    setStudyPlanContent(null);
                    setStudyPlanId(null);
                    setStudyPlanStatus(null);
                    setStudyPlanMobileTab("plan");
                    generateDailyStudyPlanMutation.mutate({
                      studentId: selectedStudentId!,
                      targetMinutes: targetDailyStudyMinutes,
                      daysCount: planDaysCount,
                      planMode: selectedPlanMode,
                      goalScope: selectedGoalScope,
                      specialistRef: selectedSpecialistRef || undefined,
                    });
                  }}
                  disabled={generateDailyStudyPlanMutation.isPending}
                  className="w-full h-13 rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 hover:from-orange-600 hover:to-amber-600 text-white text-sm font-black uppercase tracking-wider shadow-lg shadow-orange-500/25 transition-all"
                >
                  {generateDailyStudyPlanMutation.isPending ? (
                    <span className="flex items-center gap-2">
                      <Loader2 size={16} className="animate-spin" />
                      Gerando Plano...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Sparkles size={16} />
                      Gerar Plano ({selectedPlanMode === "direto" ? "Direto" : selectedPlanMode === "didatico" ? "Didático" : "Ritmo"} • {targetDailyStudyMinutes}m)
                    </span>
                  )}
                </Button>
              </div>
            </div>

            {/* === COLUNA DIREITA (desktop: lateral | mobile: aba "Plano") === */}
            <div className={cn(
              "flex-1 min-w-0 flex flex-col bg-background h-full min-h-0",
              "md:flex",
              studyPlanMobileTab === "plan" ? "flex" : "hidden"
            )}>
              
              {/* Header Laranja */}
              <div className="px-5 py-4 bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 shrink-0">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center text-white backdrop-blur-md shrink-0 border border-white/25">
                      <Calendar size={20} />
                    </div>
                    <div className="min-w-0">
                      <DialogTitle className="text-lg font-black text-white uppercase tracking-tight truncate">
                        Plano de Estudo Diário
                      </DialogTitle>
                      <p className="text-[10px] font-bold text-white/85 uppercase tracking-widest mt-0.5">
                        Gerado pela IA
                      </p>
                    </div>
                  </div>
                  {studyPlanStatus === 'rascunho' && (
                    <span className="bg-amber-950/40 text-amber-200 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border border-amber-300/40 shrink-0">
                      RASCUNHO
                    </span>
                  )}
                  {studyPlanStatus === 'publicado' && (
                    <span className="bg-emerald-950/40 text-emerald-200 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border border-emerald-300/40 shrink-0">
                      PUBLICADO
                    </span>
                  )}
                </div>
              </div>
              
              {/* Conteúdo do Plano (scroll invisível suave) */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 no-scrollbar min-h-0">
                {generateDailyStudyPlanMutation.isPending ? (
                  <div className="flex flex-col items-center justify-center py-16 space-y-4">
                    <Loader2 size={44} className="animate-spin text-orange-500" />
                    <p className="text-sm font-bold text-muted-foreground animate-pulse text-center">Analisando histórico musical e criando cronograma...</p>
                  </div>
                ) : studyPlanContent ? (
                   isEditingStudyPlan ? (
                     <PlanEditor
                       planText={studyPlanContent}
                       isSaving={updateStudyPlanMutation.isPending}
                       onCancel={() => setIsEditingStudyPlan(false)}
                       onSave={(newText) => updateStudyPlanMutation.mutate({ planId: studyPlanId!, planText: newText })}
                     />
                   ) : (
                     (() => {
                       const parsed = parsePlanData(studyPlanContent);
                       if (!parsed) {
                         return (
                           <div className="prose prose-sm dark:prose-invert max-w-none text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                             <ReactMarkdown remarkPlugins={[remarkGfm]}>{formatPlanAsText(studyPlanContent)}</ReactMarkdown>
                           </div>
                         );
                       }

                       return (
                         <div className="space-y-4">
                           {/* Objetivo Semanal */}
                           {parsed.weeklyGoal && (
                             <div className="bg-orange-500/10 border border-orange-500/20 p-4 rounded-2xl flex items-start gap-3">
                               <Target size={18} className="text-orange-500 shrink-0 mt-0.5" />
                               <div>
                                 <p className="text-[10px] font-black text-orange-600 dark:text-orange-400 uppercase tracking-widest mb-0.5">Objetivo da Semana</p>
                                 <p className="text-xs sm:text-sm text-foreground font-semibold leading-relaxed">{parsed.weeklyGoal}</p>
                               </div>
                             </div>
                           )}

                           {/* Lista de Dias com Scroll Suave */}
                           <div className="space-y-3.5">
                             {parsed.days.map((d, dIdx) => (
                               <div key={dIdx} className="bg-card border border-border/80 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
                                 <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2.5">
                                   <div className="flex items-center gap-2">
                                     <div className="w-7 h-7 rounded-xl bg-orange-500/15 text-orange-600 dark:text-orange-400 flex items-center justify-center text-xs font-black">
                                       {dIdx + 1}
                                     </div>
                                     <div>
                                       <h4 className="text-xs sm:text-sm font-black text-foreground">{d.dayName || `Dia ${dIdx + 1}`}</h4>
                                       {d.focus?.title && (
                                         <p className="text-[11px] font-bold text-orange-600 dark:text-orange-400 mt-0.5">{d.focus.title}</p>
                                       )}
                                     </div>
                                   </div>
                                   {d.focus?.description && (
                                     <span className="hidden md:inline-block text-[10px] text-muted-foreground italic max-w-xs truncate text-right">
                                       {d.focus.description}
                                     </span>
                                   )}
                                 </div>

                                 {d.focus?.description && (
                                   <p className="md:hidden text-[11px] text-muted-foreground italic">
                                     {d.focus.description}
                                   </p>
                                 )}

                                 {/* Exercícios do Dia */}
                                 <div className="space-y-2">
                                   {(d.exercises || []).map((ex, exIdx) => (
                                     <div key={exIdx} className="bg-muted/30 border border-border/50 rounded-xl p-3 space-y-1.5">
                                       <div className="flex items-center justify-between gap-2">
                                         <div className="flex items-center gap-2 min-w-0">
                                           <div className="w-6 h-6 rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0 text-xs">
                                             <ExerciseIcon icon={ex.icon} title={ex.title} />
                                           </div>
                                           <span className="font-bold text-xs text-foreground truncate">{ex.title}</span>
                                         </div>
                                         {ex.duration && (
                                           <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-orange-500/10 text-orange-600 dark:text-orange-400 shrink-0">
                                             ⏱ {ex.duration}
                                           </span>
                                         )}
                                       </div>
                                       {ex.subtitle && !ex.subtitle.toLowerCase().includes("execução direta") && (
                                         <p className="text-[11px] text-muted-foreground">{ex.subtitle}</p>
                                       )}
                                       {ex.points && ex.points.length > 0 && (
                                         <ul className="space-y-0.5 text-[11px] text-foreground/80 pl-3">
                                           {ex.points.map((pt, ptIdx) => (
                                             <li key={ptIdx} className="list-disc leading-relaxed">{pt}</li>
                                           ))}
                                         </ul>
                                       )}
                                     </div>
                                   ))}
                                 </div>
                               </div>
                             ))}
                           </div>

                           {/* Mensagem Importante / Dica */}
                           {parsed.importantMessage && (
                             <div className="bg-amber-500/10 border border-amber-500/20 p-3.5 rounded-2xl flex items-start gap-2.5">
                               <Sparkles size={16} className="text-amber-500 shrink-0 mt-0.5" />
                               <div>
                                 <p className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest mb-0.5">Dica Prática</p>
                                 <p className="text-xs text-foreground/90 leading-relaxed">{parsed.importantMessage}</p>
                               </div>
                             </div>
                           )}
                         </div>
                       );
                     })()
                   )
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-16 h-16 rounded-3xl bg-muted/50 flex items-center justify-center text-muted-foreground/40 mb-4 border border-border">
                      <Calendar size={30} />
                    </div>
                    <p className="text-foreground font-bold text-sm">Nenhum plano selecionado</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                      Configure na aba <strong>Configurar</strong> e clique em Gerar Plano.
                    </p>
                    {/* Botão de atalho mobile para ir à aba de controles */}
                    <Button
                      variant="outline"
                      className="mt-4 md:hidden h-10 rounded-xl px-5 text-xs font-black gap-2 border-orange-500/40 text-orange-600 dark:text-orange-400"
                      onClick={() => setStudyPlanMobileTab("controls")}
                    >
                      <Sparkles size={14} />
                      Ir para Configurações
                    </Button>
                  </div>
                )}
              </div>

              {/* Rodapé de Ações — sempre visível, fora do scroll */}
              {studyPlanContent && !isEditingStudyPlan && (
                <div className="px-4 py-3 bg-muted/30 border-t border-border/70 flex flex-wrap gap-2 justify-between items-center shrink-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {studyPlanStatus === 'rascunho' && (
                      <Button 
                        onClick={() => publishStudyPlanMutation.mutate({ planId: studyPlanId!, studentId: selectedStudentId! })}
                        disabled={publishStudyPlanMutation.isPending}
                        className="h-9 rounded-xl px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black uppercase tracking-wide shadow-sm shadow-emerald-500/20"
                      >
                        {publishStudyPlanMutation.isPending ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <CheckCircle2 size={14} className="mr-1.5" />}
                        Liberar
                      </Button>
                    )}
                    <Button 
                      variant="secondary"
                      onClick={() => setIsEditingStudyPlan(true)}
                      className="h-9 rounded-xl px-3 text-[11px] font-black uppercase tracking-wide gap-1.5"
                    >
                      <Edit2 size={14} />
                      Editar
                    </Button>
                    <Button 
                      variant="destructive"
                      onClick={() => deleteStudyPlanMutation.mutate({ planId: studyPlanId! })}
                      disabled={deleteStudyPlanMutation.isPending}
                      className="h-9 rounded-xl px-3 text-[11px] font-black uppercase tracking-wide gap-1.5"
                    >
                      {deleteStudyPlanMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      Excluir
                    </Button>
                  </div>
                  
                  <div className="flex items-center gap-1.5">
                    <Button 
                      variant="outline"
                      onClick={() => handleSendManualWhatsApp(studyPlanContent, "diario")}
                      className="h-9 rounded-xl px-3 text-[11px] font-bold gap-1.5"
                      title="Enviar via WhatsApp Manual"
                    >
                      <ExternalLink size={14} />
                      <span className="hidden sm:inline">WhatsApp</span>
                    </Button>
                    <Button 
                      variant="outline"
                      onClick={() => handleSendBotWhatsApp(studyPlanContent, "diario")}
                      disabled={isSendingViaBot}
                      className="h-9 rounded-xl px-3 text-[11px] font-bold gap-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                      title="Enviar via WhatsApp Robô Automático"
                    >
                      {isSendingViaBot ? <Loader2 className="animate-spin" size={14} /> : <Zap size={14} />}
                      <span className="hidden sm:inline">Robô Auto</span>
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
    </div>
  );
}

