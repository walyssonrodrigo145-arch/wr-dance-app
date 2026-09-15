import { debugLog } from "./_core/logger";
import { z } from "zod";
import { router, studentProcedure, protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { slotOffers, lessons, students, users, settings, instruments, reminders } from "../drizzle/schema";
import { eq, and, gt, gte, lte, lt, or, sql, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { notifyUser } from "./_core/notification";
import { sendSmartWhatsAppNotification } from "./utils/whatsappRouting";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export const slotAdvanceRouter = router({
  // ─ Buscar vagas antecipadas disponíveis para o aluno logado hoje ──────────
  getAvailableEarlySlots: studentProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];

    const orgId = ctx.user.organizationId!;

    // 1. Identificar o cadastro do aluno correspondente a esta conta
    let studentId = (ctx.user as any).studentId;

    if (!studentId) {
      const [found] = await db
        .select({ id: students.id })
        .from(students)
        .where(and(
          eq(students.organizationId, orgId),
          or(
            eq(students.studentUserId, ctx.user.id),
            eq(students.email, ctx.user.email || "")
          )
        ))
        .limit(1);
      if (found) studentId = found.id;
    }

    if (!studentId) return [];

    // 2. Buscar a próxima aula agendada do aluno (últimas 2 horas até próximas 18 horas)
    const now = new Date();
    const windowStart = new Date(now.getTime() - 2 * 3600 * 1000);
    const windowEnd = new Date(now.getTime() + 18 * 3600 * 1000);

    const [todayLesson] = await db
      .select({
        id: lessons.id,
        scheduledAt: lessons.scheduledAt,
        duration: lessons.duration,
        teacherId: lessons.userId,
        title: lessons.title,
        instrumentId: lessons.instrumentId,
      })
      .from(lessons)
      .where(and(
        eq(lessons.organizationId, orgId),
        eq(lessons.studentId, studentId),
        eq(lessons.status, "agendada"),
        gte(lessons.scheduledAt, windowStart),
        lte(lessons.scheduledAt, windowEnd)
      ))
      .orderBy(lessons.scheduledAt)
      .limit(1);

    if (!todayLesson) return [];

    // 3. Buscar ofertas de vagas abertas com o mesmo professor e ANTES da aula atual
    const tolerance = new Date(now.getTime() - 4 * 3600 * 1000); // Janela flexível de vagas abertas

    const offers = await db
      .select({
        id: slotOffers.id,
        slotDate: slotOffers.slotDate,
        duration: slotOffers.duration,
        title: slotOffers.title,
        instrumentId: slotOffers.instrumentId,
        teacherId: slotOffers.teacherId,
        teacherName: users.name,
        instrumentName: instruments.name,
      })
      .from(slotOffers)
      .leftJoin(users, eq(slotOffers.teacherId, users.id))
      .leftJoin(instruments, eq(slotOffers.instrumentId, instruments.id))
      .where(and(
        eq(slotOffers.organizationId, orgId),
        eq(slotOffers.teacherId, todayLesson.teacherId), // Mesmo professor
        eq(slotOffers.status, "aberta"),
        gt(slotOffers.slotDate, tolerance), // Horário da vaga ainda válido
        lt(slotOffers.slotDate, todayLesson.scheduledAt) // Vaga é mais cedo que o horário do aluno
      ));

    return offers.map(offer => ({
      ...offer,
      studentLessonId: todayLesson.id,
      currentLessonTime: todayLesson.scheduledAt,
      formattedSlotTime: format(new Date(offer.slotDate), "HH:mm"),
      formattedCurrentTime: format(new Date(todayLesson.scheduledAt), "HH:mm"),
      formattedDate: format(new Date(offer.slotDate), "dd 'de' MMMM", { locale: ptBR }),
    }));
  }),

  // ─ Aluno aceita antecipar o horário de sua aula de hoje ────────────────────
  acceptEarlySlot: studentProcedure
    .input(z.object({
      slotOfferId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });

      const orgId = ctx.user.organizationId!;

      // 1. Identificar o aluno
      let studentRecord: any = null;
      let sId = (ctx.user as any).studentId;

      if (sId) {
        const [found] = await db
          .select({
            id: students.id,
            name: students.name,
            phone: students.phone,
            guardianPhone: students.guardianPhone,
            birthDate: students.birthDate,
          })
          .from(students)
          .where(orgId
            ? and(eq(students.id, sId), eq(students.organizationId, orgId))
            : eq(students.id, sId))
          .limit(1);
        studentRecord = found;
      } else {
        const [found] = await db
          .select({
            id: students.id,
            name: students.name,
            phone: students.phone,
            guardianPhone: students.guardianPhone,
            birthDate: students.birthDate,
          })
          .from(students)
          .where(and(
            eq(students.organizationId, orgId),
            or(
              eq(students.studentUserId, ctx.user.id),
              eq(students.email, ctx.user.email || "")
            )
          ))
          .limit(1);
        studentRecord = found;
      }

      if (!studentRecord) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Perfil de aluno não encontrado." });
      }

      // 2. Buscar a aula do aluno para hoje
      const now = new Date();
      const windowStart = new Date(now.getTime() - 2 * 3600 * 1000);
      const windowEnd = new Date(now.getTime() + 18 * 3600 * 1000);

      const [todayLesson] = await db
        .select({
          id: lessons.id,
          scheduledAt: lessons.scheduledAt,
          userId: lessons.userId,
        })
        .from(lessons)
        .where(and(
          eq(lessons.organizationId, orgId),
          eq(lessons.studentId, studentRecord.id),
          eq(lessons.status, "agendada"),
          gte(lessons.scheduledAt, windowStart),
          lte(lessons.scheduledAt, windowEnd)
        ))
        .orderBy(lessons.scheduledAt)
        .limit(1);

      if (!todayLesson) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Você não possui aula agendada para hoje para poder antecipar." });
      }

      // 3. Atualização Atômica com trava de concorrência na oferta
      // AUDIT-P2 FIX: validar ANTES que a oferta é do professor da aula de hoje —
      // impede antecipar aula para o horário vago de outro professor da escola
      const [offerPreview] = await db
        .select({ id: slotOffers.id, teacherId: slotOffers.teacherId })
        .from(slotOffers)
        .where(and(
          eq(slotOffers.id, input.slotOfferId),
          eq(slotOffers.organizationId, orgId),
        ))
        .limit(1);
      if (offerPreview && offerPreview.teacherId !== todayLesson.userId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Esta vaga pertence a outro professor. Aguarde uma vaga do seu professor.",
        });
      }

      const [acceptedOffer] = await db
        .update(slotOffers)
        .set({
          status: "aceita",
          acceptedByStudentId: studentRecord.id,
          acceptedLessonId: todayLesson.id,
          acceptedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(
          eq(slotOffers.id, input.slotOfferId),
          eq(slotOffers.organizationId, orgId),
          eq(slotOffers.status, "aberta")
        ))
        .returning({
          id: slotOffers.id,
          slotDate: slotOffers.slotDate,
          teacherId: slotOffers.teacherId,
        });

      if (!acceptedOffer) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Esta vaga já foi preenchida por outro aluno ou não está mais disponível."
        });
      }

      const previousTime = format(new Date(todayLesson.scheduledAt), "HH:mm");
      const newTime = format(new Date(acceptedOffer.slotDate), "HH:mm");

      // 4. Atualizar a data da aula do aluno para o novo horário antecipado
      await db
        .update(lessons)
        .set({
          scheduledAt: acceptedOffer.slotDate,
          updatedAt: new Date(),
        })
        .where(and(
          eq(lessons.id, todayLesson.id),
          eq(lessons.organizationId, orgId)
        ));

      // 4.1 Cancelar lembretes pendentes da aula antiga para não disparar lembrete duplicado desnecessário
      try {
        await db
          .update(reminders)
          .set({
            status: "cancelado",
            cancelledAt: new Date(),
            updatedAt: new Date(),
          })
          .where(and(
            eq(reminders.lessonId, todayLesson.id),
            eq(reminders.organizationId, orgId),
            eq(reminders.status, "pendente")
          ));
      } catch (e) {
        console.warn("[SlotAdvance] Erro ao cancelar lembretes pendentes:", e);
      }

      // 5. Buscar dados do professor e configurações da escola
      // AUD-004 FIX: users não possui coluna `phone` — buscar apenas `name`.
      // O telefone da escola está em settings.phone (buscado abaixo).
      const [teacher] = await db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, acceptedOffer.teacherId))
        .limit(1);

      const [userSettings] = await db
        .select({
          whatsappBotUrl: settings.whatsappBotUrl,
          whatsappBotToken: settings.whatsappBotToken,
        })
        .from(settings)
        .where(eq(settings.organizationId, orgId))
        .limit(1);

      const teacherName = teacher?.name || "Seu Professor";

      // 6. Enviar mensagem de confirmação imediata via WhatsApp para o Aluno
      if (userSettings?.whatsappBotUrl && userSettings?.whatsappBotToken) {
        try {
          const confirmMsg = `✅ *AULA ANTECIPADA COM SUCESSO!* ✅\n\nOlá, *${studentRecord.name}*! Sua aula de hoje foi antecipada com sucesso das *${previousTime}* para às *${newTime}* com o(a) Prof. *${teacherName}*.\n\nTe esperamos no novo horário! 🎵`;
          const teacherSession = `prof_${acceptedOffer.teacherId}`;

          await sendSmartWhatsAppNotification({
            sendToStudent: true,
            sendToGuardian: true,
            student: {
              phone: studentRecord.phone,
              guardianPhone: studentRecord.guardianPhone,
              birthDate: studentRecord.birthDate,
            },
            message: confirmMsg,
            sessionId: teacherSession,
            whatsappConfig: {
              url: userSettings.whatsappBotUrl,
              token: userSettings.whatsappBotToken,
            },
          });
          debugLog(`[SlotAdvance] Mensagem de confirmação enviada para ${studentRecord.name} (${studentRecord.phone})`);
        } catch (e) {
          console.error("[SlotAdvance] Erro ao enviar mensagem de confirmação para o aluno:", e);
        }
      }

      // 7. Notificar o Professor e a Escola
      try {
        await notifyUser(acceptedOffer.teacherId, {
          title: "⚡ Horário de Aula Antecipado!",
          content: `O aluno ${studentRecord.name} antecipou a aula de hoje das ${previousTime} para às ${newTime}.`
        });
      } catch (e) {
        console.error("[SlotAdvance] Erro ao notificar professor:", e);
      }

      return {
        success: true,
        newTime,
        message: `Aula antecipada com sucesso para às ${newTime}!`
      };
    }),
});
