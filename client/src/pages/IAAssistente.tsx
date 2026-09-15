import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { AIChatBox, Message } from "@/components/AIChatBox";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sparkles, MessageSquare, Plus, Trash2, Loader2, BrainCircuit,
  DollarSign, Users, Calendar, ArrowLeft, AlertTriangle, Clock,
  CheckCircle2, Bot, Zap, TrendingUp, BookOpen, Star,
  HelpCircle, XCircle, ShieldCheck
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function formatTimeLeft(isoDate: string): string {
  const diff = new Date(isoDate).getTime() - Date.now();
  if (diff <= 0) return "em breve";
  const totalMinutes = Math.ceil(diff / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes > 0 ? `${minutes}min` : ""}`.trim();
  return `${minutes}min`;
}

export default function IAAssistente() {
  const utils = trpc.useUtils();
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [timeLeftStr, setTimeLeftStr] = useState("");
  const [showHelp, setShowHelp] = useState(false);

  const { data: conversations = [], isLoading: isLoadingConversations } = trpc.ai.listConversations.useQuery();
  const { data: dbMessages, isLoading: isLoadingMessages } = trpc.ai.getMessages.useQuery(
    { conversationId: activeConversationId! },
    { enabled: !!activeConversationId }
  );
  const { data: usageStats, refetch: refetchUsage } = trpc.ai.getUsageStats.useQuery(undefined, {
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (!usageStats?.cooldownUntil) { setCooldownSeconds(0); return; }
    const update = () => {
      const diff = Math.ceil((new Date(usageStats.cooldownUntil!).getTime() - Date.now()) / 1000);
      setCooldownSeconds(Math.max(0, diff));
    };
    update();
    const interval = setInterval(update, 500);
    return () => clearInterval(interval);
  }, [usageStats?.cooldownUntil]);

  useEffect(() => {
    if (!usageStats?.resetsAt) { setTimeLeftStr(""); return; }
    const update = () => setTimeLeftStr(formatTimeLeft(usageStats.resetsAt!));
    update();
    const interval = setInterval(update, 10000);
    return () => clearInterval(interval);
  }, [usageStats?.resetsAt]);

  const newConvMutation = trpc.ai.newConversation.useMutation({
    onSuccess: (data) => {
      utils.ai.listConversations.invalidate();
      setActiveConversationId(data.id);
      setMessages([]);
    },
    onError: (e) => toast.error(`Erro ao criar conversa: ${e.message}`),
  });

  const chatMutation = trpc.ai.chat.useMutation({
    onSuccess: (data) => {
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply, createdAt: new Date() }]);
      utils.ai.listConversations.invalidate();
      refetchUsage();
    },
    onError: (e) => {
      setMessages((prev) => prev.slice(0, -1));
      toast.error(e.message, { duration: 6000 });
      refetchUsage();
    },
  });

  const deleteConvMutation = trpc.ai.deleteConversation.useMutation({
    onSuccess: () => {
      toast.success("Conversa excluída");
      utils.ai.listConversations.invalidate();
      if (activeConversationId) { setActiveConversationId(null); setMessages([]); }
    },
    onError: (e) => toast.error(`Erro ao excluir: ${e.message}`),
  });

  useEffect(() => {
    if (dbMessages) {
      setMessages(dbMessages.map((m: any) => ({ role: m.role, content: m.content, createdAt: m.createdAt })));
    }
  }, [dbMessages]);

  const isBlocked = false;
  const isInCooldown = cooldownSeconds > 0;

  const handleSendMessage = (content: string) => {
    if (!activeConversationId) return;
    if (isBlocked) { toast.error(`Limite diário atingido. Libera em ${timeLeftStr}.`, { duration: 5000 }); return; }
    if (isInCooldown) { toast.error(`Aguarde ${cooldownSeconds}s antes de enviar outra consulta.`, { duration: 3000 }); return; }
    setMessages((prev) => [...prev, { role: "user", content, createdAt: new Date() }]);
    chatMutation.mutate({ conversationId: activeConversationId, message: content });
  };

  const handleCreateConversation = (initialPrompt?: string) => {
    if (newConvMutation.isPending) return;
    if (initialPrompt) {
      newConvMutation.mutate(
        { title: "Nova Conversa" },
        {
          onSuccess: (data) => {
            setActiveConversationId(data.id);
            setMessages([{ role: "user", content: initialPrompt }]);
            chatMutation.mutate({ conversationId: data.id, message: initialPrompt });
          }
        }
      );
    } else {
      newConvMutation.mutate({ title: "Nova Conversa" });
    }
  };

  const suggestions = [
    { icon: DollarSign, text: "Gerar relatório financeiro do mês", color: "from-emerald-500/20 to-emerald-600/10", iconColor: "text-emerald-600 dark:text-emerald-400" },
    { icon: Users, text: "Resumo dos meus alunos ativos", color: "from-blue-500/20 to-blue-600/10", iconColor: "text-blue-600 dark:text-blue-400" },
    { icon: Calendar, text: "Analisar minha agenda desta semana", color: "from-purple-500/20 to-purple-600/10", iconColor: "text-purple-600 dark:text-purple-400" },
    { icon: TrendingUp, text: "Projeção de receita para 3 meses", color: "from-amber-500/20 to-amber-600/10", iconColor: "text-amber-600 dark:text-amber-400" },
    { icon: BookOpen, text: "Criar mensagem para cobrar alunos", color: "from-rose-500/20 to-rose-600/10", iconColor: "text-rose-600 dark:text-rose-400" },
    { icon: Star, text: "Cadastrar novo aluno", color: "from-indigo-500/20 to-indigo-600/10", iconColor: "text-indigo-600 dark:text-indigo-400" },
  ];

  // Badge de uso diário
  const UsageBadge = () => {
    if (!usageStats) return null;
    const { usedToday, limit } = usageStats;
    const remaining = limit - usedToday;
    const pct = (usedToday / limit) * 100;

    return (
      <div className={cn(
        "rounded-xl border p-3 transition-all",
        isBlocked
          ? "border-rose-500/30 bg-rose-500/5"
          : remaining <= 3
            ? "border-amber-500/30 bg-amber-500/5"
            : "border-border/50 bg-muted/20"
      )}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Consultas hoje</span>
          <span className={cn(
            "text-[11px] font-bold tabular-nums",
            isBlocked ? "text-rose-500" : remaining <= 3 ? "text-amber-600" : "text-foreground"
          )}>
            {usedToday}/{limit}
          </span>
        </div>
        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all duration-700", isBlocked ? "bg-rose-500" : pct >= 70 ? "bg-amber-500" : "bg-indigo-500")}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
        {isBlocked && timeLeftStr && (
          <div className="flex items-center gap-1.5 mt-2">
            <Clock size={11} className="text-rose-500 shrink-0" />
            <span className="text-[10px] text-rose-600 font-semibold">Libera em {timeLeftStr}</span>
          </div>
        )}
        {!isBlocked && remaining <= 3 && remaining > 0 && (
          <div className="flex items-center gap-1.5 mt-2">
            <AlertTriangle size={11} className="text-amber-500 shrink-0" />
            <span className="text-[10px] text-amber-600 font-semibold">Restam {remaining} consulta{remaining !== 1 ? "s" : ""}</span>
          </div>
        )}
        {!isBlocked && remaining > 3 && (
          <div className="flex items-center gap-1.5 mt-2">
            <CheckCircle2 size={11} className="text-emerald-500 shrink-0" />
            <span className="text-[10px] text-emerald-600 font-semibold">{remaining} disponíveis</span>
          </div>
        )}
      </div>
    );
  };

  const BlockedBanner = () => {
    if (!isBlocked || !usageStats) return null;
    return (
      <div className="mx-4 sm:mx-6 mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4 flex flex-col gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className="text-rose-500 shrink-0" />
          <p className="text-sm font-bold text-rose-600">Limite diário atingido</p>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Você atingiu o limite de <strong>10 consultas por dia</strong>. Será liberado automaticamente após 24h.
        </p>
        {timeLeftStr && (
          <div className="flex items-center gap-2 mt-1 bg-rose-500/10 rounded-xl px-3 py-2">
            <Clock size={14} className="text-rose-500" />
            <span className="text-sm font-bold text-rose-600">Libera em: {timeLeftStr}</span>
          </div>
        )}
      </div>
    );
  };

  const CooldownBanner = () => {
    if (!isInCooldown || isBlocked) return null;
    return (
      <div className="mx-4 sm:mx-6 mt-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 flex items-center gap-2 shrink-0">
        <Clock size={14} className="text-amber-500 shrink-0" />
        <span className="text-xs font-semibold text-amber-600">Aguarde {cooldownSeconds}s antes de enviar outra consulta.</span>
      </div>
    );
  };

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-4rem)] overflow-hidden -m-4 sm:-m-6 bg-background">

      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <div className={cn(
        "w-full md:w-72 lg:w-80 border-r border-border/60 flex flex-col shrink-0 h-full bg-card/30",
        activeConversationId ? "hidden md:flex" : "flex"
      )}>
        {/* Header da Sidebar */}
        <div className="p-5 border-b border-border/60 shrink-0">
          <div className="flex items-center gap-3 mb-4">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
                <Bot className="text-white" size={20} />
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-background" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-foreground leading-tight">IA Assistente</h2>
              <p className="text-[10px] text-emerald-600 font-semibold">● Online</p>
            </div>
          </div>

          <Button
            onClick={() => handleCreateConversation()}
            disabled={newConvMutation.isPending}
            className="w-full gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 shadow-md shadow-indigo-500/25 text-xs font-bold h-10 transition-all"
          >
            {newConvMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            Nova Conversa
          </Button>
        </div>

        {/* Lista de Conversas com Scroll Oculto */}
        <div 
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 py-3 no-scrollbar"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
            {/* Mobile: sugestões rápidas */}
            <div className="block md:hidden mb-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 px-1">Sugestões</p>
              <div className="flex flex-col gap-1.5">
                {suggestions.slice(0, 4).map((sug, i) => {
                  const Icon = sug.icon;
                  return (
                    <button
                      key={i}
                      onClick={() => handleCreateConversation(sug.text)}
                      disabled={isBlocked}
                      className="flex items-center gap-3 p-3 rounded-xl border border-border/60 bg-card hover:bg-accent/50 transition-all text-left group disabled:opacity-40"
                    >
                      <div className={cn("w-8 h-8 rounded-lg bg-gradient-to-br flex items-center justify-center shrink-0", sug.color)}>
                        <Icon className={cn("size-4", sug.iconColor)} />
                      </div>
                      <span className="text-xs font-semibold text-foreground leading-tight">{sug.text}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 px-1">
              Conversas recentes
            </p>

            {isLoadingConversations ? (
              <div className="flex justify-center p-8 text-muted-foreground">
                <Loader2 className="animate-spin" size={18} />
              </div>
            ) : conversations.length === 0 ? (
              <div className="text-center py-8 px-3">
                <MessageSquare className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Nenhuma conversa ainda.<br />Clique em "Nova Conversa"!</p>
              </div>
            ) : (
              <div className="space-y-1">
                {conversations.map((conv: any) => (
                  <div
                    key={conv.id}
                    className={cn(
                      "group flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all",
                      activeConversationId === conv.id
                        ? "bg-indigo-500/10 border border-indigo-500/20 text-indigo-700 dark:text-indigo-300"
                        : "hover:bg-accent/60 text-muted-foreground border border-transparent"
                    )}
                    onClick={() => setActiveConversationId(conv.id)}
                  >
                    <div className="flex items-center gap-2.5 truncate min-w-0">
                      <div className={cn(
                        "w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
                        activeConversationId === conv.id ? "bg-indigo-500/20" : "bg-muted"
                      )}>
                        <MessageSquare size={13} className={activeConversationId === conv.id ? "text-indigo-600" : "text-muted-foreground/60"} />
                      </div>
                      <span className="text-xs font-medium truncate">{conv.title}</span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm("Excluir esta conversa?")) {
                          deleteConvMutation.mutate({ id: conv.id });
                        }
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-rose-500/15 text-muted-foreground/40 hover:text-rose-600 rounded-lg transition-all shrink-0"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
        </div>

        {/* Usage Badge na base */}
        <div className="px-3 pb-4 shrink-0 border-t border-border/40 pt-3">
          <UsageBadge />
        </div>
      </div>

      {/* ── Área Principal ──────────────────────────────────────────── */}
      <div className={cn(
        "flex-1 flex flex-col bg-background min-w-0 h-full relative",
        !activeConversationId && "hidden md:flex"
      )}>
        {activeConversationId ? (
          <div className="absolute inset-0 flex flex-col overflow-hidden">
            {/* Mobile Header */}
            <div className="flex md:hidden items-center justify-between px-4 py-3 border-b border-border/60 bg-card/50 backdrop-blur-sm shrink-0">
              <button
                onClick={() => setActiveConversationId(null)}
                className="flex items-center gap-2 text-xs font-bold text-indigo-600 dark:text-indigo-400 py-1.5 px-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl active:scale-95 transition-all"
              >
                <ArrowLeft size={14} />
                <span>Conversas</span>
              </button>
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                  <Bot size={13} className="text-white" />
                </div>
                <span className="truncate max-w-[130px]">
                  {conversations.find((c: any) => c.id === activeConversationId)?.title || "Chat"}
                </span>
              </div>
            </div>

            <BlockedBanner />
            <CooldownBanner />

            {/* Desktop: título da conversa */}
            <div className="hidden md:flex items-center gap-3 px-6 py-4 border-b border-border/40 shrink-0 bg-card/20">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md shadow-indigo-500/20">
                <Bot size={16} className="text-white" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground leading-tight">
                  {conversations.find((c: any) => c.id === activeConversationId)?.title || "Nova Conversa"}
                </h3>
                <p className="text-[10px] text-muted-foreground">IA Assistente Musical · Dados em tempo real</p>
              </div>
              <div className="ml-auto flex items-center gap-1.5">
                <Zap size={12} className="text-amber-500" />
                <span className="text-[10px] font-semibold text-muted-foreground">Powered by Groq / Gemini</span>
              </div>
            </div>

            {/* Chat Box */}
            <div className="flex-1 overflow-hidden p-2 sm:p-4 lg:p-6">
              <AIChatBox
                messages={messages}
                onSendMessage={handleSendMessage}
                isLoading={chatMutation.isPending || isLoadingMessages}
                isBlocked={isBlocked}
                isCooldown={isInCooldown}
                cooldownSeconds={cooldownSeconds}
                placeholder={
                  isBlocked
                    ? "Limite diário atingido. Aguarde 24h..."
                    : isInCooldown
                      ? `Aguarde ${cooldownSeconds}s...`
                      : "Pergunte algo ao Assistente..."
                }
                className="h-full border-border/40"
                height="100%"
                emptyStateMessage="Como posso ajudar com sua escola de música hoje?"
              />
            </div>
          </div>
        ) : (
          /* ── Tela de boas-vindas ── */
          <div className="flex-1 flex flex-col items-center justify-center p-8 relative overflow-hidden">
            {/* Background decorativo */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-500/5 rounded-full blur-3xl" />
              <div className="absolute bottom-1/4 right-1/4 w-[300px] h-[300px] bg-purple-500/5 rounded-full blur-3xl" />
            </div>

            <div className="relative z-10 flex flex-col items-center max-w-3xl w-full">
              {/* Logo / Icon */}
              <div className="relative mb-6">
                <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-2xl shadow-indigo-500/30">
                  <BrainCircuit className="text-white w-12 h-12" />
                </div>
                <div className="absolute -inset-4 bg-indigo-500/10 blur-2xl rounded-full -z-10 animate-pulse" />
                <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-emerald-500 rounded-xl flex items-center justify-center border-2 border-background shadow-lg">
                  <Zap size={14} className="text-white" />
                </div>
              </div>

              <h2 className="text-3xl font-black text-foreground text-center mb-3 tracking-tight">
                Assistente Musical com IA
              </h2>
              <p className="text-muted-foreground text-center max-w-md mb-5 leading-relaxed text-sm">
                Sua IA tem acesso em tempo real aos seus <strong>alunos</strong>, <strong>aulas</strong> e <strong>finanças</strong>. Faça perguntas ou escolha uma sugestão abaixo.
              </p>

              {/* Botão: o que a IA pode fazer */}
              <button
                onClick={() => setShowHelp(true)}
                className="mb-8 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 text-xs font-bold hover:bg-indigo-500/20 transition-all active:scale-95"
              >
                <HelpCircle size={14} /> O que a IA pode (e o que NÃO pode) fazer?
              </button>

              {/* Grade de Sugestões */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 w-full">
                {suggestions.map((sug, i) => {
                  const Icon = sug.icon;
                  return (
                    <button
                      key={i}
                      onClick={() => handleCreateConversation(sug.text)}
                      disabled={isBlocked}
                      className="group flex items-center gap-3 p-4 rounded-2xl border border-border/60 bg-card hover:border-indigo-500/40 hover:shadow-lg hover:shadow-indigo-500/8 hover:bg-card/80 transition-all text-left disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <div className={cn(
                        "w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center shrink-0 transition-transform group-hover:scale-110",
                        sug.color
                      )}>
                        <Icon className={cn("size-5", sug.iconColor)} />
                      </div>
                      <span className="text-sm font-semibold text-foreground leading-tight">{sug.text}</span>
                    </button>
                  );
                })}
              </div>

              <p className="text-[11px] text-muted-foreground/60 mt-8 text-center">
                Pressione <kbd className="px-1.5 py-0.5 bg-muted border border-border rounded text-[10px] font-mono">Enter</kbd> para enviar · <kbd className="px-1.5 py-0.5 bg-muted border border-border rounded text-[10px] font-mono">Shift + Enter</kbd> para nova linha
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Modal: como usar a IA (capacidades e limitações) */}
      <Dialog open={showHelp} onOpenChange={setShowHelp}>
        <DialogContent className="sm:max-w-[560px] max-h-[calc(100dvh-8rem)] md:max-h-[90vh] flex flex-col rounded-3xl p-0 overflow-hidden">
          <div className="px-6 pt-6 pb-4 border-b border-border/40 shrink-0">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3 text-lg font-black">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center"><BrainCircuit size={18} /></div>
                Como usar o Assistente com IA
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Entenda o que a IA faz por você — e o que ela <strong>não</strong> faz.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1 min-h-0 no-scrollbar">
            {/* O que faz */}
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 size={13} /> O que a IA faz
              </p>
              <ul className="space-y-2">
                {[
                  "Consulta seus dados em tempo real (alunos, aulas, financeiro, agenda).",
                  "Gera relatórios, resumos e projeções (ex.: receita dos próximos meses).",
                  "Responde dúvidas sobre a sua escola e ajuda a planejar.",
                  "Escreve rascunhos de mensagens para você revisar e enviar.",
                  "Sugere próximos passos e organiza informações.",
                ].map((t, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-foreground">
                    <CheckCircle2 size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* O que NÃO faz */}
            <div className="space-y-2 rounded-2xl border border-rose-500/25 bg-rose-500/5 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                <ShieldCheck size={13} /> O que a IA NÃO faz
              </p>
              <ul className="space-y-2">
                {[
                  "NÃO exclui alunos, aulas, faturas, contratos ou qualquer registro.",
                  "NÃO altera nem apaga dados automaticamente.",
                  "NÃO envia mensagens sozinha (apenas rascunhos).",
                  "NÃO acessa dados de outras escolas.",
                ].map((t, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-foreground">
                    <XCircle size={14} className="text-rose-500 shrink-0 mt-0.5" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-muted-foreground pt-1">
                Para excluir qualquer informação, faça diretamente pela tela correspondente (Alunos, Financeiro, etc.). A IA <strong>não realiza exclusões</strong>.
              </p>
            </div>

            {/* Como usar */}
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <Sparkles size={13} /> Como aproveitar melhor
              </p>
              <ul className="space-y-1.5">
                {[
                  "Pergunte em linguagem natural, como se estivesse falando com uma pessoa.",
                  "Use as sugestões da tela inicial para começar rápido.",
                  "Quanto mais contexto (período, aluno, instrumento), melhor a resposta.",
                  "Sempre confira as informações importantes antes de agir.",
                ].map((t, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0 mt-1.5" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-border/40 flex justify-end shrink-0 bg-muted/10">
            <Button onClick={() => setShowHelp(false)} className="rounded-xl text-xs">Entendi</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
