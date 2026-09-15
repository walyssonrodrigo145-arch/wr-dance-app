// Criação da escola de música "Escola de Música Mec PR" com TRIAL de 15 dias.
// Só organização + usuário admin + settings mínimos (sem dados de demonstração).
// Idempotente: se o e-mail já existir, reutiliza a org e reativa o trial de 15 dias.
import dotenv from "dotenv";
dotenv.config();

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = "secret_dev_musicpro_key_123456";
}

import crypto from "crypto";

const TRIAL_DAYS = 15;

function computeTrialEnd(days: number): Date {
  const t = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  t.setHours(23, 59, 59, 999);
  return t;
}

async function createMecprSchool() {
  console.log("🚀 Criando escola de música com trial de 15 dias...");

  const { getDb } = await import("../server/db");
  const { organizations, users, settings } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");

  const db = await getDb();
  if (!db) {
    console.error("❌ Erro: Banco de dados não conectado.");
    process.exit(1);
  }

  const schoolName = "Escola de Música Mec PR";
  const adminEmail = "Mecpr12@gmail.com";
  const adminName = "Mec PR";

  // Senha temporária — o dono é obrigado a trocá-la no primeiro login.
  const tempPassword = `Mecpr@${crypto.randomBytes(4).toString("hex")}`;
  const saltAdmin = crypto.randomBytes(16).toString("hex");
  const derivedKeyAdmin = crypto.scryptSync(tempPassword, saltAdmin, 64).toString("hex");
  const passwordHashAdmin = `${saltAdmin}:${derivedKeyAdmin}`;

  const trialEndsAt = computeTrialEnd(TRIAL_DAYS);

  const [existingUser] = await db.select().from(users).where(eq(users.email, adminEmail)).limit(1);

  let orgId: number;
  let adminUserId: number;

  if (existingUser) {
    orgId = existingUser.organizationId;
    adminUserId = existingUser.id;
    console.log(`⚠️ Usuário ${adminEmail} já existe (id ${adminUserId}) — reutilizando org ${orgId} e reativando trial de ${TRIAL_DAYS} dias...`);
    await db.update(users).set({
      name: adminName,
      passwordHash: passwordHashAdmin,
      role: "admin",
      isEmailVerified: true,
      mustChangePassword: true,
      updatedAt: new Date(),
    }).where(eq(users.id, adminUserId));
  } else {
    const [newOrg] = await db.insert(organizations).values({
      name: schoolName,
      slug: `mecpr-${Date.now()}`,
      active: true,
      subscriptionStatus: "trialing",
      trialEndsAt,
      planId: "premium",
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();
    orgId = newOrg.id;
    console.log(`✅ Organização criada: ID ${orgId} — "${schoolName}"`);

    const [created] = await db.insert(users).values({
      organizationId: orgId,
      openId: `mecpr_admin_${Date.now()}`,
      name: adminName,
      email: adminEmail,
      passwordHash: passwordHashAdmin,
      role: "admin",
      isEmailVerified: true,
      mustChangePassword: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();
    adminUserId = created.id;
    console.log(`✅ Usuário admin criado: ID ${adminUserId} — ${adminEmail}`);
  }

  // Dono da org
  await db.update(organizations).set({ ownerId: adminUserId }).where(eq(organizations.id, orgId));

  // Garante TRIAL de 15 dias (novo ou reativado)
  await db.update(organizations).set({
    subscriptionStatus: "trialing",
    trialEndsAt,
    active: true,
    updatedAt: new Date(),
  }).where(eq(organizations.id, orgId));

  // Settings mínimos
  await db.insert(settings).values({
    userId: adminUserId,
    organizationId: orgId,
    schoolName: schoolName,
    notifyLessonReminder: 1,
    notifyPaymentDue: 1,
    asaasEnabled: 0,
    automationEnabled: 1,
  }).onConflictDoNothing();

  console.log("🎬 Escola pronta:");
  console.log(`   Org ID: ${orgId}`);
  console.log(`   Admin ID: ${adminUserId}`);
  console.log(`   E-mail: ${adminEmail}`);
  console.log(`   Senha temporária: ${tempPassword}`);
  console.log(`   Trial de ${TRIAL_DAYS} dias até: ${trialEndsAt.toISOString()}`);
  console.log(`   Login: https://wrmusicpro.com.br  (troca de senha obrigatória no 1º acesso)`);
}

createMecprSchool().catch((e) => {
  console.error("❌ Falha ao criar escola:", e);
  process.exit(1);
});
