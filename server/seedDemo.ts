import { getDb } from "./db";
import { users, settings, students, instruments, lessons, paymentDues } from "../drizzle/schema";
import crypto from "crypto";

async function seed() {
  const db = await getDb();
  if (!db) {
    console.error("No database connection");
    return;
  }

  console.log("Seeding demo data...");

  // Create demo user
  const email = "demo@musicpro.com";
  const password = "demo";
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(password, salt, 64).toString("hex");
  const passwordHash = `${salt}:${derivedKey}`;

  // Check if exists
  const [existingUser] = await db.select().from(users).where(undefined).limit(1); // Wait, Drizzle without eq?
  // Let's just insert and return id
  const [demoUser] = await db
    .insert(users)
    .values({
      email,
      name: "Demo Professor",
      passwordHash,
      role: "professor",
      openId: `demo_${Date.now()}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  const userId = demoUser.id;
  const orgId = demoUser.organizationId;

  await db.insert(settings).values({
    userId,
    organizationId: orgId,
    schoolName: "MusicPro Demo School",
    schoolPhone: "11999999999",
    notifyLessonReminder: 1,
    notifyPaymentDue: 1,
    asaasEnabled: 0,
    automationEnabled: 0,
  });

  // Instruments
  const instNames = ["Piano", "Violão", "Guitarra", "Bateria", "Canto", "Violino", "Saxofone", "Baixo"];
  const instrumentIds = [];
  for (const name of instNames) {
    const [inst] = await db.insert(instruments).values({
      name,
      category: "Geral",
      organizationId: orgId,
      userId: userId,
      color: "#" + Math.floor(Math.random()*16777215).toString(16),
      createdAt: new Date()
    }).returning();
    instrumentIds.push(inst.id);
  }

  // 100 Students
  console.log("Creating students...");
  const studentIds = [];
  for (let i = 1; i <= 100; i++) {
    const instId = instrumentIds[i % instrumentIds.length];
    const [student] = await db.insert(students).values({
      name: `Aluno Demo ${i}`,
      email: `aluno${i}_${Date.now()}@demo.com`,
      phone: `1198${Math.floor(1000000 + Math.random() * 9000000)}`,
      cpf: `111222333${i.toString().padStart(2, '0')}`,
      address: "Rua Demo, 123",
      fiscalCity: "São Paulo",
      level: "iniciante",
      instrumentId: instId,
      monthlyFee: "150.00",
      dueDay: (i % 28) + 1,
      organizationId: orgId,
      professorId: userId,
      userId: userId,
      status: "ativo",
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    studentIds.push(student.id);
  }

  // Payments and Lessons
  console.log("Creating lessons and payments...");
  const now = new Date();
  
  for (const studentId of studentIds) {
    // 3 Payments per student (past, current, future)
    for (let m = -1; m <= 1; m++) {
      const d = new Date(now.getFullYear(), now.getMonth() + m, 15);
      await db.insert(paymentDues).values({
        studentId,
        organizationId: orgId,
        userId: userId,
        amount: "150.00",
        dueDate: d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
        status: m === -1 ? "pago" : (m === 0 ? "pendente" : "pendente"),
        month: d.getMonth() + 1,
        year: d.getFullYear(),
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    // 5 Lessons per student
    for (let l = -2; l <= 2; l++) {
      const ld = new Date(now);
      ld.setDate(ld.getDate() + (l * 7));
      ld.setHours(10 + (l % 8), 0, 0, 0);

      const endTime = new Date(ld);
      endTime.setHours(ld.getHours() + 1);

      await db.insert(lessons).values({
        studentId,
        organizationId: orgId,
        userId: userId,
        title: `Aula de teste ${l}`,
        scheduledAt: ld,
        duration: 60,
        status: l < 0 ? "concluida" : "agendada",
        createdAt: new Date()
      });
    }
  }

  console.log("Seed complete! Email: demo@musicpro.com Password: demo");
  process.exit(0);
}

seed().catch(console.error);
