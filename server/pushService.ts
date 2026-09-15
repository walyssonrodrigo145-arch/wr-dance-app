// ─── Web Push VAPID (PRD_PUSH_VAPID_001) ─────────────────────────────────────
// Envio via Web Push nativo (RFC 8292) com a lib web-push. Substitui o transporte
// FCM para subscrições novas (JSON {endpoint, keys}). Push é best-effort: falhas
// NUNCA propagam para a operação de negócio (RN-003).
import webpush from "web-push";
import { ENV } from "./_core/env";
import { debugLog } from "./_core/logger";

export type PushSendResult = { success: boolean; error?: string; gone?: boolean };

/** Detecta se o token armazenado é um JSON de subscrição WebPush (VAPID). */
export function isVapidSubscription(token: string): boolean {
  const t = (token || "").trim();
  return t.startsWith("{") && t.includes('"endpoint"');
}

/** Valida e faz parse da subscrição. Retorna null se inválida. */
export function parseSubscription(token: string): webpush.PushSubscription | null {
  try {
    const sub = JSON.parse(token) as webpush.PushSubscription;
    if (!sub || typeof sub.endpoint !== "string" || !sub.endpoint.startsWith("https://")) return null;
    if (!sub.keys?.p256dh || !sub.keys?.auth) return null;
    return sub;
  } catch {
    return null;
  }
}

/** RN-002: payload ≤ 4 kB — trunca textos longos. */
export function truncateText(text: string, max = 300): string {
  if (!text) return "";
  return text.length <= max ? text : text.slice(0, max - 1) + "…";
}

/** Monta o payload do push (paridade visual com o FCM atual). */
export function buildPushPayload(
  title: string,
  body: string,
  data?: Record<string, string>,
  opts?: { icon?: string; badge?: string; url?: string },
) {
  return {
    notification: {
      title: truncateText(title, 120),
      body: truncateText(body),
      icon: opts?.icon || "https://wrmusicpro.com.br/icon-192.png",
      badge: opts?.badge || "https://wrmusicpro.com.br/icon-badge.png",
      vibrate: [200, 100, 200],
      requireInteraction: true,
      actions: [{ action: "open", title: "Abrir App" }],
    },
    data: {
      title: truncateText(title, 120),
      body: truncateText(body),
      url: opts?.url || "/",
      ...(data || {}),
    },
  };
}

let vapidConfigured = !!ENV.vapidPublicKey && !!ENV.vapidPrivateKey;
export function isVapidConfigured(): boolean {
  return vapidConfigured;
}

export async function sendVapidNotification(
  token: string,
  title: string,
  body: string,
  data?: Record<string, string>,
  opts?: { icon?: string; badge?: string; url?: string },
): Promise<PushSendResult> {
  if (!vapidConfigured) {
    debugLog("[VAPID] Não configurado — faltam VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY.");
    return { success: false, error: "NOT_CONFIGURED" };
  }
  const subscription = parseSubscription(token);
  if (!subscription) {
    return { success: false, error: "INVALID_SUBSCRIPTION", gone: true };
  }
  try {
    await webpush.sendNotification(
      subscription,
      JSON.stringify(buildPushPayload(title, body, data, opts)),
      {
        vapidDetails: { subject: ENV.vapidSubject, publicKey: ENV.vapidPublicKey, privateKey: ENV.vapidPrivateKey },
        TTL: 24 * 60 * 60, // RN: aviso não urgente — 24h de janela no push service
        urgency: "high",
      },
    );
    return { success: true };
  } catch (error: any) {
    const statusCode = error?.statusCode;
    if (statusCode === 404 || statusCode === 410) {
      // RN-004: subscrição morta — descartar no 1º sinal
      return { success: false, error: `GONE_${statusCode}`, gone: true };
    }
    const detail = error?.message || String(error);
    console.warn(`[VAPID] Falha no envio (status ${statusCode ?? "?"}):`, detail);
    return { success: false, error: detail };
  }
}
