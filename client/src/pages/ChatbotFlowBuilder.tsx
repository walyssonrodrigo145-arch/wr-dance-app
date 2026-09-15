import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot,
  Sparkles,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  Save,
  RotateCcw,
  MessageSquare,
  Smartphone,
  CheckCircle2,
  Calendar,
  DollarSign,
  Clock,
  RefreshCw,
  Gift,
  BookOpen,
  User,
  XCircle,
  HelpCircle,
  Play,
  Send,
  CornerDownLeft,
  ChevronRight,
  Settings2,
  Info,
  Sliders,
  Check,
  AlertTriangle,
  Lightbulb,
  Brain,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

// ─── Interfaces ───────────────────────────────────────────────────────────────
export interface ChatbotOptionItem {
  id: string;
  order: number;
  digit: string;
  title: string;
  icon?: string;
  actionType: "system_action" | "text_reply" | "human_transfer" | "close_chat";
  systemAction?:
    | "minhas_aulas"
    | "financeiro"
    | "agendar_aula"
    | "reagendar_aula"
    | "indicar_amigo"
    | "matricula_link";
  customReply?: string;
  isActive: boolean;
}

export interface ChatbotFlowState {
  id?: number;
  flowType: "aluno" | "lead";
  name?: string;
  welcomeMessage: string;
  fallbackMessage: string;
  humanMessage: string;
  exitMessage: string;
  options: ChatbotOptionItem[];
  isActive: number;
}

const SYSTEM_ACTIONS: {
  value: NonNullable<ChatbotOptionItem["systemAction"]>;
  label: string;
  icon: any;
  desc: string;
}[] = [
  {
    value: "minhas_aulas",
    label: "Minhas Próximas Aulas",
    icon: Calendar,
    desc: "Consulta a agenda do aluno e lista as próximas aulas com data e hora.",
  },
  {
    value: "financeiro",
    label: "Financeiro & Mensalidades",
    icon: DollarSign,
    desc: "Informa mensalidades em aberto, link de pagamento e chave PIX.",
  },
  {
    value: "agendar_aula",
    label: "Agendar Nova Aula",
    icon: Clock,
    desc: "Oferece os horários livres da escola nos próximos dias para marcação.",
  },
  {
    value: "reagendar_aula",
    label: "Reagendar Aula Existente",
    icon: RefreshCw,
    desc: "Lista as aulas futuras do aluno e permite escolher um novo horário.",
  },
  {
    value: "indicar_amigo",
    label: "Indicar Amigo (Com Cupom)",
    icon: Gift,
    desc: "Coleta indicação de amigo e envia link promocional com desconto.",
  },
  {
    value: "matricula_link",
    label: "Link / Formulário de Matrícula",
    icon: BookOpen,
    desc: "Envia o link oficial da página de matrículas online da escola.",
  },
];

const VARIABLE_TAGS = [
  { tag: "{nome_aluno}", label: "Nome do Aluno" },
  { tag: "{primeiro_nome}", label: "1º Nome" },
  { tag: "{nome_escola}", label: "Nome da Escola" },
  { tag: "{link_matricula}", label: "Link Matrícula" },
  { tag: "{link_portal}", label: "Portal do Aluno" },
  { tag: "{telefone}", label: "Telefone Escola" },
];

export default function ChatbotFlowBuilder() {
  const utils = trpc.useUtils();
  const [activeTab, setActiveTab] = useState<"aluno" | "lead">("aluno");

  const [alunoFlow, setAlunoFlow] = useState<ChatbotFlowState | null>(null);
  const [leadFlow, setLeadFlow] = useState<ChatbotFlowState | null>(null);

  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [expandedOptionId, setExpandedOptionId] = useState<string | null>(null);

  // Simulador
  const [simInput, setSimInput] = useState("");
  const [simMessages, setSimMessages] = useState<
    { sender: "bot" | "user"; text: string; time: string }[]
  >([]);
  const [simCurrentState, setSimCurrentState] = useState("START");
  const simChatEndRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = trpc.chatbotFlow.getFlows.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (data) {
      setAlunoFlow(data.alunoFlow as any);
      setLeadFlow(data.leadFlow as any);
    }
  }, [data]);

  const currentFlow = activeTab === "aluno" ? alunoFlow : leadFlow;
  const setCurrentFlow = (updater: (prev: ChatbotFlowState) => ChatbotFlowState) => {
    if (activeTab === "aluno") {
      setAlunoFlow((prev) => (prev ? updater(prev) : prev));
    } else {
      setLeadFlow((prev) => (prev ? updater(prev) : prev));
    }
  };

  const saveMutation = trpc.chatbotFlow.saveFlow.useMutation({
    onSuccess: (res) => {
      toast.success(res.message || "Fluxo salvo com sucesso! 🚀");
      utils.chatbotFlow.getFlows.invalidate();
    },
    onError: (err) => {
      toast.error("Erro ao salvar fluxo: " + err.message);
    },
  });

  const resetMutation = trpc.chatbotFlow.resetDefaultFlow.useMutation({
    onSuccess: (res) => {
      toast.success(res.message);
      if (activeTab === "aluno") {
        setAlunoFlow(res.flow as any);
      } else {
        setLeadFlow(res.flow as any);
      }
      setResetModalOpen(false);
      utils.chatbotFlow.getFlows.invalidate();
      initSimulation();
    },
    onError: (err) => {
      toast.error("Erro ao restaurar: " + err.message);
    },
  });

  const simulateMutation = trpc.chatbotFlow.simulate.useMutation({
    onSuccess: (res) => {
      setSimCurrentState(res.nextState);
      setSimMessages((prev) => [
        ...prev,
        {
          sender: "bot",
          text: res.reply,
          time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    },
  });

  // Inicializa chat de simulação
  const initSimulation = () => {
    if (!currentFlow) return;
    setSimMessages([]);
    setSimCurrentState("START");
    simulateMutation.mutate({
      flowType: activeTab,
      input: "MENU",
      currentState: "START",
      flowData: currentFlow as any,
    });
  };

  useEffect(() => {
    if (currentFlow) {
      initSimulation();
    }
  }, [activeTab]);

  useEffect(() => {
    simChatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [simMessages]);

  const handleSendSim = (textToSend?: string) => {
    const text = (textToSend || simInput).trim();
    if (!text || !currentFlow) return;

    setSimMessages((prev) => [
      ...prev,
      {
        sender: "user",
        text,
        time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
    setSimInput("");

    simulateMutation.mutate({
      flowType: activeTab,
      input: text,
      currentState: simCurrentState,
      flowData: currentFlow as any,
    });
  };

  // Funções de manipulação das opções
  const handleMoveOption = (index: number, direction: "up" | "down") => {
    if (!currentFlow) return;
    const options = [...currentFlow.options];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= options.length) return;

    const temp = options[index];
    options[index] = options[targetIndex];
    options[targetIndex] = temp;

    // Recalcula order
    options.forEach((opt, i) => {
      opt.order = i + 1;
    });

    setCurrentFlow((prev) => ({ ...prev, options }));
  };

  const handleAddOption = () => {
    if (!currentFlow) return;
    const nextOrder = currentFlow.options.length + 1;
    const newOpt: ChatbotOptionItem = {
      id: `opt-${Date.now()}`,
      order: nextOrder,
      digit: String(nextOrder),
      title: `Nova Opção ${nextOrder}`,
      actionType: "text_reply",
      customReply: "Olá! Como posso te ajudar com essa opção? Digite *MENU* para voltar.",
      isActive: true,
    };
    setCurrentFlow((prev) => ({ ...prev, options: [...prev.options, newOpt] }));
    setExpandedOptionId(newOpt.id);
  };

  const handleRemoveOption = (id: string) => {
    if (!currentFlow) return;
    const options = currentFlow.options.filter((o) => o.id !== id);
    options.forEach((opt, i) => {
      opt.order = i + 1;
    });
    setCurrentFlow((prev) => ({ ...prev, options }));
  };

  const handleUpdateOption = (id: string, updates: Partial<ChatbotOptionItem>) => {
    if (!currentFlow) return;
    const options = currentFlow.options.map((opt) => (opt.id === id ? { ...opt, ...updates } : opt));
    setCurrentFlow((prev) => ({ ...prev, options }));
  };

  const insertTagToTextarea = (
    field: "welcomeMessage" | "fallbackMessage" | "humanMessage" | "exitMessage",
    tag: string
  ) => {
    if (!currentFlow) return;
    setCurrentFlow((prev) => ({
      ...prev,
      [field]: prev[field] + " " + tag,
    }));
  };

  const handleSave = () => {
    if (!currentFlow) return;
    saveMutation.mutate(currentFlow as any);
  };

  if (isLoading || !currentFlow) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Bot size={40} className="text-primary animate-bounce" />
        <p className="text-sm font-semibold text-muted-foreground">
          Carregando Construtor de Fluxos do WhatsApp...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 max-w-7xl mx-auto">
      {/* ─── Header Principal ─── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-emerald-950/20 via-card to-card p-6 rounded-3xl border border-border shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
            <Bot size={30} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-foreground tracking-tight">
                Construtor do Robô WhatsApp
              </h1>
              <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 font-bold">
                100% Personalizável
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium mt-1">
              Defina os menus, altere ordens, crie respostas em texto ou ative automações inteligentes.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => window.location.href = "/base-conhecimento-ia"}
            className="rounded-2xl h-11 px-4 gap-2 text-xs font-bold border-purple-500/30 text-purple-600 dark:text-purple-400 bg-purple-500/5 hover:bg-purple-500/10"
          >
            <Brain size={16} /> Cérebro da IA (FAQ)
          </Button>

          <Button
            variant="outline"
            onClick={() => setResetModalOpen(true)}
            className="rounded-2xl h-11 px-4 gap-2 text-xs font-bold border-border hover:bg-muted"
          >
            <RotateCcw size={15} /> Restaurar Padrão
          </Button>

          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="rounded-2xl h-11 px-6 gap-2 text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/20"
          >
            <Save size={16} />
            {saveMutation.isPending ? "Salvando..." : "Salvar Alterações"}
          </Button>
        </div>
      </div>

      {/* ─── Seletor de Perfil (Alunos vs Novos Leads) ─── */}
      <div className="flex items-center gap-2 p-1.5 bg-muted/60 rounded-2xl border border-border/80 max-w-md">
        <button
          onClick={() => setActiveTab("aluno")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-extrabold transition-all",
            activeTab === "aluno"
              ? "bg-card text-foreground shadow-sm border border-border"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <User size={15} className={activeTab === "aluno" ? "text-emerald-500" : ""} />
          Fluxo para Alunos
        </button>

        <button
          onClick={() => setActiveTab("lead")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-extrabold transition-all",
            activeTab === "lead"
              ? "bg-card text-foreground shadow-sm border border-border"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Sparkles size={15} className={activeTab === "lead" ? "text-amber-500" : ""} />
          Fluxo para Visitantes (Leads)
        </button>
      </div>

      {/* ─── Grid Principal: Editor (Esquerda) + Simulador (Direita) ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* COLUNA ESQUERDA: EDITOR DO FLUXO (7 Colunas) */}
        <div className="lg:col-span-7 space-y-6">
          {/* 1. Mensagem de Boas-Vindas */}
          <div className="bg-card rounded-3xl p-6 border border-border shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 font-black text-xs">
                  1
                </div>
                <h2 className="text-sm font-black text-foreground">Mensagem de Boas-Vindas (Cabeçalho do Menu)</h2>
              </div>
              <Badge variant="outline" className="text-[10px] font-bold">
                Exibida ao digitar MENU
              </Badge>
            </div>

            <Textarea
              rows={3}
              value={currentFlow.welcomeMessage}
              onChange={(e) =>
                setCurrentFlow((prev) => ({ ...prev, welcomeMessage: e.target.value }))
              }
              placeholder="Digite a mensagem de boas-vindas..."
              className="rounded-2xl border-border bg-background resize-none text-xs font-medium leading-relaxed"
            />

            {/* Chips de Tags */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                Inserir Variáveis Automáticas:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {VARIABLE_TAGS.map((v) => (
                  <button
                    key={v.tag}
                    type="button"
                    onClick={() => insertTagToTextarea("welcomeMessage", v.tag)}
                    className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-muted hover:bg-emerald-500/15 hover:text-emerald-600 border border-border text-foreground transition-all"
                  >
                    + {v.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 2. Lista de Opções Interativas do Menu */}
          <div className="bg-card rounded-3xl p-6 border border-border shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 font-black text-xs">
                  2
                </div>
                <div>
                  <h2 className="text-sm font-black text-foreground">Opções do Menu Principal</h2>
                  <p className="text-[11px] text-muted-foreground">
                    Reordene, edite os números, personalize respostas ou vincule automações.
                  </p>
                </div>
              </div>

              <Button
                onClick={handleAddOption}
                size="sm"
                className="rounded-xl h-9 px-3 gap-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
              >
                <Plus size={14} /> Adicionar Opção
              </Button>
            </div>

            {/* Lista das Opções */}
            <div className="space-y-3 pt-2">
              <AnimatePresence>
                {currentFlow.options.map((opt, index) => {
                  const isExpanded = expandedOptionId === opt.id;
                  const isFirst = index === 0;
                  const isLast = index === currentFlow.options.length - 1;

                  return (
                    <motion.div
                      key={opt.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className={cn(
                        "rounded-2xl border transition-all duration-200 overflow-hidden",
                        opt.isActive
                          ? "bg-card border-border shadow-sm hover:border-emerald-500/40"
                          : "bg-muted/40 border-border/60 opacity-60"
                      )}
                    >
                      {/* Linha Resumo da Opção */}
                      <div className="p-3.5 flex items-center justify-between gap-3">
                        {/* Controles de Ordem */}
                        <div className="flex items-center gap-1">
                          <button
                            disabled={isFirst}
                            onClick={() => handleMoveOption(index, "up")}
                            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground disabled:opacity-30 transition-all"
                            title="Subir opção"
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            disabled={isLast}
                            onClick={() => handleMoveOption(index, "down")}
                            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground disabled:opacity-30 transition-all"
                            title="Descer opção"
                          >
                            <ArrowDown size={14} />
                          </button>
                        </div>

                        {/* Dígito / Número da Opção */}
                        <div className="w-10">
                          <Input
                            value={opt.digit}
                            onChange={(e) =>
                              handleUpdateOption(opt.id, { digit: e.target.value.trim() })
                            }
                            className="h-8 text-center text-xs font-black rounded-lg border-border bg-background px-1"
                            title="Número / Dígito"
                          />
                        </div>

                        {/* Título da Opção */}
                        <div className="flex-1 min-w-0">
                          <Input
                            value={opt.title}
                            onChange={(e) => handleUpdateOption(opt.id, { title: e.target.value })}
                            className="h-8 text-xs font-bold rounded-lg border-border bg-background"
                            placeholder="Título da opção..."
                          />
                        </div>

                        {/* Tag do Tipo de Ação */}
                        <div className="hidden sm:block">
                          {opt.actionType === "system_action" && (
                            <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 text-[10px] font-extrabold">
                              ⚡ Sistema
                            </Badge>
                          )}
                          {opt.actionType === "text_reply" && (
                            <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px] font-extrabold">
                              💬 Texto
                            </Badge>
                          )}
                          {opt.actionType === "human_transfer" && (
                            <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 text-[10px] font-extrabold">
                              👤 Humano
                            </Badge>
                          )}
                          {opt.actionType === "close_chat" && (
                            <Badge className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 text-[10px] font-extrabold">
                              🚪 Encerrar
                            </Badge>
                          )}
                        </div>

                        {/* Switch Ativo / Inativo */}
                        <Switch
                          checked={opt.isActive}
                          onCheckedChange={(checked) =>
                            handleUpdateOption(opt.id, { isActive: checked })
                          }
                          title={opt.isActive ? "Opção Ativa" : "Opção Desativada"}
                        />

                        {/* Expandir Configurações Detalhadas */}
                        <button
                          onClick={() => setExpandedOptionId(isExpanded ? null : opt.id)}
                          className={cn(
                            "p-1.5 rounded-lg border border-border hover:bg-muted text-muted-foreground transition-all",
                            isExpanded && "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                          )}
                          title="Editar detalhes"
                        >
                          <Sliders size={14} />
                        </button>

                        {/* Excluir */}
                        <button
                          onClick={() => handleRemoveOption(opt.id)}
                          className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-all"
                          title="Excluir opção"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      {/* Painel de Edição Expandido */}
                      {isExpanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="p-4 bg-muted/30 border-t border-border space-y-4 text-xs"
                        >
                          <div>
                            <label className="font-bold text-foreground block mb-1.5">
                              Tipo de Ação desta Opção:
                            </label>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                              {[
                                { id: "text_reply", label: "💬 Resposta em Texto" },
                                { id: "system_action", label: "⚡ Ação do Sistema" },
                                { id: "human_transfer", label: "👤 Atendente Humano" },
                                { id: "close_chat", label: "🚪 Encerrar Conversa" },
                              ].map((t) => (
                                <button
                                  key={t.id}
                                  type="button"
                                  onClick={() =>
                                    handleUpdateOption(opt.id, { actionType: t.id as any })
                                  }
                                  className={cn(
                                    "p-2 rounded-xl font-bold border text-center transition-all",
                                    opt.actionType === t.id
                                      ? "bg-card border-emerald-500 text-emerald-600 shadow-sm"
                                      : "bg-background border-border text-muted-foreground hover:text-foreground"
                                  )}
                                >
                                  {t.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Se for Ação do Sistema */}
                          {opt.actionType === "system_action" && (
                            <div className="space-y-2">
                              <label className="font-bold text-foreground block">
                                Escolha a Automação do Sistema:
                              </label>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {SYSTEM_ACTIONS.map((sa) => {
                                  const Icon = sa.icon;
                                  const isSelected = opt.systemAction === sa.value;
                                  return (
                                    <div
                                      key={sa.value}
                                      onClick={() =>
                                        handleUpdateOption(opt.id, { systemAction: sa.value })
                                      }
                                      className={cn(
                                        "p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-2.5",
                                        isSelected
                                          ? "bg-emerald-500/10 border-emerald-500 text-foreground"
                                          : "bg-card border-border hover:border-border/80 text-muted-foreground"
                                      )}
                                    >
                                      <Icon
                                        size={16}
                                        className={isSelected ? "text-emerald-500" : "text-muted-foreground"}
                                      />
                                      <div>
                                        <p className="font-bold text-xs text-foreground">{sa.label}</p>
                                        <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                                          {sa.desc}
                                        </p>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Se for Resposta em Texto ou Matrícula customizada */}
                          {(opt.actionType === "text_reply" ||
                            (opt.actionType === "system_action" &&
                              opt.systemAction === "matricula_link")) && (
                            <div className="space-y-1.5">
                              <label className="font-bold text-foreground block">
                                Mensagem que o robô responderá ao aluno:
                              </label>
                              <Textarea
                                rows={3}
                                value={opt.customReply || ""}
                                onChange={(e) =>
                                  handleUpdateOption(opt.id, { customReply: e.target.value })
                                }
                                placeholder="Digite o texto que o WhatsApp responderá automaticamente..."
                                className="rounded-xl border-border bg-background text-xs"
                              />
                            </div>
                          )}
                        </motion.div>
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>

          {/* 3. Mensagens de Rodapé do Fluxo */}
          <div className="bg-card rounded-3xl p-6 border border-border shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 font-black text-xs">
                3
              </div>
              <h2 className="text-sm font-black text-foreground">Mensagens Complementares do Fluxo</h2>
            </div>

            <div className="space-y-4">
              {/* Fallback */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <AlertTriangle size={13} className="text-amber-500" />
                  Opção Inválida (Quando o usuário digita algo fora do menu)
                </label>
                <Textarea
                  rows={2}
                  value={currentFlow.fallbackMessage}
                  onChange={(e) =>
                    setCurrentFlow((prev) => ({ ...prev, fallbackMessage: e.target.value }))
                  }
                  className="rounded-xl border-border bg-background text-xs resize-none"
                />
              </div>

              {/* Transferência para Atendente */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <User size={13} className="text-blue-500" />
                  Transferência para Atendimento Humano
                </label>
                <Textarea
                  rows={2}
                  value={currentFlow.humanMessage}
                  onChange={(e) =>
                    setCurrentFlow((prev) => ({ ...prev, humanMessage: e.target.value }))
                  }
                  className="rounded-xl border-border bg-background text-xs resize-none"
                />
              </div>

              {/* Encerramento */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <XCircle size={13} className="text-rose-500" />
                  Encerramento de Conversa
                </label>
                <Textarea
                  rows={2}
                  value={currentFlow.exitMessage}
                  onChange={(e) =>
                    setCurrentFlow((prev) => ({ ...prev, exitMessage: e.target.value }))
                  }
                  className="rounded-xl border-border bg-background text-xs resize-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* COLUNA DIREITA: SIMULADOR INTERATIVO DO WHATSAPP (5 Colunas) */}
        <div className="lg:col-span-5 sticky top-24 space-y-4">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2">
              <Smartphone size={16} className="text-emerald-500" />
              <span className="text-xs font-black uppercase tracking-wider text-foreground">
                Simulador WhatsApp ao Vivo
              </span>
            </div>
            <button
              onClick={initSimulation}
              className="text-[11px] font-bold text-emerald-600 hover:text-emerald-500 flex items-center gap-1"
            >
              <RotateCcw size={12} /> Reiniciar Teste
            </button>
          </div>

          {/* Smartphone Frame Mockup */}
          <div className="w-full max-w-[380px] mx-auto rounded-[2.5rem] bg-[#111b21] p-3 border-[6px] border-[#222e35] shadow-2xl overflow-hidden flex flex-col h-[600px]">
            {/* Header do WhatsApp */}
            <div className="bg-[#202c33] px-3.5 py-3 rounded-t-[1.8rem] flex items-center justify-between text-white border-b border-[#2a3942]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-emerald-600 flex items-center justify-center text-white font-bold text-sm shadow-sm">
                  🎵
                </div>
                <div>
                  <p className="text-xs font-bold leading-tight">WR MusicPro Robô</p>
                  <p className="text-[10px] text-emerald-400 font-medium">online • autoatendimento</p>
                </div>
              </div>
              <Badge className="bg-emerald-500/20 text-emerald-400 border-none text-[9px]">
                {activeTab === "aluno" ? "Aluno" : "Lead"}
              </Badge>
            </div>

            {/* Área de Mensagens */}
            <div className="flex-1 p-3 overflow-y-auto space-y-2.5 bg-[#0b141a] text-xs">
              {simMessages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0.95, y: 5 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  className={cn(
                    "flex flex-col max-w-[85%]",
                    msg.sender === "user" ? "ml-auto items-end" : "mr-auto items-start"
                  )}
                >
                  <div
                    className={cn(
                      "p-3 rounded-2xl whitespace-pre-wrap leading-relaxed shadow-sm font-sans",
                      msg.sender === "user"
                        ? "bg-[#005c4b] text-white rounded-tr-none"
                        : "bg-[#202c33] text-gray-100 rounded-tl-none border border-[#2a3942]"
                    )}
                  >
                    {msg.text}
                    <div className="flex items-center justify-end gap-1 mt-1 text-[9px] text-gray-400">
                      <span>{msg.time}</span>
                      {msg.sender === "user" && <Check size={10} className="text-emerald-400" />}
                    </div>
                  </div>
                </motion.div>
              ))}

              {simulateMutation.isPending && (
                <div className="flex items-center gap-1.5 text-gray-400 text-[10px] p-2 bg-[#202c33] rounded-xl w-fit">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>digitando...</span>
                </div>
              )}
              <div ref={simChatEndRef} />
            </div>

            {/* Atalhos Rápidos */}
            <div className="p-2 bg-[#202c33]/70 border-t border-[#2a3942] flex items-center gap-1.5 overflow-x-auto text-[10px]">
              <button
                type="button"
                onClick={() => handleSendSim("MENU")}
                className="px-2.5 py-1 rounded-full bg-[#111b21] hover:bg-emerald-600 text-gray-200 hover:text-white font-bold transition-all flex-shrink-0"
              >
                MENU
              </button>
              {currentFlow.options
                .filter((o) => o.isActive)
                .map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => handleSendSim(o.digit)}
                    className="px-2.5 py-1 rounded-full bg-[#111b21] hover:bg-emerald-600 text-gray-200 hover:text-white font-bold transition-all flex-shrink-0"
                  >
                    Opção {o.digit}
                  </button>
                ))}
            </div>

            {/* Input de Mensagem */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendSim();
              }}
              className="p-2 bg-[#202c33] rounded-b-[1.8rem] flex items-center gap-2"
            >
              <input
                type="text"
                value={simInput}
                onChange={(e) => setSimInput(e.target.value)}
                placeholder="Digite uma opção ou mensagem..."
                className="flex-1 bg-[#2a3942] text-white text-xs px-3 py-2 rounded-xl outline-none placeholder-gray-400"
              />
              <button
                type="submit"
                disabled={!simInput.trim() || simulateMutation.isPending}
                className="w-8 h-8 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white flex items-center justify-center transition-all"
              >
                <Send size={13} />
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Modal de Confirmação para Restaurar Padrão */}
      <Dialog open={resetModalOpen} onOpenChange={setResetModalOpen}>
        <DialogContent className="sm:max-w-[420px] rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-black flex items-center gap-2">
              <RotateCcw size={18} className="text-amber-500" />
              Restaurar Fluxo Padrão?
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground pt-1">
              Esta ação irá resetar todas as opções personalizadas e mensagens do fluxo de{" "}
              <strong>{activeTab === "aluno" ? "Alunos" : "Visitantes"}</strong> para o modelo original
              recomendado pela plataforma.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0 pt-4">
            <Button
              variant="outline"
              onClick={() => setResetModalOpen(false)}
              className="rounded-xl text-xs"
            >
              Cancelar
            </Button>
            <Button
              onClick={() => resetMutation.mutate({ flowType: activeTab })}
              disabled={resetMutation.isPending}
              className="rounded-xl text-xs bg-amber-600 hover:bg-amber-700 text-white font-bold"
            >
              {resetMutation.isPending ? "Restaurando..." : "Sim, Restaurar Padrão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
