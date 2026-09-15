import { Request, Response, NextFunction } from "express";
import { COOKIE_NAME } from "../../shared/const";
import { getDb } from "../db";
import { analyticsSecurityLogs } from "../../drizzle/schema";

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

export async function logSecurityEvent(data: {
  ip: string;
  route: string;
  method: string;
  statusCode?: number;
  eventCategory: string;
  severity?: string;
  userAgent?: string;
  referer?: string;
  userId?: number;
  organizationId?: number;
  details?: string;
}) {
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(analyticsSecurityLogs).values({
      ip: (data.ip || "127.0.0.1").slice(0, 45),
      route: data.route || "/",
      method: (data.method || "GET").toUpperCase(),
      statusCode: data.statusCode || 200,
      eventCategory: data.eventCategory,
      severity: data.severity || "info",
      userAgent: data.userAgent ? data.userAgent.slice(0, 500) : null,
      referer: data.referer ? data.referer.slice(0, 500) : null,
      userId: data.userId || null,
      organizationId: data.organizationId || null,
      details: data.details || null,
    });
  } catch (err) {
    console.error("[SecurityAudit] Erro ao gravar log de segurança:", err);
  }
}

const SUSPICIOUS_PATTERNS = [
  /\.env/i,
  /wp-config/i,
  /wp-admin/i,
  /wp-login/i,
  /phpmyadmin/i,
  /actuator/i,
  /\.git/i,
  /select\s+.*from/i,
  /union\s+select/i,
  /<script/i,
  /eval\(/i,
  /etc\/passwd/i,
  /cmd\.exe/i,
  /powershell/i,
  /cgi-bin/i,
  /\.aws/i,
  /dump/i
];

export function detectAttackCategory(path: string): { category: string; severity: string; isAttack: boolean } {
  const p = path || "";
  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(p)) {
      return { category: "bot_scanner", severity: "high", isAttack: true };
    }
  }
  return { category: "access", severity: "info", isAttack: false };
}

/**
 * Filtro de Rate Limiting (Anti-DDoS / Brute Force)
 */
export const createRateLimiter = (
  windowMs: number,
  max: number,
  message: string,
  skipRoutes: string[] = []
) => {
  const store: Record<string, RateLimitEntry> = {};

  setInterval(() => {
    const now = Date.now();
    for (const key in store) {
      if (store[key].resetTime <= now) {
        delete store[key];
      }
    }
  }, windowMs).unref();

  return (req: Request, res: Response, next: NextFunction) => {
    if (skipRoutes.length > 0) {
      const path = req.path || "";
      if (skipRoutes.some((r) => path.includes(r))) {
        return next();
      }
    }

    const sessionId =
      (req.cookies && req.cookies[COOKIE_NAME]) ||
      req.headers["authorization"] ||
      null;

    const ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.ip ||
      "unknown";

    const key = sessionId ? `sess_${sessionId}_${ip}` : `ip_${ip}`;
    const now = Date.now();

    if (!store[key] || now > store[key].resetTime) {
      store[key] = { count: 1, resetTime: now + windowMs };
      return next();
    }

    store[key].count++;

    if (store[key].count > max) {
      const retryAfter = Math.ceil((store[key].resetTime - now) / 1000);

      res.setHeader("Retry-After", String(retryAfter));
      res.setHeader("X-RateLimit-Limit", String(max));
      res.setHeader("X-RateLimit-Remaining", "0");
      res.setHeader("X-RateLimit-Reset", String(Math.ceil(store[key].resetTime / 1000)));

      logSecurityEvent({
        ip,
        route: req.originalUrl || req.path || "/",
        method: req.method,
        statusCode: 429,
        eventCategory: "blocked_rate_limit",
        severity: "medium",
        userAgent: req.headers["user-agent"] as string,
        referer: req.headers["referer"] as string,
        details: `Bloqueado por exceder o limite de ${max} requisições em ${windowMs / 1000}s.`,
      });

      return res.status(429).json({
        error: {
          json: {
            message: message,
            code: -32005,
            data: {
              code: "TOO_MANY_REQUESTS",
              httpStatus: 429,
            },
          },
        },
      });
    }

    next();
  };
};

export const loginLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutos
  10, // limite de 10 tentativas
  "Muitas tentativas de login. Por favor, tente novamente em 15 minutos."
);

export const registerLimiter = createRateLimiter(
  60 * 60 * 1000, // 1 hora
  5, // limite de 5 registros por IP
  "Limite de criação de contas excedido. Tente novamente mais tarde."
);
