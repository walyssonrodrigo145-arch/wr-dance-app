import { 
  Megaphone, 
  Plus, 
  Trash2, 
  Search, 
  Bell, 
  User, 
  Calendar,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  X,
  Circle,
  Wand2
} from "lucide-react";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export default function Comunicados() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const utils = trpc.useUtils();

  // Queries
  const { data: announcements, isLoading } = trpc.announcements.list.useQuery();
  const { data: students } = trpc.students.list.useQuery();

  // Mutations
  const createMutation = trpc.announcements.create.useMutation({
    onSuccess: () => {
      toast.success("Comunicado enviado com sucesso!");
      setIsModalOpen(false);
      utils.announcements.list.invalidate();
    }
  });

  const deleteMutation = trpc.announcements.delete.useMutation({
    onSuccess: () => {
      toast.success("Comunicado excluído.");
      utils.announcements.list.invalidate();
    }
  });

  const enhanceMutation = trpc.ai.enhanceText.useMutation({
    onSuccess: (data) => {
      setFormData(prev => ({ ...prev, content: data.text }));
      toast.success("Texto melhorado com sucesso!");
    },
    onError: () => {
      toast.error("Falha ao melhorar o texto. Tente novamente.");
    }
  });

  const [recipientMode, setRecipientMode] = useState<"all" | "single" | "multiple">("all");
  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([]);
  const [studentSearch, setStudentSearch] = useState("");

  const [formData, setFormData] = useState({
    title: "",
    content: "",
    important: false,
    sendViaWhatsApp: false,
    targetStudentId: "" as string | number,
  });

  const handleToggleSelectStudent = (id: number) => {
    setSelectedStudentIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllFilteredStudents = () => {
    const activeStudentIds = filteredStudentsList.map((s: any) => s.id);
    const allSelected = activeStudentIds.every((id: any) => selectedStudentIds.includes(id));
    if (allSelected) {
      setSelectedStudentIds(prev => prev.filter(id => !activeStudentIds.includes(id)));
    } else {
      setSelectedStudentIds(prev => Array.from(new Set([...prev, ...activeStudentIds])));
    }
  };

  const handleCreate = () => {
    if (!formData.title || !formData.content) {
      toast.error("Preencha o título e o conteúdo.");
      return;
    }

    let targetStudentId: number | null = null;
    let targetStudentIds: number[] | undefined = undefined;

    if (recipientMode === "single") {
      if (!formData.targetStudentId || formData.targetStudentId === "all") {
        toast.error("Selecione o aluno destinatário.");
        return;
      }
      targetStudentId = Number(formData.targetStudentId);
    } else if (recipientMode === "multiple") {
      if (selectedStudentIds.length === 0) {
        toast.error("Selecione pelo menos um aluno para enviar o comunicado.");
        return;
      }
      targetStudentIds = selectedStudentIds;
    }

    createMutation.mutate({
      title: formData.title,
      content: formData.content,
      important: formData.important,
      sendViaWhatsApp: formData.sendViaWhatsApp,
      targetStudentId,
      targetStudentIds,
    });
  };

  const filteredAnnouncements = announcements?.filter(a => 
    a.title.toLowerCase().includes(search.toLowerCase()) || 
    a.content.toLowerCase().includes(search.toLowerCase())
  ) || [];

  const filteredStudentsList = (students || []).filter((s: any) => 
    s.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
    (s.email && s.email.toLowerCase().includes(studentSearch.toLowerCase())) ||
    (s.phone && s.phone.includes(studentSearch))
  );

  return (
    <div className="space-y-8 pb-10">
      {/* Header Area */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-foreground flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
              <Megaphone size={28} />
            </div>
            Comunicados
          </h1>
          <p className="text-muted-foreground font-medium mt-1">Gerencie os avisos enviados para seus alunos no portal e WhatsApp.</p>
        </div>
        <Button 
          onClick={() => {
            setFormData({
              title: "",
              content: "",
              important: false,
              sendViaWhatsApp: false,
              targetStudentId: "",
            });
            setSelectedStudentIds([]);
            setRecipientMode("all");
            setIsModalOpen(true);
          }}
          className="h-14 px-8 rounded-2xl bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest shadow-xl shadow-primary/20 transition-all hover:scale-105 active:scale-95 group"
        >
          <Plus size={20} className="mr-2 group-hover:rotate-90 transition-transform" />
          Novo Comunicado
        </Button>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
          <Input 
            placeholder="Buscar por título ou conteúdo..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-14 pl-12 rounded-2xl bg-card border-border/40 focus:ring-primary/20 shadow-sm font-medium"
          />
        </div>
      </div>

      {/* Announcements List */}
      <div className="grid grid-cols-1 gap-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 bg-card/30 rounded-3xl border border-dashed border-border/50">
            <Loader2 className="h-12 w-12 animate-spin text-primary/40 mb-4" />
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Sincronizando comunicados...</p>
          </div>
        ) : filteredAnnouncements.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 bg-card/30 rounded-[3rem] border-2 border-dashed border-border/50">
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-6 opacity-20">
              <Megaphone size={40} />
            </div>
            <p className="text-xl font-black text-foreground/40">Nenhum comunicado enviado</p>
            <p className="text-sm text-muted-foreground/60 font-medium mt-2 max-w-xs text-center">
              Comece criando seu primeiro aviso para que seus alunos visualizem no portal.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            <AnimatePresence>
              {filteredAnnouncements.map((ann, idx) => (
                <motion.div
                  key={ann.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: idx * 0.05 }}
                >
                  <Card className="border-none shadow-lg bg-card/60 backdrop-blur-md hover:bg-card/80 transition-all group border-l-4 border-l-primary/40 hover:border-l-primary">
                    <CardContent className="p-8">
                      <div className="flex flex-col lg:flex-row gap-8">
                        <div className={cn(
                          "w-16 h-16 rounded-[1.5rem] flex items-center justify-center shrink-0 shadow-lg",
                          ann.important ? "bg-primary text-white shadow-primary/20" : "bg-muted text-muted-foreground"
                        )}>
                          {ann.important ? <AlertTriangle size={28} /> : <Bell size={28} />}
                        </div>
                        
                        <div className="flex-1 space-y-4">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                              <div className="flex items-center gap-3 mb-1">
                                <h3 className="text-xl font-black tracking-tight text-foreground group-hover:text-primary transition-colors">
                                  {ann.title}
                                </h3>
                                {ann.important && (
                                  <span className="text-[10px] font-black uppercase tracking-widest bg-primary/10 text-primary px-3 py-1 rounded-full border border-primary/20 animate-pulse">
                                    Urgente
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                                <span className="flex items-center gap-1.5"><Calendar size={12} className="text-primary/40" /> {format(new Date(ann.createdAt), "dd 'de' MMM, yyyy", { locale: ptBR })}</span>
                                <span className="flex items-center gap-1.5"><User size={12} className="text-primary/40" /> {ann.targetStudentId ? `Enviado para ${students?.find((s: any) => s.id === ann.targetStudentId)?.name || 'Aluno específico'}` : "Todos os alunos"}</span>
                              </div>
                            </div>
                            
                            <Button 
                              variant="ghost" 
                              onClick={() => deleteMutation.mutate({ id: ann.id })}
                              className="w-12 h-12 rounded-2xl text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-all opacity-0 group-hover:opacity-100"
                            >
                              <Trash2 size={20} />
                            </Button>
                          </div>
                          
                          <p className="text-sm font-medium text-muted-foreground leading-relaxed">
                            {ann.content}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Create Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[560px] w-[95vw] rounded-[2.5rem] p-0 overflow-hidden bg-card border-border/40 shadow-2xl max-h-[90vh] flex flex-col">
          <DialogHeader className="p-8 pb-0 shrink-0">
            <DialogTitle className="text-3xl font-black tracking-tight text-foreground flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                <Plus size={24} />
              </div>
              Novo Comunicado
            </DialogTitle>
            <DialogDescription className="font-medium text-muted-foreground mt-2">
              Envie um aviso importante exibido no portal e diretamente no WhatsApp do aluno.
            </DialogDescription>
          </DialogHeader>

          <div className="p-8 space-y-6 overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
            {/* Título */}
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Título do Aviso</Label>
              <Input 
                placeholder="Ex: Alteração no horário da aula extra" 
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                className="h-14 rounded-2xl bg-muted/30 border-border/40 font-bold"
              />
            </div>

            {/* Seleção de Destinatário */}
            <div className="space-y-3">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Destinatários</Label>
              
              {/* Opções de Modo de Destinatário */}
              <div className="grid grid-cols-3 gap-2 bg-muted/30 p-1.5 rounded-2xl border border-border/40">
                <button
                  type="button"
                  onClick={() => setRecipientMode("all")}
                  className={cn(
                    "py-2.5 px-3 rounded-xl text-xs font-black transition-all",
                    recipientMode === "all" 
                      ? "bg-primary text-white shadow-md shadow-primary/20" 
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  Todos os Alunos
                </button>
                <button
                  type="button"
                  onClick={() => setRecipientMode("multiple")}
                  className={cn(
                    "py-2.5 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5",
                    recipientMode === "multiple" 
                      ? "bg-primary text-white shadow-md shadow-primary/20" 
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  Vários Alunos
                  {selectedStudentIds.length > 0 && (
                    <span className="bg-white/20 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                      {selectedStudentIds.length}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setRecipientMode("single")}
                  className={cn(
                    "py-2.5 px-3 rounded-xl text-xs font-black transition-all",
                    recipientMode === "single" 
                      ? "bg-primary text-white shadow-md shadow-primary/20" 
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  1 Aluno Único
                </button>
              </div>

              {/* Modo: 1 Aluno Único */}
              {recipientMode === "single" && (
                <div className="animate-in fade-in-50 duration-200">
                  <Select 
                    value={formData.targetStudentId.toString()} 
                    onValueChange={(val) => setFormData(prev => ({ ...prev, targetStudentId: val }))}
                  >
                    <SelectTrigger className="h-14 rounded-2xl bg-muted/30 border-border/40 font-bold">
                      <SelectValue placeholder="Selecione o aluno específico" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl border-border/40 shadow-xl max-h-60">
                      {students?.map((s: any) => (
                        <SelectItem key={s.id} value={s.id.toString()} className="font-bold py-3">
                          {s.name} {s.phone ? `(${s.phone})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Modo: Vários Alunos Específicos */}
              {recipientMode === "multiple" && (
                <div className="space-y-3 bg-muted/20 p-4 rounded-2xl border border-border/40 animate-in fade-in-50 duration-200">
                  <div className="flex items-center justify-between gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                      <Input
                        placeholder="Buscar aluno por nome ou telefone..."
                        value={studentSearch}
                        onChange={(e) => setStudentSearch(e.target.value)}
                        className="h-10 pl-9 rounded-xl bg-card border-border/40 text-xs font-medium"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleSelectAllFilteredStudents}
                      className="h-10 text-xs font-bold rounded-xl shrink-0"
                    >
                      {filteredStudentsList.every((s: any) => selectedStudentIds.includes(s.id)) ? "Desmarcar Todos" : "Marcar Todos"}
                    </Button>
                  </div>

                  {/* Contador e Badges de Alunos Selecionados */}
                  {selectedStudentIds.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1 bg-card/60 rounded-xl border border-border/30">
                      {selectedStudentIds.map(id => {
                        const studentObj = students?.find((s: any) => s.id === id);
                        if (!studentObj) return null;
                        return (
                          <span 
                            key={id} 
                            className="inline-flex items-center gap-1.5 bg-primary/10 text-primary border border-primary/20 text-xs font-bold py-1 px-2.5 rounded-lg"
                          >
                            {studentObj.name}
                            <button
                              type="button"
                              onClick={() => handleToggleSelectStudent(id)}
                              className="hover:bg-primary/20 rounded p-0.5"
                            >
                              <X size={12} />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* Lista com Checkboxes */}
                  <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
                    {filteredStudentsList.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">Nenhum aluno encontrado com este nome.</p>
                    ) : (
                      filteredStudentsList.map((s: any) => {
                        const isSelected = selectedStudentIds.includes(s.id);
                        return (
                          <div
                            key={s.id}
                            onClick={() => handleToggleSelectStudent(s.id)}
                            className={cn(
                              "flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all border text-xs",
                              isSelected 
                                ? "bg-primary/10 border-primary/40 text-foreground font-bold shadow-sm" 
                                : "bg-card/40 border-border/30 text-muted-foreground hover:bg-muted/40"
                            )}
                          >
                            <div className="flex items-center gap-2.5">
                              <div className={cn(
                                "w-5 h-5 rounded-md flex items-center justify-center border transition-all",
                                isSelected ? "bg-primary border-primary text-white" : "border-border bg-card"
                              )}>
                                {isSelected && <CheckCircle2 size={14} />}
                              </div>
                              <span className={cn(isSelected && "text-primary font-black")}>{s.name}</span>
                            </div>
                            {s.phone && <span className="text-[10px] text-muted-foreground">{s.phone}</span>}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Conteúdo */}
            <div className="space-y-2 relative">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Conteúdo da Mensagem</Label>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  disabled={!formData.content || enhanceMutation.isPending}
                  onClick={() => enhanceMutation.mutate({ text: formData.content })}
                  className="h-7 text-[10px] font-bold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-500/10 px-2 rounded-lg transition-all"
                >
                  {enhanceMutation.isPending ? <Loader2 size={12} className="animate-spin mr-1" /> : <Wand2 size={12} className="mr-1" />}
                  Melhorar com IA
                </Button>
              </div>
              <Textarea 
                placeholder="Escreva aqui os detalhes do comunicado..." 
                className="min-h-[120px] rounded-2xl bg-muted/30 border-border/40 font-medium resize-none p-4"
                value={formData.content}
                onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
              />
            </div>

            {/* Switch Importante */}
            <div className="flex items-center justify-between bg-muted/20 p-4 rounded-2xl border border-border/40">
              <div className="space-y-0.5">
                <Label className="text-sm font-black text-foreground">Marcar como Importante</Label>
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">Ativa destaque visual e notificações urgentes</p>
              </div>
              <Switch 
                checked={formData.important}
                onCheckedChange={(val) => setFormData(prev => ({ ...prev, important: val }))}
              />
            </div>

            {/* Switch WhatsApp */}
            <div className="flex items-center justify-between bg-emerald-500/10 p-4 rounded-2xl border border-emerald-500/20">
              <div className="space-y-0.5">
                <Label className="text-sm font-black text-emerald-700 dark:text-emerald-400">Enviar também no WhatsApp</Label>
                <p className="text-[10px] text-emerald-600/70 dark:text-emerald-400/70 font-medium uppercase tracking-widest">
                  Dispara a mensagem individualizada para cada aluno selecionado via WhatsApp
                </p>
              </div>
              <Switch 
                checked={formData.sendViaWhatsApp}
                onCheckedChange={(val) => setFormData(prev => ({ ...prev, sendViaWhatsApp: val }))}
              />
            </div>
          </div>

          <DialogFooter className="p-8 pt-0 flex gap-3 shrink-0">
            <Button 
              variant="ghost" 
              onClick={() => setIsModalOpen(false)}
              className="flex-1 h-14 rounded-2xl font-black uppercase tracking-widest hover:bg-muted"
            >
              Cancelar
            </Button>
            <Button 
              onClick={handleCreate}
              disabled={createMutation.isPending}
              className="flex-[2] h-14 rounded-2xl bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest shadow-xl shadow-primary/20"
            >
              {createMutation.isPending ? <Loader2 className="animate-spin" size={20} /> : "Enviar Comunicado"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
