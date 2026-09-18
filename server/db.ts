import { debugLog } from "./_core/logger";
import { eq, desc, asc, sql, and, gte, lte, lt, isNotNull, inArray, aliasedTable } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { 
  students, lessons, instruments, users, paymentDues, 
  studentGoals, studentTimeline, asaasCustomers, 
  organizations, settings, professores, studioRooms, monthlyStats, InsertSettings, InsertUser, marketingCampaigns, marketingContacts, marketingJobs, marketingLogs 
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;
let queryClient: postgres.Sql | null = null;
let _schemaInitialized = false;

async function ensureSchemaConsistency(db: any) {
  if (_schemaInitialized) return;
  
  console.time("[DB] schema-consistency-check");
  try {
    debugLog("[Database] Checking schema consistency...");

    // Create system tables if missing (drizzle-kit push might not run on deploy)
    try {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS "system_plans" (
          "id" varchar(50) PRIMARY KEY,
          "name" varchar(100) NOT NULL,
          "priceMonthly" integer NOT NULL,
          "priceYearly" integer NOT NULL,
          "maxStudents" integer NOT NULL,
          "features" jsonb NOT NULL,
          "isActive" boolean DEFAULT true NOT NULL,
          "showOnLanding" boolean DEFAULT true NOT NULL,
          "order" integer DEFAULT 0 NOT NULL,
          "allow_extra_students" boolean DEFAULT true NOT NULL,
          "extra_student_price" numeric DEFAULT 1.49 NOT NULL,
          "createdAt" timestamp DEFAULT now() NOT NULL,
          "updatedAt" timestamp DEFAULT now() NOT NULL
        )
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS "system_coupons" (
          "id" serial PRIMARY KEY,
          "code" varchar(50) NOT NULL UNIQUE,
          "type" varchar(20) NOT NULL,
          "value" integer NOT NULL,
          "maxUses" integer,
          "currentUses" integer DEFAULT 0 NOT NULL,
          "expiresAt" timestamp,
          "isActive" boolean DEFAULT true NOT NULL,
          "createdAt" timestamp DEFAULT now() NOT NULL
        )
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS "system_tutorials" (
          "id" serial PRIMARY KEY,
          "title" varchar(255) NOT NULL,
          "youtubeUrl" text NOT NULL,
          "videoId" varchar(20),
          "playlistId" varchar(60),
          "description" text,
          "category" varchar(60) DEFAULT 'Geral' NOT NULL,
          "position" integer DEFAULT 0 NOT NULL,
          "isActive" boolean DEFAULT true NOT NULL,
          "createdByUserId" integer NOT NULL,
          "createdAt" timestamp DEFAULT now() NOT NULL,
          "updatedAt" timestamp DEFAULT now() NOT NULL
        )
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS "system_tutorials_active_pos_idx"
        ON "system_tutorials" ("isActive", "position")
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS "teacher_payment_rules" (
          "id" serial PRIMARY KEY,
          "organizationId" integer NOT NULL,
          "teacherId" integer,
          "name" varchar(120) NOT NULL,
          "ruleType" varchar(20) NOT NULL,
          "fixedAmount" numeric(10,2) DEFAULT '0.00' NOT NULL,
          "amountPerClass" numeric(10,2) DEFAULT '0.00' NOT NULL,
          "percentage" numeric(5,2) DEFAULT '0.00' NOT NULL,
          "calculationBase" varchar(20) DEFAULT 'bruto' NOT NULL,
          "manualBaseAmount" numeric(10,2) DEFAULT '0.00' NOT NULL,
          "closingPeriod" varchar(20) DEFAULT 'mensal' NOT NULL,
          "closingDay" integer DEFAULT 30 NOT NULL,
          "paymentDay" integer DEFAULT 5 NOT NULL,
          "paymentDaysAfter" integer DEFAULT 0 NOT NULL,
          "isSchoolDefault" boolean DEFAULT false NOT NULL,
          "active" boolean DEFAULT true NOT NULL,
          "startDate" timestamp NOT NULL,
          "endDate" timestamp,
          "createdByUserId" integer,
          "createdAt" timestamp DEFAULT now() NOT NULL,
          "updatedAt" timestamp DEFAULT now() NOT NULL
        )
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS "teacher_payment_rules_teacher_idx"
        ON "teacher_payment_rules" ("teacherId", "startDate")
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS "teacher_payment_rule_conditions" (
          "id" serial PRIMARY KEY,
          "ruleId" integer NOT NULL,
          "conditionType" varchar(40) NOT NULL,
          "enabled" boolean DEFAULT true NOT NULL,
          "action" varchar(30) DEFAULT 'remunerar' NOT NULL,
          "percentage" numeric(5,2) DEFAULT '0.00' NOT NULL,
          "fixedAmount" numeric(10,2) DEFAULT '0.00' NOT NULL,
          "minHours" integer,
          "createdAt" timestamp DEFAULT now() NOT NULL,
          "updatedAt" timestamp DEFAULT now() NOT NULL
        )
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS "teacher_payment_rule_conditions_rule_idx"
        ON "teacher_payment_rule_conditions" ("ruleId")
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS "teacher_payment_rule_courses" (
          "id" serial PRIMARY KEY,
          "ruleId" integer NOT NULL,
          "instrumentId" integer NOT NULL,
          "ruleType" varchar(20) NOT NULL,
          "amountPerClass" numeric(10,2) DEFAULT '0.00' NOT NULL,
          "percentage" numeric(5,2) DEFAULT '0.00' NOT NULL,
          "fixedAmount" numeric(10,2) DEFAULT '0.00' NOT NULL,
          "startDate" timestamp NOT NULL,
          "endDate" timestamp,
          "createdAt" timestamp DEFAULT now() NOT NULL
        )
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS "teacher_payment_rule_courses_rule_idx"
        ON "teacher_payment_rule_courses" ("ruleId")
      `);
      await db.execute(sql`ALTER TABLE "professor_payments" ADD COLUMN IF NOT EXISTS "ruleSnapshot" jsonb`);
      await db.execute(sql`ALTER TABLE "professor_payments" ADD COLUMN IF NOT EXISTS "calculationMemory" jsonb`);
    } catch (e) {
      debugLog("[Database] Failed to execute create system tables:", e);
    }
    
    // system_plans: migração de colunas legadas camelCase para snake_case
    await db.execute(sql`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_plans' AND column_name = 'priceMonthly') THEN
        ALTER TABLE "system_plans" RENAME COLUMN "priceMonthly" TO "price_monthly";
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_plans' AND column_name = 'priceYearly') THEN
        ALTER TABLE "system_plans" RENAME COLUMN "priceYearly" TO "price_yearly";
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_plans' AND column_name = 'maxStudents') THEN
        ALTER TABLE "system_plans" RENAME COLUMN "maxStudents" TO "max_students";
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_plans' AND column_name = 'isActive') THEN
        ALTER TABLE "system_plans" RENAME COLUMN "isActive" TO "is_active";
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_plans' AND column_name = 'showOnLanding') THEN
        ALTER TABLE "system_plans" RENAME COLUMN "showOnLanding" TO "show_on_landing";
      END IF;
    END $$;`);

    // system_plans: allow_extra_students e extra_student_price
    await db.execute(sql`ALTER TABLE "system_plans" ADD COLUMN IF NOT EXISTS "allow_extra_students" boolean DEFAULT true NOT NULL`);
    await db.execute(sql`ALTER TABLE "system_plans" ADD COLUMN IF NOT EXISTS "extra_student_price" numeric DEFAULT 1.49 NOT NULL`);

    // lessons.studentId (nullable)
    await db.execute(sql`ALTER TABLE "lessons" ALTER COLUMN "studentId" DROP NOT NULL`);
    
    // settings.pixKey and settings.hiddenTabs
    await db.execute(sql`ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "pixKey" text`);
    await db.execute(sql`ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "conversationalMode" integer DEFAULT 1 NOT NULL`);
    await db.execute(sql`ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "attendancePersonaName" varchar(60)`);
    await db.execute(sql`ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "attendanceTone" varchar(20)`);
    await db.execute(sql`ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "hiddenTabs" text DEFAULT '' NOT NULL`);
    await db.execute(sql`ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "hiddenDashboardWidgets" text DEFAULT '' NOT NULL`);
    await db.execute(sql`ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "hideFinancialValues" integer DEFAULT 0 NOT NULL`);
    // professores.dashboardWidgets — cards permitidos definidos pelo admin (modo trava)
    await db.execute(sql`ALTER TABLE "professores" ADD COLUMN IF NOT EXISTS "dashboardWidgets" text DEFAULT '' NOT NULL`);
    await db.execute(sql`ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "chatbotEnabled" integer NOT NULL DEFAULT 0`);
    
    // users.mustChangePassword
    await db.execute(sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "mustChangePassword" boolean DEFAULT false NOT NULL`);
    // users.lastSeenReleaseVersion (Novidades — shared/releases.ts)
    await db.execute(sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lastSeenReleaseVersion" varchar(20) DEFAULT '' NOT NULL`);
    
    // settings Asaas Integration
    await db.execute(sql`ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "asaasApiKey" text`);
    await db.execute(sql`ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "asaasEnabled" integer DEFAULT 0 NOT NULL`);

    // settings Mercado Pago Integration
    await db.execute(sql`ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "paymentGateway" varchar(20) DEFAULT 'asaas' NOT NULL`);
    await db.execute(sql`ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "mpAccessToken" text`);
    
    // payment_dues Mercado Pago Integration
    await db.execute(sql`ALTER TABLE "payment_dues" ADD COLUMN IF NOT EXISTS "mpPaymentId" varchar(100)`);
    await db.execute(sql`ALTER TABLE "payment_dues" ADD COLUMN IF NOT EXISTS "mpPaymentLink" text`);

    // settings InfinitePay Integration (Checkout Integrado)
    await db.execute(sql`ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "infinitepayHandle" varchar(100)`);
    await db.execute(sql`ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "infinitepayApiKey" text`);
    await db.execute(sql`ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "infinitepayEnabled" integer DEFAULT 0 NOT NULL`);

    // payment_dues InfinitePay Integration
    await db.execute(sql`ALTER TABLE "payment_dues" ADD COLUMN IF NOT EXISTS "infinitepayPaymentId" varchar(100)`);
    await db.execute(sql`ALTER TABLE "payment_dues" ADD COLUMN IF NOT EXISTS "infinitepayPaymentLink" text`);
    await db.execute(sql`ALTER TABLE "payment_dues" ADD COLUMN IF NOT EXISTS "infinitepaySlug" text`);
    
    // organizations Subscription Fields
    await db.execute(sql`ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "subscriptionStatus" varchar(50) DEFAULT 'trialing' NOT NULL`);
    await db.execute(sql`ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "trialEndsAt" timestamp`);
    await db.execute(sql`ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "currentPeriodEnd" timestamp`);
    await db.execute(sql`ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "asaasCustomerId" varchar(100)`);
    await db.execute(sql`ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "asaasSubscriptionId" varchar(100)`);
    await db.execute(sql`ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "zipCode" varchar(9)`);
    await db.execute(sql`ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "addressStreet" varchar(255)`);
    await db.execute(sql`ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "addressNumber" varchar(20)`);
    await db.execute(sql`ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "addressDistrict" varchar(120)`);
    await db.execute(sql`ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "addressCity" varchar(120)`);
    await db.execute(sql`ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "addressState" varchar(2)`);

    // AUDIT-CONTRACTS: espelho dos Dados da Escola usado por settings.updateSchool —
    // colunas ausentes faziam o UPDATE falhar com "column does not exist".
    await db.execute(sql`ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "phone" varchar(30)`);
    await db.execute(sql`ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "email" varchar(255)`);
    await db.execute(sql`ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "address" text`);
    await db.execute(sql`ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "city" varchar(120)`);
    await db.execute(sql`ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "cnpj" varchar(25)`);

    // students.studentUserId
    await db.execute(sql`ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "studentUserId" integer`);
    
    // payment_dues columns for Asaas
    await db.execute(sql`ALTER TABLE "payment_dues" ADD COLUMN IF NOT EXISTS "asaasId" text`);
    await db.execute(sql`ALTER TABLE "payment_dues" ADD COLUMN IF NOT EXISTS "asaasPaymentLink" text`);
    await db.execute(sql`ALTER TABLE "payment_dues" ADD COLUMN IF NOT EXISTS "asaasBillingType" varchar(30)`);
    await db.execute(sql`ALTER TABLE "payment_dues" ADD COLUMN IF NOT EXISTS "receiptUrl" text`);
    
    // lessonType column
    await db.execute(sql`ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "lessonType" text DEFAULT 'individual'`);
    await db.execute(sql`ALTER TABLE "lessons" ADD COLUMN IF NOT EXISTS "lessonType" text DEFAULT 'individual'`);

    // lessons.recurrence: tipo da série (semanal/quinzenal/mensal30/mensal_fixo) — destaque visual na agenda
    await db.execute(sql`ALTER TABLE "lessons" ADD COLUMN IF NOT EXISTS "recurrence" varchar(20)`);
    
    // alertSent1h and alertSent30m columns
    await db.execute(sql`ALTER TABLE "lessons" ADD COLUMN IF NOT EXISTS "alertSent1h" boolean DEFAULT false NOT NULL`);
    await db.execute(sql`ALTER TABLE "lessons" ADD COLUMN IF NOT EXISTS "alertSent30m" boolean DEFAULT false NOT NULL`);
    
    // expenses table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "expenses" (
        "id" serial PRIMARY KEY NOT NULL,
        "organizationId" integer,
        "userId" integer NOT NULL,
        "description" varchar(255) NOT NULL,
        "amount" numeric(10, 2) NOT NULL,
        "date" date NOT NULL,
        "category" varchar(100) NOT NULL,
        "status" payment_due_status DEFAULT 'pendente' NOT NULL,
        "receiptUrl" text,
        "notes" text,
        "createdAt" timestamp DEFAULT now() NOT NULL,
        "updatedAt" timestamp DEFAULT now() NOT NULL
      )
    `);
    await db.execute(sql`ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "supplier" varchar(255)`);
    await db.execute(sql`ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "account" varchar(255)`);
    await db.execute(sql`ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "recurrence" varchar(50) DEFAULT 'unica' NOT NULL`);
    
    
    // student_evolution table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "student_evolution" (
        "id" serial PRIMARY KEY,
        "organizationId" integer,
        "studentId" integer NOT NULL,
        "technical" integer DEFAULT 0 NOT NULL,
        "rhythm" integer DEFAULT 0 NOT NULL,
        "harmony" integer DEFAULT 0 NOT NULL,
        "reading" integer DEFAULT 0 NOT NULL,
        "recordedAt" timestamp DEFAULT now() NOT NULL
      )
    `);

    // ai_documents table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "ai_documents" (
        "id" serial PRIMARY KEY,
        "organizationId" integer NOT NULL,
        "userId" integer NOT NULL,
        "fileName" varchar(255) NOT NULL,
        "fileType" varchar(50) NOT NULL,
        "extractedText" text NOT NULL,
        "createdAt" timestamp DEFAULT now() NOT NULL
      )
    `);

    // extra_lesson_requests table (PRD_AULA_EXTRA) — varchar p/ status para não depender do enum físico
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "extra_lesson_requests" (
        "id" serial PRIMARY KEY,
        "organizationId" integer,
        "studentId" integer NOT NULL,
        "preferredDates" text NOT NULL,
        "reason" text,
        "status" varchar(20) DEFAULT 'pendente' NOT NULL,
        "createdAt" timestamp DEFAULT now() NOT NULL
      )
    `);

    // school_plans + students.schoolPlanId (Catálogo de Planos & Bolsas da Escola)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "school_plans" (
        "id" serial PRIMARY KEY,
        "organizationId" integer NOT NULL,
        "nome" varchar(120) NOT NULL,
        "aulasPorSemana" integer DEFAULT 1 NOT NULL,
        "duracaoMeses" integer DEFAULT 1 NOT NULL,
        "isBolsa" boolean DEFAULT true NOT NULL,
        "valorMensal" numeric(10, 2) NOT NULL,
        "valorCheio" numeric(10, 2),
        "taxaInscricao" numeric(10, 2) DEFAULT 0 NOT NULL,
        "diasLimite" varchar(20) DEFAULT '10,20' NOT NULL,
        "descricao" text,
        "ativo" boolean DEFAULT true NOT NULL,
        "createdAt" timestamp DEFAULT now() NOT NULL,
        "updatedAt" timestamp DEFAULT now() NOT NULL
      )
    `);
    await db.execute(sql`ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "schoolPlanId" integer`);

    // Desafios (PRD_RANKINGS §55)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "school_challenges" (
        "id" serial PRIMARY KEY,
        "organizationId" integer NOT NULL,
        "userId" integer NOT NULL,
        "titulo" varchar(160) NOT NULL,
        "descricao" text,
        "tipo" varchar(20) NOT NULL,
        "pontos" integer DEFAULT 50 NOT NULL,
        "prazo" timestamp,
        "rankingId" integer,
        "turmaNome" varchar(120),
        "batalhaStudentA" integer,
        "batalhaStudentB" integer,
        "quizQuestions" text,
        "praticaMinutos" integer,
        "praticaDias" integer,
        "status" varchar(20) DEFAULT 'ativa' NOT NULL,
        "createdAt" timestamp DEFAULT now() NOT NULL,
        "updatedAt" timestamp DEFAULT now() NOT NULL
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "challenge_responses" (
        "id" serial PRIMARY KEY,
        "organizationId" integer NOT NULL,
        "challengeId" integer NOT NULL,
        "studentId" integer NOT NULL,
        "respostaTexto" text,
        "fileUrl" text,
        "fileType" varchar(100),
        "respostasQuiz" text,
        "status" varchar(20) DEFAULT 'enviado' NOT NULL,
        "pontos" integer,
        "feedback" text,
        "avaliadoBy" integer,
        "avaliadoAt" timestamp,
        "createdAt" timestamp DEFAULT now() NOT NULL
      )
    `);
    
    // message_automation_rules table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "message_automation_rules" (
        "id" serial PRIMARY KEY NOT NULL,
        "organizationId" integer,
        "userId" integer NOT NULL,
        "name" varchar(255) NOT NULL,
        "description" text,
        "isSystem" integer DEFAULT 0 NOT NULL,
        "isActive" integer DEFAULT 1 NOT NULL,
        "trigger" varchar(100) NOT NULL,
        "offsetDays" integer DEFAULT 0 NOT NULL,
        "offsetHours" integer DEFAULT 0 NOT NULL,
        "conditions" text,
        "actions" text,
        "messageTemplate" text NOT NULL,
        "channel" varchar(50) DEFAULT 'whatsapp' NOT NULL,
        "totalSent" integer DEFAULT 0 NOT NULL,
        "lastExecutedAt" timestamp,
        "createdAt" timestamp DEFAULT now() NOT NULL,
        "updatedAt" timestamp DEFAULT now() NOT NULL
      )
    `);

    debugLog("[Database] Schema consistency check passed.");
  } catch (error: any) {
    console.warn(`[Database] Schema consistency check failed. Code: ${error.code}. Message: ${error.message}`);
  } finally {
    const safeExecute = async (query: any, description: string) => {
      try {
        await db.execute(query);
      } catch (e: any) {
        console.warn(`[Database] Failed to execute ${description}: ${e.message}`);
      }
    };

    // professor_payments adjustments
    await safeExecute(sql`ALTER TABLE "professor_payments" ADD COLUMN IF NOT EXISTS "adjustments" text`, "professor_payments.adjustments");

    // student_files folder and viewedAt
    await safeExecute(sql`ALTER TABLE "student_files" ADD COLUMN IF NOT EXISTS "folder" text`, "student_files.folder");
    await safeExecute(sql`ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "logoUrl" text`, "settings.logoUrl");
    await safeExecute(sql`ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "showSchoolName" integer NOT NULL DEFAULT 1`, "settings.showSchoolName");
    await safeExecute(sql`ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "schoolEmail" varchar(255)`, "settings.schoolEmail");
    await safeExecute(sql`ALTER TABLE "student_files" ADD COLUMN IF NOT EXISTS "viewedAt" timestamp`, "student_files.viewedAt");
    await safeExecute(sql`ALTER TABLE "analytics_visitors" ADD COLUMN IF NOT EXISTS "total_events" integer DEFAULT 0 NOT NULL`, "analytics_visitors.total_events");
    await safeExecute(sql`ALTER TABLE "analytics_sessions" ADD COLUMN IF NOT EXISTS "organization_id" integer`, "analytics_sessions.organization_id");
    await safeExecute(sql`ALTER TABLE "analytics_events" ADD COLUMN IF NOT EXISTS "organization_id" integer`, "analytics_events.organization_id");
    await safeExecute(sql`CREATE TABLE IF NOT EXISTS "analytics_ai_insights" ("id" serial PRIMARY KEY, "insight_type" varchar(50) NOT NULL, "title" varchar(255) NOT NULL, "description" text NOT NULL, "severity" varchar(20) DEFAULT 'info' NOT NULL, "recommendation" text, "metric_ref" varchar(100), "metric_value" numeric(10,2), "generated_at" timestamp DEFAULT now() NOT NULL, "expires_at" timestamp, "is_read" boolean DEFAULT false NOT NULL)`, "analytics_ai_insights table");
    await safeExecute(sql`ALTER TABLE "analytics_ai_insights" ADD COLUMN IF NOT EXISTS "description" text`, "analytics_ai_insights.description");
    await safeExecute(sql`ALTER TABLE "analytics_ai_insights" ADD COLUMN IF NOT EXISTS "recommendation" text`, "analytics_ai_insights.recommendation");
    await safeExecute(sql`ALTER TABLE "analytics_ai_insights" ADD COLUMN IF NOT EXISTS "metric_ref" varchar(100)`, "analytics_ai_insights.metric_ref");
    await safeExecute(sql`ALTER TABLE "analytics_ai_insights" ADD COLUMN IF NOT EXISTS "metric_value" numeric(10,2)`, "analytics_ai_insights.metric_value");

    // automations and students missing fields
    await safeExecute(sql`ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "allowAutoReminders" boolean DEFAULT true NOT NULL`, "students.allowAutoReminders");
    await safeExecute(sql`ALTER TABLE "message_automation_rules" ADD COLUMN IF NOT EXISTS "sendToStudent" integer DEFAULT 1 NOT NULL`, "message_automation_rules.sendToStudent");
    await safeExecute(sql`ALTER TABLE "message_automation_rules" ADD COLUMN IF NOT EXISTS "sendToGuardian" integer DEFAULT 0 NOT NULL`, "message_automation_rules.sendToGuardian");
    await safeExecute(sql`ALTER TABLE "message_automation_rules" ADD COLUMN IF NOT EXISTS "triggerUnit" varchar(10) DEFAULT 'meses' NOT NULL`, "message_automation_rules.triggerUnit");
    // Matrícula por link: contrato automático + CPF do responsável
    await safeExecute(sql`ALTER TABLE "enrollment_links" ADD COLUMN IF NOT EXISTS "contractTemplateId" integer`, "enrollment_links.contractTemplateId");
    await safeExecute(sql`ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "guardianCpf" varchar(20)`, "students.guardianCpf");
    // Suporte / chamados
    await safeExecute(sql`CREATE TABLE IF NOT EXISTS "support_tickets" ("id" serial PRIMARY KEY, "organizationId" integer, "userId" integer NOT NULL, "category" varchar(20) DEFAULT 'melhoria' NOT NULL, "title" varchar(255) NOT NULL, "description" text NOT NULL, "pageUrl" varchar(500), "status" varchar(20) DEFAULT 'aberto' NOT NULL, "priority" varchar(10) DEFAULT 'media' NOT NULL, "adminResponse" text, "resolvedAt" timestamp, "createdAt" timestamp DEFAULT now() NOT NULL, "updatedAt" timestamp DEFAULT now() NOT NULL)`, "support_tickets table");
    await safeExecute(sql`CREATE INDEX IF NOT EXISTS "support_tickets_org_idx" ON "support_tickets" ("organizationId")`, "support_tickets.org_idx");
    await safeExecute(sql`CREATE INDEX IF NOT EXISTS "support_tickets_status_idx" ON "support_tickets" ("status")`, "support_tickets.status_idx");
    await safeExecute(sql`ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "attachments" text`, "support_tickets.attachments");
    await safeExecute(sql`ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "hasUnreadResponse" boolean DEFAULT false NOT NULL`, "support_tickets.hasUnreadResponse");
    // Matrículas por curso (aluno pode ter mais de um curso)
    await safeExecute(sql`CREATE TABLE IF NOT EXISTS "student_enrollments" ("id" serial PRIMARY KEY, "organizationId" integer NOT NULL, "studentId" integer NOT NULL, "instrumentId" integer, "planId" integer, "teacherUserId" integer, "studioRoomId" integer, "durationMonths" integer DEFAULT 1 NOT NULL, "lessonsPerWeek" integer DEFAULT 1 NOT NULL, "weekday" integer DEFAULT 1 NOT NULL, "timeStr" varchar(5), "monthlyFee" decimal(10,2) DEFAULT '0.00' NOT NULL, "enrollmentFee" decimal(10,2) DEFAULT '0.00' NOT NULL, "startDate" date, "endDate" date, "status" varchar(20) DEFAULT 'ativo' NOT NULL, "createdAt" timestamp DEFAULT now() NOT NULL, "updatedAt" timestamp DEFAULT now() NOT NULL)`, "student_enrollments table");
    await safeExecute(sql`CREATE INDEX IF NOT EXISTS "student_enrollments_student_idx" ON "student_enrollments" ("studentId")`, "student_enrollments.student_idx");
    await safeExecute(sql`CREATE INDEX IF NOT EXISTS "student_enrollments_org_idx" ON "student_enrollments" ("organizationId")`, "student_enrollments.org_idx");

    // studio_rooms schema extension
    await safeExecute(sql`ALTER TABLE "studio_rooms" ADD COLUMN IF NOT EXISTS "category" varchar(100) DEFAULT 'Sala de ensaio' NOT NULL`, "studio_rooms.category");
    await safeExecute(sql`ALTER TABLE "studio_rooms" ADD COLUMN IF NOT EXISTS "capacity" integer DEFAULT 8 NOT NULL`, "studio_rooms.capacity");
    await safeExecute(sql`ALTER TABLE "studio_rooms" ADD COLUMN IF NOT EXISTS "equipments" text DEFAULT 'Espelhos, Barra, Tablado' NOT NULL`, "studio_rooms.equipments");
    await safeExecute(sql`ALTER TABLE "studio_rooms" ADD COLUMN IF NOT EXISTS "status" varchar(20) DEFAULT 'ativa' NOT NULL`, "studio_rooms.status");
    await safeExecute(sql`ALTER TABLE "studio_rooms" ADD COLUMN IF NOT EXISTS "imageUrl" text`, "studio_rooms.imageUrl");
    await safeExecute(sql`ALTER TABLE "studio_rooms" ADD COLUMN IF NOT EXISTS "utilization_rate" integer DEFAULT 75 NOT NULL`, "studio_rooms.utilization_rate");
    await safeExecute(sql`ALTER TABLE "studio_rooms" ADD COLUMN IF NOT EXISTS "is_principal" boolean DEFAULT false NOT NULL`, "studio_rooms.is_principal");

    // BUG-002: Corrigir UNIQUE(email) sem organizationId em students
    // Dropar constraint antigo (se existir) e recriar com (email, organizationId)
    await safeExecute(sql`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'students_email_unique' AND conrelid = 'students'::regclass
        ) THEN
          ALTER TABLE "students" DROP CONSTRAINT "students_email_unique";
        END IF;
      END $$;
    `, "drop students_email_unique constraint");
    await safeExecute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS "students_email_org_unique"
      ON "students" ("email", "organizationId")
      WHERE "email" IS NOT NULL AND "email" <> ''
    `, "students email+org unique index");

    // BUG-007: Adicionar valor 'estudo' ao enum reminder_type
    await safeExecute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum
          WHERE enumlabel = 'estudo' AND enumtypid = (
            SELECT oid FROM pg_type WHERE typname = 'reminder_type'
          )
        ) THEN
          ALTER TYPE "reminder_type" ADD VALUE 'estudo';
        END IF;
      END $$;
    `, "add 'estudo' to reminder_type enum");

    // MH-001: Índice composto em students(organizationId, status) para melhorar performance
    await safeExecute(sql`CREATE INDEX IF NOT EXISTS "idx_students_org_status" ON "students" ("organizationId", "status")`, "idx_students_org_status");
    // Índice em lessons(scheduledAt) para queries de calendário
    await safeExecute(sql`CREATE INDEX IF NOT EXISTS "idx_lessons_scheduled_at" ON "lessons" ("scheduledAt", "userId")`, "idx_lessons_scheduled_at");
    // Índice em payment_dues(dueDate, status) para queries financeiras
    await safeExecute(sql`CREATE INDEX IF NOT EXISTS "idx_payment_dues_date_status" ON "payment_dues" ("dueDate", "status", "organizationId")`, "idx_payment_dues_date_status");
    // Índice em reminders(status, scheduledAt) para o job de automação
    await safeExecute(sql`CREATE INDEX IF NOT EXISTS "idx_reminders_status_scheduled" ON "reminders" ("status", "scheduledAt", "organizationId")`, "idx_reminders_status_scheduled");

    // ─── MÉDIO-07 FIX: Índices adicionais para queries críticas ─────────────────
    // Esses índices eliminam sequential scans nas tabelas mais acessadas.
    // Billing Engine (Juros e Multas)
    await safeExecute(sql`ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "lateFeeEnabled" integer DEFAULT 1 NOT NULL`, "settings lateFeeEnabled");
    await safeExecute(sql`ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "lateFeeType" varchar(20) DEFAULT 'percentage' NOT NULL`, "settings lateFeeType");
    await safeExecute(sql`ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "lateFeeValue" numeric(10, 2) DEFAULT 2.00 NOT NULL`, "settings lateFeeValue");
    await safeExecute(sql`ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "interestEnabled" integer DEFAULT 1 NOT NULL`, "settings interestEnabled");
    await safeExecute(sql`ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "interestType" varchar(20) DEFAULT 'daily' NOT NULL`, "settings interestType");
    await safeExecute(sql`ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "interestRate" numeric(10, 4) DEFAULT 0.3300 NOT NULL`, "settings interestRate");
    await safeExecute(sql`ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "graceDays" integer DEFAULT 3 NOT NULL`, "settings graceDays");
    await safeExecute(sql`ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "autoUpdateInvoice" integer DEFAULT 1 NOT NULL`, "settings autoUpdateInvoice");
    await safeExecute(sql`ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "showFeeBreakdown" integer DEFAULT 1 NOT NULL`, "settings showFeeBreakdown");
    await safeExecute(sql`ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "attendanceCheckinMoment" varchar(20) DEFAULT 'inicio' NOT NULL`, "settings attendanceCheckinMoment");
    await safeExecute(sql`ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "attendanceToleranceMinutes" integer DEFAULT 30 NOT NULL`, "settings attendanceToleranceMinutes");
    // OpenCode provider (IA especialista + assistente) — respeita aiProvider = gemini|groq|opencode (AGENTS: usuário pediu)
    await safeExecute(sql`ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "opencodeApiKey" text`, "settings opencodeApiKey");
    await safeExecute(sql`ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "opencodeModel" varchar(255)`, "settings opencodeModel");
    await safeExecute(sql`ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "opencodeApiUrl" text`, "settings opencodeApiUrl");
    await safeExecute(sql`ALTER TABLE "lessons" ADD COLUMN IF NOT EXISTS "studioRoomId" integer`, "lessons studioRoomId");

    // Tabela studio_rooms
    await safeExecute(sql`
      CREATE TABLE IF NOT EXISTS "studio_rooms" (
        "id" serial PRIMARY KEY NOT NULL,
        "organizationId" integer NOT NULL,
        "name" varchar(100) NOT NULL,
        "description" text,
        "color" varchar(20) DEFAULT '#3b82f6' NOT NULL,
        "active" boolean DEFAULT true NOT NULL,
        "createdAt" timestamp DEFAULT now() NOT NULL,
        "updatedAt" timestamp DEFAULT now() NOT NULL
      )
    `, "create studio_rooms table");

    // Tabela enrollment_links
    await safeExecute(sql`
      CREATE TABLE IF NOT EXISTS "enrollment_links" (
        "id" serial PRIMARY KEY NOT NULL,
        "organizationId" integer NOT NULL,
        "code" varchar(64) NOT NULL UNIQUE,
        "instrumentId" integer,
        "monthlyFee" numeric(10, 2),
        "leadId" integer,
        "status" varchar(20) DEFAULT 'active' NOT NULL,
        "expiresAt" timestamp,
        "createdAt" timestamp DEFAULT now() NOT NULL
      )
    `, "create enrollment_links table");
    await safeExecute(sql`ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "earlyDiscountEnabled" integer DEFAULT 0 NOT NULL`, "settings earlyDiscountEnabled");
    await safeExecute(sql`ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "earlyDiscountType" varchar(20) DEFAULT 'percentage' NOT NULL`, "settings earlyDiscountType");
    await safeExecute(sql`ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "earlyDiscountValue" numeric(10, 2) DEFAULT 5.00 NOT NULL`, "settings earlyDiscountValue");
    await safeExecute(sql`ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "earlyDiscountDays" integer DEFAULT 0 NOT NULL`, "settings earlyDiscountDays");

    await safeExecute(sql`ALTER TABLE "payment_dues" ADD COLUMN IF NOT EXISTS "originalAmount" numeric(10, 2)`, "payment_dues originalAmount");
    await safeExecute(sql`ALTER TABLE "payment_dues" ADD COLUMN IF NOT EXISTS "lastCalculation" timestamp`, "payment_dues lastCalculation");
    await safeExecute(sql`ALTER TABLE "payment_dues" ADD COLUMN IF NOT EXISTS "daysOverdueCache" integer`, "payment_dues daysOverdueCache");
    await safeExecute(sql`ALTER TABLE "payment_dues" ADD COLUMN IF NOT EXISTS "updatedAmountCache" numeric(10, 2)`, "payment_dues updatedAmountCache");

    await safeExecute(sql`
      CREATE TABLE IF NOT EXISTS "billing_audit_logs" (
        "id" serial PRIMARY KEY,
        "organizationId" integer,
        "invoiceId" integer NOT NULL,
        "originalAmount" numeric(10, 2) NOT NULL,
        "lateFeeAmount" numeric(10, 2) NOT NULL,
        "interestAmount" numeric(10, 2) NOT NULL,
        "daysOverdue" integer NOT NULL,
        "updatedAmount" numeric(10, 2) NOT NULL,
        "userId" integer,
        "origin" varchar(50) NOT NULL,
        "createdAt" timestamp DEFAULT now() NOT NULL
      )
    `, "create billing_audit_logs table");

    // analytics_security_logs table
    await safeExecute(sql`
      CREATE TABLE IF NOT EXISTS "analytics_security_logs" (
        "id" serial PRIMARY KEY,
        "ip" varchar(45) NOT NULL,
        "route" text NOT NULL,
        "method" varchar(10) NOT NULL,
        "status_code" integer DEFAULT 200 NOT NULL,
        "event_category" varchar(50) NOT NULL,
        "severity" varchar(20) DEFAULT 'info' NOT NULL,
        "user_agent" text,
        "referer" text,
        "user_id" integer,
        "organization_id" integer,
        "details" text,
        "created_at" timestamp DEFAULT now() NOT NULL
      )
    `, "create analytics_security_logs table");
    await safeExecute(sql`CREATE INDEX IF NOT EXISTS "idx_analytics_security_logs_ip" ON "analytics_security_logs" ("ip")`, "idx_analytics_security_logs_ip");
    await safeExecute(sql`CREATE INDEX IF NOT EXISTS "idx_analytics_security_logs_created" ON "analytics_security_logs" ("created_at")`, "idx_analytics_security_logs_created");

    // payment_dues.asaasId: usado no processamento de webhooks Asaas (lookup muito frequente)
    await safeExecute(sql`CREATE INDEX IF NOT EXISTS "idx_payment_dues_asaas_id" ON "payment_dues" ("asaasId") WHERE "asaasId" IS NOT NULL`, "idx_payment_dues_asaas_id");

    // payment_dues.infinitepayPaymentId: usado no processamento de webhooks InfinitePay
    await safeExecute(sql`CREATE INDEX IF NOT EXISTS "idx_payment_dues_infinitepay_id" ON "payment_dues" ("infinitepayPaymentId") WHERE "infinitepayPaymentId" IS NOT NULL`, "idx_payment_dues_infinitepay_id");

    // short_links: encurtador de links de pagamento (/p/{code}) — InfinitePay e futuros gateways
    await safeExecute(sql`
      CREATE TABLE IF NOT EXISTS "short_links" (
        "id" serial PRIMARY KEY NOT NULL,
        "organizationId" integer,
        "userId" integer,
        "code" varchar(16) NOT NULL UNIQUE,
        "targetUrl" text NOT NULL,
        "paymentDueId" integer,
        "enrollmentCode" varchar(100),
        "clicks" integer DEFAULT 0 NOT NULL,
        "createdAt" timestamp DEFAULT now() NOT NULL
      )
    `, "create short_links table");
    await safeExecute(sql`CREATE INDEX IF NOT EXISTS "idx_short_links_payment_due" ON "short_links" ("paymentDueId")`, "idx_short_links_payment_due");
    await safeExecute(sql`CREATE INDEX IF NOT EXISTS "idx_short_links_enrollment_code" ON "short_links" ("enrollmentCode")`, "idx_short_links_enrollment_code");

    // BUG FIX: em produção a tabela file_comments foi criada com colunas snake_case
    // (organization_id, file_id, user_id) mas o schema drizzle espera camelCase —
    // qualquer DELETE/INSERT/SELECT quebrava (ex.: superAdmin.deleteOrganization).
    // Renomeia para o padrão do schema; no-op se já estiver em camelCase.
    await db.execute(sql`
      DO $$
      BEGIN
        ALTER TABLE "file_comments" RENAME COLUMN "organization_id" TO "organizationId";
      EXCEPTION WHEN undefined_column THEN NULL;
      END $$;
    `);
    await db.execute(sql`
      DO $$
      BEGIN
        ALTER TABLE "file_comments" RENAME COLUMN "file_id" TO "fileId";
      EXCEPTION WHEN undefined_column THEN NULL;
      END $$;
    `);
    await db.execute(sql`
      DO $$
      BEGIN
        ALTER TABLE "file_comments" RENAME COLUMN "user_id" TO "userId";
      EXCEPTION WHEN undefined_column THEN NULL;
      END $$;
    `);

    // students por org + status + professor: query mais comum em toda a aplicação
    await safeExecute(sql`CREATE INDEX IF NOT EXISTS "idx_students_org_status" ON "students" ("organizationId", "status")`, "idx_students_org_status");
    await safeExecute(sql`CREATE INDEX IF NOT EXISTS "idx_students_org_professor" ON "students" ("organizationId", "professorId")`, "idx_students_org_professor");

    // users.organizationId: lookup de sessão no middleware de autenticação
    await safeExecute(sql`CREATE INDEX IF NOT EXISTS "idx_users_organization_id" ON "users" ("organizationId")`, "idx_users_organization_id");
    // users.email: login por email (muito frequente, deve ser rápido)
    await safeExecute(sql`CREATE INDEX IF NOT EXISTS "idx_users_email" ON "users" ("email") WHERE "email" IS NOT NULL`, "idx_users_email");
    // users.studentId: lookup do portal do aluno
    await safeExecute(sql`CREATE INDEX IF NOT EXISTS "idx_users_student_id" ON "users" ("studentId") WHERE "studentId" IS NOT NULL`, "idx_users_student_id");

    // notifications.userId: lookup de notificações do usuário
    await safeExecute(sql`CREATE INDEX IF NOT EXISTS "idx_notifications_user_id" ON "notifications" ("userId", "organizationId")`, "idx_notifications_user_id");

    // lessons.organizationId + status: queries do dashboard
    await safeExecute(sql`CREATE INDEX IF NOT EXISTS "idx_lessons_org_status" ON "lessons" ("organizationId", "status")`, "idx_lessons_org_status");
    // lessons.studentId: lookup de aulas por aluno
    await safeExecute(sql`CREATE INDEX IF NOT EXISTS "idx_lessons_student_id" ON "lessons" ("studentId")`, "idx_lessons_student_id");

    // daily_study_plans: aluno + status publicado (portal do aluno)
    await safeExecute(sql`ALTER TABLE "daily_study_plans" ADD COLUMN IF NOT EXISTS "daysTimeSpent" text DEFAULT '[0,0,0,0,0]' NOT NULL`, "daily_study_plans.daysTimeSpent");
    await safeExecute(sql`CREATE INDEX IF NOT EXISTS "idx_study_plans_student_status" ON "daily_study_plans" ("studentId", "publishedStatus", "status")`, "idx_study_plans_student_status");

    // payment_dues.studentId: relatórios financeiros por aluno
    await safeExecute(sql`CREATE INDEX IF NOT EXISTS "idx_payment_dues_student_id" ON "payment_dues" ("studentId", "organizationId")`, "idx_payment_dues_student_id");

    // file_comments table
    await safeExecute(sql`
      CREATE TABLE IF NOT EXISTS "file_comments" (
        "id" serial PRIMARY KEY,
        "organization_id" integer NOT NULL,
        "file_id" integer NOT NULL,
        "user_id" integer NOT NULL,
        "content" text NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
      )
    `, "create file_comments");

    // Create Marketing Enums if they don't exist
    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE campaign_status AS ENUM ('draft', 'running', 'paused', 'completed', 'error');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE campaign_contact_status AS ENUM ('pending', 'processing', 'sent', 'failed');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE job_status AS ENUM ('pending', 'running', 'completed', 'failed');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create Marketing Tables
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "marketing_campaigns" (
        "id" serial PRIMARY KEY,
        "organizationId" integer NOT NULL,
        "name" varchar(255) NOT NULL,
        "description" text,
        "status" campaign_status DEFAULT 'draft' NOT NULL,
        "minDelay" integer DEFAULT 10 NOT NULL,
        "maxDelay" integer DEFAULT 20 NOT NULL,
        "batchSize" integer DEFAULT 20 NOT NULL,
        "batchDelay" integer DEFAULT 600 NOT NULL,
        "totalContacts" integer DEFAULT 0 NOT NULL,
        "sentCount" integer DEFAULT 0 NOT NULL,
        "failedCount" integer DEFAULT 0 NOT NULL,
        "consecutiveErrors" integer DEFAULT 0 NOT NULL,
        "createdBy" integer NOT NULL,
        "startedAt" timestamp,
        "completedAt" timestamp,
        "createdAt" timestamp DEFAULT now() NOT NULL,
        "updatedAt" timestamp DEFAULT now() NOT NULL
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "marketing_contacts" (
        "id" serial PRIMARY KEY,
        "organizationId" integer NOT NULL,
        "campaignId" integer NOT NULL REFERENCES "marketing_campaigns"("id") ON DELETE CASCADE,
        "name" varchar(255) NOT NULL,
        "phone" varchar(50) NOT NULL,
        "variables" jsonb,
        "messageText" text NOT NULL,
        "status" campaign_contact_status DEFAULT 'pending' NOT NULL,
        "errorMessage" text,
        "evolutionMessageId" varchar(255),
        "processedAt" timestamp,
        "createdAt" timestamp DEFAULT now() NOT NULL
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "marketing_jobs" (
        "id" serial PRIMARY KEY,
        "organizationId" integer NOT NULL,
        "campaignId" integer NOT NULL REFERENCES "marketing_campaigns"("id") ON DELETE CASCADE,
        "status" job_status DEFAULT 'pending' NOT NULL,
        "lockedAt" timestamp,
        "lockedBy" varchar(255),
        "lastProcessedContactId" integer,
        "createdAt" timestamp DEFAULT now() NOT NULL,
        "updatedAt" timestamp DEFAULT now() NOT NULL
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "marketing_logs" (
        "id" serial PRIMARY KEY,
        "organizationId" integer NOT NULL,
        "campaignId" integer NOT NULL REFERENCES "marketing_campaigns"("id") ON DELETE CASCADE,
        "contactId" integer REFERENCES "marketing_contacts"("id") ON DELETE SET NULL,
        "level" varchar(50) NOT NULL,
        "message" text NOT NULL,
        "payload" jsonb,
        "response" jsonb,
        "createdAt" timestamp DEFAULT now() NOT NULL
      )
    `);

    await safeExecute(sql`ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "schoolCnpj" varchar(30)`, "settings.schoolCnpj");
    await safeExecute(sql`ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "lessonDuration" integer DEFAULT 60 NOT NULL`, "settings lessonDuration");

    // M-01 FIX: billingPeriodicity — nova coluna adicionada no schema mas sem migration explícita
    await safeExecute(sql`ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "billingPeriodicity" varchar(20) DEFAULT 'mensal' NOT NULL`, "students.billingPeriodicity");
    await safeExecute(sql`ALTER TABLE "payment_dues" ADD COLUMN IF NOT EXISTS "billingPeriodicity" varchar(20) DEFAULT 'mensal'`, "payment_dues.billingPeriodicity");

    // ─── MÓDULO DE CONTRATOS + ASSINATURA DIGITAL (Assinafy BYOK) ─────────────
    // Novos status de contrato (contratos digitais multi-provedor)
    await safeExecute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'aguardando_assinatura' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'contract_status')) THEN
          ALTER TYPE "contract_status" ADD VALUE 'aguardando_assinatura';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'expirado' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'contract_status')) THEN
          ALTER TYPE "contract_status" ADD VALUE 'expirado';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'erro' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'contract_status')) THEN
          ALTER TYPE "contract_status" ADD VALUE 'erro';
        END IF;
      END $$;
    `, "contract_status novos valores");

    // Enums de integrações
    await safeExecute(sql`
      DO $$ BEGIN
        CREATE TYPE integration_provider AS ENUM ('assinafy');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `, "integration_provider enum");
    await safeExecute(sql`
      DO $$ BEGIN
        CREATE TYPE integration_environment AS ENUM ('sandbox', 'production');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `, "integration_environment enum");
    await safeExecute(sql`
      DO $$ BEGIN
        CREATE TYPE integration_connection_status AS ENUM ('connected', 'invalid_credentials', 'disconnected', 'error');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `, "integration_connection_status enum");

    // Tabela contracts: garante existência + colunas do novo módulo
    await safeExecute(sql`
      CREATE TABLE IF NOT EXISTS "contracts" (
        "id" serial PRIMARY KEY NOT NULL,
        "organizationId" integer,
        "userId" integer NOT NULL,
        "studentId" integer NOT NULL,
        "title" varchar(255) NOT NULL,
        "status" contract_status DEFAULT 'rascunho' NOT NULL,
        "zapsignDocId" text,
        "zapsignSignUrl" text,
        "signedAt" timestamp,
        "documentUrl" text,
        "createdAt" timestamp DEFAULT now() NOT NULL,
        "updatedAt" timestamp DEFAULT now() NOT NULL
      )
    `, "create contracts table");
    await safeExecute(sql`ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "provider" varchar(30) DEFAULT 'assinafy' NOT NULL`, "contracts.provider");
    await safeExecute(sql`ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "contractNumber" varchar(40)`, "contracts.contractNumber");
    await safeExecute(sql`ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "templateId" integer`, "contracts.templateId");
    await safeExecute(sql`ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "templateContentSnapshot" text`, "contracts.templateContentSnapshot");
    await safeExecute(sql`ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "monthlyFee" numeric(10,2)`, "contracts.monthlyFee");
    await safeExecute(sql`ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "dueDay" integer`, "contracts.dueDay");
    await safeExecute(sql`ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "startDate" date`, "contracts.startDate");
    await safeExecute(sql`ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "endDate" date`, "contracts.endDate");
    await safeExecute(sql`ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "assinafyDocId" text`, "contracts.assinafyDocId");
    await safeExecute(sql`ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "assinafySignUrl" text`, "contracts.assinafySignUrl");
    await safeExecute(sql`ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "signedDocumentUrl" text`, "contracts.signedDocumentUrl");
    await safeExecute(sql`ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "sentAt" timestamp`, "contracts.sentAt");
    await safeExecute(sql`ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "cancelledAt" timestamp`, "contracts.cancelledAt");
    await safeExecute(sql`ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "expiresAt" timestamp`, "contracts.expiresAt");

    // Tabela school_integrations (BYOK — uma integração ativa por escola+provedor)
    await safeExecute(sql`
      CREATE TABLE IF NOT EXISTS "school_integrations" (
        "id" serial PRIMARY KEY NOT NULL,
        "organizationId" integer NOT NULL,
        "provider" integration_provider NOT NULL,
        "apiKeyEncrypted" text NOT NULL,
        "environment" integration_environment DEFAULT 'production' NOT NULL,
        "accountId" varchar(100),
        "active" boolean DEFAULT true NOT NULL,
        "lastConnectionTest" timestamp,
        "connectionStatus" integration_connection_status DEFAULT 'disconnected' NOT NULL,
        "createdAt" timestamp DEFAULT now() NOT NULL,
        "updatedAt" timestamp DEFAULT now() NOT NULL
      )
    `, "create school_integrations table");
    await safeExecute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS "school_integrations_org_provider_idx"
      ON "school_integrations" ("organizationId", "provider")
    `, "school_integrations org+provider unique");

    // Tabela contract_templates (modelos por escola)
    await safeExecute(sql`
      CREATE TABLE IF NOT EXISTS "contract_templates" (
        "id" serial PRIMARY KEY NOT NULL,
        "organizationId" integer NOT NULL,
        "name" varchar(255) NOT NULL,
        "description" text,
        "content" text NOT NULL,
        "active" boolean DEFAULT true NOT NULL,
        "createdAt" timestamp DEFAULT now() NOT NULL,
        "updatedAt" timestamp DEFAULT now() NOT NULL
      )
    `, "create contract_templates table");

    // Tabela contract_events (histórico + idempotência de webhook)
    await safeExecute(sql`
      CREATE TABLE IF NOT EXISTS "contract_events" (
        "id" serial PRIMARY KEY NOT NULL,
        "contractId" integer NOT NULL,
        "provider" varchar(30) DEFAULT 'assinafy' NOT NULL,
        "providerEventId" varchar(100),
        "eventType" varchar(100) NOT NULL,
        "description" text,
        "metadata" jsonb,
        "createdAt" timestamp DEFAULT now() NOT NULL
      )
    `, "create contract_events table");
    await safeExecute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS "contract_events_provider_event_idx"
      ON "contract_events" ("provider", "providerEventId")
      WHERE "providerEventId" IS NOT NULL
    `, "contract_events provider+event unique");

    // ─── Avaliações de Professores (PRD módulo 2) — leitura exclusiva do admin ──
    await safeExecute(sql`
      CREATE TABLE IF NOT EXISTS "professor_evaluation_periods" (
        "id" serial PRIMARY KEY NOT NULL,
        "organizationId" integer NOT NULL,
        "startDate" date NOT NULL,
        "endDate" date NOT NULL,
        "status" varchar(20) DEFAULT 'aberta' NOT NULL,
        "createdBy" integer DEFAULT 0 NOT NULL,
        "createdAt" timestamp DEFAULT now() NOT NULL
      )
    `, "create professor_evaluation_periods table");
    await safeExecute(sql`
      CREATE TABLE IF NOT EXISTS "professor_evaluations" (
        "id" serial PRIMARY KEY NOT NULL,
        "organizationId" integer NOT NULL,
        "periodId" integer NOT NULL,
        "studentId" integer NOT NULL,
        "professorId" integer NOT NULL,
        "nota" integer NOT NULL,
        "comentario" text,
        "createdAt" timestamp DEFAULT now() NOT NULL
      )
    `, "create professor_evaluations table");
    await safeExecute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS "prof_eval_period_student_uq"
      ON "professor_evaluations" ("periodId", "studentId")
    `, "prof_evaluations period+student unique");
    await safeExecute(sql`
      CREATE INDEX IF NOT EXISTS "idx_prof_evals_org_period"
      ON "professor_evaluations" ("organizationId", "periodId")
    `, "prof_evaluations org+period idx");
    await safeExecute(sql`
      CREATE INDEX IF NOT EXISTS "idx_prof_evals_professor"
      ON "professor_evaluations" ("professorId", "organizationId")
    `, "prof_evaluations professor idx");
    // Configuração do ciclo (por escola — settings é por usuário, mas a leitura
    // pega qualquer linha da org que tenha o valor preenchido)
    await safeExecute(sql`ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "professorEvalFrequency" varchar(20)`, "settings.professorEvalFrequency");
    await safeExecute(sql`ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "professorEvalWindowDays" integer`, "settings.professorEvalWindowDays");

    // Tabelas do Dashboard Comercial CRM & Funil de Leads
    await safeExecute(sql`
      CREATE TABLE IF NOT EXISTS "crm_leads" (
        "id" serial PRIMARY KEY NOT NULL,
        "organization_id" integer NOT NULL,
        "name" text NOT NULL,
        "company_or_school" text,
        "city_state" text,
        "phone" text,
        "email" text,
        "instrument" text,
        "plan_name" text DEFAULT 'Plano Pro',
        "stage" text DEFAULT 'novo' NOT NULL,
        "temperature" text DEFAULT 'morno',
        "value" numeric(10, 2) DEFAULT 0.00,
        "notes" text,
        "source" text DEFAULT 'WhatsApp',
        "lost_reason" text,
        "assigned_to_user_id" integer,
        "converted_student_id" integer,
        "due_date_alert" timestamp,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      )
    `, "create crm_leads table");

    await safeExecute(sql`ALTER TABLE "crm_leads" ADD COLUMN IF NOT EXISTS "company_or_school" text`, "crm_leads.company_or_school");
    await safeExecute(sql`ALTER TABLE "crm_leads" ADD COLUMN IF NOT EXISTS "city_state" text`, "crm_leads.city_state");
    await safeExecute(sql`ALTER TABLE "crm_leads" ADD COLUMN IF NOT EXISTS "plan_name" text DEFAULT 'Plano Pro'`, "crm_leads.plan_name");
    await safeExecute(sql`ALTER TABLE "crm_leads" ADD COLUMN IF NOT EXISTS "temperature" text DEFAULT 'morno'`, "crm_leads.temperature");

    await safeExecute(sql`
      CREATE TABLE IF NOT EXISTS "crm_goals" (
        "id" serial PRIMARY KEY NOT NULL,
        "organization_id" integer NOT NULL,
        "month_year" varchar(20) NOT NULL,
        "target_new_students" integer DEFAULT 10 NOT NULL,
        "target_demos" integer DEFAULT 25 NOT NULL,
        "target_proposals" integer DEFAULT 20 NOT NULL,
        "target_deals" integer DEFAULT 10 NOT NULL,
        "target_mrr" numeric(10, 2) DEFAULT 2000.00 NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      )
    `, "create crm_goals table");

    await safeExecute(sql`
      CREATE TABLE IF NOT EXISTS "crm_activities" (
        "id" serial PRIMARY KEY NOT NULL,
        "organization_id" integer NOT NULL,
        "lead_id" integer,
        "title" text NOT NULL,
        "type" text DEFAULT 'whatsapp' NOT NULL,
        "description" text,
        "scheduled_time" text,
        "assigned_user_name" text,
        "completed" boolean DEFAULT false NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
      )
    `, "create crm_activities table");

    // Tabela chatbot_flows: fluxo configurável e dinâmico de autoatendimento WhatsApp
    await safeExecute(sql`
      CREATE TABLE IF NOT EXISTS "chatbot_flows" (
        "id" serial PRIMARY KEY NOT NULL,
        "organizationId" integer NOT NULL,
        "userId" integer,
        "flowType" varchar(30) DEFAULT 'aluno' NOT NULL,
        "name" varchar(100),
        "welcomeMessage" text,
        "fallbackMessage" text,
        "humanMessage" text,
        "exitMessage" text,
        "options" text,
        "isActive" integer DEFAULT 1 NOT NULL,
        "updatedAt" timestamp DEFAULT now() NOT NULL,
        "createdAt" timestamp DEFAULT now() NOT NULL
      )
    `, "create chatbot_flows table");

    // Tabela school_knowledge_base: base de conhecimento RAG e FAQs da escola para atendimento inteligente
    await safeExecute(sql`
      CREATE TABLE IF NOT EXISTS "school_knowledge_base" (
        "id" serial PRIMARY KEY NOT NULL,
        "organizationId" integer NOT NULL,
        "userId" integer,
        "title" varchar(150) NOT NULL,
        "category" varchar(50) DEFAULT 'faq_geral' NOT NULL,
        "content" text NOT NULL,
        "isActive" integer DEFAULT 1 NOT NULL,
        "updatedAt" timestamp DEFAULT now() NOT NULL,
        "createdAt" timestamp DEFAULT now() NOT NULL
      )
    `, "create school_knowledge_base table");

    // ─── MEMÓRIA PEDAGÓGICA CONTÍNUA DA IA (student_pedagogical_memory) ─────────
    await safeExecute(sql`
      CREATE TABLE IF NOT EXISTS "student_pedagogical_memory" (
        "id" serial PRIMARY KEY NOT NULL,
        "organizationId" integer NOT NULL,
        "studentId" integer NOT NULL UNIQUE,
        "strongPoints" text DEFAULT '[]',
        "weakPoints" text DEFAULT '[]',
        "repertoireMastered" text DEFAULT '[]',
        "repertoireLearning" text DEFAULT '[]',
        "pedagogicalDirectives" text,
        "lastAiAnalysisAt" timestamp,
        "createdAt" timestamp DEFAULT now() NOT NULL,
        "updatedAt" timestamp DEFAULT now() NOT NULL
      )
    `, "create student_pedagogical_memory table");
    await safeExecute(sql`
      CREATE INDEX IF NOT EXISTS "idx_student_pedagogical_memory_student_org"
      ON "student_pedagogical_memory" ("studentId", "organizationId")
    `, "create student_pedagogical_memory student+org index");

    // ─── REGISTRO E CACHE DE OTIMIZAÇÕES DE AGENDA VIA IA ──────────────────────
    await safeExecute(sql`
      CREATE TABLE IF NOT EXISTS "schedule_optimization_logs" (
        "id" serial PRIMARY KEY NOT NULL,
        "organizationId" integer NOT NULL,
        "userId" integer NOT NULL,
        "inputConstraints" text NOT NULL,
        "proposedSchedule" text NOT NULL,
        "status" varchar(20) DEFAULT 'pending' NOT NULL,
        "appliedAt" timestamp,
        "createdAt" timestamp DEFAULT now() NOT NULL
      )
    `, "create schedule_optimization_logs table");
    await safeExecute(sql`
      CREATE INDEX IF NOT EXISTS "idx_schedule_optimization_logs_org_user"
      ON "schedule_optimization_logs" ("organizationId", "userId")
    `, "create schedule_optimization_logs org+user index");

    // ─── CLIENTES / ESCOLAS EM DESTAQUE NA LANDING PAGE ────────────────────────
    await safeExecute(sql`
      CREATE TABLE IF NOT EXISTS "landing_clients" (
        "id" serial PRIMARY KEY NOT NULL,
        "name" varchar(255) NOT NULL,
        "logoUrl" text NOT NULL,
        "websiteUrl" text,
        "testimonial" text,
        "order" integer DEFAULT 0 NOT NULL,
        "isActive" boolean DEFAULT true NOT NULL,
        "createdAt" timestamp DEFAULT now() NOT NULL,
        "updatedAt" timestamp DEFAULT now() NOT NULL
      )
    `, "create landing_clients table");

    // ─── OFERTAS DE ANTECIPAÇÃO DE HORÁRIOS POR FALTA (slot_offers) ─────────────
    await safeExecute(sql`
      CREATE TABLE IF NOT EXISTS "slot_offers" (
        "id" serial PRIMARY KEY NOT NULL,
        "organizationId" integer,
        "originalLessonId" integer NOT NULL,
        "teacherId" integer NOT NULL,
        "slotDate" timestamp NOT NULL,
        "duration" integer DEFAULT 60 NOT NULL,
        "instrumentId" integer,
        "title" varchar(255),
        "status" varchar(20) DEFAULT 'aberta' NOT NULL,
        "acceptedByStudentId" integer,
        "acceptedLessonId" integer,
        "acceptedAt" timestamp,
        "expiresAt" timestamp NOT NULL,
        "createdAt" timestamp DEFAULT now() NOT NULL,
        "updatedAt" timestamp DEFAULT now() NOT NULL
      )
    `, "create slot_offers table");
    await safeExecute(sql`
      CREATE INDEX IF NOT EXISTS "slot_offers_org_status_idx"
      ON "slot_offers" ("organizationId", "status")
    `, "create slot_offers org+status index");
    await safeExecute(sql`
      CREATE INDEX IF NOT EXISTS "slot_offers_slot_date_idx"
      ON "slot_offers" ("slotDate")
    `, "create slot_offers slotDate index");

    // ─── SLIDES DE FUNCIONALIDADES DO HERO NA LANDING PAGE ─────────────────────
    await safeExecute(sql`
      CREATE TABLE IF NOT EXISTS "landing_hero_slides" (
        "id" serial PRIMARY KEY NOT NULL,
        "title" varchar(255) NOT NULL,
        "highlight" varchar(255) NOT NULL,
        "subtitle" text NOT NULL,
        "points" text DEFAULT '[]' NOT NULL,
        "imageUrl" text NOT NULL,
        "bgTheme" varchar(50) DEFAULT 'slate-900' NOT NULL,
        "order" integer DEFAULT 0 NOT NULL,
        "isActive" boolean DEFAULT true NOT NULL,
        "createdAt" timestamp DEFAULT now() NOT NULL,
        "updatedAt" timestamp DEFAULT now() NOT NULL
      )
    `, "create landing_hero_slides table");

    // ─── MÓDULO FISCAL (FOCUS NFE MULTI-TENANT) ────────────────────────────────
    await safeExecute(sql`
      DO $$ BEGIN
        CREATE TYPE regime_tributario AS ENUM ('simples_nacional', 'lucro_presumido', 'lucro_real', 'mei');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `, "regime_tributario enum");

    await safeExecute(sql`
      DO $$ BEGIN
        CREATE TYPE tipo_emissao_nfse AS ENUM ('automatico', 'manual', 'desativado');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `, "tipo_emissao_nfse enum");

    await safeExecute(sql`
      DO $$ BEGIN
        CREATE TYPE fiscal_invoice_status AS ENUM ('draft', 'pending', 'authorized', 'cancelled', 'error');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `, "fiscal_invoice_status enum");

    await safeExecute(sql`
      DO $$ BEGIN
        CREATE TYPE fiscal_job_status AS ENUM ('pending', 'processing', 'completed', 'failed');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `, "fiscal_job_status enum");

    await safeExecute(sql`
      CREATE TABLE IF NOT EXISTS "fiscal_companies" (
        "id" serial PRIMARY KEY NOT NULL,
        "organizationId" integer NOT NULL UNIQUE,
        "cnpj" varchar(25) NOT NULL,
        "razaoSocial" varchar(255) NOT NULL,
        "nomeFantasia" varchar(255),
        "inscricaoMunicipal" varchar(50),
        "inscricaoEstadual" varchar(50),
        "regimeTributario" regime_tributario DEFAULT 'simples_nacional' NOT NULL,
        "optanteSimplesNacional" boolean DEFAULT true NOT NULL,
        "tipoEmissaoNfse" tipo_emissao_nfse DEFAULT 'automatico' NOT NULL,
        "cep" varchar(20),
        "logradouro" varchar(255),
        "numero" varchar(50),
        "complemento" varchar(100),
        "bairro" varchar(100),
        "cidade" varchar(100),
        "uf" varchar(10),
        "codigoMunicipio" varchar(20),
        "telefone" varchar(30),
        "email" varchar(255),
        "focusCompanyId" varchar(100),
        "focusApiKey" text,
        "certificateA1Status" varchar(30) DEFAULT 'nao_configurado',
        "certificateExpiresAt" timestamp,
        "autoEmitOnPayment" boolean DEFAULT false NOT NULL,
        "emitTiming" varchar(20) DEFAULT 'imediato' NOT NULL,
        "autoEmailInvoice" boolean DEFAULT true NOT NULL,
        "autoRetryErrors" boolean DEFAULT true NOT NULL,
        "status" varchar(30) DEFAULT 'ativo' NOT NULL,
        "createdAt" timestamp DEFAULT now() NOT NULL,
        "updatedAt" timestamp DEFAULT now() NOT NULL
      )
    `, "create fiscal_companies table");
    await safeExecute(sql`
      CREATE INDEX IF NOT EXISTS "fiscal_companies_org_idx" ON "fiscal_companies" ("organizationId")
    `, "fiscal_companies org index");
    await safeExecute(sql`
      CREATE INDEX IF NOT EXISTS "fiscal_companies_cnpj_idx" ON "fiscal_companies" ("cnpj")
    `, "fiscal_companies cnpj index");

    await safeExecute(sql`
      CREATE TABLE IF NOT EXISTS "fiscal_services" (
        "id" serial PRIMARY KEY NOT NULL,
        "organizationId" integer NOT NULL,
        "nome" varchar(255) NOT NULL,
        "codigoServico" varchar(50) NOT NULL,
        "codigoTributacaoMunicipio" varchar(50),
        "aliquotaIss" numeric(5, 2) DEFAULT 0.00 NOT NULL,
        "naturezaOperacao" varchar(100) DEFAULT '1' NOT NULL,
        "descricaoPadrao" text DEFAULT 'Mensalidade referente a aulas de dança - Competência {competencia}' NOT NULL,
        "itemListaServico" varchar(20) DEFAULT '08.01',
        "issRetido" boolean DEFAULT false NOT NULL,
        "ativo" boolean DEFAULT true NOT NULL,
        "createdAt" timestamp DEFAULT now() NOT NULL,
        "updatedAt" timestamp DEFAULT now() NOT NULL
      )
    `, "create fiscal_services table");
    await safeExecute(sql`
      CREATE INDEX IF NOT EXISTS "fiscal_services_org_idx" ON "fiscal_services" ("organizationId")
    `, "fiscal_services org index");

    await safeExecute(sql`
      CREATE TABLE IF NOT EXISTS "fiscal_invoices" (
        "id" serial PRIMARY KEY NOT NULL,
        "organizationId" integer NOT NULL,
        "studentId" integer,
        "paymentId" integer,
        "serviceId" integer,
        "reference" varchar(100) NOT NULL UNIQUE,
        "provider" varchar(50) DEFAULT 'focusnfe' NOT NULL,
        "providerId" varchar(100),
        "numero" varchar(50),
        "serie" varchar(20),
        "codigoVerificacao" varchar(100),
        "status" fiscal_invoice_status DEFAULT 'draft' NOT NULL,
        "valor" numeric(10, 2) NOT NULL,
        "competencia" varchar(30),
        "dataEmissao" timestamp,
        "customerName" varchar(255) NOT NULL,
        "customerTaxId" varchar(30) NOT NULL,
        "customerEmail" varchar(255),
        "customerPhone" varchar(30),
        "serviceDescription" text NOT NULL,
        "pdfUrl" text,
        "xmlUrl" text,
        "errorCode" varchar(100),
        "errorMessage" text,
        "cancelReason" text,
        "cancelledAt" timestamp,
        "createdAt" timestamp DEFAULT now() NOT NULL,
        "updatedAt" timestamp DEFAULT now() NOT NULL
      )
    `, "create fiscal_invoices table");
    await safeExecute(sql`
      CREATE INDEX IF NOT EXISTS "fiscal_invoices_org_idx" ON "fiscal_invoices" ("organizationId")
    `, "fiscal_invoices org index");
    await safeExecute(sql`
      CREATE INDEX IF NOT EXISTS "fiscal_invoices_student_idx" ON "fiscal_invoices" ("studentId")
    `, "fiscal_invoices student index");
    await safeExecute(sql`
      CREATE INDEX IF NOT EXISTS "fiscal_invoices_payment_idx" ON "fiscal_invoices" ("paymentId")
    `, "fiscal_invoices payment index");
    await safeExecute(sql`
      CREATE INDEX IF NOT EXISTS "fiscal_invoices_status_idx" ON "fiscal_invoices" ("status")
    `, "fiscal_invoices status index");
    await safeExecute(sql`
      CREATE INDEX IF NOT EXISTS "fiscal_invoices_reference_idx" ON "fiscal_invoices" ("reference")
    `, "fiscal_invoices reference index");

    await safeExecute(sql`
      CREATE TABLE IF NOT EXISTS "fiscal_jobs" (
        "id" serial PRIMARY KEY NOT NULL,
        "organizationId" integer NOT NULL,
        "invoiceId" integer NOT NULL,
        "type" varchar(50) DEFAULT 'emit' NOT NULL,
        "status" fiscal_job_status DEFAULT 'pending' NOT NULL,
        "attempts" integer DEFAULT 0 NOT NULL,
        "maxAttempts" integer DEFAULT 5 NOT NULL,
        "lastError" text,
        "nextAttemptAt" timestamp DEFAULT now() NOT NULL,
        "processedAt" timestamp,
        "createdAt" timestamp DEFAULT now() NOT NULL,
        "updatedAt" timestamp DEFAULT now() NOT NULL
      )
    `, "create fiscal_jobs table");
    await safeExecute(sql`
      CREATE INDEX IF NOT EXISTS "fiscal_jobs_org_status_idx" ON "fiscal_jobs" ("organizationId", "status")
    `, "fiscal_jobs org+status index");
    await safeExecute(sql`
      CREATE INDEX IF NOT EXISTS "fiscal_jobs_invoice_idx" ON "fiscal_jobs" ("invoiceId")
    `, "fiscal_jobs invoice index");
    await safeExecute(sql`
      CREATE INDEX IF NOT EXISTS "fiscal_jobs_next_attempt_idx" ON "fiscal_jobs" ("nextAttemptAt")
    `, "fiscal_jobs next_attempt index");

    await safeExecute(sql`
      CREATE TABLE IF NOT EXISTS "fiscal_logs" (
        "id" serial PRIMARY KEY NOT NULL,
        "organizationId" integer NOT NULL,
        "invoiceId" integer,
        "event" varchar(100) NOT NULL,
        "payload" jsonb DEFAULT '{}',
        "userId" integer,
        "userName" varchar(255),
        "createdAt" timestamp DEFAULT now() NOT NULL
      )
    `, "create fiscal_logs table");
    await safeExecute(sql`
      CREATE INDEX IF NOT EXISTS "fiscal_logs_org_idx" ON "fiscal_logs" ("organizationId")
    `, "fiscal_logs org index");
    await safeExecute(sql`
      CREATE INDEX IF NOT EXISTS "fiscal_logs_invoice_idx" ON "fiscal_logs" ("invoiceId")
    `, "fiscal_logs invoice index");
    await safeExecute(sql`
      CREATE INDEX IF NOT EXISTS "fiscal_logs_created_at_idx" ON "fiscal_logs" ("createdAt")
    `, "fiscal_logs created_at index");

    // ─── WEBHOOK EVENTS ────────────────────────────────────────────────────────
    await safeExecute(sql`
      CREATE TABLE IF NOT EXISTS "webhook_events" (
        "id" serial PRIMARY KEY NOT NULL,
        "gateway" varchar(50) NOT NULL,
        "gatewayEventId" varchar(255) NOT NULL UNIQUE,
        "eventType" varchar(100) NOT NULL,
        "organizationId" integer,
        "payload" jsonb DEFAULT '{}',
        "status" varchar(50) DEFAULT 'received' NOT NULL,
        "processedAt" timestamp,
        "createdAt" timestamp DEFAULT now() NOT NULL
      )
    `, "create webhook_events table");
    await safeExecute(sql`
      CREATE INDEX IF NOT EXISTS "webhook_events_gateway_event_idx"
      ON "webhook_events" ("gateway", "gatewayEventId")
    `, "webhook_events gateway+eventId index");
    await safeExecute(sql`
      CREATE INDEX IF NOT EXISTS "webhook_events_org_idx"
      ON "webhook_events" ("organizationId")
    `, "webhook_events org index");
    await safeExecute(sql`
      CREATE INDEX IF NOT EXISTS "webhook_events_status_idx"
      ON "webhook_events" ("status")
    `, "webhook_events status index");

    // ─── WHATSAPP RATE LIMITS ──────────────────────────────────────────────────
    await safeExecute(sql`
      CREATE TABLE IF NOT EXISTS "whatsapp_rate_limits" (
        "id" serial PRIMARY KEY NOT NULL,
        "organizationId" integer NOT NULL,
        "userId" integer,
        "windowStart" timestamp NOT NULL,
        "messageCount" integer DEFAULT 0 NOT NULL,
        "createdAt" timestamp DEFAULT now() NOT NULL,
        "updatedAt" timestamp DEFAULT now() NOT NULL
      )
    `, "create whatsapp_rate_limits table");
    await safeExecute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_rate_limits_org_window_idx"
      ON "whatsapp_rate_limits" ("organizationId", "windowStart")
    `, "whatsapp_rate_limits org+window unique index");
    await safeExecute(sql`
      CREATE INDEX IF NOT EXISTS "whatsapp_rate_limits_org_idx"
      ON "whatsapp_rate_limits" ("organizationId")
    `, "whatsapp_rate_limits org index");

    // Tabela chatbot_logs: auditoria dos turnos da recepcionista virtual (PRD Evolução do Atendimento)
    await safeExecute(sql`
      CREATE TABLE IF NOT EXISTS "chatbot_logs" (
        "id" serial PRIMARY KEY NOT NULL,
        "organizationId" integer NOT NULL,
        "userId" integer,
        "phone" varchar(30) NOT NULL,
        "userMessage" text,
        "actionUsed" varchar(80),
        "escalated" integer DEFAULT 0 NOT NULL,
        "durationMs" integer DEFAULT 0 NOT NULL,
        "createdAt" timestamp DEFAULT now() NOT NULL
      )
    `, "create chatbot_logs table");

    _schemaInitialized = true;
    console.timeEnd("[DB] schema-consistency-check");
  }
}

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const options: any = {
        prepare: false,
        connection: {
          search_path: "public"
        }
      };
      const isLocalDb = process.env.DATABASE_URL.includes("localhost") || 
                        process.env.DATABASE_URL.includes("127.0.0.1") || 
                        process.env.DATABASE_URL.includes("@db:");
      if (!isLocalDb && (process.env.DATABASE_URL.includes("supabase.co") || process.env.DATABASE_URL.includes("supabase.com") || process.env.NODE_ENV === "production")) {
        options.ssl = { rejectUnauthorized: false };
      }

      queryClient = postgres(process.env.DATABASE_URL, options);
      _db = drizzle(queryClient);
      await ensureSchemaConsistency(_db);
    } catch (error) {
      console.error("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser, maxRetries = 3): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const db = await getDb();
      if (!db) return;

      let [existing] = await db.select().from(users).where(eq(users.openId, user.openId)).limit(1);

      if (!existing && user.email) {
        const [existingByEmail] = await db.select().from(users).where(eq(users.email, user.email)).limit(1);
        if (existingByEmail) {
          existing = existingByEmail;
          // Link accounts by updating the openId to the new one (e.g., from Google)
          await db.update(users).set({ openId: user.openId }).where(eq(users.id, existing.id));
        }
      }


      // Garante que todo usuário tenha uma organização válida isolada
      let targetOrgId = user.organizationId || existing?.organizationId;
      if (!targetOrgId) {
        // Sempre cria uma nova organização para não misturar com escolas existentes
        const newOrgName = user.name ? `Escola de ${user.name.split(' ')[0]}` : "Escola de Música";
        const slugBase = user.name ? user.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') : 'escola';
        const [newOrg] = await db.insert(organizations).values({
          name: newOrgName,
          slug: `${slugBase}-${Date.now()}`,
          // FIX BILLING: escola auto-criada no login entra em TRIAL de 7 dias
          // (não mais "active" de graça) — após o trial, o funil de assinatura
          // da plataforma (checkout Asaas → webhook) faz a cobrança do MusicPro.
          subscriptionStatus: "trialing",
          trialEndsAt: (() => {
            const t = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
            t.setHours(23, 59, 59, 999);
            return t;
          })(),
          createdAt: new Date(),
        }).returning();
        targetOrgId = newOrg.id;
        
        // Se criou a organização agora, ele deve ser o admin dono dela
        user.role = "admin";
      }

      const superAdminEmails = ['walyssonrodrigo145@gmail.com', 'ddwvitor@gmail.com'];
      const isAdminEmail = user.email?.toLowerCase() && superAdminEmails.includes(user.email.toLowerCase());
      const isOwner = user.openId === ENV.ownerOpenId || isAdminEmail;

      const data = {
        name: user.name,
        email: user.email,
        loginMethod: user.loginMethod,
        isEmailVerified: user.isEmailVerified ?? true,
        role: isOwner ? 'admin' : (user.role || undefined),
        organizationId: targetOrgId,
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      };

      if (existing) {
        // Only update fields that are provided and not undefined
        const updateData: any = { 
          updatedAt: new Date(),
          lastSignedIn: new Date()
        };
        if (user.name !== undefined) updateData.name = user.name;
        if (user.email !== undefined) updateData.email = user.email;
        if (user.loginMethod !== undefined) updateData.loginMethod = user.loginMethod;
        if (user.isEmailVerified !== undefined) updateData.isEmailVerified = user.isEmailVerified;
        if (user.role !== undefined) updateData.role = user.role;
        if (targetOrgId !== undefined) updateData.organizationId = targetOrgId;
        if ((user as any).studentId !== undefined) updateData.studentId = (user as any).studentId;

        await db.update(users).set(updateData).where(eq(users.openId, user.openId));
      } else {
        await db.insert(users).values({
          openId: user.openId,
          name: user.name || "",
          email: user.email || "",
          loginMethod: user.loginMethod,
          isEmailVerified: user.isEmailVerified ?? true,
          role: user.role || (user.openId === ENV.ownerOpenId ? 'admin' : 'professor'),
          organizationId: targetOrgId,
          studentId: (user as any).studentId,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastSignedIn: new Date(),
        });
      }
      return;
    } catch (error: any) {
      attempt++;
      if (attempt >= maxRetries) throw error;
      await new Promise(res => setTimeout(res, 1000 * attempt));
    }
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  const user = result.length > 0 ? result[0] : undefined;

  // Se o usuário existir mas não tiver organizationId (ex: professor convidado ou inserido manualmente),
  // atribui automaticamente a organização principal do sistema para evitar falhas de foreign key/not null nas configurações.
  if (user && !user.organizationId) {
    const [firstOrg] = await db.select().from(organizations).orderBy(organizations.id).limit(1);
    let orgId = firstOrg?.id;

    if (!orgId) {
      const [newOrg] = await db.insert(organizations).values({
        name: "Escola de Música",
        slug: `escola-${Date.now()}`,
        subscriptionStatus: "active",
        createdAt: new Date(),
      }).returning();
      orgId = newOrg.id;
    }

    await db.update(users).set({ organizationId: orgId }).where(eq(users.id, user.id));
    user.organizationId = orgId;
    debugLog(`[DB] Auto-assigned organization ${orgId} to user ${user.id} (${user.email || user.openId})`);
  }

  return user;
}

// Dashboard stats
export async function getDashboardStats(organizationId: number, userId?: number) {
  const db = await getDb();
  if (!db) return null;

  const orgFilter = eq(students.organizationId, organizationId);
  const userFilter = userId ? eq(students.professorId, userId) : undefined;

  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);
  
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const lessonOrgFilter = eq(lessons.organizationId, organizationId);
  const lessonUserFilter = userId ? eq(lessons.userId, userId) : undefined;

  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  
  const paymentOrgFilter = eq(paymentDues.organizationId, organizationId);
  const paymentUserFilter = userId ? eq(paymentDues.userId, userId) : undefined;

  const [
    [totalStudents],
    [activeStudents],
    [monthLessons],
    [completedLessons],
    [scheduledLessons],
    [totalLessons],
    [revenueResult]
  ] = await Promise.all([
    db.select({ count: sql<number>`CAST(count(*) AS INT)` }).from(students).where(and(orgFilter, userFilter)),
    db.select({ count: sql<number>`CAST(count(*) AS INT)` }).from(students).where(and(orgFilter, userFilter, eq(students.status, 'ativo'))),
    db.select({ count: sql<number>`CAST(count(*) AS INT)` }).from(lessons)
      .where(and(lessonOrgFilter, lessonUserFilter, gte(lessons.scheduledAt, startOfMonth), lte(lessons.scheduledAt, endOfMonth))),
    db.select({ count: sql<number>`CAST(count(*) AS INT)` }).from(lessons)
      .where(and(
        lessonOrgFilter,
        lessonUserFilter, 
        eq(lessons.status, 'concluida'),
        gte(lessons.scheduledAt, startOfMonth),
        lte(lessons.scheduledAt, endOfMonth)
      )),
    db.select({ count: sql<number>`CAST(count(*) AS INT)` }).from(lessons)
      .where(and(
        lessonOrgFilter,
        lessonUserFilter,
        eq(lessons.status, 'agendada'),
        // AUDIT-01 FIX: conta apenas aulas agendadas FUTURAS — aulas passadas
        // ainda marcadas como 'agendada' (professor não deu baixa) inflavam o card.
        gte(lessons.scheduledAt, now),
        gte(lessons.scheduledAt, startOfMonth),
        lte(lessons.scheduledAt, endOfMonth)
      )),
    db.select({ count: sql<number>`CAST(count(*) AS INT)` }).from(lessons)
      .where(and(
        lessonOrgFilter,
        lessonUserFilter, 
        sql`status != 'agendada'`,
        gte(lessons.scheduledAt, startOfMonth),
        lte(lessons.scheduledAt, endOfMonth)
      )),
    db.select({
      total: sql<number>`CAST(COALESCE(SUM(${paymentDues.amount}), 0) AS DECIMAL)`
    }).from(paymentDues)
      .where(and(
        paymentOrgFilter,
        paymentUserFilter,
        eq(paymentDues.month, currentMonth),
        eq(paymentDues.year, currentYear),
        eq(paymentDues.status, 'pago')
      ))
  ]);

  const completionRate = totalLessons.count > 0
    ? Math.round((completedLessons.count / totalLessons.count) * 100)
    : 0;

  return {
    totalStudents: totalStudents.count,
    activeStudents: activeStudents.count,
    monthLessons: monthLessons.count,
    completedLessons: completedLessons.count,
    scheduledLessons: scheduledLessons.count,
    completionRate,
    monthlyRevenue: Number(revenueResult?.total ?? 0),
  };
}

// Monthly stats for charts
export async function getMonthlyStats(organizationId: number, userId?: number, limit = 12) {
  const db = await getDb();
  if (!db) return [];
  
  const now = new Date();
  const data = [];
  const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  
  const promises = [];
  
  for (let i = limit - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    
    const startOfNextMonth = new Date(y, m, 1);
    const startOfMonth = new Date(y, m - 1, 1);
    const endOfMonth = new Date(y, m, 0, 23, 59, 59, 999);
    
    promises.push((async () => {
      const [
        [ativos],
        [aulasVal],
        [revenueRes]
      ] = await Promise.all([
        db.select({ count: sql<number>`CAST(count(*) AS INT)` })
          .from(students)
          .where(and(
            eq(students.organizationId, organizationId),
            userId ? eq(students.professorId, userId) : undefined,
            eq(students.status, 'ativo'),
            lt(students.createdAt, startOfNextMonth)
          )),
        db.select({ count: sql<number>`CAST(count(*) AS INT)` })
          .from(lessons)
          .where(and(
            eq(lessons.organizationId, organizationId),
            userId ? eq(lessons.userId, userId) : undefined,
            eq(lessons.status, 'concluida'),
            gte(lessons.scheduledAt, startOfMonth),
            lte(lessons.scheduledAt, endOfMonth)
          )),
        db.select({ total: sql<number>`CAST(COALESCE(SUM(${paymentDues.amount}), 0) AS DECIMAL)` })
          .from(paymentDues)
          .where(and(
            eq(paymentDues.organizationId, organizationId),
            userId ? eq(paymentDues.userId, userId) : undefined,
            eq(paymentDues.month, m),
            eq(paymentDues.year, y),
            eq(paymentDues.status, 'pago')
          ))
      ]);
      
      return {
        month: `${monthNames[m - 1]}/${y.toString().slice(-2)}`,
        alunos: ativos.count,
        aulas: aulasVal.count,
        receita: Number(revenueRes?.total ?? 0),
        sortIndex: -i
      };
    })());
  }
  
  const results = await Promise.all(promises);
  data.push(...results.sort((a, b) => a.sortIndex - b.sortIndex).map(({ sortIndex, ...rest }) => rest));
  
  return data;
}

// Students with instrument info
export async function getStudentsWithInstrument(organizationId: number, userId?: number, limit?: number) {
  const db = await getDb();
  if (!db) return [];
  const query = db.select({
    id: students.id,
    name: students.name,
    email: students.email,
    phone: students.phone,
    level: students.level,
    status: students.status,
    monthlyFee: students.monthlyFee,
    billingPeriodicity: students.billingPeriodicity,
    startDate: students.startDate,
    dueDay: students.dueDay,
    avatar: students.avatar,
    lessonType: students.lessonType,
    instrumentName: instruments.name,
    instrumentColor: instruments.color,
    instrumentIcon: instruments.icon,
    studentUserId: sql<number | null>`COALESCE(${students.studentUserId}, ${users.id})`,
  }).from(students)
    .leftJoin(instruments, eq(students.instrumentId, instruments.id))
    .leftJoin(users, eq(users.studentId, students.id))
    .where(and(
        eq(students.organizationId, organizationId),
        userId ? eq(students.professorId, userId) : undefined
    ))
    .orderBy(desc(students.createdAt));
  if (limit) return (query as any).limit(limit);
  return query;
}

// Recent lessons with student info — fetches a date range suitable for the full calendar
export async function getRecentLessons(
  organizationId: number,
  userId?: number,
  limit = 500,
  professorId?: number  // quando definido, busca aulas dos alunos do professor (independente de quem criou)
) {
  const db = await getDb();
  if (!db) return [];

  // Fetch from 3 months ago up to 12 months ahead so the calendar covers all views
  const rangeStart = new Date();
  rangeStart.setMonth(rangeStart.getMonth() - 3);
  rangeStart.setHours(0, 0, 0, 0);

  const rangeEnd = new Date();
  rangeEnd.setMonth(rangeEnd.getMonth() + 12);
  rangeEnd.setHours(23, 59, 59, 999);

  // Para professores: buscar pelos alunos que são seus, independente de quem criou a aula
  // Isso resolve o caso onde o admin cria aulas para alunos de um professor
  let professorStudentIds: number[] | undefined = undefined;
  if (professorId) {
    const profStudents = await db
      .select({ id: students.id })
      .from(students)
      .where(and(
        eq(students.organizationId, organizationId),
        eq(students.professorId, professorId),
        eq(students.status, 'ativo'),
      ));
    professorStudentIds = profStudents.map(s => s.id);
  }

  const profUsers = aliasedTable(users, "prof_users");
  const creatorUsers = aliasedTable(users, "creator_users");

  return db.select({
    id: lessons.id,
    title: lessons.title,
    scheduledAt: lessons.scheduledAt,
    duration: lessons.duration,
    status: lessons.status,
    rating: lessons.rating,
    isExperimental: lessons.isExperimental,
    experimentalName: lessons.experimentalName,
    instrumentId: lessons.instrumentId,
    instrumentName: instruments.name,
    studentName: students.name,
    studentId: students.id,
    lessonType: lessons.lessonType,
    recurringGroupId: lessons.recurringGroupId,
    // CAÇA-BUG: a agenda (lessons.list sem input) usa getRecentLessons — sem
    // recurrence aqui, o card nunca recebia o destaque quinzenal/mensal.
    recurrence: lessons.recurrence,
    studioRoomId: lessons.studioRoomId,
    studioRoomName: studioRooms.name,
    studioRoomColor: studioRooms.color,
    teacherId: sql<number>`COALESCE(${students.professorId}, ${lessons.userId})`,
    teacherName: sql<string>`COALESCE(${profUsers.name}, ${creatorUsers.name})`,
  }).from(lessons)
    .leftJoin(students, eq(lessons.studentId, students.id))
    .leftJoin(instruments, eq(lessons.instrumentId, instruments.id))
    .leftJoin(studioRooms, eq(lessons.studioRoomId, studioRooms.id))
    .leftJoin(profUsers, eq(students.professorId, profUsers.id))
    .leftJoin(creatorUsers, eq(lessons.userId, creatorUsers.id))
    .where(and(
        eq(lessons.organizationId, organizationId),
        // Se for professor: filtra pelos alunos dele (ignora userId do criador)
        // Se for admin/sem filtro: sem restrição de usuário
        professorStudentIds
          ? (professorStudentIds.length > 0
              ? inArray(lessons.studentId, professorStudentIds)
              : sql`false`  // professor sem alunos não vê nada
            )
          : (userId ? eq(lessons.userId, userId) : undefined),
        gte(lessons.scheduledAt, rangeStart),
        lte(lessons.scheduledAt, rangeEnd)
    ))
    .orderBy(asc(lessons.scheduledAt)).limit(limit);
}

// Instruments with student count
export async function getInstrumentsWithCount(organizationId: number, professorId?: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: instruments.id,
    name: instruments.name,
    category: instruments.category,
    icon: instruments.icon,
    color: instruments.color,
    // Conta alunos ativos vinculados ao instrumento (e ao professor, se especificado)
    studentCount: sql<number>`count(CASE WHEN ${students.status} = 'ativo' ${professorId ? sql`AND ${students.professorId} = ${professorId}` : sql``} THEN ${students.id} ELSE NULL END)`,
    totalStudentCount: sql<number>`count(CASE WHEN 1=1 ${professorId ? sql`AND ${students.professorId} = ${professorId}` : sql``} THEN ${students.id} ELSE NULL END)`,
  }).from(instruments).leftJoin(students, and(eq(instruments.id, students.instrumentId), eq(students.organizationId, organizationId)))
    .where(and(
        isNotNull(instruments.organizationId),
        eq(instruments.organizationId, organizationId)
        // Nota: instrumentos pertencem à organização. Se for professor, filtramos os alunos dele no count acima.
    ))
    .groupBy(instruments.id).orderBy(desc(sql`count(CASE WHEN ${students.status} = 'ativo' THEN ${students.id} ELSE NULL END)`));
}

// Settings helpers
export async function getSettingsByUserId(organizationId: number, userId: number) {
  const db = await getDb();
  if (!db) return null;
  const { decryptSecret } = await import("./utils/integrationCrypto");
  const result = await db.select().from(settings).where(and(eq(settings.organizationId, organizationId), eq(settings.userId, userId))).limit(1);
  if (result.length > 0) {
    const row = { ...result[0] };
    if (!row.whatsappBotUrl) row.whatsappBotUrl = process.env.EVOLUTION_API_URL || "http://179.197.76.174:8080";
    if (!row.whatsappBotToken) row.whatsappBotToken = process.env.EVOLUTION_API_KEY || "minha_chave_secreta_123";
    if (row.asaasApiKey) row.asaasApiKey = decryptSecret(row.asaasApiKey);
    if (row.mpAccessToken) row.mpAccessToken = decryptSecret(row.mpAccessToken);
    if ((row as any).infinitepayApiKey) (row as any).infinitepayApiKey = decryptSecret((row as any).infinitepayApiKey);
    if (row.geminiApiKey) row.geminiApiKey = decryptSecret(row.geminiApiKey);
    if (row.groqApiKey) row.groqApiKey = decryptSecret(row.groqApiKey);
    if ((row as any).opencodeApiKey) (row as any).opencodeApiKey = decryptSecret((row as any).opencodeApiKey);
    return row;
  }

  // Auto-cria um registro padrão se não existir (evita erros de null na UI)
  try {
    await db.insert(settings).values({
      organizationId,
      userId,
      hiddenTabs: '',
      notifyLessonReminder: 1,
      notifyPaymentDue: 1,
      notifyStudentAbsence: 1,
      notifyNewStudent: 1,
      notifyWeeklyReport: 0,
      automationEnabled: 0,
      whatsappAutoSend: 0,
      whatsappBotUrl: process.env.EVOLUTION_API_URL || "http://179.197.76.174:8080",
      whatsappBotToken: process.env.EVOLUTION_API_KEY || "minha_chave_secreta_123",
    });
  } catch (_) {
    // Ignora conflito de insert concorrente
  }
  const created = await db.select().from(settings).where(and(eq(settings.organizationId, organizationId), eq(settings.userId, userId))).limit(1);
  if (created.length > 0) {
    const row = { ...created[0] };
    if (!row.whatsappBotUrl) row.whatsappBotUrl = process.env.EVOLUTION_API_URL || "http://179.197.76.174:8080";
    if (!row.whatsappBotToken) row.whatsappBotToken = process.env.EVOLUTION_API_KEY || "minha_chave_secreta_123";
    if (row.asaasApiKey) row.asaasApiKey = decryptSecret(row.asaasApiKey);
    if (row.mpAccessToken) row.mpAccessToken = decryptSecret(row.mpAccessToken);
    if ((row as any).infinitepayApiKey) (row as any).infinitepayApiKey = decryptSecret((row as any).infinitepayApiKey);
    if (row.geminiApiKey) row.geminiApiKey = decryptSecret(row.geminiApiKey);
    if (row.groqApiKey) row.groqApiKey = decryptSecret(row.groqApiKey);
    if ((row as any).opencodeApiKey) (row as any).opencodeApiKey = decryptSecret((row as any).opencodeApiKey);
    return row;
  }
  return null;
}

export async function upsertSettings(organizationId: number, userId: number, data: Partial<InsertSettings>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { encryptSecret } = await import("./utils/integrationCrypto");

  // Sanitize hiddenTabs: se vier como array, converte para string CSV; se vier como outro tipo, força string vazia
  const sanitized: Partial<InsertSettings> = { ...data };
  if ('hiddenTabs' in sanitized) {
    if (Array.isArray(sanitized.hiddenTabs)) {
      sanitized.hiddenTabs = (sanitized.hiddenTabs as unknown as string[]).join(',');
    } else if (sanitized.hiddenTabs == null) {
      sanitized.hiddenTabs = '';
    } else {
      sanitized.hiddenTabs = String(sanitized.hiddenTabs);
    }
  }

  // Garantir que whatsappBotUrl e whatsappBotToken não sejam gravados como nulos/vazios se não especificados ou se forem falsy
  if (!sanitized.whatsappBotUrl) {
    delete sanitized.whatsappBotUrl;
  }
  if (!sanitized.whatsappBotToken) {
    delete sanitized.whatsappBotToken;
  }

  // Criptografar chaves de integração sensíveis antes de persistir no banco de dados
  if (sanitized.asaasApiKey && !sanitized.asaasApiKey.startsWith("v1:")) {
    sanitized.asaasApiKey = encryptSecret(sanitized.asaasApiKey.trim());
  }
  if (sanitized.mpAccessToken && !sanitized.mpAccessToken.startsWith("v1:")) {
    sanitized.mpAccessToken = encryptSecret(sanitized.mpAccessToken.trim());
  }
  if ((sanitized as any).infinitepayApiKey && !(sanitized as any).infinitepayApiKey.startsWith("v1:")) {
    (sanitized as any).infinitepayApiKey = encryptSecret(((sanitized as any).infinitepayApiKey as string).trim());
  }
  if (sanitized.geminiApiKey && !sanitized.geminiApiKey.startsWith("v1:")) {
    sanitized.geminiApiKey = encryptSecret(sanitized.geminiApiKey.trim());
  }
  if (sanitized.groqApiKey && !sanitized.groqApiKey.startsWith("v1:")) {
    sanitized.groqApiKey = encryptSecret(sanitized.groqApiKey.trim());
  }
  if ((sanitized as any).opencodeApiKey && !(sanitized as any).opencodeApiKey.startsWith("v1:")) {
    (sanitized as any).opencodeApiKey = encryptSecret(((sanitized as any).opencodeApiKey as string).trim());
  }

  const existing = await db.select({ id: settings.id }).from(settings).where(and(eq(settings.organizationId, organizationId), eq(settings.userId, userId))).limit(1);
  if (existing.length > 0) {
    await db.update(settings).set({ ...sanitized, updatedAt: new Date() }).where(and(eq(settings.organizationId, organizationId), eq(settings.userId, userId)));
  } else {
    // Fornece defaults seguros para colunas NOT NULL ao criar o primeiro registro
    await db.insert(settings).values({
      organizationId,
      userId,
      hiddenTabs: '',
      notifyLessonReminder: 1,
      notifyPaymentDue: 1,
      notifyStudentAbsence: 1,
      notifyNewStudent: 1,
      notifyWeeklyReport: 0,
      automationEnabled: 0,
      whatsappAutoSend: 0,
      whatsappBotUrl: process.env.EVOLUTION_API_URL || "http://179.197.76.174:8080",
      whatsappBotToken: process.env.EVOLUTION_API_KEY || "minha_chave_secreta_123",
      ...sanitized,
    });
  }
  return getSettingsByUserId(organizationId, userId);
}

export async function updateUserProfile(organizationId: number, userId: number, data: { name?: string; email?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ ...data, updatedAt: new Date() }).where(and(eq(users.id, userId), eq(users.organizationId, organizationId)));
  const result = await db.select().from(users).where(and(eq(users.id, userId), eq(users.organizationId, organizationId))).limit(1);
  return result[0] ?? null;
}

// Lessons by day of week
export async function getLessonsByDayOfWeek(organizationId: number, userId?: number) {
  const db = await getDb();
  if (!db) return [];
  const fourWeeksAgo = new Date();
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
  return db.select({
    dayOfWeek: sql<number>`CAST(EXTRACT(DOW FROM "scheduledAt") + 1 AS INT)`,
    count: sql<number>`CAST(count(*) AS INT)`,
  }).from(lessons).where(and(
    eq(lessons.organizationId, organizationId),
    userId ? eq(lessons.userId, userId) : undefined,
    gte(lessons.scheduledAt, fourWeeksAgo),
    eq(lessons.status, 'concluida')
  )).groupBy(sql`EXTRACT(DOW FROM "scheduledAt")`);
}

// Stats for experimental lessons
export async function getExperimentalStats(organizationId: number, userId?: number, month?: number, year?: number) {
  const db = await getDb();
  if (!db) return { total: 0, converted: 0, notConverted: 0, conversionRate: 0 };

  let whereClause = and(
    eq(lessons.organizationId, organizationId),
    userId ? eq(lessons.userId, userId) : undefined, 
    eq(lessons.isExperimental, true),
    eq(lessons.status, 'concluida')
  );
  
  if (month && year) {
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);
    whereClause = and(whereClause, gte(lessons.scheduledAt, startOfMonth), lte(lessons.scheduledAt, endOfMonth));
  }

  const expLessons = await db.select().from(lessons).where(whereClause);
  
  const total = expLessons.length;
  let converted = 0;

  for (const lesson of expLessons) {
    if (lesson.studentId) {
       converted++;
       continue;
    }
    if (lesson.experimentalName) {
      const [student] = await db.select({ id: students.id })
        .from(students)
        .where(and(
          eq(students.organizationId, organizationId),
          userId ? eq(students.professorId, userId) : undefined, 
          sql`LOWER(${students.name}) = LOWER(${lesson.experimentalName})`
        ))
        .limit(1);
      if (student) {
        converted++;
      }
    }
  }

  return {
    total,
    converted,
    notConverted: total - converted,
    conversionRate: total > 0 ? Math.round((converted / total) * 100) : 0
  };
}

export async function createOrganization(name: string, ownerOpenId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [org] = await db.insert(organizations).values({
    name,
    slug: name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
    subscriptionStatus: "active",
    createdAt: new Date(),
  }).returning();
  
  return org;
}
