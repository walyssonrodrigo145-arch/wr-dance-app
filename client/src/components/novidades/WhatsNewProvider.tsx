import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/useAuth";
import { getUnseenRelease, type Release } from "@shared/releases";

interface WhatsNewContextValue {
  isAllowed: boolean;
  hasUnseen: boolean;
  unseenRelease: Release | null;
  isOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
  markSeen: () => void;
}

const WhatsNewContext = createContext<WhatsNewContextValue | null>(null);

/**
 * "Novidades" (What's New) — badge + modal automático + histórico.
 * Conteúdo vem de shared/releases.ts (sem cadastro); o "já vi" é por usuário.
 */
export function WhatsNewProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const { data: status } = trpc.releases.getStatus.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    enabled: !!user, // não buscar em páginas públicas (login/landing)
    retry: false, // evita retries quando bloqueado por trial/paywall
  });

  const markSeenMut = trpc.releases.markSeen.useMutation({
    onMutate: async ({ version }) => {
      await utils.releases.getStatus.cancel();
      const prev = utils.releases.getStatus.getData(undefined);
      utils.releases.getStatus.setData(undefined, (old) =>
        old ? { ...old, hasUnseen: false, lastSeenVersion: version } : old
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) utils.releases.getStatus.setData(undefined, ctx.prev);
    },
  });

  const [isOpen, setIsOpen] = useState(false);
  const [autoShown, setAutoShown] = useState(false);

  // RN-004: não abrir junto com o WelcomeModal (primeiro acesso / tutorial)
  const tutorialSeen = !!user && (user as any).hasSeenTutorial !== false;
  const tutorialPending = !!user && (user as any).hasSeenTutorial === false;
  const hasUnseen = !!status?.isAllowed && !!status?.hasUnseen && tutorialSeen;
  const unseenRelease = useMemo(
    () => (hasUnseen ? getUnseenRelease(status?.lastSeenVersion) : null),
    [hasUnseen, status?.lastSeenVersion]
  );

  // RN-004: no primeiro acesso (tutorial pendente), marca a versão atual como vista
  // silenciosamente — evita empilhar o modal de novidades logo após o tutorial.
  const [silentlyMarked, setSilentlyMarked] = useState(false);
  useEffect(() => {
    if (tutorialPending && status?.isAllowed && status?.hasUnseen && status?.latestVersion && !silentlyMarked) {
      setSilentlyMarked(true);
      markSeenMut.mutate({ version: status.latestVersion });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutorialPending, status?.isAllowed, status?.hasUnseen, status?.latestVersion, silentlyMarked]);

  useEffect(() => {
    if (hasUnseen && unseenRelease && !autoShown) {
      setAutoShown(true);
      setIsOpen(true);
    }
  }, [hasUnseen, unseenRelease, autoShown]);

  const markSeen = () => {
    if (status?.latestVersion) markSeenMut.mutate({ version: status.latestVersion });
  };

  const value: WhatsNewContextValue = {
    isAllowed: !!status?.isAllowed,
    hasUnseen,
    unseenRelease,
    isOpen,
    openModal: () => setIsOpen(true),
    closeModal: () => {
      setIsOpen(false);
      markSeen();
    },
    markSeen,
  };

  return <WhatsNewContext.Provider value={value}>{children}</WhatsNewContext.Provider>;
}

export function useWhatsNew() {
  const ctx = useContext(WhatsNewContext);
  if (!ctx) throw new Error("useWhatsNew must be used within WhatsNewProvider");
  return ctx;
}
