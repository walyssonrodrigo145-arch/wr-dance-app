import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Gift, Copy, MessageCircle, Loader2, CheckCircle2, Clock, Star } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_META: Record<string, { label: string; cls: string; icon: typeof Clock }> = {
  pendente: { label: "Aguardando cadastro", cls: "bg-amber-500/10 text-amber-600 border-amber-500/20", icon: Clock },
  convertido: { label: "Convertida — prêmio a aplicar", cls: "bg-blue-500/10 text-blue-600 border-blue-500/20", icon: CheckCircle2 },
  creditado: { label: "Prêmio aplicado", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", icon: Star },
  expirado: { label: "Expirada", cls: "bg-muted text-muted-foreground border-border", icon: Clock },
};

/** Painel da escola: Indique e Ganhe (/indicacoes). */
export default function Indicacoes() {
  const { data: myCode, isLoading: loadingCode } = trpc.referral.getMyCode.useQuery();
  const { data: list = [], isLoading } = trpc.referral.list.useQuery();
  const [copied, setCopied] = useState(false);

  const link = myCode?.link || "";
  const converted = (list as any[]).filter((r) => r.status === "convertido" || r.status === "creditado").length;
  const pending = (list as any[]).filter((r) => r.status === "pendente").length;
  const earned = (list as any[])
    .filter((r) => r.status === "creditado")
    .reduce((sum: number, r: any) => sum + (r.rewardValue || 1), 0);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Link copiado!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar — selecione o link manualmente.");
    }
  };

  const shareWhatsApp = () => {
    const text = encodeURIComponent(
      `Conheça o DancePro, o sistema que organiza nossa escola de dança (turmas, chamada, figurino e mensalidades): ${link}`
    );
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
          <Gift size={20} />
        </div>
        <div>
          <h1 className="text-xl font-black text-foreground tracking-tight">Indique e Ganhe</h1>
          <p className="text-xs text-muted-foreground font-medium">
            Indique uma escola de dança e ganhe um mês grátis quando ela entrar.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-border/60 bg-card/60 p-4 text-center">
          <p className="text-2xl font-black text-foreground">{pending}</p>
          <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mt-1">Aguardando</p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card/60 p-4 text-center">
          <p className="text-2xl font-black text-blue-600">{converted}</p>
          <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mt-1">Convertidas</p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card/60 p-4 text-center">
          <p className="text-2xl font-black text-emerald-600">{earned}</p>
          <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mt-1">Meses ganhos</p>
        </div>
      </div>

      <div className="rounded-3xl border border-primary/20 bg-primary/5 p-5 space-y-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-primary">Seu link de indicação</p>
        {loadingCode ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 size={14} className="animate-spin" /> Gerando seu link...
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <code className="flex-1 min-w-[220px] rounded-xl border border-border/60 bg-background px-3 py-2.5 text-[11px] font-mono text-foreground truncate">
                {link}
              </code>
              <Button type="button" variant="outline" onClick={copyLink} className="h-10 rounded-xl px-4 text-xs font-bold gap-2">
                {copied ? <CheckCircle2 size={14} className="text-emerald-600" /> : <Copy size={14} />} Copiar
              </Button>
              <Button type="button" onClick={shareWhatsApp} className="h-10 rounded-xl px-4 text-xs font-bold gap-2 bg-emerald-600 hover:bg-emerald-700">
                <MessageCircle size={14} /> WhatsApp
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Código: <strong className="text-foreground">{myCode?.code}</strong> • A escola indicada deve se cadastrar com o e-mail
              informado no convite para a indicação contar.
            </p>
          </>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Indicações recebidas</p>
        {isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-6 justify-center">
            <Loader2 size={14} className="animate-spin" /> Carregando...
          </div>
        ) : (list as any[]).length === 0 ? (
          <div className="rounded-2xl border border-border/60 bg-muted/30 p-6 text-center">
            <p className="text-xs font-bold text-foreground">Nenhuma indicação ainda.</p>
            <p className="text-[10px] text-muted-foreground mt-1">Compartilhe seu link no WhatsApp com outras escolas de dança.</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-border/60 overflow-hidden divide-y divide-border/40">
            {(list as any[]).map((r) => {
              const meta = STATUS_META[r.status] || STATUS_META.pendente;
              const Icon = meta.icon;
              return (
                <div key={r.id} className="flex items-center gap-3 px-3.5 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-foreground truncate">{r.referredName}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{r.referredEmail}</p>
                  </div>
                  <span className={cn("shrink-0 px-2 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest flex items-center gap-1", meta.cls)}>
                    <Icon size={10} /> {meta.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Como funciona:</strong> cada escola indicada que criar conta com o e-mail do convite
          gera <strong className="text-foreground">1 mês grátis</strong> para você, aplicado pela equipe DancePro na sua próxima fatura.
          Indicações sem cadastro ficam como "aguardando".
        </p>
      </div>
    </div>
  );
}
