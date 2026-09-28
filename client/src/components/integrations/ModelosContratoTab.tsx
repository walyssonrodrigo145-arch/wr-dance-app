import { useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CONTRACT_BLOCK_LABELS,
  blocksFromContent,
  emptyContractBlock,
  parseContractBlocks,
  renderContractBlocks,
  serializeContractBlocks,
  type ContractBlock,
  type ContractBlockType,
} from "@shared/contractBlocks";
import {
  FileText, Plus, Pencil, Trash2, Loader2, Sparkles, CheckCircle2,
  ArrowUp, ArrowDown, Copy, Eye, EyeOff, Wand2, X,
} from "lucide-react";

const BLOCK_TYPES = Object.keys(CONTRACT_BLOCK_LABELS) as ContractBlockType[];

/** Variáveis suportadas pelo servidor (@server/services/contractService). */
const AVAILABLE_VARIABLES = [
  { tag: "{{school_name}}", label: "Nome da Escola" },
  { tag: "{{school_cnpj}}", label: "CNPJ da Escola" },
  { tag: "{{school_address}}", label: "Endereço da Escola" },
  { tag: "{{school_email}}", label: "E-mail da Escola" },
  { tag: "{{school_phone}}", label: "Telefone da Escola" },
  { tag: "{{guardian_name}}", label: "Nome do Responsável" },
  { tag: "{{guardian_cpf}}", label: "CPF do Responsável" },
  { tag: "{{guardian_phone}}", label: "Telefone do Responsável" },
  { tag: "{{guardian_email}}", label: "E-mail do Responsável" },
  { tag: "{{guardian_address}}", label: "Endereço do Responsável" },
  { tag: "{{student_name}}", label: "Nome do Aluno(a)" },
  { tag: "{{student_cpf}}", label: "CPF do Aluno(a)" },
  { tag: "{{student_rg}}", label: "RG do Aluno(a)" },
  { tag: "{{student_birth_date}}", label: "Nascimento do Aluno(a)" },
  { tag: "{{student_address}}", label: "Endereço do Aluno(a)" },
  { tag: "{{student_email}}", label: "E-mail do Aluno(a)" },
  { tag: "{{student_phone}}", label: "Telefone do Aluno(a)" },
  { tag: "{{modalidade}}", label: "Modalidade / Curso" },
  { tag: "{{monthly_fee}}", label: "Valor da Mensalidade" },
  { tag: "{{due_date}}", label: "Dia do Vencimento" },
  { tag: "{{contract_start_date}}", label: "Início do Contrato" },
  { tag: "{{contract_end_date}}", label: "Término do Contrato" },
];

function newBlockId(): string {
  try {
    return (globalThis.crypto as any)?.randomUUID?.() ?? `b_${Math.random().toString(36).slice(2, 10)}`;
  } catch {
    return `b_${Math.random().toString(36).slice(2, 10)}`;
  }
}

const withIds = (blocks: ContractBlock[]) => blocks.map((b) => ({ ...b, id: b.id || newBlockId() }));

/** Estrutura inicial sugerida para novos modelos (dança). */
function starterBlocks(): ContractBlock[] {
  return withIds([
    { type: "titulo", title: "CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE DANÇA", text: "" },
    { type: "contratada", title: "CONTRATADA", text: "{{school_name}}, CNPJ {{school_cnpj}}, com sede em {{school_address}}." },
    { type: "contratante", title: "CONTRATANTE", text: "{{student_name}}, CPF {{student_cpf}}, residente em {{student_address}}." },
    { type: "clausula", title: "CLÁUSULA 1ª — DO OBJETO", text: "O presente contrato tem como objeto a prestação de aulas de {{modalidade}}, conforme grade e horários da escola." },
    { type: "clausula", title: "CLÁUSULA 2ª — DO PAGAMENTO", text: "A mensalidade é de R$ {{monthly_fee}}, com vencimento todo dia {{due_date}}." },
    { type: "clausula", title: "CLÁUSULA 3ª — DA IMAGEM E ESPETÁCULOS", text: "A escola poderá registrar imagens de aulas e apresentações para fins pedagógicos e de divulgação, salvo manifestação em contrário do CONTRATANTE." },
    { type: "assinatura", title: "ASSINATURAS", text: "{{school_name}} (CONTRATADA)\n\n{{student_name}} ou responsável (CONTRATANTE)" },
    { type: "data", title: "LOCAL E DATA", text: "{{school_address}}, ____/____/________" },
  ]);
}

function Highlighted({ text }: { text: string }) {
  const parts = useMemo(() => text.split(/(\{\{[^}]+\}\})/g), [text]);
  return (
    <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-relaxed">
      {parts.map((p, i) =>
        p.startsWith("{{") ? (
          <span key={i} className="rounded bg-primary/10 px-1 text-primary font-bold">{p}</span>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </pre>
  );
}

/** Aba "Modelos de Contrato" — editor em blocos (tipo/título/texto). */
export function ModelosContratoTab() {
  const utils = trpc.useUtils();
  const { data: templates = [], isLoading } = trpc.contractTemplates.list.useQuery();

  const [editing, setEditing] = useState<{ id?: number; name: string; description: string } | null>(null);
  const [blocks, setBlocks] = useState<ContractBlock[]>([]);
  const [preview, setPreview] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState<number>(-1);
  const textareaRefs = useRef<Record<number, HTMLTextAreaElement | null>>({});

  const autoMutation = trpc.contractTemplates.autoInsertVariables.useMutation({
    onSuccess: (res) => {
      if (res.content) {
        setBlocks(withIds(blocksFromContent(res.content)));
        toast.success("Variáveis identificadas automaticamente!");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const saveMutation = trpc.contractTemplates.create.useMutation({
    onSuccess: () => { toast.success("Modelo criado!"); close(); utils.contractTemplates.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.contractTemplates.update.useMutation({
    onSuccess: () => { toast.success("Modelo atualizado!"); close(); utils.contractTemplates.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.contractTemplates.delete.useMutation({
    onSuccess: () => { toast.success("Modelo removido."); utils.contractTemplates.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const close = () => { setEditing(null); setBlocks([]); setPreview(false); setSelectedBlock(-1); };

  const openNew = () => { setEditing({ name: "", description: "" }); setBlocks(starterBlocks()); setPreview(false); setSelectedBlock(0); };
  const openEdit = (t: any) => {
    setEditing({ id: t.id, name: t.name, description: t.description || "" });
    setBlocks(withIds(parseContractBlocks(t.blocks, t.content)));
    setPreview(false);
    setSelectedBlock(0);
  };

  const updateBlock = (index: number, patch: Partial<ContractBlock>) =>
    setBlocks((prev) => prev.map((b, i) => (i === index ? { ...b, ...patch } : b)));

  const addBlock = (type: ContractBlockType) => {
    setBlocks((prev) => [...prev, { ...emptyContractBlock(type), id: newBlockId() }]);
    setSelectedBlock(blocks.length);
  };

  const move = (index: number, dir: -1 | 1) => {
    setBlocks((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setSelectedBlock(index + dir);
  };

  const duplicate = (index: number) =>
    setBlocks((prev) => {
      const copy = { ...prev[index], id: newBlockId() };
      const next = [...prev];
      next.splice(index + 1, 0, copy);
      return next;
    });

  const removeBlock = (index: number) => {
    setBlocks((prev) => prev.filter((_, i) => i !== index));
    setSelectedBlock((prev) => Math.max(0, prev >= index ? prev - 1 : prev));
  };

  const insertVariable = (tag: string) => {
    const index = selectedBlock >= 0 && selectedBlock < blocks.length ? selectedBlock : blocks.length - 1;
    if (index < 0) return;
    const block = blocks[index];
    const textarea = textareaRefs.current[index];
    if (textarea) {
      const start = textarea.selectionStart ?? block.text.length;
      const end = textarea.selectionEnd ?? block.text.length;
      const nextText = block.text.slice(0, start) + tag + block.text.slice(end);
      updateBlock(index, { text: nextText });
      requestAnimationFrame(() => {
        textarea.focus();
        const pos = start + tag.length;
        textarea.setSelectionRange(pos, pos);
      });
    } else {
      updateBlock(index, { text: `${block.text}${block.text ? " " : ""}${tag}` });
    }
  };

  const save = () => {
    if (!editing) return;
    const name = editing.name.trim();
    if (name.length < 3) { toast.error("Informe o nome do modelo."); return; }
    const content = renderContractBlocks(blocks);
    if (content.length < 10) { toast.error("O modelo precisa de conteúdo."); return; }
    const payload = {
      name,
      description: editing.description.trim() || undefined,
      content,
      blocks: serializeContractBlocks(blocks),
    };
    if (editing.id) updateMutation.mutate({ id: editing.id, ...payload });
    else saveMutation.mutate(payload);
  };

  const isSaving = saveMutation.isPending || updateMutation.isPending;

  if (editing) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm font-black text-foreground flex items-center gap-2">
            <FileText size={16} className="text-primary" />
            {editing.id ? "Editando modelo" : "Novo modelo de contrato"}
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => setPreview((v) => !v)} className="h-9 rounded-xl px-3 text-xs font-bold gap-1.5">
              {preview ? <EyeOff size={14} /> : <Eye size={14} />} {preview ? "Editar" : "Prévia"}
            </Button>
            <Button type="button" variant="ghost" onClick={close} className="h-9 rounded-xl px-3 text-xs font-bold gap-1.5">
              <X size={14} /> Cancelar
            </Button>
            <Button type="button" onClick={save} disabled={isSaving} className="h-9 rounded-xl px-4 text-xs font-bold gap-1.5">
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Salvar modelo
            </Button>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Nome do modelo *</label>
            <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Ex: Contrato de Ballet Infantil 2026" className="h-10 rounded-xl text-sm" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Descrição</label>
            <Input value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder="Quando usar este modelo?" className="h-10 rounded-xl text-sm" />
          </div>
        </div>

        {!preview ? (
          <>
            <div className="rounded-2xl border border-border/60 bg-muted/20 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Variáveis (clique para inserir no bloco selecionado)</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 rounded-lg px-2 text-[10px] font-black uppercase tracking-widest gap-1.5"
                  onClick={() => autoMutation.mutate({ content: renderContractBlocks(blocks) })}
                  disabled={autoMutation.isPending}
                >
                  {autoMutation.isPending ? <Loader2 size={11} className="animate-spin" /> : <Wand2 size={11} />} Auto-identificar
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {AVAILABLE_VARIABLES.map((v) => (
                  <button
                    key={v.tag}
                    type="button"
                    title={v.tag}
                    onClick={() => insertVariable(v.tag)}
                    className="px-2 py-1 rounded-lg border border-border/60 bg-background text-[10px] font-bold text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              {blocks.map((block, index) => (
                <div
                  key={block.id || index}
                  className={cn(
                    "rounded-2xl border p-3 space-y-2 transition-colors",
                    selectedBlock === index ? "border-primary/40 bg-primary/5" : "border-border/60 bg-card/40"
                  )}
                  onClick={() => setSelectedBlock(index)}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <select
                      value={block.type}
                      onChange={(e) => updateBlock(index, { type: e.target.value as ContractBlockType })}
                      className="h-8 rounded-lg border border-border/60 bg-background px-2 text-[10px] font-black uppercase tracking-widest cursor-pointer"
                    >
                      {BLOCK_TYPES.map((t) => <option key={t} value={t}>{CONTRACT_BLOCK_LABELS[t]}</option>)}
                    </select>
                    <Input
                      value={block.title}
                      onChange={(e) => updateBlock(index, { title: e.target.value })}
                      placeholder="Título do bloco (opcional)"
                      className="h-8 rounded-lg text-xs font-bold flex-1 min-w-[180px]"
                    />
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="w-7 h-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 flex items-center justify-center disabled:opacity-30" title="Subir"><ArrowUp size={13} /></button>
                      <button type="button" onClick={() => move(index, 1)} disabled={index === blocks.length - 1} className="w-7 h-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 flex items-center justify-center disabled:opacity-30" title="Descer"><ArrowDown size={13} /></button>
                      <button type="button" onClick={() => duplicate(index)} className="w-7 h-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 flex items-center justify-center" title="Duplicar"><Copy size={13} /></button>
                      <button type="button" onClick={() => removeBlock(index)} className="w-7 h-7 rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 flex items-center justify-center" title="Remover"><Trash2 size={13} /></button>
                    </div>
                  </div>
                  <Textarea
                    ref={(el) => { textareaRefs.current[index] = el; }}
                    value={block.text}
                    onChange={(e) => updateBlock(index, { text: e.target.value })}
                    onFocus={() => setSelectedBlock(index)}
                    rows={block.type === "titulo" ? 2 : 4}
                    placeholder="Escreva o texto do bloco. Use as variáveis acima para dados da escola, aluna e contrato."
                    className="rounded-xl text-xs resize-y"
                  />
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Adicionar bloco:</span>
              {BLOCK_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => addBlock(t)}
                  className="px-2.5 py-1.5 rounded-lg border border-dashed border-border/70 text-[10px] font-bold text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors flex items-center gap-1"
                >
                  <Plus size={11} /> {CONTRACT_BLOCK_LABELS[t]}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="rounded-2xl border border-border/60 bg-background p-5 space-y-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Prévia do contrato (variáveis destacadas)</p>
            <Highlighted text={renderContractBlocks(blocks)} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-black text-foreground flex items-center gap-2"><FileText size={16} className="text-primary" /> Modelos de contrato</p>
          <p className="text-xs text-muted-foreground mt-0.5">Monte o contrato em blocos (título, cláusulas, assinaturas) com as variáveis da escola, da aluna e do plano.</p>
        </div>
        <Button type="button" onClick={openNew} className="h-9 rounded-xl px-4 text-xs font-bold gap-1.5">
          <Plus size={14} /> Novo modelo
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-8 justify-center">
          <Loader2 size={14} className="animate-spin" /> Carregando modelos...
        </div>
      ) : (templates as any[]).length === 0 ? (
        <div className="rounded-2xl border border-border/60 bg-muted/30 p-6 text-center">
          <p className="text-xs font-bold text-foreground">Nenhum modelo ainda.</p>
          <p className="text-[10px] text-muted-foreground mt-1">Crie o primeiro modelo ou edite o padrão que a escola já usa.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border/60 divide-y divide-border/40">
          {(templates as any[]).map((t) => (
            <div key={t.id} className="flex items-center gap-3 px-3.5 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-foreground truncate flex items-center gap-1.5">
                  {t.name}
                  {t.blocks ? (
                    <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[8px] font-black uppercase tracking-widest">Blocos</span>
                  ) : null}
                </p>
                {t.description ? <p className="text-[10px] text-muted-foreground truncate">{t.description}</p> : null}
              </div>
              <button type="button" onClick={() => openEdit(t)} className="w-8 h-8 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 flex items-center justify-center" title="Editar"><Pencil size={14} /></button>
              <button
                type="button"
                onClick={() => { if (confirm(`Remover o modelo "${t.name}"?`)) deleteMutation.mutate({ id: t.id }); }}
                className="w-8 h-8 rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 flex items-center justify-center"
                title="Remover"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-border/60 bg-muted/20 p-4 flex items-start gap-2.5">
        <Sparkles size={14} className="text-primary mt-0.5 shrink-0" />
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Como funciona:</strong> os blocos viram o texto do contrato enviado para assinatura —
          as variáveis (como {"{{modalidade}}"} e {"{{monthly_fee}}"}) são preenchidas com os dados da aluna no momento da geração.
          Modelos antigos são convertidos automaticamente ao abrir.
        </p>
      </div>
    </div>
  );
}
