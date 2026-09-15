import { debugLog } from "./logger";
import { TRPCError } from "@trpc/server";
import { ENV } from "./env";
import { sendPushNotification } from "../firebaseAdmin";
import { getDb } from "../db";
import { fcmTokens } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export type NotificationPayload = {
  title: string;
  content: string;
  icon?: string;
  badge?: string;
  url?: string;
};

const TITLE_MAX_LENGTH = 1200;
const CONTENT_MAX_LENGTH = 20000;

const trimValue = (value: string): string => value.trim();
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const buildEndpointUrl = (baseUrl: string): string => {
  const normalizedBase = baseUrl.endsWith("/")
    ? baseUrl
    : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};

const validatePayload = (input: NotificationPayload): NotificationPayload => {
  if (!isNonEmptyString(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required.",
    });
  }
  if (!isNonEmptyString(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required.",
    });
  }

  const title = trimValue(input.title);
  const content = trimValue(input.content);

  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`,
    });
  }

  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`,
    });
  }

  return { title, content };
};

/**
 * Dispatches a project-owner notification through the System Notification Service.
 * Returns `true` if the request was accepted, `false` when the upstream service
 * cannot be reached (callers can fall back to email/slack). Validation errors
 * bubble up as TRPC errors so callers can fix the payload.
 */
export async function notifyOwner(
  payload: NotificationPayload
): Promise<boolean> {
  const { title, content } = validatePayload(payload);

  if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
    console.warn("[Notification] Notification service is not configured (missing FORGE_API_URL/KEY). External notifications will be skipped.");
    return false;
  }

  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1",
      },
      body: JSON.stringify({ title, content }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${
          detail ? `: ${detail}` : ""
        }`
      );
      return false;
    }

    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

/**
 * Sends a notification to a specific user via FCM Push Notifications and also
 * sends it to the developer/owner via notifyOwner for visibility.
 */
export async function notifyUser(
  userId: number,
  payload: NotificationPayload
): Promise<boolean> {
  const { title, content } = validatePayload(payload);

  // Send push notification via FCM to the user
  try {
    const db = await getDb();
    if (!db) {
      console.warn("[Notification] Database not available for notifyUser");
    } else {
      const tokens = await db.select().from(fcmTokens).where(eq(fcmTokens.userId, userId));
      if (tokens.length === 0) {
        debugLog(`[Push] No FCM tokens registered for userId ${userId}`);
      } else {
        let sentCount = 0;
        for (const device of tokens) {
          const res = await sendPushNotification(device.token, title, content, undefined, {
            icon: payload.icon,
            badge: payload.badge,
            url: payload.url,
          });
          if (res.success) sentCount++;
          // RN-004: subscrição/token morto (410/404 VAPID ou token não registrado FCM) → descartar
          else if (res.gone) {
            try {
              await db.delete(fcmTokens).where(eq(fcmTokens.token, device.token));
              debugLog(`[Push] Subscrição morta removida (device ${device.id}) do userId ${userId}`);
            } catch { /* cleanup é best-effort */ }
          }
        }
        debugLog(`[Push] Sent ${sentCount} notifications to userId ${userId}`);
      }
    }
  } catch (error) {
    console.error(`[Push] Error fetching tokens or sending notification to userId ${userId}:`, error);
  }

  // Also notify developer/owner as fallback/system log
  try {
    await notifyOwner({ title, content });
  } catch (error) {
    console.error("[Notification] Error calling notifyOwner inside notifyUser:", error);
  }

  return true;
}

