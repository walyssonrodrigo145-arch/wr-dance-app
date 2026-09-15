import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { Joyride, EventData, EVENTS, STATUS, ACTIONS, Step } from "react-joyride";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { tourSteps } from "./tourSteps";
import { useIsMobile } from "@/hooks/useMobile";

interface TourContextType {
  runTour: boolean;
  startTour: () => void;
  stopTour: () => void;
  hasSeenTutorial: boolean;
  setHasSeenTutorial: (value: boolean) => void;
}

const TourContext = createContext<TourContextType | undefined>(undefined);

export function TourProvider({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();
  const [runTour, setRunTour] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [hasSeenTutorial, setHasSeenTutorial] = useState(true);
  // Pausa o Joyride durante navegação entre páginas para evitar tela cinza
  const [isNavigating, setIsNavigating] = useState(false);
  const pendingStepIndex = useRef<number | null>(null);
  const [, setLocation] = useLocation();

  const { data: user } = trpc.auth.me.useQuery(undefined, {
    staleTime: Infinity,
  });

  const completeTutorial = trpc.auth.completeTutorial.useMutation({
    onSuccess: () => {
      setHasSeenTutorial(true);
    }
  });

  useEffect(() => {
    // Tour exclusivo para admins e professores — alunos nunca veem o tour
    if (user && user.role === 'aluno') {
      setHasSeenTutorial(true);
      return;
    }
    if (user && user.hasSeenTutorial === false) {
      setHasSeenTutorial(false);
    }
  }, [user]);

  const startTour = () => {
    // Alunos não podem iniciar o tour
    if (user?.role === 'aluno') return;

    setStepIndex(0);
    setIsNavigating(false);
    pendingStepIndex.current = null;
    
    // Garante que o tour sempre inicie no Dashboard para não pular os steps 2 e 3
    if (window.location.pathname !== "/") {
      setLocation("/");
      pendingStepIndex.current = 0;
      setIsNavigating(true);
    } else {
      setRunTour(true);
    }
  };

  const stopTour = () => {
    setRunTour(false);
    setStepIndex(0);
    setIsNavigating(false);
    pendingStepIndex.current = null;
  };

  useEffect(() => {
    if (runTour) {
      document.body.classList.add('tour-active');
    } else {
      document.body.classList.remove('tour-active');
    }
    return () => document.body.classList.remove('tour-active');
  }, [runTour]);

  // Quando isNavigating, aguarda 900ms para o DOM da nova página renderizar, depois retoma
  useEffect(() => {
    if (!isNavigating) return;

    const timer = setTimeout(() => {
      setIsNavigating(false);
      if (pendingStepIndex.current !== null) {
        setStepIndex(pendingStepIndex.current);
        pendingStepIndex.current = null;
        setRunTour(true);
      }
    }, 900);

    return () => clearTimeout(timer);
  }, [isNavigating]);

  const handleJoyrideCallback = (data: EventData) => {
    const { action, index, status, type, step } = data as EventData & { step: Step & { data?: { navigateTo?: string } } };

    // Tour finalizado ou pulado
    if (([STATUS.FINISHED, STATUS.SKIPPED] as string[]).includes(status)) {
      setRunTour(false);
      setStepIndex(0);
      setIsNavigating(false);
      pendingStepIndex.current = null;
      if (!hasSeenTutorial) {
        completeTutorial.mutate();
      }
      return;
    }

    // Avança/volta entre steps
    if (type === EVENTS.STEP_AFTER || type === EVENTS.TARGET_NOT_FOUND) {
      const nextStepIndex = index + (action === ACTIONS.PREV ? -1 : 1);

      // TARGET_NOT_FOUND: pula step automaticamente sem travar
      if (type === EVENTS.TARGET_NOT_FOUND) {
        setStepIndex(nextStepIndex);
        return;
      }

      // Se o próximo step requer navegação para outra página
      if (action === ACTIONS.NEXT && (step as Step & { data?: { navigateTo?: string } }).data?.navigateTo) {
        const navigateTo = (step as Step & { data?: { navigateTo?: string } }).data!.navigateTo!;
        setRunTour(false);
        setLocation(navigateTo);
        pendingStepIndex.current = nextStepIndex;
        setIsNavigating(true);
        return;
      }

      setStepIndex(nextStepIndex);
    }
  };

  // Processa steps dinamicamente para o Mobile
  const processedSteps = tourSteps.map(step => {
    if (isMobile) {
      if (step.target === ".tour-sidebar-desktop #tour-sidebar" || step.target === "#tour-sidebar") {
        return {
          ...step,
          target: "#tour-mobile-menu",
          placement: "bottom" as any,
          content: "Aqui você abre o menu para acessar todas as áreas do sistema.",
        };
      }
      if (step.target === "#tour-user-menu") {
        return {
          ...step,
          target: "#tour-mobile-user-menu",
          placement: "bottom" as any,
          content: "Aqui você acessa o seu perfil, configurações e a opção de sair.",
        };
      }

      // Para elementos muito grandes no mobile, forçamos o tooltip no centro 
      // para evitar que ele seja "flipado" para o topo e acabe cortado fora da tela.
      const largeElements = [
        "#tour-finance-cards", 
        "#tour-students-list", 
        "#tour-dashboard-charts",
        "#tour-dashboard-stats",
        "#tour-calendar-view",
        "#tour-auto-rules",
        "#tour-auto-stats"
      ];
      
      if (typeof step.target === 'string' && largeElements.includes(step.target)) {
        return {
          ...step,
          placement: "center" as any,
        };
      }
    }
    return step;
  });

  // O tour só roda quando não está navegando
  const shouldRun = runTour && !isNavigating;

  return (
    <TourContext.Provider value={{ runTour, startTour, stopTour, hasSeenTutorial, setHasSeenTutorial }}>
      {children}
      <Joyride
        steps={processedSteps}
        run={shouldRun}
        stepIndex={stepIndex}
        onEvent={handleJoyrideCallback}
        continuous={true}
        scrollToFirstStep={true}
        locale={{
          back: 'Voltar',
          close: 'Fechar',
          last: 'Finalizar',
          next: 'Próximo',
          skip: 'Pular Tutorial',
        }}
        floatingOptions={{
          // Desabilita recálculo contínuo de posição — elimina o "salto" ao mover o mouse
          autoUpdate: {
            animationFrame: false,
            ancestorScroll: false,
            elementResize: false,
            layoutShift: false,
          },
        }}
        options={{
          primaryColor: '#8b5cf6',
          textColor: '#333',
          zIndex: 10000,
          overlayColor: 'rgba(0, 0, 0, 0.5)',
          overlayClickAction: false,
          showProgress: true,
          spotlightRadius: 8,
          spotlightPadding: 6,
          skipBeacon: true,
          buttons: ['back', 'primary', 'skip'],
          // Aguarda até 3s pelo target aparecer no DOM antes de emitir TARGET_NOT_FOUND
          targetWaitTimeout: 3000,
          // Scroll suave até o target antes de mostrar o tooltip
          scrollOffset: 100,
        }}
        styles={{
          tooltip: {
            borderRadius: '12px',
            padding: '20px',
            maxWidth: isMobile ? '90vw' : '380px',
          },
          tooltipContainer: {
            textAlign: 'left',
          },
          tooltipTitle: {
            fontSize: '16px',
            fontWeight: '700',
            marginBottom: '8px',
          },
          tooltipContent: {
            fontSize: '14px',
            lineHeight: '1.6',
            color: '#374151',
          },
          buttonPrimary: {
            backgroundColor: '#8b5cf6',
            borderRadius: '8px',
            padding: '8px 16px',
            fontSize: '13px',
            fontWeight: '600',
          },
          buttonBack: {
            color: '#8b5cf6',
            fontSize: '13px',
          },
          buttonSkip: {
            color: '#9ca3af',
            fontSize: '12px',
          },
          overlay: {
            mixBlendMode: 'normal',
          },
        }}
      />
    </TourContext.Provider>
  );
}

export const useTour = () => {
  const context = useContext(TourContext);
  if (!context) {
    throw new Error("useTour must be used within a TourProvider");
  }
  return context;
};
