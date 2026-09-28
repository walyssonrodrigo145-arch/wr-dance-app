import { useMemo, useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DanceProLogo } from "@/components/DanceProLogo";
import { Gift, Loader2, CheckCircle2, ArrowRight, Sparkles } from "lucide-react";

/** Página pública do programa Indique e Ganhe (/indique?code=XXXX). */
export default function Indique() {
  const code = useMemo(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("code")?.trim() || "";
  }, []);

  const { data: info, isLoading } = trpc.referral.publicInfo.useQuery(
    { code },
    { enabled: code.length >= 3, retry: false }
  );

  const [form, setForm] = useState({ schoolName: "", email: "", phone: "" });
  const [done, setDone] = useState(false);

  const register = trpc.referral.publicRegister.useMutation({
    onSuccess: () => setDone(true),
    onError: (e: { message?: string }) => toast.error(e.message || "Não foi possível enviar a indicação."),
  });

  const submit = () => {
    if (form.schoolName.trim().length < 2) { toast.error("Informe o nome da sua escola."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) { toast.error("Informe um e-mail válido."); return; }
    register.mutate({ code, schoolName: form.schoolName, email: form.email, phone: form.phone || undefined });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/50 py-5">
        <div className="container flex items-center justify-between">
          <Link href="/"><DanceProLogo size="md" /></Link>
          <Link href="/" className="text-xs font-bold text-muted-foreground hover:text-primary">Voltar ao site</Link>
        </div>
      </header>

      <main className="container max-w-2xl py-14 space-y-8">
        <div className="text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
            <Gift size={26} />
          </div>
          <h1 className="text-3xl md:text-4xl font-outfit font-extrabold tracking-tight">Indique e Ganhe</h1>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Você foi convidada por uma escola de dança para conhecer o DancePro — o sistema que organiza turmas,
            chamada, figurino, espetáculo e mensalidades em um só lugar.
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground text-sm">
            <Loader2 size={16} className="animate-spin" /> Conferindo o convite...
          </div>
        ) : !code || !info ? (
          <div className="rounded-3xl border border-amber-500/30 bg-amber-500/5 p-6 text-center space-y-3">
            <p className="text-sm font-bold text-foreground">Convite inválido ou expirado.</p>
            <p className="text-xs text-muted-foreground">Peça um novo link para a escola que te indicou ou conheça o DancePro diretamente.</p>
            <Link href="/"><Button className="h-10 rounded-xl px-5 text-xs font-bold gap-2">Conhecer o DancePro <ArrowRight size={14} /></Button></Link>
          </div>
        ) : done ? (
          <div className="rounded-3xl border border-emerald-500/30 bg-emerald-500/5 p-8 text-center space-y-3">
            <CheckCircle2 size={32} className="text-emerald-600 mx-auto" />
            <p className="text-lg font-black text-foreground">Indicação registrada!</p>
            <p className="text-sm text-muted-foreground">
              A escola <strong className="text-foreground">{info.schoolName}</strong> vai receber o crédito quando você criar sua conta
              no DancePro usando este e-mail. Crie sua conta e comece os 7 dias grátis.
            </p>
            <Link href="/cadastro"><Button className="h-10 rounded-xl px-5 text-xs font-bold gap-2">Criar minha conta <ArrowRight size={14} /></Button></Link>
          </div>
        ) : (
          <>
            <div className="rounded-3xl border border-primary/20 bg-primary/5 p-5 flex items-start gap-3">
              <Sparkles size={18} className="text-primary mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-bold text-foreground">Convite de {info.schoolName}</p>
                <p className="text-muted-foreground text-xs mt-1">
                  Preencha os dados da sua escola, crie a conta com este e-mail e pronto: você entra com 7 dias grátis e quem
                  te indicou ganha um mês grátis. Simples assim.
                </p>
              </div>
            </div>

            <div className="rounded-3xl border border-border/60 bg-card/60 p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Nome da sua escola *</label>
                <Input value={form.schoolName} onChange={(e) => setForm({ ...form, schoolName: e.target.value })} placeholder="Ex: Studio Passo a Passo" className="h-11 rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Seu e-mail *</label>
                <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="voce@suaescola.com.br" className="h-11 rounded-xl" />
                <p className="text-[10px] text-muted-foreground">Use o mesmo e-mail no cadastro para o crédito valer.</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">WhatsApp (opcional)</label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(00) 00000-0000" className="h-11 rounded-xl" />
              </div>
              <Button type="button" onClick={submit} disabled={register.isPending} className="w-full h-11 rounded-xl text-xs font-bold gap-2">
                {register.isPending ? <Loader2 size={14} className="animate-spin" /> : <Gift size={14} />}
                Registrar indicação
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
