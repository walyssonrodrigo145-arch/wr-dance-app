import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Loader2, LifeBuoy, Bug, Lightbulb, HelpCircle, MessageSquarePlus,
  ImagePlus, X, History, PlusCircle, Clock, MessageCircle,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Category = "bug" | "melhoria" | "duvida" | "outro";
type Priority = "baixa" | "media" | "alta";

const CATEGORIES = [
  { id: "bug", label: "Bug", icon: Bug, desc: "Algo não funciona" },
  { id: "melhoria", label: "Melhoria", icon: Lightbulb, desc: "Sugerir algo" },
  { id: "duvida", label: "Dúvida", icon: HelpCircle, desc: "Preciso de ajuda" },
  { id: "outro", label: "Outro", icon: MessageSquarePlus, desc: "Outro assunto" },
] as const;

const STATUS: Record<string, { label: string; cls: string }> = {
  aberto: { label: "Aberto", cls: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  em_andamento: { label: "Em andamento", cls: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  resolvido: { label: "Resolvido", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  fechado: { label: "Fechado", cls: "bg-muted text-muted-foreground border-border" },
};

interface PickedImage { id: string; name: string; type: string; dataUrl: string; }

function parseAttachments(raw: any): string[] {
  if (!raw) return [];
  try { const a = JSON.parse(raw); return Array.isArray(a) ? a : []; } catch { return []; }
}

export function SupportTicketModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const utils = trpc.useUtils();
  const [tab, setTab] = useState<"novo" | "historico">("novo");
  const [category, setCategory] = useState<Category>("melhoria");
  const [priority, setPriority] = useState<Priority>("media");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [images, setImages] = useState<PickedImage[]>([]);

  const { data: tickets = [], isLoading: loadingTickets } = trpc.support.listMine.useQuery(undefined, { enabled: open });

  const markRead = trpc.support.markResponsesRead.useMutation({
    onSuccess: () => {
      utils.support.unreadCount.invalidate();
      utils.support.listMine.invalidate();
    },
  });

  // Ao abrir o modal, marca as respostas como vistas (para o pulso/badge)
  useEffect(() => {
    if (open) markRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const uploadMutation = trpc.support.uploadAttachment.useMutation();

  const createMutation = trpc.support.create.useMutation({
    onSuccess: () => {
      toast.success("Chamado enviado! Nossa equipe vai analisar. 🎫");
      utils.support.listMine.invalidate();
      utils.support.openCount.invalidate();
      utils.support.unreadCount.invalidate();
      setTitle("");
      setDescription("");
      setCategory("melhoria");
      setPriority("media");
      setImages([]);
      setTab("historico");
    },
    onError: (e) => toast.error(e.message || "Erro ao enviar o chamado."),
  });

  const pickImages = (files: FileList | null) => {
    if (!files) return;
    const remaining = 3 - images.length;
    const selected = Array.from(files).slice(0, Math.max(0, remaining));
    for (const file of selected) {
      if (!file.type.startsWith("image/")) { toast.error("Envie apenas imagens (PNG/JPG)."); continue; }
      if (file.size > 8 * 1024 * 1024) { toast.error("Cada imagem deve ter até 8MB."); continue; }
      const reader = new FileReader();
      reader.onload = () => {
        setImages((prev) => [...prev, { id: `${Date.now()}-${Math.random()}`, name: file.name, type: file.type, dataUrl: String(reader.result) }]);
      };
      reader.readAsDataURL(file);
    }
  };

  const submit = async () => {
    if (title.trim().length < 3) { toast.error("Informe um título (mín. 3 caracteres)."); return; }
    if (description.trim().length < 5) { toast.error("Descreva melhor o chamado."); return; }
    try {
      const attachments: string[] = [];
      for (const img of images) {
        const res = await uploadMutation.mutateAsync({ fileName: img.name, fileType: img.type, base64Data: img.dataUrl });
        if (res?.url) attachments.push(res.url);
      }
      createMutation.mutate({
        category,
        priority,
        title: title.trim(),
        description: description.trim(),
        pageUrl: typeof window !== "undefined" ? window.location.pathname : undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
      });
    } catch (e: any) {
      toast.error(e?.message || "Erro ao enviar a imagem do chamado.");
    }
  };

  const isSending = createMutation.isPending || uploadMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[calc(100dvh-8rem)] md:max-h-[92vh] flex flex-col rounded-3xl border-border/40 p-0 overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-border/40 shrink-0">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-lg font-black">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center"><LifeBuoy size={18} /></div>
              Suporte
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Abra um chamado ou acompanhe o histórico e as respostas da nossa equipe.
            </DialogDescription>
          </DialogHeader>
          {/* Abas */}
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setTab("novo")}
              className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wider border transition-all",
                tab === "novo" ? "bg-emerald-600 text-white border-emerald-600" : "bg-muted/40 text-muted-foreground border-border/50 hover:bg-muted")}
            >
              <PlusCircle size={13} /> Abrir chamado
            </button>
            <button
              onClick={() => setTab("historico")}
              className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wider border transition-all",
                tab === "historico" ? "bg-emerald-600 text-white border-emerald-600" : "bg-muted/40 text-muted-foreground border-border/50 hover:bg-muted")}
            >
              <History size={13} /> Histórico
              {tickets.length > 0 && <span className="ml-0.5 text-[9px] opacity-80">({tickets.length})</span>}
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1 min-h-0 no-scrollbar">
          {tab === "novo" ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {CATEGORIES.map((c) => {
                  const Icon = c.icon;
                  const active = category === c.id;
                  return (
                    <button key={c.id} type="button" onClick={() => setCategory(c.id)}
                      className={cn("flex flex-col items-center gap-1 p-3 rounded-2xl border-2 text-center transition-all",
                        active ? "border-emerald-500 bg-emerald-500/10" : "border-border/50 hover:border-emerald-400/40")}>
                      <Icon size={18} className={active ? "text-emerald-500" : "text-muted-foreground"} />
                      <span className="text-[11px] font-black">{c.label}</span>
                      <span className="text-[9px] text-muted-foreground leading-tight">{c.desc}</span>
                    </button>
                  );
                })}
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Prioridade</label>
                <div className="flex gap-2">
                  {(["baixa", "media", "alta"] as const).map((p) => (
                    <button key={p} type="button" onClick={() => setPriority(p)}
                      className={cn("flex-1 h-9 rounded-xl text-[11px] font-black uppercase border-2 transition-all",
                        priority === p ? "border-emerald-500 bg-emerald-500/10 text-emerald-600" : "border-border/50 text-muted-foreground")}>
                      {p === "media" ? "média" : p}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Título *</label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Ex: Erro ao salvar aluno" className="h-11 rounded-xl" />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Descrição *</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} rows={4}
                  placeholder="Descreva o que aconteceu, o que você esperava e, se possível, os passos para reproduzir."
                  className="w-full px-4 py-3 text-sm rounded-xl border border-border/50 bg-muted/20 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 resize-none" />
              </div>

              {/* Anexos */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Imagens (opcional · até 3)</label>
                <div className="flex flex-wrap gap-2">
                  {images.map((img) => (
                    <div key={img.id} className="relative w-20 h-20 rounded-xl overflow-hidden border border-border/50 group">
                      <img src={img.dataUrl} alt={img.name} className="w-full h-full object-cover" />
                      <button type="button" onClick={() => setImages((prev) => prev.filter((i) => i.id !== img.id))}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                  {images.length < 3 && (
                    <label className="w-20 h-20 rounded-xl border-2 border-dashed border-border/60 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-emerald-400/60 hover:text-emerald-500 cursor-pointer transition-all">
                      <ImagePlus size={18} />
                      <span className="text-[9px] font-bold">Adicionar</span>
                      <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { pickImages(e.target.files); e.target.value = ""; }} />
                    </label>
                  )}
                </div>
              </div>
            </>
          ) : (
            /* Histórico */
            <>
              {loadingTickets ? (
                <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" size={22} /></div>
              ) : tickets.length === 0 ? (
                <p className="text-xs text-muted-foreground italic py-6 text-center">Você ainda não abriu chamados.</p>
              ) : (
                <div className="space-y-3">
                  {tickets.map((t: any) => {
                    const st = STATUS[t.status] ?? STATUS.aberto;
                    const atts = parseAttachments(t.attachments);
                    return (
                      <div key={t.id} className={cn("rounded-2xl border p-4 space-y-2", t.hasUnreadResponse ? "border-emerald-500/40 bg-emerald-500/5" : "border-border/50 bg-muted/10")}>
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-black text-foreground min-w-0 truncate">{t.title}</p>
                          <span className={cn("text-[9px] font-black uppercase px-2 py-0.5 rounded-lg border shrink-0", st.cls)}>{st.label}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground whitespace-pre-wrap">{t.description}</p>
                        {atts.length > 0 && (
                          <div className="flex gap-2 flex-wrap">
                            {atts.map((url, i) => (
                              <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="w-14 h-14 rounded-lg overflow-hidden border border-border/50">
                                <img src={url} alt={`anexo ${i + 1}`} className="w-full h-full object-cover" />
                              </a>
                            ))}
                          </div>
                        )}
                        {t.adminResponse ? (
                          <div className="rounded-xl bg-indigo-500/5 border border-indigo-500/20 p-3">
                            <p className="text-[9px] font-black uppercase tracking-wider text-indigo-500 flex items-center gap-1"><MessageCircle size={10} /> Resposta do suporte</p>
                            <p className="text-[11px] text-foreground mt-1 whitespace-pre-wrap">{t.adminResponse}</p>
                          </div>
                        ) : (
                          <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Clock size={10} /> Aguardando resposta da equipe.</p>
                        )}
                        <p className="text-[9px] text-muted-foreground/60">{new Date(t.createdAt).toLocaleString("pt-BR")}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border/40 flex justify-end gap-2 shrink-0 bg-muted/10">
          {tab === "novo" ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl text-xs">Cancelar</Button>
              <Button onClick={submit} disabled={isSending} className="rounded-xl text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white">
                {isSending ? <Loader2 size={14} className="animate-spin" /> : <LifeBuoy size={14} />} Enviar chamado
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl text-xs">Fechar</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
