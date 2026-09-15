import { useEffect, useRef } from "react";
import { toast } from "sonner";

/**
 * Hook que se conecta ao endpoint SSE /api/webhooks/bot-status/sse
 * e exibe um toast persistente quando a sessão do WhatsApp cair.
 *
 * Deve ser usado apenas uma vez no App.tsx para ser global.
 */
export function useBotStatusSSE() {
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastIdRef = useRef<string | number | null>(null);

  useEffect(() => {
    let isMounted = true;

    function connect() {
      if (!isMounted) return;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const es = new EventSource("/api/webhooks/bot-status/sse");
      eventSourceRef.current = es;

      es.addEventListener("BOT_DISCONNECTED", (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data) as {
            sessionId: string;
            reason: string;
            timestamp: string;
          };

          console.warn("[BotStatusSSE] Sessão desconectada:", data);

          // Descarta toast anterior se ainda estiver visível
          if (toastIdRef.current !== null) {
            toast.dismiss(toastIdRef.current);
          }

          // Exibe um toast persistente (vermelho, sem auto-close)
          toastIdRef.current = toast.error("⚠️ WhatsApp Desconectado!", {
            description: `A sessão "${data.sessionId}" caiu. Acesse Configurações para reconectar.`,
            duration: Infinity, // Persiste até o usuário fechar manualmente
            action: {
              label: "Ir para Configurações",
              onClick: () => {
                window.location.href = "/configuracoes";
              },
            },
          });
        } catch {
          // Ignora erros de parse
        }
      });

      // NOVO: Pagamento Recebido (Asaas Webhook)
      es.addEventListener("PAYMENT_CONFIRMED", (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data) as {
            studentName: string;
            amount: string;
            message: string;
          };

          toast.success("Pagamento Confirmado!", {
            description: data.message,
            duration: 10000,
          });
        } catch {
          // Ignore
        }
      });

      es.onerror = () => {
        es.close();
        eventSourceRef.current = null;
        // Tenta reconectar após 10 segundos
        if (isMounted) {
          reconnectTimerRef.current = setTimeout(connect, 10_000);
        }
      };
    }

    connect();

    return () => {
      isMounted = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);
}
