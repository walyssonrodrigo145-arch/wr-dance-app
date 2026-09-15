import { Express, Request, Response } from "express";
import axios from "axios";
import { ENV } from "./env";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import * as db from "../db";
import crypto from "crypto";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

function getRedirectUri(req: Request): string {
  const rawHost = (req.headers["x-forwarded-host"] as string) || req.headers.host || "";
  const host = rawHost.split(",")[0].trim() || (ENV.appUrl ? new URL(ENV.appUrl).host : "wrmusicpro.com.br");
  const proto = (req.headers["x-forwarded-proto"] as string) || (req.secure ? "https" : "http");
  const finalProto = host.includes("wrmusicpro.com.br") || ENV.isProduction ? "https" : proto;
  return `${finalProto}://${host}/api/auth/google/callback`;
}

export function registerGoogleAuthRoutes(app: Express) {
  // 1. Redirecionar para o Google
  app.get("/api/auth/google", (req: Request, res: Response) => {
    if (!ENV.googleClientId) {
      return res.status(500).json({ error: "Google Client ID não configurado." });
    }

    const redirectUri = getRedirectUri(req);
    const scope = ["openid", "email", "profile"].join(" ");
    
    const params = new URLSearchParams({
      client_id: ENV.googleClientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: scope,
      access_type: "offline",
      prompt: "select_account",
    });

    res.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`);
  });

  // 2. Callback do Google
  app.get("/api/auth/google/callback", async (req: Request, res: Response) => {
    const { code } = req.query;

    if (!code || typeof code !== "string") {
      return res.status(400).json({ error: "Código de autorização não fornecido." });
    }

    try {
      const redirectUri = getRedirectUri(req);

      // Trocar código por token
      const tokenResponse = await axios.post(GOOGLE_TOKEN_URL, {
        code,
        client_id: ENV.googleClientId,
        client_secret: ENV.googleClientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      });

      const { access_token } = tokenResponse.data;

      // Obter info do usuário
      const userResponse = await axios.get(GOOGLE_USERINFO_URL, {
        headers: { Authorization: `Bearer ${access_token}` },
      });

      const googleUser = userResponse.data; // { sub, name, email, picture, email_verified }

      if (!googleUser.email) {
        return res.status(400).json({ error: "E-mail não retornado pelo Google." });
      }

      // Upsert do usuário no banco local
      // Usamos o 'sub' do Google como openId único
      const openId = `google_${googleUser.sub}`;
      
      const dbModule = await import('../db');
      const drizzle = await dbModule.getDb();
      let finalOpenId = openId;
      
      if (drizzle) {
        const { users, students } = await import('../../drizzle/schema');
        const { ilike } = await import('drizzle-orm');
        
        // 1. Verificar se já existe um usuário com esse e-mail (ex: criado via Auth local)
        const [existingUser] = await drizzle.select().from(users).where(ilike(users.email, googleUser.email)).limit(1);
        
        if (existingUser) {
           finalOpenId = existingUser.openId; // Mantém o openId original do usuário
           await db.upsertUser({
             openId: finalOpenId,
             name: existingUser.name || googleUser.name,
             email: googleUser.email,
             loginMethod: "google",
             isEmailVerified: true,
             lastSignedIn: new Date(),
           });
        } else {
           // 2. Se não tem usuário, ver se tem um aluno com esse e-mail
           const [existingStudent] = await drizzle.select().from(students).where(ilike(students.email, googleUser.email)).limit(1);
           
           if (existingStudent) {
              await db.upsertUser({
                openId: finalOpenId,
                name: existingStudent.name || googleUser.name,
                email: googleUser.email,
                loginMethod: "google",
                isEmailVerified: true,
                role: "aluno",
                organizationId: existingStudent.organizationId || undefined,
                studentId: existingStudent.id,
                lastSignedIn: new Date(),
              });
           } else {
              // 3. Usuário totalmente novo
              await db.upsertUser({
                openId: finalOpenId,
                name: googleUser.name,
                email: googleUser.email,
                loginMethod: "google",
                isEmailVerified: true,
                lastSignedIn: new Date(),
              });
           }
        }
      } else {
         // Fallback se não der para usar drizzle direto
         await db.upsertUser({
           openId: finalOpenId,
           name: googleUser.name,
           email: googleUser.email,
           loginMethod: "google",
           isEmailVerified: true,
           lastSignedIn: new Date(),
         });
      }

      // Criar sessão
      const sessionToken = await sdk.createSessionToken(finalOpenId, {
        name: googleUser.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      // Redirecionar para o portal correto de acordo com o role do usuário
      let redirectPath = "/dashboard";
      if (drizzle) {
        const { users } = await import('../../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        const [dbUser] = await drizzle.select({ role: users.role }).from(users).where(eq(users.openId, finalOpenId)).limit(1);
        if (dbUser?.role === 'aluno') {
          redirectPath = "/aluno";
        }
      }
      return res.redirect(302, redirectPath);
    } catch (error: any) {
      // Log detalhado incluindo resposta da API do Google (erro 400)
      const googleErrData = error?.response?.data;
      const errorMessage = error.message || "Erro desconhecido";
      
      console.error("[Google Auth] Error:", errorMessage);
      if (googleErrData) {
        console.error("[Google Auth] Google API Error:", JSON.stringify(googleErrData));
      }

      const dbErr = error.cause || error.driverError;
      if (dbErr) {
        console.error("[Google Auth] DB Error Detail:", {
          code: dbErr.code,
          detail: dbErr.detail,
          table: dbErr.table,
          constraint: dbErr.constraint,
        });
      }

      const errorMsg = encodeURIComponent("Falha ao autenticar com Google. Verifique suas credenciais e tente novamente.");
      return res.redirect(302, `/login?error=${errorMsg}`);
    }

  });
}
