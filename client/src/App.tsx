import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { MusicLayout } from "./components/MusicLayout";
import { StudentPortalLayout } from "./components/StudentPortalLayout";
import { useAuth } from "@/hooks/useAuth";
import { useBotStatusSSE } from "@/hooks/useBotStatusSSE";

// Lazy loading the pages
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Alunos = lazy(() => import("./pages/Alunos"));
const Aulas = lazy(() => import("./pages/Aulas"));
const Instrumentos = lazy(() => import("./pages/Instrumentos"));
const Relatorios = lazy(() => import("./pages/Relatorios"));
const Configuracoes = lazy(() => import("./pages/Configuracoes"));
const Assinatura = lazy(() => import("./pages/Assinatura"));
const Lembretes = lazy(() => import("./pages/Lembretes"));
const Financeiro = lazy(() => import("./pages/Financeiro"));
const Login = lazy(() => import("./pages/Login"));
const Progresso = lazy(() => import("./pages/Progresso"));
const RankingsPage = lazy(() => import("./pages/Rankings"));
const LandingPage = lazy(() => import("./pages/LandingPage"));
const Checkout = lazy(() => import("./pages/Checkout"));
const Cadastro = lazy(() => import("./pages/Cadastro"));
const NotFound = lazy(() => import("./pages/NotFound"));
const NovoAluno = lazy(() => import("./pages/NovoAluno"));
const Comunicados = lazy(() => import("./pages/Comunicados"));
const MarketingDashboard = lazy(() => import("@/pages/marketing/MarketingDashboard"));
const CreateCampaign = lazy(() => import("@/pages/marketing/CreateCampaign"));
const CampaignDetails = lazy(() => import("@/pages/marketing/CampaignDetails"));

const Solicitacoes = lazy(() => import("./pages/Solicitacoes"));
const Reposicoes = lazy(() => import("./pages/Reposicoes"));
const IAAssistente = lazy(() => import("./pages/IAAssistente"));
const ProfessorExtract = lazy(() => import("./pages/ProfessorExtract"));
const RecepcaoQRCode = lazy(() => import("./pages/RecepcaoQRCode"));
const QRScanner = lazy(() => import("./pages/QRScanner"));
const Automacoes = lazy(() => import("./pages/Automacoes"));
const SuperAdmin = lazy(() => import("./pages/SuperAdmin"));
const AnalyticsDashboard = lazy(() => import('./pages/analytics/AnalyticsDashboard'));
const LeadsApp = lazy(() => import('./pages/leads/LeadsApp'));
const TermosDeUso = lazy(() => import("./pages/TermosDeUso"));
const PoliticaPrivacidade = lazy(() => import("./pages/PoliticaPrivacidade"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const SalasEstudio = lazy(() => import("./pages/SalasEstudio"));
const ChatbotFlowBuilder = lazy(() => import("./pages/ChatbotFlowBuilder"));
const BaseConhecimentoIA = lazy(() => import("./pages/BaseConhecimentoIA"));
const Contratos = lazy(() => import("./pages/Contratos"));
const NotasFiscais = lazy(() => import("./pages/NotasFiscais"));
const Coreografias = lazy(() => import("./pages/Coreografias"));
const Eventos = lazy(() => import("./pages/Eventos"));
const Figurinos = lazy(() => import("./pages/Figurinos"));
const Turmas = lazy(() => import("./pages/Turmas"));
const Nps = lazy(() => import("./pages/Nps"));
const Tutoriais = lazy(() => import("./pages/Tutoriais"));
const Novidades = lazy(() => import("./pages/Novidades"));
const Professores = lazy(() => import("./pages/Professores"));

// Student Portal Pages
const StudentDashboard = lazy(() => import("./pages/student/Dashboard"));
const StudentLessons = lazy(() => import("./pages/student/Aulas"));
const StudentMaterials = lazy(() => import("./pages/student/Materiais"));
const StudentExercises = lazy(() => import("./pages/student/Exercicios"));
const StudentProgress = lazy(() => import("./pages/student/Progresso"));
const StudentPayments = lazy(() => import("./pages/student/Pagamentos"));
const StudentProfile = lazy(() => import("./pages/student/Perfil"));
const StudentAgenda = lazy(() => import("./pages/student/Agenda"));

const StudentAnnouncements = lazy(() => import("./pages/student/Avisos"));
const StudentMessages = lazy(() => import("./pages/student/Mensagens"));
const StudentContracts = lazy(() => import("./pages/student/Contratos"));
const StudentResults = lazy(() => import("./pages/student/Resultados"));
const StudentCoreografias = lazy(() => import("./pages/student/Coreografias"));
const StudentEventos = lazy(() => import("./pages/student/Eventos"));
const StudentFigurinos = lazy(() => import("./pages/student/Figurinos"));
const StudentTurmas = lazy(() => import("./pages/student/Turmas"));

const PageLoader = () => (
  <div className="flex-1 h-full min-h-[50vh] flex flex-col items-center justify-center text-muted-foreground gap-4">
    <Loader2 className="animate-spin text-primary" size={32} />
    <span className="text-xs font-bold uppercase tracking-widest text-primary/60">Carregando DancePro...</span>
  </div>
);

const PublicEnrollmentPage = lazy(() => import("./pages/PublicEnrollment"));

function Router() {
  const { user, isAuthenticated, loading } = useAuth();
  const host = typeof window !== "undefined" ? window.location.hostname : "";
  const currentPath = typeof window !== "undefined" ? window.location.pathname : "";

  // Rota pública de matrícula — acessível independente de autenticação
  if (currentPath.startsWith("/matricula/")) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path="/matricula/:code" component={PublicEnrollmentPage} />
        </Switch>
      </Suspense>
    );
  }

  if (loading) return <PageLoader />;

  // Se o acesso for via subdomínio leads.wrmusicpro.com.br ou rota /leads
  const isLeadsHost =
    host.startsWith("leads.") ||
    (typeof window !== "undefined" &&
      (window.location.search.includes("leads=true") || window.location.pathname === "/leads"));

  if (isLeadsHost) {
    if (!isAuthenticated) {
      return (
        <Suspense fallback={<PageLoader />}>
          <Login />
        </Suspense>
      );
    }
    return (
      <Suspense fallback={<PageLoader />}>
        <LeadsApp />
      </Suspense>
    );
  }

  // Se o acesso for via subdomínio analytics.wrmusicpro.com.br ou rota /analytics
  const isAnalyticsHost =
    host.startsWith("analytics.") ||
    (typeof window !== "undefined" &&
      (window.location.search.includes("analytics=true") || window.location.pathname === "/analytics"));

  if (isAnalyticsHost) {
    if (!isAuthenticated) {
      return (
        <Suspense fallback={<PageLoader />}>
          <Login />
        </Suspense>
      );
    }
    // Renderiza EXCLUSIVAMENTE o Dashboard de Analytics (sem barra lateral da escola ou do aluno)
    return (
      <Suspense fallback={<PageLoader />}>
        <AnalyticsDashboard />
      </Suspense>
    );
  }

  // Redirect unauthenticated users to login, except for landing page
  if (!isAuthenticated) {
    const isNativeApp = typeof window !== "undefined" && (window.location.protocol.includes("capacitor") || window.location.origin.includes("localhost"));
    
    return (
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path="/" component={isNativeApp ? Login : LandingPage} />
          <Route path="/login" component={Login} />
          <Route path="/cadastro" component={Cadastro} />
          <Route path="/termos-de-uso" component={TermosDeUso} />
          <Route path="/politica-de-privacidade" component={PoliticaPrivacidade} />
          <Route path="/reset-password" component={ResetPassword} />
          <Route>
            <Redirect to="/login" />
          </Route>
        </Switch>
      </Suspense>
    );
  }

  // Redirect Alunos trying to access Admin pages
  if (user?.role === "aluno") {
    return (
      <StudentPortalLayout>
        <Suspense fallback={<PageLoader />}>
          <Switch>
            <Route path="/aluno" component={StudentDashboard} />
            <Route path="/aluno/aulas" component={StudentLessons} />
            <Route path="/aluno/agenda" component={StudentAgenda} />
            <Route path="/aluno/materiais" component={StudentMaterials} />
            <Route path="/aluno/exercicios" component={StudentExercises} />
            <Route path="/aluno/progresso" component={StudentProgress} />
            <Route path="/aluno/resultados" component={StudentResults} />
            <Route path="/aluno/coreografias" component={StudentCoreografias} />
            <Route path="/aluno/eventos" component={StudentEventos} />
            <Route path="/aluno/figurinos" component={StudentFigurinos} />
            <Route path="/aluno/turmas" component={StudentTurmas} />

            <Route path="/aluno/pagamentos" component={StudentPayments} />
            <Route path="/aluno/perfil" component={StudentProfile} />
            <Route path="/aluno/avisos" component={StudentAnnouncements} />
            <Route path="/aluno/mensagens" component={StudentMessages} />
            <Route path="/aluno/contratos" component={StudentContracts} />
            <Route path="/aluno/scanner" component={QRScanner} />
            <Route>
              <Redirect to="/aluno" />
            </Route>
          </Switch>
        </Suspense>
      </StudentPortalLayout>
    );
  }

  // Admin/Professor Paywall Logic
  const trialEndsAt = user?.trialEndsAt ? new Date(user.trialEndsAt) : null;
  const isTrialExpired = trialEndsAt ? trialEndsAt < new Date() : false;
  
  const isHardBlocked = isTrialExpired;
  const isSubscriptionActive = user?.subscriptionStatus === "active";
  
  // Concede acesso se a assinatura estiver ativa OU se o trial ainda estiver válido
  const hasAccess = isSubscriptionActive || (trialEndsAt && !isHardBlocked);

  if (!hasAccess) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Switch>
           <Route path="/checkout" component={Checkout} />
           <Route>
             <Redirect to="/checkout" />
           </Route>
        </Switch>
      </Suspense>
    );
  }

  // Admin/Professor Routes
  return (
    <MusicLayout>
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/alunos" component={Alunos} />
          <Route path="/professores" component={Professores} />
          <Route path="/alunos/novo" component={NovoAluno} />
          <Route path="/alunos/:id/editar" component={NovoAluno} />
          <Route path="/aulas" component={Aulas} />
          <Route path="/coreografias" component={Coreografias} />
          <Route path="/eventos" component={Eventos} />
          <Route path="/figurinos" component={Figurinos} />
          <Route path="/turmas" component={Turmas} />
          <Route path="/nps" component={Nps} />
          <Route path="/reposicoes" component={Reposicoes} />
          <Route path="/instrumentos" component={Instrumentos} />
          <Route path="/relatorios" component={Relatorios} />
          <Route path="/lembretes" component={Lembretes} />
          <Route path="/financeiro" component={Financeiro} />
          <Route path="/configuracoes" component={Configuracoes} />
          <Route path="/assinatura" component={Assinatura} />
          <Route path="/progresso" component={Progresso} />
          <Route path="/rankings" component={RankingsPage} />
          <Route path="/comunicados" component={Comunicados} />
          <Route path="/marketing" component={MarketingDashboard} />
          <Route path="/marketing/nova" component={CreateCampaign} />
          <Route path="/marketing/:id" component={CampaignDetails} />
          <Route path="/automacoes" component={Automacoes} />
          <Route path="/chatbot-fluxo" component={ChatbotFlowBuilder} />
          <Route path="/fluxo-chatbot" component={ChatbotFlowBuilder} />
          <Route path="/base-conhecimento-ia" component={BaseConhecimentoIA} />
          <Route path="/ia-conhecimento" component={BaseConhecimentoIA} />
          <Route path="/solicitacoes" component={Solicitacoes} />
          <Route path="/ia" component={IAAssistente} />
          <Route path="/folha" component={ProfessorExtract} />
          <Route path="/recepcao-qr" component={RecepcaoQRCode} />
          <Route path="/scanner" component={QRScanner} />
          <Route path="/master-panel" component={SuperAdmin} />
          <Route path="/analytics" component={AnalyticsDashboard} />
          <Route path="/comercial" component={LeadsApp} />
          <Route path="/leads" component={LeadsApp} />
          <Route path="/contratos" component={Contratos} />
          <Route path="/notas-fiscais" component={NotasFiscais} />
          <Route path="/tutoriais" component={Tutoriais} />
          <Route path="/novidades" component={Novidades} />
          <Route path="/salas" component={SalasEstudio} />
          <Route path="/salas-estudio" component={SalasEstudio} />
          <Route path="/checkout" component={Checkout} />
          <Route>
            <Redirect to="/dashboard" />
          </Route>
        </Switch>
      </Suspense>
    </MusicLayout>
  );
}

import { TourProvider } from "./components/tour/TourProvider";
import { WelcomeModal } from "./components/tour/WelcomeModal";
import { WhatsNewProvider } from "./components/novidades/WhatsNewProvider";
import { WhatsNewModal } from "./components/novidades/WhatsNewModal";
import { initAnalytics, trackPageView } from "./lib/analytics";
import { useLocation } from "wouter";
import { useEffect } from "react";

// Initialize analytics outside of the component tree to run once on load
initAnalytics();

import { setAnalyticsUser } from "./lib/analytics";

function AppTracking() {
  const [location] = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      setAnalyticsUser(user.id, user.name);
    }
  }, [user]);

  useEffect(() => {
    trackPageView(location);
  }, [location]);

  return null;
}

import { ImpersonationBanner } from "./components/ImpersonationBanner";

function App() {
  // Escuta eventos SSE do bot e exibe toast quando a sessão WhatsApp cair
  useBotStatusSSE();

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable>
        <TooltipProvider>
          <Toaster richColors position="top-right" />
          <TourProvider>
            <WhatsNewProvider>
              <AppTracking />
              <WelcomeModal />
              <WhatsNewModal />
              <ImpersonationBanner />
              <Router />
            </WhatsNewProvider>
          </TourProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
