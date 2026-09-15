// ─── Web Push VAPID (PRD_PUSH_VAPID_001) ─────────────────────────────────────
// Subscrição nativa via PushManager (RFC 8292) — sem SDK Firebase.
// Mesma chave VAPID do servidor; a subscrição (JSON {endpoint, keys}) é enviada
// ao backend e armazenada em fcm_tokens. Service worker: /sw.js (push nativo).
//
// AUD-002 FIX (histórico): sem interceptação de console/fetch; AUD-009: sem config hardcoded.

let _vapidKey: string = (import.meta.env.VITE_VAPID_PUBLIC_KEY || import.meta.env.VITE_FIREBASE_VAPID_KEY || "") as string;

export const VAPID_KEY = _vapidKey;

export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/** iOS só entrega Web Push a partir do 16.4 E com a PWA instalada na tela de início. */
export function isIosDevice(): boolean {
  const ua = navigator.userAgent;
  const iOSLike = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return iOSLike;
}

export function isIosStandalone(): boolean {
  if (!isIosDevice()) return true;
  const nav = navigator as any;
  return window.matchMedia?.("(display-mode: standalone)").matches || nav.standalone === true;
}

/** Suporte real a Web Push no dispositivo atual. */
export function isPushSupported(): boolean {
  if (typeof Notification === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  if (!VAPID_KEY) return false;
  if (!isIosStandalone()) return false;
  return true;
}

export const requestForToken = async (forceRefresh = false): Promise<string | null> => {
  if (typeof Notification !== "undefined" && Notification.permission !== "granted") {
    throw new Error("Permissão de notificação não concedida.");
  }

  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("Push não suportado neste navegador.");
  }

  if (!isIosStandalone()) {
    throw new Error("No iPhone/iPad, adicione o app à Tela de Início (PWA) para receber notificações.");
  }

  if (!VAPID_KEY) {
    throw new Error("Chave de notificações ausente no app. Contate o suporte.");
  }

  let swReg: ServiceWorkerRegistration;
  try {
    if (navigator.serviceWorker.controller) {
      swReg = await navigator.serviceWorker.ready;
    } else {
      swReg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
    }
  } catch (err: any) {
    throw new Error(`Falha no Service Worker: ${err.message || String(err)}`);
  }

  // Limpar subscrição anterior se forceRefresh
  if (forceRefresh) {
    try {
      const existingSub = await swReg.pushManager.getSubscription();
      if (existingSub) {
        await existingSub.unsubscribe();
      }
    } catch {
      // Ignorar erro ao limpar subscrição anterior
    }
  }

  const subscribe = async (reg: ServiceWorkerRegistration) => {
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_KEY),
    });
    // JSON.stringify serializa via toJSON(): {endpoint, expirationTime?, keys{p256dh, auth}}
    return JSON.stringify(sub);
  };

  try {
    const subscriptionJson = await subscribe(swReg);
    return subscriptionJson;
  } catch (err: any) {
    const detail = err?.message || String(err);
    const errName = err?.name || "Erro";

    // Chave VAPID malformada/rejeitada — problema do app, não do dispositivo
    if (errName === "InvalidAccessError" || /applicationServerKey/i.test(detail)) {
      throw new Error("Chave de notificações inválida no app. Contate o suporte. [" + errName + "]");
    }

    const isPushServiceError =
      detail.includes("push service error") ||
      detail.includes("AbortError") ||
      detail.includes("Registration failed") ||
      errName === "AbortError" ||
      errName === "InvalidStateError" ||
      errName === "NotAllowedError";

    if (isPushServiceError) {
      // Auto-recovery: reset SW e retry uma única vez
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
        await new Promise((res) => setTimeout(res, 1500));
        const freshReg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        await navigator.serviceWorker.ready;
        const retryJson = await subscribe(freshReg);
        return retryJson;
      } catch (retryErr: any) {
        // Diagnóstico real: mostra o tipo do erro para identificar bloqueio de rede/DNS
        const retryDetail = (retryErr?.message || String(retryErr)).slice(0, 140);
        throw new Error(
          "Não foi possível conectar ao serviço de Push do navegador (" + (retryErr?.name || errName) + ": " + retryDetail + "). " +
          "Causas comuns: DNS com bloqueio (AdGuard/NextDNS), VPN/bloqueador de anúncios ou economia de dados ativos."
        );
      }
    }

    throw new Error(`Falha ao ativar notificações [${errName}]: ${detail.slice(0, 140)}`);
  }
};

// ─── Foreground (aba focada): o SW suprime a notificação do SO e repassa via postMessage ──
type PushHandler = (payload: any) => void;
const foregroundHandlers = new Set<PushHandler>();
let swBridgeBound = false;

function bindSwMessageBridge() {
  if (swBridgeBound || !("serviceWorker" in navigator)) return;
  swBridgeBound = true;
  navigator.serviceWorker.addEventListener("message", (event: MessageEvent) => {
    if (event.data?.type === "push-received") {
      foregroundHandlers.forEach((h) => {
        try { h(event.data.payload); } catch { /* handler isolado */ }
      });
    }
  });
}

/** Assina recebimentos em foreground. Retorna função de cleanup. */
export function onForegroundPush(handler: PushHandler): () => void {
  bindSwMessageBridge();
  foregroundHandlers.add(handler);
  return () => foregroundHandlers.delete(handler);
}

/** Compat: resolve no próximo push recebido em foreground. */
export const onMessageListener = (): Promise<any> => {
  return new Promise((resolve) => {
    if (!("serviceWorker" in navigator)) { resolve(null); return; }
    const off = onForegroundPush((payload) => {
      off();
      resolve(payload);
    });
  });
};
