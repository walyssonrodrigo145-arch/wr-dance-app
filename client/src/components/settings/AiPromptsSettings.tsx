import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  Sparkles, Plus, Pencil, Trash2, Loader2, Save, Power, Copy, History, FlaskConical,
  UserPlus, RotateCcw, Music, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { PROMPT_VARIABLE_LIST } from "@shared/promptVariables";

const BUILTIN_SPECIALISTS = [
  { key: "teclado", name: "Teclado / Piano" },
  { key: "cordas_dedilhadas", name: "Violão / Guitarra" },
  { key: "baixo", name: "Contrabaixo" },
  { key: "percussao", name: "Bateria" },
  { key: "piano", name: "Piano (erudito)" },
  { key: "voz", name: "Canto" },
  { key: "sopro", name: "Sopro" },
  { key: "cordas_arco", name: "Cordas com Arco" },
  { key: "geral", name: "Geral" },
];

/**
 * PRD 02 §30-§38 — Configurações → Prompts IA
 * - Especialistas personalizados (CRUD)
 * - Gestão de prompts com versionamento, duplicação, restauração e teste
 * - Variáveis {{...}} substituídas antes do envio à IA
 */
export function AiPromptsSettings() {
  const utils = trpc.useUtils();

  // ── Especialistas personalizados ──
  const { data: specialists = [], isLoading: isLoadingSpecialists } = trpc.aiSpecialists.list.useQuery();
  const [specialistModalOpen, setSpecialistModalOpen] = useState(false);
  const [editingSpecialist, setEditingSpecialist] = useState<any>(null);
  const [spForm, setSpForm] = useState({ name: "", area: "", icon: "🎼", description: "", systemPrompt: "", pedagogicalInstructions: "", technicalKnowledge: "" });

  const saveSpecialist = trpc.aiSpecialists.create.useMutation({
    onSuccess: () => {
      toast.success("Especialista criado!");
      utils.aiSpecialists.list.invalidate();
      utils.aiSpecialists.listMerged.invalidate();
      setSpecialistModalOpen(false);
    },
    onError: (e) => toast.error(e.message || "Erro ao criar especialista."),
  });
  const updateSpecialist = trpc.aiSpecialists.update.useMutation({
    onSuccess: () => {
      toast.success("Especialista atualizado!");
      utils.aiSpecialists.list.invalidate();
      utils.aiSpecialists.listMerged.invalidate();
      setSpecialistModalOpen(false);
    },
    onError: (e) => toast.error(e.message || "Erro ao atualizar especialista."),
  });
  const toggleSpecialist = trpc.aiSpecialists.toggle.useMutation({
    onSuccess: () => {
      utils.aiSpecialists.list.invalidate();
      utils.aiSpecialists.listMerged.invalidate();
    },
    onError: (e) => toast.error(e.message || "Erro ao alterar especialista."),
  });
  const deleteSpecialist = trpc.aiSpecialists.delete.useMutation({
    onSuccess: () => {
      toast.success("Especialista excluído.");
      utils.aiSpecialists.list.invalidate();
      utils.aiSpecialists.listMerged.invalidate();
    },
    onError: (e) => toast.error(e.message || "Erro ao excluir especialista."),
  });

  const openSpecialistModal = (sp?: any) => {
    setEditingSpecialist(sp || null);
    setSpForm({
      name: sp?.name || "",
      area: sp?.area || "",
      icon: sp?.icon || "🎼",
      description: sp?.description || "",
      systemPrompt: sp?.systemPrompt || "",
      pedagogicalInstructions: sp?.pedagogicalInstructions || "",
      technicalKnowledge: sp?.technicalKnowledge || "",
    });
    setSpecialistModalOpen(true);
  };

  const submitSpecialist = () => {
    if (!spForm.name.trim()) {
      toast.error("Informe o nome do especialista.");
      return;
    }
    if (editingSpecialist) {
      updateSpecialist.mutate({ id: editingSpecialist.id, ...spForm });
    } else {
      saveSpecialist.mutate({ ...spForm } as any);
    }
  };

  // ── Prompts ──
  const { data: prompts = [], isLoading: isLoadingPrompts } = trpc.aiPrompts.list.useQuery();
  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<any>(null);
  const [pForm, setPForm] = useState({ name: "", type: "especialista", specialistKey: "none", specialistId: "", content: "" });

  const [versionsModalOpen, setVersionsModalOpen] = useState(false);
  const [versionsPrompt, setVersionsPrompt] = useState<any>(null);
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testForm, setTestForm] = useState({ alunoNome: "", instrumento: "", nivel: "iniciante", objetivo: "", contexto: "" });

  const { data: versions = [] } = trpc.aiPrompts.listVersions.useQuery(
    { id: versionsPrompt?.id },
    { enabled: versionsModalOpen && !!versionsPrompt }
  );

  const createPrompt = trpc.aiPrompts.create.useMutation({
    onSuccess: () => {
      toast.success("Prompt criado!");
      utils.aiPrompts.list.invalidate();
      setPromptModalOpen(false);
    },
    onError: (e) => toast.error(e.message || "Erro ao criar prompt."),
  });
  const savePrompt = trpc.aiPrompts.save.useMutation({
    onSuccess: (data) => {
      toast.success(`Prompt salvo (versão ${data.version})!`);
      utils.aiPrompts.list.invalidate();
      setPromptModalOpen(false);
    },
    onError: (e) => toast.error(e.message || "Erro ao salvar prompt."),
  });
  const togglePrompt = trpc.aiPrompts.toggle.useMutation({
    onSuccess: () => utils.aiPrompts.list.invalidate(),
    onError: (e) => toast.error(e.message || "Erro ao alterar prompt."),
  });
  const duplicatePrompt = trpc.aiPrompts.duplicate.useMutation({
    onSuccess: () => {
      toast.success("Prompt duplicado!");
      utils.aiPrompts.list.invalidate();
    },
    onError: (e) => toast.error(e.message || "Erro ao duplicar prompt."),
  });
  const restoreVersion = trpc.aiPrompts.restoreVersion.useMutation({
    onSuccess: (data) => {
      toast.success(`Versão restaurada como v${data.version}!`);
      utils.aiPrompts.list.invalidate();
      setVersionsModalOpen(false);
    },
    onError: (e) => toast.error(e.message || "Erro ao restaurar versão."),
  });
  const testPrompt = trpc.aiPrompts.test.useMutation({
    onSuccess: (data) => setTestResponse(data.response),
    onError: (e) => toast.error(e.message || "Erro ao testar prompt."),
  });
  const [testResponse, setTestResponse] = useState<string | null>(null);

  const openPromptModal = (prompt?: any) => {
    setEditingPrompt(prompt || null);
    setPForm({
      name: prompt?.name || "",
      type: prompt?.type || "especialista",
      specialistKey: prompt?.specialistKey || "none",
      specialistId: prompt?.specialistId ? String(prompt.specialistId) : "",
      content: prompt?.content || "",
    });
    setPromptModalOpen(true);
  };

  const submitPrompt = () => {
    if (!pForm.name.trim() || !pForm.content.trim()) {
      toast.error("Informe nome e conteúdo do prompt.");
      return;
    }
    if (editingPrompt) {
      savePrompt.mutate({ id: editingPrompt.id, name: pForm.name.trim(), content: pForm.content });
    } else {
      // FIX (Caça-Bug): select usa "builtin:<key>" ou "custom:<id>" — o valor
      // "custom:N" é vínculo por specialistId, NUNCA specialistKey (senão o
      // override do prompt nunca casaria na geração do plano).
      const ref = pForm.specialistKey;
      const isCustom = typeof ref === "string" && ref.startsWith("custom:");
      createPrompt.mutate({
        name: pForm.name.trim(),
        type: pForm.type as any,
        specialistKey: !isCustom && ref !== "none" ? ref : undefined,
        specialistId: isCustom ? Number(ref.slice("custom:".length)) : undefined,
        content: pForm.content,
      });
    }
  };

  const openTestModal = (prompt: any) => {
    setTestResponse(null);
    setTestForm({ alunoNome: "", instrumento: "", nivel: "iniciante", objetivo: "", contexto: "" });
    setVersionsPrompt(prompt);
    setTestModalOpen(true);
  };

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-base lg:text-lg font-black text-foreground uppercase tracking-widest flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-indigo-500/15 flex items-center justify-center"><Sparkles size={17} className="text-indigo-500" /></span>
          Gestão de Prompts IA
        </h3>
        <p className="text-[11px] text-muted-foreground font-bold uppercase tracking-widest mt-1.5">
          Especialistas personalizados e prompts versionados da escola
        </p>
      </div>

      {/* ── Especialistas personalizados ── */}
      <div className="rounded-[1.5rem] border border-border bg-muted/20 p-5 lg:p-6 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h4 className="text-xs font-black uppercase tracking-widest flex items-center gap-2.5">
              <Music size={15} className="text-violet-500" /> Especialistas Personalizados
            </h4>
            <p className="text-[10px] text-muted-foreground font-bold mt-1">
              Cadastre instrumentos além dos padrões (Flauta, Saxofone, Canto, Musicalização Infantil...)
            </p>
          </div>
          <Button size="sm" className="gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 h-9 px-4" onClick={() => openSpecialistModal()}>
            <UserPlus size={14} /> <span className="text-[10px] font-black uppercase tracking-widest">Novo Especialista</span>
          </Button>
        </div>

        {isLoadingSpecialists ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2"><Loader2 size={14} className="animate-spin" /> Carregando...</div>
        ) : specialists.length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-2">Nenhum especialista personalizado. Os padrões (Teclado, Violão, Baixo, Bateria, Teoria...) já estão disponíveis no gerador de planos.</p>
        ) : (
          <div className="space-y-2">
            {specialists.map((sp: any) => (
              <div key={sp.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3 hover:border-indigo-500/40 transition-all duration-300">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xl shrink-0">{sp.icon || "🎼"}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs font-bold text-foreground truncate">{sp.name}</p>
                      {sp.aiModel && <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-500">{sp.aiModel}</span>}
                      {!sp.active && <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-zinc-500/15 text-zinc-500">Inativo</span>}
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate">{sp.area || "—"}{sp.description ? ` · ${sp.description}` : ""}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    title={sp.active ? "Desativar" : "Ativar"}
                    onClick={() => toggleSpecialist.mutate({ id: sp.id, active: !sp.active })}
                    className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer border",
                      sp.active
                        ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/20"
                        : "bg-zinc-500/10 text-zinc-500 border-zinc-500/20 hover:bg-zinc-500/20"
                    )}
                  >
                    <Power size={13} />
                  </button>
                  <button
                    title="Editar"
                    onClick={() => openSpecialistModal(sp)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center bg-indigo-500/10 text-indigo-600 border border-indigo-500/20 hover:bg-indigo-500/20 transition-all cursor-pointer"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    title="Excluir"
                    onClick={() => { if (confirm(`Excluir o especialista "${sp.name}"?`)) deleteSpecialist.mutate({ id: sp.id }); }}
                    className="w-8 h-8 rounded-lg flex items-center justify-center bg-rose-500/10 text-rose-600 border border-rose-500/20 hover:bg-rose-500/20 transition-all cursor-pointer"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Prompts ── */}
      <div className="rounded-[1.5rem] border border-border bg-muted/20 p-5 lg:p-6 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h4 className="text-xs font-black uppercase tracking-widest flex items-center gap-2.5">
              <Sparkles size={15} className="text-indigo-500" /> Prompts
            </h4>
            <p className="text-[10px] text-muted-foreground font-bold mt-1">
              Prompts ativos do tipo "especialista" sobrescrevem o bloco do especialista no gerador de Plano Diário
            </p>
          </div>
          <Button size="sm" className="gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 h-9 px-4" onClick={() => openPromptModal()}>
            <Plus size={14} /> <span className="text-[10px] font-black uppercase tracking-widest">Novo Prompt</span>
          </Button>
        </div>

        {isLoadingPrompts ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2"><Loader2 size={14} className="animate-spin" /> Carregando...</div>
        ) : prompts.length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-2">Nenhum prompt gerenciado — os prompts padrão do sistema estão em uso.</p>
        ) : (
          <div className="space-y-2">
            {prompts.map((p: any) => (
              <div key={p.id} className="rounded-xl border border-border bg-background p-3.5 space-y-2 hover:border-indigo-500/40 transition-all duration-300">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs font-bold text-foreground truncate">{p.name}</p>
                      <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-500">v{p.version}</span>
                      {p.active ? (
                        <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">Ativo</span>
                      ) : (
                        <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-zinc-500/15 text-zinc-500">Inativo</span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {p.type === "especialista" ? `Especialista: ${p.specialistName || "—"}` : "Geral"}
                      {" · "}Atualizado em {p.updatedAt ? format(new Date(p.updatedAt), "dd/MM/yyyy HH:mm") : "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button title={p.active ? "Desativar" : "Ativar"} onClick={() => togglePrompt.mutate({ id: p.id, active: !p.active })}
                      className={cn("w-8 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer border",
                        p.active ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/20" : "bg-zinc-500/10 text-zinc-500 border-zinc-500/20 hover:bg-zinc-500/20")}>
                      <Power size={13} />
                    </button>
                    <button title="Editar" onClick={() => openPromptModal(p)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center bg-indigo-500/10 text-indigo-600 border border-indigo-500/20 hover:bg-indigo-500/20 transition-all cursor-pointer">
                      <Pencil size={13} />
                    </button>
                    <button title="Duplicar" onClick={() => duplicatePrompt.mutate({ id: p.id })}
                      className="w-8 h-8 rounded-lg flex items-center justify-center bg-blue-500/10 text-blue-600 border border-blue-500/20 hover:bg-blue-500/20 transition-all cursor-pointer">
                      <Copy size={13} />
                    </button>
                    <button title="Histórico de versões" onClick={() => { setVersionsPrompt(p); setVersionsModalOpen(true); }}
                      className="w-8 h-8 rounded-lg flex items-center justify-center bg-amber-500/10 text-amber-600 border border-amber-500/20 hover:bg-amber-500/20 transition-all cursor-pointer">
                      <History size={13} />
                    </button>
                    <button title="Testar prompt" onClick={() => openTestModal(p)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center bg-violet-500/10 text-violet-600 border border-violet-500/20 hover:bg-violet-500/20 transition-all cursor-pointer">
                      <FlaskConical size={13} />
                    </button>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground line-clamp-2 opacity-70">{p.content.slice(0, 200)}...</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Modal: Especialista ── */}
      <Dialog open={specialistModalOpen} onOpenChange={setSpecialistModalOpen}>
        <DialogContent className="max-w-lg rounded-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-black uppercase tracking-wide">
              {editingSpecialist ? "Editar Especialista" : "Novo Especialista"}
            </DialogTitle>
            <DialogDescription>Ex: Flauta, Saxofone, Violino, Ukulele, Canto, Musicalização Infantil</DialogDescription>
          </DialogHeader>
          <div className="space-y-3.5 pt-2">
            <div className="grid grid-cols-[70px_1fr] gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Ícone</label>
                <input value={spForm.icon} onChange={(e) => setSpForm({ ...spForm, icon: e.target.value.slice(0, 4) })}
                  className="w-full h-11 rounded-xl border border-border bg-background px-2 text-center text-lg outline-none focus:ring-2 focus:ring-indigo-500/20" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Nome <span className="text-rose-500">*</span></label>
                <input value={spForm.name} onChange={(e) => setSpForm({ ...spForm, name: e.target.value })} maxLength={120}
                  placeholder="Ex: Flauta Transversal"
                  className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/20" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Instrumento / Área</label>
              <input value={spForm.area} onChange={(e) => setSpForm({ ...spForm, area: e.target.value })} maxLength={120}
                placeholder="Ex: Sopro — madeiras"
                className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/20" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Descrição</label>
              <textarea value={spForm.description} onChange={(e) => setSpForm({ ...spForm, description: e.target.value })} rows={2} maxLength={2000}
                className="w-full rounded-xl border border-border bg-background p-3 text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Prompt do sistema</label>
              <textarea value={spForm.systemPrompt} onChange={(e) => setSpForm({ ...spForm, systemPrompt: e.target.value })} rows={3} maxLength={8000}
                placeholder="Ex: Você é um especialista em FLAUTA TRANSVERSAL: embocadura, coluna de ar, articulação simples e dupla, digitação (Boehm)..."
                className="w-full rounded-xl border border-border bg-background p-3 text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Instruções pedagógicas</label>
              <textarea value={spForm.pedagogicalInstructions} onChange={(e) => setSpForm({ ...spForm, pedagogicalInstructions: e.target.value })} rows={2} maxLength={8000}
                className="w-full rounded-xl border border-border bg-background p-3 text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Conhecimentos técnicos (terminologia)</label>
              <textarea value={spForm.technicalKnowledge} onChange={(e) => setSpForm({ ...spForm, technicalKnowledge: e.target.value })} rows={2} maxLength={8000}
                placeholder="Ex: escalas, arpejos, ligaduras, staccato, trilos, harmônicos, notas de spite..."
                className="w-full rounded-xl border border-border bg-background p-3 text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 h-10 rounded-xl text-[10px] font-black uppercase tracking-widest" onClick={() => setSpecialistModalOpen(false)}>Cancelar</Button>
              <Button className="flex-1 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-[10px] font-black uppercase tracking-widest"
                disabled={saveSpecialist.isPending || updateSpecialist.isPending} onClick={submitSpecialist}>
                {(saveSpecialist.isPending || updateSpecialist.isPending) ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Prompt ── */}
      <Dialog open={promptModalOpen} onOpenChange={setPromptModalOpen}>
        <DialogContent className="max-w-2xl rounded-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-black uppercase tracking-wide">
              {editingPrompt ? `Editar Prompt (v${editingPrompt.version})` : "Novo Prompt"}
            </DialogTitle>
            <DialogDescription>Salvar conteúdo cria uma nova versão — versões anteriores ficam no histórico</DialogDescription>
          </DialogHeader>
          <div className="space-y-3.5 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Nome <span className="text-rose-500">*</span></label>
                <input value={pForm.name} onChange={(e) => setPForm({ ...pForm, name: e.target.value })} maxLength={120}
                  className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/20" />
              </div>
              {!editingPrompt && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Especialista relacionado</label>
                  <select
                    value={pForm.specialistKey}
                    onChange={(e) => setPForm({ ...pForm, specialistKey: e.target.value, specialistId: "" })}
                    className="w-full h-11 rounded-xl border border-border bg-background px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="none">Sem vínculo</option>
                    <optgroup label="Padrões">
                      {BUILTIN_SPECIALISTS.map((b) => (
                        <option key={b.key} value={b.key}>{b.name}</option>
                      ))}
                    </optgroup>
                    {specialists.length > 0 && (
                      <optgroup label="Personalizados">
                        {specialists.map((sp: any) => (
                          <option key={sp.id} value={`custom:${sp.id}`}>{sp.name}</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Conteúdo <span className="text-rose-500">*</span></label>
                <div className="flex items-center gap-1 flex-wrap justify-end">
                  {PROMPT_VARIABLE_LIST.map((v) => (
                    <button
                      key={v.token}
                      title={v.description}
                      onClick={() => setPForm((f) => ({ ...f, content: `${f.content}${f.content.endsWith(" ") || f.content === "" ? "" : " "}${v.token}` }))}
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-muted hover:bg-indigo-500/15 hover:text-indigo-600 transition-all cursor-pointer"
                    >
                      {v.token}
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                value={pForm.content}
                onChange={(e) => setPForm({ ...pForm, content: e.target.value })}
                rows={10}
                maxLength={20000}
                className="w-full rounded-xl border border-border bg-background p-3 text-xs font-mono outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none"
                placeholder="Instruções do especialista que substituirão o bloco padrão no gerador de Plano Diário. Use as variáveis {{...}} para injetar o contexto do aluno."
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 h-10 rounded-xl text-[10px] font-black uppercase tracking-widest" onClick={() => setPromptModalOpen(false)}>Cancelar</Button>
              <Button className="flex-1 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-[10px] font-black uppercase tracking-widest"
                disabled={createPrompt.isPending || savePrompt.isPending} onClick={submitPrompt}>
                {(createPrompt.isPending || savePrompt.isPending) ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {editingPrompt ? "Salvar Nova Versão" : "Criar Prompt"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Versões ── */}
      <Dialog open={versionsModalOpen && !testModalOpen} onOpenChange={(o) => { if (!o) setVersionsModalOpen(false); }}>
        <DialogContent className="max-w-lg rounded-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-black uppercase tracking-wide flex items-center gap-2">
              <History size={16} className="text-amber-500" /> Histórico de Versões
            </DialogTitle>
            <DialogDescription>{versionsPrompt?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 pt-2">
            {versions.map((v: any) => (
              <div key={v.id} className="flex items-start justify-between gap-3 rounded-xl border border-border bg-background p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-foreground">v{v.version}</span>
                    {v.version === versionsPrompt?.version && (
                      <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">Atual</span>
                    )}
                    <span className="text-[9px] text-muted-foreground">{v.createdAt ? format(new Date(v.createdAt), "dd/MM/yyyy HH:mm") : ""}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground line-clamp-2 mt-1">{v.content.slice(0, 150)}...</p>
                </div>
                {v.version !== versionsPrompt?.version && (
                  <Button size="sm" variant="outline" className="h-8 px-2.5 rounded-lg gap-1 shrink-0"
                    onClick={() => restoreVersion.mutate({ id: versionsPrompt.id, version: v.version })}>
                    <RotateCcw size={11} /> <span className="text-[9px] font-black uppercase">Restaurar</span>
                  </Button>
                )}
              </div>
            ))}
            {versions.length === 0 && <p className="text-xs text-muted-foreground italic py-2">Nenhuma versão registrada.</p>}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Testar Prompt ── */}
      <Dialog open={testModalOpen} onOpenChange={setTestModalOpen}>
        <DialogContent className="max-w-lg rounded-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-black uppercase tracking-wide flex items-center gap-2">
              <FlaskConical size={16} className="text-violet-500" /> Testar Prompt
            </DialogTitle>
            <DialogDescription>
              {versionsPrompt?.name} — resposta de amostra (não altera planos reais)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Aluno</label>
                <input value={testForm.alunoNome} onChange={(e) => setTestForm({ ...testForm, alunoNome: e.target.value })}
                  className="w-full h-10 rounded-xl border border-border bg-background px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Instrumento</label>
                <input value={testForm.instrumento} onChange={(e) => setTestForm({ ...testForm, instrumento: e.target.value })}
                  className="w-full h-10 rounded-xl border border-border bg-background px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Nível</label>
                <select value={testForm.nivel} onChange={(e) => setTestForm({ ...testForm, nivel: e.target.value })}
                  className="w-full h-10 rounded-xl border border-border bg-background px-3 text-xs font-bold outline-none">
                  <option value="iniciante">Iniciante</option>
                  <option value="intermediario">Intermediário</option>
                  <option value="avancado">Avançado</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Objetivo</label>
                <input value={testForm.objetivo} onChange={(e) => setTestForm({ ...testForm, objetivo: e.target.value })}
                  className="w-full h-10 rounded-xl border border-border bg-background px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Contexto</label>
              <textarea value={testForm.contexto} onChange={(e) => setTestForm({ ...testForm, contexto: e.target.value })} rows={2}
                className="w-full rounded-xl border border-border bg-background p-3 text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none" />
            </div>
            <Button className="w-full h-11 rounded-xl bg-violet-600 hover:bg-violet-700 text-[10px] font-black uppercase tracking-widest gap-2"
              disabled={testPrompt.isPending}
              onClick={() => testPrompt.mutate({ content: versionsPrompt?.content || "", ...testForm })}>
              {testPrompt.isPending ? <Loader2 size={15} className="animate-spin" /> : <FlaskConical size={15} />}
              Gerar Resposta de Teste
            </Button>
            {testResponse && (
              <div className="rounded-xl border border-violet-500/25 bg-violet-500/5 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-violet-500 mb-2 flex items-center gap-1.5">
                  <Sparkles size={12} /> Resposta da IA
                </p>
                <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{testResponse}</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
