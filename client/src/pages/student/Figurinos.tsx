import { trpc } from "@/lib/trpc";
import { Loader2, Shirt, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/money";
import { format } from "date-fns";
import { formatDateOnly } from "@/lib/dates";

const TYPE_LABEL: Record<string, string> = {
  saia: "Saia", collant: "Collant", sapatilha: "Sapatilha", top: "Top",
  calca: "Calça", acessorio: "Acessório", uniforme: "Uniforme", outro: "Outro",
};

const SALE_STATUS_META: Record<string, { label: string; className: string }> = {
  pendente: { label: "Compra pendente", className: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
  pago: { label: "Compra paga", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
  cancelado: { label: "Compra cancelada", className: "bg-rose-500/10 text-rose-600 border-rose-500/30" },
};

export default function StudentFigurinos() {
  const { data: figurinos = [], isLoading } = trpc.figurinos.myFigurinos.useQuery();
  const { data: compras = [] } = trpc.figurinos.myPurchases.useQuery();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  const emPosse = figurinos.filter((item: any) => !item.returnedAt);
  const historico = figurinos.filter((item: any) => item.returnedAt);

  const renderCard = (item: any) => {
    const atrasado = !item.returnedAt && item.dueDate && new Date(item.dueDate).getTime() < Date.now();
    return (
      <Card key={item.id} className="border-none shadow-lg bg-card">
        <CardContent className="p-5 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-black text-foreground truncate">{item.costumeName}</h3>
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">
                {TYPE_LABEL[item.costumeType] ?? item.costumeType}
                {item.costumeSize ? ` · Tam. ${item.costumeSize}` : ""} · Qtd: {item.quantity}
              </p>
            </div>
            {item.returnedAt ? (
              <Badge variant="outline" className="shrink-0 text-[10px] font-black bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                Devolvido
              </Badge>
            ) : atrasado ? (
              <Badge variant="outline" className="shrink-0 text-[10px] font-black bg-rose-500/10 text-rose-600 border-rose-500/30">
                Devolução atrasada
              </Badge>
            ) : (
              <Badge variant="outline" className="shrink-0 text-[10px] font-black bg-blue-500/10 text-blue-600 border-blue-500/30">
                Em sua posse
              </Badge>
            )}
          </div>

          {item.coreografiaTitle && (
            <p className="text-xs font-medium text-muted-foreground truncate">🩰 {item.coreografiaTitle}</p>
          )}

          <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold text-muted-foreground pt-1">
            <span className="flex items-center gap-1">
              <Clock size={12} /> Retirado em {item.checkedOutAt ? format(new Date(item.checkedOutAt), "dd/MM/yyyy") : "-"}
            </span>
            {!item.returnedAt && item.dueDate && (
              <span className={cn("flex items-center gap-1", atrasado && "text-rose-600")}>
                {atrasado ? <AlertTriangle size={12} /> : <Clock size={12} />}
                Devolver até {formatDateOnly(item.dueDate)}
              </span>
            )}
            {item.returnedAt && (
              <span className="flex items-center gap-1 text-emerald-600">
                <CheckCircle2 size={12} /> Devolvido em {format(new Date(item.returnedAt), "dd/MM/yyyy")}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-8 pb-10">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-foreground flex items-center gap-2">
          <Shirt className="text-indigo-500" size={28} />
          Minha Loja
        </h1>
        <p className="text-muted-foreground font-medium mt-1">
          Peças em sua posse e histórico de devoluções.
        </p>
      </div>

      {figurinos.length === 0 ? (
        <div className="text-center py-20 rounded-3xl border-2 border-dashed border-border">
          <Shirt className="mx-auto text-muted-foreground opacity-20 mb-4" size={48} />
          <p className="font-black text-foreground">Nenhum figurino registrado</p>
          <p className="text-sm text-muted-foreground mt-1">
            Quando a escola emprestar uma peça para você, ela aparecerá aqui.
          </p>
        </div>
      ) : (
        <>
          {emPosse.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Em sua posse</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{emPosse.map(renderCard)}</div>
            </section>
          )}
          {historico.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Histórico</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 opacity-80">{historico.map(renderCard)}</div>
            </section>
          )}
        </>
      )}

      {/* Compras na Loja (inclui as do evento) */}
      {compras.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Minhas compras</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {compras.map((compra: any) => {
              const meta = SALE_STATUS_META[compra.status] ?? SALE_STATUS_META.pendente;
              return (
                <Card key={compra.id} className="border-none shadow-lg bg-card">
                  <CardContent className="p-5 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-black text-foreground truncate">
                          {compra.costumeName} <span className="text-muted-foreground font-bold">×{compra.quantity}</span>
                        </h3>
                        <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">
                          {TYPE_LABEL[compra.costumeType] ?? compra.costumeType}
                          {compra.costumeSize ? ` · Tam. ${compra.costumeSize}` : ""}
                        </p>
                      </div>
                      <Badge variant="outline" className={cn("shrink-0 text-[10px] font-black", meta.className)}>
                        {meta.label}
                      </Badge>
                    </div>
                    {compra.eventName && <p className="text-xs font-medium text-muted-foreground truncate">🎭 {compra.eventName}</p>}
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs font-bold text-muted-foreground">
                        {compra.paymentMode === "mensalidade" ? "Junto com a mensalidade" : "Cobrança avulsa"}
                      </span>
                      <span className="text-sm font-black text-indigo-600 dark:text-indigo-400">{formatBRL(compra.totalPrice)}</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
