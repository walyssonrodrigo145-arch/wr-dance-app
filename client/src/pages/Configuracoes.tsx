import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  User, Building2, Bell, Palette, Shield, Save,
  Sun, Moon, Phone, Mail,
  CheckCircle2, Loader2, Smartphone, Wallet, Sparkles, HelpCircle,
  FileText, DollarSign, Percent, Receipt, Calculator, Calendar, Clock, Upload, Trash2, Image,
  FileSignature, AlertTriangle, FlaskConical, GraduationCap, Repeat, FileCode2, MessageCircle
} from "lucide-react";
import { SUPPORT_WHATSAPP_URL, SUPPORT_WHATSAPP_DISPLAY } from "@/lib/support";
import { RepositionsSettings } from "@/components/settings/RepositionsSettings";
import { AiPromptsSettings } from "@/components/settings/AiPromptsSettings";
import { useTour } from "@/components/tour/TourProvider";
import { SalasEstudioTab } from "./SalasEstudioTab";
import { LogoUploadZone } from "@/components/logo/LogoUploadZone";
import { LogoEditorModal, type LogoEditParams } from "@/components/logo/LogoEditorModal";
import { ExportDataSection } from "@/components/settings/ExportDataSection";
import { PwaInstallSection } from "@/components/settings/PwaInstallSection";
import { CleanupTestDataSection } from "@/components/settings/CleanupTestDataSection";
import { WhatsAppSessionManager } from "@/components/settings/WhatsAppSessionManager";
import { Toggle, Field, DebouncedInput, DebouncedTextarea } from "@/components/settings/Misc";
import { DueDaysSelector } from "@/components/financeiro/DueDaysSelector";
import { AssinafyIntegrationCard } from "@/components/integrations/AssinafyIntegrationCard";
import { ModelosContratoTab } from "@/components/integrations/ModelosContratoTab";
import { ConfigFiscalTab } from "@/components/fiscal/ConfigFiscalTab";
import { PlanosBolsas } from "@/components/settings/PlanosBolsas";
import { MyTicketsList } from "@/components/support/MyTicketsList";

// ─── Tab types ───────────────────────────────────────────────────────────────
type Tab = "perfil" | "escola" | "fiscal" | "salas" | "financeiro" | "planos" | "modelos_contrato" | "notificacoes" | "aparencia" | "whatsapp" | "integracoes" | "ia" | "prompts" | "reposicoes" | "seguranca" | "ajuda";

const TABS: { id: Tab; label: string; icon: React.ElementType; href?: string }[] = [
  { id: "perfil", label: "Perfil", icon: User },
  { id: "escola", label: "Escola", icon: Building2 },
  { id: "financeiro", label: "Financeiro", icon: DollarSign },
  { id: "planos", label: "Planos & Bolsas", icon: GraduationCap },
  { id: "modelos_contrato", label: "Modelos de Contrato", icon: FileSignature },
  { id: "reposicoes", label: "Reposições", icon: Repeat },
  { id: "prompts", label: "Prompts IA", icon: FileCode2 },
  { id: "notificacoes", label: "Notificações", icon: Bell },
  { id: "aparencia", label: "Aparência", icon: Palette },
  { id: "whatsapp", label: "Meu WhatsApp", icon: Smartphone },
  { id: "integracoes", label: "Integrações", icon: Wallet },
  { id: "ia", label: "IA Assistente", icon: Sparkles },
  { id: "seguranca", label: "Segurança", icon: Shield },
  { id: "ajuda", label: "Ajuda", icon: HelpCircle },
];

// ─── Export CSV helper ──────────────────────────────────────────────────────

// ─── Main component ───────────────────────────────────────────────────────────
export default function Configuracoes() {
  const { user } = useAuth();
  const { theme, setTheme, toggleTheme } = useTheme();
  const utils = trpc.useUtils();

  const [activeTab, setActiveTab] = useState<Tab>("perfil");
  const { startTour } = useTour();

  const { data: settings, isLoading } = trpc.settings.get.useQuery();

  // ── Perfil state ──
  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const [profileBio, setProfileBio] = useState("");
  const [profilePixKey, setProfilePixKey] = useState("");

  // ── Escola state ──
  const [schoolName, setSchoolName] = useState("");
  const [schoolCnpj, setSchoolCnpj] = useState("");
  const [schoolAddress, setSchoolAddress] = useState("");
  const [schoolCity, setSchoolCity] = useState("");
  const [schoolPhone, setSchoolPhone] = useState("");
  const [schoolEmail, setSchoolEmail] = useState("");
  const [schoolWebsite, setSchoolWebsite] = useState("");
  const [schoolDescription, setSchoolDescription] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [showSchoolName, setShowSchoolName] = useState(true);
  const [logoEditorOpen, setLogoEditorOpen] = useState(false);
  const [logoDraftSrc, setLogoDraftSrc] = useState("");
  const [logoOriginalName, setLogoOriginalName] = useState("");
  const [logoEditParams, setLogoEditParams] = useState<LogoEditParams | null>(null);
  const [dueDaysForecast, setDueDaysForecast] = useState("5,10,15,20");
  const defaultHours = {
    monday: { active: true, start: "08:00", end: "18:00" },
    tuesday: { active: true, start: "08:00", end: "18:00" },
    wednesday: { active: true, start: "08:00", end: "18:00" },
    thursday: { active: true, start: "08:00", end: "18:00" },
    friday: { active: true, start: "08:00", end: "18:00" },
    saturday: { active: false, start: "08:00", end: "12:00" },
    sunday: { active: false, start: "08:00", end: "12:00" }
  };
  const [schoolHours, setSchoolHours] = useState<any>(defaultHours);
  const [lessonDuration, setLessonDuration] = useState<number>(60);

  // ── Logo handler: imagem selecionada abre o editor ──
  const handleLogoImageSelected = (dataUrl: string, file: File) => {
    setLogoDraftSrc(dataUrl);
    setLogoOriginalName(file.name);
    setLogoEditParams(null);
    setLogoEditorOpen(true);
  };

  // ── Logo handler: editor salvo ──
  const handleLogoEditorSave = (params: LogoEditParams) => {
    setLogoUrl(params.dataUrl);
    setLogoEditParams(params);
    setLogoEditorOpen(false);
    toast.success("Logo ajustada! Clique em Salvar Alterações para aplicar.");
  };

  const handleRemoveLogo = () => {
    setLogoUrl("");
    setLogoEditParams(null);
    setLogoDraftSrc("");
  };


  // ── Notificações state ──
  const [notifyLesson, setNotifyLesson] = useState(true);
  const [notifyPayment, setNotifyPayment] = useState(true);
  const [notifyAbsence, setNotifyAbsence] = useState(true);
  const [notifyNewStudent, setNotifyNewStudent] = useState(true);
  const [notifyWeekly, setNotifyWeekly] = useState(false);

  // ── WhatsApp Bot state ──
  const [whatsappBotUrl, setWhatsappBotUrl] = useState("");
  const [whatsappBotToken, setWhatsappBotToken] = useState("");
  const [whatsappAutoSend, setWhatsappAutoSend] = useState(false);
  const [chatbotEnabled, setChatbotEnabled] = useState(false);
  const [autoAdvanceSlotsEnabled, setAutoAdvanceSlotsEnabled] = useState(false);

  // 💱 Pagamentos state 💱
  const [asaasApiKey, setAsaasApiKey] = useState("");
  const [asaasEnabled, setAsaasEnabled] = useState(false);
  const [paymentGateway, setPaymentGateway] = useState<"asaas" | "mercadopago" | "infinitepay">("asaas");
  const [mpAccessToken, setMpAccessToken] = useState("");
  const [infinitepayHandle, setInfinitepayHandle] = useState("");
  const [infinitepayApiKey, setInfinitepayApiKey] = useState("");
  const [infinitepayEnabled, setInfinitepayEnabled] = useState(false);

  // ── Financeiro (Juros, Multas e Descontos - Billing Engine) state ──
  const [lateFeeEnabled, setLateFeeEnabled] = useState(true);
  const [lateFeeType, setLateFeeType] = useState<"fixed" | "percentage">("percentage");
  const [lateFeeValue, setLateFeeValue] = useState(2.0);
  const [interestEnabled, setInterestEnabled] = useState(true);
  const [interestType, setInterestType] = useState<"daily" | "monthly">("daily");
  const [interestRate, setInterestRate] = useState(0.33);
  const [graceDays, setGraceDays] = useState(3);
  const [autoUpdateInvoice, setAutoUpdateInvoice] = useState(true);
  const [showFeeBreakdown, setShowFeeBreakdown] = useState(true);
  const [earlyDiscountEnabled, setEarlyDiscountEnabled] = useState(false);
  const [earlyDiscountType, setEarlyDiscountType] = useState<"fixed" | "percentage">("percentage");
  const [earlyDiscountValue, setEarlyDiscountValue] = useState(5.0);
  const [earlyDiscountDays, setEarlyDiscountDays] = useState(0);

  // ── Presença Digital / QR Code ──
  const [attendanceCheckinMoment, setAttendanceCheckinMoment] = useState<"inicio" | "fim" | "livre">("inicio");
  const [attendanceToleranceMinutes, setAttendanceToleranceMinutes] = useState(30);

  // ── IA state ──
  const [aiProvider, setAiProvider] = useState("gemini");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [geminiModel, setGeminiModel] = useState("gemini-3.6-flash");
  const [groqApiKey, setGroqApiKey] = useState("");
  const [groqModel, setGroqModel] = useState("openai/gpt-oss-120b");
  const [opencodeApiKey, setOpencodeApiKey] = useState("");
  const [opencodeModel, setOpencodeModel] = useState("opencode/muse-spark-1.2-contributor-free");
  const [opencodeApiUrl, setOpencodeApiUrl] = useState("");
  const [testStatus, setTestStatus] = useState<"idle"|"loading"|"success"|"error">("idle");
  const [testMessage, setTestMessage] = useState("");
  const [zenModels, setZenModels] = useState<Array<{id:string; displayName?:string; name?:string}>>([]);
  const [opencodeGateway, setOpencodeGateway] = useState<"zen" | "go" | null>(null);
  // Recepcionista Virtual (IA conversacional)
  const [conversationalMode, setConversationalMode] = useState(true);
  const [attendancePersonaName, setAttendancePersonaName] = useState("Júlia");
  const [attendanceTone, setAttendanceTone] = useState("amigavel");

  // Populate from DB
  useEffect(() => {
    if (user) {
      setProfileName(user.name ?? "");
      setProfileEmail(user.email ?? "");
    }
  }, [user]);

  useEffect(() => {
    if (settings) {
      setProfilePhone(settings.phone ?? "");
      setProfileBio(settings.bio ?? "");
      setProfilePixKey(settings.pixKey ?? "");
      setSchoolName(settings.schoolName ?? "");
      setSchoolCnpj(settings.schoolCnpj ?? "");
      setSchoolAddress(settings.schoolAddress ?? "");
      setSchoolCity(settings.schoolCity ?? "");
      setSchoolPhone(settings.schoolPhone ?? "");
      setSchoolEmail(settings.schoolEmail ?? "");
      setSchoolWebsite(settings.schoolWebsite ?? "");
      setSchoolDescription(settings.schoolDescription ?? "");
      setLogoUrl((settings as any).logoUrl ?? (user as any)?.schoolLogo ?? "");
      setShowSchoolName((settings as any).showSchoolName !== 0);
      setDueDaysForecast(settings.dueDaysForecast ?? "5,10,15,20");

      setLateFeeEnabled(Number((settings as any).lateFeeEnabled ?? 1) === 1);
      setLateFeeType(((settings as any).lateFeeType === "fixed" ? "fixed" : "percentage"));
      setLateFeeValue(Number((settings as any).lateFeeValue ?? 2.0));
      setInterestEnabled(Number((settings as any).interestEnabled ?? 1) === 1);
      setInterestType(((settings as any).interestType === "monthly" ? "monthly" : "daily"));
      setInterestRate(Number((settings as any).interestRate ?? 0.33));
      setGraceDays(Number((settings as any).graceDays ?? 3));
      setAutoUpdateInvoice(Number((settings as any).autoUpdateInvoice ?? 1) === 1);
      setShowFeeBreakdown(Number((settings as any).showFeeBreakdown ?? 1) === 1);
      setEarlyDiscountEnabled(Number((settings as any).earlyDiscountEnabled ?? 0) === 1);
      setEarlyDiscountType(((settings as any).earlyDiscountType === "fixed" ? "fixed" : "percentage"));
      setEarlyDiscountValue(Number((settings as any).earlyDiscountValue ?? 5.0));
      setEarlyDiscountDays(Number((settings as any).earlyDiscountDays ?? 0));
      setAttendanceCheckinMoment(((settings as any).attendanceCheckinMoment as "inicio" | "fim" | "livre") || "inicio");
      setAttendanceToleranceMinutes(Number((settings as any).attendanceToleranceMinutes ?? 30));
      if ((settings as any).lessonDuration) {
        setLessonDuration(Number((settings as any).lessonDuration));
      }
      if (settings.schoolHours) {
        try {
          setSchoolHours(JSON.parse(settings.schoolHours));
        } catch (e) {
          setSchoolHours(defaultHours);
        }
      }
      setNotifyLesson(settings.notifyLessonReminder === 1);
      setNotifyPayment(settings.notifyPaymentDue === 1);
      setNotifyAbsence(settings.notifyStudentAbsence === 1);
      setNotifyNewStudent(settings.notifyNewStudent === 1);
      setNotifyWeekly(settings.notifyWeeklyReport === 1);
      setHiddenTabs(settings.hiddenTabs ? settings.hiddenTabs.split(",") : []);
      setWhatsappBotUrl(settings.whatsappBotUrl ?? "");
      setWhatsappBotToken(settings.whatsappBotToken ?? "");
      setWhatsappAutoSend(settings.whatsappAutoSend === 1);
      setChatbotEnabled((settings as any).chatbotEnabled === 1);
      setAutoAdvanceSlotsEnabled((settings as any).autoAdvanceSlotsEnabled === 1);
      setAsaasApiKey(settings.asaasApiKey ?? "");
      setAsaasEnabled(settings.asaasEnabled === 1);
      setPaymentGateway((settings.paymentGateway as "asaas" | "mercadopago" | "infinitepay") || "asaas");
      setMpAccessToken(settings.mpAccessToken ?? "");
      setInfinitepayHandle((settings as any).infinitepayHandle ?? "");
      setInfinitepayApiKey((settings as any).infinitepayApiKey ?? "");
      setInfinitepayEnabled((settings as any).infinitepayEnabled === 1);
      setAiProvider(settings.aiProvider ?? "gemini");
      setGeminiApiKey(settings.geminiApiKey ?? "");
      setGeminiModel(settings.geminiModel ?? "gemini-3.6-flash");
      setGroqApiKey(settings.groqApiKey ?? "");
      const LEGACY_GROQ = ["llama3-70b-8192", "llama3-8b-8192", "llama-3.3-70b-specdec"];
      const savedModel = settings.groqModel ?? "llama-3.3-70b-versatile";
      setGroqModel(LEGACY_GROQ.includes(savedModel) ? "llama-3.3-70b-versatile" : savedModel);
      setOpencodeApiKey((settings as any).opencodeApiKey ?? "");
      setOpencodeModel((settings as any).opencodeModel ?? "opencode/muse-spark-1.2-contributor-free");
      setOpencodeApiUrl((settings as any).opencodeApiUrl ?? "");
      setConversationalMode((settings as any).conversationalMode !== 0);
      setAttendancePersonaName((settings as any).attendancePersonaName || "Júlia");
      setAttendanceTone((settings as any).attendanceTone || "amigavel");
    }
  }, [settings]);

  const [hiddenTabs, setHiddenTabs] = useState<string[]>([]);
  const [hiddenWidgets, setHiddenWidgets] = useState<string[]>([]);
  const { data: dashboardPrefs } = trpc.dashboard.getVisibleWidgets.useQuery(undefined, { staleTime: 5 * 60 * 1000 });

  useEffect(() => {
    if (dashboardPrefs) setHiddenWidgets(dashboardPrefs.hidden || []);
  }, [dashboardPrefs]);
  
  const availableSidebarTabs = [
    { label: "Dashboard", href: "/dashboard", desc: "Visão geral" },
    { label: "Alunos", href: "/alunos", desc: "Gestão de estudantes" },
    { label: "Aulas", href: "/aulas", desc: "Calendário e agenda" },
    { label: "Instrumentos", href: "/instrumentos", desc: "Gestão de cursos/instrumentos" },
    { label: "Relatórios", href: "/relatorios", desc: "Métricas e gráficos" },
    { label: "Lembretes", href: "/lembretes", desc: "Alertas manuais e histórico" },
    { label: "Automações", href: "/automacoes", desc: "Regras do Robô" },
    { label: "Comunicados", href: "/comunicados", desc: "Mural de avisos" },
    { label: "Solicitações", href: "/solicitacoes", desc: "Reposições e faltas" },
    { label: "IA Assistente", href: "/ia", desc: "Chat inteligente (Gemini)" },
    { label: "Progresso", href: "/progresso", desc: "Evolução dos alunos" },
    { label: "Financeiro", href: "/financeiro", desc: "Gestão Financeira" },
    { label: "Folha de Pagto", href: "/folha", desc: "Extrato de Professores" },
    { label: "Recepção QR", href: "/recepcao-qr", desc: "Check-in de alunos" },
  ];

  // ── Mutations ──
  const updateProfile = trpc.settings.updateProfile.useMutation({
    onSuccess: () => {
      toast.success("Perfil atualizado com sucesso!", { icon: <CheckCircle2 size={16} className="text-emerald-500" /> });
      utils.auth.me.invalidate();
      utils.settings.get.invalidate();
    },
    onError: (e) => {
      let msg = e.message;
      try { const p = JSON.parse(msg); if (Array.isArray(p) && p[0]?.message) msg = p.map((x: any) => x.message).join(", "); } catch {}
      toast.error("Erro ao salvar perfil: " + msg);
    },
  });

  const updateSchool = trpc.settings.updateSchool.useMutation({
    onSuccess: () => {
      toast.success("Dados da escola atualizados!", { icon: <CheckCircle2 size={16} className="text-emerald-500" /> });
      utils.settings.get.invalidate();
      utils.auth.me.invalidate();
    },
    onError: (e) => {
      let msg = e.message;
      try { const p = JSON.parse(msg); if (Array.isArray(p) && p[0]?.message) msg = p.map((x: any) => x.message).join(", "); } catch {}
      toast.error("Erro ao salvar escola: " + msg);
    },
  });

  const updateNotifications = trpc.settings.updateNotifications.useMutation({
    onSuccess: () => {
      toast.success("Preferências de notificação salvas!", { icon: <CheckCircle2 size={16} className="text-emerald-500" /> });
      utils.settings.get.invalidate();
    },
    onError: (e) => {
      let msg = e.message;
      try { const p = JSON.parse(msg); if (Array.isArray(p) && p[0]?.message) msg = p.map((x: any) => x.message).join(", "); } catch {}
      toast.error("Erro ao salvar notificações: " + msg);
    },
  });

  const updateWhatsAppMutation = trpc.settings.updateWhatsAppBot.useMutation({
    onSuccess: () => {
      toast.success("Configurações do WhatsApp atualizadas");
      utils.settings.get.invalidate();
    },
    onError: (e) => toast.error("Erro ao atualizar WhatsApp: " + e.message),
  });

  const toggleChatbotMutation = trpc.settings.toggleChatbot.useMutation({
    onSuccess: (data) => {
      toast.success(data.enabled ? "🤖 Robô de autoatendimento ATIVADO!" : "Robô de autoatendimento desativado.");
      utils.settings.get.invalidate();
    },
    onError: (e) => toast.error("Erro ao alterar o robô: " + e.message),
  });

  const handleToggleChatbot = (val: boolean) => {
    setChatbotEnabled(val);
    toggleChatbotMutation.mutate({ enabled: val });
  };

  const toggleAutoAdvanceMutation = trpc.settings.toggleAutoAdvanceSlots.useMutation({
    onSuccess: (data) => {
      toast.success(data.enabled ? "⚡ Robô de Antecipação por Falta ATIVADO!" : "Robô de Antecipação por Falta desativado.");
      utils.settings.get.invalidate();
    },
    onError: (e) => toast.error("Erro ao alterar o robô: " + e.message),
  });

  const handleToggleAutoAdvance = (val: boolean) => {
    setAutoAdvanceSlotsEnabled(val);
    toggleAutoAdvanceMutation.mutate({ enabled: val });
  };

  const updateAsaasMutation = trpc.settings.updateAsaasIntegration.useMutation({
    onSuccess: () => {
      toast.success("Integração de pagamentos atualizada");
      utils.settings.get.invalidate();
    },
    onError: (e) => toast.error("Erro ao atualizar integração: " + e.message),
  });

  const updateIAMutation = trpc.settings.updateIA.useMutation({
    onSuccess: () => {
      toast.success("Chave da IA salva com sucesso!", { icon: <Sparkles size={16} className="text-emerald-500" /> });
      utils.settings.get.invalidate();
    },
    onError: (e) => toast.error("Erro ao salvar chave da IA: " + e.message),
  });

  const testAiMutation = (trpc as any).settings.testAiConnection.useMutation({
    onMutate: () => { setTestStatus("loading"); setTestMessage("Testando..."); setZenModels([]); setOpencodeGateway(null); },
    onSuccess: (res: any) => {
      if (res?.valid) {
        setTestStatus("success");
        if (res.provider === "opencode" && Array.isArray(res.models)) {
          setZenModels(res.models);
          setOpencodeGateway(res.gateway === "go" ? "go" : "zen");
          if (res.gateway === "go") {
            setTestMessage(`Chave válida — ${res.models.length} modelos Go baratos disponíveis`);
            toast.success(`Chave OpenCode válida — ${res.models.length} modelos Go disponíveis`);
            if (res.models.length > 0 && !opencodeModel.startsWith("opencode-go/")) {
              setOpencodeModel(res.models[0].id);
            }
          } else {
            setTestMessage(`Chave válida — ${res.models.length} modelos Zen grátis encontrados`);
            toast.success(`Chave OpenCode válida — ${res.models.length} modelos Zen grátis`);
            // Se o modelo atual estiver vazio ou com o placeholder genérico, já preenche com o primeiro da lista
            if (!opencodeModel || opencodeModel.includes("muse-spark-1.2-contributor-free") || !res.models.some((m: any) => m.id === opencodeModel)) {
              setOpencodeModel(res.models[0].id);
            }
          }
        } else {
          setTestMessage(res.provider === "gemini" ? "Chave Gemini válida ✓" : res.provider === "groq" ? "Chave Groq válida ✓" : "Chave válida ✓");
          toast.success("Chave válida!");
        }
      } else {
        setTestStatus("error");
        setTestMessage(res?.error || "Chave inválida");
        toast.error(res?.error || "Chave inválida");
      }
    },
    onError: (e: any) => { setTestStatus("error"); setTestMessage(e.message || "Erro ao testar"); toast.error(e.message || "Erro ao testar"); },
  });

  const updateTheme = trpc.settings.updateTheme.useMutation({
    onError: (e) => {
      let msg = e.message;
      try { const p = JSON.parse(msg); if (Array.isArray(p) && p[0]?.message) msg = p.map((x: any) => x.message).join(", "); } catch {}
      toast.error("Erro ao salvar tema: " + msg);
    },
  });

  const updateHiddenTabs = trpc.settings.updateHiddenTabs.useMutation({
    onSuccess: () => {
      toast.success("Menu atualizado!", { icon: <CheckCircle2 size={16} className="text-emerald-500" /> });
      utils.settings.get.invalidate();
    },
    onError: (e) => {
      let msg = e.message;
      try { const p = JSON.parse(msg); if (Array.isArray(p) && p[0]?.message) msg = p.map((x: any) => x.message).join(", "); } catch {}
      toast.error("Erro ao atualizar menu: " + msg);
    },
  });

  const updateHiddenDashboardWidgets = trpc.settings.updateHiddenDashboardWidgets.useMutation({
    onSuccess: () => {
      toast.success("Dashboard atualizado!", { icon: <CheckCircle2 size={16} className="text-emerald-500" /> });
      utils.dashboard.getVisibleWidgets.invalidate();
    },
    onError: (e) => toast.error("Erro ao atualizar dashboard: " + e.message),
  });

  const updateFinancialMutation = trpc.settings.updateFinancialSettings.useMutation({
    onSuccess: () => {
      toast.success("Configurações financeiras do BillingEngine salvas com sucesso!", {
        icon: <DollarSign size={16} className="text-emerald-500" />,
      });
      utils.settings.get.invalidate();
      utils.paymentDues.invalidate();
    },
    onError: (e) => toast.error("Erro ao salvar configurações financeiras: " + e.message),
  });

  const handleSaveWhatsApp = () => {
    // BUG-013: Validar URL se preenchida
    if (whatsappBotUrl.trim()) {
      try {
        new URL(whatsappBotUrl.trim());
      } catch (e) {
        toast.error("URL do WhatsApp inválida. Certifique-se de incluir http:// ou https://");
        return;
      }
    }
    
    updateWhatsAppMutation.mutate({
      whatsappBotUrl: whatsappBotUrl.trim(),
      whatsappBotToken: whatsappBotToken.trim(),
      whatsappAutoSend,
    });
  };

  const handleSaveAsaas = () => {
    updateAsaasMutation.mutate({
      asaasApiKey,
      asaasEnabled,
      paymentGateway,
      mpAccessToken,
      infinitepayHandle,
      infinitepayApiKey,
      infinitepayEnabled,
    });
  };

  const handleSaveIA = () => {
    updateIAMutation.mutate({
      aiProvider,
      geminiApiKey,
      geminiModel,
      groqApiKey,
      groqModel,
      opencodeApiKey,
      opencodeModel,
      opencodeApiUrl,
      conversationalMode,
      attendancePersonaName: attendancePersonaName.trim() || "Júlia",
      attendanceTone: attendanceTone as "amigavel" | "formal" | "direto",
    } as any);
  };

  const initials = user?.name?.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) ?? "P";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] lg:h-[calc(100vh-4rem)] overflow-hidden -m-4 sm:-m-6 bg-background">
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6 lg:space-y-8 scrollbar-thin no-scrollbar">
        {/* Header */}
        <div className="flex items-center gap-3 lg:gap-4">
          <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-2xl bg-muted/40 flex items-center justify-center shadow-sm">
            <Shield size={22} className="text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl lg:text-2xl font-bold text-foreground tracking-tight leading-none">Configurações</h2>
            <p className="text-[10px] lg:text-xs text-muted-foreground font-medium mt-1 lg:mt-2">Gerencie seu perfil e preferências do sistema</p>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 items-start">
          {/* Sidebar de abas - Horizontal scroll on mobile */}
          <div className="w-full lg:w-64 shrink-0 overflow-x-auto no-scrollbar -mx-4 px-4 lg:mx-0 lg:px-0">
            <div className="flex lg:flex-col gap-2 bg-card p-2 rounded-2xl border border-border shadow-sm min-w-max lg:min-w-0">
              {TABS.filter(tab => {
                // Se o usuário for professor, exibe APENAS as abas permitidas
                if (user?.role === 'professor') {
                  return ['perfil', 'aparencia', 'seguranca', 'ajuda'].includes(tab.id);
                }
                return true;
              }).map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => (tab as any).href ? (window.location.href = (tab as any).href) : setActiveTab(tab.id)}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-black transition-all lg:w-full text-left uppercase tracking-widest",
                      activeTab === tab.id
                        ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                        : "text-muted-foreground hover:bg-muted hover:text-muted-foreground"
                    )}
                  >
                    <Icon size={16} className="shrink-0" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Conteúdo da aba */}
          <div className="flex-1 w-full bg-card rounded-[2rem] border border-border shadow-sm p-6 lg:p-10">

            {/* ── ABA: PERFIL ── */}
            {activeTab === "perfil" && (
              <div className="space-y-8">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base lg:text-lg font-black text-foreground uppercase tracking-widest">Meu Perfil</h3>
                    <p className="text-[11px] text-muted-foreground font-bold uppercase tracking-widest mt-1">Suas informações pessoais</p>
                  </div>
                  <Button
                    className="gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 h-11 px-6 shadow-lg shadow-indigo-500/20"
                    disabled={updateProfile.isPending}
                    onClick={() => updateProfile.mutate({ name: profileName, email: profileEmail, phone: profilePhone, bio: profileBio, pixKey: profilePixKey })}
                  >
                    {updateProfile.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    <span className="text-xs font-black uppercase tracking-widest">Salvar</span>
                  </Button>
                </div>

                <div className="flex items-center gap-6 p-6 bg-muted rounded-[1.5rem] border border-border">
                  <div className="w-16 h-16 lg:w-20 lg:h-20 rounded-[1.5rem] bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center shadow-xl shadow-indigo-500/20 shrink-0">
                    <span className="text-2xl font-black text-white">{initials}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-base lg:text-xl font-black text-foreground truncate">{user?.name || "Professor"}</p>
                    <p className="text-xs lg:text-sm font-bold text-muted-foreground truncate mt-1">{user?.email}</p>
                    <div className="mt-3">
                      <span className="px-3 py-1 rounded-lg bg-indigo-500/20 text-[10px] font-black text-indigo-700 uppercase tracking-widest">Administrador</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
                  <Field label="Nome completo">
                    <div className="relative">
                      <User size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <DebouncedInput
                        value={profileName}
                        onChange={e => setProfileName(e.target.value)}
                        placeholder="Seu nome"
                        className="pl-11 h-12 text-sm font-bold rounded-xl border-border bg-muted focus:bg-card transition-all shadow-sm"
                      />
                    </div>
                  </Field>

                  <Field label="E-mail profissional">
                    <div className="relative">
                      <Mail size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <DebouncedInput
                        value={profileEmail}
                        onChange={e => setProfileEmail(e.target.value)}
                        placeholder="seu@email.com"
                        type="email"
                        className="pl-11 h-12 text-sm font-bold rounded-xl border-border bg-muted focus:bg-card transition-all shadow-sm"
                      />
                    </div>
                  </Field>

                  <Field label="Telefone / WhatsApp">
                    <div className="relative">
                      <Phone size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <DebouncedInput
                        value={profilePhone}
                        onChange={e => setProfilePhone(e.target.value)}
                        placeholder="(11) 99999-9999"
                        className="pl-11 h-12 text-sm font-bold rounded-xl border-border bg-muted focus:bg-card transition-all shadow-sm"
                      />
                    </div>
                  </Field>

                  <Field label="Chave PIX para Recebimento" hint="Aparecerá para o aluno ao realizar pagamentos">
                    <div className="relative">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 7h10v10H7z"/><path d="M16 16h2v2h-2z"/><path d="M16 6h2v2h-2z"/><path d="M6 16h2v2H6z"/><path d="M6 6h2v2H6z"/></svg>
                      </div>
                      <DebouncedInput
                        value={profilePixKey}
                        onChange={e => setProfilePixKey(e.target.value)}
                        placeholder="CPF, E-mail ou Telefone"
                        className="pl-11 h-12 text-sm font-bold rounded-xl border-border bg-muted focus:bg-card transition-all shadow-sm"
                      />
                    </div>
                  </Field>
                </div>

                <Field label="Bio / Apresentação" hint="Aparece no seu perfil público">
                  <div className="relative">
                    <FileText size={14} className="absolute left-4 top-4 text-muted-foreground" />
                    <DebouncedTextarea
                      value={profileBio}
                      onChange={e => setProfileBio(e.target.value)}
                      placeholder="Conte um pouco sobre você..."
                      rows={4}
                      className="w-full pl-11 pr-4 py-4 text-sm font-bold rounded-xl border border-border bg-muted focus:bg-card transition-all shadow-sm resize-none text-foreground outline-none placeholder:text-muted-foreground"
                    />
                  </div>
                </Field>
              </div>
            )}

            {/* ── ABA: ESCOLA ── */}
            {activeTab === "escola" && (
              <div className="space-y-8">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base lg:text-lg font-black text-foreground uppercase tracking-widest">Dados da Escola</h3>
                    <p className="text-[11px] text-muted-foreground font-bold uppercase tracking-widest mt-1">Identidade da sua escola</p>
                    <p className="text-[11px] text-muted-foreground font-medium mt-1.5 flex items-start gap-1.5">
                      <FileSignature size={13} className="text-violet-500 shrink-0 mt-0.5" />
                      <span>Nome, CNPJ, endereço, telefone e e-mail são usados automaticamente no rodapé e nas cláusulas dos <b>contratos digitais</b>.</span>
                    </p>
                  </div>
                  <Button
                    className="gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 h-11 px-6 shadow-lg shadow-indigo-500/20"
                    disabled={updateSchool.isPending}
                    onClick={() => {
                      for (const [day, conf] of Object.entries(schoolHours)) {
                         const c = conf as any;
                         if (c.active && c.start > c.end) {
                            toast.error(`O horário inicial não pode ser maior que o final.`);
                            return;
                         }
                      }
                      updateSchool.mutate({
                        schoolName,
                        schoolCnpj,
                        schoolAddress,
                        schoolCity,
                        schoolPhone,
                        schoolEmail,
                        schoolWebsite,
                        schoolDescription,
                        showSchoolName,
                        logoUrl,
                        schoolHours: JSON.stringify(schoolHours),
                        lessonDuration,
                        dueDaysForecast,
                        attendanceCheckinMoment,
                        attendanceToleranceMinutes,
                      });
                    }}
                  >
                    {updateSchool.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    <span className="text-xs font-black uppercase tracking-widest">Salvar</span>
                  </Button>
                </div>

                {/* 🎨 SEÇÃO LOGO DA ESCOLA (WHITE-LABEL BRANDING) */}
                <div className="p-5 rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/5 via-purple-500/5 to-transparent space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-black uppercase tracking-wider text-foreground flex items-center gap-2">
                        <Upload size={16} className="text-indigo-500" />
                        Logo da Escola (Branding Personalizado)
                      </h4>
                      <p className="text-xs text-muted-foreground mt-0.5 font-medium">
                        Sua logo será exibida no menu do sistema, portal do aluno e na página de matrícula pública.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col md:flex-row items-start gap-6 pt-2">
                    {/* Preview da Logo */}
                    <div className="relative w-28 h-28 rounded-full border-2 border-dashed border-indigo-500/30 bg-background/50 flex flex-col items-center justify-center overflow-hidden shadow-inner group shrink-0">
                      {logoUrl ? (
                        <>
                          <img src={logoUrl} alt="Logo da Escola" className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={handleRemoveLogo}
                            className="absolute inset-0 bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs font-bold"
                            aria-label="Remover logo"
                          >
                            <Trash2 size={16} className="mr-1" /> Remover
                          </button>
                        </>
                      ) : (
                        <div className="text-center p-2">
                          <Image size={24} className="mx-auto text-indigo-400 mb-1" />
                          <span className="text-[10px] text-muted-foreground font-bold">Sem Logo</span>
                        </div>
                      )}
                    </div>

                    {/* Upload Drag & Drop + Editor */}
                    <div className="space-y-3 flex-1 w-full">
                      <LogoUploadZone
                        value={logoUrl ? logoUrl : null}
                        onImageSelected={handleLogoImageSelected}
                        onRemove={handleRemoveLogo}
                        maxSizeMB={5}
                      />

                      {logoUrl && (
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => { setLogoDraftSrc(logoUrl); setLogoEditorOpen(true); }}
                            className="text-xs font-bold text-indigo-500 hover:bg-indigo-500/10 rounded-xl"
                          >
                            <Upload size={14} className="mr-1" /> Reabrir Editor
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={handleRemoveLogo}
                            className="text-xs font-bold text-rose-500 hover:bg-rose-500/10 rounded-xl"
                          >
                            <Trash2 size={14} className="mr-1" /> Usar Logo Padrão
                          </Button>
                        </div>
                      )}

                      <div>
                        <span className="text-[11px] font-bold text-muted-foreground block mb-1">Ou cole a URL direta da logo:</span>
                        <DebouncedInput
                          value={logoUrl.startsWith("data:") ? "" : logoUrl}
                          onChange={e => setLogoUrl(e.target.value)}
                          placeholder="https://suaescola.com.br/logo.png"
                          className="h-10 text-xs font-bold rounded-xl border-border bg-background focus:bg-card transition-all shadow-sm"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Exibição da logo: somente logo ou logo + nome */}
                  <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="min-w-0">
                        <p className="text-sm font-black text-foreground">Exibição da logo no menu</p>
                        <p className="text-xs text-muted-foreground font-medium mt-0.5">
                          Escolha se o menu do sistema e o portal do aluno mostram <b>somente a logo</b> ou a <b>logo com o nome da escola</b>.
                        </p>
                      </div>
                      <div className="flex rounded-xl border border-border overflow-hidden bg-background shrink-0">
                        <button
                          type="button"
                          onClick={() => setShowSchoolName(false)}
                          className={cn(
                            "px-4 h-10 text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer",
                            !showSchoolName ? "bg-violet-600 text-white" : "text-muted-foreground hover:bg-muted"
                          )}
                        >
                          Somente logo
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowSchoolName(true)}
                          className={cn(
                            "px-4 h-10 text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer",
                            showSchoolName ? "bg-violet-600 text-white" : "text-muted-foreground hover:bg-muted"
                          )}
                        >
                          Logo + nome
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Editor de Logo */}
                  <LogoEditorModal
                    open={logoEditorOpen}
                    onOpenChange={setLogoEditorOpen}
                    src={logoDraftSrc}
                    onSave={handleLogoEditorSave}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
                  <Field label="Nome da escola">
                    <DebouncedInput
                      value={schoolName}
                      onChange={e => setSchoolName(e.target.value)}
                      placeholder="Ex: Escola Harmonia"
                      className="h-12 text-sm font-bold rounded-xl border-border bg-muted focus:bg-card transition-all shadow-sm"
                    />
                  </Field>

                  <Field label="CNPJ da escola" hint="Usado nos contratos digitais">
                    <DebouncedInput
                      value={schoolCnpj}
                      onChange={(e: any) => setSchoolCnpj(e.target.value)}
                      placeholder="00.000.000/0000-00"
                      className="h-12 text-sm font-bold rounded-xl border-border bg-muted focus:bg-card transition-all shadow-sm"
                    />
                  </Field>

                  <Field label="Telefone comercial">
                    <DebouncedInput
                      value={schoolPhone}
                      onChange={e => setSchoolPhone(e.target.value)}
                      placeholder="(11) 3333-4444"
                      className="h-12 text-sm font-bold rounded-xl border-border bg-muted focus:bg-card transition-all shadow-sm"
                    />
                  </Field>

                  <Field label="E-mail da escola" hint="Aparece no rodapé dos contratos e na própria escola">
                    <DebouncedInput
                      value={schoolEmail}
                      onChange={(e: any) => setSchoolEmail(e.target.value)}
                      placeholder="contato@suaescola.com.br"
                      type="email"
                      className="h-12 text-sm font-bold rounded-xl border-border bg-muted focus:bg-card transition-all shadow-sm"
                    />
                  </Field>

                  <Field label="Cidade / UF">
                    <DebouncedInput
                      value={schoolCity}
                      onChange={e => setSchoolCity(e.target.value)}
                      placeholder="Ex: São Paulo, SP"
                      className="h-12 text-sm font-bold rounded-xl border-border bg-muted focus:bg-card transition-all shadow-sm"
                    />
                  </Field>

                  <Field label="Endereço">
                    <DebouncedInput
                      value={schoolAddress}
                      onChange={e => setSchoolAddress(e.target.value)}
                      placeholder="Rua, número, bairro"
                      className="h-12 text-sm font-bold rounded-xl border-border bg-muted focus:bg-card transition-all shadow-sm"
                    />
                  </Field>
                </div>

                <Field label="Site ou Instagram">
                  <DebouncedInput
                    value={schoolWebsite}
                    onChange={(e: any) => setSchoolWebsite(e.target.value)}
                    placeholder="https://suaescola.com.br"
                    className="h-12 text-sm font-bold rounded-xl border-border bg-muted focus:bg-card transition-all shadow-sm"
                  />
                </Field>

                <Field label="Sobre a escola">
                  <DebouncedTextarea
                    value={schoolDescription}
                    onChange={(e: any) => setSchoolDescription(e.target.value)}
                    placeholder="Breve descrição da metodologia..."
                    rows={4}
                    className="w-full px-4 py-4 text-sm font-bold rounded-xl border border-border bg-muted focus:bg-card transition-all shadow-sm resize-none text-foreground outline-none"
                  />
                </Field>

                <Field label="Dias de Previsão por Vencimento">
                  <DueDaysSelector
                    value={dueDaysForecast}
                    onChange={setDueDaysForecast}
                  />
                </Field>

                <div className="pt-6 border-t border-border">
                  <h4 className="text-sm font-black text-foreground uppercase tracking-widest mb-2">Horário de Atendimento</h4>
                  <p className="text-xs text-muted-foreground mb-4">Defina a grade de funcionamento. O robô inteligente de reagendamentos usará essa grade como base.</p>
                  
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5">
                    {Object.entries({
                      monday: 'Segunda-feira',
                      tuesday: 'Terça-feira',
                      wednesday: 'Quarta-feira',
                      thursday: 'Quinta-feira',
                      friday: 'Sexta-feira',
                      saturday: 'Sábado',
                      sunday: 'Domingo'
                    }).map(([day, label]) => (
                      <div key={day} className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5 bg-muted/60 p-3 rounded-2xl border border-border/80 min-w-0 overflow-hidden">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Switch 
                            checked={schoolHours[day]?.active} 
                            onCheckedChange={(c) => setSchoolHours({...schoolHours, [day]: {...schoolHours[day], active: c}})}
                          />
                          <span className="text-xs font-bold truncate max-w-[120px]">{label}</span>
                        </div>
                        {schoolHours[day]?.active ? (
                          <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                            <DebouncedInput 
                              type="time" 
                              className="h-8 text-xs px-1.5 py-0.5 rounded-lg border border-border bg-background w-[90px] min-w-[90px]"
                              value={schoolHours[day]?.start || "08:00"}
                              onChange={(e: any) => setSchoolHours({...schoolHours, [day]: {...schoolHours[day], start: e.target.value}})}
                            />
                            <span className="text-[10px] font-medium text-muted-foreground">às</span>
                            <DebouncedInput 
                              type="time" 
                              className="h-8 text-xs px-1.5 py-0.5 rounded-lg border border-border bg-background w-[90px] min-w-[90px]"
                              value={schoolHours[day]?.end || "18:00"}
                              onChange={(e: any) => setSchoolHours({...schoolHours, [day]: {...schoolHours[day], end: e.target.value}})}
                            />
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic shrink-0">Fechado</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-border space-y-2">
                  <Label className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                    <Clock size={14} className="text-indigo-500" />
                    Duração Padrão das Aulas
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Define o tempo (em minutos) de cada aula no agendamento da agenda e nos links de matrícula pública.
                  </p>
                  <Select value={String(lessonDuration)} onValueChange={(val) => setLessonDuration(Number(val))}>
                    <SelectTrigger className="w-full sm:w-64 h-10 rounded-xl bg-muted/50 border-border font-bold">
                      <SelectValue placeholder="Selecione a duração" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">30 Minutos</SelectItem>
                      <SelectItem value="45">45 Minutos</SelectItem>
                      <SelectItem value="50">50 Minutos</SelectItem>
                      <SelectItem value="60">60 Minutos (1 Hora)</SelectItem>
                      <SelectItem value="90">90 Minutos (1h 30m)</SelectItem>
                      <SelectItem value="120">120 Minutos (2 Horas)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* 📍 SEÇÃO: PRESENÇA DIGITAL & QR CODE */}
                <div className="pt-6 border-t border-border space-y-5">
                  <div>
                    <h4 className="text-sm font-black text-foreground uppercase tracking-wider flex items-center gap-2">
                      <Shield size={16} className="text-indigo-500" />
                      Presença Digital & Leitura de QR Code
                    </h4>
                    <p className="text-xs text-muted-foreground mt-0.5 font-medium">
                      Configure como e quando os alunos devem registrar a presença através do QR Code na recepção ou nas salas.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {/* Momento de Leitura */}
                    <div className="p-4 rounded-2xl border border-border bg-card/60 space-y-3">
                      <Label className="text-xs font-bold text-foreground uppercase tracking-wider block">
                        Momento Obrigatório do Check-in
                      </Label>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Defina se o aluno deve escanear o QR Code ao chegar na escola ou ao terminar a aula.
                      </p>
                      <div className="space-y-2 pt-1">
                        {[
                          {
                            id: "inicio",
                            title: "No Início da Aula (Chegada)",
                            desc: "O aluno deve escanear ao chegar. Ideal para validar pontualidade.",
                          },
                          {
                            id: "fim",
                            title: "No Término da Aula (Saída)",
                            desc: "O aluno só pode escanear ao final. Atesta que assistiu toda a aula.",
                          },
                          {
                            id: "livre",
                            title: "Horário Flexível (Livre)",
                            desc: "Permite escanear a qualquer momento no decorrer da aula.",
                          },
                        ].map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setAttendanceCheckinMoment(opt.id as any)}
                            className={cn(
                              "w-full text-left p-3 rounded-xl border transition-all flex items-start gap-3 cursor-pointer",
                              attendanceCheckinMoment === opt.id
                                ? "border-indigo-500 bg-indigo-500/10 shadow-sm"
                                : "border-border/60 bg-muted/40 hover:bg-muted"
                            )}
                          >
                            <div
                              className={cn(
                                "w-4 h-4 rounded-full border-2 mt-0.5 flex items-center justify-center shrink-0",
                                attendanceCheckinMoment === opt.id
                                  ? "border-indigo-600 bg-indigo-600"
                                  : "border-muted-foreground/40"
                              )}
                            >
                              {attendanceCheckinMoment === opt.id && (
                                <div className="w-1.5 h-1.5 rounded-full bg-white" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-foreground">{opt.title}</p>
                              <p className="text-[10px] text-muted-foreground mt-0.5">{opt.desc}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Tolerância de Horário */}
                    <div className="p-4 rounded-2xl border border-border bg-card/60 space-y-3 flex flex-col justify-between">
                      <div className="space-y-2">
                        <Label className="text-xs font-bold text-foreground uppercase tracking-wider block">
                          Tolerância de Horário (Minutos)
                        </Label>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          Janela de minutos antes e depois do momento escolhido em que o QR Code aceitará o registro.
                        </p>
                        <div className="pt-2">
                          <Select
                            value={String(attendanceToleranceMinutes)}
                            onValueChange={(val) => setAttendanceToleranceMinutes(Number(val))}
                          >
                            <SelectTrigger className="w-full h-11 rounded-xl bg-background border-border font-bold text-sm">
                              <SelectValue placeholder="Selecione a tolerância" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="10">10 Minutos de tolerância</SelectItem>
                              <SelectItem value="15">15 Minutos de tolerância</SelectItem>
                              <SelectItem value="20">20 Minutos de tolerância</SelectItem>
                              <SelectItem value="30">30 Minutos de tolerância (Recomendado)</SelectItem>
                              <SelectItem value="45">45 Minutos de tolerância</SelectItem>
                              <SelectItem value="60">60 Minutos (1 Hora)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-[11px] text-indigo-300 font-medium">
                        💡 <b>Dica:</b> Para aulas de 1h com check-in <b>no início</b> e tolerância de 15min, o aluno de uma aula às 14h poderá escanear entre 13:45 e 14:15.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── ABA: FISCAL (NFS-e FOCUS) ── */}
            {activeTab === "fiscal" && (
              <ConfigFiscalTab />
            )}

            {/* ── ABA: FINANCEIRO (JUROS E MULTAS) ── */}
            {activeTab === "planos" && (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                <PlanosBolsas />
              </div>
            )}

            {activeTab === "financeiro" && (
              <div className="space-y-8">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base lg:text-lg font-black text-foreground uppercase tracking-widest flex items-center gap-2">
                      <DollarSign size={20} className="text-emerald-500" />
                      Motor de Cobranças (Juros e Multas)
                    </h3>
                    <p className="text-[11px] text-muted-foreground font-bold uppercase tracking-widest mt-1">
                      Defina as regras financeiras aplicadas automaticamente em tempo real
                    </p>
                  </div>
                  <Button
                    className="gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white h-11 px-6 shadow-lg shadow-emerald-500/20"
                    disabled={updateFinancialMutation.isPending}
                    onClick={() => {
                      updateFinancialMutation.mutate({
                        lateFeeEnabled,
                        lateFeeType,
                        lateFeeValue: Number(lateFeeValue),
                        interestEnabled,
                        interestType,
                        interestRate: Number(interestRate),
                        graceDays: Number(graceDays),
                        autoUpdateInvoice,
                        showFeeBreakdown,
                        earlyDiscountEnabled,
                        earlyDiscountType,
                        earlyDiscountValue: Number(earlyDiscountValue),
                        earlyDiscountDays: Number(earlyDiscountDays),
                      });
                    }}
                  >
                    {updateFinancialMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    <span className="text-xs font-black uppercase tracking-widest">Salvar Alterações</span>
                  </Button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
                  {/* Coluna 1 & 2: Formulário de Configuração */}
                  <div className="lg:col-span-2 space-y-6">
                    {/* Card Desconto por Pagamento Antecipado */}
                    <div className="p-6 rounded-2xl bg-card border border-border space-y-6 shadow-sm">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 font-bold">
                            <Sparkles size={18} />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-foreground">Desconto por Pagamento Antecipado (Pontualidade)</h4>
                            <p className="text-xs text-muted-foreground">Concede desconto se o aluno pagar no vencimento ou com antecedência</p>
                          </div>
                        </div>
                        <Toggle checked={earlyDiscountEnabled} onChange={setEarlyDiscountEnabled} />
                      </div>

                      {earlyDiscountEnabled && (
                        <div className="pt-4 border-t border-border space-y-4 animate-in fade-in">
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-foreground uppercase tracking-wider">Tipo do Desconto</label>
                            <div className="grid grid-cols-2 gap-3">
                              <button
                                type="button"
                                onClick={() => setEarlyDiscountType("percentage")}
                                className={cn(
                                  "flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-bold transition-all",
                                  earlyDiscountType === "percentage"
                                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-500"
                                    : "border-border bg-muted/30 text-muted-foreground hover:bg-muted"
                                )}
                              >
                                <Percent size={14} /> Percentual (%)
                              </button>
                              <button
                                type="button"
                                onClick={() => setEarlyDiscountType("fixed")}
                                className={cn(
                                  "flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-bold transition-all",
                                  earlyDiscountType === "fixed"
                                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-500"
                                    : "border-border bg-muted/30 text-muted-foreground hover:bg-muted"
                                )}
                              >
                                <DollarSign size={14} /> Valor Fixo (R$)
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Field label={earlyDiscountType === "percentage" ? "Valor do Desconto (%)" : "Valor do Desconto (R$)"}>
                              <Input
                                type="number"
                                step="0.01"
                                value={earlyDiscountValue}
                                onChange={(e) => setEarlyDiscountValue(Number(e.target.value))}
                                className="h-11 font-bold bg-muted/50 rounded-xl"
                              />
                            </Field>

                            <Field label="Dias de Antecedência Exigidos" hint="0 = Válido até a data de vencimento. Ex: 5 = Exige pagamento 5 dias antes">
                              <Input
                                type="number"
                                value={earlyDiscountDays}
                                onChange={(e) => setEarlyDiscountDays(Number(e.target.value))}
                                className="h-11 font-bold bg-muted/50 rounded-xl"
                              />
                            </Field>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Card Multa */}
                    <div className="p-6 rounded-2xl bg-card border border-border space-y-6 shadow-sm">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 font-bold">
                            %
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-foreground">Cobrar Multa por Atraso</h4>
                            <p className="text-xs text-muted-foreground">Aplica valor ou percentual fixo após o vencimento</p>
                          </div>
                        </div>
                        <Toggle checked={lateFeeEnabled} onChange={setLateFeeEnabled} />
                      </div>

                      {lateFeeEnabled && (
                        <div className="pt-4 border-t border-border space-y-4 animate-in fade-in">
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-foreground uppercase tracking-wider">Tipo de Multa</label>
                            <div className="grid grid-cols-2 gap-3">
                              <button
                                type="button"
                                onClick={() => setLateFeeType("percentage")}
                                className={cn(
                                  "flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-bold transition-all",
                                  lateFeeType === "percentage"
                                    ? "border-amber-500 bg-amber-500/10 text-amber-500"
                                    : "border-border bg-muted/30 text-muted-foreground hover:bg-muted"
                                )}
                              >
                                <Percent size={14} /> Percentual (%)
                              </button>
                              <button
                                type="button"
                                onClick={() => setLateFeeType("fixed")}
                                className={cn(
                                  "flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-bold transition-all",
                                  lateFeeType === "fixed"
                                    ? "border-amber-500 bg-amber-500/10 text-amber-500"
                                    : "border-border bg-muted/30 text-muted-foreground hover:bg-muted"
                                )}
                              >
                                <DollarSign size={14} /> Valor Fixo (R$)
                              </button>
                            </div>
                          </div>

                          <Field label={lateFeeType === "percentage" ? "Valor da Multa (%)" : "Valor da Multa (R$)"}>
                            <Input
                              type="number"
                              step="0.01"
                              value={lateFeeValue}
                              onChange={(e) => setLateFeeValue(parseFloat(String(e.target.value).replace(',', '.')) || 0)}
                              className="h-11 font-bold bg-muted/50 rounded-xl"
                            />
                          </Field>
                        </div>
                      )}
                    </div>

                    {/* Card Juros */}
                    <div className="p-6 rounded-2xl bg-card border border-border space-y-6 shadow-sm">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500 font-bold">
                            <Calculator size={18} />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-foreground">Cobrar Juros de Mora</h4>
                            <p className="text-xs text-muted-foreground">Calcula juros acumulados por dia ou por mês em atraso</p>
                          </div>
                        </div>
                        <Toggle checked={interestEnabled} onChange={setInterestEnabled} />
                      </div>

                      {interestEnabled && (
                        <div className="pt-4 border-t border-border space-y-4 animate-in fade-in">
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-foreground uppercase tracking-wider">Frequência dos Juros</label>
                            <div className="grid grid-cols-2 gap-3">
                              <button
                                type="button"
                                onClick={() => setInterestType("daily")}
                                className={cn(
                                  "flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-bold transition-all",
                                  interestType === "daily"
                                    ? "border-indigo-500 bg-indigo-500/10 text-indigo-500"
                                    : "border-border bg-muted/30 text-muted-foreground hover:bg-muted"
                                )}
                              >
                                <Calendar size={14} /> Ao Dia (% ao dia)
                              </button>
                              <button
                                type="button"
                                onClick={() => setInterestType("monthly")}
                                className={cn(
                                  "flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-bold transition-all",
                                  interestType === "monthly"
                                    ? "border-indigo-500 bg-indigo-500/10 text-indigo-500"
                                    : "border-border bg-muted/30 text-muted-foreground hover:bg-muted"
                                )}
                              >
                                <Receipt size={14} /> Ao Mês (% ao mês)
                              </button>
                            </div>
                          </div>

                          <Field label={interestType === "daily" ? "Taxa de Juros ao Dia (%)" : "Taxa de Juros ao Mês (%)"}>
                            <Input
                              type="number"
                              step="0.0001"
                              value={interestRate}
                              onChange={(e) => setInterestRate(parseFloat(String(e.target.value).replace(',', '.')) || 0)}
                              className="h-11 font-bold bg-muted/50 rounded-xl"
                            />
                          </Field>
                        </div>
                      )}
                    </div>

                    {/* Card Carência e Exibição */}
                    <div className="p-6 rounded-2xl bg-card border border-border space-y-6 shadow-sm">
                      <h4 className="text-xs font-black text-foreground uppercase tracking-widest">Carência e Exibição</h4>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Field label="Dias de Carência (Tolerância)" hint="Período sem cobrança de juros ou multa após a data de vencimento">
                          <Input
                            type="number"
                            value={graceDays}
                            onChange={(e) => setGraceDays(Number(e.target.value))}
                            className="h-11 font-bold bg-muted/50 rounded-xl"
                          />
                        </Field>

                        <div className="space-y-4 pt-2">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-xs font-bold text-foreground">Atualizar Cobrança Automático</span>
                              <p className="text-[10px] text-muted-foreground">Recalcular valores dinamicamente no sistema</p>
                            </div>
                            <Toggle checked={autoUpdateInvoice} onChange={setAutoUpdateInvoice} />
                          </div>

                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-xs font-bold text-foreground">Mostrar Detalhamento ao Aluno</span>
                              <p className="text-[10px] text-muted-foreground">Exibir discriminação de juros e multa no portal do aluno</p>
                            </div>
                            <Toggle checked={showFeeBreakdown} onChange={setShowFeeBreakdown} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Coluna 3: Live Preview / Simulador */}
                  <div className="space-y-6">
                    <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-900/40 via-purple-900/20 to-card border border-indigo-500/20 space-y-5 shadow-xl relative overflow-hidden">
                      {/* Header do simulador */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black uppercase tracking-widest text-indigo-400 shrink-0">Simulador ao Vivo</span>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-extrabold uppercase shrink-0">
                          Tempo Real
                        </span>
                      </div>

                      <div className="space-y-4">
                        {/* Card 1: Antecipado */}
                        <div className="p-3 rounded-xl bg-card/60 border border-border space-y-2.5">
                          <p className="text-[10px] font-bold text-foreground leading-tight">Pagamento Antecipado (R$ 200,00):</p>

                          <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
                            <span className="text-[10px] text-muted-foreground self-center">Valor Original:</span>
                            <span className="text-xs font-bold text-foreground text-right">R$ 200,00</span>

                            <span className="text-[10px] text-muted-foreground self-center leading-tight">
                              Desconto ({earlyDiscountEnabled ? (earlyDiscountType === 'percentage' ? `${earlyDiscountValue}%` : `R$${earlyDiscountValue}`) : 'Off'}):
                            </span>
                            <span className="text-xs font-bold text-emerald-400 text-right">
                              -{earlyDiscountEnabled ? (earlyDiscountType === 'percentage' ? (200 * earlyDiscountValue / 100).toFixed(2) : earlyDiscountValue.toFixed(2)) : '0.00'}
                            </span>
                          </div>

                          <div className="pt-2 border-t border-border flex items-center justify-between">
                            <span className="text-[10px] font-bold text-foreground">Com Desconto:</span>
                            <span className="text-sm font-black text-emerald-400">
                              R$ {(200 - (earlyDiscountEnabled ? (earlyDiscountType === 'percentage' ? (200 * earlyDiscountValue / 100) : earlyDiscountValue) : 0)).toFixed(2).replace('.', ',')}
                            </span>
                          </div>
                        </div>

                        {/* Card 2: Atraso */}
                        <div className="p-3 rounded-xl bg-card/60 border border-border space-y-2.5">
                          <p className="text-[10px] font-bold text-foreground leading-tight">Pagamento em Atraso (5 Dias):</p>

                          <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
                            <span className="text-[10px] text-muted-foreground self-center leading-tight">
                              Multa ({lateFeeEnabled ? (lateFeeType === 'percentage' ? `${lateFeeValue}%` : `R$${lateFeeValue}`) : 'Off'}):
                            </span>
                            <span className="text-xs font-bold text-amber-400 text-right">
                              +{lateFeeEnabled ? (lateFeeType === 'percentage' ? (200 * lateFeeValue / 100).toFixed(2) : lateFeeValue.toFixed(2)) : '0.00'}
                            </span>

                            <span className="text-[10px] text-muted-foreground self-center leading-tight">
                              Juros ({interestEnabled ? (interestType === 'daily' ? `${interestRate}%/d` : `${interestRate}%/m`) : 'Off'}):
                            </span>
                            <span className="text-xs font-bold text-indigo-400 text-right">
                              +{interestEnabled ? (interestType === 'daily' ? (200 * (interestRate / 100) * 5).toFixed(2) : (200 * (interestRate / 100) * (5/30)).toFixed(2)) : '0.00'}
                            </span>
                          </div>

                          <div className="pt-2 border-t border-border flex items-center justify-between">
                            <span className="text-[10px] font-bold text-foreground">Com Atraso:</span>
                            <span className="text-sm font-black text-rose-400">
                              R$ {(
                                200 +
                                (lateFeeEnabled ? (lateFeeType === 'percentage' ? (200 * lateFeeValue / 100) : lateFeeValue) : 0) +
                                (interestEnabled ? (interestType === 'daily' ? (200 * (interestRate / 100) * 5) : (200 * (interestRate / 100) * (5/30))) : 0)
                              ).toFixed(2).replace('.', ',')}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── ABA: NOTIFICAÇÕES ── */}
            {activeTab === "notificacoes" && (
              <div className="space-y-8">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base lg:text-lg font-black text-foreground uppercase tracking-widest">Notificações</h3>
                    <p className="text-[11px] text-muted-foreground font-bold uppercase tracking-widest mt-1">Controle de alertas</p>
                  </div>
                  <Button
                    className="gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 h-11 px-6 shadow-lg shadow-indigo-500/20"
                    disabled={updateNotifications.isPending}
                    onClick={() => updateNotifications.mutate({
                      notifyLessonReminder: notifyLesson,
                      notifyPaymentDue: notifyPayment,
                      notifyStudentAbsence: notifyAbsence,
                      notifyNewStudent: notifyNewStudent,
                      notifyWeeklyReport: notifyWeekly,
                    })}
                  >
                    {updateNotifications.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    <span className="text-xs font-black uppercase tracking-widest">Salvar</span>
                  </Button>
                </div>

                <div className="space-y-4">
                  {[
                    { label: "Lembrete de aulas", desc: "Aviso 1h antes de cada aula", value: notifyLesson, onChange: setNotifyLesson },
                    { label: "Pagamento pendente", desc: "Alerta de mensalidade próxima do vencimento", value: notifyPayment, onChange: setNotifyPayment },
                    { label: "Falta de aluno", desc: "Notificação quando um aluno não comparecer", value: notifyAbsence, onChange: setNotifyAbsence },
                    { label: "Novo aluno", desc: "Notificação ao cadastrar novo estudante", value: notifyNewStudent, onChange: setNotifyNewStudent },
                    { label: "Relatório semanal", desc: "Resumo de desempenho toda segunda-feira", value: notifyWeekly, onChange: setNotifyWeekly },
                  ].map(item => (
                    <div key={item.label} className="flex items-center justify-between p-5 bg-muted rounded-2xl border border-border group hover:border-indigo-100 transition-colors">
                      <div className="pr-4">
                        <p className="text-xs font-black text-foreground uppercase tracking-widest mb-1">{item.label}</p>
                        <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">{item.desc}</p>
                      </div>
                      <Toggle checked={item.value} onChange={item.onChange} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── ABA: APARÊNCIA ── */}
            {activeTab === "aparencia" && (
              <div className="space-y-8">
                <div>
                  <h3 className="text-base lg:text-lg font-black text-foreground uppercase tracking-widest">Personalização</h3>
                  <p className="text-[11px] text-muted-foreground font-bold uppercase tracking-widest mt-1">Aparência do sistema</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {/* Light */}
                  <button
                    onClick={() => {
                      if (theme !== "light") {
                        setTheme("light");
                        updateTheme.mutate({ theme: "light" });
                        toast.success("Tema Claro ativado!");
                      }
                    }}
                    className={cn(
                      "relative p-5 rounded-[2rem] border-4 transition-all text-left group",
                      theme === "light"
                        ? "border-indigo-600 bg-indigo-500/10 shadow-xl shadow-indigo-500/20"
                        : "border-border bg-card hover:border-indigo-200"
                    )}
                  >
                    <div className="w-full h-20 rounded-[1.25rem] bg-card border border-border mb-4 overflow-hidden shadow-sm flex flex-col">
                       <div className="h-4 bg-muted border-b border-border flex items-center px-2 gap-1">
                         <div className="w-1.5 h-1.5 rounded-full bg-slate-200" />
                         <div className="w-6 h-1 rounded bg-muted" />
                       </div>
                       <div className="flex-1 p-3 space-y-2">
                         <div className="h-3 bg-indigo-500/20 rounded-full w-3/4" />
                         <div className="h-2 bg-muted rounded-full w-1/2" />
                       </div>
                    </div>
                    <div className="flex items-center justify-between">
                       <div className="flex items-center gap-2.5">
                         <div className="w-7 h-7 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
                            <Sun size={16} />
                         </div>
                         <span className="text-xs font-black uppercase tracking-widest text-foreground">Modo Claro</span>
                       </div>
                       {theme === "light" && <CheckCircle2 size={18} className="text-indigo-600 shrink-0" />}
                    </div>
                  </button>

                  {/* Dark */}
                  <button
                    onClick={() => {
                      if (theme !== "dark") {
                        setTheme("dark");
                        updateTheme.mutate({ theme: "dark" });
                        toast.success("Tema Escuro ativado!");
                      }
                    }}
                    className={cn(
                      "relative p-5 rounded-[2rem] border-4 transition-all text-left group",
                      theme === "dark"
                        ? "border-indigo-600 bg-indigo-500/10 shadow-xl shadow-indigo-500/20"
                        : "border-border bg-card hover:border-indigo-200"
                    )}
                  >
                    <div className="w-full h-20 rounded-[1.25rem] bg-slate-900 border border-slate-800 mb-4 overflow-hidden shadow-sm flex flex-col">
                       <div className="h-4 bg-slate-800 border-b border-slate-700 flex items-center px-2 gap-1">
                         <div className="w-1.5 h-1.5 rounded-full bg-slate-700" />
                         <div className="w-6 h-1 rounded bg-slate-800" />
                       </div>
                       <div className="flex-1 p-3 space-y-2">
                         <div className="h-3 bg-indigo-900 rounded-full w-3/4" />
                         <div className="h-2 bg-slate-800 rounded-full w-1/2" />
                       </div>
                    </div>
                    <div className="flex items-center justify-between">
                       <div className="flex items-center gap-2.5">
                         <div className="w-7 h-7 rounded-xl bg-indigo-900 text-indigo-400 flex items-center justify-center shrink-0">
                            <Moon size={16} />
                         </div>
                         <span className="text-xs font-black uppercase tracking-widest text-foreground">Modo Escuro</span>
                       </div>
                       {theme === "dark" && <CheckCircle2 size={18} className="text-indigo-600 shrink-0" />}
                    </div>
                  </button>

                  {/* Midnight Cyber */}
                  <button
                    onClick={() => {
                      if (theme !== "midnight") {
                        setTheme("midnight");
                        updateTheme.mutate({ theme: "midnight" });
                        toast.success("Tema Midnight Cyber ativado!");
                      }
                    }}
                    className={cn(
                      "relative p-5 rounded-[2rem] border-4 transition-all text-left group",
                      theme === "midnight"
                        ? "border-cyan-500 bg-cyan-500/10 shadow-xl shadow-cyan-500/20"
                        : "border-border bg-card hover:border-cyan-200"
                    )}
                  >
                    <div className="w-full h-20 rounded-[1.25rem] bg-[#0c1222] border border-[#1e293b] mb-4 overflow-hidden shadow-sm flex flex-col">
                       <div className="h-4 bg-[#1e293b] border-b border-[#334155] flex items-center px-2 gap-1">
                         <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                         <div className="w-6 h-1 rounded bg-cyan-900/50" />
                       </div>
                       <div className="flex-1 p-3 space-y-2">
                         <div className="h-3 bg-cyan-500/30 rounded-full w-3/4" />
                         <div className="h-2 bg-[#1e293b] rounded-full w-1/2" />
                       </div>
                    </div>
                    <div className="flex items-center justify-between">
                       <div className="flex items-center gap-2.5">
                         <div className="w-7 h-7 rounded-xl bg-cyan-950 text-cyan-400 flex items-center justify-center shrink-0">
                            <Sparkles size={16} />
                         </div>
                         <span className="text-xs font-black uppercase tracking-widest text-foreground">Midnight</span>
                       </div>
                       {theme === "midnight" && <CheckCircle2 size={18} className="text-cyan-400 shrink-0" />}
                    </div>
                  </button>

                  {/* Purple Emerald */}
                  <button
                    onClick={() => {
                      if (theme !== "purple") {
                        setTheme("purple");
                        updateTheme.mutate({ theme: "purple" });
                        toast.success("Tema Purple Emerald ativado!");
                      }
                    }}
                    className={cn(
                      "relative p-5 rounded-[2rem] border-4 transition-all text-left group",
                      theme === "purple"
                        ? "border-purple-500 bg-purple-500/10 shadow-xl shadow-purple-500/20"
                        : "border-border bg-card hover:border-purple-200"
                    )}
                  >
                    <div className="w-full h-20 rounded-[1.25rem] bg-[#170b24] border border-[#2d1245] mb-4 overflow-hidden shadow-sm flex flex-col">
                       <div className="h-4 bg-[#2d1245] border-b border-[#431866] flex items-center px-2 gap-1">
                         <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                         <div className="w-6 h-1 rounded bg-purple-900/50" />
                       </div>
                       <div className="flex-1 p-3 space-y-2">
                         <div className="h-3 bg-purple-500/40 rounded-full w-3/4" />
                         <div className="h-2 bg-emerald-500/20 rounded-full w-1/2" />
                       </div>
                    </div>
                    <div className="flex items-center justify-between">
                       <div className="flex items-center gap-2.5">
                         <div className="w-7 h-7 rounded-xl bg-purple-950 text-purple-400 flex items-center justify-center shrink-0">
                            <Palette size={16} />
                         </div>
                         <span className="text-xs font-black uppercase tracking-widest text-foreground">Purple</span>
                       </div>
                       {theme === "purple" && <CheckCircle2 size={18} className="text-purple-400 shrink-0" />}
                     </div>
                   </button>

                   {/* Emerald */}
                   <button
                     onClick={() => {
                       if (theme !== "emerald") {
                         setTheme("emerald");
                         updateTheme.mutate({ theme: "emerald" });
                         toast.success("Tema Emerald ativado!");
                       }
                     }}
                     className={cn(
                       "relative p-5 rounded-[2rem] border-4 transition-all text-left group",
                       theme === "emerald"
                         ? "border-emerald-500 bg-emerald-500/10 shadow-xl shadow-emerald-500/20"
                         : "border-border bg-card hover:border-emerald-200"
                     )}
                   >
                     <div className="w-full h-20 rounded-[1.25rem] bg-[#F6F8F7] border border-[#E2E8E5] mb-4 overflow-hidden shadow-sm flex flex-col">
                        <div className="h-4 bg-[#071C17] border-b border-[#0D2922] flex items-center px-2 gap-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          <div className="w-6 h-1 rounded bg-[#0D2922]" />
                        </div>
                        <div className="flex-1 p-3 space-y-2">
                          <div className="h-3 bg-emerald-500/30 rounded-full w-3/4" />
                          <div className="h-2 bg-[#E2E8E5] rounded-full w-1/2" />
                        </div>
                     </div>
                     <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
                             <Palette size={16} />
                          </div>
                          <span className="text-xs font-black uppercase tracking-widest text-foreground">Emerald</span>
                        </div>
                        {theme === "emerald" && <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />}
                     </div>
                   </button>

                   {/* Mono (Preto & Branco) */}
                   <button
                     onClick={() => {
                       if (theme !== "mono") {
                         setTheme("mono");
                         updateTheme.mutate({ theme: "mono" });
                         toast.success("Tema Mono ativado!");
                       }
                     }}
                     className={cn(
                       "relative p-5 rounded-[2rem] border-4 transition-all text-left group",
                       theme === "mono"
                         ? "border-neutral-900 bg-neutral-500/10 shadow-xl shadow-neutral-500/20"
                         : "border-border bg-card hover:border-neutral-300"
                     )}
                   >
                     <div className="w-full h-20 rounded-[1.25rem] bg-[#FAFAFA] border border-[#E5E5E5] mb-4 overflow-hidden shadow-sm flex flex-col">
                        <div className="h-4 bg-[#0A0A0A] border-b border-[#1F1F1F] flex items-center px-2 gap-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-neutral-500" />
                          <div className="w-6 h-1 rounded bg-[#1F1F1F]" />
                        </div>
                        <div className="flex-1 p-3 space-y-2">
                          <div className="h-3 bg-neutral-800/25 rounded-full w-3/4" />
                          <div className="h-2 bg-[#E5E5E5] rounded-full w-1/2" />
                        </div>
                     </div>
                     <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-xl bg-neutral-900 text-white flex items-center justify-center shrink-0">
                             <Palette size={16} />
                          </div>
                          <span className="text-xs font-black uppercase tracking-widest text-foreground">Mono</span>
                        </div>
                        {theme === "mono" && <CheckCircle2 size={18} className="text-neutral-900 dark:text-white shrink-0" />}
                     </div>
                   </button>

                   {/* Grafite */}
                   <button
                     onClick={() => {
                       if (theme !== "grafite") {
                         setTheme("grafite");
                         updateTheme.mutate({ theme: "grafite" });
                         toast.success("Tema Grafite ativado!");
                       }
                     }}
                     className={cn(
                       "relative p-5 rounded-[2rem] border-4 transition-all text-left group",
                       theme === "grafite"
                         ? "border-slate-500 bg-slate-500/10 shadow-xl shadow-slate-500/20"
                         : "border-border bg-card hover:border-slate-300"
                     )}
                   >
                     <div className="w-full h-20 rounded-[1.25rem] bg-[#17191C] border border-[#2A2E33] mb-4 overflow-hidden shadow-sm flex flex-col">
                        <div className="h-4 bg-[#101214] border-b border-[#23262B] flex items-center px-2 gap-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                          <div className="w-6 h-1 rounded bg-[#23262B]" />
                        </div>
                        <div className="flex-1 p-3 space-y-2">
                          <div className="h-3 bg-slate-400/30 rounded-full w-3/4" />
                          <div className="h-2 bg-[#2A2E33] rounded-full w-1/2" />
                        </div>
                     </div>
                     <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-xl bg-slate-800 text-slate-300 flex items-center justify-center shrink-0">
                             <Palette size={16} />
                          </div>
                          <span className="text-xs font-black uppercase tracking-widest text-foreground">Grafite</span>
                        </div>
                        {theme === "grafite" && <CheckCircle2 size={18} className="text-slate-400 shrink-0" />}
                     </div>
                   </button>
                 </div>

                <div className="pt-6 border-t border-border">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div>
                      <h3 className="text-base lg:text-lg font-black text-foreground uppercase tracking-widest">Menu Lateral</h3>
                      <p className="text-[11px] text-muted-foreground font-bold uppercase tracking-widest mt-1">Escolha quais abas aparecem no menu</p>
                    </div>
                    <Button
                      className="gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 h-11 px-6 shadow-lg shadow-indigo-500/20"
                      disabled={updateHiddenTabs.isPending}
                      onClick={() => updateHiddenTabs.mutate({ hiddenTabs: hiddenTabs.join(",") })}
                    >
                      {updateHiddenTabs.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                      <span className="text-xs font-black uppercase tracking-widest">Salvar</span>
                    </Button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {availableSidebarTabs.map(tab => {
                      const isVisible = !hiddenTabs.includes(tab.href);
                      return (
                        <div key={tab.href} className="flex items-center justify-between p-4 bg-muted rounded-2xl border border-border group hover:border-indigo-100 transition-colors">
                          <div className="pr-4">
                            <p className="text-xs font-black text-foreground uppercase tracking-widest mb-1">{tab.label}</p>
                            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest truncate max-w-[120px]">{tab.desc}</p>
                          </div>
                          <Toggle 
                            checked={isVisible} 
                            onChange={(show) => {
                              if (show) {
                                setHiddenTabs(hiddenTabs.filter(h => h !== tab.href));
                              } else {
                                setHiddenTabs([...hiddenTabs, tab.href]);
                              }
                            }} 
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ── Dashboard: cards visíveis (por usuário) ── */}
                <div className="pt-6 border-t border-border">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div>
                      <h3 className="text-base lg:text-lg font-black text-foreground uppercase tracking-widest">Dashboard</h3>
                      <p className="text-[11px] text-muted-foreground font-bold uppercase tracking-widest mt-1">Escolha quais cards aparecem no seu dashboard</p>
                    </div>
                    <Button
                      className="gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 h-11 px-6 shadow-lg shadow-indigo-500/20"
                      disabled={updateHiddenDashboardWidgets.isPending}
                      onClick={() => updateHiddenDashboardWidgets.mutate({ widgets: JSON.stringify(hiddenWidgets) })}
                    >
                      {updateHiddenDashboardWidgets.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                      <span className="text-xs font-black uppercase tracking-widest">Salvar</span>
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {(() => {
                      const allWidgets = dashboardPrefs?.widgets || [];
                      const allowed = dashboardPrefs?.allowed || [];
                      const controllable = allowed.length > 0 ? allWidgets.filter(w => allowed.includes(w.id)) : allWidgets;
                      return controllable.map((w) => {
                        const isVisible = !hiddenWidgets.includes(w.id);
                        return (
                          <div key={w.id} className="flex items-center justify-between p-4 bg-muted rounded-2xl border border-border group hover:border-indigo-100 transition-colors">
                            <div className="pr-4">
                              <p className="text-xs font-black text-foreground uppercase tracking-widest mb-1">{w.label}</p>
                              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest truncate max-w-[120px]">{w.desc}</p>
                            </div>
                            <Toggle
                              checked={isVisible}
                              onChange={(show) => {
                                if (show) setHiddenWidgets(hiddenWidgets.filter(h => h !== w.id));
                                else setHiddenWidgets([...hiddenWidgets, w.id]);
                              }}
                            />
                          </div>
                        );
                      });
                    })()}
                  </div>
                  <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-3">
                    Cards bloqueados pelo administrador não aparecem nesta lista.
                  </p>
                </div>

              </div>
            )}

            {/* ── ABA: MEU WHATSAPP ── */}
            {activeTab === "whatsapp" && (
              <div className="space-y-8">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base lg:text-lg font-black text-foreground uppercase tracking-widest">Meu WhatsApp (Multi-Sessão)</h3>
                    <p className="text-[11px] text-muted-foreground font-bold uppercase tracking-widest mt-1">Conecte seu celular para envio de lembretes</p>
                  </div>
                  <Button
                    className="gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 h-11 px-6 shadow-lg shadow-indigo-500/20"
                    disabled={updateWhatsAppMutation.isPending}
                    onClick={handleSaveWhatsApp}
                  >
                    {updateWhatsAppMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    <span className="text-xs font-black uppercase tracking-widest">Salvar Automação</span>
                  </Button>
                </div>

                <WhatsAppSessionManager />

                <div className="p-6 bg-indigo-500/10 rounded-[1.5rem] border border-indigo-100 dark:border-indigo-900/30 flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-lg shadow-indigo-500/20">
                    <Smartphone size={20} />
                  </div>
                  <div>
                    <p className="text-xs font-black text-indigo-900 dark:text-indigo-300 uppercase tracking-widest mb-1">Conexão Segura e Criptografada</p>
                    <p className="text-[11px] text-indigo-800/70 dark:text-indigo-300/70 font-medium leading-relaxed">
                      Sua instância de WhatsApp está operando de forma isolada e segura em nossos servidores dedicados. As credenciais de comunicação e chaves de API são gerenciadas e protegidas automaticamente em nível de código (backend).
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6">

                  {/* ── Toggle: Robô de Autoatendimento ── */}
                  <div className={cn(
                    "flex items-center justify-between p-5 rounded-2xl border transition-all duration-300",
                    chatbotEnabled
                      ? "bg-green-500/10 border-green-500/30"
                      : "bg-muted border-border"
                  )}>
                    <div className="flex items-center gap-4 pr-4">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300 text-lg",
                        chatbotEnabled
                          ? "bg-green-500 shadow-lg shadow-green-500/30"
                          : "bg-muted-foreground/20"
                      )}>
                        🤖
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-xs font-black text-foreground uppercase tracking-widest">Robô de Autoatendimento</p>
                          {chatbotEnabled && (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/20 text-green-600 dark:text-green-400 text-[9px] font-black uppercase tracking-wider">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-ping" />
                              ATIVO
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground font-medium leading-relaxed">
                          Responde automaticamente mensagens recebidas no WhatsApp com um menu interativo: aulas, financeiro, matrículas e muito mais.
                        </p>
                      </div>
                    </div>
                    <Toggle
                      checked={chatbotEnabled}
                      onChange={handleToggleChatbot}
                    />
                  </div>

                  {/* ── Card: Recepcionista Virtual (IA conversacional) ── */}
                  <div className={cn(
                    "p-5 rounded-2xl border transition-all duration-300 space-y-5",
                    conversationalMode && chatbotEnabled
                      ? "bg-violet-500/10 border-violet-500/30"
                      : "bg-muted border-border"
                  )}>
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4 pr-2">
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300 text-lg",
                          conversationalMode && chatbotEnabled
                            ? "bg-violet-600 text-white shadow-lg shadow-violet-500/30"
                            : "bg-muted-foreground/20 text-muted-foreground"
                        )}>
                          💬
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-xs font-black text-foreground uppercase tracking-widest">Recepcionista Virtual (IA)</p>
                            {conversationalMode && chatbotEnabled && (
                              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-600 dark:text-violet-400 text-[9px] font-black uppercase tracking-wider">
                                <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-ping" />
                                ATIVA
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground font-medium leading-relaxed">
                            Atende alunos e novos contatos conversando como uma pessoa real: entende linguagem natural, conhece a próxima aula e mensalidade do aluno, tira dúvidas pela Base de Conhecimento e agenda aulas sozinha. Os menus numéricos continuam funcionando (basta digitar MENU).
                          </p>
                        </div>
                      </div>
                      <Toggle
                        checked={conversationalMode}
                        onChange={setConversationalMode}
                      />
                    </div>

                    {conversationalMode && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                        <div>
                          <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5 block">Nome da Atendente</Label>
                          <Input
                            placeholder="Ex: Júlia"
                            value={attendancePersonaName}
                            onChange={(e) => setAttendancePersonaName(e.target.value)}
                            maxLength={60}
                            className="h-11 rounded-xl"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5 block">Tom do Atendimento</Label>
                          <select
                            value={attendanceTone}
                            onChange={(e) => setAttendanceTone(e.target.value)}
                            className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm font-semibold"
                          >
                            <option value="amigavel">😊 Amigável (recomendado)</option>
                            <option value="formal">🎩 Formal</option>
                            <option value="direto">⚡ Direto ao ponto</option>
                          </select>
                        </div>
                        <div className="sm:col-span-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-9 rounded-xl text-[10px] font-black uppercase tracking-widest border-violet-500/40 text-violet-600 hover:bg-violet-500/10"
                            disabled={updateIAMutation.isPending}
                            onClick={() => {
                              updateIAMutation.mutate({
                                conversationalMode,
                                attendancePersonaName: attendancePersonaName.trim() || "Júlia",
                                attendanceTone: attendanceTone as "amigavel" | "formal" | "direto",
                              });
                            }}
                          >
                            {updateIAMutation.isPending ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Save size={14} className="mr-1.5" />}
                            Salvar Atendente
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ── Toggle: Robô de Antecipação Inteligente por Falta ── */}
                  <div className={cn(
                    "flex items-center justify-between p-5 rounded-2xl border transition-all duration-300",
                    autoAdvanceSlotsEnabled
                      ? "bg-amber-500/10 border-amber-500/30"
                      : "bg-muted border-border"
                  )}>
                    <div className="flex items-center gap-4 pr-4">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300 text-lg",
                        autoAdvanceSlotsEnabled
                          ? "bg-amber-500 text-white shadow-lg shadow-amber-500/30 font-black"
                          : "bg-muted-foreground/20 text-muted-foreground"
                      )}>
                        ⚡
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-xs font-black text-foreground uppercase tracking-widest">Robô de Antecipação por Falta</p>
                          {autoAdvanceSlotsEnabled && (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 text-[9px] font-black uppercase tracking-wider">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                              ATIVO
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground font-medium leading-relaxed">
                          Ao marcar falta em uma aula (ex: 19h), envia WhatsApp automático para alunos com aula mais tarde (20h/21h) oferecendo o adiantamento de horário via Portal do Aluno.
                        </p>
                      </div>
                    </div>
                    <Toggle
                      checked={autoAdvanceSlotsEnabled}
                      onChange={handleToggleAutoAdvance}
                    />
                  </div>

                  {/* ── Toggle: Disparo Automático ── */}
                  <div className="flex items-center justify-between p-5 bg-muted rounded-2xl border border-border group hover:border-indigo-100 transition-colors">
                    <div className="pr-4">
                      <p className="text-xs font-black text-foreground uppercase tracking-widest mb-1">Disparo Automático em Segundo Plano</p>
                      <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
                        Se ativado, o sistema enviará automaticamente as mensagens pendentes nos horários agendados.
                      </p>
                    </div>
                    <Toggle checked={whatsappAutoSend} onChange={setWhatsappAutoSend} />
                  </div>
                </div>
              </div>
            )}
            {/* ── ABA: INTEGRAÇÕES / PAGAMENTOS ── */}
            {activeTab === "integracoes" && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                    <Wallet size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-foreground">Pagamentos dos Alunos</h3>
                    <p className="text-xs text-muted-foreground font-medium">Habilite o checkout de mensalidades via Asaas ou Mercado Pago na área do aluno.</p>
                  </div>
                </div>

                <div className="bg-card p-6 rounded-3xl border border-border/50 shadow-sm space-y-6">
                  <Field label="Provedor de Pagamento" hint="Escolha qual gateway processará os pagamentos dos seus alunos.">
                    <select
                      value={paymentGateway}
                      onChange={(e) => setPaymentGateway(e.target.value as "asaas" | "mercadopago" | "infinitepay")}
                      className="h-12 bg-muted/50 border-border/50 rounded-xl px-4 text-sm font-medium focus:ring-primary w-full"
                    >
                      <option value="asaas">Asaas (Boleto/Pix)</option>
                      <option value="mercadopago">Mercado Pago (Cartão/Pix)</option>
                      <option value="infinitepay">InfinitePay (Pix grátis/Cartão 12x)</option>
                    </select>
                  </Field>

                  {paymentGateway === "asaas" ? (
                    <div className="space-y-6 animate-in fade-in duration-300">
                      <div className="flex items-center justify-between p-4 rounded-2xl border border-border bg-muted/30">
                        <div className="space-y-1">
                          <h4 className="text-sm font-bold text-foreground">Ativar Integração Asaas</h4>
                          <p className="text-xs text-muted-foreground font-medium max-w-sm leading-relaxed">
                            Quando ativado, os alunos poderão visualizar o QR Code do PIX e pagar faturas diretamente pelo portal usando o Asaas.
                          </p>
                        </div>
                        <Toggle checked={asaasEnabled} onChange={setAsaasEnabled} />
                      </div>

                      <Field 
                        label="Chave da API Asaas (API Key)"
                        hint="A chave secreta gerada no painel do Asaas (Configurações > Integrações > Gerar API Key)."
                      >
                        <DebouncedInput
                          type="password"
                          value={asaasApiKey}
                          onChange={(e: any) => setAsaasApiKey(e.target.value)}
                          placeholder="$aact_..."
                          className="h-12 bg-muted/50 border-border/50 rounded-xl px-4 font-mono text-sm"
                        />
                      </Field>
                    </div>
                  ) : paymentGateway === "infinitepay" ? (
                    <div className="space-y-6 animate-in fade-in duration-300">
                      <div className="flex items-center justify-between p-4 rounded-2xl border border-indigo-500/20 bg-indigo-500/5">
                        <div className="space-y-1">
                          <h4 className="text-sm font-bold text-indigo-600 dark:text-indigo-400">Ativar Integração InfinitePay</h4>
                          <p className="text-xs text-indigo-600/70 dark:text-indigo-400/70 font-medium max-w-sm leading-relaxed">
                            Checkout seguro da InfinitePay com PIX (taxa zero) ou Cartão de Crédito em até 12x. O valor cai direto na sua conta InfinitePay.
                          </p>
                        </div>
                        <Toggle checked={infinitepayEnabled} onChange={setInfinitepayEnabled} />
                      </div>

                      <Field 
                        label="InfiniteTag (handle)"
                        hint="Seu usuário na InfinitePay, sem o símbolo $. Ex.: se seu link é infinitepay.io/l/minhaescola, informe apenas minhaescola."
                      >
                        <DebouncedInput
                          type="text"
                          value={infinitepayHandle}
                          onChange={(e: any) => setInfinitepayHandle(e.target.value)}
                          placeholder="minhaescola"
                          className="h-12 bg-muted/50 border-border/50 rounded-xl px-4 font-mono text-sm"
                        />
                      </Field>

                      <Field 
                        label="Chave da API InfinitePay (opcional)"
                        hint="A API de checkout atual identifica sua conta apenas pela InfiniteTag — a maioria das contas não tem chave. Se a InfinitePay fornecer uma chave/token para sua conta no futuro, cole aqui (fica criptografada e é enviada junto às chamadas)."
                      >
                        <DebouncedInput
                          type="password"
                          value={infinitepayApiKey}
                          onChange={(e: any) => setInfinitepayApiKey(e.target.value)}
                          placeholder="Deixe vazio se não tiver chave"
                          className="h-12 bg-muted/50 border-border/50 rounded-xl px-4 font-mono text-sm"
                        />
                      </Field>

                      <div className="p-4 rounded-2xl border border-border bg-muted/30">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Requisito no app InfinitePay</p>
                        <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                          No app InfinitePay: <span className="font-bold">Vendas &gt; Checkout &gt; Configurações &gt; Habilitar Checkout Integrado</span> (ou na web: <span className="font-mono">app.infinitepay.io/external-checkout#configuracoes</span>). Não é preciso criar checkout manual com itens — o DancePro gera os links via API.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6 animate-in fade-in duration-300">
                      <div className="flex items-center justify-between p-4 rounded-2xl border border-blue-500/20 bg-blue-500/5">
                        <div className="space-y-1">
                          <h4 className="text-sm font-bold text-blue-600 dark:text-blue-400">Ativar Integração Mercado Pago</h4>
                          <p className="text-xs text-blue-600/70 dark:text-blue-400/70 font-medium max-w-sm leading-relaxed">
                            Ao salvar esta opção, seus alunos terão uma nova tela de checkout onde poderão usar Pix ou Cartão de Crédito com a segurança do Mercado Pago. O dinheiro cai direto na sua conta.
                          </p>
                        </div>
                      </div>

                      <Field 
                        label="Access Token Mercado Pago"
                        hint="A chave secreta gerada no painel de desenvolvedor do Mercado Pago."
                      >
                        <DebouncedInput
                          type="password"
                          value={mpAccessToken}
                          onChange={(e: any) => setMpAccessToken(e.target.value)}
                          placeholder="APP_USR-..."
                          className="h-12 bg-muted/50 border-border/50 rounded-xl px-4 font-mono text-sm"
                        />
                      </Field>
                    </div>
                  )}
                </div>

                <Button
                  onClick={handleSaveAsaas}
                  disabled={updateAsaasMutation.isPending}
                  className="bg-primary hover:bg-primary/90 text-white rounded-xl shadow-lg px-6 h-10 text-xs font-bold"
                >
                  {updateAsaasMutation.isPending ? "Salvando..." : "Salvar Integração"}
                </Button>

                {/* ── Assinatura Digital (Assinafy — BYOK) ─────────────────── */}
                <div className="flex items-center gap-3 pt-4 border-t border-border/50">
                  <div className="w-10 h-10 rounded-2xl bg-violet-500/10 text-violet-600 flex items-center justify-center">
                    <FileSignature size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-foreground">Contratos Digitais</h3>
                    <p className="text-xs text-muted-foreground font-medium">Assinatura eletrônica de contratos dos alunos.</p>
                  </div>
                </div>
                <AssinafyIntegrationCard />
              </div>
            )}
          {activeTab === "ia" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400 flex items-center justify-center">
                  <Sparkles size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">IA Assistente (Gemini)</h3>
                  <p className="text-xs text-muted-foreground font-medium">Configure a sua chave secreta da API do Google Gemini.</p>
                </div>
              </div>

              <div className="bg-card p-6 rounded-3xl border border-border/50 shadow-sm space-y-6">
                <Field 
                  label="Provedor de Inteligência Artificial"
                  hint="Escolha qual motor de IA você deseja utilizar para geração de textos e planos."
                >
                  <select
                    value={aiProvider}
                    onChange={(e: any) => { setAiProvider(e.target.value); setTestStatus("idle"); setTestMessage(""); setZenModels([]); }}
                    className="w-full h-12 bg-muted/50 border border-border/50 rounded-xl px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="gemini">Google Gemini</option>
                    <option value="groq">Groq (Llama 3)</option>
                    <option value="opencode">OpenCode (Muse Spark / OpenAI-compatible)</option>
                  </select>
                </Field>
              </div>

              {aiProvider === "gemini" && (
                <>
                  <div className="bg-card p-6 rounded-3xl border border-border/50 shadow-sm space-y-6">
                    <Field 
                      label="Chave da API Gemini"
                      hint="Esta chave é individual e será usada para gerar as respostas da inteligência artificial no seu painel."
                    >
                      <DebouncedInput
                        type="password"
                        value={geminiApiKey}
                        onChange={(e: any) => setGeminiApiKey(e.target.value)}
                        placeholder="AIzaSy..."
                        className="h-12 bg-muted/50 border-border/50 rounded-xl px-4 font-mono text-sm"
                      />
                    </Field>
                  </div>

                  <div className="bg-card p-6 rounded-3xl border border-border/50 shadow-sm space-y-6">
                    <Field 
                      label="Modelo da IA (Gemini)"
                      hint="Escolha qual versão da inteligência artificial você deseja utilizar."
                    >
                      <select
                        value={geminiModel}
                        onChange={(e: any) => setGeminiModel(e.target.value)}
                        className="w-full h-12 bg-muted/50 border border-border/50 rounded-xl px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      >
                        <option value="gemini-3.6-flash">Gemini 3.6 Flash (Recomendado - Novo)</option>
                        <option value="gemini-1.5-flash">Gemini 1.5 Flash (Estável)</option>
                        <option value="gemini-1.5-pro">Gemini 1.5 Pro (Avançado)</option>
                        <option value="gemini-2.0-flash">Gemini 2.0 Flash (Legado - será convertido para 3.6)</option>
                      </select>
                    </Field>
                  </div>
                </>
              )}

              {aiProvider === "groq" && (
                <>
                  <div className="bg-card p-6 rounded-3xl border border-border/50 shadow-sm space-y-6">
                    <Field 
                      label="Chave da API Groq"
                      hint="Crie sua chave em https://console.groq.com/keys para usar modelos ultrarrápidos como Llama 3."
                    >
                      <DebouncedInput
                        type="password"
                        value={groqApiKey}
                        onChange={(e: any) => setGroqApiKey(e.target.value)}
                        placeholder="gsk_..."
                        className="h-12 bg-muted/50 border-border/50 rounded-xl px-4 font-mono text-sm"
                      />
                    </Field>
                  </div>

                  <div className="bg-card p-6 rounded-3xl border border-border/50 shadow-sm space-y-6">
                    <Field
                      label="Modelo da IA (Groq)"
                      hint="Llama 4 Scout é recomendado para o Plano Diário (30K TPM no plano gratuito — não estoura o limite de tokens)."
                    >
                      <select
                        value={groqModel}
                        onChange={(e: any) => setGroqModel(e.target.value)}
                        className="w-full h-12 bg-muted/50 border border-border/50 rounded-xl px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      >
                        <option value="meta-llama/llama-4-scout-17b-16e-instruct">⭐ Llama 4 Scout 17B (Recomendado — Plano Diário pesado)</option>
                        <option value="openai/gpt-oss-120b">GPT-OSS 120B (Melhor qualidade, 8K TPM)</option>
                        <option value="openai/gpt-oss-20b">GPT-OSS 20B (Rápido, 8K TPM)</option>
                        <option value="llama-3.3-70b-versatile">Llama 3.3 70B Versatile (Inteligente, 12K TPM)</option>
                        <option value="qwen/qwen3.6-27b">Qwen 3.6 27B</option>
                        <option value="mixtral-8x7b-32768">🧠 Mixtral 8x7B 32k (Contexto longo)</option>
                        <option value="deepseek-r1-distill-llama-70b">💡 DeepSeek R1 Distill 70B (Raciocínio avançado)</option>
                      </select>
                    </Field>
                  </div>
                </>
              )}

              {aiProvider === "opencode" && (
                <>
                  <div className="bg-card p-6 rounded-3xl border border-border/50 shadow-sm space-y-6">
                    <Field 
                      label="Chave da API OpenCode"
                      hint="Use a chave do seu provedor OpenAI-compatible (ex: Muse Spark). Se vazio, usa OPENCODE_API_KEY do servidor."
                    >
                      <DebouncedInput
                        type="password"
                        value={opencodeApiKey}
                        onChange={(e: any) => setOpencodeApiKey(e.target.value)}
                        placeholder="opencode-... ou sk-..."
                        className="h-12 bg-muted/50 border-border/50 rounded-xl px-4 font-mono text-sm"
                      />
                    </Field>
                  </div>

                  <div className="bg-card p-6 rounded-3xl border border-border/50 shadow-sm space-y-6">
                    <Field
                      label="OpenCode Go — modelos baratos (assinatura)"
                      hint="GLM Flash e DeepSeek Flash via gateway Go. Selecionar preenche o campo Modelo OpenCode automaticamente (mesma chave OpenCode)."
                    >
                      <select
                        value={opencodeModel.startsWith("opencode-go/") ? opencodeModel : ""}
                        onChange={(e: any) => { if (e.target.value) setOpencodeModel(e.target.value); }}
                        className="w-full h-12 bg-muted/50 border border-border/50 rounded-xl px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      >
                        <option value="">— não usar Go (usar campo abaixo) —</option>
                        <option value="opencode-go/glm-5.3-flash">GLM 5.3 Flash (o mais barato)</option>
                        <option value="opencode-go/deepseek-v4-flash">DeepSeek V4 Flash (rápido e barato)</option>
                      </select>
                    </Field>
                  </div>

                  <div className="bg-card p-6 rounded-3xl border border-border/50 shadow-sm space-y-6">
                    <Field
                      label="Modelo OpenCode"
                      hint="Modelo manual do gateway Zen (ex: opencode/muse-spark-1.2-contributor-free). Modelos Go têm prefixo opencode-go/."
                    >
                      <DebouncedInput
                        type="text"
                        value={opencodeModel}
                        onChange={(e: any) => setOpencodeModel(e.target.value)}
                        placeholder="opencode/muse-spark-1.2-contributor-free"
                        className="h-12 bg-muted/50 border-border/50 rounded-xl px-4 font-mono text-sm"
                      />
                    </Field>
                  </div>

                  <div className="bg-card p-6 rounded-3xl border border-border/50 shadow-sm space-y-6">
                    <Field
                      label="URL da API OpenCode (opcional)"
                      hint="Deixe vazio: Zen usa https://opencode.ai/zen/v1 e modelos opencode-go/ vão automaticamente para https://opencode.ai/zen/go/v1."
                    >
                      <DebouncedInput
                        type="text"
                        value={opencodeApiUrl}
                        onChange={(e: any) => setOpencodeApiUrl(e.target.value)}
                        placeholder="https://opencode.ai/zen/v1/chat/completions"
                        className="h-12 bg-muted/50 border-border/50 rounded-xl px-4 font-mono text-sm"
                      />
                    </Field>
                  </div>
                </>
              )}

              {/* Teste de chave + lista Zen grátis (RF-002/RF-003) */}
              <div className="bg-card p-6 rounded-3xl border border-border/50 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-black">Testar chave API</h4>
                    <p className="text-xs text-muted-foreground">Valide a chave antes de salvar e, se for OpenCode, veja os modelos Zen grátis.</p>
                  </div>
                  <Button
                    variant="outline"
                    disabled={
                      (aiProvider==="gemini" && !geminiApiKey.trim()) ||
                      (aiProvider==="groq" && !groqApiKey.trim()) ||
                      (aiProvider==="opencode" && !opencodeApiKey.trim()) ||
                      (testAiMutation as any).isPending
                    }
                    onClick={() => {
                      const payload:any = { aiProvider };
                      if (aiProvider==="gemini") { payload.apiKey = geminiApiKey; payload.model = geminiModel; }
                      else if (aiProvider==="groq") { payload.apiKey = groqApiKey; payload.model = groqModel; }
                      else { payload.apiKey = opencodeApiKey; payload.model = opencodeModel; payload.apiUrl = opencodeApiUrl; }
                      (testAiMutation as any).mutate(payload);
                    }}
                    className="rounded-xl gap-2 shrink-0"
                  >
                    {(testAiMutation as any).isPending ? <Loader2 size={16} className="animate-spin" /> : <FlaskConical size={16} />}
                    {(testAiMutation as any).isPending ? "Testando..." : `Testar chave ${aiProvider}`}
                  </Button>
                </div>
                {testStatus !== "idle" && (
                  <div className={cn("p-3 rounded-xl border text-sm font-medium flex items-center gap-2", testStatus==="success" ? "bg-green-50 border-green-200 text-green-800" : testStatus==="error" ? "bg-red-50 border-red-200 text-red-700" : "bg-amber-50 border-amber-200 text-amber-800")}>
                    {testStatus==="loading" ? <Loader2 size={16} className="animate-spin" /> : testStatus==="success" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                    <span>{testMessage}</span>
                  </div>
                )}
                {aiProvider==="opencode" && testStatus==="success" && zenModels.length > 0 && (
                  <Field label={opencodeGateway==="go" ? `OpenCode Go — modelos baratos disponíveis (${zenModels.length})` : `Modelos OpenCode Zen grátis disponíveis (${zenModels.length})`} hint="Selecione um para preencher o Modelo OpenCode e depois clique em Salvar.">
                    <select
                      value={opencodeModel}
                      onChange={(e:any)=>setOpencodeModel(e.target.value)}
                      className="w-full h-12 bg-muted/50 border border-border/50 rounded-xl px-4 text-sm"
                    >
                      {zenModels.map((m:any)=>(
                        <option key={m.id} value={m.id}>{m.displayName || m.name || m.id} — {m.id}</option>
                      ))}
                    </select>
                  </Field>
                )}
                {aiProvider==="opencode" && testStatus==="success" && zenModels.length===0 && testMessage.includes("Nenhum") && (
                  <p className="text-xs text-muted-foreground">Nenhum Zen grátis encontrado. Você pode manter o modelo manual acima e salvar.</p>
                )}
              </div>

              <Button
                onClick={handleSaveIA}
                disabled={updateIAMutation.isPending}
                className="bg-primary hover:bg-primary/90 text-white rounded-xl shadow-lg px-6 h-10 text-xs font-bold"
              >
                {updateIAMutation.isPending ? "Salvando..." : "Salvar Chave da IA"}
              </Button>
            </div>
          )}

            {activeTab === "seguranca" && (
              <div className="space-y-8">
                <div>
                  <h3 className="text-base lg:text-lg font-black text-foreground uppercase tracking-widest">Segurança e Acesso</h3>
                  <p className="text-[11px] text-muted-foreground font-bold uppercase tracking-widest mt-1">Dados da conta</p>
                </div>

                <div className="p-6 bg-indigo-500/10 rounded-[1.5rem] border border-indigo-100 flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-lg shadow-indigo-500/20">
                    <Shield size={20} />
                  </div>
                  <div>
                    <p className="text-xs font-black text-indigo-900 uppercase tracking-widest mb-1">Conta Verificada</p>
                    <p className="text-[11px] text-indigo-800/70 font-medium leading-relaxed">
                      Sua conta está protegida. A autenticação é gerenciada de forma centralizada para máxima segurança.
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between p-5 bg-muted rounded-2xl border border-border">
                    <div>
                      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Último Acesso</p>
                      <p className="text-xs font-bold text-foreground">
                        {user?.lastSignedIn
                          ? new Date(user.lastSignedIn).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
                          : "—"}
                      </p>
                    </div>
                  </div>
                  <div className="h-px bg-border" />
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-xs font-semibold text-foreground">Conta criada em</p>
                      <p className="text-[10px] text-muted-foreground">
                        {user?.createdAt
                          ? new Date(user.createdAt).toLocaleDateString("pt-BR", { dateStyle: "long" })
                          : "—"}
                      </p>
                    </div>
                  </div>
                </div>
                
                <PwaInstallSection />
                <ExportDataSection />
                {user?.email?.toLowerCase() && ['walyssonrodrigo145@gmail.com', 'ddwvitor@gmail.com'].includes(user.email.toLowerCase()) && (
                  <CleanupTestDataSection />
                )}
              </div>
            )}

            {/* ── ABA: PROFESSORES (movida para o menu lateral /professores) ── */}

            {/* ── ABA: SALAS DE ESTÚDIO ── */}
            {activeTab === "salas" && (
              <SalasEstudioTab />
            )}

            {/* ── ABA: MODELOS DE CONTRATO ── */}
            {activeTab === "modelos_contrato" && (
              <ModelosContratoTab />
            )}

            {/* ── ABA: REPOSIÇÕES (PRD 01 — Políticas + Motivos) ── */}
            {activeTab === "reposicoes" && (
              <RepositionsSettings />
            )}

            {/* ── ABA: PROMPTS IA (PRD 02 — Especialistas + Prompts versionados) ── */}
            {activeTab === "prompts" && (
              <AiPromptsSettings />
            )}

            {/* ── ABA: AJUDA ── */}
            {activeTab === "ajuda" && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-2xl bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 flex items-center justify-center">
                    <HelpCircle size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-foreground">Ajuda e Tutoriais</h3>
                    <p className="text-xs text-muted-foreground font-medium">Reveja tutoriais e aprenda a usar o sistema.</p>
                  </div>
                </div>

                <div className="bg-card p-6 rounded-3xl border border-border/50 shadow-sm space-y-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h4 className="text-sm font-bold text-foreground">Tour Guiado da Plataforma</h4>
                      <p className="text-xs text-muted-foreground mt-1 max-w-md">
                        Relembre como as principais áreas do sistema funcionam. O tour mostrará passo a passo os menus, gráficos e controles.
                      </p>
                    </div>
                    <Button onClick={() => startTour()} className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg shadow-blue-500/20 px-6 h-10 text-xs font-bold gap-2">
                      <HelpCircle size={16} />
                      Iniciar Tour
                    </Button>
                  </div>
                </div>

                {/* Fale conosco / Suporte */}
                <div className="bg-card p-6 rounded-3xl border border-emerald-500/30 shadow-sm space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                      <MessageCircle size={20} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-foreground">Fale conosco</h4>
                      <p className="text-xs text-muted-foreground mt-1 max-w-md">
                        Precisa de ajuda ou quer solicitar suporte? Fale com a nossa equipe pelo WhatsApp.
                      </p>
                      <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 mt-1.5">
                        {SUPPORT_WHATSAPP_DISPLAY}
                      </p>
                    </div>
                  </div>
                  <a
                    href={SUPPORT_WHATSAPP_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full sm:w-auto sm:px-6 h-11 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider transition-all active:scale-95 shadow-lg shadow-emerald-600/20"
                  >
                    <MessageCircle size={16} />
                    Falar no WhatsApp
                  </a>
                </div>

                {/* Meus chamados (suporte/bugs/melhorias) */}
                <MyTicketsList />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}



