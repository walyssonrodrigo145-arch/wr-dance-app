import { useState, useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Plus, Trash2, AlertTriangle, Eye, Code2, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

export interface Exercise {
  title: string;
  subtitle?: string;
  duration?: string;
  points?: string[];
  icon?: string;
}
export interface DayPlan {
  dayName: string;
  focus?: { title: string; description: string };
  exercises?: Exercise[];
}
export interface StudyPlan {
  instrument?: string;
  level?: string;
  planMode?: string;
  weeklyGoal?: string;
  importantMessage?: string;
  days: DayPlan[];
}

function parsePlanData(planText: string | null | undefined): StudyPlan | null {
  if (!planText) return null;
  try {
    let cleanText = planText.trim();
    if (cleanText.startsWith("```")) {
      cleanText = cleanText.replace(/^```(json)?\n?/, "").replace(/\n?```$/, "").trim();
    }
    const parsed = JSON.parse(cleanText);
    if (!parsed || !Array.isArray(parsed.days) || parsed.days.length === 0) return null;
    // Normalize ensure 5 days
    while (parsed.days.length < 5) {
      parsed.days.push({ dayName: `Dia ${parsed.days.length + 1}`, focus: { title: "", description: "" }, exercises: [] });
    }
    if (parsed.days.length > 5) parsed.days.length = 5;
    // Normalize exercises/points
    for (const d of parsed.days) {
      if (!d.focus) d.focus = { title: "", description: "" };
      if (!Array.isArray(d.exercises)) d.exercises = [];
      for (const ex of d.exercises) {
        if (!Array.isArray(ex.points)) ex.points = [];
      }
    }
    return parsed as StudyPlan;
  } catch {
    return null;
  }
}

interface Props {
  planText: string;
  onSave: (newPlanText: string) => void;
  onCancel: () => void;
  isSaving?: boolean;
}

export function PlanEditor({ planText, onSave, onCancel, isSaving }: Props) {
  const initial = useMemo(() => parsePlanData(planText), [planText]);
  const [edited, setEdited] = useState<StudyPlan | null>(initial);
  const [activeDay, setActiveDay] = useState(0);
  const [showJson, setShowJson] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setEdited(parsePlanData(planText));
    setActiveDay(0);
    setErrors({});
  }, [planText]);

  if (!initial || !edited) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4 rounded-xl text-amber-800 dark:text-amber-200">
          <AlertTriangle size={18} className="shrink-0" />
          <p className="text-sm font-medium">Formato antigo — edição visual indisponível. Use o modo JSON.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowJson(!showJson)} className="gap-2">
            {showJson ? <Eye size={16} /> : <Code2 size={16} />} {showJson ? "Ocultar JSON" : "Ver JSON"}
          </Button>
          <Button variant="ghost" onClick={onCancel}>Fechar</Button>
        </div>
        {showJson && (
          <Textarea value={planText} readOnly className="min-h-[300px] font-mono text-xs bg-slate-900 text-slate-200" />
        )}
      </div>
    );
  }

  const day = edited.days[activeDay];

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (edited.weeklyGoal && edited.weeklyGoal.length > 300) errs["weeklyGoal"] = "Máximo 300 caracteres";
    edited.days.forEach((d, idx) => {
      if (!d.focus?.title?.trim()) errs[`day-${idx}-title`] = "Título do foco obrigatório";
      else if (d.focus.title.length > 80) errs[`day-${idx}-title`] = "Máximo 80 caracteres";
      if (d.focus?.description && d.focus.description.length > 200) errs[`day-${idx}-desc`] = "Máximo 200 caracteres";
      d.exercises?.forEach((ex, exIdx) => {
        if (!ex.title?.trim()) errs[`day-${idx}-ex-${exIdx}-title`] = "Título obrigatório";
        else if (ex.title.length > 60) errs[`day-${idx}-ex-${exIdx}-title`] = "Máximo 60 caracteres";
        if (ex.duration && !/^\d+\s*min$/i.test(ex.duration.trim())) errs[`day-${idx}-ex-${exIdx}-duration`] = "Use formato '10 min'";
        if (ex.points && ex.points.length > 0) {
          ex.points.forEach((p, pIdx) => {
            if (!p.trim()) errs[`day-${idx}-ex-${exIdx}-p-${pIdx}`] = "Ponto não pode ser vazio";
            else if (p.length > 150) errs[`day-${idx}-ex-${exIdx}-p-${pIdx}`] = "Máximo 150 caracteres";
          });
        }
        // at least 1 point if exercise exists and has been touched? optional - warn if empty
        if (ex.points && ex.points.length === 0) {
          // allow empty but show hint - not error
        }
      });
    });
    if (edited.days.length !== 5) errs["days"] = "O plano deve ter exatamente 5 dias";
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      const first = Object.values(errs)[0];
      toast.error(first);
      return false;
    }
    return true;
  };

  const handleSave = () => {
    if (!validate()) return;
    // Strip empty helpers and stringify
    const toSave: StudyPlan = {
      ...edited,
      days: edited.days.map((d) => ({
        dayName: d.dayName?.trim() || "Dia",
        focus: {
          title: d.focus?.title?.trim() || "",
          description: d.focus?.description?.trim() || "",
        },
        exercises: (d.exercises || []).map((ex) => ({
          title: ex.title.trim(),
          subtitle: ex.subtitle?.trim() || "",
          duration: ex.duration?.trim() || "",
          points: (ex.points || []).map((p) => p.trim()).filter(Boolean),
          icon: ex.icon || "music",
        })).filter((ex) => ex.title),
      })),
    };
    onSave(JSON.stringify(toSave));
  };

  const updateWeeklyGoal = (v: string) => setEdited({ ...edited, weeklyGoal: v });
  const updateImportantMessage = (v: string) => setEdited({ ...edited, importantMessage: v });

  const updateDayFocus = (field: "title" | "description", v: string) => {
    const newDays = [...edited.days];
    newDays[activeDay] = { ...newDays[activeDay], focus: { ...newDays[activeDay].focus!, [field]: v } as any };
    setEdited({ ...edited, days: newDays });
  };

  const updateExercise = (exIdx: number, field: keyof Exercise, v: string) => {
    const newDays = [...edited.days];
    const exs = [...(newDays[activeDay].exercises || [])];
    exs[exIdx] = { ...exs[exIdx], [field]: v };
    newDays[activeDay] = { ...newDays[activeDay], exercises: exs };
    setEdited({ ...edited, days: newDays });
  };

  const updatePoint = (exIdx: number, pIdx: number, v: string) => {
    const newDays = [...edited.days];
    const exs = [...(newDays[activeDay].exercises || [])];
    const pts = [...(exs[exIdx].points || [])];
    pts[pIdx] = v;
    exs[exIdx] = { ...exs[exIdx], points: pts };
    newDays[activeDay] = { ...newDays[activeDay], exercises: exs };
    setEdited({ ...edited, days: newDays });
  };

  const addPoint = (exIdx: number) => {
    const newDays = [...edited.days];
    const exs = [...(newDays[activeDay].exercises || [])];
    const pts = [...(exs[exIdx].points || []), ""];
    exs[exIdx] = { ...exs[exIdx], points: pts };
    newDays[activeDay] = { ...newDays[activeDay], exercises: exs };
    setEdited({ ...edited, days: newDays });
  };

  const removePoint = (exIdx: number, pIdx: number) => {
    const newDays = [...edited.days];
    const exs = [...(newDays[activeDay].exercises || [])];
    const pts = (exs[exIdx].points || []).filter((_, i) => i !== pIdx);
    exs[exIdx] = { ...exs[exIdx], points: pts };
    newDays[activeDay] = { ...newDays[activeDay], exercises: exs };
    setEdited({ ...edited, days: newDays });
  };

  const addExercise = () => {
    if ((day.exercises?.length || 0) >= 4) {
      toast.error("Máximo 4 exercícios por dia");
      return;
    }
    const newDays = [...edited.days];
    const exs = [...(newDays[activeDay].exercises || []), { title: "", subtitle: "", duration: "5 min", points: [""], icon: "music" }];
    newDays[activeDay] = { ...newDays[activeDay], exercises: exs };
    setEdited({ ...edited, days: newDays });
  };

  const removeExercise = (exIdx: number) => {
    const newDays = [...edited.days];
    const exs = (newDays[activeDay].exercises || []).filter((_, i) => i !== exIdx);
    newDays[activeDay] = { ...newDays[activeDay], exercises: exs };
    setEdited({ ...edited, days: newDays });
  };

  const hasDirty = JSON.stringify(edited) !== JSON.stringify(initial);

  return (
    <div className="flex flex-col gap-4">
      {/* Top meta */}
      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Objetivo da Semana</label>
          <Input
            value={edited.weeklyGoal || ""}
            onChange={(e) => updateWeeklyGoal(e.target.value)}
            placeholder="Ex: Condução de vozes em 4 vozes com inversões"
            className={cn("h-10 rounded-xl text-sm", errors["weeklyGoal"] && "border-red-500")}
          />
          {errors["weeklyGoal"] && <p className="text-xs text-red-500">{errors["weeklyGoal"]}</p>}
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Dica / Mensagem Importante</label>
          <Textarea
            value={edited.importantMessage || ""}
            onChange={(e) => updateImportantMessage(e.target.value)}
            placeholder="Dica prática para o aluno..."
            className="min-h-[60px] rounded-xl text-sm"
          />
        </div>
      </div>

      {/* Day Tabs */}
      <div className="flex items-center gap-1 p-1 bg-muted/60 rounded-xl">
        {edited.days.map((d, idx) => (
          <button
            key={idx}
            onClick={() => setActiveDay(idx)}
            className={cn(
              "flex-1 h-8 rounded-lg text-xs font-bold transition-all",
              activeDay === idx ? "bg-card shadow-sm text-foreground border border-border" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {d.dayName || `Dia ${idx + 1}`}
          </button>
        ))}
      </div>

      {/* Day Editor */}
      <div className="space-y-4 border border-border rounded-2xl p-4 bg-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setActiveDay((d) => Math.max(0, d - 1))} disabled={activeDay === 0}>
              <ChevronLeft size={14} />
            </Button>
            <span className="text-sm font-black">Dia {activeDay + 1}</span>
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setActiveDay((d) => Math.min(4, d + 1))} disabled={activeDay === 4}>
              <ChevronRight size={14} />
            </Button>
          </div>
          {hasDirty && <span className="text-xs font-bold text-amber-600 flex items-center gap-1"><span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" /> Alterações não salvas</span>}
        </div>

        <div className="grid gap-3">
          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Nome do Dia</label>
            <Input
              value={day.dayName}
              onChange={(e) => {
                const nd = [...edited.days];
                nd[activeDay] = { ...nd[activeDay], dayName: e.target.value };
                setEdited({ ...edited, days: nd });
              }}
              className="h-9 rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Foco do Dia — Título *</label>
            <Input
              value={day.focus?.title || ""}
              onChange={(e) => updateDayFocus("title", e.target.value)}
              placeholder="Ex: Memória muscular do acorde D"
              className={cn("h-9 rounded-xl", errors[`day-${activeDay}-title`] && "border-red-500")}
            />
            {errors[`day-${activeDay}-title`] && <p className="text-xs text-red-500">{errors[`day-${activeDay}-title`]}</p>}
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Descrição do Foco</label>
            <Textarea
              value={day.focus?.description || ""}
              onChange={(e) => updateDayFocus("description", e.target.value)}
              placeholder="Objetivo técnico em 1 frase curta"
              className={cn("min-h-[60px] rounded-xl", errors[`day-${activeDay}-desc`] && "border-red-500")}
            />
            {errors[`day-${activeDay}-desc`] && <p className="text-xs text-red-500">{errors[`day-${activeDay}-desc`]}</p>}
          </div>
        </div>

        {/* Exercises */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black uppercase tracking-widest text-foreground">Exercícios do Dia</h4>
            <Button size="sm" variant="outline" onClick={addExercise} className="h-7 rounded-lg gap-1 text-xs">
              <Plus size={12} /> Adicionar exercício
            </Button>
          </div>

          {(day.exercises || []).length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-xl">Nenhum exercício neste dia. Clique em adicionar.</p>
          )}

          {(day.exercises || []).map((ex, exIdx) => (
            <div key={exIdx} className="border border-border rounded-xl p-3 space-y-3 bg-muted/20">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-indigo-600">Exercício {exIdx + 1}</span>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-red-600" onClick={() => removeExercise(exIdx)}>
                  <Trash2 size={12} />
                </Button>
              </div>

              <div className="grid gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-muted-foreground">Título *</label>
                  <Input
                    value={ex.title}
                    onChange={(e) => updateExercise(exIdx, "title", e.target.value)}
                    placeholder="Ex: Aquecimento"
                    className={cn("h-8 rounded-lg text-sm", errors[`day-${activeDay}-ex-${exIdx}-title`] && "border-red-500")}
                  />
                  {errors[`day-${activeDay}-ex-${exIdx}-title`] && <p className="text-xs text-red-500">{errors[`day-${activeDay}-ex-${exIdx}-title`]}</p>}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-muted-foreground">Subtítulo</label>
                    <Input value={ex.subtitle || ""} onChange={(e) => updateExercise(exIdx, "subtitle", e.target.value)} placeholder="Ex: Aquecimento específico" className="h-8 rounded-lg text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-muted-foreground">Duração</label>
                    <Input value={ex.duration || ""} onChange={(e) => updateExercise(exIdx, "duration", e.target.value)} placeholder="Ex: 5 min" className={cn("h-8 rounded-lg text-sm", errors[`day-${activeDay}-ex-${exIdx}-duration`] && "border-red-500")} />
                    {errors[`day-${activeDay}-ex-${exIdx}-duration`] && <p className="text-xs text-red-500">{errors[`day-${activeDay}-ex-${exIdx}-duration`]}</p>}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-bold text-muted-foreground">Passos / Pontos</label>
                {(ex.points || []).map((p, pIdx) => (
                  <div key={pIdx} className="flex gap-2">
                    <Input
                      value={p}
                      onChange={(e) => updatePoint(exIdx, pIdx, e.target.value)}
                      placeholder={`Passo ${pIdx + 1} — ex: Toque a escala devagar...`}
                      className={cn("h-8 rounded-lg text-sm flex-1", errors[`day-${activeDay}-ex-${exIdx}-p-${pIdx}`] && "border-red-500")}
                    />
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removePoint(exIdx, pIdx)}>
                      <Trash2 size={12} />
                    </Button>
                  </div>
                ))}
                {(ex.points || []).length < 6 && (
                  <Button variant="outline" size="sm" className="h-7 rounded-lg gap-1 text-xs w-full" onClick={() => addPoint(exIdx)}>
                    <Plus size={12} /> Adicionar ponto
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex items-center justify-between pt-2 border-t border-border">
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel} className="rounded-xl">Cancelar</Button>
          <Button variant="outline" onClick={() => setShowJson(!showJson)} className="rounded-xl gap-2">
            <Code2 size={14} /> {showJson ? "Ocultar JSON" : "Ver JSON"}
          </Button>
        </div>
        <Button onClick={handleSave} disabled={isSaving} className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
          {isSaving ? "Salvando..." : "Salvar alterações"}
        </Button>
      </div>

      {showJson && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Pré-visualização JSON (somente leitura)</p>
          <Textarea value={JSON.stringify(edited, null, 2)} readOnly className="min-h-[200px] font-mono text-xs bg-slate-900 text-slate-200 rounded-xl" />
        </div>
      )}
    </div>
  );
}
