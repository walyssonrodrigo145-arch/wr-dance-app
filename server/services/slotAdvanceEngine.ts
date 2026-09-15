import { debugLog } from "../_core/logger";
import { getDb } from "../db";
import { lessons, students, settings, slotOffers, users, notifications } from "../../drizzle/schema";
import { eq, and, gt, gte, lte, or, sql, isNull, inArray } from "drizzle-orm";
import { sendSmartWhatsAppNotification } from "../utils/whatsappRouting";
import { notifyUser } from "../_core/notification";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export interface SlotAdvanceTriggerParams {
  lessonId: number;
  organizationId: number;
  userId: number;
}

/**
 * Gatilho executado imediatamente quando uma aula é marcada como 'falta'.
 * Identifica alunos com horários posteriores no mesmo dia e envia a oferta de antecipação.
 */
export async function triggerSlotAdvanceOnAbsence({ lessonId, organizationId, userId }: SlotAdvanceTriggerParams) {
  try {
    const db = await getDb();
    if (!db) return;

    // 1. Verificar se a automação está habilitada nas configurações da escola
    const [userSettings] = await db
      .select({
        autoAdvanceSlotsEnabled: settings.autoAdvanceSlotsEnabled,
        autoAdvanceWhatsAppTemplate: settings.autoAdvanceWhatsAppTemplate,
        whatsappBotUrl: settings.whatsappBotUrl,
        whatsappBotToken: settings.whatsappBotToken,
        schoolName: settings.schoolName,
      })
      .from(settings)
      .where(eq(settings.organizationId, organizationId))
      .limit(1);

    if (!userSettings || userSettings.autoAdvanceSlotsEnabled !== 1) {
      debugLog("[SlotAdvance] Automação desativada nas configurações da organização", organizationId);
      return;
    }

    // 2. Buscar dados da aula que teve falta registrada
    const [absentLesson] = await db
      .select({
        id: lessons.id,
        scheduledAt: lessons.scheduledAt,
        duration: lessons.duration,
        instrumentId: lessons.instrumentId,
        title: lessons.title,
        userId: lessons.userId,
        studentId: lessons.studentId,
        lessonType: lessons.lessonType,
      })
      .from(lessons)
      .where(and(eq(lessons.id, lessonId), eq(lessons.organizationId, organizationId)))
      .limit(1);

    if (!absentLesson) {
      console.warn("[SlotAdvance] Aula não encontrada:", lessonId);
      return;
    }

    const lessonDate = new Date(absentLesson.scheduledAt);
    const now = new Date();

    // Tolerância de 60 min caso a falta seja marcada logo após o início do horário
    if (lessonDate.getTime() + 60 * 60000 < now.getTime()) {
      debugLog("[SlotAdvance] Horário da falta já passou há mais de 1h:", lessonDate);
      return;
    }

    // 3. Criar ou reutilizar oferta aberta para esta mesma aula
    const [existingOffer] = await db
      .select({ id: slotOffers.id })
      .from(slotOffers)
      .where(and(
        eq(slotOffers.originalLessonId, lessonId),
        eq(slotOffers.organizationId, organizationId),
        eq(slotOffers.status, "aberta")
      ))
      .limit(1);

    let offerId = existingOffer?.id;
    const isNewOffer = !offerId;

    if (!offerId) {
      const [newOffer] = await db
        .insert(slotOffers)
        .values({
          organizationId,
          originalLessonId: lessonId,
          teacherId: absentLesson.userId,
          slotDate: lessonDate,
          duration: absentLesson.duration || 60,
          instrumentId: absentLesson.instrumentId,
          title: absentLesson.title,
          status: "aberta",
          expiresAt: new Date(lessonDate.getTime() + (absentLesson.duration || 60) * 60000),
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning({ id: slotOffers.id });

      offerId = newOffer.id;
    } else {
      // Oferta já existia — atualizar updatedAt para marcar que voltou a ser disparada
      await db.update(slotOffers)
        .set({ updatedAt: new Date() })
        .where(eq(slotOffers.id, offerId));
    }

    // 4. Buscar alunos com aula no MESMO DIA CALENDÁRIO após o horário vago
    // Janela: do horário da falta até 23:59:59 do mesmo dia (sem cruzar a meia-noite)
    const windowEnd = new Date(lessonDate);
    windowEnd.setHours(23, 59, 59, 999);

    const candidateLessons = await db
      .select({
        id: lessons.id,
        scheduledAt: lessons.scheduledAt,
        studentId: lessons.studentId,
        studentName: students.name,
        studentPhone: students.phone,
        guardianPhone: students.guardianPhone,
        birthDate: students.birthDate,
        studentUserId: students.studentUserId,
        teacherName: users.name,
      })
      .from(lessons)
      .innerJoin(students, eq(lessons.studentId, students.id))
      .leftJoin(users, eq(lessons.userId, users.id))
      .where(and(
        eq(lessons.organizationId, organizationId),
        eq(lessons.userId, absentLesson.userId), // Mesmo professor
        eq(lessons.status, "agendada"),
        gt(lessons.scheduledAt, lessonDate), // Horário posterior
        lte(lessons.scheduledAt, windowEnd)
      ));

    if (candidateLessons.length === 0) {
      debugLog("[SlotAdvance] Nenhum aluno com aula posterior encontrado para hoje.");
      return;
    }

    const formattedVaga = format(lessonDate, "HH:mm");
    const formattedData = format(lessonDate, "dd/MM");
    const teacherDisplayName = candidateLessons[0]?.teacherName || "seu professor";

    debugLog(`[SlotAdvance] Ofertando vaga das ${formattedVaga} para ${candidateLessons.length} alunos elegíveis.`);

    const appUrl = (process.env.APP_URL && !process.env.APP_URL.includes("localhost"))
      ? process.env.APP_URL
      : "https://wrmusicpro.com.br";
    const teacherSession = `prof_${absentLesson.userId || userId}`;

    // 5. Notificar cada aluno elegível via WhatsApp e In-App
    for (const cand of candidateLessons) {
      const alunoAtualHora = format(new Date(cand.scheduledAt), "HH:mm");

      const defaultMsg = `🎵 *VAGA DISPONÍVEL MAIS CEDO HOJE!* 🎵\n\nOlá, *${cand.studentName}*! Surgiu uma vaga livre hoje (${formattedData}) às *${formattedVaga}* com o(a) Prof. *${teacherDisplayName}*.\n\nSua aula está marcada para às *${alunoAtualHora}*. Gostaria de *antecipar sua aula para às ${formattedVaga}*?\n\n👉 Acesse seu Portal do Aluno para confirmar a vaga:\n${appUrl}/aluno\n\n_(Atenção: A vaga será confirmada pelo primeiro aluno que aceitar no portal)_`;

      const finalMessage = userSettings?.autoAdvanceWhatsAppTemplate
        ? userSettings.autoAdvanceWhatsAppTemplate
            .replace(/{nome_aluno}/g, cand.studentName)
            .replace(/{horario_vago}/g, formattedVaga)
            .replace(/{horario_atual}/g, alunoAtualHora)
            .replace(/{professor}/g, teacherDisplayName)
            .replace(/{link_portal}/g, `${appUrl}/aluno`)
        : defaultMsg;

      // Enviar WhatsApp usando a sessão ativa do professor (ex: prof_163)
      if (userSettings?.whatsappBotUrl && userSettings?.whatsappBotToken) {
        try {
          const res = await sendSmartWhatsAppNotification({
            sendToStudent: true,
            sendToGuardian: true,
            student: {
              phone: cand.studentPhone,
              guardianPhone: cand.guardianPhone,
              birthDate: cand.birthDate,
            },
            message: finalMessage,
            sessionId: teacherSession,
            whatsappConfig: {
              url: userSettings.whatsappBotUrl,
              token: userSettings.whatsappBotToken,
            }
          });
          debugLog(`[SlotAdvance] Envio WhatsApp para ${cand.studentName} (${cand.studentPhone}) via ${teacherSession}:`, res);
        } catch (e) {
          console.error(`[SlotAdvance] Erro ao enviar WhatsApp para ${cand.studentName}:`, e);
        }
      }

      // Notificação in-app se o aluno possuir usuário cadastrado
      if (cand.studentUserId) {
        try {
          await notifyUser(cand.studentUserId, {
            title: "⚡ Vaga mais cedo disponível hoje!",
            content: `Surgiu uma vaga às ${formattedVaga} com Prof. ${teacherDisplayName}. Toque para antecipar sua aula das ${alunoAtualHora}.`
          });
        } catch (e) {
          console.error(`[SlotAdvance] Erro ao enviar notificação in-app para usuário ${cand.studentUserId}:`, e);
        }
      }
    }
  } catch (error) {
    console.error("[SlotAdvance] Erro na rotina de antecipação automática:", error);
  }
}
