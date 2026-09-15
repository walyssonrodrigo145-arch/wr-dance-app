import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { LifeBuoy, Loader2, Bug, Lightbulb, HelpCircle, MessageSquarePlus, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const STATUS: Record<string, { label: string; cls: string }> = {
  aberto: { label: "Aberto", cls: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  em_andamento: { label: "Em andamento", cls: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  resolvido: { label: "Resolvido", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  fechado: { label: "Fechado", cls: "bg-muted text-muted-foreground border-border" },
};

const CATEGORY: Record<string, { label: string; icon: any }> = {
  bug: { label: "Bug", icon: Bug },
  melhoria: { label: "Melhoria", icon: Lightbulb },
  duvida: { label: "Dúvida", icon: HelpCircle },
  outro: { label: "Outro", icon: MessageSquarePlus },
};

const PRIORITY: Record<string, string> = {
  baixa: "bg-muted text-muted-foreground border-border",
  media: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  alta: "bg-rose-500/10 text-rose-600 border-rose-500/20",
};

function parseAttachments(raw: any): string[] {
  if (!raw) return [];
  try { const a = JSON.parse(raw); return Array.isArray(a) ? a : []; } catch { return []; }
}

export function SupportTicketsAdmin() {
  const utils = trpc.useUtils();
  const { data: tickets = [], isLoading } = trpc.support.listAll.useQuery();
  const [filter, setFilter] = useState<string>("todos");
  const [openId, setOpenId] = useState<number | null>(null);
  const [response, setResponse] = useState("");

  const updateMutation = trpc.support.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Chamado atualizado!");
      utils.support.listAll.invalidate();
    },
    onError: (e) => toast.error(e.message || "Erro ao atualizar o chamado."),
  });

  const filtered = filter === "todos" ? tickets : (tickets as any[]).filter((t) => t.status === filter);

  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" size={28} /></div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
          <LifeBuoy size={18} />
        </div>
        <div>
          <h2 className="text-lg font-black text-foreground">Chamados das Escolas</h2>
          <p className="text-xs text-muted-foreground">Bugs, dúvidas e sugestões de melhoria enviados pelos clientes.</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        {["todos", "aberto", "em_andamento", "resolvido", "fechado"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wider border transition-all",
              filter === f ? "bg-primary text-white border-primary" : "bg-muted/40 text-muted-foreground border-border/50 hover:bg-muted"
            )}
          >
            {f === "todos" ? "Todos" : STATUS[f]?.label ?? f}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground italic py-8 text-center">Nenhum chamado {filter !== "todos" ? `com status "${STATUS[filter]?.label ?? filter}"` : ""}.</p>
      ) : (
        <div className="space-y-3">
          {(filtered as any[]).map((t) => {
            const cat = CATEGORY[t.category] ?? CATEGORY.outro;
            const Icon = cat.icon;
            const st = STATUS[t.status] ?? STATUS.aberto;
            const expanded = openId === t.id;
            return (
              <div key={t.id} className="bg-card border border-border/50 rounded-2xl p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-muted/50 flex items-center justify-center text-muted-foreground shrink-0">
                      <Icon size={16} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-black text-foreground truncate">{t.title}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {cat.label} · {t.orgName || "—"} · {t.userName || "—"} {t.userEmail ? `(${t.userEmail})` : ""}
                      </p>
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                        {new Date(t.createdAt).toLocaleString("pt-BR")} {t.pageUrl ? `· ${t.pageUrl}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span className={cn("text-[9px] font-black uppercase px-2 py-0.5 rounded-lg border", st.cls)}>{st.label}</span>
                    <span className={cn("text-[9px] font-black uppercase px-2 py-0.5 rounded-lg border", PRIORITY[t.priority] ?? PRIORITY.media)}>
                      {t.priority}
                    </span>
                  </div>
                </div>

                <p className={cn("text-xs text-muted-foreground mt-3 whitespace-pre-wrap", !expanded && "line-clamp-2")}>{t.description}</p>

                {(() => {
                  const atts = parseAttachments(t.attachments);
                  return atts.length > 0 ? (
                    <div className="flex gap-2 flex-wrap mt-3">
                      {atts.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="w-16 h-16 rounded-lg overflow-hidden border border-border/50 hover:border-primary/40 transition-all">
                          <img src={url} alt={`anexo ${i + 1}`} className="w-full h-full object-cover" />
                        </a>
                      ))}
                    </div>
                  ) : null;
                })()}

                {expanded && (
                  <div className="mt-4 space-y-3 border-t border-border/40 pt-4">
                    {t.adminResponse && (
                      <p className="text-xs text-indigo-500 border-l-2 border-indigo-500/30 pl-2">Resposta atual: {t.adminResponse}</p>
                    )}
                    <textarea
                      value={response}
                      onChange={(e) => setResponse(e.target.value)}
                      rows={3}
                      placeholder="Resposta ao cliente (opcional)"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-border/50 bg-muted/20 focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                    />
                    <div className="flex flex-wrap gap-2">
                      {(["aberto", "em_andamento", "resolvido", "fechado"] as const).map((s) => (
                        <Button
                          key={s}
                          size="sm"
                          variant={t.status === s ? "default" : "outline"}
                          disabled={updateMutation.isPending}
                          onClick={() => updateMutation.mutate({ id: t.id, status: s, adminResponse: response.trim() || undefined })}
                          className="h-8 rounded-lg text-[10px] font-black uppercase"
                        >
                          {STATUS[s].label}
                        </Button>
                      ))}
                      {response.trim() && (
                        <Button
                          size="sm"
                          disabled={updateMutation.isPending}
                          onClick={() => updateMutation.mutate({ id: t.id, status: t.status, adminResponse: response.trim() })}
                          className="h-8 rounded-lg text-[10px] font-black uppercase gap-1 bg-indigo-600 hover:bg-indigo-500 text-white"
                        >
                          <Send size={12} /> Salvar resposta
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                <button
                  onClick={() => { setOpenId(expanded ? null : t.id); setResponse(t.adminResponse || ""); }}
                  className="text-[11px] font-bold text-primary mt-3 hover:underline"
                >
                  {expanded ? "Fechar" : "Abrir / responder"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
