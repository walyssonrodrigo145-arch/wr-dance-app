import { useState, useMemo, useEffect } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { formatBRL } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BirthDatePicker } from "@/components/enrollment/BirthDatePicker";
import { CourseSchedulePicker } from "@/components/enrollment/CourseSchedulePicker";
import { maskCPF, maskPhone } from "@/lib/masks";
import { validateCPF } from "@/lib/cpf";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Music, Calendar, Clock, CheckCircle2, User, Phone,
  Mail, Sparkles, Loader2, Copy, ExternalLink,
  ChevronRight, CreditCard, ArrowLeft, BadgeCheck, QrCode,
  FileSignature, MessageCircle, Info,
} from "lucide-react";

// Fluxo: Curso → Dados + Pagamento → Horário → Confirmação → Sucesso
type Step = "course" | "payment" | "schedule" | "success";

/** Idade em anos a partir de "YYYY-MM-DD". */
function computeAge(birthDate: string): number | null {
  if (!birthDate) return null;
  const d = new Date(`${birthDate}T12:00:00`);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

/** Link de WhatsApp a partir de um telefone (adiciona DDI 55 se necessário). */
function waLink(phone?: string | null, text?: string): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length <= 11) digits = `55${digits}`;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

export default function PublicEnrollment() {
  const params = useParams<{ code: string }>();
  const code = params.code || "";

  // ─── State ───────────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>("course");
  type SelectedCourse = { instrumentId: number; planId: number | null; weekday: number | null; timeStr: string | null; teacherUserId: number | null; studioRoomId: number | null };
  const [courses, setCourses] = useState<SelectedCourse[]>([]);
  const [dueDay, setDueDay] = useState<number | null>(null);
  const [billingType, setBillingType] = useState<"PIX" | "BOLETO">("PIX");

  const selectedInstrument = courses[0]?.instrumentId ?? null;
  const requiredLessonsPerWeek = courses.length >= 2 ? 2 : 1;

  const [form, setForm] = useState({
    name: "", phone: "", email: "", cpf: "",
    birthDate: "",
    guardianName: "", guardianCpf: "", guardianPhone: "", guardianEmail: "",
  });

  const age = computeAge(form.birthDate);
  const isMinor = age !== null && age < 18;

  // Próximo vencimento estimado (mesmo dia do mês seguinte)
  const nextDueLabel = useMemo(() => {
    const now = new Date();
    const y = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
    const m = (now.getMonth() + 1) % 12;
    const day = Math.min(now.getDate(), new Date(y, m + 1, 0).getDate());
    return new Date(y, m, day).toLocaleDateString("pt-BR");
  }, []);

  const [paymentData, setPaymentData] = useState<{
    chargeId?: string;
    invoiceUrl?: string;
    pixQrCode?: string | null;
    pixCopiaECola?: string | null;
    value: number;
    skipPayment?: boolean;
  } | null>(null);

  // ── Estado de verificação de pagamento MP ────────────────────────────────────
  const [mpVerifying, setMpVerifying] = useState(false);
  // URL do checkout (MP ou InfinitePay) aberto em nova aba
  const [mpCheckoutUrl, setMpCheckoutUrl] = useState<string | null>(null);
  const [mpPaymentValue, setMpPaymentValue] = useState<number>(0);
  // Provedor do checkout em aberto (para textos e verificação correta)
  const [checkoutProvider, setCheckoutProvider] = useState<"mercadopago" | "infinitepay">("mercadopago");
  // Slug do checkout InfinitePay (usado na verificação via payment_check)
  const [checkoutSlug, setCheckoutSlug] = useState<string | null>(null);

  // Verifica pagamento MP via API do backend (não confia apenas na URL)
  const verifyMPMutation = trpc.enrollment.verifyMPPayment.useQuery(
    { code, paymentId: new URLSearchParams(window.location.search).get("payment_id") || "" },
    { enabled: false } // só roda quando chamado manualmente via refetch
  );

  // Detecta retorno do Mercado Pago via ?payment_id=XXX&status=YYY na URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const mpStatus = urlParams.get("status");
    const paymentId = urlParams.get("payment_id") || urlParams.get("collection_id");

    if (!mpStatus || !paymentId) return;

    // Remove os params da URL imediatamente
    window.history.replaceState({}, "", window.location.pathname);

    // Restaura dados salvos antes do redirect para o MP
    try {
      const saved = localStorage.getItem(`mp_enrollment_${window.location.pathname}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.courses)) setCourses(parsed.courses);
        if (parsed.dueDay) setDueDay(parsed.dueDay);
        if (parsed.form) setForm(prev => ({ ...prev, ...parsed.form }));
        localStorage.removeItem(`mp_enrollment_${window.location.pathname}`);
      }
    } catch (_) {}

    // Verifica pagamento real na API do Mercado Pago via backend
    setMpVerifying(true);
    fetch(`/api/trpc/enrollment.verifyMPPayment?batch=1&input=${encodeURIComponent(JSON.stringify({ "0": { json: { code, paymentId } } }))}`)
      .then(r => r.json())
      .then((res: any) => {
        const result = res?.[0]?.result?.data?.json;
        if (result?.verified) {
          setStep("schedule");
          if (result.status === "approved") {
            toast.success("Pagamento aprovado! Agora escolha seu horário.");
          } else {
            toast.success("Pagamento recebido! Assim que confirmado, sua vaga estará garantida.");
          }
        } else {
          toast.error(`Pagamento não confirmado (status: ${result?.status ?? "desconhecido"}). Tente novamente.`);
        }
      })
      .catch(() => {
        // Fallback: confia no status da URL se a verificação falhar
        if (mpStatus === "approved" || mpStatus === "pending") {
          setStep("schedule");
          toast.success("Pagamento recebido! Agora escolha seu horário.");
        } else {
          toast.error("Não foi possível verificar o pagamento. Tente novamente.");
        }
      })
      .finally(() => setMpVerifying(false));
  }, []);

  // ─── Queries ─────────────────────────────────────────────────────────────────
  const { data: details, isLoading: detailsLoading, error: detailsError } =
    trpc.enrollment.getPublicDetails.useQuery(
      { code },
      { enabled: Boolean(code), retry: 1, staleTime: 0, gcTime: 0, refetchOnMount: "always" }
    );

  // Ao mudar o nº de cursos (1↔2+), limpa planos que não pertencem ao filtro atual
  // (ex.: plano de 1 aula/semana deixa de valer quando o aluno escolhe 2 cursos).
  useEffect(() => {
    const plans: any[] = (details as any)?.plans || [];
    if (plans.length === 0) return;
    const filtered = plans.filter((p) => Number(p.aulasPorSemana) === requiredLessonsPerWeek);
    const allowed = new Set((filtered.length > 0 ? filtered : plans).map((p) => p.id));
    setCourses((prev) => {
      if (!prev.some((c) => c.planId && !allowed.has(c.planId))) return prev;
      return prev.map((c) => (c.planId && !allowed.has(c.planId) ? { ...c, planId: null } : c));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requiredLessonsPerWeek, (details as any)?.plans]);

  // Dia de vencimento vem do PLANO escolhido (schoolPlans.diasLimite); fallback = escola
  useEffect(() => {
    const plans: any[] = (details as any)?.plans || [];
    const selectedPlanIds = Array.from(new Set(courses.map((c) => c.planId).filter((id): id is number => !!id)));
    const planDays = Array.from(new Set(
      selectedPlanIds.flatMap((id) =>
        String(plans.find((p) => p.id === id)?.diasLimite || "")
          .split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => n >= 1 && n <= 31)
      )
    )).sort((a, b) => a - b);
    const available = planDays.length > 0 ? planDays : ((details as any)?.dueDays || []);
    if (available.length > 0) setDueDay((prev) => (prev && available.includes(prev) ? prev : available[0]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courses, details]);

  // instrumentId resolvido (1º curso) — usado apenas para o resumo/legado
  const resolvedInstrumentId = selectedInstrument
    ?? details?.preselectedInstrumentId
    ?? (details?.instruments?.[0]?.id ?? null);

  // ─── Mutations ───────────────────────────────────────────────────────────────
  const createChargeMutation = trpc.enrollment.createPaymentCharge.useMutation({
    onSuccess: (data) => {
      if (data.skipPayment) {
        // Sem gateway: vai direto para seleção de horário
        setStep("schedule");
      } else if ((data as any).gateway === "infinitepay" && (data as any).invoiceUrl) {
        // Salva estado no localStorage ANTES de abrir o checkout InfinitePay
        try {
          localStorage.setItem(`mp_enrollment_${window.location.pathname}`, JSON.stringify({
            courses,
            dueDay,
            form,
          }));
        } catch (_) {}
        // InfinitePay: abre em nova aba e mostra tela de aguardo com botão de verificação
        window.open((data as any).invoiceUrl, "_blank");
        setCheckoutProvider("infinitepay");
        setCheckoutSlug((data as any).slug ?? null);
        setMpCheckoutUrl((data as any).invoiceUrl);
        setMpPaymentValue((data as any).value || 0);
      } else if ((data as any).gateway === "mercadopago" && (data as any).invoiceUrl) {
        // Salva estado no localStorage ANTES de abrir o checkout MP
        try {
          localStorage.setItem(`mp_enrollment_${window.location.pathname}`, JSON.stringify({
            courses,
            dueDay,
            form,
          }));
        } catch (_) {}
        // Mercado Pago: abre em nova aba e mostra tela de aguardo com botão de verificação
        window.open((data as any).invoiceUrl, "_blank");
        setCheckoutProvider("mercadopago");
        setMpCheckoutUrl((data as any).invoiceUrl);
        setMpPaymentValue((data as any).value || 0);
      } else {
        // Asaas: exibe QR Code PIX ou link de boleto na tela
        setPaymentData({
          chargeId: (data as any).chargeId,
          invoiceUrl: (data as any).invoiceUrl,
          pixQrCode: (data as any).pixQrCode,
          pixCopiaECola: (data as any).pixCopiaECola,
          value: (data as any).value,
        });
      }
    },
    onError: (e) => toast.error("Erro ao gerar cobrança: " + e.message),
  });

  const confirmMutation = trpc.enrollment.submitEnrollment.useMutation({
    onSuccess: () => setStep("success"),
    onError: (e) => toast.error("Erro ao confirmar matrícula: " + e.message),
  });

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  const copyPix = async () => {
    if (!paymentData?.pixCopiaECola) return;
    await navigator.clipboard.writeText(paymentData.pixCopiaECola);
    toast.success("Chave PIX copiada!");
  };

  // Verifica manualmente o pagamento (MP via external_reference ou InfinitePay via payment_check)
  const handleVerifyMPPayment = async () => {
    setMpVerifying(true);
    try {
      if (checkoutProvider === "infinitepay") {
        // InfinitePay: revalidação server-to-server (payment_check) no backend
        const res = await fetch(
          `/api/trpc/enrollment.verifyInfinitePayPayment?batch=1&input=${encodeURIComponent(JSON.stringify({ "0": { json: { code, slug: checkoutSlug ?? undefined } } }))}`
        );
        const resJson: any = await res.json();
        const result = resJson?.[0]?.result?.data?.json;
        const errMsg = resJson?.[0]?.error?.message;
        if (errMsg) throw new Error(errMsg);
        if (result?.verified) {
          setMpCheckoutUrl(null);
          setStep("schedule");
          toast.success("Pagamento confirmado! Agora escolha seu horário.");
        } else {
          toast.error("Pagamento ainda não confirmado. Conclua o pagamento (PIX ou cartão) e tente novamente em alguns segundos.");
        }
        return;
      }

      // Tenta buscar o payment_id mais recente via API do backend (external_reference = enrollment_${code})
      const res = await fetch(
        `/api/trpc/enrollment.verifyMPByReference?batch=1&input=${encodeURIComponent(JSON.stringify({ "0": { json: { code } } }))}`
      );
      const resJson: any = await res.json();
      const result = resJson?.[0]?.result?.data?.json;
      if (result?.verified) {
        setMpCheckoutUrl(null);
        setStep("schedule");
        toast.success("Pagamento confirmado! Agora escolha seu horário.");
      } else {
        toast.error(
          result?.status === "pending"
            ? "Pagamento PIX pendente — aguarde a confirmação do banco (pode levar alguns instantes)."
            : `Pagamento ainda não confirmado (status: ${result?.status ?? "aguardando"}). Tente novamente em alguns segundos.`
        );
      }
    } catch {
      toast.error("Não foi possível verificar. Certifique-se de que concluiu o pagamento e tente novamente.");
    } finally {
      setMpVerifying(false);
    }
  };

  // Verifica a cobrança Asaas (PIX/Boleto) server-side antes de escolher o horário
  const handleVerifyAsaas = async () => {
    if (!paymentData?.chargeId) { setStep("schedule"); return; }
    setMpVerifying(true);
    try {
      const res = await fetch(
        `/api/trpc/enrollment.verifyAsaasCharge?batch=1&input=${encodeURIComponent(JSON.stringify({ "0": { json: { code, chargeId: paymentData.chargeId } } }))}`
      );
      const json: any = await res.json();
      const result = json?.[0]?.result?.data?.json;
      if (result?.paid) {
        setStep("schedule");
        toast.success("Pagamento confirmado! Agora escolha seu horário.");
      } else {
        toast.error("Pagamento ainda não confirmado. Conclua o PIX/Boleto e tente novamente em alguns segundos.");
      }
    } catch {
      toast.error("Não foi possível verificar o pagamento. Tente novamente.");
    } finally {
      setMpVerifying(false);
    }
  };

  const validateForm = (): string | null => {
    if (form.name.trim().length < 3) return "Informe seu nome completo.";
    const phoneDigits = form.phone.replace(/\D/g, "");
    if (phoneDigits.length < 10 || phoneDigits.length > 11) return "Informe um WhatsApp válido com DDD.";
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return "E-mail inválido.";
    if (form.cpf.trim()) {
      const err = validateCPF(form.cpf);
      if (err) return err;
    }
    if (isMinor) {
      if (!form.guardianName.trim()) return "Informe o nome do responsável.";
      const gDigits = form.guardianPhone.replace(/\D/g, "");
      if (gDigits.length < 10) return "Informe o WhatsApp do responsável.";
      if (form.guardianCpf.trim()) { const e = validateCPF(form.guardianCpf); if (e) return e; }
    }
    return null;
  };

  // ─── Loading / Error ──────────────────────────────────────────────────────────
  if (detailsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <Loader2 className="w-10 h-10 animate-spin text-indigo-500 mx-auto" />
          <p className="text-xs text-muted-foreground font-semibold">Carregando dados da escola...</p>
        </div>
      </div>
    );
  }

  if (mpVerifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 animate-spin text-indigo-500 mx-auto" />
          <p className="text-sm font-bold text-foreground">Verificando pagamento...</p>
          <p className="text-xs text-muted-foreground">Consultando o Mercado Pago. Aguarde um momento.</p>
        </div>
      </div>
    );
  }

  // Tela de aguardo quando o checkout MP foi aberto em nova aba
  if (mpCheckoutUrl) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-indigo-950/10 p-4">
        <Card className="max-w-sm w-full p-8 space-y-6 rounded-3xl border-border bg-card shadow-2xl text-center">
          {/* Ícone animado */}
          <div className="relative mx-auto w-20 h-20">
            <div className="absolute inset-0 rounded-full bg-blue-500/20 animate-ping" />
            <div className="relative w-20 h-20 rounded-full bg-blue-500/10 flex items-center justify-center">
              <CreditCard size={36} className="text-blue-400" />
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-black text-foreground">Conclua o pagamento</h2>
            <p className="text-xs text-muted-foreground">
              O checkout do {checkoutProvider === "infinitepay" ? "InfinitePay" : "Mercado Pago"} foi aberto em uma nova aba. Realize o pagamento e depois clique no botão abaixo para confirmar.
            </p>
            {mpPaymentValue > 0 && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-black">
                Valor: {formatBRL(mpPaymentValue)}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <Button
              onClick={handleVerifyMPPayment}
              disabled={mpVerifying}
              className="w-full h-12 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold text-sm shadow-lg shadow-emerald-500/20"
            >
              {mpVerifying ? <Loader2 size={18} className="mr-2 animate-spin" /> : <BadgeCheck size={18} className="mr-2" />}
              Já paguei — Verificar Pagamento
            </Button>

            <a
              href={mpCheckoutUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold hover:bg-blue-500/20 transition-all"
            >
              <ExternalLink size={14} />
              Reabrir checkout do {checkoutProvider === "infinitepay" ? "InfinitePay" : "Mercado Pago"}
            </a>

            <button
              onClick={() => setMpCheckoutUrl(null)}
              className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground underline underline-offset-2 transition-colors"
            >
              Cancelar e voltar
            </button>
          </div>
        </Card>
      </div>
    );
  }

  if (detailsError || !details) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4 text-center">
        <Card className="max-w-sm w-full p-8 space-y-4 rounded-3xl border-rose-500/20 shadow-2xl">
          <div className="w-16 h-16 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto">
            <Sparkles size={28} />
          </div>
          <h2 className="text-xl font-black text-foreground">Link Inválido</h2>
          <p className="text-xs text-muted-foreground">Este link de matrícula expirou ou já foi utilizado.</p>
        </Card>
      </div>
    );
  }

  // ─── Steps config ─────────────────────────────────────────────────────────────
  const STEPS = [
    { key: "course",   label: "Curso" },
    { key: "payment",  label: "Dados & Pagamento" },
    { key: "schedule", label: "Horário" },
  ];
  const currentIdx = STEPS.findIndex(s => s.key === step);
  const schoolWaLink = waLink(details.schoolPhone, `Olá! Acabei de fazer minha matrícula em ${details.schoolName} pelo link. 🎵`);

  // Planos: 1 curso → 1 aula/semana; 2+ cursos → 2 aulas/semana
  const allPlans: any[] = (details as any).plans || [];
  const plansForCount = allPlans.filter((p) => Number(p.aulasPorSemana) === requiredLessonsPerWeek);
  const availablePlans = plansForCount.length > 0 ? plansForCount : allPlans;
  const planById = new Map<number, any>(allPlans.map((p) => [p.id, p]));

  // O PLANO já cobre os instrumentos (ex.: 2 aulas/semana) → cobra 1x por PLANO
  // distinto (valor + taxa de inscrição). Não somar por curso.
  const seenPlanKeys = new Set<number>();
  const billablePlans: { key: number; label: string; monthlyFee: number; enrollmentFee: number }[] = [];
  for (const c of courses) {
    const key = c.planId ?? -1;
    if (seenPlanKeys.has(key)) continue;
    seenPlanKeys.add(key);
    const p = c.planId ? planById.get(c.planId) : null;
    const instrumentsInPlan = courses
      .filter((x) => (x.planId ?? -1) === key)
      .map((x) => details.instruments.find((i: any) => i.id === x.instrumentId)?.name)
      .filter(Boolean)
      .join(" + ");
    billablePlans.push({
      key,
      label: p ? `${p.nome} · ${instrumentsInPlan}` : instrumentsInPlan || "Curso",
      monthlyFee: p ? Number(p.valorMensal) : Number(details.monthlyFee || 0),
      enrollmentFee: p ? Number(p.taxaInscricao || 0) : 0,
    });
  }
  const monthlyTotal = billablePlans.reduce((s, b) => s + b.monthlyFee, 0);
  const enrollmentFeeTotal = billablePlans.reduce((s, b) => s + b.enrollmentFee, 0);
  const totalToPay = monthlyTotal + enrollmentFeeTotal;
  // Vencimento a partir do(s) plano(s) escolhido(s); fallback = configuração da escola
  const selectedPlanIdsForDue = Array.from(new Set(courses.map((c) => c.planId).filter((id): id is number => !!id)));
  const planDueDays = Array.from(new Set(
    selectedPlanIdsForDue.flatMap((id) =>
      String(planById.get(id)?.diasLimite || "")
        .split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => n >= 1 && n <= 31)
    )
  )).sort((a, b) => a - b);
  const dueDays: number[] = planDueDays.length > 0 ? planDueDays : ((details as any).dueDays || []);

  const toggleCourse = (instrumentId: number) => {
    setCourses((prev) => {
      if (prev.some((c) => c.instrumentId === instrumentId)) {
        return prev.filter((c) => c.instrumentId !== instrumentId);
      }
      if (prev.length >= 6) { toast.error("Máximo de 6 cursos por matrícula."); return prev; }
      return [...prev, { instrumentId, planId: null, weekday: null, timeStr: null, teacherUserId: null, studioRoomId: null }];
    });
  };
  const patchCourse = (instrumentId: number, patch: Partial<{ planId: number | null; weekday: number | null; timeStr: string | null; teacherUserId: number | null; studioRoomId: number | null }>) => {
    setCourses((prev) => prev.map((c) => (c.instrumentId === instrumentId ? { ...c, ...patch } : c)));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-indigo-950/10 text-foreground">

      {/* ── Header ── */}
      <div className="sticky top-0 z-10 backdrop-blur-md bg-background/80 border-b border-border/40 px-4 py-3">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {details.schoolLogo ? (
              <div className="w-8 h-8 rounded-lg bg-indigo-600/10 p-0.5 border border-indigo-500/20 flex items-center justify-center overflow-hidden shrink-0">
                <img src={details.schoolLogo} alt={details.schoolName} className="max-w-full max-h-full object-contain" />
              </div>
            ) : (
              <div className="w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-500 flex items-center justify-center shrink-0">
                <Music size={16} />
              </div>
            )}
            <span className="text-sm font-black text-foreground truncate max-w-[180px]">{details.schoolName}</span>
          </div>
          {details.monthlyFee && (
            <span className="text-xs font-bold text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">
              R$ {Number(details.monthlyFee).toFixed(0)}/mês
            </span>
          )}
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 py-6 space-y-6">

        {/* ── Progress Bar ── */}
        {step !== "success" && (
          <div className="flex items-center gap-1">
            {STEPS.map((s, i) => (
              <div key={s.key} className="flex items-center flex-1 last:flex-none">
                <div className={`flex items-center gap-1.5 ${i <= currentIdx ? "text-indigo-400" : "text-muted-foreground/40"}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black border-2 transition-all
                    ${i < currentIdx ? "bg-indigo-600 border-indigo-600 text-white" :
                    i === currentIdx ? "border-indigo-500 text-indigo-400" :
                    "border-border/40 text-muted-foreground/40"}`}>
                    {i < currentIdx ? <CheckCircle2 size={12} /> : i + 1}
                  </div>
                  <span className="text-[10px] font-bold hidden sm:block">{s.label}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-2 rounded-full transition-all ${i < currentIdx ? "bg-indigo-600" : "bg-border/40"}`} />
                )}
              </div>
            ))}
          </div>
        )}

        <AnimatePresence mode="wait">

          {/* ═══════════════════════════════════════════════
              PASSO 1 — Selecione o Curso / Instrumento
          ═══════════════════════════════════════════════ */}
          {step === "course" && (
            <motion.div key="course" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-5">
              <div className="space-y-1">
                <h1 className="text-2xl font-black text-foreground">Quais cursos você quer fazer?</h1>
                <p className="text-xs text-muted-foreground">
                  Selecione um ou mais instrumentos. {courses.length >= 2
                    ? "Com 2 ou mais cursos, mostramos os planos de 2 aulas/semana."
                    : "Com 1 curso, mostramos os planos de 1 aula/semana."}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {details.instruments.map((inst: any) => {
                  const isSelected = courses.some((c) => c.instrumentId === inst.id);
                  return (
                    <button
                      key={inst.id}
                      onClick={() => toggleCourse(inst.id)}
                      className={`relative p-5 rounded-2xl border-2 text-left transition-all duration-200 flex flex-col justify-between h-28 group
                        ${isSelected
                          ? "border-emerald-500 bg-emerald-500/10 shadow-lg shadow-emerald-500/20 ring-1 ring-emerald-500/30"
                          : "border-border/50 bg-card/50 hover:border-emerald-400/40 hover:bg-muted/30"}`}
                    >
                      <Music size={22} className={isSelected ? "text-emerald-500" : "text-muted-foreground group-hover:text-emerald-500/60"} />
                      <span className={`text-sm font-bold truncate ${isSelected ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"}`}>
                        {inst.name}
                      </span>
                      {isSelected && (
                        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shadow-md">
                          <CheckCircle2 size={12} className="text-white" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Planos por curso */}
              {courses.length > 0 && (
                <div className="space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                    Plano de cada curso · {requiredLessonsPerWeek} aula{requiredLessonsPerWeek > 1 ? "s" : ""}/semana
                  </p>
                  {allPlans.length > 0 && plansForCount.length === 0 && (
                    <p className="text-[10px] text-amber-600 dark:text-amber-400">
                      Não há planos de {requiredLessonsPerWeek} aula{requiredLessonsPerWeek > 1 ? "s" : ""}/semana — mostrando os planos disponíveis.
                    </p>
                  )}
                  {courses.map((c) => {
                    const inst = details.instruments.find((i: any) => i.id === c.instrumentId);
                    return (
                      <div key={c.instrumentId} className="rounded-2xl border border-border/40 bg-muted/10 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-black text-foreground">{inst?.name}</p>
                          <button onClick={() => toggleCourse(c.instrumentId)} className="text-[10px] text-rose-500 font-bold hover:underline">Remover</button>
                        </div>
                        {availablePlans.length === 0 ? (
                          <p className="text-[11px] text-muted-foreground">Nenhum plano cadastrado — a escola definirá o valor depois.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {availablePlans.map((p: any) => {
                              const active = c.planId === p.id;
                              return (
                                <button
                                  key={p.id}
                                  onClick={() => patchCourse(c.instrumentId, { planId: p.id })}
                                  className={`w-full text-left rounded-xl border-2 p-2.5 transition-all ${active ? "border-emerald-500 bg-emerald-500/10" : "border-border/40 hover:border-emerald-400/40"}`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs font-bold text-foreground truncate">{p.nome}{p.isBolsa ? " · Bolsa" : ""}</span>
                                    <span className="text-xs font-black text-emerald-500 shrink-0">{formatBRL(Number(p.valorMensal))}/mês</span>
                                  </div>
                                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5 flex-wrap">
                                    <span>{p.duracaoMeses} meses</span>
                                    <span>·</span>
                                    <span>{p.aulasPorSemana} aula(s)/semana</span>
                                    {Number(p.taxaInscricao) > 0 && (<><span>·</span><span className="text-amber-600 dark:text-amber-400 font-bold">inscrição {formatBRL(Number(p.taxaInscricao))}</span></>)}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Resumo de valores */}
              {courses.length > 0 && (
                <div className="rounded-2xl bg-emerald-500/5 border border-emerald-500/15 p-3 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Mensalidade {billablePlans.length > 1 ? `(${billablePlans.length} planos)` : ""}</span>
                    <span className="font-bold text-foreground">{formatBRL(monthlyTotal)}</span>
                  </div>
                  <p className="text-[9px] text-muted-foreground/70 leading-snug">
                    O plano já cobre os instrumentos selecionados — cobramos 1x por plano (e 1 taxa de inscrição).
                  </p>
                  {enrollmentFeeTotal > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Taxa de inscrição</span>
                      <span className="font-bold text-foreground">{formatBRL(enrollmentFeeTotal)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-emerald-500/20 pt-1.5">
                    <span className="font-black text-foreground">Total a pagar no ato</span>
                    <span className="font-black text-emerald-500">{formatBRL(totalToPay)}</span>
                  </div>
                </div>
              )}

              {courses.length > 0 && (
                <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/15 space-y-3 animate-in fade-in">
                  <p className="text-[10px] font-black text-emerald-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Info size={12} /> Como funciona sua matrícula
                  </p>
                  <ol className="space-y-2">
                    {[
                      { n: 1, t: "Escolha seus cursos e planos", d: "Selecione um ou mais instrumentos e o plano de cada um." },
                      { n: 2, t: "Preencha seus dados", d: "Informe seus dados para criar sua matrícula." },
                      { n: 3, t: "Faça o primeiro pagamento", d: `Pague a 1ª mensalidade${enrollmentFeeTotal > 0 ? " + taxa de inscrição" : ""} (${formatBRL(totalToPay)}).` },
                      { n: 4, t: "Escolha seus horários", d: "Após o pagamento, escolha o dia e horário de cada curso." },
                    ].map((s) => (
                      <li key={s.n} className="flex items-start gap-2.5">
                        <span className="w-5 h-5 rounded-full bg-emerald-500 text-white text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">{s.n}</span>
                        <div>
                          <p className="text-xs font-bold text-foreground leading-tight">{s.t}</p>
                          <p className="text-[10px] text-muted-foreground leading-snug">{s.d}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              <Button
                disabled={courses.length === 0 || (availablePlans.length > 0 && courses.some((c) => !c.planId))}
                onClick={() => setStep("payment")}
                className="w-full h-12 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold text-sm shadow-lg shadow-emerald-500/20 disabled:opacity-40"
              >
                Continuar <ChevronRight size={16} />
              </Button>
            </motion.div>
          )}

          {/* ═══════════════════════════════════════════════
              PASSO 2 — Dados Pessoais + Pagamento
          ═══════════════════════════════════════════════ */}
          {step === "payment" && (
            <motion.div key="payment" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-5">

              {/* Se o pagamento ainda não foi gerado, mostra o formulário */}
              {!paymentData && (
                <>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setStep("course")} className="w-8 h-8 rounded-xl border border-border/50 flex items-center justify-center hover:bg-muted/40">
                      <ArrowLeft size={14} />
                    </button>
                    <div>
                      <h2 className="text-xl font-black text-foreground">Seus dados e pagamento</h2>
                      <p className="text-xs text-muted-foreground">Preencha para garantir sua vaga</p>
                    </div>
                  </div>

                  {/* Resumo dos cursos selecionados + taxas */}
                  <div className="p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/20 space-y-2">
                    <p className="text-[10px] text-muted-foreground font-semibold uppercase">Planos selecionados</p>
                    {billablePlans.map((b) => (
                      <div key={b.key} className="flex items-center justify-between text-xs gap-2">
                        <span className="font-bold text-foreground truncate">{b.label}</span>
                        <span className="font-black text-foreground shrink-0">{formatBRL(b.monthlyFee)}</span>
                      </div>
                    ))}
                    <div className="border-t border-indigo-500/20 pt-2 space-y-1 text-xs">
                      <div className="flex justify-between"><span className="text-muted-foreground">Mensalidade</span><span className="font-bold text-foreground">{formatBRL(monthlyTotal)}</span></div>
                      {enrollmentFeeTotal > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Taxa de inscrição</span><span className="font-bold text-amber-600 dark:text-amber-400">{formatBRL(enrollmentFeeTotal)}</span></div>}
                      <div className="flex justify-between border-t border-indigo-500/20 pt-1"><span className="font-black text-foreground">Total a pagar no ato</span><span className="font-black text-emerald-500">{formatBRL(totalToPay)}</span></div>
                    </div>
                  </div>

                  {/* Dia de vencimento da mensalidade */}
                  {dueDays.length > 0 && (
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Dia de vencimento (definido pelo plano)</Label>
                      <div className="flex flex-wrap gap-2">
                        {dueDays.map((d) => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => setDueDay(d)}
                            className={`px-3 py-2 rounded-xl border-2 text-xs font-black transition-all ${dueDay === d ? "border-emerald-500 bg-emerald-500/10 text-emerald-600" : "border-border/50 text-muted-foreground"}`}
                          >
                            Dia {d}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1"><User size={10} /> Nome Completo *</Label>
                      <Input id="enrollment-name" placeholder="Seu nome completo" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="h-11 rounded-xl bg-card/50 border-border/50 focus:border-emerald-500" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1"><Phone size={10} /> WhatsApp *</Label>
                      <Input id="enrollment-phone" placeholder="(00) 00000-0000" inputMode="tel" value={form.phone} onChange={e => setForm({ ...form, phone: maskPhone(e.target.value) })} maxLength={16} className="h-11 rounded-xl bg-card/50 border-border/50 focus:border-emerald-500" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1"><Mail size={10} /> E-mail</Label>
                      <Input id="enrollment-email" type="email" placeholder="seu@email.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="h-11 rounded-xl bg-card/50 border-border/50 focus:border-emerald-500" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">CPF (para gerar PIX ou Boleto)</Label>
                      <Input id="enrollment-cpf" placeholder="000.000.000-00" inputMode="numeric" value={form.cpf} onChange={e => setForm({ ...form, cpf: maskCPF(e.target.value) })} maxLength={14} className="h-11 rounded-xl bg-card/50 border-border/50 focus:border-emerald-500" />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Data de Nascimento *</Label>
                      <BirthDatePicker value={form.birthDate} onChange={(v) => setForm(f => ({ ...f, birthDate: v }))} />
                    </div>

                    {isMinor && (
                      <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                        <p className="text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                          <Info size={12} /> Dados do responsável (aluno menor de 18 anos)
                        </p>
                        <Input placeholder="Nome do responsável *" value={form.guardianName} onChange={e => setForm({ ...form, guardianName: e.target.value })} className="h-11 rounded-xl bg-card/50 border-border/50 focus:border-emerald-500" />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <Input placeholder="CPF do responsável" inputMode="numeric" value={form.guardianCpf} onChange={e => setForm({ ...form, guardianCpf: maskCPF(e.target.value) })} maxLength={14} className="h-11 rounded-xl bg-card/50 border-border/50 focus:border-emerald-500" />
                          <Input placeholder="WhatsApp do responsável *" inputMode="tel" value={form.guardianPhone} onChange={e => setForm({ ...form, guardianPhone: maskPhone(e.target.value) })} maxLength={16} className="h-11 rounded-xl bg-card/50 border-border/50 focus:border-emerald-500" />
                        </div>
                        <Input type="email" placeholder="E-mail do responsável" value={form.guardianEmail} onChange={e => setForm({ ...form, guardianEmail: e.target.value })} className="h-11 rounded-xl bg-card/50 border-border/50 focus:border-emerald-500" />
                      </div>
                    )}

                    {/* Escolha do método de pagamento */}
                    {details.paymentGateway === "asaas" && (
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Método de Pagamento</Label>
                        <div className="grid grid-cols-2 gap-2">
                          {(["PIX", "BOLETO"] as const).map(type => (
                            <button
                              key={type}
                              onClick={() => setBillingType(type)}
                              className={`py-3 rounded-xl border-2 text-xs font-bold transition-all
                                ${billingType === type
                                  ? "border-indigo-500 bg-indigo-500/10 text-indigo-400"
                                  : "border-border/40 text-muted-foreground"}`}
                            >
                              {type === "PIX" ? "🔑 PIX" : "📄 Boleto"}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {details.paymentGateway === "mercadopago" && (
                      <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-400 font-bold flex items-center gap-2">
                        <span>💳 Pagamento seguro via Mercado Pago (PIX / Cartão)</span>
                      </div>
                    )}

                    {details.paymentGateway === "infinitepay" && (
                      <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-400 font-bold flex items-center gap-2">
                        <span>💳 Pagamento seguro via InfinitePay (PIX taxa zero / Cartão 12x)</span>
                      </div>
                    )}
                  </div>

                  <Button
                    disabled={createChargeMutation.isPending}
                    onClick={() => {
                      const err = validateForm();
                      if (err) { toast.error(err); return; }
                      createChargeMutation.mutate({
                        code,
                        studentName: form.name.trim(),
                        studentPhone: form.phone.trim(),
                        studentEmail: form.email.trim() || undefined,
                        studentCpf: form.cpf.trim() || undefined,
                        instrumentId: courses[0].instrumentId,
                        courses: courses.map((c) => ({ instrumentId: c.instrumentId, planId: c.planId ?? undefined })),
                        billingType,
                      });
                    }}
                    className="w-full h-12 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold text-sm shadow-lg shadow-emerald-500/20 disabled:opacity-40"
                  >
                    {createChargeMutation.isPending
                      ? <><Loader2 size={16} className="animate-spin" /> Gerando cobrança...</>
                      : <><CreditCard size={16} /> Pagar {formatBRL(totalToPay)} e matricular</>}
                  </Button>
                </>
              )}

              {/* Cobrança gerada — exibe QR Code PIX ou Boleto */}
              {paymentData && (
                <div className="space-y-5">
                  <div className="text-center space-y-1">
                    <h2 className="text-xl font-black text-foreground">Realize o pagamento</h2>
                    <p className="text-xs text-muted-foreground">Após pagar, clique no botão abaixo para escolher seu horário</p>
                  </div>

                  <div className="p-5 rounded-2xl bg-card border border-border/50 space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">Valor da mensalidade</span>
                      <span className="text-xl font-black text-emerald-400">{formatBRL(paymentData.value)}</span>
                    </div>

                    {paymentData.pixQrCode && (
                      <div className="space-y-3">
                        <div className="flex justify-center">
                          <img
                            src={`data:image/png;base64,${paymentData.pixQrCode}`}
                            alt="QR Code PIX"
                            className="w-52 h-52 rounded-2xl border-2 border-border/40 shadow-md"
                          />
                        </div>
                        {paymentData.pixCopiaECola && (
                          <button
                            onClick={copyPix}
                            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold hover:bg-emerald-500/20 transition-all"
                          >
                            <Copy size={14} /> Copiar código PIX (Copia e Cola)
                          </button>
                        )}
                      </div>
                    )}

                    {paymentData.invoiceUrl && (
                      <a
                        href={paymentData.invoiceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold hover:bg-blue-500/20 transition-all"
                      >
                        <ExternalLink size={14} />
                        Abrir link de pagamento
                      </a>
                    )}
                  </div>

                  {/* Após pagar → vai escolher o horário */}
                  <Button
                    onClick={handleVerifyAsaas}
                    disabled={mpVerifying}
                    className="w-full h-14 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold text-sm shadow-lg shadow-emerald-500/20"
                  >
                    {mpVerifying ? <Loader2 size={18} className="animate-spin" /> : <BadgeCheck size={18} />} Já paguei — Verificar e escolher horário
                  </Button>
                  <p className="text-center text-[10px] text-muted-foreground">Clique somente após realizar o pagamento acima</p>
                </div>
              )}
            </motion.div>
          )}

          {/* ═══════════════════════════════════════════════
              PASSO 3 — Escolha o Dia e Horário (pós-pagamento)
          ═══════════════════════════════════════════════ */}
          {step === "schedule" && (
            <motion.div key="schedule" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-5">
              <div className="space-y-1">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <CheckCircle2 size={16} className="text-emerald-500" />
                  </div>
                  <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Pagamento confirmado</span>
                </div>
                <h2 className="text-2xl font-black text-foreground">Agora escolha seus horários</h2>
                <p className="text-xs text-muted-foreground">Escolha o dia da semana e o horário de cada curso.</p>
              </div>

              <div className="space-y-3">
                {courses.map((c) => {
                  const inst = details.instruments.find((i: any) => i.id === c.instrumentId);
                  return (
                    <CourseSchedulePicker
                      key={c.instrumentId}
                      code={code}
                      course={{ instrumentId: c.instrumentId, weekday: c.weekday, timeStr: c.timeStr }}
                      courseName={inst?.name || "Curso"}
                      onChange={(patch) => patchCourse(c.instrumentId, patch)}
                    />
                  );
                })}
              </div>

              {courses.some((c) => c.weekday === null || !c.timeStr) && (
                <p className="text-[11px] text-muted-foreground text-center flex items-center justify-center gap-1">
                  <Info size={12} /> Selecione o dia e o horário de cada curso para confirmar.
                </p>
              )}

              <Button
                disabled={courses.some((c) => c.weekday === null || !c.timeStr) || confirmMutation.isPending}
                onClick={() => {
                  confirmMutation.mutate({
                    code,
                    studentName: form.name,
                    studentPhone: form.phone,
                    studentEmail: form.email || undefined,
                    studentCpf: form.cpf || undefined,
                    birthDate: form.birthDate || undefined,
                    guardianName: form.guardianName || undefined,
                    guardianCpf: form.guardianCpf || undefined,
                    guardianPhone: form.guardianPhone || undefined,
                    guardianEmail: form.guardianEmail || undefined,
                    dueDay: dueDay ?? undefined,
                    courses: courses.map((c) => ({
                      instrumentId: c.instrumentId,
                      planId: c.planId ?? undefined,
                      weekday: c.weekday ?? undefined,
                      timeStr: c.timeStr ?? undefined,
                      teacherUserId: c.teacherUserId ?? undefined,
                      studioRoomId: c.studioRoomId ?? undefined,
                    })),
                    asaasChargeId: paymentData?.chargeId,
                    infinitepaySlug: checkoutSlug || undefined,
                  });
                }}
                className="w-full h-12 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold text-sm shadow-lg shadow-emerald-500/20 disabled:opacity-40 sticky bottom-2 z-10"
              >
                {confirmMutation.isPending
                  ? <><Loader2 size={16} className="animate-spin" /> Confirmando...</>
                  : <><BadgeCheck size={16} /> Confirmar Matrícula</>}
              </Button>
            </motion.div>
          )}

          {/* ═══════════════════════════════════════════════
              SUCESSO!
          ═══════════════════════════════════════════════ */}
          {step === "success" && (
            <motion.div
              key="success"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex flex-col items-center text-center space-y-6 py-8"
            >
              <div className="relative">
                <div className="w-24 h-24 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircle2 size={52} className="text-emerald-400" />
                </div>
                <div className="absolute -top-1 -right-1 w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center shadow-lg">
                  <Music size={14} className="text-white" />
                </div>
              </div>

              <div className="space-y-2">
                <h2 className="text-2xl font-black text-foreground">Matrícula Confirmada! 🎉</h2>
                <p className="text-sm text-muted-foreground max-w-xs">
                  Tudo certo! Sua matrícula foi confirmada. Você receberá pelo WhatsApp: confirmação da matrícula, informações da aula e orientações importantes.
                </p>
              </div>

              <Card className="w-full p-5 rounded-2xl bg-card/50 border-border/40 text-left space-y-3">
                <p className="text-[10px] font-black text-emerald-500 uppercase tracking-wider">Resumo da Matrícula</p>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Escola</span>
                    <span className="font-bold text-foreground">{details.schoolName}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Aluno</span>
                    <span className="font-bold text-foreground truncate max-w-[60%]">{form.name}</span>
                  </div>
                  {courses.map((c) => {
                    const inst = details.instruments.find((i: any) => i.id === c.instrumentId);
                    const p = c.planId ? planById.get(c.planId) : null;
                    const weekdayLabel = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"][c.weekday ?? 0];
                    return (
                      <div key={c.instrumentId} className="border-t border-border/40 pt-2 space-y-1">
                        <div className="flex justify-between gap-2">
                          <span className="text-muted-foreground">Curso</span>
                          <span className="font-bold text-foreground truncate max-w-[60%]">{inst?.name}{p ? ` · ${p.nome}` : ""}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Horário</span>
                          <span className="font-bold text-foreground">{weekdayLabel} às {c.timeStr}</span>
                        </div>
                      </div>
                    );
                  })}
                  <div className="flex justify-between border-t border-border/40 pt-2">
                    <span className="text-muted-foreground">Mensalidade total</span>
                    <span className="font-black text-emerald-500">{formatBRL(monthlyTotal)}</span>
                  </div>
                  {enrollmentFeeTotal > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Taxa de inscrição</span>
                      <span className="font-bold text-foreground">{formatBRL(enrollmentFeeTotal)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Próximo vencimento</span>
                    <span className="font-bold text-foreground">{nextDueLabel}</span>
                  </div>
                </div>
              </Card>

              {details.contractEnabled && !confirmMutation.data?.contractSignUrl && (
                <p className="text-[11px] text-muted-foreground text-center max-w-xs">
                  O contrato de prestação de serviços será enviado pela escola para assinatura em breve.
                </p>
              )}

              {confirmMutation.data?.contractSignUrl && (
                <Card className="w-full p-5 rounded-2xl bg-indigo-500/5 border-indigo-500/20 text-left space-y-3">
                  <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Contrato para assinatura</p>
                  <p className="text-xs text-muted-foreground">
                    Falta pouco! Assine o contrato de prestação de serviços digitalmente para concluir.
                  </p>
                  <a
                    href={confirmMutation.data.contractSignUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full h-12 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-all"
                  >
                    <FileSignature size={16} /> Assinar contrato agora
                  </a>
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(`Segue o link para assinatura do contrato de matrícula: ${confirmMutation.data.contractSignUrl}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full h-11 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 font-bold text-xs transition-all"
                  >
                    <MessageCircle size={14} /> Enviar link por WhatsApp
                  </a>
                </Card>
              )}

              {schoolWaLink && (
                <a
                  href={schoolWaLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-all shadow-lg shadow-emerald-500/20"
                >
                  <MessageCircle size={16} /> Falar com a escola pelo WhatsApp
                </a>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
