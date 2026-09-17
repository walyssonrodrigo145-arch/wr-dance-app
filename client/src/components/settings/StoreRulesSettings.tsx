import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, Save, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface StoreRules {
  enableStoreSales: boolean;
  enableEventSales: boolean;
  allowMonthlyPayment: boolean;
  allowStandalonePayment: boolean;
  allowMadeToOrder: boolean;
  requireActiveStudent: boolean;
  allowDiscount: boolean;
  maxDiscountPercent: number;
}

/**
 * Regras de venda da Loja (Configurações → Loja).
 * Todas são aplicadas no backend a cada venda (figurinos.sell) — não são apenas visuais.
 */
export function StoreRulesSettings() {
  const utils = trpc.useUtils();
  const { data: rules, isLoading } = trpc.settings.getStoreRules.useQuery();
  const [draft, setDraft] = useState<StoreRules | null>(null);

  useEffect(() => {
    if (rules) setDraft({ ...(rules as StoreRules) });
  }, [rules]);

  const updateRules = trpc.settings.updateStoreRules.useMutation({
    onSuccess: () => {
      toast.success("Regras da Loja atualizadas!");
      utils.settings.getStoreRules.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  if (isLoading || !draft) {
    return <div className="flex justify-center py-6"><Loader2 className="animate-spin text-primary" size={22} /></div>;
  }

  const set = (key: keyof StoreRules, value: boolean | number) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const Row = ({ title, description, children }: { title: string; description: string; children: React.ReactNode }) => (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-card p-4">
      <div className="min-w-0">
        <p className="text-sm font-bold text-foreground">{title}</p>
        <p className="text-[11px] text-muted-foreground font-medium mt-0.5">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base lg:text-lg font-black text-foreground uppercase tracking-widest flex items-center gap-2">
            <ShoppingBag size={18} className="text-indigo-500" /> Regras de venda da Loja
          </h3>
          <p className="text-[11px] text-muted-foreground font-medium mt-1.5">
            Valem para a venda de figurinos e produtos — na Loja e dentro dos eventos. São aplicadas pelo sistema no momento da venda.
          </p>
        </div>
        <Button
          className="gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 h-11 px-6 shadow-lg shadow-indigo-500/20 shrink-0"
          disabled={updateRules.isPending}
          onClick={() => updateRules.mutate({ rules: draft })}
        >
          {updateRules.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Salvar regras
        </Button>
      </div>

      <div className="space-y-3">
        <Row title="Vender na Loja" description="Permite registrar vendas direto na aba Loja (fora de eventos).">
          <Switch checked={draft.enableStoreSales} onCheckedChange={(checked) => set("enableStoreSales", checked)} />
        </Row>

        <Row title="Vender dentro de eventos" description="Permite usar a Loja do evento para vender aos participantes.">
          <Switch checked={draft.enableEventSales} onCheckedChange={(checked) => set("enableEventSales", checked)} />
        </Row>

        <Row title="Pagar junto com a mensalidade" description="Permite lançar a venda para pagamento na próxima mensalidade do aluno.">
          <Switch checked={draft.allowMonthlyPayment} onCheckedChange={(checked) => set("allowMonthlyPayment", checked)} />
        </Row>

        <Row title="Cobrança avulsa" description="Permite registrar a venda como cobrança separada (PIX/boleto/cartão).">
          <Switch checked={draft.allowStandalonePayment} onCheckedChange={(checked) => set("allowStandalonePayment", checked)} />
        </Row>

        <Row title="Venda sob encomenda" description="Quando o estoque acabar, ainda é possível vender (o item fica marcado como sob encomenda).">
          <Switch checked={draft.allowMadeToOrder} onCheckedChange={(checked) => set("allowMadeToOrder", checked)} />
        </Row>

        <Row title="Somente alunos ativos" description="Bloqueia a venda para alunos inativos ou pausados.">
          <Switch checked={draft.requireActiveStudent} onCheckedChange={(checked) => set("requireActiveStudent", checked)} />
        </Row>

        <Row title="Permitir desconto" description="Habilita desconto percentual na venda, respeitando o limite abaixo.">
          <Switch checked={draft.allowDiscount} onCheckedChange={(checked) => set("allowDiscount", checked)} />
        </Row>

        {draft.allowDiscount && (
          <div className="rounded-xl border border-border bg-card p-4 space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Desconto máximo (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={String(draft.maxDiscountPercent)}
              onChange={(event) => set("maxDiscountPercent", Math.max(0, Math.min(100, Number(event.target.value) || 0)))}
              className="h-11 rounded-xl w-full sm:w-40 font-bold"
            />
          </div>
        )}
      </div>
    </div>
  );
}
