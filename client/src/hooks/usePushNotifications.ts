import { useCallback, useEffect, useState } from "react";
import { requestForToken, onForegroundPush, isPushSupported } from "../lib/firebaseConfig";
import { trpc } from "../lib/trpc";
import { toast } from "sonner";

export type NotificationPermission = "default" | "granted" | "denied";

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );

  const registerToken = trpc.fcm.registerToken.useMutation();
  // Suporte real: Notification + ServiceWorker + PushManager; iOS exige PWA instalada
  const isSupported = isPushSupported();

  /** Solicita permissão ao usuário e registra a subscrição Web Push (VAPID) no backend */
  const requestPermission = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!isSupported) {
      if (!silent) {
        toast.error("Notificações Web Push não são suportadas neste navegador ou modo. No iPhone/iOS, adicione o app à Tela de Início (PWA).");
      }
      return "denied" as NotificationPermission;
    }

    if (Notification.permission === "denied") {
      setPermission("denied");
      if (!silent) {
        toast.error("As notificações estão bloqueadas nas configurações do seu celular/navegador. Toque no cadeado ao lado da URL para permitir.");
      }
      return "denied" as NotificationPermission;
    }

    const result = await new Promise<NotificationPermission>((resolve) => {
      const timer = setTimeout(() => resolve(Notification.permission as NotificationPermission), 5000);
      Notification.requestPermission()
        .then((res) => {
          clearTimeout(timer);
          resolve(res);
        })
        .catch(() => {
          clearTimeout(timer);
          resolve("denied" as NotificationPermission);
        });
    });
    setPermission(result);

    if (result === "granted") {
      let token: string | null = null;
      try {
        token = await requestForToken();
      } catch (err: any) {
        console.error("Erro ao obter subscrição Web Push:", err);
        const detail = err?.message || err?.code || String(err);
        if (!silent) {
          toast.error(`Falha ao registrar dispositivo: ${detail}`);
        }
        return result;
      }

      if (token) {
        try {
          console.log("Registrando subscrição no backend...");
          await registerToken.mutateAsync({
            token,
            deviceInfo: navigator.userAgent
          });
          if (!silent) {
            toast.success("Notificações ativadas neste dispositivo!");
          }
        } catch (err: any) {
          console.error("Erro ao salvar subscrição no backend:", err);
          if (!silent) {
            toast.error("Servidor indisponível ao salvar token: " + (err.message || "Erro de conexão"));
          }
        }
      } else {
        if (!silent) {
          toast.error("Não foi possível gerar a subscrição. Verifique se as notificações estão PERMITIDAS nas configurações do navegador e tente novamente.");
        }
      }
    } else if (result === "denied") {
      if (!silent) {
        toast.error("Permissão de notificação negada pelo usuário.");
      }
    }
    return result;
  }, [isSupported, registerToken]);

  /** Exibe uma notificação local do navegador (Fallback) */
  const showNotification = useCallback(
    (title: string, options?: NotificationOptions & { onClick?: (e: Event) => void }) => {
      if (!isSupported || Notification.permission !== "granted") return null;
      try {
        const { onClick, ...rest } = options || {};
        const n = new Notification(title, {
          icon: "/favicon.ico",
          badge: "/favicon.ico",
          ...rest,
        });
        if (onClick) {
          n.onclick = (e) => {
            window.focus();
            onClick(e);
          };
        }
        return n;
      } catch {
        return null;
      }
    },
    [isSupported]
  );

  /** Sincroniza o estado de permissão quando o usuário muda nas configurações do browser */
  useEffect(() => {
    if (!isSupported) return;
    const check = () => setPermission(Notification.permission);
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  }, [isSupported]);

  /** Se a permissão já foi concedida antes, garante que o token seja registrado silenciosamente uma única vez */
  useEffect(() => {
    let done = false;
    if (isSupported && Notification.permission === "granted" && !done) {
      done = true;
      requestPermission({ silent: true });
    }
  }, [isSupported]);

  /** Escuta pushes recebidos em Foreground (aba focada) — o SW repassa via postMessage */
  useEffect(() => {
    const off = onForegroundPush((payload: any) => {
      if (payload?.notification?.title || payload?.title) {
        toast(payload.notification?.title || payload.title, {
          description: payload.notification?.body || payload.body,
        });
      }
    });
    return off;
  }, []);

  return { permission, isSupported, requestPermission, showNotification };
}
