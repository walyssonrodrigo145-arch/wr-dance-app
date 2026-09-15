import { debugLog } from "../_core/logger";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "../_core/cookies";
import { systemRouter } from "../_core/systemRouter";
import { fcmRouter } from "../fcmRouter";
import { publicProcedure, protectedProcedure, professorProcedure, studentProcedure, router } from "../_core/trpc";
import { slotAdvanceRouter } from "../slotAdvanceRouter";
import {
  getDashboardStats,
  getMonthlyStats,
  getStudentsWithInstrument,
  getRecentLessons,
  getInstrumentsWithCount,
  getLessonsByDayOfWeek,
  getDb,
  getSettingsByUserId,
  upsertSettings,
  updateUserProfile,
  getExperimentalStats,
} from "../db";
import { organizations, users, students, lessons, instruments, reminders, reminderTemplates, paymentDues, asaasCustomers, settings, studentGoals, studentTimeline, studentFiles, announcements, chatMessages, rescheduleRequests, studentEvolution, aiConversations, aiMessages, aiDocuments, expenses, dailyStudyPlans, notifications, professores, professorPayments, attendanceTokens, attendanceLogs, contracts, fileComments, studioRooms, schoolIntegrations, contractTemplates, contractEvents, crmLeads, crmGoals, crmActivities, fiscalCompanies, fiscalInvoices, fiscalServices, fiscalJobs, fiscalLogs } from "../../drizzle/schema";
import { eq, desc, sql, and, gte, lt, lte, asc, ne, or, inArray, aliasedTable, ilike, isNull } from "drizzle-orm";
import { notifyOwner, notifyUser } from "../_core/notification";
import { handleDbError } from "../utils/error_handler";
import { isValidCNPJ } from "./helpers";
import { TRPCError } from "@trpc/server";

import crypto from "crypto";
import { createAsaasCustomer, createAsaasCharge, deleteAsaasCharge, getAsaasPixQrCode } from "../utils/asaas";
import { buildUserContext } from "../utils/aiContext";
import { getSystemPrompt } from "../utils/aiPrompts";
import { callGemini, genAI } from "../utils/gemini";
import { BillingEngine } from "../services/BillingEngine";
import { sendWhatsAppMessage, startWhatsAppSession, getWhatsAppSessionStatus, logoutWhatsAppSession } from "../utils/whatsapp";
import { nanoid } from "nanoid";
import { sdk } from "../_core/sdk";
import { sendVerificationEmail, sendSimpleEmail } from "../_core/email";
import { ENV } from "../_core/env";
import { storagePut } from "../storage";
import { superAdminRouter } from "../superAdminRouter";
import { pairingActiveSessions } from "../automationJob";
import { checkFileMagicBytes } from "../utils/fileSecurity";
import { reportEngineRouter } from "../reportEngineRouter";
import { marketingRouter } from "../marketingRouter";
import { analyticsRouter } from "../analyticsRouter";
import { crmRouter } from "../crmRouter";
import { studioRoomsRouter } from "../studioRoomsRouter";
import { enrollmentRouter } from "../enrollmentRouter";
import { advancedAiRouter } from "../advancedAiRouter";
import { chatbotFlowRouter } from "../chatbotFlowRouter";
import { schoolAiRouter } from "../schoolAiRouter";
import { fiscalRouter } from "../fiscalRouter";
import { FiscalService } from "../services/fiscal/FiscalService";
import { loginAttempts, safeEqualStr, isReservedSuperAdminEmail, getOrgPlanLimits, syncOrgAsaasSubscription, reconcileOrgAsaasCharges, runCreateAssinafyContract } from "./helpers";
export const plataformaRouters = {
  settings: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      const orgId = ctx.user.organizationId!;
      return getSettingsByUserId(orgId, ctx.user.id);
    }),

    updateProfile: protectedProcedure.input(z.object({
      name: z.string().min(2).optional(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      bio: z.string().optional(),
      pixKey: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId!;
      const { name, email, phone, bio, pixKey } = input;
      const userFields = { name, email };
      if (userFields.name || userFields.email) {
        await updateUserProfile(orgId, ctx.user.id, userFields);
      }
      await upsertSettings(orgId, ctx.user.id, { phone, bio, pixKey });
      return { success: true };
    }),

    updateSchool: protectedProcedure.input(z.object({
      schoolName: z.string().optional(),
      schoolCnpj: z.string().optional(),
      schoolAddress: z.string().optional(),
      schoolCity: z.string().optional(),
      schoolPhone: z.string().optional(),
      schoolEmail: z.string().email("E-mail inválido").optional().or(z.literal("")).transform(v => v === "" ? undefined : v),
      schoolWebsite: z.string().optional(),
      schoolDescription: z.string().optional(),
      showSchoolName: z.boolean().optional(),
      logoUrl: z.string().optional().nullable(),
      schoolHours: z.string().optional(),
      lessonDuration: z.number().optional(),
      dueDaysForecast: z.string().optional(),
      attendanceCheckinMoment: z.enum(["inicio", "fim", "livre"]).optional(),
      attendanceToleranceMinutes: z.number().min(0).max(180).optional(),
    })).mutation(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId!;
      // AUDIT-04 FIX: rejeita CNPJ com dígitos verificadores inválidos (evita
      // rejeição posterior na NFS-e/contratos por dados fiscais incorretos).
      if (input.schoolCnpj && !isValidCNPJ(input.schoolCnpj)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "CNPJ inválido. Verifique os dígitos e tente novamente." });
      }
      await upsertSettings(orgId, ctx.user.id, {
        ...input,
        showSchoolName: input.showSchoolName !== undefined ? (input.showSchoolName ? 1 : 0) : undefined,
      });
      const db = await getDb();
      if (db && orgId) {
        // ─── FIX: espelha TODOS os dados relevantes da escola na tabela organizations
        // para que qualquer admin que gere contratos encontre os dados mesmo
        // que o settings lookup retorne um registro diferente.
        const updateOrgObj: Record<string, any> = { updatedAt: new Date() };
        if (input.logoUrl !== undefined) updateOrgObj.logo = input.logoUrl;
        if (input.schoolName  !== undefined && input.schoolName.trim()  !== "") updateOrgObj.name        = input.schoolName;
        if (input.schoolPhone !== undefined && input.schoolPhone.trim() !== "") updateOrgObj.phone       = input.schoolPhone;
        if (input.schoolEmail !== undefined && input.schoolEmail.trim() !== "") updateOrgObj.email       = input.schoolEmail;
        if (input.schoolCnpj  !== undefined && input.schoolCnpj.trim()  !== "") updateOrgObj.cnpj       = input.schoolCnpj;
        if (input.schoolAddress !== undefined && input.schoolAddress.trim() !== "") updateOrgObj.address = input.schoolAddress;
        if (input.schoolCity  !== undefined && input.schoolCity.trim()  !== "") updateOrgObj.city       = input.schoolCity;
        await db.update(organizations).set(updateOrgObj).where(eq(organizations.id, orgId));
      }
      return { success: true };
    }),

    updateNotifications: protectedProcedure.input(z.object({
      notifyLessonReminder: z.boolean().optional(),
      notifyPaymentDue: z.boolean().optional(),
      notifyStudentAbsence: z.boolean().optional(),
      notifyNewStudent: z.boolean().optional(),
      notifyWeeklyReport: z.boolean().optional(),
      autoAdvanceSlotsEnabled: z.boolean().optional(),
    })).mutation(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId!;
      await upsertSettings(orgId, ctx.user.id, {
        notifyLessonReminder: input.notifyLessonReminder !== undefined ? (input.notifyLessonReminder ? 1 : 0) : undefined,
        notifyPaymentDue: input.notifyPaymentDue !== undefined ? (input.notifyPaymentDue ? 1 : 0) : undefined,
        notifyStudentAbsence: input.notifyStudentAbsence !== undefined ? (input.notifyStudentAbsence ? 1 : 0) : undefined,
        notifyNewStudent: input.notifyNewStudent !== undefined ? (input.notifyNewStudent ? 1 : 0) : undefined,
        notifyWeeklyReport: input.notifyWeeklyReport !== undefined ? (input.notifyWeeklyReport ? 1 : 0) : undefined,
        autoAdvanceSlotsEnabled: input.autoAdvanceSlotsEnabled !== undefined ? (input.autoAdvanceSlotsEnabled ? 1 : 0) : undefined,
      });
      return { success: true };
    }),

    toggleAutoAdvanceSlots: protectedProcedure.input(z.object({
      enabled: z.boolean(),
    })).mutation(async ({ ctx, input }) => {
      await upsertSettings(ctx.user.organizationId!, ctx.user.id, {
        autoAdvanceSlotsEnabled: input.enabled ? 1 : 0,
      });
      return { success: true, enabled: input.enabled };
    }),

    updateAutoAdvanceTemplate: protectedProcedure.input(z.object({
      template: z.string(),
    })).mutation(async ({ ctx, input }) => {
      await upsertSettings(ctx.user.organizationId!, ctx.user.id, {
        autoAdvanceWhatsAppTemplate: input.template,
      });
      return { success: true };
    }),

    updateIA: protectedProcedure.input(z.object({
      aiProvider: z.string().optional(),
      geminiApiKey: z.string().optional(),
      geminiModel: z.string().optional(),
      groqApiKey: z.string().optional(),
      groqModel: z.string().optional(),
      opencodeApiKey: z.string().optional(),
      opencodeModel: z.string().optional(),
      opencodeApiUrl: z.string().optional(),
      conversationalMode: z.boolean().optional(),
      attendancePersonaName: z.string().max(60).optional(),
      attendanceTone: z.enum(["amigavel", "formal", "direto"]).optional(),
    })).mutation(async ({ ctx, input }) => {
      await upsertSettings(ctx.user.organizationId!, ctx.user.id, {
        aiProvider: input.aiProvider,
        geminiApiKey: input.geminiApiKey,
        geminiModel: input.geminiModel,
        groqApiKey: input.groqApiKey,
        groqModel: input.groqModel,
        opencodeApiKey: (input as any).opencodeApiKey,
        opencodeModel: (input as any).opencodeModel,
        opencodeApiUrl: (input as any).opencodeApiUrl,
        conversationalMode: input.conversationalMode !== undefined ? (input.conversationalMode ? 1 : 0) : undefined,
        attendancePersonaName: input.attendancePersonaName,
        attendanceTone: input.attendanceTone,
      } as any);
      return { success: true };
    }),

    testAiConnection: protectedProcedure.input(z.object({
      aiProvider: z.enum(["gemini", "groq", "opencode"]),
      apiKey: z.string().max(1000).optional(),
      model: z.string().max(255).optional(),
      apiUrl: z.string().max(500).optional(),
    })).mutation(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId!;
      // Resolve key: usa input.apiKey se informado, senão busca do DB (decrypt)
      let apiKeyToTest = input.apiKey?.trim() || "";
      let modelToTest = input.model?.trim() || "";
      let apiUrlToTest = input.apiUrl?.trim() || "";
      if (!apiKeyToTest) {
        const s = await getSettingsByUserId(orgId, ctx.user.id);
        if (s) {
          if (input.aiProvider === "gemini") apiKeyToTest = (s.geminiApiKey as string) || "";
          else if (input.aiProvider === "groq") apiKeyToTest = (s.groqApiKey as string) || "";
          else if (input.aiProvider === "opencode") {
            apiKeyToTest = (s as any).opencodeApiKey || "";
            if (!modelToTest) modelToTest = (s as any).opencodeModel || "";
            if (!apiUrlToTest) apiUrlToTest = (s as any).opencodeApiUrl || "";
          }
        }
      }
      if (!apiKeyToTest) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Informe a chave da API antes de testar." });
      }
      // Helper: fetch com timeout 10s sem vazar chave nos logs
      const fetchWithTimeout = async (url: string, opts: any, ms = 10000) => {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), ms);
        try {
          // Valida URL
          try { new URL(url); } catch { throw new TRPCError({ code: "BAD_REQUEST", message: "URL da API inválida." }); }
          const res = await fetch(url, { ...opts, signal: controller.signal });
          return res;
        } finally { clearTimeout(t); }
      };
      const maskKey = (k: string) => k.length <= 8 ? "****" : k.slice(0,4) + "****" + k.slice(-4);
      console.warn(`[testAiConnection] provider=${input.aiProvider} key=${maskKey(apiKeyToTest)} model=${modelToTest || "(auto)"} url=${apiUrlToTest || "(default)"}`);

      if (input.aiProvider === "gemini") {
        // Testa via list models endpoint
        const modelParam = modelToTest || "gemini-3.6-flash";
        // tenta 3.6, fallback 1.5 se 404
        const testModel = modelParam.includes("2.0") ? "gemini-3.6-flash" : modelParam;
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKeyToTest)}`;
          const res = await fetchWithTimeout(url, { method: "GET" });
          if (res.status === 401 || res.status === 403) {
            return { valid: false, provider: "gemini", error: "Chave Gemini inválida ou sem permissão (401/403). Verifique no Google AI Studio." } as const;
          }
          if (!res.ok) {
            const txt = await res.text().catch(() => "");
            if (txt.toLowerCase().includes("is no longer available") || txt.toLowerCase().includes("not found")) {
              return { valid: false, provider: "gemini", error: `Modelo ${testModel} descontinuado. Use gemini-3.6-flash em Configurações > IA.` } as const;
            }
            return { valid: false, provider: "gemini", error: `Erro Gemini ${res.status}: ${txt.slice(0,300)}` } as const;
          }
          return { valid: true, provider: "gemini", modelUsed: testModel } as const;
        } catch (e: any) {
          if (e.name === "AbortError") return { valid: false, provider: "gemini", error: "Tempo esgotado (10s) ao validar Gemini. Tente novamente." } as const;
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e.message || "Falha ao testar Gemini" });
        }
      }

      if (input.aiProvider === "groq") {
        try {
          const url = "https://api.groq.com/openai/v1/models";
          const res = await fetchWithTimeout(url, { method: "GET", headers: { Authorization: `Bearer ${apiKeyToTest}` } });
          if (res.status === 401 || res.status === 403) {
            return { valid: false, provider: "groq", error: "Chave Groq inválida (401). Gere em console.groq.com/keys" } as const;
          }
          if (!res.ok) {
            const txt = await res.text().catch(() => "");
            return { valid: false, provider: "groq", error: `Erro Groq ${res.status}: ${txt.slice(0,300)}` } as const;
          }
          return { valid: true, provider: "groq" } as const;
        } catch (e: any) {
          if (e.name === "AbortError") return { valid: false, provider: "groq", error: "Timeout 10s Groq" } as const;
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e.message || "Falha Groq" });
        }
      }

      // opencode — lista modelos (Zen pay-as-you-go + Go assinatura) e filtra
      const primaryUrl = apiUrlToTest || (process.env.OPENCODE_API_URL as string) || "https://opencode.ai/zen/v1/models";
      const fallbackUrls = [
        primaryUrl,
        "https://opencode.ai/zen/v1/models",
        "https://opencode.ai/zen/go/v1/models",
        "https://api.opencode.ai/v1/models",
        "https://opencode.ai/api/models",
      ].filter((u, i, a) => a.indexOf(u) === i);
      let lastError = "";
      for (const url of fallbackUrls) {
        try {
          const res = await fetchWithTimeout(url, { method: "GET", headers: { Authorization: `Bearer ${apiKeyToTest}`, "Content-Type": "application/json" } });
          if (res.status === 401 || res.status === 403) {
            return { valid: false, provider: "opencode", error: "Chave OpenCode inválida ou expirada (401). Verifique em opencode.ai" } as const;
          }
          if (res.status === 404) {
            lastError = `404 ${url}`;
            continue; // tenta próximo fallback
          }
          if (!res.ok) {
            const txt = await res.text().catch(() => "");
            lastError = `Erro OpenCode ${res.status}: ${txt.slice(0,300)}`;
            continue;
          }
          const data: any = await res.json().catch(() => null);
          // Debug: log the raw response structure
          console.warn(`[testAiConnection] OpenCode raw response keys:`, Object.keys(data || {}), `data keys:`, data?.data ? Object.keys(data.data[0] || {}) : 'none');
          
          // Try multiple common response formats
          const rawList: any[] = Array.isArray(data?.data) ? data.data 
            : Array.isArray(data?.models) ? data.models 
            : Array.isArray(data) ? data 
            : Array.isArray(data?.result) ? data.result
            : Array.isArray(data?.items) ? data.items
            : [];
          
          console.warn(`[testAiConnection] OpenCode rawList length:`, rawList.length, `first item:`, rawList[0] ? JSON.stringify(rawList[0]).slice(0, 500) : 'empty');

          // ── Gateway Go (assinatura): expõe SOMENTE os modelos baratos aprovados ──
          if (url.includes("/go/")) {
            const GO_APPROVED = ["glm-5.3-flash", "deepseek-v4-flash"];
            const goModels = Array.from(new Set(
              rawList
                .map((m: any) => String(m.id || m.name || m.model || m.slug || ""))
                .filter(Boolean)
                .map((id: string) => id.replace(/^opencode(-go)?\//, ""))
                .filter((bare: string) => GO_APPROVED.some(a => bare === a || bare.startsWith(a)))
            )).sort().map((bare: string) => ({
              id: `opencode-go/${bare}`,
              name: bare,
              displayName: bare,
              contextLength: null as any,
              pricing: null as any,
            }));
            console.warn(`[testAiConnection] OpenCode Go aprovados:`, goModels.length, `raw:`, rawList.length);
            if (goModels.length > 0) {
              return { valid: true, provider: "opencode", gateway: "go", models: goModels, count: goModels.length } as const;
            }
            lastError = `Gateway Go sem os modelos aprovados (${GO_APPROVED.join(", ")})`;
            continue;
          }

          // More permissive free/zen detection - check multiple fields
          const isFreeZen = (m: any) => {
            const id = String(m.id || m.name || m.model || m.slug || "").toLowerCase();
            const pricing = m.pricing || m.cost || m.price || m.quota || {};
            
            // Check various free indicators
            const freeFlag = pricing.free === true 
              || pricing.isFree === true 
              || m.free === true 
              || m.zen === true
              || m.isFree === true
              || m.freeTier === true;
            
            // Zero cost indicators
            const zeroCost = (pricing.input === 0 && pricing.output === 0) 
              || (pricing.prompt === 0 && pricing.completion === 0)
              || (pricing.inputTokens === 0 && pricing.outputTokens === 0)
              || (pricing.cost === 0)
              || (pricing.price === 0);
            
            // Zen/free in ID
            const zenInId = id.includes("zen") || id.includes("free") || id.includes("trial");
            
            // Also check for "free" in name/description
            const name = String(m.name || m.displayName || m.description || "").toLowerCase();
            const freeInName = name.includes("free") || name.includes("zen") || name.includes("trial");
            
            return freeFlag || zeroCost || zenInId || freeInName;
          };
          
          const filtered = rawList.filter(isFreeZen).map((m: any) => ({
            id: String(m.id || m.name || m.model || m.slug || ""),
            name: String(m.name || m.id || m.model || m.slug || ""),
            displayName: String(m.displayName || m.name || m.id || m.slug || ""),
            contextLength: m.contextLength || m.context_length || m.maxTokens || m.max_tokens || m.maxContext || null,
            pricing: m.pricing || m.cost || m.price || null,
          })).sort((a, b) => a.id.localeCompare(b.id));
          
          console.warn(`[testAiConnection] OpenCode filtered Zen free:`, filtered.length, `raw:`, rawList.length);
          
          // Se filtro zerou mas lista original tinha itens, retorna lista original com flag para UI decidir
          if (rawList.length > 0 && filtered.length === 0) {
            // Sem zen grátis explícito, mas chave válida — retorna lista completa limitada para UI mostrar aviso
            return { valid: true, provider: "opencode", models: [], rawCount: rawList.length, error: "Chave válida, mas nenhum modelo Zen grátis encontrado para esta conta. Você pode usar modelos pagos ou informar o modelo manualmente.", modelsPreview: rawList.slice(0, 10).map((m:any)=> String(m.id||m.name||m.model)) } as any;
          }
          return { valid: true, provider: "opencode", gateway: "zen", models: filtered, count: filtered.length, allModels: rawList.map((m:any)=>({id:String(m.id||m.name||m.model), name:String(m.name||m.id||m.model)})).slice(0, 20) } as const;
        } catch (e: any) {
          if (e.name === "AbortError") {
            lastError = "Timeout 10s OpenCode";
            continue;
          }
          if (e instanceof TRPCError) throw e;
          lastError = e.message || String(e);
          continue;
        }
      }
      return { valid: false, provider: "opencode", error: lastError || "Falha ao listar modelos OpenCode. Tente novamente ou informe o modelo manualmente." } as const;
    }),

    updateTheme: protectedProcedure.input(z.object({
      theme: z.enum(['light', 'dark', 'midnight', 'purple', 'emerald', 'mono', 'grafite']),
    })).mutation(async ({ ctx, input }) => {
      await upsertSettings(ctx.user.organizationId!, ctx.user.id, { theme: input.theme });
      return { success: true };
    }),

    updateHiddenTabs: protectedProcedure.input(z.object({
      hiddenTabs: z.string(),
    })).mutation(async ({ ctx, input }) => {
      await upsertSettings(ctx.user.organizationId!, ctx.user.id, { hiddenTabs: input.hiddenTabs });
      return { success: true };
    }),

    // Cards do dashboard OCULTADOS pelo usuário (JSON array). Efetivo = permitidos \ ocultos.
    updateHiddenDashboardWidgets: protectedProcedure.input(z.object({
      widgets: z.string(),
    })).mutation(async ({ ctx, input }) => {
      await upsertSettings(ctx.user.organizationId!, ctx.user.id, { hiddenDashboardWidgets: input.widgets } as any);
      return { success: true };
    }),

    // Olhinho: mascarar valores financeiros (Dashboard + Financeiro), por usuário.
    setHideFinancialValues: protectedProcedure.input(z.object({
      hidden: z.boolean(),
    })).mutation(async ({ ctx, input }) => {
      await upsertSettings(ctx.user.organizationId!, ctx.user.id, { hideFinancialValues: input.hidden ? 1 : 0 } as any);
      return { success: true, hidden: input.hidden };
    }),

    getAutomation: protectedProcedure.query(async ({ ctx }) => {
      const s = await getSettingsByUserId(ctx.user.organizationId!, ctx.user.id);
      return {
        enabled: s?.automationEnabled === 1,
        lastRun: s?.automationLastRun ?? null,
      };
    }),

    toggleAutomation: protectedProcedure.input(z.object({
      enabled: z.boolean(),
    })).mutation(async ({ ctx, input }) => {
      await upsertSettings(ctx.user.organizationId!, ctx.user.id, {
        automationEnabled: input.enabled ? 1 : 0,
      });
      return { success: true, enabled: input.enabled };
    }),

    toggleChatbot: protectedProcedure.input(z.object({
      enabled: z.boolean(),
    })).mutation(async ({ ctx, input }) => {
      await upsertSettings(ctx.user.organizationId!, ctx.user.id, {
        chatbotEnabled: input.enabled ? 1 : 0,
      });
      return { success: true, enabled: input.enabled };
    }),

    updateWhatsAppBot: protectedProcedure.input(z.object({
      whatsappBotUrl: z.string().optional(),
      whatsappBotToken: z.string().optional(),
      whatsappAutoSend: z.boolean().optional(),
    })).mutation(async ({ ctx, input }) => {
      const urlToUse = input.whatsappBotUrl?.trim() || process.env.EVOLUTION_API_URL || "http://179.197.76.174:8080";
      const tokenToUse = input.whatsappBotToken?.trim() || process.env.EVOLUTION_API_KEY || "minha_chave_secreta_123";
      await upsertSettings(ctx.user.organizationId!, ctx.user.id, {
        whatsappBotUrl: urlToUse,
        whatsappBotToken: tokenToUse,
        whatsappAutoSend: input.whatsappAutoSend !== undefined ? (input.whatsappAutoSend ? 1 : 0) : undefined,
      });
      return { success: true };
    }),

    updateAsaasIntegration: protectedProcedure.input(z.object({
      asaasApiKey: z.string().optional(),
      asaasEnabled: z.boolean().optional(),
      paymentGateway: z.enum(["asaas", "mercadopago", "infinitepay"]).optional(),
      mpAccessToken: z.string().optional(),
      infinitepayHandle: z.string().optional(),
      infinitepayApiKey: z.string().optional(),
      infinitepayEnabled: z.boolean().optional(),
    })).mutation(async ({ ctx, input }) => {
      // RN-006: InfiniteTag chega às vezes com "$" — normaliza (sem $, minúsculas)
      let normalizedHandle: string | null | undefined;
      if (input.infinitepayHandle !== undefined) {
        const { normalizeInfinitePayHandle } = await import("../utils/infinitepay");
        normalizedHandle = normalizeInfinitePayHandle(input.infinitepayHandle);
        if (input.infinitepayHandle.trim() && !normalizedHandle) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "InfiniteTag inválida. Use apenas letras, números, ponto, hífen ou underline (sem o símbolo $).",
          });
        }
      }
      await upsertSettings(ctx.user.organizationId!, ctx.user.id, {
        asaasApiKey: input.asaasApiKey ?? null,
        asaasEnabled: input.asaasEnabled !== undefined ? (input.asaasEnabled ? 1 : 0) : undefined,
        paymentGateway: input.paymentGateway,
        mpAccessToken: input.mpAccessToken ?? null,
        infinitepayHandle: normalizedHandle,
        infinitepayApiKey: input.infinitepayApiKey ?? null, // upsertSettings criptografa (BYOK)
        infinitepayEnabled: input.infinitepayEnabled !== undefined ? (input.infinitepayEnabled ? 1 : 0) : undefined,
      });
      return { success: true };
    }),

    updateFinancialSettings: protectedProcedure.input(z.object({
      lateFeeEnabled: z.boolean().optional(),
      lateFeeType: z.enum(["fixed", "percentage"]).optional(),
      lateFeeValue: z.number().optional(),
      interestEnabled: z.boolean().optional(),
      interestType: z.enum(["daily", "monthly"]).optional(),
      interestRate: z.number().optional(),
      graceDays: z.number().optional(),
      autoUpdateInvoice: z.boolean().optional(),
      showFeeBreakdown: z.boolean().optional(),
      earlyDiscountEnabled: z.boolean().optional(),
      earlyDiscountType: z.enum(["fixed", "percentage"]).optional(),
      earlyDiscountValue: z.number().optional(),
      earlyDiscountDays: z.number().optional(),
    })).mutation(async ({ ctx, input }) => {
      await upsertSettings(ctx.user.organizationId!, ctx.user.id, {
        lateFeeEnabled: input.lateFeeEnabled !== undefined ? (input.lateFeeEnabled ? 1 : 0) : undefined,
        lateFeeType: input.lateFeeType,
        lateFeeValue: input.lateFeeValue !== undefined ? input.lateFeeValue.toFixed(2) : undefined,
        interestEnabled: input.interestEnabled !== undefined ? (input.interestEnabled ? 1 : 0) : undefined,
        interestType: input.interestType,
        interestRate: input.interestRate !== undefined ? input.interestRate.toFixed(4) : undefined,
        graceDays: input.graceDays,
        autoUpdateInvoice: input.autoUpdateInvoice !== undefined ? (input.autoUpdateInvoice ? 1 : 0) : undefined,
        showFeeBreakdown: input.showFeeBreakdown !== undefined ? (input.showFeeBreakdown ? 1 : 0) : undefined,
        earlyDiscountEnabled: input.earlyDiscountEnabled !== undefined ? (input.earlyDiscountEnabled ? 1 : 0) : undefined,
        earlyDiscountType: input.earlyDiscountType,
        earlyDiscountValue: input.earlyDiscountValue !== undefined ? input.earlyDiscountValue.toFixed(2) : undefined,
        earlyDiscountDays: input.earlyDiscountDays,
      });
      BillingEngine.clearCache();
      return { success: true };
    }),

    exportData: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const orgId = ctx.user.organizationId!;
      const isUserAdmin = ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId;

      let studentFilter = eq(students.organizationId, orgId);
      if (!isUserAdmin) {
        studentFilter = and(studentFilter, eq(students.professorId, ctx.user.id)) as any;
      }

      // Alunos
      const allStudents = await db.select({
        id: students.id,
        name: students.name,
        email: students.email,
        phone: students.phone,
        level: students.level,
        status: students.status,
        monthlyFee: students.monthlyFee,
        startDate: students.startDate,
      }).from(students).where(studentFilter).orderBy(students.name);

      let lessonFilter = eq(lessons.organizationId, orgId);
      if (!isUserAdmin) {
        lessonFilter = and(lessonFilter, eq(lessons.userId, ctx.user.id)) as any;
      }

      // Aulas
      const allLessons = await db.select({
        id: lessons.id,
        title: lessons.title,
        status: lessons.status,
        scheduledAt: lessons.scheduledAt,
        duration: lessons.duration,
        rating: lessons.rating,
        studentName: students.name,
      }).from(lessons)
        .leftJoin(students, eq(lessons.studentId, students.id))
        .where(lessonFilter)
        .orderBy(desc(lessons.scheduledAt));

      const studentsData = allStudents.map(s => [
        s.id,
        s.name ?? '',
        s.email ?? '',
        s.phone ?? '',
        s.level ?? 'Iniciante',
        s.status ?? 'ativo',
        Number(s.monthlyFee ?? 0),
        s.startDate ? new Date(s.startDate).toLocaleDateString('pt-BR') : ''
      ]);

      const lessonsData = allLessons.map(l => [
        l.id,
        l.title ?? '',
        l.studentName ?? 'N/A',
        l.status ?? 'agendada',
        l.scheduledAt ? new Date(l.scheduledAt).toLocaleDateString('pt-BR') : '',
        Number(l.duration ?? 0),
        l.rating ?? ''
      ]);

      // Build CSV strings
      const studentsCsv = [
        'ID,Nome,Email,Telefone,Nivel,Status,Mensalidade,Inicio',
        ...allStudents.map(s =>
          [s.id, `"${s.name}"`, `"${s.email ?? ''}"`, `"${s.phone ?? ''}"`,
           s.level ?? '', s.status ?? '', s.monthlyFee ?? 0,
           s.startDate ? new Date(s.startDate).toLocaleDateString('pt-BR') : ''].join(',')
        ),
      ].join('\n');

      const lessonsCsv = [
        'ID,Titulo,Aluno,Status,Data,Duracao(min),Avaliacao',
        ...allLessons.map(l =>
          [l.id, `"${l.title}"`, `"${l.studentName ?? ''}"`,
           l.status ?? '', l.scheduledAt ? new Date(l.scheduledAt).toLocaleDateString('pt-BR') : '',
           l.duration ?? 0, l.rating ?? ''].join(',')
        ),
      ].join('\n');

      return { studentsData, lessonsData, studentsCsv, lessonsCsv };
    }),
  }),

  platform: router({
    // ─── Planos públicos: busca planos ativos comerciais (> 0) para exibição dinâmica ──
    getPublicPlans: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      const { systemPlans } = await import("../../drizzle/schema");
      const plans = await db
        .select()
        .from(systemPlans)
        .where(and(
          eq(systemPlans.isActive, true),
          eq(systemPlans.showOnLanding, true),
          sql`CAST(${systemPlans.priceMonthly} AS numeric) > 0`
        ))
        .orderBy(asc(systemPlans.order), asc(systemPlans.priceMonthly));
      return plans.map(p => ({
        id: p.id,
        name: p.name,
        priceMonthly: Number(p.priceMonthly),
        priceYearly: Number(p.priceYearly),
        maxStudents: p.maxStudents,
        features: (() => { try { return JSON.parse(p.features as string); } catch { return []; } })(),
        isPopular: p.isPopular ?? false,
        order: p.order ?? 0,
        allowExtraStudents: p.allowExtraStudents ?? true,
        extraStudentPrice: Number(p.extraStudentPrice ?? 1.49),
      }));
    }),
    checkout: protectedProcedure
      .input(z.object({
        planType: z.enum(["MONTHLY", "YEARLY"])
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const orgId = ctx.user.organizationId!;
        const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
        if (!org) throw new TRPCError({ code: "NOT_FOUND", message: "Organização não encontrada" });

        const [profData] = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
        const { createAsaasCustomer, createAsaasSubscription, getAsaasSubscriptionPayments } = await import('../utils/asaas');
        
        let customerId = org.asaasCustomerId;
        if (!customerId) {
          customerId = await createAsaasCustomer({
            name: org.name || "Escola",
            email: profData?.email ?? undefined,
          });
          await db.update(organizations).set({ asaasCustomerId: customerId }).where(eq(organizations.id, orgId));
        }

        let subId = org.asaasSubscriptionId;
        if (!subId) {
          const { systemPlans } = await import("../../drizzle/schema");
          const [planInfo] = await db.select().from(systemPlans).where(eq(systemPlans.id, org.planId)).limit(1);

          const baseValue = planInfo
            ? (input.planType === "YEARLY" ? Number(planInfo.priceYearly) : Number(planInfo.priceMonthly))
            : (input.planType === "YEARLY" ? 59.90 * 10 : 59.90);

          // Cálculo de Alunos Excedentes
          const activeStudentsCountObj = await db.select({ count: sql<number>`count(*)` })
            .from(students)
            .where(and(eq(students.organizationId, orgId), eq(students.status, "ativo")));
          const activeStudentsCount = Number(activeStudentsCountObj[0]?.count ?? 0);

          const maxStudents = planInfo?.maxStudents ?? 999999;
          const allowExtra = planInfo?.allowExtraStudents ?? true;
          const extraPrice = Number(planInfo?.extraStudentPrice ?? 1.49);
          const excessCount = Math.max(0, activeStudentsCount - maxStudents);
          const excessFee = (allowExtra && excessCount > 0) ? excessCount * extraPrice : 0;
          const totalValue = baseValue + excessFee;

          const description = excessCount > 0
            ? `Assinatura MusicPro - Plano ${planInfo?.name || org.planId} (${input.planType}) + ${excessCount} alunos excedentes`
            : `Assinatura MusicPro - Plano ${planInfo?.name || org.planId} (${input.planType})`;

          const sub = await createAsaasSubscription({
            customer: customerId,
            billingType: 'UNDEFINED',
            value: totalValue,
            nextDueDate: new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
            cycle: input.planType,
            description,
            successUrl: `${ENV.appUrl}/checkout?payment=success`,
            maxPayments: input.planType === 'YEARLY' ? 1 : 6
          });
          subId = sub.id;
          // Marca como "pending": o cliente CONFIRMOU a assinatura (opt-in). Isso também
          // impede que a guarda de trial (que só age em "trialing") cancele esta assinatura.
          await db.update(organizations).set({
            asaasSubscriptionId: subId,
            subscriptionStatus: "pending",
            updatedAt: new Date(),
          }).where(eq(organizations.id, orgId));
        }

        const payments = await getAsaasSubscriptionPayments(subId);
        const pendingPayment = payments.find(p => p.status === 'PENDING' || p.status === 'OVERDUE');
        if (!pendingPayment) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível gerar o link de pagamento." });
        }

        return { success: true, paymentLink: pendingPayment.invoiceUrl };
      }),
    getPendingInvoice: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return null;
      const orgId = ctx.user.organizationId!;
      const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
      if (!org || !org.asaasSubscriptionId) return null;

      const { getAsaasSubscriptionPayments } = await import('../utils/asaas');
      const payments = await getAsaasSubscriptionPayments(org.asaasSubscriptionId);
      let pendingPayment = payments.find((p: any) => p.status === 'PENDING' || p.status === 'OVERDUE');

      // BUG FIX: cobrança avulsa gerada pela reconciliação (não pertence à assinatura) —
      // buscar também cobranças pendentes do cliente para expor a fatura correta na UI
      if (!pendingPayment && org.asaasCustomerId) {
        try {
          const res = await fetch(
            `${ENV.asaasBaseUrl}/payments?customer=${org.asaasCustomerId}&status=PENDING&limit=5`,
            { headers: { access_token: ENV.asaasApiKey } }
          );
          if (res.ok) {
            const data = await res.json();
            const avulsas = (data?.data || []).filter((p: any) =>
              p.status === 'PENDING' || p.status === 'OVERDUE'
            );
            pendingPayment = avulsas[0];
          }
        } catch (e) {
          console.warn(`[getPendingInvoice] Falha ao buscar cobranças avulsas do cliente:`, e);
        }
      }

      if (!pendingPayment) return null;
      
      return {
        invoiceUrl: pendingPayment.invoiceUrl,
        value: pendingPayment.value
      };
    }),
    syncSubscription: protectedProcedure.mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const orgId = ctx.user.organizationId!;
      const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
      if (!org) throw new TRPCError({ code: "NOT_FOUND", message: "Organização não encontrada" });

      if (!org.asaasSubscriptionId) {
        return { success: false, status: org.subscriptionStatus, message: "Nenhuma assinatura encontrada." };
      }

      const { getAsaasSubscriptionPayments } = await import('../utils/asaas');
      const payments = await getAsaasSubscriptionPayments(org.asaasSubscriptionId);

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 35);

      const confirmedPayment = payments.find((p: any) => {
        if (p.status !== 'RECEIVED' && p.status !== 'CONFIRMED') return false;
        const paymentDate = p.confirmedDate || p.paymentDate || p.dueDate;
        if (!paymentDate) return true;
        return new Date(paymentDate) >= cutoffDate;
      });
      
      if (confirmedPayment) {
        await db.update(organizations)
          .set({ subscriptionStatus: "active", updatedAt: new Date() })
          .where(eq(organizations.id, orgId));
        debugLog(`[Platform Sync] Assinatura ativada manualmente para org ${orgId} (pagamento: ${confirmedPayment.id})`);
        return { success: true, status: "active", message: "Assinatura ativada com sucesso!" };
      }

      const pendingPayment = payments.find((p: any) => p.status === 'PENDING' || p.status === 'OVERDUE');
      
      return { 
        success: false, 
        status: org.subscriptionStatus, 
        message: "Nenhum pagamento confirmado recente encontrado. Efetue o pagamento e tente novamente.",
        invoiceUrl: pendingPayment?.invoiceUrl,
        pendingValue: pendingPayment?.value
      };
    }),
    mySubscription: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return null;
      const orgId = ctx.user.organizationId!;
      const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
      if (!org) return null;

      const { systemPlans } = await import("../../drizzle/schema");
      const [plan] = await db.select().from(systemPlans).where(eq(systemPlans.id, org.planId)).limit(1);

      return {
        planId: org.planId,
        planName: plan?.name || (org.planId === "parceiro" ? "Parceiro MusicPro (Ilimitado)" : org.planId),
        planPriceMonthly: Number(plan?.priceMonthly || 0),
        planPriceYearly: Number(plan?.priceYearly || 0),
        planMaxStudents: plan?.maxStudents ?? 999999,
        allowExtraStudents: plan?.allowExtraStudents ?? true,
        extraStudentPrice: Number(plan?.extraStudentPrice ?? 1.49),
        features: (() => { try { return JSON.parse(plan?.features as string); } catch { return []; } })(),
        subscriptionStatus: org.subscriptionStatus,
        trialEndsAt: org.trialEndsAt,
      };
    }),
    changePlan: protectedProcedure.input(z.object({ planId: z.string(), planType: z.enum(["MONTHLY", "YEARLY"]) })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const orgId = ctx.user.organizationId!;
      const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
      if (!org) throw new TRPCError({ code: "NOT_FOUND", message: "Organização não encontrada" });

      const { systemPlans } = await import("../../drizzle/schema");
      const [planInfo] = await db.select().from(systemPlans).where(eq(systemPlans.id, input.planId)).limit(1);
      if (!planInfo) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Plano selecionado não encontrado." });
      }

      const newMaxStudents = planInfo.maxStudents ?? 999999;
      
      const activeStudentsCountObj = await db.select({ count: sql<number>`count(*)` })
        .from(students)
        .where(and(eq(students.organizationId, orgId), eq(students.status, "ativo")));
      const activeStudentsCount = Number(activeStudentsCountObj[0]?.count ?? 0);

      if (!planInfo.allowExtraStudents && activeStudentsCount > newMaxStudents) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Você possui ${activeStudentsCount} alunos ativos. Exclua ou arquive ${activeStudentsCount - newMaxStudents} alunos para poder migrar para o plano de ${newMaxStudents} Alunos.`
        });
      }

      // Preço real + Taxa de alunos excedentes
      const baseValue = input.planType === "YEARLY"
        ? Number(planInfo.priceYearly)
        : Number(planInfo.priceMonthly);

      const allowExtra = planInfo.allowExtraStudents ?? true;
      const extraPrice = Number(planInfo.extraStudentPrice ?? 1.49);
      const excessCount = Math.max(0, activeStudentsCount - newMaxStudents);
      const excessFee = (allowExtra && excessCount > 0) ? excessCount * extraPrice : 0;
      const totalValue = baseValue + excessFee;

      const description = excessCount > 0
        ? `Assinatura MusicPro - Plano ${planInfo.name} (${input.planType}) + ${excessCount} alunos excedentes`
        : `Assinatura MusicPro - Plano ${planInfo.name} (${input.planType})`;

      if (org.asaasSubscriptionId) {
        const { updateAsaasSubscription, getAsaasSubscription, deleteAsaasSubscription, getAsaasSubscriptionPayments, deleteAsaasCharge, createAsaasSubscription } = await import('../utils/asaas');
        try {
          await updateAsaasSubscription(org.asaasSubscriptionId, {
            value: totalValue,
            description,
            cycle: input.planType
          });

          // BUG FIX: O Asaas só aplica o novo valor nas cobranças FUTURAS da assinatura.
          // Cancelar cobranças já emitidas (PENDING/OVERDUE) com valor divergente e
          // gerar uma nova com o valor correto para o período vigente.
          if (org.asaasCustomerId) {
            await reconcileOrgAsaasCharges(
              db,
              orgId,
              org.asaasSubscriptionId,
              org.asaasCustomerId,
              totalValue,
              description
            );
          }
        } catch (err: any) {
          if (err.message?.includes('invalid_value') || err.message?.includes('faturas pagas')) {
             try {
               const asaasSub = await getAsaasSubscription(org.asaasSubscriptionId);
               const nextDueDate = asaasSub.nextDueDate ? new Date(asaasSub.nextDueDate) : new Date();

               // BUG FIX: cancelar também as cobranças pendentes da assinatura antiga
               // (deletar a assinatura NÃO deleta as cobranças já emitidas no Asaas)
               const oldPayments = await getAsaasSubscriptionPayments(org.asaasSubscriptionId).catch(() => []);
               for (const p of oldPayments) {
                 const st = String(p.status || "").toUpperCase();
                 if (st === "PENDING" || st === "OVERDUE") {
                   await deleteAsaasCharge(p.id).catch(e =>
                     console.warn(`[ChangePlan] Falha ao cancelar cobrança órfã ${p.id}:`, e)
                   );
                 }
               }

               await deleteAsaasSubscription(org.asaasSubscriptionId);

               // BUG FIX: recriar IMEDIATAMENTE a assinatura com o valor correto,
               // para não deixar a org sem cobrança nenhuma
               let customerId = org.asaasCustomerId;
               if (!customerId) {
                 const [profData] = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
                 const { createAsaasCustomer } = await import('../utils/asaas');
                 customerId = await createAsaasCustomer({
                   name: org.name || "Escola",
                   email: profData?.email ?? undefined,
                 });
                 await db.update(organizations).set({ asaasCustomerId: customerId }).where(eq(organizations.id, orgId));
               }

               const newSub = await createAsaasSubscription({
                 customer: customerId,
                 billingType: 'UNDEFINED',
                 value: totalValue,
                 nextDueDate: nextDueDate.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
                 cycle: input.planType,
                 description,
                 successUrl: `${ENV.appUrl}/checkout?payment=success`,
                 maxPayments: input.planType === 'YEARLY' ? 1 : 6,
               });

               const newPayments = await getAsaasSubscriptionPayments(newSub.id).catch(() => []);
               const pendingPayment = newPayments.find((p: any) => p.status === 'PENDING' || p.status === 'OVERDUE');

               await db.update(organizations).set({
                 planId: input.planId,
                 asaasSubscriptionId: newSub.id,
                 subscriptionStatus: "pending",
                 updatedAt: new Date()
               }).where(eq(organizations.id, orgId));

               return {
                 success: true,
                 paymentLink: pendingPayment?.invoiceUrl,
                 message: "Plano atualizado! A assinatura foi recriada com o valor correto. Finalize o pagamento para ativar o novo plano."
               };
             } catch (cancelErr) {
               console.error("Erro ao cancelar e converter subscrição:", cancelErr);
               throw new TRPCError({
                 code: "INTERNAL_SERVER_ERROR",
                 message: "Não foi possível alterar o plano automaticamente devido à limitação do Cartão de Crédito. Vá em 'Cancelar Assinatura' e assine novamente."
               });
             }
          }
          throw err;
        }
      }

      await db.update(organizations).set({ planId: input.planId }).where(eq(organizations.id, orgId));
      return { success: true };
    }),
    cancelSubscription: protectedProcedure.mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const orgId = ctx.user.organizationId!;
      const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
      
      if (org?.asaasSubscriptionId) {
        const { deleteAsaasSubscription } = await import('../utils/asaas');
        await deleteAsaasSubscription(org.asaasSubscriptionId).catch(console.error);
      }
      
      await db.update(organizations).set({ 
        subscriptionStatus: "canceled",
        asaasSubscriptionId: null 
      }).where(eq(organizations.id, orgId));

      return { success: true };
    }),
    reactivateSubscription: protectedProcedure
      .input(z.object({
        planId: z.string().optional(),
        planType: z.enum(["MONTHLY", "YEARLY"]).optional().default("MONTHLY"),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
        const orgId = ctx.user.organizationId!;
        const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
        if (!org) throw new TRPCError({ code: "NOT_FOUND", message: "Organização não encontrada" });

        const planId = input.planId || org.planId;
        const [profData] = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
        const { createAsaasCustomer, createAsaasSubscription, getAsaasSubscriptionPayments } = await import('../utils/asaas');

        let customerId = org.asaasCustomerId;
        if (!customerId) {
          customerId = await createAsaasCustomer({
            name: org.name || "Escola",
            email: profData?.email ?? undefined,
          });
          await db.update(organizations).set({ asaasCustomerId: customerId }).where(eq(organizations.id, orgId));
        }

        const { systemPlans } = await import("../../drizzle/schema");
        const [planInfo] = await db.select().from(systemPlans).where(eq(systemPlans.id, planId)).limit(1);

        // A-02 FIX: Lança erro se o plano não existir — nunca usar fallback hardcoded de preço
        if (!planInfo) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Plano "${planId}" não encontrado. Verifique os planos disponíveis e tente novamente.`
          });
        }

        const baseValue = input.planType === "YEARLY" ? Number(planInfo.priceYearly) : Number(planInfo.priceMonthly);

        // Cálculo de Alunos Excedentes
        const activeStudentsCountObj = await db.select({ count: sql<number>`count(*)` })
          .from(students)
          .where(and(eq(students.organizationId, orgId), eq(students.status, "ativo")));
        const activeStudentsCount = Number(activeStudentsCountObj[0]?.count ?? 0);

        const maxStudents = planInfo?.maxStudents ?? 999999;
        const allowExtra = planInfo?.allowExtraStudents ?? true;
        const extraPrice = Number(planInfo?.extraStudentPrice ?? 1.49);
        const excessCount = Math.max(0, activeStudentsCount - maxStudents);
        const excessFee = (allowExtra && excessCount > 0) ? excessCount * extraPrice : 0;
        const totalValue = baseValue + excessFee;

        const description = excessCount > 0
          ? `Assinatura MusicPro - Plano ${planInfo?.name || planId} (${input.planType}) + ${excessCount} alunos excedentes`
          : `Assinatura MusicPro - Plano ${planInfo?.name || planId} (${input.planType})`;

        // Se já existia uma assinatura antiga no Asaas, cancela ela para não gerar cobrança duplicada
        if (org.asaasSubscriptionId) {
          try {
            const { deleteAsaasSubscription } = await import('../utils/asaas');
            await deleteAsaasSubscription(org.asaasSubscriptionId);
            debugLog(`[Reactivate] Assinatura anterior #${org.asaasSubscriptionId} cancelada no Asaas.`);
          } catch (err) {
            console.warn(`[Reactivate] Erro ao cancelar assinatura anterior #${org.asaasSubscriptionId}:`, err);
          }
        }

        // Cria nova assinatura no Asaas
        const sub = await createAsaasSubscription({
          customer: customerId,
          billingType: 'UNDEFINED',
          value: totalValue,
          nextDueDate: new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
          cycle: input.planType,
          description,
          successUrl: `${ENV.appUrl}/checkout?payment=success`,
          maxPayments: input.planType === 'YEARLY' ? 1 : 6
        });

        const payments = await getAsaasSubscriptionPayments(sub.id);
        const pendingPayment = payments.find(p => p.status === 'PENDING' || p.status === 'OVERDUE');

        // A-01 FIX: Seta status como "pending" — o webhook do Asaas atualizará para "active"
        // após confirmação do pagamento. Setar "active" antes do pagamento é um risco de segurança.
        await db.update(organizations).set({
          planId,
          asaasSubscriptionId: sub.id,
          subscriptionStatus: "pending",
          updatedAt: new Date()
        }).where(eq(organizations.id, orgId));

        return {
          success: true,
          status: "pending",
          paymentLink: pendingPayment?.invoiceUrl,
          message: "Plano reabilitado! Finalize o pagamento no link abaixo para ativar o acesso."
        };
      }),
  }),

};
