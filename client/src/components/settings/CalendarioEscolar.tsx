import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { SCHOOL_HOLIDAY_TYPES, holidayTypeLabel, monthGrid, type SchoolHolidayType } from "@shared/schoolCalendar";

const MONTH_NAMES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const WEEKDAY_LABELS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

/** Cores por tipo — usadas na agenda mobile e nas marcações do calendário. */
const TYPE_STYLES: Record<SchoolHolidayType, { chip: string; dot: string }> = {
  recesso: { chip: "bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40", dot: "bg-amber-500" },
  feriado_nacional: { chip: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40", dot: "bg-emerald-500" },
  feriado_estadual: { chip: "bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border border-cyan-500/40", dot: "bg-cyan-500" },
  feriado_municipal: { chip: "bg-fuchsia-500/20 text-fuchsia-700 dark:text-fuchsia-300 border border-fuchsia-500/40", dot: "bg-fuchsia-500" },
  evento: { chip: "bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/40", dot: "bg-rose-500" },
};

interface HolidayRow {
  id: number;
  date: string;
  name: string;
  type: string;
}

/** Data padrão de lançamento para o ano visualizado (mesmo mês/dia de hoje, com clamp de dia). */
function defaultDateForYear(targetYear: number) {
  const hoje = new Date();
  const mes = hoje.getMonth() + 1;
  const ultimoDia = new Date(targetYear, mes, 0).getDate();
  const dia = Math.min(hoje.getDate(), ultimoDia);
  return `${targetYear}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

export function CalendarioEscolar() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const utils = trpc.useUtils();

  const [year, setYear] = useState(() => new Date().getFullYear());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [novoNome, setNovoNome] = useState("");
  const [novoTipo, setNovoTipo] = useState<SchoolHolidayType>("feriado_nacional");
  const [dataLancamento, setDataLancamento] = useState(() => defaultDateForYear(new Date().getFullYear()));

  const { data: holidays = [], isLoading } = trpc.schoolHolidays.list.useQuery({ year }, { staleTime: 30_000 });

  const porData = useMemo(() => {
    const map = new Map<string, HolidayRow[]>();
    for (const h of holidays as HolidayRow[]) {
      if (!map.has(h.date)) map.set(h.date, []);
      map.get(h.date)!.push(h);
    }
    return map;
  }, [holidays]);

  const invalidate = () => utils.schoolHolidays.list.invalidate();

  const createMutation = trpc.schoolHolidays.create.useMutation({
    onSuccess: () => {
      toast.success("Data adicionada ao calendário!");
      setNovoNome("");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.schoolHolidays.delete.useMutation({
    onSuccess: () => {
      toast.success("Data removida.");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const seedMutation = trpc.schoolHolidays.seedNational.useMutation({
    onSuccess: (r) => {
      toast.success(r.inserted > 0 ? `${r.inserted} feriados nacionais importados!` : "Todos os feriados nacionais deste ano já estavam no calendário.");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const doAdd = (date: string) => {
    if (!date) return toast.error("Escolha uma data para o lançamento.");
    if (novoNome.trim().length < 2) return toast.error("Dê um nome para a data (ex.: Recesso de julho).");
    createMutation.mutate({ date, name: novoNome.trim(), type: novoTipo });
  };

  const dayEntries = selectedDate ? porData.get(selectedDate) || [] : [];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* Cabeçalho */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 flex items-center justify-center">
            <CalendarDays size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-foreground">Calendário Escolar</h3>
            <p className="text-xs text-muted-foreground font-medium">Feriados, recessos e eventos da escola — aparece na agenda mobile de toda a equipe.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-2xl border border-border bg-card px-1.5 py-1">
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl" onClick={() => setYear((y) => y - 1)} aria-label="Ano anterior">
              <ChevronLeft size={16} />
            </Button>
            <span className="px-2 text-sm font-black text-foreground tabular-nums">{year}</span>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl" onClick={() => setYear((y) => y + 1)} aria-label="Próximo ano">
              <ChevronRight size={16} />
            </Button>
          </div>

          {isAdmin && (
            <>
              <Button
                variant="outline"
                className="h-10 rounded-2xl text-xs font-bold gap-2"
                onClick={() => seedMutation.mutate({ year })}
                disabled={seedMutation.isPending}
              >
                {seedMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                Feriados nacionais
              </Button>
              <Button
                className="h-10 rounded-2xl text-xs font-bold gap-2"
                onClick={() => {
                  const date = defaultDateForYear(year);
                  setSelectedDate(date);
                  setDataLancamento(date);
                  setNovoNome("");
                  setNovoTipo("recesso");
                }}
              >
                <Plus size={14} /> Adicionar data
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Legenda */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-border/70 bg-card/50 px-4 py-3">
        {SCHOOL_HOLIDAY_TYPES.map((t) => (
          <span key={t.id} className="flex items-center gap-2 text-[11px] font-bold text-muted-foreground">
            <span className={cn("w-3 h-3 rounded-full", TYPE_STYLES[t.id].dot)} />
            {t.label === "Feriado Nacional" ? "Feriados Nacionais" : t.label === "Feriado Estadual" ? "Feriados Estaduais" : t.label === "Feriado Municipal" ? "Feriados Municipais" : t.label === "Evento da Escola" ? "Eventos da Escola" : t.label}
          </span>
        ))}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-64 rounded-3xl bg-muted/60 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {MONTH_NAMES.map((nomeMes, idx) => {
            const mes = idx + 1;
            const cells = monthGrid(year, mes);
            return (
              <div key={mes} className="rounded-3xl border border-border/60 bg-card/50 p-3.5">
                <p className="text-sm font-black text-foreground mb-2 px-1">
                  {nomeMes} <span className="text-muted-foreground font-bold">/ {year}</span>
                </p>
                <div className="grid grid-cols-7 gap-1 mb-1">
                  {WEEKDAY_LABELS.map((d) => (
                    <span key={d} className="text-[9px] font-black text-muted-foreground/70 text-center">
                      {d}
                    </span>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {cells.map((cell, i) => {
                    if (!cell) return <span key={i} className="h-9 sm:h-10" />;
                    const entries = porData.get(cell.date) || [];
                    const principal = entries[0];
                    const style = principal ? TYPE_STYLES[principal.type as SchoolHolidayType] || TYPE_STYLES.feriado_nacional : null;
                    return (
                      <button
                        key={i}
                        type="button"
                        title={entries.map((e) => `${e.name} (${holidayTypeLabel(e.type)})`).join(" • ") || undefined}
                        onClick={() => {
                          if (!isAdmin && !entries.length) return;
                          setSelectedDate(cell.date);
                          setDataLancamento(cell.date);
                          setNovoNome("");
                          setNovoTipo(entries.length ? "evento" : "recesso");
                        }}
                        className={cn(
                          "h-9 sm:h-10 rounded-lg text-xs font-bold tabular-nums transition-colors flex items-center justify-center relative",
                          entries.length
                            ? style!.chip
                            : "text-muted-foreground hover:bg-muted/60",
                          isAdmin || entries.length ? "cursor-pointer" : "cursor-default"
                        )}
                      >
                        {cell.day}
                        {entries.length > 1 && (
                          <span className="absolute bottom-0.5 right-1 flex gap-0.5">
                            {entries.slice(1, 3).map((e, k) => (
                              <span key={k} className={cn("w-1 h-1 rounded-full", (TYPE_STYLES[e.type as SchoolHolidayType] || TYPE_STYLES.feriado_nacional).dot)} />
                            ))}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dialog do dia */}
      <Dialog open={!!selectedDate} onOpenChange={(open) => !open && setSelectedDate(null)}>
        <DialogContent className="sm:max-w-[440px] bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <CalendarDays size={18} className="text-blue-500" />
              {selectedDate && selectedDate.split("-").reverse().join("/")}
            </DialogTitle>
            <DialogDescription className="text-xs">Marque feriados, recessos e eventos da escola neste dia.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {dayEntries.length > 0 && (
              <div className="space-y-2">
                {dayEntries.map((e) => {
                  const style = TYPE_STYLES[e.type as SchoolHolidayType] || TYPE_STYLES.feriado_nacional;
                  return (
                    <div key={e.id} className={cn("flex items-center justify-between gap-2 rounded-2xl px-3 py-2.5", style.chip)}>
                      <div className="min-w-0">
                        <p className="text-sm font-bold truncate">{e.name}</p>
                        <p className="text-[10px] font-black uppercase tracking-widest opacity-80">{holidayTypeLabel(e.type)}</p>
                      </div>
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-xl text-rose-600 hover:text-rose-700 hover:bg-rose-500/10 shrink-0"
                          onClick={() => deleteMutation.mutate({ id: e.id })}
                          disabled={deleteMutation.isPending}
                          aria-label={`Remover ${e.name}`}
                        >
                          <Trash2 size={14} />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {isAdmin && (
              <div className="space-y-2 rounded-2xl border border-border/70 bg-muted/20 p-3">
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.15em]">Adicionar neste dia</p>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.15em]">Data do lançamento</label>
                  <Input
                    type="date"
                    value={dataLancamento}
                    onChange={(e) => {
                      setDataLancamento(e.target.value);
                      if (e.target.value) setSelectedDate(e.target.value);
                    }}
                    className="h-10 rounded-xl"
                  />
                </div>
                <Input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Ex.: Recesso de julho / Ensaio geral" className="h-10 rounded-xl" />
                <div className="flex flex-wrap gap-1.5">
                  {SCHOOL_HOLIDAY_TYPES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setNovoTipo(t.id)}
                      className={cn(
                        "px-2.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wide border transition-colors",
                        novoTipo === t.id ? TYPE_STYLES[t.id].chip : "border-border text-muted-foreground hover:bg-muted/50"
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <Button
                  className="w-full h-10 rounded-xl text-xs font-bold gap-2"
                  onClick={() => doAdd(dataLancamento)}
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  Adicionar ao calendário
                </Button>
              </div>
            )}

            {!isAdmin && dayEntries.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">Nenhuma marcação neste dia.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
