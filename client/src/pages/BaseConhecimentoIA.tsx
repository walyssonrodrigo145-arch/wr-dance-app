import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  Sparkles,
  Plus,
  Trash2,
  Save,
  RotateCcw,
  MessageSquare,
  Bot,
  CheckCircle2,
  HelpCircle,
  Lightbulb,
  Send,
  Sliders,
  Check,
  Search,
  BookOpen,
  MapPin,
  Baby,
  Guitar,
  DollarSign,
  Clock,
  RefreshCw,
  Layers,
  ChevronDown,
  ChevronUp,
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

const CATEGORIES = [
  { id: "cursos_precos", label: "🎸 Cursos & Preços", color: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  { id: "localizacao", label: "📍 Localização & Espaço", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  { id: "politicas", label: "🔄 Regras & Faltas", color: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  { id: "faq_geral", label: "❓ Dúvidas Gerais", color: "bg-purple-500/10 text-purple-600 border-purple-500/20" },
];

export default function BaseConhecimentoIA() {
  const utils = trpc.useUtils();
  const [searchTerm, setSearchTerm] = useState("");
  const [editingTopicId, setEditingTopicId] = useState<number | null>(null);

  // Formulário de Novo Tópico
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("faq_geral");
  const [newContent, setNewContent] = useState("");

  // Simulador de Perguntas da IA
  const [testQuestion, setTestQuestion] = useState("");
  const [testHistory, setTestHistory] = useState<
    { question: string; answer: string; time: string; topicsCount?: number }[]
  >([]);

  const { data, isLoading } = trpc.schoolAi.getKnowledgeBase.useQuery();

  const upsertMutation = trpc.schoolAi.upsertTopic.useMutation({
    onSuccess: (res) => {
      toast.success(res.message);
      utils.schoolAi.getKnowledgeBase.invalidate();
      setNewModalOpen(false);
      setNewTitle("");
      setNewContent("");
      setEditingTopicId(null);
    },
    onError: (err) => {
      toast.error("Erro ao salvar tópico: " + err.message);
    },
  });

  const deleteMutation = trpc.schoolAi.deleteTopic.useMutation({
    onSuccess: (res) => {
      toast.success(res.message);
      utils.schoolAi.getKnowledgeBase.invalidate();
    },
    onError: (err) => {
      toast.error("Erro ao excluir: " + err.message);
    },
  });

  const toggleMutation = trpc.schoolAi.toggleTopic.useMutation({
    onSuccess: () => {
      utils.schoolAi.getKnowledgeBase.invalidate();
    },
  });

  const testAiMutation = trpc.schoolAi.testAiResponse.useMutation({
    onSuccess: (res) => {
      setTestHistory((prev) => [
        ...prev,
        {
          question: testQuestion,
          answer: res.reply,
          topicsCount: res.usedTopicsCount,
          isError: (res as any).isError,
          time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
      setTestQuestion("");
    },
    onError: (err) => {
      toast.error("Erro ao testar IA: " + err.message);
    },
  });

  const handleTestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!testQuestion.trim() || testAiMutation.isPending) return;
    testAiMutation.mutate({ question: testQuestion.trim() });
  };

  const topics = data?.topics || [];
  const activeCount = topics.filter((t) => t.isActive === 1).length;

  const filteredTopics = topics.filter(
    (t) =>
      t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.content.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8 pb-20 max-w-7xl mx-auto">
      {/* ─── Header Principal ─── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-purple-950/20 via-card to-card p-6 rounded-3xl border border-border shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-purple-500/20">
            <Brain size={30} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-foreground tracking-tight">
                Cérebro da IA (Base de Conhecimento RAG)
              </h1>
              <Badge className="bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20 font-bold">
                Atendimento Inteligente
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium mt-1">
              Ensine a IA sobre a sua escola: valores, cursos, idade mínima, horários e regras para respostas naturais no WhatsApp.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Badge variant="outline" className="px-3 py-1.5 rounded-xl border-border text-xs font-bold gap-1.5">
            <Sparkles size={13} className="text-purple-500" />
            {activeCount} de {topics.length} tópicos ativos
          </Badge>
          <Button
            onClick={() => setNewModalOpen(true)}
            className="rounded-2xl h-11 px-5 gap-2 text-xs font-black bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-600/20"
          >
            <Plus size={16} /> Adicionar Tópico
          </Button>
        </div>
      </div>

      {/* ─── Grid Principal: Base de Conhecimento (Esquerda) + Simulador IA (Direita) ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* COLUNA ESQUERDA: LISTA DE TÓPICOS (7 Colunas) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Barra de Busca e Filtro */}
          <div className="flex items-center gap-3 bg-card p-3 rounded-2xl border border-border">
            <Search size={16} className="text-muted-foreground ml-2" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por tópico, dúvida, regra ou palavra-chave..."
              className="border-none shadow-none text-xs bg-transparent h-8 focus-visible:ring-0"
            />
          </div>

          {/* Lista de Tópicos */}
          <div className="space-y-4">
            <AnimatePresence>
              {filteredTopics.map((topic) => {
                const isEditing = editingTopicId === topic.id;
                const catObj = CATEGORIES.find((c) => c.id === topic.category) || CATEGORIES[3];

                return (
                  <motion.div
                    key={topic.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className={cn(
                      "bg-card rounded-3xl p-5 border transition-all duration-200 shadow-sm",
                      topic.isActive === 1
                        ? "border-border hover:border-purple-500/40"
                        : "border-border/60 opacity-60 bg-muted/30"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="w-10 h-10 rounded-2xl bg-purple-500/10 flex items-center justify-center text-purple-600 shrink-0 font-black">
                          💡
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm font-black text-foreground">{topic.title}</h3>
                            <Badge className={cn("text-[9px] font-extrabold px-2 py-0.5", catObj.color)}>
                              {catObj.label}
                            </Badge>
                          </div>

                          {!isEditing ? (
                            <p className="text-xs text-muted-foreground leading-relaxed mt-2 whitespace-pre-wrap">
                              {topic.content}
                            </p>
                          ) : (
                            <div className="mt-3 space-y-3">
                              <Input
                                defaultValue={topic.title}
                                id={`edit-title-${topic.id}`}
                                className="text-xs font-bold rounded-xl border-border bg-background"
                              />
                              <Textarea
                                defaultValue={topic.content}
                                id={`edit-content-${topic.id}`}
                                rows={4}
                                className="text-xs rounded-xl border-border bg-background resize-none leading-relaxed"
                              />
                              <div className="flex items-center justify-end gap-2 pt-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setEditingTopicId(null)}
                                  className="rounded-xl text-xs"
                                >
                                  Cancelar
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    const titleEl = document.getElementById(
                                      `edit-title-${topic.id}`
                                    ) as HTMLInputElement;
                                    const contentEl = document.getElementById(
                                      `edit-content-${topic.id}`
                                    ) as HTMLTextAreaElement;
                                    upsertMutation.mutate({
                                      id: topic.id,
                                      title: titleEl.value.trim(),
                                      category: topic.category,
                                      content: contentEl.value.trim(),
                                      isActive: topic.isActive,
                                    });
                                  }}
                                  disabled={upsertMutation.isPending}
                                  className="rounded-xl text-xs bg-purple-600 hover:bg-purple-700 text-white font-bold"
                                >
                                  Salvar
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Ações Rápidas */}
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={topic.isActive === 1}
                          onCheckedChange={(checked) =>
                            toggleMutation.mutate({ id: topic.id, isActive: checked ? 1 : 0 })
                          }
                          title={topic.isActive === 1 ? "Ativo" : "Desativado"}
                        />

                        {!isEditing && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingTopicId(topic.id)}
                            className="h-8 px-2.5 rounded-xl text-xs text-muted-foreground hover:text-foreground"
                          >
                            Editar
                          </Button>
                        )}

                        <button
                          onClick={() => {
                            if (confirm(`Excluir o tópico "${topic.title}"? Esta ação é definitiva.`)) {
                              deleteMutation.mutate({ id: topic.id });
                            }
                          }}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-all"
                          title="Excluir tópico"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>

        {/* COLUNA DIREITA: SIMULADOR DE PERGUNTAS LIVRES DA IA (5 Colunas) */}
        <div className="lg:col-span-5 sticky top-24 space-y-4">
          <div className="bg-card rounded-3xl p-6 border border-border shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-600">
                  <Bot size={18} />
                </div>
                <div>
                  <h2 className="text-sm font-black text-foreground">Testar Respostas da IA</h2>
                  <p className="text-[10px] text-muted-foreground">
                    Faça qualquer pergunta como se fosse um cliente no WhatsApp.
                  </p>
                </div>
              </div>
            </div>

            {/* Sugestões Rápidas de Perguntas */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                Perguntas Frequentes de Teste:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  "Vocês aceitam crianças pequenas?",
                  "Qual o valor da aula de violão?",
                  "Onde fica a escola?",
                  "Tem aula no sábado?",
                  "Como funciona se eu faltar?",
                ].map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => {
                      setTestQuestion(q);
                      testAiMutation.mutate({ question: q });
                    }}
                    className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-muted hover:bg-purple-500/15 hover:text-purple-600 border border-border text-foreground transition-all text-left"
                  >
                    "{q}"
                  </button>
                ))}
              </div>
            </div>

            {/* Chat de Testes */}
            <div className="h-[360px] rounded-2xl bg-muted/40 p-3 overflow-y-auto space-y-3 text-xs border border-border/80">
              {testHistory.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-4 text-muted-foreground gap-2">
                  <Sparkles size={24} className="text-purple-500/60 animate-pulse" />
                  <p className="text-xs font-semibold">
                    Envie uma dúvida acima para ver a IA consultando a base da escola e gerando a resposta do WhatsApp!
                  </p>
                </div>
              ) : (
                testHistory.map((item, idx) => (
                  <div key={idx} className="space-y-2">
                    {/* Pergunta do Aluno */}
                    <div className="flex justify-end">
                      <div className="bg-purple-600 text-white p-2.5 rounded-2xl rounded-tr-none max-w-[85%] leading-relaxed shadow-sm font-medium">
                        {item.question}
                      </div>
                    </div>

                    {/* Resposta da IA com base RAG */}
                    <div className="flex justify-start">
                      <div className={cn(
                        "p-3 rounded-2xl rounded-tl-none max-w-[90%] border shadow-sm space-y-1.5",
                        (item as any).isError
                          ? "bg-amber-500/10 border-amber-500/30 text-foreground"
                          : "bg-card text-foreground border-border"
                      )}>
                        <div className="flex items-center gap-1.5 text-[10px] font-black">
                          {(item as any).isError ? (
                            <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                              <Bot size={12} />
                              Aviso de Contingência / Erro de IA
                            </span>
                          ) : (
                            <span className="text-purple-600 dark:text-purple-400 flex items-center gap-1">
                              <Bot size={12} />
                              IA WR MusicPro ({item.topicsCount || 0} tópicos consultados)
                            </span>
                          )}
                        </div>
                        <p className="whitespace-pre-wrap leading-relaxed">{item.answer}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}

              {testAiMutation.isPending && (
                <div className="flex items-center gap-2 text-purple-600 p-2 bg-card rounded-xl w-fit border border-border text-xs">
                  <div className="w-2 h-2 rounded-full bg-purple-600 animate-ping" />
                  <span>Consultando base da escola e gerando resposta...</span>
                </div>
              )}
            </div>

            {/* Input de Envio de Teste */}
            <form onSubmit={handleTestSubmit} className="flex items-center gap-2">
              <Input
                value={testQuestion}
                onChange={(e) => setTestQuestion(e.target.value)}
                placeholder="Ex: Quanto custa a aula de bateria?..."
                className="text-xs rounded-xl border-border bg-background flex-1"
              />
              <Button
                type="submit"
                disabled={!testQuestion.trim() || testAiMutation.isPending}
                className="rounded-xl h-9 px-3.5 bg-purple-600 hover:bg-purple-700 text-white font-bold"
              >
                <Send size={13} />
              </Button>
            </form>
          </div>
        </div>
      </div>

      {/* Modal para Adicionar Novo Tópico */}
      <Dialog open={newModalOpen} onOpenChange={setNewModalOpen}>
        <DialogContent className="sm:max-w-[480px] rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-black flex items-center gap-2">
              <Brain size={18} className="text-purple-600" />
              Adicionar Tópico à Base da IA
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground pt-1">
              Escreva as informações com clareza. A IA utilizará este texto como verdade absoluta para responder seus clientes.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground">Título do Tópico ou Pergunta:</label>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Ex: Instrumentos que a escola ensina"
                className="text-xs rounded-xl border-border"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground">Categoria:</label>
              <div className="grid grid-cols-2 gap-2">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setNewCategory(c.id)}
                    className={cn(
                      "p-2 rounded-xl text-xs font-bold border text-left transition-all",
                      newCategory === c.id
                        ? "bg-purple-500/10 border-purple-500 text-purple-600"
                        : "bg-card border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground">Informações / Resposta da Escola:</label>
              <Textarea
                rows={5}
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="Descreva todos os detalhes com clareza (ex: valores, regras, metodologia, requisitos)..."
                className="text-xs rounded-xl border-border resize-none leading-relaxed"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              variant="outline"
              onClick={() => setNewModalOpen(false)}
              className="rounded-xl text-xs"
            >
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (!newTitle.trim() || !newContent.trim()) {
                  toast.error("Preencha título e conteúdo.");
                  return;
                }
                upsertMutation.mutate({
                  title: newTitle.trim(),
                  category: newCategory,
                  content: newContent.trim(),
                  isActive: 1,
                });
              }}
              disabled={upsertMutation.isPending}
              className="rounded-xl text-xs bg-purple-600 hover:bg-purple-700 text-white font-bold"
            >
              {upsertMutation.isPending ? "Salvando..." : "Salvar Tópico"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
