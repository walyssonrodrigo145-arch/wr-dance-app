import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Zap, Plus, Settings, ChevronRight, History,
  Clock, Send, CheckCircle2, XCircle, AlertCircle, Eye,
  MessageSquare, Bell, Star, TrendingUp, Users,
  Edit3, X, Search,
  Calendar, DollarSign, Gift, UserX, Loader2, Sparkles,
  Info, Save, Trash2, ToggleLeft, ToggleRight, BellRing, BookOpen, BarChart2, CheckCheck, Bot
} from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { requestForToken } from "@/lib/firebaseConfig";

// ─── Types ───────────────────────────────────────────────────────────────────
type AutomationRule = {
  id: number;
  organizationId?: number | null;
  userId?: number;
  name: string;
  description: string | null;
  isSystem: number;
  isActive: number;
  trigger: string;
  offsetDays: number;
  offsetHours: number;
  triggerUnit?: string;
  conditions: string | null;
  actions: string | null;
  messageTemplate: string;
  channel: string;
  totalSent: number;
  lastExecutedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  sendToStudent?: boolean | number;
  sendToGuardian?: boolean | number;
};

// ─── Trigger config ───────────────────────────────────────────────────────────
const TRIGGERS: { value: string; label: string; icon: React.ElementType; color: string; unit: "days" | "hours" | "time" | "contract" }[] = [
  { value: "new_student",       label: "Novo aluno matriculado",           icon: Users,        color: "text-emerald-500", unit: "days"  },
  { value: "lesson_scheduled",  label: "Aula agendada",                    icon: Calendar,     color: "text-blue-500",    unit: "hours" },
  { value: "payment_due",       label: "Mensalidade próxima do vencimento",icon: DollarSign,   color: "text-amber-500",   unit: "days"  },
  { value: "payment_overdue",   label: "Mensalidade vencida",              icon: AlertCircle,  color: "text-red-500",     unit: "days"  },
  { value: "payment_confirmed", label: "Pagamento confirmado",             icon: CheckCircle2, color: "text-teal-500",    unit: "days"  },
  { value: "birthday",          label: "Aniversário do aluno",             icon: Gift,         color: "text-pink-500",    unit: "days"  },
  { value: "student_inactive",  label: "Aluno inativo (sem aulas)",        icon: UserX,        color: "text-violet-500",  unit: "days"  },
  { value: "contract_expiring", label: "Fim de contrato (aviso de encerramento)", icon: Calendar, color: "text-orange-500", unit: "contract" },
  { value: "daily_study",       label: "Lembrete de estudo diário",        icon: BookOpen,     color: "text-green-500",   unit: "time"  },
  { value: "daily_report",      label: "Relatório diário de treinos",      icon: BarChart2,    color: "text-blue-500",    unit: "time"  },
  { value: "slot_advance",      label: "Antecipação inteligente de horário por falta", icon: Zap, color: "text-amber-500", unit: "hours" },
];

const DAYS_OF_WEEK = [
  { label: "Dom", value: 0 },
  { label: "Seg", value: 1 },
  { label: "Ter", value: 2 },
  { label: "Qua", value: 3 },
  { label: "Qui", value: 4 },
  { label: "Sex", value: 5 },
  { label: "Sáb", value: 6 },
];

const VARIABLES = [
  { label: "{nome_aluno}",        desc: "Nome do aluno"          },
  { label: "{nome_professor}",    desc: "Nome do professor"       },
  { label: "{nome_escola}",       desc: "Nome da escola"          },
  { label: "{curso}",             desc: "Instrumento/curso"       },
  { label: "{instrumento}",       desc: "Nome do instrumento"     },
  { label: "{data_aula}",         desc: "Data da aula"            },
  { label: "{hora_aula}",         desc: "Horário da aula"         },
  { label: "{horario_vago}",      desc: "Horário vago liberado"   },
  { label: "{horario_atual}",     desc: "Horário atual do aluno"  },
  { label: "{link_portal}",       desc: "Link do portal do aluno" },
  { label: "{valor_mensalidade}", desc: "Valor da mensalidade"    },
  { label: "{data_vencimento}",   desc: "Data de vencimento"      },
  { label: "{link_pagamento}",    desc: "Link de pagamento automático" },
  { label: "{dias_sem_estudo}",   desc: "Dias sem estudo"         },
  { label: "{resumo_treinos}",    desc: "Lista de status de treinos de hoje" },
  { label: "{data_fim_contrato}", desc: "Data de término do contrato" },
  { label: "{meses_restantes}",   desc: "Meses restantes do contrato" },
  { label: "{aulas_restantes}",   desc: "Aulas restantes do contrato" },
];

function getTriggerInfo(trigger: string) {
  return TRIGGERS.find(t => t.value === trigger) ?? { label: trigger, icon: Zap, color: "text-indigo-500", unit: "days" as const };
}

function parseDailyStudyConditions(conditions: string | null | undefined): { daysOfWeek: number[]; sendTime: string } {
  try {
    if (conditions) {
      const parsed = JSON.parse(conditions);
      return {
        daysOfWeek: Array.isArray(parsed.daysOfWeek) ? parsed.daysOfWeek : [1,2,3,4,5],
        sendTime: typeof parsed.sendTime === "string" ? parsed.sendTime : "08:00",
      };
    }
  } catch { /* ignore */ }
  return { daysOfWeek: [1,2,3,4,5], sendTime: "08:00" };
}

function getTimingLabel(rule: AutomationRule): string {
  const info = getTriggerInfo(rule.trigger);
  if (info.unit === "time") {
    const { daysOfWeek, sendTime } = parseDailyStudyConditions(rule.conditions);
    const dayNames = daysOfWeek.map(d => DAYS_OF_WEEK.find(x => x.value === d)?.label ?? "").filter(Boolean);
    return `${dayNames.join(", ")} às ${sendTime}`;
  }
  if (info.unit === "hours") {
    const h = rule.offsetHours ?? 0;
    if (h === 0) return "No momento da aula";
    if (h < 0)  return `${Math.abs(h)}h antes da aula`;
    return `${h}h após a aula`;
  }
  if (info.unit === "contract") {
    const u = (rule as any).triggerUnit === "aulas" ? "aula(s)" : "mês(es)";
    return `faltando ${Math.max(1, Math.abs(rule.offsetDays ?? 1))} ${u} para encerrar`;
  }
  const d = rule.offsetDays ?? 0;
  if (d === 0) return "No dia do evento";
  if (d < 0)   return `${Math.abs(d)} dias antes`;
  return `${d} dias depois`;
}

// ─── Toggle ───────────────────────────────────────────────────────────────────
function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 items-center rounded-full transition-all focus-visible:outline-none disabled:opacity-50",
        checked ? "bg-emerald-500 shadow-lg shadow-emerald-500/25" : "bg-muted-foreground/30"
      )}
    >
      <span className={cn("inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform", checked ? "translate-x-6" : "translate-x-1")} />
    </button>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color, sub }: { label: string; value: string | number; icon: React.ElementType; color: string; sub?: string }) {
  return (
    <div className="bg-card border border-border/50 rounded-2xl p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow">
      <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0", color)}>
        <Icon size={22} className="text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-black text-foreground leading-none">{value}</p>
        <p className="text-xs font-semibold text-muted-foreground mt-1">{label}</p>
        {sub && <p className="text-[10px] text-muted-foreground/60 mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Rule Card ────────────────────────────────────────────────────────────────
function RuleCard({
  rule, onToggle, onEdit, onDelete, onHistory, loading
}: {
  rule: AutomationRule;
  onToggle: (id: number, active: boolean) => void;
  onEdit: (rule: AutomationRule) => void;
  onDelete?: (id: number) => void;
  onHistory: (rule: AutomationRule) => void;
  loading?: boolean;
}) {
  const info = getTriggerInfo(rule.trigger);
  const Icon = info.icon;
  const isActive = rule.isActive === 1;
  const isSystem = rule.isSystem === 1;

  return (
    <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
      className={cn("bg-card border rounded-2xl p-5 flex flex-col gap-4 shadow-sm hover:shadow-md transition-all duration-200",
        isActive ? "border-border/50" : "border-border/30 opacity-70"
      )}
    >
      <div className="flex items-start gap-4">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", isActive ? "bg-indigo-500/10" : "bg-muted")}>
          <Icon size={18} className={isActive ? info.color : "text-muted-foreground"} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-black text-foreground leading-tight">{rule.name}</p>
            {isSystem && <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[9px] font-black uppercase tracking-wider rounded-full">Sistema</span>}
            <span className={cn("px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-full", isActive ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground")}>
              {isActive ? "Ativa" : "Inativa"}
            </span>
          </div>
          {rule.description && <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{rule.description}</p>}
        </div>
        <Toggle checked={isActive} onChange={(v) => onToggle(rule.id, v)} disabled={loading} />
      </div>

      <div className="flex items-center gap-3 flex-wrap text-[11px]">
        <div className="flex items-center gap-1.5 text-muted-foreground bg-muted/50 px-2.5 py-1.5 rounded-lg">
          <Clock size={11} /><span className="font-semibold">{getTimingLabel(rule)}</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground bg-muted/50 px-2.5 py-1.5 rounded-lg">
          <MessageSquare size={11} /><span className="font-semibold capitalize">{rule.channel}</span>
        </div>
        {rule.totalSent > 0 && (
          <div className="flex items-center gap-1.5 text-emerald-600 bg-emerald-500/10 px-2.5 py-1.5 rounded-lg">
            <Send size={11} /><span className="font-semibold">{rule.totalSent} enviados</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 pt-1 border-t border-border/30">
        <button onClick={() => onEdit(rule)} className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-xl hover:bg-muted">
          <Edit3 size={13} /> Editar
        </button>
        <button onClick={() => onHistory(rule)} className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-xl hover:bg-muted">
          <History size={13} /> Histórico
        </button>
        {!isSystem && onDelete && (
          <button onClick={() => onDelete(rule.id)} className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-red-500 transition-colors px-3 py-2 rounded-xl hover:bg-red-500/10 ml-auto">
            <Trash2 size={13} /> Excluir
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ─── Rule Editor Modal ────────────────────────────────────────────────────────
function RuleEditorModal({ rule, onClose, onSave }: {
  rule: Partial<AutomationRule> | null;
  onClose: () => void;
  onSave: (data: Partial<AutomationRule>) => void;
}) {
  const isNew = !rule?.id;
  const [activeTab, setActiveTab] = useState<"geral" | "disparador" | "mensagem">("geral");
  const [name, setName] = useState(rule?.name ?? "");
  const [description, setDescription] = useState(rule?.description ?? "");
  const [trigger, setTrigger] = useState(rule?.trigger ?? "payment_due");
  const [offsetDays, setOffsetDays] = useState(rule?.offsetDays ?? -3);
  const [offsetHours, setOffsetHours] = useState(rule?.offsetHours ?? 0);
  const [triggerUnit, setTriggerUnit] = useState((rule as any)?.triggerUnit ?? "meses");
  const [messageTemplate, setMessageTemplate] = useState(rule?.messageTemplate ?? "");
  const [isActive, setIsActive] = useState((rule?.isActive ?? 1) === 1);
  const [sendToStudent, setSendToStudent] = useState((rule as any)?.sendToStudent === 1 || (rule as any)?.sendToStudent === undefined);
  const [sendToGuardian, setSendToGuardian] = useState((rule as any)?.sendToGuardian === 1);
  const [copiedVar, setCopiedVar] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // daily_study specific state
  const initDailyStudy = parseDailyStudyConditions(rule?.conditions as string | null);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(initDailyStudy.daysOfWeek);
  const [sendTime, setSendTime] = useState<string>(initDailyStudy.sendTime);

  const info = getTriggerInfo(trigger);
  const unit = info.unit;

  const timingPreview = (() => {
    if (unit === "hours") {
      if (offsetHours === 0) return "será enviada no momento da aula";
      if (offsetHours < 0) return `será enviada ${Math.abs(offsetHours)} hora(s) antes da aula`;
      return `será enviada ${offsetHours} hora(s) após a aula`;
    }
    if (unit === "contract") {
      return `faltando ${Math.max(1, Math.abs(offsetDays || 1))} ${triggerUnit === "aulas" ? "aula(s)" : "mês(es)"} para o contrato terminar`;
    }
    if (offsetDays === 0) return "será enviada no dia do evento";
    if (offsetDays < 0) return `será enviada ${Math.abs(offsetDays)} dia(s) antes do evento`;
    return `será enviada ${offsetDays} dia(s) após o evento`;
  })();

  const insertVariable = (variable: string) => {
    const ta = textareaRef.current;
    if (!ta) { setMessageTemplate(prev => prev + variable); return; }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const newValue = messageTemplate.slice(0, start) + variable + messageTemplate.slice(end);
    setMessageTemplate(newValue);
    setTimeout(() => { ta.selectionStart = ta.selectionEnd = start + variable.length; ta.focus(); }, 0);
    // MH-005: Feedback visual de "variável inserida"
    setCopiedVar(variable);
    setTimeout(() => setCopiedVar(null), 1200);
  };

  const handleSave = () => {
    if (!name.trim()) { toast.error("Digite um nome para a regra"); return; }
    if (!messageTemplate.trim()) { toast.error("Digite o texto da mensagem"); return; }
    if (unit === "time" && daysOfWeek.length === 0) { toast.error("Selecione pelo menos um dia da semana"); return; }
    onSave({
      ...(rule?.id ? { id: rule.id } : {}),
      name: name.trim(),
      description: description.trim() || undefined,
      trigger,
      offsetDays: unit === "contract" ? (Math.max(1, Math.abs(isNaN(offsetDays) ? 1 : offsetDays))) : (unit === "days" ? (isNaN(offsetDays) ? 0 : offsetDays) : 0),
      offsetHours: unit === "hours" ? (isNaN(offsetHours) ? 0 : offsetHours) : 0,
      triggerUnit: unit === "contract" ? triggerUnit : "meses",
      conditions: unit === "time" ? JSON.stringify({ daysOfWeek, sendTime }) : undefined,
      messageTemplate: messageTemplate.trim(),
      channel: "whatsapp",
      isActive: isActive ? 1 : 0,
      sendToStudent,
      sendToGuardian,
    });
  };

  const TABS = [
    { id: "geral" as const, label: "Geral", icon: Settings },
    { id: "disparador" as const, label: "Disparador & Timing", icon: Clock },
    { id: "mensagem" as const, label: "Mensagem", icon: MessageSquare },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, scale: 0.96, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}
        className="bg-card border border-border rounded-3xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
              <Zap size={18} className="text-indigo-500" />
            </div>
            <div>
              <h2 className="text-base font-black text-foreground">{isNew ? "Nova Automação" : "Editar Automação"}</h2>
              <p className="text-[10px] text-muted-foreground font-medium">Configure quando e o que enviar</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-4 overflow-x-auto no-scrollbar">
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={cn("flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap",
                  activeTab === tab.id ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" : "text-muted-foreground hover:bg-muted"
                )}
              >
                <Icon size={13} />{tab.label}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Geral Tab */}
          {activeTab === "geral" && (
            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground">Nome da Regra *</label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Lembrete de Mensalidade 5 dias antes" className="h-11 rounded-xl border-border bg-muted/50 text-sm font-medium" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground">Descrição</label>
                <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Breve descrição do objetivo desta automação" className="h-11 rounded-xl border-border bg-muted/50 text-sm font-medium" />
              </div>
              <div className="flex items-center justify-between p-4 bg-muted/40 rounded-2xl border border-border/50">
                <div>
                  <p className="text-sm font-bold text-foreground">Ativar imediatamente</p>
                  <p className="text-xs text-muted-foreground mt-0.5">A regra começará a processar assim que salva</p>
                </div>
                <Toggle checked={isActive} onChange={setIsActive} />
              </div>
            </div>
          )}

          {/* Disparador Tab */}
          {activeTab === "disparador" && (
            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground">Evento que dispara a automação</label>
                <div className="grid grid-cols-1 gap-2">
                  {TRIGGERS.map(t => {
                    const TIcon = t.icon;
                    const selected = trigger === t.value;
                    return (
                      <button key={t.value} onClick={() => { setTrigger(t.value); if (t.value === "contract_expiring") { setOffsetDays(1); setTriggerUnit("meses"); } }}
                        className={cn("flex items-center gap-3 px-4 py-3 rounded-xl text-left text-sm font-semibold border transition-all",
                          selected ? "bg-indigo-500/10 border-indigo-500/30 text-foreground" : "border-border/50 text-muted-foreground hover:bg-muted"
                        )}
                      >
                        <TIcon size={16} className={selected ? t.color : "text-muted-foreground"} />
                        <span>{t.label}</span>
                        {selected && <ChevronRight size={14} className="ml-auto text-indigo-500" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Timing */}
              {unit === "time" ? (
                <div className="p-5 bg-gradient-to-br from-green-500/5 to-emerald-500/5 rounded-2xl border border-green-500/20 space-y-5">
                  <div className="flex items-center gap-2">
                    <BookOpen size={16} className="text-green-500" />
                    <p className="text-sm font-black text-foreground">Configuração do Lembrete</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Dias da semana para enviar</label>
                    <div className="flex gap-2 flex-wrap">
                      {DAYS_OF_WEEK.map(day => {
                        const isSelected = daysOfWeek.includes(day.value);
                        return (
                          <button
                            key={day.value}
                            type="button"
                            onClick={() => setDaysOfWeek(prev =>
                              isSelected ? prev.filter(d => d !== day.value) : [...prev, day.value].sort()
                            )}
                            className={cn(
                              "px-3 py-2 rounded-xl text-xs font-black border transition-all",
                              isSelected
                                ? "bg-green-500 text-white border-transparent shadow-md shadow-green-500/20"
                                : "border-border text-muted-foreground hover:bg-muted"
                            )}
                          >
                            {day.label}
                          </button>
                        );
                      })}
                    </div>
                    {daysOfWeek.length === 0 && (
                      <p className="text-[11px] text-red-500 font-medium">Selecione pelo menos um dia</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Horário de envio</label>
                    <input
                      type="time"
                      value={sendTime}
                      onChange={e => setSendTime(e.target.value)}
                      className="h-11 px-4 rounded-xl border border-border bg-card text-sm font-black text-foreground focus:outline-none focus:ring-2 focus:ring-green-500/50"
                    />
                  </div>

                  <div className="flex items-center gap-2 p-3 bg-green-500/10 rounded-xl">
                    <Info size={14} className="text-green-600 flex-shrink-0" />
                    <p className="text-xs font-semibold text-green-700 dark:text-green-300">
                      Lembrete enviado às <strong>{sendTime}</strong> nos dias: <strong>{daysOfWeek.map(d => DAYS_OF_WEEK.find(x => x.value === d)?.label).join(", ")}</strong>
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-5 bg-gradient-to-br from-indigo-500/5 to-violet-500/5 rounded-2xl border border-indigo-500/20 space-y-4">
                  <div className="flex items-center gap-2">
                    <Clock size={16} className="text-indigo-500" />
                    <p className="text-sm font-black text-foreground">Quando enviar?</p>
                  </div>

                  {unit === "contract" ? (
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Enviar quando faltar</label>
                        <Input type="number" value={Math.max(1, Math.abs(offsetDays || 1))}
                          onChange={e => setOffsetDays(Math.abs(parseInt(e.target.value) || 1))}
                          min={1} className="w-24 h-11 rounded-xl text-center font-black text-lg border-border bg-card"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Unidade</label>
                        <div className="flex gap-2">
                          {([{ u: "meses", label: "meses" }, { u: "aulas", label: "aulas" }] as { u: "meses" | "aulas"; label: string }[]).map(opt => (
                            <button key={opt.u} onClick={() => setTriggerUnit(opt.u)}
                              className={cn("px-3 py-2 rounded-xl text-xs font-black border transition-all",
                                triggerUnit === opt.u ? "bg-indigo-500 text-white border-transparent" : "border-border text-muted-foreground hover:bg-muted"
                              )}
                            >{opt.label}</button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : unit === "hours" ? (
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Quantas horas</label>
                        <Input type="number" value={Math.abs(offsetHours)}
                          onChange={e => { const v = parseInt(e.target.value) || 0; setOffsetHours(offsetHours >= 0 ? v : -v); }}
                          min={0} className="w-24 h-11 rounded-xl text-center font-black text-lg border-border bg-card"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Direção</label>
                        <div className="flex gap-2">
                          {[
                            { label: "Antes", action: () => setOffsetHours(h => -Math.abs(h || 1)), active: offsetHours < 0 },
                            { label: "Na hora", action: () => setOffsetHours(0), active: offsetHours === 0 },
                            { label: "Depois", action: () => setOffsetHours(h => Math.abs(h || 1)), active: offsetHours > 0 },
                          ].map(btn => (
                            <button key={btn.label} onClick={btn.action}
                              className={cn("px-3 py-2 rounded-xl text-xs font-black border transition-all",
                                btn.active ? "bg-indigo-500 text-white border-transparent" : "border-border text-muted-foreground hover:bg-muted"
                              )}
                            >{btn.label}</button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Quantos dias</label>
                        <Input type="number" value={Math.abs(offsetDays)}
                          onChange={e => { const v = parseInt(e.target.value) || 0; setOffsetDays(offsetDays >= 0 ? v : -v); }}
                          min={0} className="w-24 h-11 rounded-xl text-center font-black text-lg border-border bg-card"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Direção</label>
                        <div className="flex gap-2">
                          {[
                            { label: "Antes", action: () => setOffsetDays(d => -Math.abs(d || 1)), active: offsetDays < 0 },
                            { label: "No dia", action: () => setOffsetDays(0), active: offsetDays === 0 },
                            { label: "Depois", action: () => setOffsetDays(d => Math.abs(d || 1)), active: offsetDays > 0 },
                          ].map(btn => (
                            <button key={btn.label} onClick={btn.action}
                              className={cn("px-3 py-2 rounded-xl text-xs font-black border transition-all",
                                btn.active ? "bg-indigo-500 text-white border-transparent" : "border-border text-muted-foreground hover:bg-muted"
                              )}
                            >{btn.label}</button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2 p-3 bg-indigo-500/10 rounded-xl">
                    <Info size={14} className="text-indigo-500 flex-shrink-0" />
                    <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                      A mensagem <strong>{timingPreview}</strong>.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Mensagem Tab */}
          {activeTab === "mensagem" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground">Variáveis disponíveis</label>
                <div className="flex flex-wrap gap-2">
                  {VARIABLES.map(v => (
                    <button key={v.label} onClick={() => insertVariable(v.label)} title={v.desc}
                      className={cn(
                        "px-2.5 py-1.5 text-[11px] font-black rounded-lg transition-all border flex items-center gap-1",
                        copiedVar === v.label
                          ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 scale-95"
                          : "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20 hover:bg-indigo-500/20"
                      )}
                    >
                      {copiedVar === v.label && <CheckCircle2 size={10} />}
                      {v.label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">Clique em uma variável para inserir no texto</p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground">Texto da mensagem *</label>
                <textarea ref={textareaRef} value={messageTemplate} onChange={e => setMessageTemplate(e.target.value)}
                  placeholder="Olá {nome_aluno}, passando para lembrar que sua mensalidade de {valor_mensalidade} vence em {data_vencimento}..."
                  className="w-full min-h-[140px] px-4 py-3 bg-muted/50 border border-border rounded-xl text-sm font-medium resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 leading-relaxed"
                />
              </div>

              {messageTemplate && (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-foreground flex items-center gap-2">
                    <Eye size={13} /> Preview com dados de exemplo
                  </label>
                  <div className="p-4 bg-[#e1ffc7] dark:bg-emerald-900/30 rounded-2xl rounded-tl-none border border-emerald-200 dark:border-emerald-800 text-sm text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">
                    {messageTemplate
                      .replace(/\{nome_aluno\}/g, "João Silva")
                      .replace(/\{nome_professor\}/g, "Prof. Carlos")
                      .replace(/\{nome_escola\}/g, "WR Music")
                      .replace(/\{curso\}/g, "Violão")
                      .replace(/\{instrumento\}/g, "Violão")
                      .replace(/\{data_aula\}/g, "segunda-feira, 23 de junho")
                      .replace(/\{hora_aula\}/g, "14:00")
                      .replace(/\{valor_mensalidade\}/g, "R$ 250,00")
                      .replace(/\{data_vencimento\}/g, "23 de junho de 2026")
                      .replace(/\{dias_sem_estudo\}/g, "12")
                      .replace(/\{resumo_treinos\}/g, "\n✅ João\n❌ Maria\n✅ Pedro")}
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-border mt-4">
                <label className="text-xs font-semibold text-foreground block mb-4">Destinatários do WhatsApp</label>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-muted/30 rounded-xl border border-border/50">
                    <div>
                      <p className="text-sm font-bold text-foreground">Enviar para o Aluno</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Envia a mensagem para o número do aluno cadastrado</p>
                    </div>
                    <Toggle checked={sendToStudent} onChange={setSendToStudent} />
                  </div>
                  
                  <div className="flex items-center justify-between p-4 bg-muted/30 rounded-xl border border-border/50">
                    <div>
                      <p className="text-sm font-bold text-foreground">Enviar para o Responsável</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Envia a mensagem para o número do responsável financeiro do aluno (menores de idade)</p>
                    </div>
                    <Toggle checked={sendToGuardian} onChange={setSendToGuardian} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border">
          <div className="flex gap-1">
            {activeTab !== "geral" && (
              <button onClick={() => setActiveTab(activeTab === "mensagem" ? "disparador" : "geral")}
                className="px-4 py-2 text-xs font-black text-muted-foreground hover:bg-muted rounded-xl transition-colors"
              >← Anterior</button>
            )}
            {activeTab !== "mensagem" && (
              <button onClick={() => setActiveTab(activeTab === "geral" ? "disparador" : "mensagem")}
                className="px-4 py-2 text-xs font-black text-indigo-600 hover:bg-indigo-500/10 rounded-xl transition-colors"
              >Próximo →</button>
            )}
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 text-xs font-black text-muted-foreground hover:bg-muted rounded-xl transition-colors">Cancelar</button>
            <Button onClick={handleSave} className="px-6 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black shadow-lg shadow-indigo-500/20">
              <Save size={13} className="mr-2" />{isNew ? "Criar Automação" : "Salvar"}
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ─── History Modal ────────────────────────────────────────────────────────────
function HistoryModal({ rule, onClose }: { rule: AutomationRule; onClose: () => void }) {
  const { data: history = [], isLoading } = trpc.automations.history.useQuery({ ruleId: rule.id });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
        className="bg-card border border-border rounded-3xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[80vh]"
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <div>
            <h2 className="text-sm font-black text-foreground flex items-center gap-2">
              <History size={16} className="text-indigo-500" /> Histórico de Execuções
            </h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">{rule.name}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl hover:bg-muted flex items-center justify-center text-muted-foreground transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 size={24} className="animate-spin text-primary" /></div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
                <History size={20} className="text-muted-foreground" />
              </div>
              <p className="text-sm font-bold text-foreground">Nenhum envio ainda</p>
              <p className="text-xs text-muted-foreground mt-1">O histórico aparece aqui quando a regra for executada</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(history as any[]).map((h) => (
                <div key={h.id} className="flex items-start gap-3 p-4 bg-muted/30 rounded-xl border border-border/30">
                  <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5",
                    h.status === "enviado" ? "bg-emerald-500/10" : h.status === "cancelado" ? "bg-muted" : "bg-amber-500/10"
                  )}>
                    {h.status === "enviado" ? <CheckCircle2 size={14} className="text-emerald-500" />
                     : h.status === "cancelado" ? <XCircle size={14} className="text-muted-foreground" />
                     : <Clock size={14} className="text-amber-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-black text-foreground">{h.studentName || "—"}</p>
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">
                        {h.sentAt
                          ? new Date(h.sentAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
                          : h.scheduledAt
                          ? new Date(h.scheduledAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
                          : "—"}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{h.message}</p>
                    {h.errorMessage && <p className="text-[10px] text-red-500 mt-1">⚠ {h.errorMessage}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Automacoes() {
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();
  const [editorRule, setEditorRule] = useState<Partial<AutomationRule> | null>(null);
  const [historyRule, setHistoryRule] = useState<AutomationRule | null>(null);
  const [ruleToDelete, setRuleToDelete] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const { data: rules = [], isLoading } = trpc.automations.list.useQuery();
  const { data: stats } = trpc.automations.stats.useQuery();

  // Função centralizada de refresh do painel de automações.
  // Usar uma única chamada de invalidate por "namespace" agrupa os re-fetches,
  // evitando rajadas de requisições que poderiam acionar o rate limiter.
  const refreshAutomations = () => {
    utils.automations.list.invalidate();
    utils.automations.stats.invalidate();
  };

  const seedMutation = trpc.automations.seedDefaults.useMutation({
    onSuccess: (res) => {
      if (res.seeded) {
        toast.success(`${res.count} regras padrão criadas com sucesso!`);
        refreshAutomations();
      }
    },
  });

  const toggleMutation = trpc.automations.toggle.useMutation({
    onSuccess: () => refreshAutomations(),
    onError: (e) => toast.error("Erro ao atualizar regra: " + e.message),
  });

  const createMutation = trpc.automations.create.useMutation({
    onSuccess: () => { toast.success("Automação criada! ✅"); setEditorRule(null); refreshAutomations(); },
    onError: (e) => toast.error("Erro ao criar: " + e.message),
  });

  const updateMutation = trpc.automations.update.useMutation({
    onSuccess: () => { toast.success("Automação atualizada! ✅"); setEditorRule(null); refreshAutomations(); },
    onError: (e) => toast.error("Erro ao atualizar: " + e.message),
  });

  const deleteMutation = trpc.automations.delete.useMutation({
    onSuccess: () => { toast.success("Automação removida."); refreshAutomations(); },
    onError: (e) => toast.error("Erro ao excluir: " + e.message),
  });

  // BUG-AUTO-005 FIX: Adiciona guard `isPending` para evitar chamadas duplas no React StrictMode.
  // O useEffect era chamado múltiplas vezes quando rules oscilava entre 0 e >0 em re-renders.
  useEffect(() => {
    if (!isLoading && rules.length === 0 && !seedMutation.isPending) {
      seedMutation.mutate();
    }
    // seedMutation.mutate é estável (não muda entre renders) — incluímos para satisfazer o linter
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, rules.length]);

  const [autoEnabled, setAutoEnabled] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const { permission, isSupported, requestPermission } = usePushNotifications();

  const handleSyncNotifications = async () => {
    setIsSyncing(true);
    try {
      await requestPermission({ silent: false });
    } catch (err: any) {
      toast.error("Erro ao sincronizar: " + (err.message || String(err)));
    } finally {
      setIsSyncing(false);
    }
  };
  
  const { data: automationData } = trpc.settings.getAutomation.useQuery(
    undefined,
    { refetchInterval: 60_000, staleTime: 30_000 }
  );

  const toggleAutomation = trpc.settings.toggleAutomation.useMutation({
    onSuccess: (r) => {
      setAutoEnabled(r.enabled);
      utils.settings.getAutomation.invalidate();
      toast.success(r.enabled ? "Automação ativada!" : "Automação desativada.");
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const { data: userSettings } = trpc.settings.get.useQuery();
  const [autoAdvanceEnabled, setAutoAdvanceEnabled] = useState(false);

  useEffect(() => {
    if (userSettings) {
      setAutoAdvanceEnabled((userSettings as any).autoAdvanceSlotsEnabled === 1);
    }
  }, [userSettings]);

  const toggleAutoAdvanceMutation = trpc.settings.toggleAutoAdvanceSlots.useMutation({
    onSuccess: (r) => {
      setAutoAdvanceEnabled(r.enabled);
      utils.settings.get.invalidate();
      toast.success(r.enabled ? "⚡ Robô de Antecipação Inteligente ATIVADO!" : "Robô de Antecipação desativado.");
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const { data: pendingCount = 0 } = trpc.reminders.pendingCount.useQuery(undefined, {
    refetchInterval: 30000,
  });

  const completeAllPendingMut = trpc.reminders.completeAllPending.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      utils.reminders.pendingCount.invalidate();
      utils.reminders.list.invalidate();
    },
    onError: (e) => toast.error("Erro ao concluir lembretes: " + e.message),
  });

  const cleanPush = trpc.fcm.cleanAndRegisterToken.useMutation();

  const testPush = trpc.fcm.testNotification.useMutation({
    onSuccess: (r) => {
      let msg = `Enviado para ${r.sentCount} de ${r.totalTokens} dispositivo(s).`;
      if (r.cleanedCount > 0) {
        msg += ` (${r.cleanedCount} token(s) antigo(s) removido(s) do banco)`;
      }
      toast.success(msg);
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  useEffect(() => {
    if (automationData !== undefined) setAutoEnabled(automationData.enabled);
  }, [automationData]);

  const handleSaveRule = (data: Partial<AutomationRule>) => {
    if (data.id) {
      // BUG-AUTO-002 FIX: `trigger` agora é incluído no update para permitir
      // que o usuário altere o tipo de disparador de uma automação existente.
      updateMutation.mutate({
        id: data.id,
        name: data.name,
        description: data.description ?? undefined,
        trigger: data.trigger,
        // BUG#3 FIX: conditions contém daysOfWeek + sendTime do daily_study
        // Sem esse campo, editar uma regra apagava a configuração do banco
        conditions: (data as any).conditions ?? undefined,
        offsetDays: data.offsetDays,
        offsetHours: data.offsetHours,
        triggerUnit: (data as any).triggerUnit ?? "meses",
        messageTemplate: data.messageTemplate,
        channel: data.channel,
        isActive: data.isActive,
        sendToStudent: (data as any).sendToStudent === true || (data as any).sendToStudent === 1,
        sendToGuardian: (data as any).sendToGuardian === true || (data as any).sendToGuardian === 1,
      });
    } else {
      // BUG-AUTO-001 FIX: `conditions` agora é incluído na criação para preservar
      // a configuração de daysOfWeek + sendTime de automações do tipo daily_study / daily_report.
      // Sem esse campo, criar uma automação desse tipo descartava silenciosamente a configuração.
      createMutation.mutate({
        name: data.name!,
        description: data.description ?? undefined,
        trigger: data.trigger!,
        offsetDays: data.offsetDays ?? 0,
        offsetHours: data.offsetHours ?? 0,
        triggerUnit: (data as any).triggerUnit ?? "meses",
        conditions: (data as any).conditions ?? undefined,
        messageTemplate: data.messageTemplate!,
        channel: data.channel ?? "whatsapp",
        isActive: data.isActive ?? 1,
        sendToStudent: (data as any).sendToStudent === true || (data as any).sendToStudent === undefined,
        sendToGuardian: (data as any).sendToGuardian === true,
      });
    }
  };

  const handleDelete = (id: number) => {
    setRuleToDelete(id);
  };

  const systemRules = rules.filter(r => r.isSystem === 1);
  const customRules = rules.filter(r => r.isSystem === 0);
  const filteredSystem = search ? systemRules.filter(r => r.name.toLowerCase().includes(search.toLowerCase())) : systemRules;
  const filteredCustom = search ? customRules.filter(r => r.name.toLowerCase().includes(search.toLowerCase())) : customRules;

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 size={28} className="animate-spin text-primary" />
    </div>
  );

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div id="tour-auto-header" className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Zap size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl lg:text-2xl font-black text-foreground tracking-tight">Automações de Mensagens</h1>
            <p className="text-xs text-muted-foreground font-medium mt-0.5">Configure quando e como seus alunos recebem mensagens automáticas</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            onClick={() => setLocation("/chatbot-fluxo")}
            className="h-11 px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black shadow-lg shadow-emerald-500/20 gap-2 text-xs"
          >
            <Bot size={16} /> Fluxo do Robô WhatsApp
          </Button>
          <Button
            onClick={() => setEditorRule({ trigger: "payment_due", offsetDays: -3, isActive: 1 })}
            className="h-11 px-5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black shadow-lg shadow-indigo-500/20 gap-2 text-xs"
          >
            <Plus size={16} /> Criar Nova Regra
          </Button>
        </div>
      </div>

      <div id="tour-auto-toggle" className={cn(
        "relative overflow-hidden p-6 rounded-[2rem] border transition-all duration-300",
        autoEnabled
          ? "bg-gradient-to-br from-indigo-600 to-indigo-800 border-indigo-700 shadow-xl shadow-indigo-500/20 text-white"
          : "bg-card border-border shadow-sm text-muted-foreground"
      )}>
        {autoEnabled && (
          <>
            <div className="absolute -right-10 -top-10 w-32 h-32 rounded-full bg-card/10 blur-2xl" />
            <div className="absolute -left-10 -bottom-10 w-24 h-24 rounded-full bg-indigo-400/20 blur-xl" />
          </>
        )}
        <div className="flex flex-col sm:flex-row items-center gap-6 relative z-10">
          <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-lg", autoEnabled ? "bg-card/20 text-white" : "bg-muted text-muted-foreground")}>
            <Zap size={28} />
          </div>
          <div className="flex-1 text-center sm:text-left min-w-0">
            <div className="flex items-center justify-center sm:justify-start gap-3 mb-2">
              <h3 className={cn("text-base font-black uppercase tracking-widest", autoEnabled ? "text-white" : "text-foreground")}>Automação do Robô</h3>
              <span className={cn("text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full", autoEnabled ? "bg-card/20 text-white" : "bg-muted text-muted-foreground")}>
                {autoEnabled ? "Ativo" : "Inativo"}
              </span>
            </div>
            <p className={cn("text-xs font-medium leading-relaxed", autoEnabled ? "text-white/80" : "text-muted-foreground")}>
              {autoEnabled ? "Varredura automática de regras e notificações em execução." : "A automação está desligada. Apenas ações manuais serão processadas."}
            </p>
          </div>
          <button onClick={() => toggleAutomation.mutate({ enabled: !autoEnabled })} disabled={toggleAutomation.isPending} className="transition-transform hover:scale-110 active:scale-90 disabled:opacity-50">
            {toggleAutomation.isPending
              ? <Loader2 size={48} className="animate-spin opacity-50" />
              : autoEnabled
                ? <ToggleRight size={64} className="text-white drop-shadow-lg" />
                : <ToggleLeft size={64} className="text-muted-foreground/30" />
            }
          </button>
        </div>
      </div>

      {/* ── CARD: ROBÔ DE ANTECIPAÇÃO INTELIGENTE POR FALTA ── */}
      <div className={cn(
        "relative overflow-hidden p-6 rounded-[2rem] border transition-all duration-300",
        autoAdvanceEnabled
          ? "bg-gradient-to-br from-amber-500/15 via-primary/10 to-amber-600/10 border-amber-500/30 shadow-lg shadow-amber-500/5"
          : "bg-card border-border shadow-sm text-muted-foreground"
      )}>
        <div className="flex flex-col sm:flex-row items-center gap-6 relative z-10">
          <div className={cn(
            "w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-lg transition-all",
            autoAdvanceEnabled ? "bg-amber-500 text-white shadow-amber-500/30" : "bg-muted text-muted-foreground"
          )}>
            <Zap size={28} className={autoAdvanceEnabled ? "fill-white animate-pulse" : ""} />
          </div>
          <div className="flex-1 text-center sm:text-left min-w-0">
            <div className="flex items-center justify-center sm:justify-start gap-3 mb-1.5">
              <h3 className="text-base font-black text-foreground uppercase tracking-widest flex items-center gap-2">
                <span>Robô de Antecipação por Falta</span>
                <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-full">Smart Slot</span>
              </h3>
              <span className={cn(
                "text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full",
                autoAdvanceEnabled ? "bg-amber-500 text-white shadow-xs" : "bg-muted text-muted-foreground"
              )}>
                {autoAdvanceEnabled ? "Ativo" : "Inativo"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground font-medium leading-relaxed">
              Ao registrar falta em uma aula (ex: 19h), envia WhatsApp automático para alunos com aula mais tarde (ex: 20h/21h) oferecendo o adiantamento de horário via Portal do Aluno com confirmação em tempo real.
            </p>
          </div>
          <button
            type="button"
            onClick={() => toggleAutoAdvanceMutation.mutate({ enabled: !autoAdvanceEnabled })}
            disabled={toggleAutoAdvanceMutation.isPending}
            className="transition-transform hover:scale-110 active:scale-90 disabled:opacity-50 cursor-pointer"
          >
            {toggleAutoAdvanceMutation.isPending ? (
              <Loader2 size={48} className="animate-spin opacity-50 text-amber-500" />
            ) : autoAdvanceEnabled ? (
              <ToggleRight size={64} className="text-amber-500 drop-shadow-md" />
            ) : (
              <ToggleLeft size={64} className="text-muted-foreground/30" />
            )}
          </button>
        </div>
      </div>

      {/* ── CARD: LIMPEZA DE LEMBRETES ACUMULADOS ── */}
      {pendingCount > 0 && (
        <div className="relative overflow-hidden p-6 rounded-[2rem] border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-background to-emerald-500/10 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <CheckCheck size={24} />
            </div>
            <div>
              <h4 className="text-sm font-black text-foreground uppercase tracking-wider flex items-center gap-2">
                <span>{pendingCount} Lembretes Acumulados na Fila</span>
                <span className="text-[10px] bg-amber-500 text-white font-black px-2 py-0.5 rounded-full">Atenção</span>
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Para evitar disparos em massa antigos ao ligar o robô no WhatsApp, você pode marcar todos os lembretes pendentes como já concluídos.
              </p>
            </div>
          </div>
          <Button
            onClick={() => completeAllPendingMut.mutate({ targetStatus: "enviado" })}
            disabled={completeAllPendingMut.isPending}
            className="h-11 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider gap-2 shadow-md shadow-emerald-500/20 shrink-0 cursor-pointer"
          >
            {completeAllPendingMut.isPending ? <Loader2 size={16} className="animate-spin" /> : <CheckCheck size={16} />}
            Concluir Todos Pendentes ({pendingCount})
          </Button>
        </div>
      )}

      {isSupported && permission === "default" && (
        <div className="flex flex-col sm:flex-row items-center gap-4 p-5 rounded-2xl bg-amber-500/10 border border-amber-500/20 shadow-sm shrink-0">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-600 flex items-center justify-center shrink-0"><BellRing size={20} /></div>
          <p className="text-[11px] lg:text-xs text-amber-800 dark:text-amber-300 font-bold uppercase tracking-widest flex-1 leading-snug text-center sm:text-left">Ative os alertas para ser avisado sobre novos lembretes no celular.</p>
          <Button size="sm" disabled={isSyncing} className="w-full sm:w-auto h-9 rounded-xl bg-amber-600 text-white font-black uppercase tracking-widest text-[9px] px-4 shadow-lg shadow-amber-500/20 hover:bg-amber-700" onClick={handleSyncNotifications}>
            {isSyncing ? <Loader2 size={14} className="animate-spin mr-2" /> : null}Ativar Notificações
          </Button>
        </div>
      )}

      {isSupported && permission === "granted" && (
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 shadow-sm shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-600 flex items-center justify-center shrink-0">
              <BellRing size={20} />
            </div>
            <p className="text-[11px] lg:text-xs text-emerald-800 dark:text-emerald-300 font-bold uppercase tracking-widest leading-snug">
              Notificações Ativadas! Seu celular receberá os avisos mesmo com o app fechado.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap w-full md:w-auto shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-emerald-500/20">
            <Button size="sm" variant="outline" disabled={isSyncing} className="flex-1 sm:flex-none h-9 rounded-xl border-emerald-500/30 text-emerald-700 dark:text-emerald-300 font-black uppercase tracking-widest text-[9px] px-3.5 hover:bg-emerald-500/20" onClick={handleSyncNotifications}>
              {isSyncing ? <Loader2 size={14} className="animate-spin mr-1.5" /> : null}Sincronizar
            </Button>
            <Button size="sm" variant="outline" disabled={cleanPush.isPending || isSyncing} className="flex-1 sm:flex-none h-9 rounded-xl border-amber-500/40 text-amber-700 dark:text-amber-300 font-black uppercase tracking-widest text-[9px] px-3.5 hover:bg-amber-500/20"             onClick={async () => {
              try {
                // forceRefresh=true: apaga a subscrição antiga (possivelmente inválida) e gera nova via VAPID
                const token = await requestForToken(true);
                if (token) {
                  const res = await cleanPush.mutateAsync({ token, deviceInfo: navigator.userAgent });
                  toast.success(res.message);
                } else {
                  toast.error("Não foi possível capturar a subscrição de push. Verifique se as notificações estão permitidas no navegador.");
                }
              } catch (e: any) {
                toast.error("Erro ao resetar: " + (e.message || String(e)));
              }
            }}>
              {cleanPush.isPending ? <Loader2 size={14} className="animate-spin mr-1.5" /> : null}Resetar / Definir Principal
            </Button>
            <Button size="sm" variant="outline" className="flex-1 sm:flex-none h-9 rounded-xl border-emerald-500/30 text-emerald-700 dark:text-emerald-300 font-black uppercase tracking-widest text-[9px] px-3.5 hover:bg-emerald-500/20" onClick={() => testPush.mutate()} disabled={testPush.isPending || isSyncing}>
              {testPush.isPending ? <Loader2 size={14} className="animate-spin mr-1.5" /> : null}Disparar Teste
            </Button>
          </div>
        </div>
      )}

      {permission === "denied" && (
        <div className="flex flex-col sm:flex-row items-center gap-4 p-5 rounded-2xl bg-rose-500/10 border border-rose-500/20 shadow-sm shrink-0">
          <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-600 flex items-center justify-center shrink-0"><BellRing size={20} /></div>
          <div className="flex-1 text-center sm:text-left">
            <p className="text-[11px] lg:text-xs text-rose-800 dark:text-rose-300 font-bold uppercase tracking-widest leading-snug">Notificações Bloqueadas no Celular/Navegador</p>
            <p className="text-[10px] text-rose-700/80 dark:text-rose-400 font-medium mt-1">Para receber alertas no celular, toque no ícone de cadeado na barra de endereço do navegador e ative a permissão "Notificações".</p>
          </div>
          <Button size="sm" variant="outline" disabled={isSyncing} className="w-full sm:w-auto h-9 rounded-xl border-rose-500/30 text-rose-700 dark:text-rose-300 font-black uppercase tracking-widest text-[9px] px-4 hover:bg-rose-500/20" onClick={handleSyncNotifications}>
            {isSyncing ? <Loader2 size={14} className="animate-spin mr-2" /> : null}Tentar Novamente
          </Button>
        </div>
      )}

      {!isSupported && (
        <div className="flex flex-col sm:flex-row items-center gap-4 p-5 rounded-2xl bg-amber-500/10 border border-amber-500/20 shadow-sm shrink-0">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-600 flex items-center justify-center shrink-0"><BellRing size={20} /></div>
          <div className="flex-1 text-center sm:text-left">
            <p className="text-[11px] lg:text-xs text-amber-800 dark:text-amber-300 font-bold uppercase tracking-widest leading-snug">Navegador sem Suporte Direto a Web Push</p>
            <p className="text-[10px] text-amber-700/80 dark:text-amber-400 font-medium mt-1">No iPhone/iOS, toque em "Compartilhar" e escolha "Adicionar à Tela de Início" para ativar as notificações push.</p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div id="tour-auto-stats" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Mensagens Enviadas" value={stats?.totalSent ?? 0} icon={Send} color="bg-gradient-to-br from-emerald-500 to-teal-600" />
        <StatCard label="Automações Ativas" value={stats?.activeRules ?? 0} icon={Zap} color="bg-gradient-to-br from-indigo-500 to-violet-600" />
        <StatCard label="Taxa de Entrega" value={`${stats?.deliveryRate ?? 0}%`} icon={TrendingUp} color="bg-gradient-to-br from-blue-500 to-indigo-600" sub="Mensagens confirmadas" />
        <StatCard label="Top Automação" value={stats?.topRule?.totalSent ?? 0} icon={Star} color="bg-gradient-to-br from-amber-500 to-orange-600" sub={stats?.topRule?.name ?? "—"} />
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar automações..."
          className="w-full pl-11 pr-4 h-11 bg-card border border-border rounded-2xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X size={14} />
          </button>
        )}
      </div>

      {/* System Rules */}
      <section>
        <div id="tour-auto-rules" className="flex items-center gap-3 mb-5">
          <div className="w-8 h-8 rounded-xl bg-indigo-500/10 flex items-center justify-center">
            <Sparkles size={16} className="text-indigo-500" />
          </div>
          <div>
            <h2 className="text-sm font-black text-foreground uppercase tracking-widest">Regras Padrão do Sistema</h2>
            <p className="text-[10px] text-muted-foreground font-medium">Nativas da plataforma — edite o timing e o texto a qualquer momento</p>
          </div>
        </div>
        {filteredSystem.length === 0 ? (
          <p className="text-center py-10 text-muted-foreground text-sm">{search ? "Nenhuma regra encontrada" : "Carregando regras padrão..."}</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <AnimatePresence>
              {filteredSystem.map(rule => (
                <RuleCard key={rule.id} rule={rule} onToggle={(id, v) => toggleMutation.mutate({ id, isActive: v ? 1 : 0 })}
                  onEdit={setEditorRule} onHistory={setHistoryRule} loading={toggleMutation.isPending} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </section>

      {/* Custom Rules */}
      <section>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-violet-500/10 flex items-center justify-center">
              <Settings size={16} className="text-violet-500" />
            </div>
            <div>
              <h2 className="text-sm font-black text-foreground uppercase tracking-widest">Minhas Automações</h2>
              <p className="text-[10px] text-muted-foreground font-medium">Regras personalizadas criadas por você</p>
            </div>
          </div>
          {customRules.length > 0 && (
            <span className="text-xs font-black text-muted-foreground bg-muted px-3 py-1.5 rounded-xl">
              {customRules.length} {customRules.length === 1 ? "regra" : "regras"}
            </span>
          )}
        </div>

        {filteredCustom.length === 0 && !search ? (
          <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-border rounded-3xl bg-muted/20">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-violet-500/10 flex items-center justify-center mb-4">
              <Plus size={24} className="text-indigo-500" />
            </div>
            <p className="text-sm font-black text-foreground">Nenhuma automação personalizada</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">Crie suas próprias regras para complementar as regras padrão do sistema.</p>
            <Button onClick={() => setEditorRule({ trigger: "payment_due", offsetDays: -3, isActive: 1 })}
              className="mt-5 h-10 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs shadow-lg gap-2"
            >
              <Plus size={14} /> Criar Primeira Automação
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <AnimatePresence>
              {filteredCustom.map(rule => (
                <RuleCard key={rule.id} rule={rule} onToggle={(id, v) => toggleMutation.mutate({ id, isActive: v ? 1 : 0 })}
                  onEdit={setEditorRule} onDelete={handleDelete} onHistory={setHistoryRule} loading={toggleMutation.isPending} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </section>

      {/* Info */}
      <div className="flex items-start gap-4 p-5 bg-blue-500/5 rounded-2xl border border-blue-500/15">
        <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0">
          <Info size={16} className="text-blue-500" />
        </div>
        <div>
          <p className="text-sm font-bold text-foreground">Como funciona o timing?</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            O servidor verifica as regras ativas a cada minuto. Ex: regra "Mensalidade — 3 dias antes" e vencimento em 22/06 → lembrete gerado em 19/06.
            Mude de 3 para 5 dias antes, ou 2 dias depois — a regra atualiza automaticamente.
          </p>
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {editorRule !== null && (
          <RuleEditorModal rule={editorRule} onClose={() => setEditorRule(null)} onSave={handleSaveRule} />
        )}
        {historyRule && (
          <HistoryModal rule={historyRule} onClose={() => setHistoryRule(null)} />
        )}
        {ruleToDelete !== null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
              className="bg-card border border-border rounded-3xl w-full max-w-sm shadow-2xl p-6 flex flex-col gap-4"
            >
              <h3 className="text-lg font-black text-foreground">Excluir automação?</h3>
              <p className="text-sm text-muted-foreground">Esta ação é irreversível e excluirá a automação e seu histórico.</p>
              <div className="flex justify-end gap-3 mt-2">
                <Button variant="outline" onClick={() => setRuleToDelete(null)} className="rounded-xl">Cancelar</Button>
                <Button variant="destructive" onClick={() => { deleteMutation.mutate({ id: ruleToDelete }); setRuleToDelete(null); }} className="rounded-xl">Excluir</Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
