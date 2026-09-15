import { trpc } from "@/lib/trpc";
import { LifeBuoy, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS: Record<string, { label: string; cls: string }> = {
  aberto: { label: "Aberto", cls: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  em_andamento: { label: "Em andamento", cls: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  resolvido: { label: "Resolvido", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  fechado: { label: "Fechado", cls: "bg-muted text-muted-foreground border-border" },
};

function parseAttachments(raw: any): string[] {
  if (!raw) return [];
  try { const a = JSON.parse(raw); return Array.isArray(a) ? a : []; } catch { return []; }
}

export function MyTicketsList() {
  const { data: tickets = [], isLoading } = trpc.support.listMine.useQuery();
  return (
    <div className="bg-card p-6 rounded-3xl border border-border/50 shadow-sm space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
          <LifeBuoy size={18} />
        </div>
        <div>
          <h4 className="text-sm font-bold text-foreground">Meus chamados</h4>
          <p className="text-xs text-muted-foreground">Acompanhe bugs reportados e sugestões enviadas.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="animate-spin text-primary" size={20} /></div>
      ) : tickets.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-2">
          Nenhum chamado ainda. Use o botão <strong>Suporte</strong> no topo para abrir um.
        </p>
      ) : (
        <div className="space-y-2">
          {tickets.map((t: any) => {
            const s = STATUS[t.status] ?? STATUS.aberto;
            return (
              <div key={t.id} className="flex items-start justify-between gap-3 rounded-2xl bg-muted/20 border border-border/40 p-3">
                <div className="min-w-0">
                  <p className="text-xs font-black text-foreground truncate">{t.title}</p>
                  <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">{t.description}</p>
                  {(() => {
                    const atts = parseAttachments(t.attachments);
                    return atts.length > 0 ? (
                      <div className="flex gap-1.5 flex-wrap mt-1.5">
                        {atts.map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-lg overflow-hidden border border-border/50">
                            <img src={url} alt={`anexo ${i + 1}`} className="w-full h-full object-cover" />
                          </a>
                        ))}
                      </div>
                    ) : null;
                  })()}
                  <p className="text-[9px] text-muted-foreground/60 mt-1 uppercase tracking-wider">
                    {new Date(t.createdAt).toLocaleDateString("pt-BR")}
                  </p>
                  {t.adminResponse && (
                    <p className="text-[10px] text-indigo-500 mt-1.5 border-l-2 border-indigo-500/30 pl-2">
                      Resposta: {t.adminResponse}
                    </p>
                  )}
                </div>
                <span className={cn("text-[9px] font-black uppercase px-2 py-0.5 rounded-lg border shrink-0", s.cls)}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
