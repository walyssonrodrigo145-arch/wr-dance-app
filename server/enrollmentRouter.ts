import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { enrollmentLinks, crmLeads, instruments, professores, users, lessons, students, settings, studioRooms, organizations, schoolIntegrations, contractTemplates, schoolPlans, studentEnrollments } from "../drizzle/schema";
import { eq, and, gte, lte, desc, isNotNull, ne, sql, or } from "drizzle-orm";
import crypto from "crypto";
import { createAsaasCustomer, createAsaasCharge, getAsaasPixQrCode, getAsaasChargeStatus, getAsaasCharge } from "./utils/asaas";
import { createMPPreference, verifyMPPayment } from "./utils/mercadopago";
import { createInfinitePayLink, checkInfinitePayPayment, brlToCents, resolveInfinitePayApiKey } from "./utils/infinitepay";
import { createPaymentShortLink } from "./utils/shortlinks";
import { decryptSecret } from "./utils/integrationCrypto";
import { resolveActivePaymentGateway } from "./routers/helpers";
import { ENV } from "./_core/env";

export const enrollmentRouter = router({
  // 1. Gera um link de auto-matrícula exclusivo (Admin/CRM)
  generateLink: protectedProcedure
    .input(
      z.object({
        leadId: z.number().optional(),
        instrumentId: z.number().optional(),
        monthlyFee: z.number().optional(),
        contractTemplateId: z.number().optional(),
        autoSendWhatsapp: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const orgId = ctx.user.organizationId!;

      // Se não foi passado um monthlyFee, mantém undefined (o frontend mostrará o default da escola)
      const resolvedFee = input.monthlyFee;

      const code = crypto.randomBytes(16).toString("hex");

      const [link] = await db
        .insert(enrollmentLinks)
        .values({
          organizationId: orgId,
          code,
          leadId: input.leadId,
          instrumentId: input.instrumentId,
          monthlyFee: resolvedFee ? String(resolvedFee) : undefined,
          contractTemplateId: input.contractTemplateId,
          status: "active",
        })
        .returning();

      const url = `/matricula/${link.code}`;
      const appUrl = (ENV.appUrl && !ENV.appUrl.includes('localhost')) 
        ? ENV.appUrl.replace(/\/+$/, '') 
        : 'https://wrmusicpro.com.br';
      const fullUrl = `${appUrl}${url}`;
      let sentViaBot = false;

      // Se solicitado autoSendWhatsapp e o link tem leadId associado com telefone
      if (input.autoSendWhatsapp && input.leadId) {
        try {
          const [lead] = await db.select().from(crmLeads).where(eq(crmLeads.id, input.leadId)).limit(1);
          if (lead?.phone) {
            // Busca configurações do bot do WhatsApp da escola
            const allSettings = await db.select().from(settings).where(eq(settings.organizationId, orgId));
            const schoolSet = allSettings.find(s => s.schoolName && s.schoolName.trim() !== '')
              || allSettings.find(s => s.whatsappBotUrl)
              || allSettings[0];

            const { sendWhatsAppMessage } = await import("./utils/whatsapp");
            const messageText = `Olá ${lead.name}! 🎵\n\nAqui está o seu link exclusivo para realizar sua matrícula na nossa escola de música:\n\n👉 ${fullUrl}\n\nAcesse o link acima para escolher o melhor dia e horário para suas aulas!`;
            
            // Tenta enviar com a sessão do usuário logado (prof_${ctx.user.id})
            let sendRes = await sendWhatsAppMessage({
              url: schoolSet?.whatsappBotUrl || undefined,
              token: schoolSet?.whatsappBotToken || undefined,
              sessionId: `prof_${ctx.user.id}`,
              phone: lead.phone,
              message: messageText,
            });

            // Se falhou, tenta com a sessão do dono/configuração da escola (prof_${schoolSet.userId})
            if (!sendRes.success && schoolSet?.userId && schoolSet.userId !== ctx.user.id) {
              sendRes = await sendWhatsAppMessage({
                url: schoolSet?.whatsappBotUrl || undefined,
                token: schoolSet?.whatsappBotToken || undefined,
                sessionId: `prof_${schoolSet.userId}`,
                phone: lead.phone,
                message: messageText,
              });
            }

            // Se falhou, tenta com a sessão padrão (prof_1)
            if (!sendRes.success) {
              sendRes = await sendWhatsAppMessage({
                url: schoolSet?.whatsappBotUrl || undefined,
                token: schoolSet?.whatsappBotToken || undefined,
                sessionId: `prof_1`,
                phone: lead.phone,
                message: messageText,
              });
            }

            if (sendRes.success) {
              sentViaBot = true;
            } else {
              console.warn("[generateLink] Bot tentou enviar mas retornou erro:", sendRes.error);
            }
          }
        } catch (e) {
          console.error("[generateLink] Erro ao enviar WhatsApp automático:", e);
        }
      }

      return { code: link.code, url, fullUrl, sentViaBot };
    }),

  // 2. Rota Pública: Retorna detalhes da escola, cursos, valor da mensalidade e método de pagamento configurado
  getPublicDetails: publicProcedure
    .input(z.object({ code: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const [link] = await db
        .select()
        .from(enrollmentLinks)
        .where(eq(enrollmentLinks.code, input.code))
        .limit(1);

      if (!link || link.status !== "active") {
        throw new Error("Link de matrícula inválido ou expirado.");
      }

      // Expiração do link (se configurada)
      if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
        await db.update(enrollmentLinks).set({ status: "expired" }).where(eq(enrollmentLinks.id, link.id));
        throw new Error("Link de matrícula expirado.");
      }

      const orgId = link.organizationId;
      // Busca o settings mais completo: prioriza quem tem schoolName ou chaves de pagamento
      const allSettings = await db.select().from(settings).where(eq(settings.organizationId, orgId));
      const schoolSet = allSettings.find(s => s.schoolName && s.schoolName.trim() !== '')
        || allSettings.find(s => s.asaasApiKey || s.mpAccessToken)
        || allSettings.sort((a, b) => b.id - a.id)[0];

      let leadData = null;
      if (link.leadId) {
        const [lead] = await db.select().from(crmLeads).where(eq(crmLeads.id, link.leadId)).limit(1);
        if (lead) leadData = lead;
      }

      const allInstruments = await db.select().from(instruments).where(eq(instruments.organizationId, orgId));

      // RN-001: gateway selecionado e configurado; fallback asaas > mercadopago > infinitepay
      const activeGateway: "asaas" | "mercadopago" | "infinitepay" | "none" = resolveActivePaymentGateway(schoolSet);

      // Retorna schoolHours para o frontend poder cinzar dias fechados
      let parsedSchoolHours: Record<string, { active: boolean; start: string; end: string }> = {};
      try { parsedSchoolHours = JSON.parse(schoolSet?.schoolHours || "{}"); } catch (_) {}

      const [org] = await db.select({ logo: organizations.logo }).from(organizations).where(eq(organizations.id, orgId)).limit(1);
      const schoolLogo = schoolSet?.logoUrl || org?.logo || null;

      // Contrato: habilitado se a escola tiver integração Assinafy ativa
      const [assinafy] = await db.select({ id: schoolIntegrations.id })
        .from(schoolIntegrations)
        .where(and(
          eq(schoolIntegrations.organizationId, orgId),
          eq(schoolIntegrations.provider, "assinafy"),
          eq(schoolIntegrations.active, true),
        ))
        .limit(1);
      let contractTemplateName: string | null = null;
      if (link.contractTemplateId) {
        const [tpl] = await db.select({ name: contractTemplates.name })
          .from(contractTemplates).where(eq(contractTemplates.id, link.contractTemplateId)).limit(1);
        contractTemplateName = tpl?.name ?? null;
      }

      // Planos & Bolsas ativos da escola (duração, aulas/semana, valor)
      const plans = await db.select({
        id: schoolPlans.id,
        nome: schoolPlans.nome,
        aulasPorSemana: schoolPlans.aulasPorSemana,
        duracaoMeses: schoolPlans.duracaoMeses,
        isBolsa: schoolPlans.isBolsa,
        valorMensal: schoolPlans.valorMensal,
        valorCheio: schoolPlans.valorCheio,
        taxaInscricao: schoolPlans.taxaInscricao,
        diasLimite: schoolPlans.diasLimite,
        descricao: schoolPlans.descricao,
      }).from(schoolPlans).where(and(eq(schoolPlans.organizationId, orgId), eq(schoolPlans.ativo, true)));

      // Dias de vencimento configurados pela escola
      const dueDays: number[] = (schoolSet?.dueDaysForecast || "5,10,15,20")
        .split(",").map((s: string) => parseInt(s.trim(), 10)).filter((n: number) => n >= 1 && n <= 31);

      return {
        code: link.code,
        schoolName: schoolSet?.schoolName || "Escola de Música",
        schoolLogo,
        schoolPhone: schoolSet?.schoolPhone || schoolSet?.phone,
        monthlyFee: link.monthlyFee ? Number(link.monthlyFee) : 150,
        lessonDuration: schoolSet?.lessonDuration ?? 60,
        preselectedInstrumentId: link.instrumentId,
        lead: leadData,
        instruments: allInstruments,
        paymentGateway: activeGateway,
        schoolHours: parsedSchoolHours,
        contractEnabled: Boolean(assinafy),
        contractTemplateId: link.contractTemplateId ?? null,
        contractTemplateName,
        plans,
        dueDays,
      };
    }),

  // 3. Rota Pública: Retorna os horários disponíveis por instrumento e data, considerando lessonDuration
  getAvailableSlots: publicProcedure
    .input(
      z.object({
        code: z.string(),
        instrumentId: z.number(),
        dateStr: z.string(), // YYYY-MM-DD
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const [link] = await db
        .select()
        .from(enrollmentLinks)
        .where(eq(enrollmentLinks.code, input.code))
        .limit(1);

      if (!link) throw new Error("Link não encontrado");
      const orgId = link.organizationId;

      // Busca o instrumento
      const [inst] = await db.select().from(instruments).where(eq(instruments.id, input.instrumentId)).limit(1);
      if (!inst) throw new Error("Instrumento não encontrado");

      // Busca professores da escola e tenta filtrar pelo instrumento
      const allTeachers = await db
        .select({
          id: professores.id,
          userId: professores.userId,
          name: users.name,
          especialidade: professores.especialidade,
        })
        .from(professores)
        .leftJoin(users, eq(professores.userId, users.id))
        .where(eq(professores.organizationId, orgId));

      const targetTeacher =
        allTeachers.find(t =>
          (t.especialidade || "").toLowerCase().includes(inst.name.toLowerCase())
        ) || allTeachers[0];

      if (!targetTeacher) {
        throw new Error("Nenhum professor disponível para este instrumento.");
      }

      // Busca salas de estúdio ativas
      const rooms = await db
        .select()
        .from(studioRooms)
        .where(and(eq(studioRooms.organizationId, orgId), eq(studioRooms.active, true)));

      // Busca o settings mais completo: prioriza quem tem schoolName ou chaves de pagamento
      const allSettingsForSlots = await db.select({ schoolHours: settings.schoolHours, lessonDuration: settings.lessonDuration, schoolName: settings.schoolName, asaasApiKey: settings.asaasApiKey, mpAccessToken: settings.mpAccessToken }).from(settings).where(eq(settings.organizationId, orgId));
      const schoolSet = allSettingsForSlots.find(s => s.schoolName && s.schoolName.trim() !== '')
        || allSettingsForSlots.find(s => s.asaasApiKey || s.mpAccessToken)
        || allSettingsForSlots[0];

      const duration = schoolSet?.lessonDuration ?? 60;

      // Mapeia o dia da semana da data escolhida para a chave do schoolHours
      const DAY_MAP: Record<number, string> = {
        0: "sunday",
        1: "monday",
        2: "tuesday",
        3: "wednesday",
        4: "thursday",
        5: "friday",
        6: "saturday",
      };

      // Parseia a data garantindo fuso de Brasília (UTC-3)
      const dateObj = new Date(`${input.dateStr}T12:00:00.000-03:00`);
      const weekdayKey = DAY_MAP[dateObj.getDay()];

      // Parse do schoolHours
      let schoolHoursObj: Record<string, { active: boolean; start: string; end: string }> = {};
      try {
        schoolHoursObj = JSON.parse(schoolSet?.schoolHours || "{}");
      } catch (_) {}

      const dayConfig = schoolHoursObj[weekdayKey];

      // Se a escola não funciona nesse dia, retorna vazio
      if (!dayConfig || !dayConfig.active) {
        return {
          teacher: targetTeacher,
          room: rooms[0] || null,
          slots: [],
          closedDay: true,
          lessonDuration: duration,
        };
      }

      // Gera slots com passo igual a lessonDuration dentro do horário de funcionamento
      const [startH, startM] = dayConfig.start.split(":").map(Number);
      const [endH, endM] = dayConfig.end.split(":").map(Number);

      const generatedSlots: string[] = [];
      let cursor = startH * 60 + (startM || 0);
      const endMinutes = endH * 60 + (endM || 0);

      // Cada slot tem duração de duration minutos
      while (cursor + duration <= endMinutes) {
        const hh = String(Math.floor(cursor / 60)).padStart(2, "0");
        const mm = String(cursor % 60).padStart(2, "0");
        generatedSlots.push(`${hh}:${mm}`);
        cursor += duration;
      }

      // Busca aulas agendadas para essa data filtrando por professor E organização
      const startOfDay = new Date(`${input.dateStr}T00:00:00.000-03:00`);
      const endOfDay = new Date(`${input.dateStr}T23:59:59.999-03:00`);

      const existingLessons = await db
        .select({ scheduledAt: lessons.scheduledAt })
        .from(lessons)
        .where(
          and(
            eq(lessons.organizationId, orgId),
            eq(lessons.userId, targetTeacher.userId),
            gte(lessons.scheduledAt, startOfDay),
            lte(lessons.scheduledAt, endOfDay)
          )
        );

      // Converte as aulas existentes para strings HH:mm (horário de Brasília)
      const busyTimes = new Set(
        existingLessons.map(l => {
          const d = new Date(l.scheduledAt);
          return d.toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "America/Sao_Paulo",
          });
        })
      );

      const slots = generatedSlots.map(time => ({
        time,
        available: !busyTimes.has(time),
      }));

      return {
        teacher: targetTeacher,
        room: rooms[0] || null,
        slots,
        closedDay: false,
        lessonDuration: duration,
      };
    }),

  // 3.1 Disponibilidade por DIA DA SEMANA (agendamento recorrente por curso)
  getWeekdaySlots: publicProcedure
    .input(z.object({ code: z.string(), instrumentId: z.number(), weekday: z.number().int().min(0).max(6) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const [link] = await db.select().from(enrollmentLinks).where(eq(enrollmentLinks.code, input.code)).limit(1);
      if (!link) throw new Error("Link não encontrado");
      const orgId = link.organizationId;

      const [inst] = await db.select().from(instruments).where(eq(instruments.id, input.instrumentId)).limit(1);
      if (!inst) throw new Error("Instrumento não encontrado");

      const allTeachers = await db.select({
        id: professores.id, userId: professores.userId, name: users.name, especialidade: professores.especialidade,
      }).from(professores).leftJoin(users, eq(professores.userId, users.id)).where(eq(professores.organizationId, orgId));
      const targetTeacher = allTeachers.find(t => (t.especialidade || "").toLowerCase().includes(inst.name.toLowerCase())) || allTeachers[0];
      if (!targetTeacher) throw new Error("Nenhum professor disponível para este instrumento.");

      const rooms = await db.select().from(studioRooms).where(and(eq(studioRooms.organizationId, orgId), eq(studioRooms.active, true)));

      const allSettingsForSlots = await db.select({ schoolHours: settings.schoolHours, lessonDuration: settings.lessonDuration, schoolName: settings.schoolName }).from(settings).where(eq(settings.organizationId, orgId));
      const schoolSet = allSettingsForSlots.find(s => s.schoolName && s.schoolName.trim() !== '') || allSettingsForSlots[0];
      const duration = schoolSet?.lessonDuration ?? 60;

      const DAY_MAP: Record<number, string> = { 0: "sunday", 1: "monday", 2: "tuesday", 3: "wednesday", 4: "thursday", 5: "friday", 6: "saturday" };
      let schoolHoursObj: Record<string, { active: boolean; start: string; end: string }> = {};
      try { schoolHoursObj = JSON.parse(schoolSet?.schoolHours || "{}"); } catch { /* */ }
      const dayConfig = schoolHoursObj[DAY_MAP[input.weekday]];
      if (!dayConfig || !dayConfig.active) {
        return { teacher: targetTeacher, room: rooms[0] || null, slots: [], closedDay: true, lessonDuration: duration };
      }

      const [startH, startM] = dayConfig.start.split(":").map(Number);
      const [endH, endM] = dayConfig.end.split(":").map(Number);
      const generatedSlots: string[] = [];
      let cursor = startH * 60 + (startM || 0);
      const endMinutes = endH * 60 + (endM || 0);
      while (cursor + duration <= endMinutes) {
        generatedSlots.push(`${String(Math.floor(cursor / 60)).padStart(2, "0")}:${String(cursor % 60).padStart(2, "0")}`);
        cursor += duration;
      }

      // Ocupação do professor E da sala nesse dia da semana (próximas 4 semanas)
      const busyTimes = new Set<string>();
      const roomIdForSlots = rooms[0]?.id;
      const brtBase = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
      brtBase.setHours(0, 0, 0, 0);
      let diff0 = (input.weekday - brtBase.getDay() + 7) % 7;
      if (diff0 === 0) diff0 = 7;
      brtBase.setDate(brtBase.getDate() + diff0);
      for (let w = 0; w < 4; w++) {
        const d = new Date(brtBase);
        d.setDate(d.getDate() + w * 7);
        const dayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const startOfDay = new Date(`${dayStr}T00:00:00.000-03:00`);
        const endOfDay = new Date(`${dayStr}T23:59:59.999-03:00`);
        const dayLessons = await db.select({ scheduledAt: lessons.scheduledAt }).from(lessons)
          .where(and(
            eq(lessons.organizationId, orgId),
            roomIdForSlots
              ? or(eq(lessons.userId, targetTeacher.userId), eq(lessons.studioRoomId, roomIdForSlots))
              : eq(lessons.userId, targetTeacher.userId),
            gte(lessons.scheduledAt, startOfDay),
            lte(lessons.scheduledAt, endOfDay),
          ));
        for (const l of dayLessons) {
          busyTimes.add(new Date(l.scheduledAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }));
        }
      }

      const slots = generatedSlots.map(time => ({ time, available: !busyTimes.has(time) }));
      return { teacher: targetTeacher, room: rooms[0] || null, slots, closedDay: false, lessonDuration: duration };
    }),

  // 4. Gerar Cobrança (Asaas ou Mercado Pago) para o Aluno pagar
  createPaymentCharge: publicProcedure
    .input(
      z.object({
        code: z.string(),
        studentName: z.string().min(2),
        studentPhone: z.string().min(8),
        studentEmail: z.string().email().optional(),
        studentCpf: z.string().optional(),
        instrumentId: z.number(),
        teacherUserId: z.number().optional(),
        studioRoomId: z.number().optional(),
        dateStr: z.string().optional(),
        timeStr: z.string().optional(),
        amount: z.number().positive().optional(),
        courses: z.array(z.object({ instrumentId: z.number(), planId: z.number().optional() })).max(6).optional(),
        billingType: z.enum(["PIX", "BOLETO"]).default("PIX"),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const [link] = await db
        .select()
        .from(enrollmentLinks)
        .where(eq(enrollmentLinks.code, input.code))
        .limit(1);

      if (!link || link.status !== "active") {
        throw new Error("Link expirado ou já utilizado.");
      }
      if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
        await db.update(enrollmentLinks).set({ status: "expired" }).where(eq(enrollmentLinks.id, link.id));
        throw new Error("Link de matrícula expirado.");
      }

      const orgId = link.organizationId;

      // Idempotência ANTES de gerar a cobrança: não cobrar um cadastro duplicado.
      // Compara nome + contato (mesma pessoa) — irmãos com contatos compartilhados passam.
      const dupName = input.studentName.trim();
      const dupEmail = input.studentEmail?.trim() || null;
      const dupPhone = input.studentPhone?.trim() || null;
      const dupConds = [];
      if (dupEmail) dupConds.push(and(eq(students.name, dupName), eq(students.email, dupEmail)));
      if (dupPhone) dupConds.push(and(eq(students.name, dupName), eq(students.phone, dupPhone)));
      if (dupConds.length > 0) {
        const [dupStudent] = await db.select({ id: students.id }).from(students)
          .where(and(eq(students.organizationId, orgId), or(...dupConds))).limit(1);
        if (dupStudent) {
          throw new Error("Já existe um aluno cadastrado com estes dados. Entre em contato com a escola.");
        }
      }

      // Busca o settings mais completo: prioriza quem tem schoolName ou chaves de pagamento
      const allSettings2 = await db.select().from(settings).where(eq(settings.organizationId, orgId));
      const schoolSet = allSettings2.find(s => s.schoolName && s.schoolName.trim() !== '')
        || allSettings2.find(s => s.asaasApiKey || s.mpAccessToken)
        || allSettings2.sort((a, b) => b.id - a.id)[0];

      // Valor calculado SERVER-SIDE a partir dos planos (NUNCA confiar no cliente).
      // O PLANO já cobre os instrumentos (ex.: 2 aulas/semana) → cobra 1x por plano distinto.
      let chargeAmount = link.monthlyFee ? Number(link.monthlyFee) : 150;
      if (input.courses && input.courses.length > 0) {
        const orgPlans = await db.select().from(schoolPlans).where(eq(schoolPlans.organizationId, orgId));
        const planById = new Map<number, any>(orgPlans.map((p: any) => [p.id, p]));
        const seenPlans = new Set<number>();
        let hasCourseWithoutPlan = false;
        chargeAmount = 0;
        for (const c of input.courses) {
          const key = c.planId ?? -1;
          if (seenPlans.has(key)) continue;
          seenPlans.add(key);
          const p = c.planId ? planById.get(c.planId) : null;
          if (!p) { hasCourseWithoutPlan = true; continue; }
          chargeAmount += Number(p.valorMensal) + Number(p.taxaInscricao || 0);
        }
        if (hasCourseWithoutPlan) chargeAmount += (link.monthlyFee ? Number(link.monthlyFee) : 150);
      }
      if (chargeAmount <= 0) chargeAmount = link.monthlyFee ? Number(link.monthlyFee) : 150;
      const [inst] = await db.select().from(instruments).where(eq(instruments.id, input.instrumentId)).limit(1);
      const courseName = inst?.name || "Música";
      const courseCount = input.courses?.length || 1;
      const chargeDescription = courseCount > 1
        ? `Matrícula MusicPro - ${courseCount} cursos`
        : `Matrícula MusicPro - ${courseName}`;

      // Qual gateway a escola usa? (RN-001: fonte única de resolução)
      const activeGateway = resolveActivePaymentGateway(schoolSet);

      // INFINITEPAY (checkout hospedado — Pix taxa zero / Cartão 12x)
      if (activeGateway === "infinitepay") {
        const ipLink = await createInfinitePayLink({
          handle: schoolSet!.infinitepayHandle!,
          orderNsu: `enrollment_${link.code}`,
          items: [{
            quantity: 1,
            price: brlToCents(chargeAmount),
            description: chargeDescription,
          }],
          redirectUrl: `${ENV.appUrl || 'https://wrmusicpro.com.br'}/matricula/${link.code}?status=pending`,
          webhookUrl: `${ENV.appUrl || 'https://wrmusicpro.com.br'}/api/webhooks/infinitepay/student?enrollmentCode=${encodeURIComponent(link.code)}&token=${encodeURIComponent(ENV.infinitepayWebhookToken)}`,
          apiKey: resolveInfinitePayApiKey(schoolSet.infinitepayApiKey ?? null),
          customer: {
            name: input.studentName,
            email: input.studentEmail || undefined,
            phone: input.studentPhone,
          },
        });

        const shareUrl = await createPaymentShortLink(db, {
          targetUrl: ipLink.url,
          organizationId: orgId,
          enrollmentCode: link.code,
        });

        return {
          skipPayment: false,
          gateway: "infinitepay",
          invoiceUrl: shareUrl,
          slug: ipLink.slug,
          value: chargeAmount,
          billingType: input.billingType,
        };
      }

      // MERCADO PAGO
      if (activeGateway === "mercadopago") {
        const mpResult = await createMPPreference(
          {
            items: [
              {
                title: chargeDescription,
                quantity: 1,
                currency_id: "BRL",
                unit_price: chargeAmount,
              },
            ],
            payer: {
              name: input.studentName,
              email: input.studentEmail || "cliente@wrmusicpro.com.br",
            },
            external_reference: `enrollment_${link.code}`,
            successUrl: `${ENV.appUrl || 'https://wrmusicpro.com.br'}/matricula/${link.code}?status=success`,
          },
          decryptSecret(schoolSet!.mpAccessToken!)
        );

        return {
          skipPayment: false,
          gateway: "mercadopago",
          invoiceUrl: mpResult.init_point,
          value: chargeAmount,
          billingType: input.billingType,
        };
      }

      // ASAAS
      if (activeGateway === "asaas") {
        const asaasKey = decryptSecret(schoolSet.asaasApiKey!);
        const asaasCustomerId = await createAsaasCustomer(
          {
            name: input.studentName,
            email: input.studentEmail,
            phone: input.studentPhone,
            cpfCnpj: input.studentCpf,
          },
          asaasKey
        );

        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 3);
        const dueDateStr = dueDate.toISOString().split("T")[0];

        const charge = await createAsaasCharge(
          {
            asaasCustomerId,
            billingType: input.billingType,
            value: chargeAmount,
            dueDate: dueDateStr,
            description: chargeDescription,
          },
          asaasKey
        );

        let pixQrCode = null;
        let pixCopiaECola = null;
        if (input.billingType === "PIX" && charge.id) {
          try {
            const pix = await getAsaasPixQrCode(charge.id, asaasKey);
            pixQrCode = pix.encodedImage;
            pixCopiaECola = pix.payload;
          } catch (_) {}
        }

        return {
          skipPayment: false,
          gateway: "asaas",
          chargeId: charge.id,
          invoiceUrl: charge.invoiceUrl,
          pixQrCode,
          pixCopiaECola,
          value: chargeAmount,
          billingType: input.billingType,
        };
      }

      // Sem gateway configurado na escola
      return { skipPayment: true, gateway: "none" };
    }),

  // 4.1 Verifica o status da cobrança Asaas da matrícula (server-side)
  verifyAsaasCharge: publicProcedure
    .input(z.object({ code: z.string(), chargeId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const [link] = await db.select().from(enrollmentLinks).where(eq(enrollmentLinks.code, input.code)).limit(1);
      if (!link) throw new Error("Link não encontrado");
      const allSettings = await db.select().from(settings).where(eq(settings.organizationId, link.organizationId));
      const schoolSet = allSettings.find(s => s.schoolName && s.schoolName.trim() !== '')
        || allSettings.find(s => s.asaasApiKey)
        || allSettings[0];
      if (!schoolSet?.asaasApiKey) throw new Error("Escola sem Asaas configurado.");
      try {
        const status = await getAsaasChargeStatus(input.chargeId, decryptSecret(schoolSet.asaasApiKey));
        const paid = ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH", "DETERMINED"].includes(String(status).toUpperCase());
        return { paid, status: String(status) };
      } catch (e) {
        return { paid: false, status: "unknown" };
      }
    }),

  // 5. Confirma a Matrícula após pagamento (ou sem gateway)
  submitEnrollment: publicProcedure
    .input(
      z.object({
        code: z.string(),
        studentName: z.string().min(2),
        studentPhone: z.string().min(8),
        studentEmail: z.string().email().optional(),
        studentCpf: z.string().optional(),
        birthDate: z.string().optional(),
        guardianName: z.string().optional(),
        guardianCpf: z.string().optional(),
        guardianPhone: z.string().optional(),
        guardianEmail: z.string().optional(),
        // Multi-curso (novo): cada curso com plano, dia da semana e horário
        courses: z.array(z.object({
          instrumentId: z.number(),
          planId: z.number().optional(),
          weekday: z.number().int().min(0).max(6).optional(),
          timeStr: z.string().optional(),
          teacherUserId: z.number().optional(),
          studioRoomId: z.number().optional(),
        })).max(6).optional(),
        dueDay: z.number().int().min(1).max(31).optional(),
        // Legado (1 curso em data específica)
        instrumentId: z.number().optional(),
        teacherUserId: z.number().optional(),
        studioRoomId: z.number().optional(),
        dateStr: z.string().optional(),
        timeStr: z.string().optional(),
        asaasChargeId: z.string().optional(),
        infinitepaySlug: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const [link] = await db
        .select()
        .from(enrollmentLinks)
        .where(eq(enrollmentLinks.code, input.code))
        .limit(1);

      if (!link || (link.status !== "active" && link.status !== "pending_payment")) {
        throw new Error("Link expirado ou já utilizado.");
      }
      if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
        await db.update(enrollmentLinks).set({ status: "expired" }).where(eq(enrollmentLinks.id, link.id));
        throw new Error("Link de matrícula expirado.");
      }

      const orgId = link.organizationId;

      // ── Monta a lista de cursos (multi-curso novo ou 1 curso legado) ──
      type CourseInput = { instrumentId: number; planId?: number; weekday?: number; timeStr?: string; teacherUserId?: number; studioRoomId?: number; dateStr?: string };
      let coursesToEnroll: CourseInput[] = [];
      if (input.courses && input.courses.length > 0) {
        coursesToEnroll = input.courses as CourseInput[];
      } else if (input.instrumentId) {
        coursesToEnroll = [{
          instrumentId: input.instrumentId,
          teacherUserId: input.teacherUserId,
          studioRoomId: input.studioRoomId,
          dateStr: input.dateStr,
          timeStr: input.timeStr,
        }];
      }
      if (coursesToEnroll.length === 0) {
        throw new Error("Selecione ao menos um curso.");
      }

      // Anti-IDOR: valida professores e instrumentos contra a organização do link
      for (const c of coursesToEnroll) {
        if (c.teacherUserId) {
          const [validTeacher] = await db.select({ id: users.id }).from(users)
            .where(and(eq(users.id, c.teacherUserId), eq(users.organizationId, orgId))).limit(1);
          if (!validTeacher) throw new Error("Professor inválido para esta escola.");
        }
        const [validInstrument] = await db.select({ id: instruments.id }).from(instruments)
          .where(and(eq(instruments.id, c.instrumentId), eq(instruments.organizationId, orgId))).limit(1);
        if (!validInstrument) throw new Error("Instrumento inválido para esta escola.");
      }

      // Busca o settings mais completo para pegar lessonDuration correto
      const allSettings3 = await db.select({ lessonDuration: settings.lessonDuration, schoolName: settings.schoolName, asaasApiKey: settings.asaasApiKey, asaasEnabled: settings.asaasEnabled, mpAccessToken: settings.mpAccessToken, paymentGateway: settings.paymentGateway, infinitepayHandle: settings.infinitepayHandle, infinitepayApiKey: settings.infinitepayApiKey, infinitepayEnabled: settings.infinitepayEnabled }).from(settings).where(eq(settings.organizationId, orgId));
      const bestSettings3 = allSettings3.find(s => s.schoolName && s.schoolName.trim() !== '')
        || allSettings3.find(s => s.asaasApiKey || s.mpAccessToken)
        || allSettings3[0];
      const schoolSet = bestSettings3;
      const lessonDuration = schoolSet?.lessonDuration ?? 60;

      // Planos & Bolsas + instrumentos + professores da escola
      const orgPlans = await db.select().from(schoolPlans).where(eq(schoolPlans.organizationId, orgId));
      const planById = new Map<number, any>(orgPlans.map((p: any) => [p.id, p]));
      const orgInstruments = await db.select().from(instruments).where(eq(instruments.organizationId, orgId));
      const instrumentsById = new Map<number, any>(orgInstruments.map((i: any) => [i.id, i]));
      const orgTeachers = await db.select({ userId: professores.userId, especialidade: professores.especialidade }).from(professores).where(eq(professores.organizationId, orgId));
      const resolveTeacher = (instrumentId: number, teacherUserId?: number): number | null => {
        if (teacherUserId) return teacherUserId;
        const name = (instrumentsById.get(instrumentId)?.name || "").toLowerCase();
        const t = orgTeachers.find((x: any) => (x.especialidade || "").toLowerCase().includes(name)) || orgTeachers[0];
        return t?.userId ?? null;
      };

      const enrichedCourses = coursesToEnroll.map((c) => {
        if (c.planId && !planById.has(c.planId)) {
          throw new Error("Plano de curso inválido para esta escola.");
        }
        const plan = c.planId ? planById.get(c.planId) : null;
        return {
          ...c,
          planId: plan?.id ?? null,
          monthlyFee: plan ? Number(plan.valorMensal) : (link.monthlyFee ? Number(link.monthlyFee) : 150),
          enrollmentFee: plan ? Number(plan.taxaInscricao ?? 0) : 0,
          durationMonths: plan ? Math.max(1, Number(plan.duracaoMeses || 1)) : 1,
          lessonsPerWeek: plan ? Math.max(1, Number(plan.aulasPorSemana || 1)) : 1,
        };
      });
      // Valida professor de CADA curso ANTES de criar o aluno (evita curso sem aulas)
      const teacherByCourse = new Map<number, number>();
      for (const c of enrichedCourses) {
        const t = resolveTeacher(c.instrumentId, c.teacherUserId);
        if (!t) throw new Error("Há um curso selecionado sem professor disponível. Escolha outro curso ou contate a escola.");
        teacherByCourse.set(c.instrumentId, t);
      }
      // O PLANO já cobre os instrumentos → cobra 1x por plano distinto (valor + taxa)
      const seenPlanKeys = new Set<number>();
      const billable: { monthlyFee: number; enrollmentFee: number; durationMonths: number }[] = [];
      for (const c of enrichedCourses) {
        const key = c.planId ?? -1;
        if (seenPlanKeys.has(key)) continue;
        seenPlanKeys.add(key);
        billable.push({ monthlyFee: c.monthlyFee, enrollmentFee: c.enrollmentFee, durationMonths: c.durationMonths });
      }
      const totalMonthlyFee = billable.reduce((s, c) => s + c.monthlyFee, 0);
      const totalEnrollmentFee = billable.reduce((s, c) => s + c.enrollmentFee, 0);
      // Total esperado no ato = 1ª mensalidade + taxa de inscrição (por curso)
      const expectedTotal = totalMonthlyFee + totalEnrollmentFee;
      const TOLERANCE = 0.05; // tolerância de centavos

      // AUDIT-P0 FIX (fraude): se a escola COBRA matrícula (gateway configurado),
      // verificar o pagamento SERVER-SIDE (status E valor) antes de criar aluno/aula.
      const gateway = (schoolSet as any)?.paymentGateway || "asaas";
      const hasAsaas = !!(schoolSet?.asaasApiKey && (schoolSet?.asaasEnabled === 1 || (schoolSet?.asaasEnabled as any) === true));
      const hasMercadoPago = !!schoolSet?.mpAccessToken;
      const hasInfinitePay = !!(schoolSet?.infinitepayHandle && (schoolSet?.infinitepayEnabled as any) === 1);
      const infinitepayActive = hasInfinitePay && (gateway === "infinitepay" || (!hasAsaas && !hasMercadoPago));
      const requiresPayment = hasAsaas || infinitepayActive || ((gateway === "mercadopago") && hasMercadoPago);

      if (requiresPayment) {
        let paymentVerified = false;
        let paidAmount = 0;

        if (hasAsaas) {
          if (!input.asaasChargeId) {
            throw new Error("Pagamento da matrícula é obrigatório. Gere a cobrança e conclua o pagamento antes de confirmar.");
          }
          try {
            const charge = await getAsaasCharge(input.asaasChargeId, decryptSecret(schoolSet!.asaasApiKey!));
            const st = String((charge as any)?.status || "").toUpperCase();
            paidAmount = Number((charge as any)?.value || 0);
            paymentVerified = ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH", "DETERMINED"].includes(st) && paidAmount + TOLERANCE >= expectedTotal;
          } catch (e) {
            console.error("[Enrollment] Falha ao verificar cobrança Asaas:", e);
            paymentVerified = false;
          }
        } else if (infinitepayActive) {
          // InfinitePay: revalidação server-to-server via payment_check (status + valor)
          try {
            const check = await checkInfinitePayPayment({
              handle: schoolSet!.infinitepayHandle!,
              orderNsu: `enrollment_${link.code}`,
              slug: input.infinitepaySlug || undefined,
              apiKey: resolveInfinitePayApiKey((schoolSet as any).infinitepayApiKey ?? null),
            });
            // checkInfinitePayPayment devolve paidAmount em CENTAVOS → converte para reais
            paidAmount = Number((check as any).paidAmount || 0) / 100;
            paymentVerified = check.paid === true && paidAmount + TOLERANCE >= expectedTotal;
          } catch (e) {
            console.error("[Enrollment] Falha ao verificar pagamento InfinitePay:", e);
            paymentVerified = false;
          }
        } else {
          // Mercado Pago: busca pagamento APROVADO pela referência externa e valida o valor
          try {
            const searchUrl = `https://api.mercadopago.com/v1/payments/search?external_reference=enrollment_${link.code}&sort=date_created&criteria=desc`;
            const mpResp = await fetch(searchUrl, {
              headers: { Authorization: `Bearer ${decryptSecret(schoolSet!.mpAccessToken!)}` },
            });
            if (mpResp.ok) {
              const mpData: any = await mpResp.json();
              const approved = (mpData.results || []).find((p: any) => p.status === "approved");
              paidAmount = Number(approved?.transaction_amount || 0);
              paymentVerified = !!approved && paidAmount + TOLERANCE >= expectedTotal;
            }
          } catch (e) {
            console.error("[Enrollment] Falha ao verificar pagamento MP:", e);
            paymentVerified = false;
          }
        }

        if (!paymentVerified) {
          throw new Error("Pagamento não confirmado (ou valor insuficiente). Conclua o pagamento correto da matrícula e tente novamente.");
        }
      }

      // ── Idempotência: evita duplicar a MESMA pessoa (nome + contato).
      // NÃO bloqueia por telefone/e-mail isolados: irmãos costumam compartilhar
      // o WhatsApp/e-mail do responsável e seriam bloqueados indevidamente. ──
      const studentName = input.studentName.trim();
      const studentEmail = input.studentEmail?.trim() || null;
      const studentPhone = input.studentPhone?.trim() || null;
      const dupConds = [];
      if (studentEmail) dupConds.push(and(eq(students.name, studentName), eq(students.email, studentEmail)));
      if (studentPhone) dupConds.push(and(eq(students.name, studentName), eq(students.phone, studentPhone)));
      if (dupConds.length > 0) {
        const [existingStudent] = await db.select({ id: students.id })
          .from(students)
          .where(and(eq(students.organizationId, orgId), or(...dupConds)))
          .limit(1);
        if (existingStudent) {
          throw new Error("Já existe um aluno cadastrado com estes dados. Entre em contato com a escola.");
        }
      }

      // Re-checagem de horário — apenas no modo LEGADO (data específica).
      // No modo recorrente (multi-curso) o gerador de aulas já evita conflitos.
      if (!input.courses && input.dateStr && input.timeStr && input.teacherUserId) {
        const scheduledAt = new Date(`${input.dateStr}T${input.timeStr}:00.000-03:00`);
        const slotStart = scheduledAt.getTime();
        const slotEnd = slotStart + lessonDuration * 60_000;
        const sameDayLessons = await db
          .select({ scheduledAt: lessons.scheduledAt, duration: lessons.duration })
          .from(lessons)
          .where(and(
            eq(lessons.organizationId, orgId),
            eq(lessons.userId, input.teacherUserId),
            eq(lessons.status, "agendada"),
            gte(lessons.scheduledAt, new Date(slotStart - 12 * 3_600_000)),
            lte(lessons.scheduledAt, new Date(slotStart + 12 * 3_600_000)),
          ));
        const hasConflict = sameDayLessons.some((l: any) => {
          const s = new Date(l.scheduledAt).getTime();
          const e = s + (l.duration || 60) * 60_000;
          return slotStart < e && slotEnd > s;
        });
        if (hasConflict) {
          throw new Error("Este horário acabou de ser ocupado. Volte e escolha outro horário.");
        }
        if (input.studioRoomId) {
          const roomLessons = await db
            .select({ scheduledAt: lessons.scheduledAt, duration: lessons.duration })
            .from(lessons)
            .where(and(
              eq(lessons.organizationId, orgId),
              eq(lessons.studioRoomId, input.studioRoomId),
              eq(lessons.status, "agendada"),
              gte(lessons.scheduledAt, new Date(slotStart - 12 * 3_600_000)),
              lte(lessons.scheduledAt, new Date(slotStart + 12 * 3_600_000)),
            ));
          const roomConflict = roomLessons.some((l: any) => {
            const s = new Date(l.scheduledAt).getTime();
            const e = s + (l.duration || 60) * 60_000;
            return slotStart < e && slotEnd > s;
          });
          if (roomConflict) {
            throw new Error("Esta sala acabou de ser ocupada. Volte e escolha outro horário.");
          }
        }
      }

      // Cadastra o Aluno (curso principal = 1º selecionado; mensalidade = soma dos cursos)
      const firstCourse = enrichedCourses[0];
      const firstTeacher = teacherByCourse.get(firstCourse.instrumentId)!;
      const brtDay = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })).getDay();
      const [newStudent] = await db
        .insert(students)
        .values({
          organizationId: orgId,
          userId: firstTeacher,
          professorId: firstTeacher,
          name: input.studentName,
          phone: input.studentPhone,
          email: input.studentEmail || undefined,
          cpf: input.studentCpf || undefined,
          birthDate: input.birthDate ? input.birthDate.slice(0, 10) : undefined,
          guardianName: input.guardianName || undefined,
          guardianCpf: input.guardianCpf || undefined,
          guardianPhone: input.guardianPhone || undefined,
          guardianEmail: input.guardianEmail || undefined,
          instrumentId: firstCourse.instrumentId,
          schoolPlanId: firstCourse.planId ?? undefined,
          status: "ativo",
          monthlyFee: totalMonthlyFee.toFixed(2),
          dueDay: input.dueDay || new Date().getDate(),
        })
        .returning();

      // Cria as matrículas, as aulas e as mensalidades
      const { generateLessonsForEnrollment, generateMonthlyDues } = await import("./services/EnrollmentGenerationService");
      let totalLessons = 0;
      let firstLessonId: number | null = null;
      const duesCourses: { monthlyFee: number; durationMonths: number }[] = billable.map((c) => ({ monthlyFee: c.monthlyFee, durationMonths: c.durationMonths }));

      for (const c of enrichedCourses) {
        const teacherUserId = teacherByCourse.get(c.instrumentId)!;
        const courseName = instrumentsById.get(c.instrumentId)?.name || "Música";

        await db.insert(studentEnrollments).values({
          organizationId: orgId,
          studentId: newStudent.id,
          instrumentId: c.instrumentId,
          planId: c.planId ?? null,
          teacherUserId,
          studioRoomId: c.studioRoomId ?? null,
          durationMonths: c.durationMonths,
          lessonsPerWeek: c.lessonsPerWeek,
          weekday: c.weekday ?? brtDay,
          timeStr: c.timeStr || null,
          monthlyFee: c.monthlyFee.toFixed(2),
          enrollmentFee: c.enrollmentFee.toFixed(2),
          startDate: new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
          status: "ativo",
        });

        if (c.weekday !== undefined && c.timeStr) {
          totalLessons += await generateLessonsForEnrollment(db, {
            orgId,
            studentId: newStudent.id,
            teacherUserId,
            studioRoomId: c.studioRoomId ?? null,
            instrumentId: c.instrumentId,
            courseName,
            durationMonths: c.durationMonths,
            lessonsPerWeek: c.lessonsPerWeek,
            weekday: c.weekday,
            timeStr: c.timeStr,
            durationMin: lessonDuration,
          });
        } else if (c.dateStr && c.timeStr) {
          // Legado: aula única em data específica
          const scheduledAt = new Date(`${c.dateStr}T${c.timeStr}:00.000-03:00`);
          const [newLesson] = await db
            .insert(lessons)
            .values({
              organizationId: orgId,
              userId: teacherUserId,
              studentId: newStudent.id,
              title: `Aula de ${courseName} - ${newStudent.name}`,
              scheduledAt,
              duration: lessonDuration,
              status: "agendada",
              instrumentId: c.instrumentId,
              studioRoomId: c.studioRoomId || undefined,
            })
            .returning();
          if (!firstLessonId) firstLessonId = newLesson.id;
          totalLessons++;
        }
      }

      // Mensalidades dos meses seguintes (o 1º mês é pago no ato da matrícula)
      const nowBrt = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
      await generateMonthlyDues(db, {
        orgId,
        userId: newStudent.userId,
        studentId: newStudent.id,
        courses: duesCourses,
        dueDay: input.dueDay || nowBrt.getDate(),
        startMonth: nowBrt.getMonth() + 1,
        startYear: nowBrt.getFullYear(),
      });

      // Atualiza o Lead no CRM para "matriculado"
      if (link.leadId) {
        await db
          .update(crmLeads)
          .set({ stage: "matriculado", updatedAt: new Date() })
          .where(eq(crmLeads.id, link.leadId));
      }

      // Marca o link como usado
      await db
        .update(enrollmentLinks)
        .set({ status: "used" })
        .where(eq(enrollmentLinks.id, link.id));

      // Gera contrato + assinatura digital (best-effort; NÃO bloqueia a matrícula)
      let contract: { signUrl: string; contractId: number; contractNumber: string | null } | null = null;
      try {
        const { generateEnrollmentContract } = await import("./services/EnrollmentContractService");
        contract = await generateEnrollmentContract(db, orgId, newStudent.id, {
          templateId: link.contractTemplateId ?? null,
          monthlyFee: totalMonthlyFee.toFixed(2),
          startDate: new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
        });
      } catch (e) {
        console.warn("[Enrollment] Falha ao gerar contrato (matrícula mantida):", e);
      }

      return {
        success: true,
        studentId: newStudent.id,
        lessonId: firstLessonId,
        lessonsCreated: totalLessons,
        contractSignUrl: contract?.signUrl ?? null,
        contractId: contract?.contractId ?? null,
        contractNumber: contract?.contractNumber ?? null,
      };
    }),

  // 6. Verifica se o pagamento MP foi realmente efetuado antes de prosseguir
  verifyMPPayment: publicProcedure
    .input(
      z.object({
        code: z.string(),        // código do link de matrícula (para buscar o accessToken da escola)
        paymentId: z.string(),   // payment_id retornado pelo MP na URL de redirect
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      // Busca o link para obter orgId
      const [link] = await db
        .select()
        .from(enrollmentLinks)
        .where(eq(enrollmentLinks.code, input.code))
        .limit(1);

      if (!link) throw new Error("Link não encontrado");

      // Busca o settings com mpAccessToken
      const allSettings = await db.select().from(settings).where(eq(settings.organizationId, link.organizationId));
      const schoolSet = allSettings.find(s => s.schoolName && s.schoolName.trim() !== '')
        || allSettings.find(s => s.asaasApiKey || s.mpAccessToken)
        || allSettings[0];

      if (!schoolSet?.mpAccessToken) {
        throw new Error("Escola sem Mercado Pago configurado.");
      }

      // Consulta a API do MP com o payment_id real
      const result = await verifyMPPayment(input.paymentId, decryptSecret(schoolSet.mpAccessToken));

      return {
        verified: result.verified,
        status: result.status,       // "approved" | "pending" | "rejected" | etc.
        externalReference: result.externalReference,
      };
    }),

  // 7. Verifica pagamento MP buscando pelos pagamentos mais recentes com external_reference = enrollment_${code}
  verifyMPByReference: publicProcedure
    .input(
      z.object({
        code: z.string(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const [link] = await db
        .select()
        .from(enrollmentLinks)
        .where(eq(enrollmentLinks.code, input.code))
        .limit(1);

      if (!link) throw new Error("Link não encontrado");

      const allSettings = await db.select().from(settings).where(eq(settings.organizationId, link.organizationId));
      const schoolSet = allSettings.find(s => s.schoolName && s.schoolName.trim() !== '')
        || allSettings.find(s => s.asaasApiKey || s.mpAccessToken)
        || allSettings[0];

      if (!schoolSet?.mpAccessToken) {
        throw new Error("Escola sem Mercado Pago configurado.");
      }

      // Busca na API do Mercado Pago por pagamentos referentes a essa matrícula
      const searchUrl = `https://api.mercadopago.com/v1/payments/search?external_reference=enrollment_${input.code}&sort=date_created&criteria=desc`;
      const response = await fetch(searchUrl, {
        headers: { Authorization: `Bearer ${decryptSecret(schoolSet.mpAccessToken)}` },
      });

      if (!response.ok) {
        return { verified: false, status: "unknown" };
      }

      const data = await response.json();
      const latestPayment = data.results?.[0];

      if (!latestPayment) {
        return { verified: false, status: "not_found" };
      }

      const status = latestPayment.status as string;
      const verified = status === "approved" || status === "pending" || status === "in_process";

      return {
        verified,
        status,
        paymentId: String(latestPayment.id),
      };
    }),

  // 8. Verifica pagamento InfinitePay da matrícula (server-to-server via payment_check)
  verifyInfinitePayPayment: publicProcedure
    .input(
      z.object({
        code: z.string(),            // código do link de matrícula
        slug: z.string().optional(), // invoice_slug recebido na criação da cobrança (se disponível)
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const [link] = await db
        .select()
        .from(enrollmentLinks)
        .where(eq(enrollmentLinks.code, input.code))
        .limit(1);

      if (!link) throw new Error("Link não encontrado");

      const allSettings = await db.select().from(settings).where(eq(settings.organizationId, link.organizationId));
      const schoolSet = allSettings.find(s => s.schoolName && s.schoolName.trim() !== '')
        || allSettings.find(s => s.asaasApiKey || s.mpAccessToken || s.infinitepayHandle)
        || allSettings[0];

      if (!schoolSet?.infinitepayHandle || (schoolSet.infinitepayEnabled as any) !== 1) {
        throw new Error("Escola sem InfinitePay configurado.");
      }

      const check = await checkInfinitePayPayment({
        handle: schoolSet.infinitepayHandle,
        orderNsu: `enrollment_${input.code}`,
        slug: input.slug || undefined,
        apiKey: resolveInfinitePayApiKey(schoolSet.infinitepayApiKey ?? null),
      });

      return {
        verified: check.paid === true,
        paid: check.paid === true,
        paidAmount: check.paidAmount ?? null,
        captureMethod: check.captureMethod ?? null,
      };
    }),
});
