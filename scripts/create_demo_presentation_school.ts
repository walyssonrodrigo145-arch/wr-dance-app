import dotenv from "dotenv";
dotenv.config();

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = "secret_dev_musicpro_key_123456";
}

import crypto from "crypto";

async function createDemoPresentationSchool() {
  console.log("🚀 Iniciando criação da conta de Escola de Música para Apresentação...");

  const { getDb } = await import("../server/db");
  const {
    organizations,
    users,
    professores,
    instruments,
    students,
    lessons,
    paymentDues,
    expenses,
    settings,
    announcements,
    studentEvolution,
    studentGoals
  } = await import("../drizzle/schema");
  const { eq, and } = await import("drizzle-orm");

  const db = await getDb();
  if (!db) {
    console.error("❌ Erro: Banco de dados não conectado.");
    process.exit(1);
  }

  // 1. ORGANIZAÇÃO / ESCOLA DE MÚSICA
  const schoolName = "Conservatório Musical Villa-Lobos";
  const schoolSlug = `villa-lobos-demo-${Date.now()}`;
  
  const [newOrg] = await db.insert(organizations).values({
    name: schoolName,
    slug: schoolSlug,
    active: true,
    subscriptionStatus: "active",
    planId: "premium",
    createdAt: new Date(),
    updatedAt: new Date()
  }).returning();

  const orgId = newOrg.id;
  console.log(`✅ Organização criada com sucesso: ID ${orgId} - "${schoolName}"`);

  // 2. USUÁRIO ADMIN (GESTOR DA ESCOLA)
  const adminEmail = "apresentacao@villalobosmusica.com.br";
  const adminPassword = "VillaLobos2026!";
  const adminName = "Prof. Maestro Villa-Lobos";

  const saltAdmin = crypto.randomBytes(16).toString("hex");
  const derivedKeyAdmin = crypto.scryptSync(adminPassword, saltAdmin, 64).toString("hex");
  const passwordHashAdmin = `${saltAdmin}:${derivedKeyAdmin}`;

  // Caso o e-mail já exista, excluímos ou reutilizamos para evitar conflito
  const [existingUser] = await db.select().from(users).where(eq(users.email, adminEmail)).limit(1);
  let adminUser;
  if (existingUser) {
    console.log(`⚠️ Atualizando usuário gestor existente (${adminEmail})...`);
    const [updated] = await db.update(users).set({
      organizationId: orgId,
      name: adminName,
      passwordHash: passwordHashAdmin,
      role: "admin",
      isEmailVerified: true,
      mustChangePassword: false,
      updatedAt: new Date()
    }).where(eq(users.id, existingUser.id)).returning();
    adminUser = updated;
  } else {
    const [created] = await db.insert(users).values({
      organizationId: orgId,
      openId: `villa_admin_${Date.now()}`,
      name: adminName,
      email: adminEmail,
      passwordHash: passwordHashAdmin,
      role: "admin",
      isEmailVerified: true,
      mustChangePassword: false,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    adminUser = created;
  }

  // Atualiza ownerId na organização
  await db.update(organizations).set({ ownerId: adminUser.id }).where(eq(organizations.id, orgId));

  // 3. CONFIGURAÇÕES DA ESCOLA
  await db.insert(settings).values({
    userId: adminUser.id,
    organizationId: orgId,
    schoolName: schoolName,
    schoolPhone: "(11) 98765-4321",
    schoolAddress: "Av. Paulista, 1500 - Bela Vista, São Paulo - SP",
    pixKey: "12345678000199",
    notifyLessonReminder: 1,
    notifyPaymentDue: 1,
    asaasEnabled: 0,
    automationEnabled: 1,
  }).onConflictDoNothing();

  // 4. PROFESSORES
  const teachersData = [
    { name: "Fernando Costa", email: "fernando.costa@villalobosmusica.com.br", espec: "Piano, Teclado e Teoria", phone: "(11) 99111-2233" },
    { name: "Mariana Souza", email: "mariana.souza@villalobosmusica.com.br", espec: "Canto e Preparação Vocal", phone: "(11) 99222-3344" },
    { name: "Ricardo Nunes", email: "ricardo.nunes@villalobosmusica.com.br", espec: "Violão, Guitarra e Baixo", phone: "(11) 99333-4455" },
    { name: "Carlos Eduardo", email: "carlos.eduardo@villalobosmusica.com.br", espec: "Bateria e Percussão", phone: "(11) 99444-5566" },
  ];

  const teacherRecords: any[] = [];
  for (const t of teachersData) {
    const salt = crypto.randomBytes(16).toString("hex");
    const derivedKey = crypto.scryptSync("Prof2026!", salt, 64).toString("hex");
    const hash = `${salt}:${derivedKey}`;

    const [u] = await db.insert(users).values({
      organizationId: orgId,
      openId: `prof_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      name: t.name,
      email: t.email,
      passwordHash: hash,
      role: "professor",
      isEmailVerified: true,
      mustChangePassword: false,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();

    const [p] = await db.insert(professores).values({
      organizationId: orgId,
      userId: u.id,
      especialidade: t.espec,
      telefone: t.phone,
      paymentType: "porcentagem",
      paymentPercentage: "60.00",
      createdAt: new Date()
    }).returning();

    teacherRecords.push({ user: u, professor: p });
  }

  console.log(`✅ ${teacherRecords.length} Professores cadastrados!`);

  // 5. INSTRUMENTOS
  const instrumentsData = [
    { name: "Piano Erudito & Popular", category: "Teclados", icon: "music", color: "#8B5CF6" },
    { name: "Violão Clássico & Popular", category: "Cordas", icon: "guitar", color: "#F59E0B" },
    { name: "Guitarra Elétrica", category: "Cordas", icon: "zap", color: "#EF4444" },
    { name: "Canto & Técnica Vocal", category: "Voz", icon: "mic", color: "#EC4899" },
    { name: "Bateria & Percussão", category: "Percussão", icon: "drum", color: "#10B981" },
    { name: "Baixo Elétrico", category: "Cordas", icon: "disc", color: "#3B82F6" },
    { name: "Saxofone & Sopro", category: "Sopro", icon: "wind", color: "#6366F1" },
    { name: "Violoncelo", category: "Friccionadas", icon: "heart", color: "#14B8A6" },
  ];

  const instrumentRecords: any[] = [];
  for (const inst of instrumentsData) {
    const [inserted] = await db.insert(instruments).values({
      organizationId: orgId,
      userId: adminUser.id,
      name: inst.name,
      category: inst.category,
      icon: inst.icon,
      color: inst.color,
      createdAt: new Date()
    }).returning();
    instrumentRecords.push(inserted);
  }
  console.log(`✅ ${instrumentRecords.length} Instrumentos cadastrados!`);

  // 6. ALUNOS (Com nomes reais de pessoas)
  const studentsList = [
    { name: "Beatriz Cavalcante Silva", email: "beatriz.cavalcante@gmail.com", phone: "(11) 98112-3456", instrumentIdx: 0, level: "avancado", fee: "380.00", dueDay: 10, teacherIdx: 0, status: "ativo" },
    { name: "Lucas Oliveira Ferreira", email: "lucas.ferreira.mus@gmail.com", phone: "(11) 98223-4567", instrumentIdx: 2, level: "intermediario", fee: "320.00", dueDay: 5, teacherIdx: 2, status: "ativo" },
    { name: "Ana Clara Mendes Rocha", email: "anaclara.mendes@hotmail.com", phone: "(11) 98334-5678", instrumentIdx: 3, level: "intermediario", fee: "350.00", dueDay: 15, teacherIdx: 1, status: "ativo" },
    { name: "Mateus Fonseca Santos", email: "mateus.fonseca@yahoo.com.br", phone: "(11) 98445-6789", instrumentIdx: 4, level: "avancado", fee: "340.00", dueDay: 10, teacherIdx: 3, status: "ativo" },
    { name: "Juliana Rocha Almeida", email: "juliana.almeida@outlook.com", phone: "(11) 98556-7890", instrumentIdx: 1, level: "iniciante", fee: "280.00", dueDay: 20, teacherIdx: 2, status: "ativo" },
    { name: "Roberto Camargo Júnior", email: "roberto.camargo@gmail.com", phone: "(11) 98667-8901", instrumentIdx: 5, level: "intermediario", fee: "310.00", dueDay: 5, teacherIdx: 2, status: "ativo" },
    { name: "Camila Martins Barbosa", email: "camila.martins@gmail.com", phone: "(11) 98778-9012", instrumentIdx: 0, level: "iniciante", fee: "290.00", dueDay: 10, teacherIdx: 0, status: "ativo" },
    { name: "Thiago Souza Ribeiro", email: "thiago.souza@gmail.com", phone: "(11) 98889-0123", instrumentIdx: 6, level: "avancado", fee: "420.00", dueDay: 15, teacherIdx: 0, status: "ativo" },
    { name: "Sofia Ramos Guimarães", email: "sofia.guimaraes@uol.com.br", phone: "(11) 98990-1234", instrumentIdx: 7, level: "intermediario", fee: "400.00", dueDay: 25, teacherIdx: 0, status: "ativo" },
    { name: "Gabriel Siqueira Prado", email: "gabriel.prado@gmail.com", phone: "(11) 99001-2345", instrumentIdx: 1, level: "intermediario", fee: "280.00", dueDay: 10, teacherIdx: 2, status: "ativo" },
    { name: "Fernanda Lima Cardoso", email: "fernanda.lima@icloud.com", phone: "(11) 99112-3456", instrumentIdx: 0, level: "avancado", fee: "450.00", dueDay: 5, teacherIdx: 0, status: "ativo" },
    { name: "Rodrigo Castro Silveira", email: "rodrigo.silveira@gmail.com", phone: "(11) 99223-4567", instrumentIdx: 4, level: "iniciante", fee: "300.00", dueDay: 20, teacherIdx: 3, status: "ativo" },
    { name: "Vanessa Duarte Pires", email: "vanessa.duarte@gmail.com", phone: "(11) 99334-5678", instrumentIdx: 3, level: "iniciante", fee: "320.00", dueDay: 15, teacherIdx: 1, status: "ativo" },
    { name: "Amanda Ribeiro Nogueira", email: "amanda.nogueira@gmail.com", phone: "(11) 99445-6789", instrumentIdx: 1, level: "avancado", fee: "330.00", dueDay: 10, teacherIdx: 2, status: "pausado" },
  ];

  const studentRecords: any[] = [];
  for (let i = 0; i < studentsList.length; i++) {
    const s = studentsList[i];
    const teacher = teacherRecords[s.teacherIdx];
    const inst = instrumentRecords[s.instrumentIdx];

    const [st] = await db.insert(students).values({
      organizationId: orgId,
      userId: adminUser.id,
      professorId: teacher.user.id,
      name: s.name,
      email: s.email,
      phone: s.phone,
      cpf: `3${i}4.5${i}6.7${i}8-0${i}`,
      level: s.level as any,
      status: s.status as any,
      monthlyFee: s.fee,
      dueDay: s.dueDay,
      instrumentId: inst.id,
      startDate: new Date(2026, 0, 15 + i).toISOString().split('T')[0],
      createdAt: new Date(2026, 0, 15 + i),
      updatedAt: new Date()
    }).returning();

    studentRecords.push({ student: st, info: s });

    // Evolução técnica do aluno
    await db.insert(studentEvolution).values({
      organizationId: orgId,
      studentId: st.id,
      technical: 70 + (i * 2) % 25,
      rhythm: 65 + (i * 3) % 30,
      harmony: 60 + (i * 4) % 35,
      reading: 75 + (i * 2) % 20,
      recordedAt: new Date()
    });

    // Metas de estudo
    await db.insert(studentGoals).values({
      studentId: st.id,
      userId: adminUser.id,
      title: `Dominar ${inst.name} - Módulo ${s.level.toUpperCase()}`,
      targetDate: "2026-12-20",
      status: i % 2 === 0 ? "concluida" : "pendente",
      createdAt: new Date()
    });
  }

  // Criar também conta de portal para a primeira aluna (Beatriz)
  const saltBeatriz = crypto.randomBytes(16).toString("hex");
  const derivedKeyBeatriz = crypto.scryptSync("AlunoVilla2026!", saltBeatriz, 64).toString("hex");
  const hashBeatriz = `${saltBeatriz}:${derivedKeyBeatriz}`;

  const [beatrizUser] = await db.insert(users).values({
    organizationId: orgId,
    openId: `student_beatriz_${Date.now()}`,
    name: studentRecords[0].student.name,
    email: studentRecords[0].student.email,
    passwordHash: hashBeatriz,
    role: "aluno",
    studentId: studentRecords[0].student.id,
    isEmailVerified: true,
    mustChangePassword: false,
    createdAt: new Date(),
    updatedAt: new Date()
  }).returning();

  await db.update(students).set({ studentUserId: beatrizUser.id }).where(eq(students.id, studentRecords[0].student.id));

  console.log(`✅ ${studentRecords.length} Alunos cadastrados com perfis, metas e evoluções!`);

  // 7. AULAS EM DIVERSOS DIAS DA SEMANA
  console.log("📅 Cadastrando aulas passadas e futuras em variados dias e horários...");
  
  const lessonTitles = [
    "Técnica e Exercícios de Aquecimento",
    "Estudo de Escalas Maior e Menor",
    "Repertório: Leitura de Partitura",
    "Prática de Harmonia Funcional",
    "Desenvolvimento de Ritmo e Metrônomo",
    "Improvisação sobre Progressão I-IV-V",
    "Sonoridade, Expressão e Dinâmica",
    "Revisão da Peça Principal do Mês",
  ];

  const now = new Date();
  const daysOfWeek = [-14, -12, -10, -8, -7, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14];
  const hours = [9, 10, 11, 14, 15, 16, 17, 18, 19];

  let lessonCount = 0;
  for (let idx = 0; idx < studentRecords.length; idx++) {
    const item = studentRecords[idx];
    const st = item.student;
    const teacher = teacherRecords[item.info.teacherIdx];
    const inst = instrumentRecords[item.info.instrumentIdx];

    // Criar 5 a 7 aulas por aluno espalhadas no tempo
    const studentDays = [
      daysOfWeek[(idx * 2) % daysOfWeek.length],
      daysOfWeek[(idx * 2 + 3) % daysOfWeek.length],
      daysOfWeek[(idx * 2 + 6) % daysOfWeek.length],
      daysOfWeek[(idx * 2 + 9) % daysOfWeek.length],
      daysOfWeek[(idx * 2 + 12) % daysOfWeek.length],
    ];

    for (let dIdx = 0; dIdx < studentDays.length; dIdx++) {
      const offsetDays = studentDays[dIdx];
      const scheduledDate = new Date(now);
      scheduledDate.setDate(now.getDate() + offsetDays);
      scheduledDate.setHours(hours[(idx + dIdx) % hours.length], 0, 0, 0);

      const isPast = scheduledDate < now;
      const status = isPast ? (dIdx % 5 === 0 ? "falta" : "concluida") : "agendada";

      await db.insert(lessons).values({
        organizationId: orgId,
        userId: teacher.user.id,
        studentId: st.id,
        title: `${inst.name} - ${lessonTitles[dIdx % lessonTitles.length]}`,
        description: `Aula focada no desenvolvimento prático e teórico do aluno ${st.name}.`,
        scheduledAt: scheduledDate,
        duration: 60,
        status: status as any,
        lessonType: "individual",
        instrumentId: inst.id,
        rating: isPast && status === "concluida" ? (4 + (dIdx % 2)) : null,
        notes: isPast ? "Excelente desempenho na execução dos exercícios propostos." : null,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      lessonCount++;
    }
  }

  console.log(`✅ ${lessonCount} Aulas agendadas/concluídas em diferentes dias da semana!`);

  // 8. MENSALIDADES (PAGAS, PENDENTES/ABERTAS E ATRASADAS)
  console.log("💰 Gerando mensalidades históricas e abertas para dashboards e relatórios...");

  const monthsToGenerate = [
    { year: 2026, month: 5, statusPaidRatio: 1.0 },   // Maio: 100% pago
    { year: 2026, month: 6, statusPaidRatio: 0.9 },   // Junho: 90% pago, 10% atrasado
    { year: 2026, month: 7, statusPaidRatio: 0.65 },  // Julho: 65% pago, 25% pendente (abertas!), 10% atrasado
    { year: 2026, month: 8, statusPaidRatio: 0.0 },   // Agosto: 100% pendente (mensalidades abertas!)
  ];

  let paymentCount = 0;
  for (const mObj of monthsToGenerate) {
    for (let i = 0; i < studentRecords.length; i++) {
      const st = studentRecords[i].student;
      const amount = st.monthlyFee;
      const dueDay = st.dueDay;
      const dueDateStr = `${mObj.year}-${String(mObj.month).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`;
      const dueDateObj = new Date(mObj.year, mObj.month - 1, dueDay);

      let status: "pago" | "pendente" | "atrasado" = "pendente";
      let paidAt: Date | null = null;

      const randomVal = (i * 7 + mObj.month) % 100 / 100;
      if (randomVal < mObj.statusPaidRatio) {
        status = "pago";
        paidAt = new Date(mObj.year, mObj.month - 1, Math.min(dueDay - 1, 1));
      } else {
        if (dueDateObj < now && mObj.month < 7) {
          status = "atrasado";
        } else {
          status = "pendente";
        }
      }

      await db.insert(paymentDues).values({
        organizationId: orgId,
        userId: adminUser.id,
        studentId: st.id,
        amount: amount,
        dueDate: dueDateStr,
        paidAt: paidAt,
        status: status,
        month: mObj.month,
        year: mObj.year,
        notes: `Mensalidade referente a ${mObj.month}/${mObj.year}`,
        createdAt: new Date(mObj.year, mObj.month - 1, 1),
        updatedAt: new Date()
      });
      paymentCount++;
    }
  }

  console.log(`✅ ${paymentCount} Mensalidades geradas (Pagas, Abertas e Atrasadas)!`);

  // 9. DESPESAS DA ESCOLA (DRE / RELATÓRIO DE LUCRO LÍQUIDO)
  const expensesData = [
    { desc: "Aluguel da Sede do Conservatório", supplier: "Imobiliária Paulista", amount: "2800.00", category: "Aluguel & Infraestrutura", date: "2026-07-05", status: "pago" },
    { desc: "Energia Elétrica (Enel)", supplier: "Enel SP", amount: "460.00", category: "Contas de Consumo", date: "2026-07-10", status: "pago" },
    { desc: "Internet Fibra Dedicada 1Gbps", supplier: "Vivo Fibra Empresarial", amount: "180.00", category: "Contas de Consumo", date: "2026-07-08", status: "pago" },
    { desc: "Afinação e Manutenção de Pianos", supplier: "Luthieria & Afinações SP", amount: "450.00", category: "Manutenção", date: "2026-07-12", status: "pago" },
    { desc: "Marketing Digital & Meta Ads", supplier: "Agência Som Digital", amount: "650.00", category: "Marketing & Vendas", date: "2026-07-15", status: "pago" },
    { desc: "Insumos de Limpeza e Recepção", supplier: "Distribuidora LimpFast", amount: "320.00", category: "Operacional", date: "2026-07-18", status: "pago" },
    { desc: "Compra de Cordas e Acessórios", supplier: "Casa dos Instrumentos", amount: "290.00", category: "Materiais", date: "2026-07-20", status: "pendente" },
  ];

  for (const exp of expensesData) {
    await db.insert(expenses).values({
      organizationId: orgId,
      userId: adminUser.id,
      description: exp.desc,
      supplier: exp.supplier,
      amount: exp.amount,
      category: exp.category,
      date: exp.date,
      status: exp.status as any,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }

  console.log(`✅ ${expensesData.length} Despesas registradas!`);

  // 10. AVISOS E RECADOS DA ESCOLA
  await db.insert(announcements).values({
    organizationId: orgId,
    userId: adminUser.id,
    title: "📢 Recital de Primavera 2026 - Conservatório Villa-Lobos",
    content: "Convidamos todos os alunos, familiares e professores para o nosso Recital de Primavera no Auditório Principal. Garanta suas partituras e ensaios com os professores!",
    isGlobal: true,
    createdAt: new Date()
  });

  await db.insert(announcements).values({
    organizationId: orgId,
    userId: adminUser.id,
    title: "🎶 Masterclass Gratuita de Prática em Conjunto",
    content: "Neste sábado teremos uma oficina especial de prática em grupo com os professores Fernando Costa e Ricardo Nunes. Participação livre para todos os alunos ativos.",
    isGlobal: true,
    createdAt: new Date()
  });

  console.log("✅ Avisos do Mural cadastrados!");

  console.log("\n=======================================================================");
  console.log(" 🎉 CONTA DE ESCOLA PARA APRESENTAÇÃO CRIADA COM SUCESSO!");
  console.log("=======================================================================");
  console.log(`🏫 Nome da Escola: ${schoolName}`);
  console.log("-----------------------------------------------------------------------");
  console.log("🔑 ACESSO DO GESTOR DA ESCOLA (ADMINISTRADOR):");
  console.log(`   • E-mail / Login: ${adminEmail}`);
  console.log(`   • Senha:          ${adminPassword}`);
  console.log("-----------------------------------------------------------------------");
  console.log("🎓 ACESSO DO PORTAL DO ALUNO (EXEMPLO: BEATRIZ CAVALCANTE):");
  console.log(`   • E-mail / Login: beatriz.cavalcante@gmail.com`);
  console.log(`   • Senha:          AlunoVilla2026!`);
  console.log("-----------------------------------------------------------------------");
  console.log("📊 RESUMO DOS DADOS CADASTRADOS PARA A APRESENTAÇÃO:");
  console.log(`   • ${studentRecords.length} Alunos com nomes reais, instrumentos e valores de mensalidade`);
  console.log(`   • ${teacherRecords.length} Professores cadastrados`);
  console.log(`   • ${instrumentRecords.length} Instrumentos e categorias cadastrados`);
  console.log(`   • ${lessonCount} Aulas em variados dias da semana, horários e status`);
  console.log(`   • ${paymentCount} Mensalidades geradas (Pagas, Abertas e Atrasadas)`);
  console.log(`   • ${expensesData.length} Despesas registradas para DRE / Relatórios Financeiros completos`);
  console.log("=======================================================================\n");

  process.exit(0);
}

createDemoPresentationSchool().catch((err) => {
  console.error("❌ Erro ao criar escola de apresentação:", err);
  process.exit(1);
});
