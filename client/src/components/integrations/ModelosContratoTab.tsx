import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  FileSignature, Plus, Pencil, Trash2, Loader2, Sparkles, HelpCircle, FileText, CheckCircle2, Copy, Wand2
} from "lucide-react";

export function ModelosContratoTab() {
  const utils = trpc.useUtils();
  const { data: templates = [], isLoading } = trpc.contractTemplates.list.useQuery();

  const [editingId, setEditingId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");

  const autoMutation = trpc.contractTemplates.autoInsertVariables.useMutation({
    onSuccess: (res) => {
      if (res.content) {
        setContent(res.content);
        toast.success("Variáveis identificadas e substituídas automaticamente no texto!");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const createMutation = trpc.contractTemplates.create.useMutation({
    onSuccess: () => {
      toast.success("Modelo de contrato criado com sucesso!");
      resetForm();
      utils.contractTemplates.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.contractTemplates.update.useMutation({
    onSuccess: () => {
      toast.success("Modelo de contrato atualizado!");
      resetForm();
      utils.contractTemplates.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.contractTemplates.delete.useMutation({
    onSuccess: () => {
      toast.success("Modelo desativado com sucesso.");
      utils.contractTemplates.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const resetForm = () => {
    setEditingId(null);
    setIsCreating(false);
    setName("");
    setDescription("");
    setContent("");
  };

  const handleEdit = (tpl: any) => {
    setEditingId(tpl.id);
    setIsCreating(false);
    setName(tpl.name);
    setDescription(tpl.description || "");
    setContent(tpl.content || "");
  };

  const handleNew = () => {
    resetForm();
    setIsCreating(true);
    setName("Novo Modelo de Contrato");
    setDescription("Descreva o objetivo deste contrato (ex: Aulas Individuais)");
  };

  const handleSave = () => {
    if (!name.trim()) return toast.error("Preencha o nome do modelo");
    if (!content.trim() || content.length < 10) return toast.error("O texto do contrato deve ser preenchido");

    if (editingId) {
      updateMutation.mutate({ id: editingId, name, description, content });
    } else {
      createMutation.mutate({ name, description, content });
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const insertVariable = (varTag: string) => {
    setContent((prev) => prev + ` ${varTag}`);
    toast.success(`Variável ${varTag} adicionada ao final do texto!`);
  };

  const availableVariables = [
    { tag: "{{school_name}}", label: "Nome da Escola" },
    { tag: "{{school_cnpj}}", label: "CNPJ da Escola" },
    { tag: "{{school_address}}", label: "Endereço da Escola" },
    { tag: "{{school_email}}", label: "E-mail da Escola" },
    { tag: "{{school_phone}}", label: "Telefone da Escola" },
    { tag: "{{guardian_name}}", label: "Nome do Responsável Legal" },
    { tag: "{{guardian_cpf}}", label: "CPF do Responsável Legal" },
    { tag: "{{guardian_phone}}", label: "Telefone do Responsável" },
    { tag: "{{guardian_email}}", label: "E-mail do Responsável" },
    { tag: "{{guardian_address}}", label: "Endereço do Responsável" },
    { tag: "{{student_name}}", label: "Nome do Aluno (Beneficiário)" },
    { tag: "{{student_cpf}}", label: "CPF do Aluno" },
    { tag: "{{student_rg}}", label: "RG do Aluno" },
    { tag: "{{student_birth_date}}", label: "Data Nasc. do Aluno" },
    { tag: "{{student_address}}", label: "Endereço do Aluno" },
    { tag: "{{student_email}}", label: "E-mail do Aluno" },
    { tag: "{{student_phone}}", label: "Telefone do Aluno" },
    { tag: "{{instrument}}", label: "Instrumento/Curso" },
    { tag: "{{monthly_fee}}", label: "Valor da Mensalidade" },
    { tag: "{{due_date}}", label: "Dia do Vencimento" },
    { tag: "{{contract_start_date}}", label: "Data de Início" },
    { tag: "{{contract_end_date}}", label: "Data de Término" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card/60 backdrop-blur-md p-6 rounded-[2rem] border border-border shadow-sm">
        <div>
          <h2 className="text-xl font-black text-foreground flex items-center gap-2 tracking-tight">
            <FileSignature className="text-violet-600" size={24} /> Modelos de Contratos Digitais
          </h2>
          <p className="text-xs text-muted-foreground font-medium mt-1">
            Cadastre e edite as cláusulas contratuais personalizadas da sua escola para assinatura via Assinafy.
          </p>
        </div>
        {!isCreating && editingId === null && (
          <Button
            onClick={handleNew}
            className="rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold h-11 px-5 flex items-center gap-2 shadow-lg shadow-violet-500/20"
          >
            <Plus size={18} /> Novo Modelo
          </Button>
        )}
      </div>

      {/* Formulário de Criação / Edição */}
      {(isCreating || editingId !== null) && (
        <div className="bg-card rounded-[2rem] border border-border p-6 shadow-xl space-y-6 animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <h3 className="text-base font-black text-foreground">
              {editingId ? "Editar Modelo de Contrato" : "Criar Novo Modelo de Contrato"}
            </h3>
            <Button variant="ghost" size="sm" onClick={resetForm} className="rounded-xl font-bold">
              Cancelar
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">
                Nome do Modelo *
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Contrato de Matrícula Padrão"
                className="h-12 rounded-xl border-border font-bold text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">
                Descrição Breve
              </label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex: Utilizado para novos alunos de cursos presenciais"
                className="h-12 rounded-xl border-border font-medium text-sm"
              />
            </div>
          </div>

          {/* Variáveis Dinâmicas & Auto-Formatação IA */}
          <div className="space-y-3 bg-muted/40 p-4 rounded-2xl border border-border/50">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
              <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                <Sparkles size={12} className="text-violet-500" /> Variáveis Dinâmicas
              </span>

              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!content.trim() || autoMutation.isPending}
                onClick={() => {
                  if (!content.trim()) return toast.error("Cole o texto do contrato primeiro");
                  autoMutation.mutate({ content });
                }}
                className="h-9 rounded-xl border-violet-500/30 text-violet-600 dark:text-violet-400 hover:bg-violet-500/10 text-xs font-bold flex items-center gap-1.5 shadow-xs"
              >
                {autoMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
                Substituir Variáveis Automático (IA)
              </Button>
            </div>

            <div className="flex flex-wrap gap-1.5 pt-1">
              {availableVariables.map((v) => (
                <button
                  key={v.tag}
                  type="button"
                  onClick={() => insertVariable(v.tag)}
                  className="px-2.5 py-1 bg-card hover:bg-violet-50 hover:text-violet-600 dark:hover:bg-violet-950/40 border border-border/80 rounded-lg text-[11px] font-bold text-foreground transition-all flex items-center gap-1 shadow-2xs active:scale-95"
                >
                  <code className="text-violet-600 font-mono text-[10px]">{v.tag}</code>
                  <span className="text-muted-foreground text-[9px] font-normal">({v.label})</span>
                </button>
              ))}
            </div>
          </div>

          {/* Editor de Texto do Contrato */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">
              Texto das Cláusulas do Contrato *
            </label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={16}
              placeholder="Digite aqui as cláusulas e o contrato completo..."
              className="rounded-2xl border-border font-mono text-xs leading-relaxed p-4 bg-muted/20"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={resetForm} className="h-11 rounded-xl font-bold px-6">
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="h-11 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold px-8 shadow-lg shadow-violet-500/20"
            >
              {isSaving ? <Loader2 size={16} className="animate-spin mr-2" /> : <CheckCircle2 size={16} className="mr-2" />}
              {editingId ? "Salvar Alterações" : "Criar Modelo"}
            </Button>
          </div>
        </div>
      )}

      {/* Lista de Modelos */}
      {isLoading ? (
        <div className="p-12 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
          <Loader2 size={18} className="animate-spin text-violet-600" /> Carregando modelos de contrato...
        </div>
      ) : templates.length === 0 ? (
        <div className="p-12 text-center bg-card rounded-[2rem] border border-border">
          <FileText size={36} className="mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm font-bold text-foreground">Nenhum modelo de contrato cadastrado</p>
          <p className="text-xs text-muted-foreground mt-1 mb-4">
            Crie seu primeiro modelo de contrato para que sua escola possa enviar contratos para assinatura digital.
          </p>
          <Button onClick={handleNew} className="rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold">
            <Plus size={16} className="mr-1.5" /> Criar Primeiro Modelo
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map((tpl: any) => (
            <div
              key={tpl.id}
              className="bg-card rounded-[2rem] border border-border/80 p-6 flex flex-col justify-between hover:border-violet-500/40 transition-all shadow-xs group"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-violet-500/10 text-violet-600 flex items-center justify-center font-bold shrink-0">
                      <FileText size={20} />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-foreground">{tpl.name}</h4>
                      {tpl.description && (
                        <p className="text-xs text-muted-foreground font-medium line-clamp-1 mt-0.5">
                          {tpl.description}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="bg-muted/30 p-3 rounded-xl border border-border/40 text-[11px] font-mono text-muted-foreground line-clamp-3 leading-relaxed">
                  {tpl.content}
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-border/40 pt-4 mt-4">
                <span className="text-[10px] text-muted-foreground font-bold">
                  {tpl.createdAt ? `Criado em ${new Date(tpl.createdAt).toLocaleDateString("pt-BR")}` : ""}
                </span>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(tpl)}
                    className="h-9 rounded-xl font-bold text-xs"
                  >
                    <Pencil size={13} className="mr-1.5" /> Editar Cláusulas
                  </Button>
                  {templates.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm(`Deseja realmente desativar o modelo "${tpl.name}"?`)) {
                          deleteMutation.mutate({ id: tpl.id });
                        }
                      }}
                      className="h-9 w-9 p-0 rounded-xl text-rose-500 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 size={14} />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
