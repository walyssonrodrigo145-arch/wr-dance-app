// Criação da escola "limpa" para gravação dos tutoriais (PRD Tutoriais).
// SÓ organização + usuário admin + settings mínimos — SEM professores,
// alunos, aulas, cobranças ou qualquer dado de demonstração.
// Idempotente: se o e-mail já existir, reutiliza a org e atualiza a senha.
import dotenv from "dotenv";
dotenv.config();

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = "secret_dev_musicpro_key_123456";
}

import crypto from "crypto";

async function createTutorialsSchool() {
  console.log("🚀 Criando escola limpa para gravação de tutoriais...");

  const { getDb } = await import("../server/db");
  const { organizations, users, settings } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");

  const db = await getDb();
  if (!db) {
    console.error("❌ Erro: Banco de dados não conectado.");
    process.exit(1);
  }

  const schoolName = "Tutoriais MusicPro";
  const adminEmail = "tutoriais@musicpro.com.br";
  const adminPassword = "musicpro2026";
  const adminName = "Tutoriais MusicPro";

  const saltAdmin = crypto.randomBytes(16).toString("hex");
  const derivedKeyAdmin = crypto.scryptSync(adminPassword, saltAdmin, 64).toString("hex");
  const passwordHashAdmin = `${saltAdmin}:${derivedKeyAdmin}`;

  // 1. Usuário admin (idempotente por e-mail)
  const [existingUser] = await db.select().from(users).where(eq(users.email, adminEmail)).limit(1);

  let orgId: number;
  let adminUserId: number;

  if (existingUser) {
    orgId = existingUser.organizationId;
    adminUserId = existingUser.id;
    console.log(`⚠️ Usuário ${adminEmail} já existe (id ${adminUserId}) — reutilizando org ${orgId} e atualizando senha/nome...`);
    await db.update(users).set({
      name: adminName,
      passwordHash: passwordHashAdmin,
      role: "admin",
      isEmailVerified: true,
      mustChangePassword: false,
      updatedAt: new Date(),
    }).where(eq(users.id, adminUserId));
  } else {
    // 2. Organização
    const [newOrg] = await db.insert(organizations).values({
      name: schoolName,
      slug: `tutoriais-musicpro-${Date.now()}`,
      active: true,
      subscriptionStatus: "active",
      planId: "premium",
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();
    orgId = newOrg.id;
    console.log(`✅ Organização criada: ID ${orgId} — "${schoolName}"`);

    // 3. Usuário admin
    const [created] = await db.insert(users).values({
      organizationId: orgId,
      openId: `tutoriais_admin_${Date.now()}`,
      name: adminName,
      email: adminEmail,
      passwordHash: passwordHashAdmin,
      role: "admin",
      isEmailVerified: true,
      mustChangePassword: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();
    adminUserId = created.id;
    console.log(`✅ Usuário admin criado: ID ${adminUserId} — ${adminEmail}`);
  }

  // 4. Dono da org
  await db.update(organizations).set({ ownerId: adminUserId }).where(eq(organizations.id, orgId));

  // 5. Settings mínimos (sem dados pedagógicos/financeiros)
  await db.insert(settings).values({
    userId: adminUserId,
    organizationId: orgId,
    schoolName: schoolName,
    notifyLessonReminder: 1,
    notifyPaymentDue: 1,
    asaasEnabled: 0,
    automationEnabled: 1,
  }).onConflictDoNothing();

  console.log(`🎬 Escola LIMPA pronta para gravar tutoriais:`);
  console.log(`   Org ID: ${orgId}`);
  console.log(`   Admin ID: ${adminUserId}`);
  console.log(`   E-mail: ${adminEmail}`);
  console.log(`   Senha: ${adminPassword}`);
}

createTutorialsSchool().catch((e) => {
  console.error("❌ Falha ao criar escola:", e);
  process.exit(1);
});
