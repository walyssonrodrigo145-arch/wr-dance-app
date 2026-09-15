import { and, eq, lte, gte, asc, desc, sql, inArray } from "drizzle-orm";
import { students, lessons, paymentDues, reminders, settings, expenses, organizations } from "../../drizzle/schema";

export async function buildUserContext(db: any, userId: number, orgId: number, isUserAdmin: boolean = false): Promise<string> {
  const now = new Date();
  const todayStr = now.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

  try {
    // 1. Busca configurações da ESCOLA (não do usuário/professor aleatório).
    //    Usa a mesma lógica do enrollmentRouter: prioriza o registro com schoolName
    //    configurado (esse é o do admin/dono da escola), depois o com chave de pagamento,
    //    e por último o mais recente — NUNCA o primeiro aleatório com .limit(1).
    const allSettingsRows = await db.select().from(settings).where(eq(settings.organizationId, orgId));
    const userSettings = allSettingsRows.find((s: any) => s.schoolName && s.schoolName.trim() !== '')
      || allSettingsRows.find((s: any) => s.asaasApiKey || s.mpAccessToken || s.schoolHours)
      || allSettingsRows.sort((a: any, b: any) => b.id - a.id)[0];

    // 1.5. Verifica se é dono da organização
    if (!isUserAdmin) {
      const [org] = await db.select({ ownerId: organizations.ownerId }).from(organizations).where(eq(organizations.id, orgId)).limit(1);
      if (org?.ownerId === userId) {
        isUserAdmin = true;
      }
    }

    // 2. Busca total de alunos ativos
    const activeStudents = await db.select({ id: students.id }).from(students).where(
      and(
        eq(students.status, "ativo"),
        eq(students.organizationId, orgId),
        isUserAdmin ? undefined : eq(students.professorId, userId)
      )
    );

    // 3. Busca aulas agendadas para os próximos 7 dias a partir do início de hoje
    // Início do dia no fuso de Brasília (o servidor roda em UTC — usar o fuso
    // local distorcia "aulas de hoje" para ~9h antes do dia começar no Brasil).
    const startOfDay = new Date(`${todayStr}T00:00:00-03:00`);
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const upcomingLessons = await db.select({
      title: lessons.title,
      scheduledAt: lessons.scheduledAt,
      studentName: students.name,
    }).from(lessons)
      .leftJoin(students, eq(lessons.studentId, students.id))
      .where(
        and(
          eq(lessons.organizationId, orgId),
          isUserAdmin ? undefined : eq(lessons.userId, userId),
          inArray(lessons.status, ["agendada", "remarcada"]),
          gte(lessons.scheduledAt, startOfDay),
          lte(lessons.scheduledAt, nextWeek),
          eq(students.status, "ativo")
        )
      )
      .orderBy(asc(lessons.scheduledAt))
      .limit(20);

    // 4. Busca mensalidades atrasadas
    const overduePayments = await db.select({
      amount: paymentDues.amount,
      dueDate: paymentDues.dueDate,
      studentName: students.name,
    }).from(paymentDues)
      .leftJoin(students, eq(paymentDues.studentId, students.id))
      .where(
        and(
          eq(paymentDues.organizationId, orgId),
          isUserAdmin ? undefined : eq(paymentDues.userId, userId),
          eq(paymentDues.status, "pendente"),
          sql`${paymentDues.dueDate} < ${todayStr}::date`,
          eq(students.status, "ativo")
        )
      )
      .orderBy(asc(paymentDues.dueDate))
      .limit(20);

    // 5. Busca receita mensal prevista e realizada (mês atual)
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const paymentsThisMonth = await db.select({
      amount: paymentDues.amount,
      status: paymentDues.status,
      studentStatus: students.status,
    }).from(paymentDues)
      .leftJoin(students, eq(paymentDues.studentId, students.id))
      .where(
      and(
        eq(paymentDues.organizationId, orgId),
        isUserAdmin ? undefined : eq(paymentDues.userId, userId),
        eq(paymentDues.month, currentMonth),
        eq(paymentDues.year, currentYear)
      )
    );

    let totalPrevisto = 0;
    let totalPago = 0;
    paymentsThisMonth.forEach((p: any) => {
      const amt = Number(p.amount);
      // Previsto = soma de todos os lançamentos do mês (pendente + pago) para alunos ativos
      if (p.studentStatus === "ativo") {
        totalPrevisto += amt;
      }
      if (p.status === "pago") totalPago += amt;
    });

    // 6. Busca despesas do mês atual
    const expensesThisMonth = await db.select({
      amount: expenses.amount,
      status: expenses.status
    }).from(expenses)
      .where(
        and(
          eq(expenses.organizationId, orgId),
          isUserAdmin ? undefined : eq(expenses.userId, userId),
          sql`EXTRACT(MONTH FROM ${expenses.date}) = ${currentMonth}`,
          sql`EXTRACT(YEAR FROM ${expenses.date}) = ${currentYear}`
        )
      );

    let totalDespesasPagas = 0;
    expensesThisMonth.forEach((e: any) => {
      if (e.status === "pago") totalDespesasPagas += Number(e.amount);
    });

    // 7. Busca receita base recorrente e despesa base recorrente para projeções
    const activeStudentsList = await db.select({
      name: students.name,
      monthlyFee: students.monthlyFee,
      dueDay: students.dueDay,
      phone: students.phone,
      status: students.status,
    }).from(students).where(
      and(
        eq(students.status, "ativo"),
        eq(students.organizationId, orgId),
        isUserAdmin ? undefined : eq(students.professorId, userId)
      )
    );
    const receitaRecorrente = activeStudentsList.reduce((acc: number, s: any) => acc + Number(s.monthlyFee || 0), 0);

    const recurringExpensesList = await db.select({ amount: expenses.amount }).from(expenses).where(
      and(
        eq(expenses.organizationId, orgId),
        eq(expenses.recurrence, "mensal"),
        isUserAdmin ? undefined : eq(expenses.userId, userId)
      )
    );
    const despesaRecorrente = recurringExpensesList.reduce((acc: number, e: any) => acc + Number(e.amount || 0), 0);

    // Formatação do contexto
    const tz = "America/Sao_Paulo";
    let context = `Escola: ${userSettings?.schoolName || "Minha Escola de Música"}\n`;
    context += `Data Atual: ${now.toLocaleDateString("pt-BR", { timeZone: tz, weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit' })} - ${now.toLocaleTimeString("pt-BR", { timeZone: tz, hour: '2-digit', minute: '2-digit' })}\n`;
    
    try {
      if (userSettings?.schoolHours) {
        const hours = typeof userSettings.schoolHours === 'string' ? JSON.parse(userSettings.schoolHours) : userSettings.schoolHours;
        const daysMap: Record<string, string> = { monday: "Segunda-feira", tuesday: "Terça-feira", wednesday: "Quarta-feira", thursday: "Quinta-feira", friday: "Sexta-feira", saturday: "Sábado", sunday: "Domingo" };
        const dayIndexMap: Record<number, string> = { 0: "sunday", 1: "monday", 2: "tuesday", 3: "wednesday", 4: "thursday", 5: "friday", 6: "saturday" };
        const lessonDuration = userSettings?.lessonDuration ?? 60;

        context += `HORÁRIO DE FUNCIONAMENTO DA ESCOLA:\n`;
        Object.keys(hours).forEach(day => {
          const config = hours[day];
          if (config.active) {
            context += `- ${daysMap[day] || day}: das ${config.start} às ${config.end}\n`;
          } else {
            context += `- ${daysMap[day] || day}: Fechado\n`;
          }
        });
        context += `\n`;

        // --- Calcula slots livres reais para os próximos 7 dias ---
        const tz = "America/Sao_Paulo";

        // Busca aulas agendadas nos próximos 7 dias para calcular slots ocupados
        const next7Start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        const next7End = new Date(next7Start.getTime() + 7 * 24 * 60 * 60 * 1000);

        const scheduledInNext7 = await db.select({ scheduledAt: lessons.scheduledAt })
          .from(lessons)
          .where(and(
            eq(lessons.organizationId, orgId),
            isUserAdmin ? undefined : eq(lessons.userId, userId),
            inArray(lessons.status, ["agendada", "remarcada"]),
            gte(lessons.scheduledAt, next7Start),
            lte(lessons.scheduledAt, next7End),
          ));

        // Agrupa aulas ocupadas por data (YYYY-MM-DD) → Set de "HH:MM"
        const occupiedByDate: Record<string, Set<string>> = {};
        scheduledInNext7.forEach((l: any) => {
          const d = new Date(l.scheduledAt);
          const dateKey = d.toLocaleDateString("sv", { timeZone: tz }); // YYYY-MM-DD
          const timeKey = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: tz });
          if (!occupiedByDate[dateKey]) occupiedByDate[dateKey] = new Set();
          occupiedByDate[dateKey].add(timeKey);
        });

        // Para cada um dos próximos 7 dias, lista os slots livres
        context += `HORÁRIOS LIVRES (PRÓXIMOS 7 DIAS — slots de ${lessonDuration} minutos):\n`;
        context += `(Use ESTES horários ao sugerir agendamentos. Não invente horários fora desta lista.)\n`;

        let hasAnyFreeSlot = false;
        for (let i = 0; i < 7; i++) {
          const dayDate = new Date(next7Start.getTime() + i * 24 * 60 * 60 * 1000);
          // Pega o índice do dia da semana no fuso de Brasília
          const localDateStr = dayDate.toLocaleDateString("en-CA", { timeZone: tz }); // YYYY-MM-DD
          const weekdayIdx = new Date(`${localDateStr}T12:00:00-03:00`).getDay(); // 0=Dom, 1=Seg...
          const dayKey = dayIndexMap[weekdayIdx];
          const dayConfig = hours[dayKey];
          if (!dayConfig || !dayConfig.active) continue;

          const dateKey = dayDate.toLocaleDateString("sv", { timeZone: tz });
          const occupied = occupiedByDate[dateKey] || new Set();

          const [startH, startM] = dayConfig.start.split(":").map(Number);
          const [endH, endM] = dayConfig.end.split(":").map(Number);
          let cursor = startH * 60 + (startM || 0);
          const endMinutes = endH * 60 + (endM || 0);

          const freeSlots: string[] = [];
          while (cursor + lessonDuration <= endMinutes) {
            const hh = String(Math.floor(cursor / 60)).padStart(2, "0");
            const mm = String(cursor % 60).padStart(2, "0");
            const slotStr = `${hh}:${mm}`;
            if (!occupied.has(slotStr)) freeSlots.push(slotStr);
            cursor += lessonDuration;
          }

          const ptDate = dayDate.toLocaleDateString("pt-BR", { timeZone: tz, weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
          if (freeSlots.length > 0) {
            context += `- ${ptDate}: ${freeSlots.join(", ")}\n`;
            hasAnyFreeSlot = true;
          } else {
            context += `- ${ptDate}: Sem horários livres (agenda lotada)\n`;
          }
        }
        if (!hasAnyFreeSlot) context += `Nenhum horário livre nos próximos 7 dias.\n`;
        context += `\n(Atenção: Ao sugerir horários para alunos, respeite OBRIGATORIAMENTE os horários livres listados acima. Nunca sugira slots já ocupados ou fora do horário de funcionamento.)\n\n`;
      }
    } catch (e) {
      console.error("Erro ao fazer parse dos horários para a IA", e);
    }

    context += `Alunos ativos: ${activeStudents.length}\n\n`;

    context += `FINANCEIRO DESTE MÊS (${currentMonth}/${currentYear}):\n`;
    context += `- Receita total prevista: R$ ${totalPrevisto.toFixed(2)}\n`;
    context += `- Receita já paga: R$ ${totalPago.toFixed(2)}\n`;
    context += `- Despesas pagas: R$ ${totalDespesasPagas.toFixed(2)}\n`;
    context += `- Saldo Líquido atual: R$ ${(totalPago - totalDespesasPagas).toFixed(2)}\n\n`;

    context += `PROJEÇÃO FINANCEIRA FUTURA (BASE RECORRENTE MENSAL):\n`;
    context += `- Receita Mensal Recorrente (soma das mensalidades de alunos ativos): R$ ${receitaRecorrente.toFixed(2)}\n`;
    context += `- Despesa Mensal Recorrente (soma das despesas fixas mensais): R$ ${despesaRecorrente.toFixed(2)}\n`;
    context += `- Lucro Mensal Recorrente Projetado: R$ ${(receitaRecorrente - despesaRecorrente).toFixed(2)}\n\n`;
    context += `REGRA DE CÁLCULO PARA PROJEÇÕES DE GANHOS FUTUROS (MUITO IMPORTANTE):\n`;
    context += `Quando o usuário perguntar sobre projeção de ganhos, lucro ou faturamento para daqui a N meses (ex: "quanto posso ter de lucro daqui 3 meses?", "projeção para 6 meses"), você DEVE calcular da seguinte forma:\n`;
    context += `1. Identifique a quantidade N de meses solicitada no prompt do usuário.\n`;
    context += `2. Multiplique a Receita Mensal Recorrente (R$ ${receitaRecorrente.toFixed(2)}) por N para obter a Receita Acumulada de N meses.\n`;
    context += `3. Multiplique a Despesa Mensal Recorrente (R$ ${despesaRecorrente.toFixed(2)}) por N para obter a Despesa Acumulada de N meses.\n`;
    context += `4. O Lucro Total Projetado em N meses será (Receita Mensal Recorrente - Despesa Mensal Recorrente) * N.\n`;
    context += `5. Apresente ao usuário um resumo claro com o valor total acumulado e o detalhamento mensal, explicando de onde vêm os valores (alunos ativos e despesas fixas).\n\n`;

    if (overduePayments.length > 0) {
      context += `ATENÇÃO - MENSALIDADES ATRASADAS (${overduePayments.length} registros mais antigos):\n`;
      overduePayments.forEach((p: any) => {
        context += `- Aluno: ${p.studentName} | Vencimento: ${p.dueDate} | Valor: R$ ${Number(p.amount).toFixed(2)}\n`;
      });
      context += `\n`;
    } else {
      context += `Sem mensalidades atrasadas no momento.\n\n`;
    }

    // Adiciona lista detalhada de alunos com mensalidade individual
    if (activeStudentsList.length > 0) {
      context += `LISTA DE ALUNOS ATIVOS E SUAS MENSALIDADES INDIVIDUAIS:\n`;
      context += `(Use esta lista para responder perguntas sobre a mensalidade de um aluno específico)\n`;
      activeStudentsList.forEach((s: any) => {
        const fee = Number(s.monthlyFee || 0);
        context += `- ${s.name} | Mensalidade: R$ ${fee.toFixed(2)} | Vencimento: dia ${s.dueDay || 10}\n`;
      });
      context += `\n`;
    }

    if (upcomingLessons.length > 0) {
      context += `PRÓXIMAS AULAS (próximos 7 dias):\n`;
      upcomingLessons.forEach((l: any) => {
        const d = new Date(l.scheduledAt);
        const dateStr = d.toLocaleDateString("pt-BR", { timeZone: tz, weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit' });
        const timeStr = d.toLocaleTimeString("pt-BR", { timeZone: tz, hour: '2-digit', minute: '2-digit' });
        context += `- ${dateStr} às ${timeStr} | Aluno: ${l.studentName || 'Sem nome'} | Aula: ${l.title}\n`;
      });
      context += `\n`;
    }

    return context;

  } catch (err) {
    console.error("[buildUserContext Error]", err);
    return "Erro ao carregar contexto atual. Limite-se a responder de forma genérica baseada em gestão de aulas de música.";
  }
}
