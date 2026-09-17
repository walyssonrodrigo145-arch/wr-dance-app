import { useMemo } from "react";
import { Loader2, ShoppingBag, Wallet, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useDashboardPrefs } from "@/hooks/useDashboardPrefs";

const SALE_STATUS_META: Record<string, { label: string; className: string }> = {
  pendente: { label: "Pendente", className: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
  pago: { label: "Paga", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
  cancelado: { label: "Cancelada", className: "bg-rose-500/10 text-rose-600 border-rose-500/30" },
};

const PROVIDER_LABEL: Record<string, string> = {
  asaas: "Asaas",
  mercadopago: "Mercado Pago",
  infinitepay: "InfinitePay",
  pixkey: "Chave PIX",
};

interface VendasLojaTabProps {
  viewMonth: number;
  viewYear: number;
  sales: any[];
  isLoading: boolean;
}

/**
 * Vendas da Loja no Financeiro — reflete automaticamente tudo que é vendido
 * (Loja e Loja do evento). Vendas pagas entram no saldo líquido do mês.
 */
export function VendasLojaTab({ viewMonth, viewYear, sales, isLoading }: VendasLojaTabProps) {
  const { maskBRL } = useDashboardPrefs();

  const monthSales = useMemo(() => {
    return sales.filter((sale) => {
      const date = new Date(sale.createdAt);
      return date.getMonth() + 1 === viewMonth && date.getFullYear() === viewYear;
    });
  }, [sales, viewMonth, viewYear]);

  const totals = useMemo(() => {
    const valid = monthSales.filter((sale) => sale.status !== "cancelado");
    return {
      total: valid.reduce((acc, sale) => acc + Number(sale.totalPrice), 0),
      recebido: valid.filter((sale) => sale.status === "pago").reduce((acc, sale) => acc + Number(sale.totalPrice), 0),
      pendente: valid.filter((sale) => sale.status === "pendente").reduce((acc, sale) => acc + Number(sale.totalPrice), 0),
    };
  }, [monthSales]);

  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" size={32} /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-500/10 to-background p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
            <ShoppingBag size={13} /> Vendido no mês
          </p>
          <p className="text-xl font-black text-foreground mt-1">{maskBRL(totals.total)}</p>
        </div>
        <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-background p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 flex items-center gap-1.5">
            <Wallet size={13} /> Recebido (no saldo)
          </p>
          <p className="text-xl font-black text-foreground mt-1">{maskBRL(totals.recebido)}</p>
        </div>
        <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-background p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 flex items-center gap-1.5">
            <Clock size={13} /> A receber
          </p>
          <p className="text-xl font-black text-foreground mt-1">{maskBRL(totals.pendente)}</p>
        </div>
      </div>

      {monthSales.length === 0 ? (
        <div className="text-center py-16 rounded-3xl border-2 border-dashed border-border">
          <ShoppingBag className="mx-auto text-muted-foreground opacity-20 mb-3" size={44} />
          <p className="font-black text-foreground">Nenhuma venda da Loja neste mês</p>
          <p className="text-sm text-muted-foreground mt-1">
            As vendas feitas na Loja e nos eventos aparecem aqui automaticamente.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {monthSales.map((sale) => {
            const statusMeta = SALE_STATUS_META[sale.status] ?? SALE_STATUS_META.pendente;
            return (
              <div key={sale.id} className="rounded-2xl border border-border bg-card p-4 flex flex-col lg:flex-row lg:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-foreground truncate">
                    {sale.costumeName} <span className="text-muted-foreground font-bold">×{sale.quantity}</span>
                    <span className="text-indigo-600 dark:text-indigo-400 ml-2">{maskBRL(Number(sale.totalPrice))}</span>
                  </p>
                  <p className="text-[11px] font-bold text-muted-foreground mt-0.5 truncate">
                    {sale.studentName}
                    {sale.eventName ? ` · ${sale.eventName}` : ""}
                    {" · "}{sale.paymentMode === "mensalidade" ? "junto com a mensalidade" : "cobrança avulsa"}
                    {sale.paymentProvider ? ` · ${PROVIDER_LABEL[sale.paymentProvider] ?? sale.paymentProvider}` : ""}
                  </p>
                </div>
                {sale.madeToOrder && (
                  <Badge variant="outline" className="w-fit text-[10px] font-black bg-amber-500/10 text-amber-600 border-amber-500/30">
                    Sob encomenda
                  </Badge>
                )}
                <Badge variant="outline" className={cn("w-fit text-[10px] font-black", statusMeta.className)}>
                  {statusMeta.label}
                </Badge>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
