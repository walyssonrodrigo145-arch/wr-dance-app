import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  DoorOpen,
  CheckCircle2,
  Clock,
  Calendar,
  Star,
  Search,
  Plus,
  Pencil,
  MoreVertical,
  Info,
  ArrowRight,
  Users,
  Trash2,
  SlidersHorizontal,
  Upload,
  Image as ImageIcon,
  BarChart3,
  Download,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { downloadBase64File } from "@/utils/downloadReport";
import { FileSpreadsheet } from "lucide-react";

export default function SalasEstudio() {
  const utils = trpc.useUtils();
  const [activeTab, setActiveTab] = useState<"todas" | "calendario">("todas");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("todas");

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<any>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: "",
    category: "Sala de Ensaio",
    capacity: 8,
    equipments: "",
    status: "ativa",
    isPrincipal: false,
    imageUrl: ""
  });

  // Queries
  const { data: dbRooms = [], isLoading } = trpc.studioRooms.list.useQuery();
  const { data: stats } = trpc.studioRooms.stats.useQuery();
  const { data: scheduleData = [] } = trpc.studioRooms.schedule.useQuery(undefined, {
    enabled: activeTab === "calendario" || isReportModalOpen,
  });
  const { data: fullReportData, isLoading: isLoadingReport } = trpc.studioRooms.fullReport.useQuery(undefined, {
    enabled: isReportModalOpen,
  });

  // Report Engine Export Mutation
  const generateReportMutation = trpc.reportEngine.generate.useMutation({
    onSuccess: (res, vars) => {
      downloadBase64File(res.data, vars.format, `relatorio_estudios_${new Date().toISOString().slice(0, 10)}`);
      toast.success(vars.format === 'excel' ? "Planilha Excel gerada com sucesso!" : "Relatório CSV exportado com sucesso!");
    },
    onError: (err) => {
      toast.error(`Erro ao gerar relatório: ${err.message}`);
    }
  });

  const createMutation = trpc.studioRooms.create.useMutation({
    onSuccess: () => {
      toast.success("Sala criada com sucesso!");
      utils.studioRooms.list.invalidate();
      utils.studioRooms.stats.invalidate();
      setIsModalOpen(false);
    },
    onError: (err) => toast.error(err.message || "Erro ao criar sala")
  });

  const updateMutation = trpc.studioRooms.update.useMutation({
    onSuccess: () => {
      toast.success("Sala atualizada com sucesso!");
      utils.studioRooms.list.invalidate();
      utils.studioRooms.stats.invalidate();
      setIsModalOpen(false);
    },
    onError: (err) => toast.error(err.message || "Erro ao atualizar sala")
  });

  const deleteMutation = trpc.studioRooms.delete.useMutation({
    onSuccess: () => {
      toast.success("Sala excluída com sucesso!");
      utils.studioRooms.list.invalidate();
      utils.studioRooms.stats.invalidate();
    },
    onError: (err) => toast.error(err.message || "Erro ao excluir sala")
  });

  // Somente dados reais do banco de dados (Sem dados fictícios)
  const displayRooms = dbRooms.map((r: any) => {
    let eqList: string[] = [];
    if (Array.isArray(r.equipments)) {
      eqList = r.equipments;
    } else if (typeof r.equipments === "string" && r.equipments.trim()) {
      eqList = r.equipments.split(",").map((e: string) => e.trim());
    } else {
      eqList = [];
    }

    return {
      id: r.id,
      name: r.name,
      isPrincipal: r.isPrincipal ?? false,
      category: r.category || "Sala de Ensaio",
      capacity: r.capacity || 8,
      equipments: eqList,
      extraEquipmentsCount: Math.max(0, eqList.length - 3),
      status: r.status || (r.active ? "ativa" : "inativa"),
      utilizationRate: r.utilizationRate || 0,
      imageUrl: r.imageUrl || ""
    };
  });

  // Filter logic
  const filteredRooms = displayRooms.filter((room) => {
    const matchesSearch = room.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      room.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "todas" ? true : room.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleOpenCreateModal = () => {
    setEditingRoom(null);
    setFormData({
      name: "",
      category: "Sala de Ensaio",
      capacity: 8,
      equipments: "",
      status: "ativa",
      isPrincipal: false,
      imageUrl: ""
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (room: any) => {
    setEditingRoom(room);
    setFormData({
      name: room.name,
      category: room.category || "Sala de Ensaio",
      capacity: room.capacity || 8,
      equipments: Array.isArray(room.equipments) ? room.equipments.join(", ") : room.equipments || "",
      status: room.status || "ativa",
      isPrincipal: room.isPrincipal || false,
      imageUrl: room.imageUrl || ""
    });
    setIsModalOpen(true);
  };

  // Upload de Imagem do Gerenciador de Arquivos (Celular / Computador)
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("A imagem selecionada deve ter no máximo 5MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setFormData((prev) => ({ ...prev, imageUrl: base64 }));
      toast.success("Foto selecionada com sucesso!");
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return toast.error("Preencha o nome da sala");

    if (editingRoom) {
      updateMutation.mutate({
        id: editingRoom.id,
        name: formData.name,
        category: formData.category,
        capacity: Number(formData.capacity),
        equipments: formData.equipments,
        status: formData.status,
        isPrincipal: formData.isPrincipal,
        imageUrl: formData.imageUrl
      });
    } else {
      createMutation.mutate({
        name: formData.name,
        category: formData.category,
        capacity: Number(formData.capacity),
        equipments: formData.equipments,
        status: formData.status,
        isPrincipal: formData.isPrincipal,
        imageUrl: formData.imageUrl
      });
    }
  };

  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-[1600px] mx-auto min-h-screen">
      
      {/* ── HEADER DA PÁGINA ────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-pink-500/10 border border-pink-500/20 text-pink-500 flex items-center justify-center shrink-0 shadow-sm">
            <DoorOpen size={24} />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight font-outfit text-foreground">
              Salas de Ensaio & Estúdios de Dança
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground font-medium mt-0.5">
              Organize os espaços, tablados e salas com espelhos da sua escola de dança para vincular a turmas e ensaios sem conflitos.
            </p>
          </div>
        </div>
      </div>

      {/* ── 3 CARDS DE KPIS / MÉTRICAS REAIS ────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        
        {/* Card 1: Total de Salas */}
        <div className="p-5 rounded-2xl bg-card border border-border/60 shadow-sm flex items-center gap-4 relative overflow-hidden group">
          <div className="w-11 h-11 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
            <DoorOpen size={20} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Total de Salas</p>
            <p className="text-2xl font-black font-outfit text-foreground mt-0.5">{stats?.total || 0}</p>
            <p className="text-[10px] text-muted-foreground font-medium mt-0.5">Salas cadastradas</p>
          </div>
        </div>

        {/* Card 2: Ativas */}
        <div className="p-5 rounded-2xl bg-card border border-border/60 shadow-sm flex items-center gap-4 relative overflow-hidden group">
          <div className="w-11 h-11 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
            <CheckCircle2 size={20} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Ativas</p>
            <p className="text-2xl font-black font-outfit text-foreground mt-0.5">{stats?.active || 0}</p>
            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">Salas disponíveis</p>
          </div>
        </div>

        {/* Card 3: Em Manutenção */}
        <div className="p-5 rounded-2xl bg-card border border-border/60 shadow-sm flex items-center gap-4 relative overflow-hidden group">
          <div className="w-11 h-11 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
            <Clock size={20} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Em Manutenção</p>
            <p className="text-2xl font-black font-outfit text-foreground mt-0.5">{stats?.maintenance || 0}</p>
            <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium mt-0.5">Indisponível temporariamente</p>
          </div>
        </div>

      </div>

      {/* ── CONTROLES & NAVEGAÇÃO DE ABAS ────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-2">
        
        {/* Abas Esquerda */}
        <div className="flex items-center gap-6 border-b border-border/60 w-full md:w-auto">
          <button
            onClick={() => setActiveTab("todas")}
            className={cn(
              "pb-3 text-sm font-bold transition-all relative font-outfit",
              activeTab === "todas"
                ? "text-indigo-600 dark:text-indigo-400"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Todas as Salas
            {activeTab === "todas" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-400 rounded-full" />
            )}
          </button>

          <button
            onClick={() => setActiveTab("calendario")}
            className={cn(
              "pb-3 text-sm font-bold transition-all relative font-outfit",
              activeTab === "calendario"
                ? "text-indigo-600 dark:text-indigo-400"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Calendário de Utilização
            {activeTab === "calendario" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-400 rounded-full" />
            )}
          </button>
        </div>

        {/* Controles Direita (Filtro + Busca + Botão Nova Sala) */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          
          {/* Filtro + Busca lado a lado no mobile */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="flex-1 sm:w-[160px] h-10 rounded-xl bg-card border-border/80 text-xs font-semibold">
                <SlidersHorizontal size={14} className="mr-2 text-muted-foreground shrink-0" />
                <SelectValue placeholder="Todas as situações" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as situações</SelectItem>
                <SelectItem value="ativa">Ativa</SelectItem>
                <SelectItem value="manutencao">Em Manutenção</SelectItem>
                <SelectItem value="inativa">Inativa</SelectItem>
              </SelectContent>
            </Select>

            <div className="relative flex-1 sm:w-[200px]">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar sala..."
                className="h-10 pl-9 pr-3 rounded-xl bg-card border-border/80 text-xs w-full"
              />
            </div>
          </div>

          <Button
            onClick={handleOpenCreateModal}
            className="h-10 px-5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold text-xs shadow-md shadow-indigo-600/20 gap-1.5 w-full sm:w-auto"
          >
            <Plus size={16} />
            <span>Nova Sala</span>
          </Button>

        </div>
      </div>


      {/* ── CONTEÚDO DA ABA 1: TODAS AS SALAS ────────────────────────────── */}
      {activeTab === "todas" && (
        <div className="bg-card rounded-2xl border border-border/60 shadow-sm overflow-hidden">
          {filteredRooms.length === 0 ? (
            <div className="p-12 text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center mx-auto">
                <DoorOpen size={32} />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold font-outfit text-foreground">Nenhuma sala encontrada</h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  {dbRooms.length === 0
                    ? "Sua escola ainda não possui salas cadastradas. Clique no botão abaixo para adicionar a primeira sala!"
                    : "Nenhuma sala corresponde aos filtros selecionados."}
                </p>
              </div>
              {dbRooms.length === 0 && (
                <Button
                  onClick={handleOpenCreateModal}
                  className="h-9 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs gap-1.5"
                >
                  <Plus size={15} />
                  <span>Cadastrar Primeira Sala</span>
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* ── MOBILE: Cards (sm e abaixo) ───────────────────────────── */}
              <div className="md:hidden divide-y divide-border/60">
                {filteredRooms.map((room) => (
                  <div key={room.id} className="p-4 space-y-3">
                    {/* Linha 1: Foto + Nome + Status */}
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl overflow-hidden bg-muted shrink-0 border border-border/60 flex items-center justify-center">
                        {room.imageUrl ? (
                          <img src={room.imageUrl} alt={room.name} className="w-full h-full object-cover" />
                        ) : (
                          <DoorOpen size={20} className="text-muted-foreground/60" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-sm text-foreground font-outfit leading-tight">{room.name}</span>
                          {room.isPrincipal && (
                            <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 shrink-0">
                              PRINCIPAL
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground font-medium mt-0.5 truncate">{room.category}</p>
                      </div>
                      {/* Status badge */}
                      {room.status === "ativa" ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          ATIVA
                        </span>
                      ) : room.status === "manutencao" ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                          MANUTENÇÃO
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-1 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                          INATIVA
                        </span>
                      )}
                    </div>

                    {/* Linha 2: Capacidade + Equipamentos */}
                    <div className="flex items-start gap-3 flex-wrap">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-semibold shrink-0">
                        <Users size={13} className="text-muted-foreground/70" />
                        {room.capacity} pessoas
                      </div>
                      {room.equipments.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1">
                          {room.equipments.slice(0, 3).map((eq: string, i: number) => (
                            <Badge key={i} variant="secondary" className="bg-muted text-[10px] font-semibold px-2 py-0.5 rounded-md border border-border/50">
                              {eq}
                            </Badge>
                          ))}
                          {room.extraEquipmentsCount > 0 && (
                            <Badge variant="outline" className="text-[10px] font-bold text-indigo-500 border-indigo-500/30 px-1.5 py-0.5">
                              +{room.extraEquipmentsCount}
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Linha 3: Ações */}
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => handleOpenEditModal(room)}
                        className="flex-1 h-8 rounded-lg border border-border/60 hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5 transition-colors text-xs font-semibold"
                      >
                        <Pencil size={13} /> Editar
                      </button>
                      <button
                        onClick={() => setActiveTab("calendario")}
                        className="flex-1 h-8 rounded-lg border border-border/60 hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5 transition-colors text-xs font-semibold"
                      >
                        <Calendar size={13} /> Calendário
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="w-8 h-8 rounded-lg border border-border/60 hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors shrink-0">
                            <MoreVertical size={14} />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="text-xs w-44">
                          <DropdownMenuItem onClick={() => handleOpenEditModal(room)}>
                            <Pencil size={14} className="mr-2 text-indigo-500" /> Editar Detalhes
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-rose-500 focus:text-rose-500"
                            onClick={() => {
                              if (confirm(`Deseja realmente excluir a ${room.name}?`)) {
                                deleteMutation.mutate({ id: room.id });
                              }
                            }}
                          >
                            <Trash2 size={14} className="mr-2" /> Excluir Sala
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>

              {/* ── DESKTOP: Tabela (md e acima) ─────────────────────────── */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border/60 bg-muted/30 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      <th className="py-4 px-6">SALA</th>
                      <th className="py-4 px-6">CAPACIDADE</th>
                      <th className="py-4 px-6">EQUIPAMENTOS PRINCIPAIS</th>
                      <th className="py-4 px-6">SITUAÇÃO</th>
                      <th className="py-4 px-6 text-right">AÇÕES</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 text-xs">
                    {filteredRooms.map((room) => (
                      <tr key={room.id} className="hover:bg-muted/20 transition-colors group">
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-10 rounded-lg overflow-hidden bg-muted shrink-0 border border-border/60 flex items-center justify-center">
                              {room.imageUrl ? (
                                <img src={room.imageUrl} alt={room.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                              ) : (
                                <DoorOpen size={20} className="text-muted-foreground/60" />
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-sm text-foreground font-outfit">{room.name}</span>
                                {room.isPrincipal && (
                                  <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">• PRINCIPAL</span>
                                )}
                              </div>
                              <p className="text-[11px] text-muted-foreground font-medium mt-0.5">{room.category}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-6 font-semibold text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <Users size={14} className="text-muted-foreground/70" />
                            <span>{room.capacity} pessoas</span>
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {room.equipments.length > 0 ? (
                              <>
                                {room.equipments.slice(0, 3).map((eq: string, i: number) => (
                                  <Badge key={i} variant="secondary" className="bg-muted text-[10px] font-semibold px-2 py-0.5 rounded-md border border-border/50">{eq}</Badge>
                                ))}
                                {room.extraEquipmentsCount > 0 && (
                                  <Badge variant="outline" className="text-[10px] font-bold text-indigo-500 border-indigo-500/30 px-1.5 py-0.5">+{room.extraEquipmentsCount}</Badge>
                                )}
                              </>
                            ) : (
                              <span className="text-muted-foreground/60 text-[11px] italic">Sem equipamentos</span>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          {room.status === "ativa" ? (
                            <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />ATIVA
                            </span>
                          ) : room.status === "manutencao" ? (
                            <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />MANUTENÇÃO
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />INATIVA
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-6 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => handleOpenEditModal(room)} className="w-8 h-8 rounded-lg border border-border/60 hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors" title="Editar Sala">
                              <Pencil size={14} />
                            </button>
                            <button onClick={() => setActiveTab("calendario")} className="w-8 h-8 rounded-lg border border-border/60 hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors" title="Ver Calendário">
                              <Calendar size={14} />
                            </button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button className="w-8 h-8 rounded-lg border border-border/60 hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors">
                                  <MoreVertical size={14} />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="text-xs w-44">
                                <DropdownMenuItem onClick={() => handleOpenEditModal(room)}>
                                  <Pencil size={14} className="mr-2 text-indigo-500" /> Editar Detalhes
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-rose-500 focus:text-rose-500"
                                  onClick={() => { if (confirm(`Deseja realmente excluir a ${room.name}?`)) { deleteMutation.mutate({ id: room.id }); } }}
                                >
                                  <Trash2 size={14} className="mr-2" /> Excluir Sala
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── CONTEÚDO DA ABA 2: CALENDÁRIO DE UTILIZAÇÃO ────────────────── */}
      {activeTab === "calendario" && (
        <div className="bg-card rounded-2xl border border-border/60 p-6 space-y-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/60">
            <div>
              <h3 className="text-lg font-bold font-outfit text-foreground">Grade Horária de Ocupação dos Estúdios</h3>
              <p className="text-xs text-muted-foreground">Visualização integrada para prevenir choques de horários entre professores e bandas.</p>
            </div>
            <Badge variant="outline" className="w-fit text-xs font-semibold px-3 py-1 bg-indigo-500/10 text-indigo-500 border-indigo-500/30">
              {scheduleData.some((r: any) => r.slots?.length > 0)
                ? `${scheduleData.reduce((acc: number, r: any) => acc + (r.slots?.length || 0), 0)} aula(s) hoje`
                : "Sem conflitos detectados hoje"}
            </Badge>
          </div>

          {scheduleData.length === 0 ? (
            <div className="p-12 text-center text-xs text-muted-foreground">
              Nenhuma sala cadastrada para exibição do calendário. Cadastre sua primeira sala na aba "Todas as Salas".
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
              {scheduleData.map((room: any) => (
                <div key={room.id} className="p-4 rounded-xl bg-muted/20 border border-border/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: room.color || "#6366f1" }} />
                      <span className="font-bold text-sm text-foreground font-outfit truncate">{room.name}</span>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500 shrink-0">
                      {room.capacity} pess.
                    </span>
                  </div>
                  
                  <div className="space-y-2 text-xs">
                    {room.slots && room.slots.length > 0 ? (
                      room.slots.map((slot: any, idx: number) => (
                        <div key={idx} className="p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400">
                          <p className="font-bold text-xs">{slot.time}</p>
                          <p className="text-[11px] font-medium text-foreground truncate">{slot.title}</p>
                          <p className="text-[10px] text-muted-foreground truncate">Aluno: {slot.studentName}</p>
                        </div>
                      ))
                    ) : (
                      <div className="p-2.5 rounded-lg bg-muted/40 border border-border/40 text-muted-foreground text-center py-4">
                        <p className="text-[11px] font-medium">Nenhuma aula hoje</p>
                        <p className="text-[10px] text-muted-foreground/70">Horário 100% livre</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── BANNER DICA NO RODAPÉ ──────────────────────────────────────── */}
      <div className="p-4 sm:p-5 rounded-2xl bg-indigo-500/5 border border-indigo-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
            <Info size={18} />
          </div>
          <div>
            <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 font-outfit">Dica</p>
            <p className="text-xs text-muted-foreground font-medium">
              Mantenha suas salas sempre atualizadas para melhor organização das aulas e otimização dos horários.
            </p>
          </div>
        </div>
        <button
          onClick={() => setIsReportModalOpen(true)}
          className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1.5 shrink-0"
        >
          <span>Ver relatório completo</span>
          <ArrowRight size={14} />
        </button>
      </div>

      {/* ── MODAL RELATÓRIO COMPLETO DE OCUPAÇÃO DOS ESTÚDIOS ──────────── */}
      <Dialog open={isReportModalOpen} onOpenChange={setIsReportModalOpen}>
        {/* overflow:hidden no container — o X fica fixo, só o corpo interno rola */}
        <DialogContent className="sm:max-w-[700px] max-h-[85dvh] overflow-hidden flex flex-col p-0 bg-card border-border gap-0">
          {/* Header fixo — nunca rola */}
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/60 shrink-0">
            {/* pr-10 = espaço para o botão X não sobrepor o título */}
            <DialogTitle className="text-lg sm:text-xl font-bold font-outfit flex items-center gap-2 pr-10">
              <BarChart3 className="text-indigo-500 shrink-0" size={20} />
              Relatório de Ocupação & Uso dos Estúdios
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Análise completa de capacidade, taxas de uso e aulas ministradas por sala.
            </DialogDescription>
          </DialogHeader>

          {/* Corpo scrollável — só esta parte rola */}
          <div className="overflow-y-auto flex-1 px-6 py-4">
          {isLoadingReport ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground text-xs">
              <Loader2 className="animate-spin text-indigo-500" size={24} />
              <span>Gerando relatório consolidado...</span>
            </div>
          ) : !fullReportData ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              Não foi possível carregar o relatório no momento.
            </div>
          ) : (
            <div className="space-y-5">
              {/* KPIs Rápidos */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-muted/30 border border-border/50 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold">Total de Salas</p>
                  <p className="text-lg font-bold text-foreground mt-0.5">{fullReportData.summary.totalRooms}</p>
                </div>
                <div className="p-3 rounded-xl bg-muted/30 border border-border/50 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold">Salas Ativas</p>
                  <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{fullReportData.summary.activeRooms}</p>
                </div>
                <div className="p-3 rounded-xl bg-muted/30 border border-border/50 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold">Aulas Realizadas</p>
                  <p className="text-lg font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">{fullReportData.summary.totalLessonsHosted}</p>
                </div>
                <div className="p-3 rounded-xl bg-muted/30 border border-border/50 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold">Aulas Agendadas (Futuras)</p>
                  <p className="text-lg font-bold text-amber-600 dark:text-amber-400 mt-0.5">{fullReportData.summary.totalScheduledLessons ?? 0}</p>
                </div>
              </div>

              {/* Tabela de Salas — scroll horizontal invisível no mobile */}
              <div className="rounded-xl border border-border/60 overflow-x-auto no-scrollbar">
                <table className="w-full min-w-[560px] text-xs text-left">
                  <thead className="bg-muted/50 border-b border-border/60 font-semibold text-muted-foreground">
                    <tr>
                      <th className="py-2.5 px-3">Sala</th>
                      <th className="py-2.5 px-3">Capacidade</th>
                      <th className="py-2.5 px-3">Situação</th>
                      <th className="py-2.5 px-3 text-center">Realizadas</th>
                      <th className="py-2.5 px-3 text-center">Agendadas</th>
                      <th className="py-2.5 px-3 text-right">Ocupação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {fullReportData.rooms.map((r: any) => (
                      <tr key={r.id} className="hover:bg-muted/20">
                        <td className="py-2.5 px-3 font-semibold text-foreground">{r.name}</td>
                        <td className="py-2.5 px-3 text-muted-foreground">{r.capacity} pessoas</td>
                        <td className="py-2.5 px-3">
                          <span className={cn(
                            "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase",
                            r.status === "ativa" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" :
                            r.status === "manutencao" ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" :
                            "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                          )}>
                            {r.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center font-medium">{r.completedLessons}</td>
                        <td className="py-2.5 px-3 text-center font-medium text-amber-600 dark:text-amber-400">{r.scheduledLessons}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-indigo-600 dark:text-indigo-400">
                          {r.utilizationRate}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

            </div>
          )}
          </div>
          {/* Footer fixo — não rola */}
          {fullReportData && (
            <div className="px-6 py-4 border-t border-border/60 shrink-0 flex flex-wrap items-center justify-between gap-2">
              <Button
                variant="outline"
                onClick={() => setIsReportModalOpen(false)}
                className="h-9 px-4 rounded-xl text-xs"
              >
                Fechar
              </Button>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="outline"
                  disabled={generateReportMutation.isPending}
                  onClick={() => {
                    const columns = ["Sala", "Capacidade", "Equipamentos", "Situação", "Aulas Realizadas", "Aulas Agendadas", "Horas Realizadas", "Taxa de Ocupação (%)"];
                    const rows = fullReportData.rooms.map((r: any) => [
                      r.name, `${r.capacity} pessoas`, r.equipments || "Não especificado",
                      r.status.toUpperCase(), r.completedLessons, r.scheduledLessons,
                      `${r.completedHours}h`, r.utilizationRate,
                    ]);
                    generateReportMutation.mutate({ format: "csv", title: "Relatório de Ocupação dos Estúdios", period: "Histórico Consolidado", columns, rows });
                  }}
                  className="h-9 px-3.5 rounded-xl text-xs border-indigo-500/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10 font-bold gap-1.5"
                >
                  {generateReportMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  Exportar CSV
                </Button>
                <Button
                  disabled={generateReportMutation.isPending}
                  onClick={() => {
                    const columns = ["Sala", "Capacidade", "Equipamentos", "Situação", "Aulas Realizadas", "Aulas Agendadas", "Horas Realizadas", "Taxa de Ocupação (%)"];
                    const rows = fullReportData.rooms.map((r: any) => [
                      r.name, `${r.capacity} pessoas`, r.equipments || "Não especificado",
                      r.status.toUpperCase(), r.completedLessons, r.scheduledLessons,
                      r.completedHours, r.utilizationRate,
                    ]);
                    generateReportMutation.mutate({ format: "excel", title: "Relatório de Ocupação e Utilização dos Estúdios", period: "Histórico Consolidado", columns, rows, includeAiInsights: true });
                  }}
                  className="h-9 px-4 rounded-xl text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold gap-1.5 shadow-sm"
                >
                  {generateReportMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
                  Exportar Excel (.xlsx)
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── MODAL DE CRIAR / EDITAR SALA (SELEÇÃO DE ARQUIVO DO DISPOSITIVO) ── */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[500px] bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold font-outfit">
              {editingRoom ? "Editar Sala de Ensaio" : "Cadastrar Nova Sala"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Insira os detalhes técnicos da sala para disponibilizá-la no agendamento de aulas.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmitForm} className="space-y-4 py-2">
            
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground">Nome da Sala *</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ex: Sala 1, Estúdio Principal"
                className="h-10 rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">Categoria</label>
                <Select
                  value={formData.category}
                  onValueChange={(val) => setFormData({ ...formData, category: val })}
                >
                  <SelectTrigger className="h-10 rounded-xl">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Sala com Espelho & Barra">Sala com Espelho & Barra</SelectItem>
                    <SelectItem value="Sala de Tablado / Salão">Sala de Tablado / Salão</SelectItem>
                    <SelectItem value="Sala de Danças Urbanas">Sala de Danças Urbanas</SelectItem>
                    <SelectItem value="Sala Multiuso Dança">Sala Multiuso Dança</SelectItem>
                    <SelectItem value="Estúdio de Gravação / Coreografia">Estúdio de Gravação / Coreografia</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">Capacidade (Pessoas)</label>
                <Input
                  type="number"
                  value={formData.capacity}
                  onChange={(e) => setFormData({ ...formData, capacity: Number(e.target.value) })}
                  className="h-10 rounded-xl"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground">Equipamentos Principais (Separados por vírgula)</label>
              <Input
                value={formData.equipments}
                onChange={(e) => setFormData({ ...formData, equipments: e.target.value })}
                placeholder="Tablado, Espelhos, Barras, Ar Condicionado"
                className="h-10 rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">Situação</label>
                <Select
                  value={formData.status}
                  onValueChange={(val) => setFormData({ ...formData, status: val })}
                >
                  <SelectTrigger className="h-10 rounded-xl">
                    <SelectValue placeholder="Situação" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativa">Ativa</SelectItem>
                    <SelectItem value="manutencao">Em Manutenção</SelectItem>
                    <SelectItem value="inativa">Inativa</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* SELEÇÃO DE FOTO DO GERENCIADOR DE ARQUIVOS DO DISPOSITIVO */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">Foto da Sala</label>
                <div className="flex items-center gap-2">
                  {formData.imageUrl ? (
                    <div className="relative w-12 h-10 rounded-xl overflow-hidden border border-border shrink-0 group">
                      <img src={formData.imageUrl} alt="Preview da Sala" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, imageUrl: "" }))}
                        className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[10px] text-white font-bold transition-opacity"
                      >
                        Remover
                      </button>
                    </div>
                  ) : (
                    <div className="w-12 h-10 rounded-xl bg-muted border border-dashed border-border/80 flex items-center justify-center text-muted-foreground shrink-0">
                      <ImageIcon size={18} />
                    </div>
                  )}

                  <label className="flex-1 cursor-pointer">
                    <div className="h-10 px-3 rounded-xl border border-border/80 bg-card hover:bg-muted/50 flex items-center justify-center gap-1.5 text-xs font-semibold text-foreground transition-colors truncate">
                      <Upload size={14} className="text-indigo-500 shrink-0" />
                      <span className="truncate">{formData.imageUrl ? "Alterar foto..." : "Selecionar foto..."}</span>
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageSelect}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </div>

            <DialogFooter className="pt-3">
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)} className="rounded-xl h-10">
                Cancelar
              </Button>
              <Button type="submit" className="rounded-xl h-10 bg-indigo-600 hover:bg-indigo-700 text-white font-bold">
                {editingRoom ? "Salvar Alterações" : "Cadastrar Sala"}
              </Button>
            </DialogFooter>

          </form>
        </DialogContent>
      </Dialog>

    </div>
  );
}
