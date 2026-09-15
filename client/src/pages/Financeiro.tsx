import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { ChevronLeft, ChevronRight, Wallet, BadgePercent } from "lucide-react";
import { useDashboardPrefs } from "@/hooks/useDashboardPrefs";
import { EyeToggleButton } from "@/components/dashboard/EyeToggleButton";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import MensalidadesTab from "./financeiro/MensalidadesTab";
import { DespesasTab } from "./financeiro/DespesasTab";

const MONTHS_FULL = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

export default function Financeiro() {
  const now = new Date();
  const { maskBRL } = useDashboardPrefs();
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1);
  const [viewYear, setViewYear] = useState(now.getFullYear());

  const { data: payments = [], isLoading: isLoadingPayments } = trpc.paymentDues.list.useQuery({ month: viewMonth, year: viewYear });
  const { data: expenses = [], isLoading: isLoadingExpenses } = trpc.expenses.list.useQuery({ month: viewMonth, year: viewYear });

  const prevMonth = () => {
    if (viewMonth === 1) { setViewMonth(12); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 12) { setViewMonth(1); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const saldoLiquido = useMemo(() => {
    // BUG#8 FIX: filtrar alunos inativos para consistência com os cards de métricas
    // Os cards de Pendente/Atrasado/Previsto já excluem alunos inativos (p.studentStatus === 'ativo')
    // O "Recebido" inclui todos os pagamentos confirmados (mesmo de inativos), pois o dinheiro já entrou
    const sumRecebido = payments.filter(p => p.status === "pago").reduce((acc, p) => acc + Number(p.amount), 0);
    const sumGasto = expenses.filter(p => p.status === "pago").reduce((acc, p) => acc + Number(p.amount), 0);
    return sumRecebido - sumGasto;
  }, [payments, expenses]);

  // Desconto efetivamente concedido no mês (pagamentos com desconto por antecipação)
  const descontoConcedido = useMemo(() => {
    return payments
      .filter((p: any) => p.status === "pago")
      .reduce((acc: number, p: any) => acc + Number(p.calculation?.earlyDiscountAmount ?? 0), 0);
  }, [payments]);

  return (
    <div className="flex flex-col h-full min-h-0 flex-1 overflow-hidden -m-4 sm:-m-6 bg-background">
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-4 lg:space-y-8 scrollbar-thin no-scrollbar">
        
        {/* Date Selector & Year Filter */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center justify-center gap-2 bg-card p-1.5 rounded-2xl border border-border shadow-sm flex-1">
             <Button variant="ghost" size="icon" onClick={prevMonth} className="h-8 w-8 rounded-lg shrink-0"><ChevronLeft size={16} /></Button>
             <h3 className="text-xs font-black text-foreground text-center uppercase tracking-widest truncate">
               {MONTHS_FULL[viewMonth-1]}
             </h3>
             <Button variant="ghost" size="icon" onClick={nextMonth} className="h-8 w-8 rounded-lg shrink-0"><ChevronRight size={16} /></Button>
          </div>

          <Select value={String(viewYear)} onValueChange={(val) => setViewYear(Number(val))}>
            <SelectTrigger className="h-12 px-4 rounded-2xl bg-card border-border shadow-sm text-xs font-black uppercase tracking-widest text-foreground w-[90px] shrink-0 cursor-pointer focus:ring-0 focus-visible:ring-0 focus-visible:border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-2xl border-border bg-card">
              {Array.from({ length: 11 }, (_, i) => now.getFullYear() - 5 + i).map((y) => (
                <SelectItem key={y} value={String(y)} className="text-xs font-black uppercase tracking-widest">
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <EyeToggleButton className="h-12 w-12 shrink-0" />
        </div>

        {/* Saldo Geral Líquido + Desconto Concedido */}
        <div id="tour-finance-cards" className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6">
          {/* Saldo Geral Líquido */}
          <div className={cn(
            "relative p-4 lg:p-8 rounded-2xl lg:rounded-[2rem] border shadow-sm overflow-hidden",
            saldoLiquido >= 0 ? "bg-gradient-to-br from-emerald-500/20 to-background border-emerald-500/30" : "bg-gradient-to-br from-rose-500/20 to-background border-rose-500/30"
          )}>
            <div className="flex items-center gap-3 relative z-10">
              <div className={cn(
                "w-10 h-10 lg:w-12 lg:h-12 rounded-2xl flex items-center justify-center shadow-sm shrink-0",
                saldoLiquido >= 0 ? "bg-emerald-500/20 text-emerald-600" : "bg-rose-500/20 text-rose-600"
              )}>
                <Wallet size={20} />
              </div>
              <div>
                <p className={cn("text-[10px] font-bold uppercase tracking-widest", saldoLiquido >= 0 ? "text-emerald-700" : "text-rose-700")}>Saldo Geral Líquido</p>
                <p className="text-xl lg:text-3xl font-black text-foreground mt-0.5">
                   {maskBRL(saldoLiquido)}
                </p>
                <p className="text-[10px] font-medium text-muted-foreground mt-0.5">Total recebido menos despesas pagas do mês.</p>
              </div>
            </div>
          </div>

          {/* Desconto Concedido no Mês */}
          <div className="relative p-4 lg:p-8 rounded-2xl lg:rounded-[2rem] border shadow-sm overflow-hidden bg-gradient-to-br from-amber-500/20 to-background border-amber-500/30">
            <div className="flex items-center gap-3 relative z-10">
              <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-2xl flex items-center justify-center shadow-sm shrink-0 bg-amber-500/20 text-amber-600">
                <BadgePercent size={20} />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700">Desconto Concedido</p>
                <p className="text-xl lg:text-3xl font-black text-foreground mt-0.5">
                   {maskBRL(descontoConcedido)}
                </p>
                <p className="text-[10px] font-medium text-muted-foreground mt-0.5">Descontos por pagamento antecipado no mês.</p>
              </div>
            </div>
          </div>
        </div>

        <Tabs id="tour-finance-tabs" defaultValue="mensalidades" className="w-full">
          <TabsList className="w-full lg:w-auto grid grid-cols-2 lg:inline-flex mb-6 rounded-2xl bg-muted/50 p-1">
            <TabsTrigger value="mensalidades" className="rounded-xl text-xs font-bold uppercase tracking-widest h-10 data-[state=active]:bg-card data-[state=active]:text-blue-600 data-[state=active]:shadow-sm">Emissões</TabsTrigger>
            <TabsTrigger value="despesas" className="rounded-xl text-xs font-bold uppercase tracking-widest h-10 data-[state=active]:bg-card data-[state=active]:text-orange-600 data-[state=active]:shadow-sm">Despesas</TabsTrigger>
          </TabsList>

          <TabsContent value="mensalidades" className="mt-0">
            <MensalidadesTab viewMonth={viewMonth} viewYear={viewYear} payments={payments} isLoading={isLoadingPayments} />
          </TabsContent>

          <TabsContent value="despesas" className="mt-0">
            <DespesasTab viewMonth={viewMonth} viewYear={viewYear} expenses={expenses} isLoading={isLoadingExpenses} />
          </TabsContent>
        </Tabs>

      </div>
    </div>
  );
}
