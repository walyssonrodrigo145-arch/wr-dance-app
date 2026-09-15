import { debugLog } from "./_core/logger";
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import * as dotenv from 'dotenv';
import { isVapidSubscription, sendVapidNotification } from './pushService';
dotenv.config();

const privateKey = process.env.FIREBASE_PRIVATE_KEY
  ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
  : undefined;

if (!getApps().length) {
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && privateKey) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey,
      }),
    });
    debugLog('Firebase Admin inicializado com sucesso.');
  } else {
    debugLog('Firebase Admin não inicializado. Faltam credenciais no .env.');
  }
}

export const messaging = getApps().length ? getMessaging() : null;

export type PushSendResult = { success: boolean; error?: string; gone?: boolean };

/**
 * Dispatcher de push (PRD_PUSH_VAPID_001):
 * - JSON de subscrição WebPush → VAPID (web-push, RF-002);
 * - token legado FCM → caminho Firebase (coexistência, RF-005).
 * Push é best-effort (RN-003): nunca lança; `gone` sinaliza subscrição/token morto
 * para o chamador remover da tabela (RN-004).
 */
export async function sendPushNotification(
  token: string,
  title: string,
  body: string,
  data?: Record<string, string>,
  opts?: { icon?: string; badge?: string; url?: string }
): Promise<PushSendResult> {
  // 1) Subscrição VAPID (JSON {endpoint, keys}) — caminho primário
  if (isVapidSubscription(token)) {
    return sendVapidNotification(token, title, body, data, opts);
  }

  // 2) Token legado FCM — coexistência até o dispositivo migrar
  if (!messaging) {
    debugLog('Firebase messaging não está configurado (legado).');
    return { success: false, error: 'NOT_CONFIGURED' };
  }

  const targetToken = token.trim();

  try {
    const response = await messaging.send({
      token: targetToken,
      notification: {
        title,
        body,
      },
      android: {
        priority: 'high',
        notification: {
          title,
          body,
          icon: opts?.icon || 'https://wrmusicpro.com.br/icon-192.png',
          sound: 'default',
          clickAction: opts?.url || 'https://wrmusicpro.com.br/',
        },
      },
      apns: {
        payload: {
          aps: {
            alert: {
              title,
              body,
            },
            sound: 'default',
            badge: 1,
          },
        },
      },
      webpush: {
        headers: {
          Urgency: 'high',
        },
        notification: {
          title,
          body,
          icon: opts?.icon || 'https://wrmusicpro.com.br/icon-192.png',
          badge: opts?.badge || 'https://wrmusicpro.com.br/icon-badge.png',
          vibrate: [200, 100, 200],
          requireInteraction: true,
          actions: [
            { action: 'open', title: 'Abrir App' }
          ],
        },
        fcmOptions: {
          link: opts?.url || 'https://wrmusicpro.com.br/'
        }
      },
      data: {
        title,
        body,
        url: opts?.url || '/',
        ...data,
      },
    });
    debugLog('Notificação push enviada para o dispositivo com sucesso:', response);
    return { success: true };
  } catch (error: any) {
    const errCode = error?.code || error?.message || 'UNKNOWN_ERROR';
    console.error('Erro ao enviar notificação push:', errCode);
    const isDeadToken =
      errCode.includes('registration-token-not-registered') ||
      errCode.includes('invalid-registration-token');
    return { success: false, error: errCode, gone: isDeadToken };
  }
}
