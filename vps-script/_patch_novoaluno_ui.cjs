// UI: substitui o select "Recorrência Semanal" por intervalo+duração+preview; oculta dias na semana no mensal_fixo.
const fs = require('fs');
const p = 'client/src/pages/NovoAluno.tsx';
let s = fs.readFileSync(p, 'utf8');
const done = [];
const sub = (name, re, repl) => {
  if (!re.test(s)) throw new Error('NAO ENCONTRADO: ' + name);
  s = s.replace(re, repl);
  done.push(name);
};

// 1) Bloco da recorrência: label → Repetir + intervalo + duração + preview
sub('bloco recorrencia', /<label className="text-\[10px\] font-black text-muted-foreground uppercase tracking-\[0\.15em\] ml-1">Recorr[\s\S]*?semanas\.[\s\S]*?<\/p>\r?\n(\s*)<\/div>/,
`<label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.15em] ml-1">Repetir</label>
                    <Select
                      value={scheduleForm.interval}
                      onValueChange={(v) => {
                        const nextInterval = v as RecurrenceInterval;
                        const opts = RECURRENCE_DURATIONS[nextInterval];
                        const validCount = opts.some((o) => o.value === scheduleForm.recurrenceCount) ? scheduleForm.recurrenceCount : opts[0].value;
                        updateSchedule(p => ({ ...p, interval: nextInterval, recurrenceCount: validCount }));
                      }}
                    >
                      <SelectTrigger className="h-12 rounded-xl border-border bg-muted/30 text-sm font-semibold px-4">
                        <div className="flex items-center gap-2">
                          <RefreshCw size={14} className="text-muted-foreground" />
                          <SelectValue />
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        {RECURRENCE_INTERVALS.map((i) => (
                          <SelectItem key={i.id} value={i.id}>{i.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {isScheduleBatch && (
                      <>
                        <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.15em] ml-1 pt-1">Gerar por</label>
                        <Select
                          value={String(scheduleRecurrenceDuration)}
                          onValueChange={(v) => updateSchedule(p => (p.interval === "semanal" ? { ...p, weeksCount: Number(v) } : { ...p, recurrenceCount: Number(v) }))}
                        >
                          <SelectTrigger className="h-12 rounded-xl border-border bg-muted/30 text-sm font-semibold px-4">
                            <div className="flex items-center gap-2">
                              <CalendarRange size={14} className="text-muted-foreground" />
                              <SelectValue />
                            </div>
                          </SelectTrigger>
                          <SelectContent>
                            {(scheduleForm.interval === "semanal"
                              ? [{ value: 1, label: "1 vez (aula avulsa)" }, ...RECURRENCE_DURATIONS.semanal]
                              : RECURRENCE_DURATIONS[scheduleForm.interval]
                            ).map((o) => (
                              <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {scheduleOccurrences.length > 0 && (
                          <p className={cn("text-xs font-bold ml-1 flex items-center gap-1", scheduleExceedsLimit ? "text-rose-600" : "text-violet-600")}>
                            <CalendarRange size={12} />
                            {scheduleExceedsLimit
                              ? \`Limite de \${MAX_OCCURRENCES} aulas excedido (\${scheduleOccurrences.length}). Reduza a duração ou os dias por semana.\`
                              : \`\${scheduleOccurrences.length} aula(s) serão criadas · de \${format(scheduleOccurrences[0].date, "dd/MM/yyyy")} até \${format(scheduleOccurrences[scheduleOccurrences.length - 1].date, "dd/MM/yyyy")}.\`}
                          </p>
                        )}
                        {scheduleForm.interval === "mensal_fixo" && (
                          <p className="text-xs text-muted-foreground font-medium ml-1">No modo mensal (dia fixo), a série usa a data inicial selecionada — os dias da semana não se aplicam.</p>
                        )}
                      </>
                    )}
$1</div>`);

// 2) Oculta "Aulas na Mesma Semana" no modo mensal_fixo (abertura) — atenção ao } do comentário
sub('secao wrap open', /(\{\/\* Aulas na Mesma Semana \*\/\}\r?\n)(\s*)<div className="p-4 bg-primary\/5 border border-primary\/20 rounded-2xl space-y-3">/,
`$1{scheduleForm.interval !== "mensal_fixo" && (
$2<div className="p-4 bg-primary/5 border border-primary/20 rounded-2xl space-y-3">`);

// 3) Fecha o wrapper condicional (antes do comentário de Observações)
sub('secao wrap close', /(\)\}\r?\n\s*)<\/div>\r?\n(\s*)\{\/\* Observa/,
`$1</div>
$2)}
$2{/* Observa`);

fs.writeFileSync(p, s, 'utf8');
console.log('OK:', done.join(' | '));
