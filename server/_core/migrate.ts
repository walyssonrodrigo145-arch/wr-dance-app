import { debugLog } from "./logger";
import { sql } from "drizzle-orm";
import { getDb } from "../db";

export async function runAutoMigrations() {
  debugLog("[Database] Verificando migrações automáticas...");
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Banco de dados não disponível para migração.");
    return { success: false, error: "Database not available" };
  }

  const results: string[] = [];
  try {
    // Adicionar colunas uma por uma, ignorando se já existirem
    const migrations = [
      { table: 'organizations', sql: 'ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "planId" varchar(50) DEFAULT \'premium\' NOT NULL' },
      { table: 'users', sql: 'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "isEmailVerified" boolean DEFAULT false NOT NULL' },
      { table: 'users', sql: 'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "verificationToken" text' },
      { table: 'users', sql: 'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "verificationTokenExpiresAt" timestamp' },
      { table: 'users', sql: 'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "resetPasswordToken" text' },
      { table: 'users', sql: 'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "resetPasswordTokenExpiresAt" timestamp' },
      { table: 'users', sql: 'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "organizationId" integer' },
      { table: 'users', sql: 'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "hasSeenTutorial" boolean DEFAULT false NOT NULL' },
      { table: 'professores', sql: 'ALTER TABLE "professores" ADD COLUMN IF NOT EXISTS "permissions" jsonb DEFAULT \'["aulas", "progresso", "recepcao", "ia", "lembretes", "relatorios"]\'::jsonb' },
      { table: 'lessons', sql: 'ALTER TABLE "lessons" ADD COLUMN IF NOT EXISTS "rating" integer' },
      { table: 'lessons', sql: 'ALTER TABLE "lessons" ADD COLUMN IF NOT EXISTS "instrumentId" integer' },
      { table: 'lessons', sql: 'ALTER TABLE "lessons" ADD COLUMN IF NOT EXISTS "recurringGroupId" varchar(100)' },
      { table: 'lessons', sql: 'ALTER TABLE "lessons" ADD COLUMN IF NOT EXISTS "isExperimental" boolean DEFAULT false NOT NULL' },
      { table: 'lessons', sql: 'ALTER TABLE "lessons" ADD COLUMN IF NOT EXISTS "experimentalName" varchar(255)' },
      { table: 'lessons', sql: 'ALTER TABLE "lessons" ALTER COLUMN "studentId" DROP NOT NULL' },
      { table: 'students', sql: 'ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "instrumentId" integer' },
      { table: 'student_timeline', sql: 'ALTER TABLE "student_timeline" ADD COLUMN IF NOT EXISTS "grade" decimal(3, 1)' },
      { table: 'enum', sql: "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'goal_status') THEN CREATE TYPE goal_status AS ENUM ('pendente', 'concluida'); END IF; END $$;" },
      { table: 'enum', sql: "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'timeline_category') THEN CREATE TYPE timeline_category AS ENUM ('tecnica', 'teoria', 'repertorio', 'geral'); END IF; END $$;" },
      { table: 'student_goals', sql: `
        CREATE TABLE IF NOT EXISTS "student_goals" (
          "id" serial PRIMARY KEY NOT NULL,
          "userId" integer NOT NULL,
          "studentId" integer NOT NULL,
          "title" varchar(255) NOT NULL,
          "description" text,
          "status" goal_status DEFAULT 'pendente' NOT NULL,
          "targetDate" date,
          "completedAt" timestamp,
          "createdAt" timestamp DEFAULT now() NOT NULL,
          "updatedAt" timestamp DEFAULT now() NOT NULL
        );` 
      },
      { table: 'student_timeline', sql: `
        CREATE TABLE IF NOT EXISTS "student_timeline" (
          "id" serial PRIMARY KEY NOT NULL,
          "userId" integer NOT NULL,
          "studentId" integer NOT NULL,
          "title" varchar(255) NOT NULL,
          "description" text,
          "category" timeline_category DEFAULT 'geral' NOT NULL,
          "grade" decimal(3, 1),
          "achievedAt" timestamp NOT NULL,
          "createdAt" timestamp DEFAULT now() NOT NULL
        );`
      },
      { table: 'crm_leads', sql: `
        CREATE TABLE IF NOT EXISTS "crm_leads" (
          "id" serial PRIMARY KEY NOT NULL,
          "organization_id" integer NOT NULL,
          "name" text NOT NULL,
          "phone" text,
          "email" text,
          "instrument" text,
          "stage" text DEFAULT 'novo' NOT NULL,
          "value" decimal(10, 2) DEFAULT '0.00',
          "notes" text,
          "source" text DEFAULT 'WhatsApp',
          "created_at" timestamp DEFAULT now() NOT NULL,
          "updated_at" timestamp DEFAULT now() NOT NULL
        );`
      },
      { table: 'enum', sql: "ALTER TYPE lesson_status ADD VALUE IF NOT EXISTS 'concluida'" },
      { table: 'enum', sql: "ALTER TYPE lesson_status ADD VALUE IF NOT EXISTS 'cancelada'" },
      { table: 'enum', sql: "ALTER TYPE lesson_status ADD VALUE IF NOT EXISTS 'remarcada'" },
      { table: 'enum', sql: "ALTER TYPE lesson_status ADD VALUE IF NOT EXISTS 'falta'" },
      { table: 'settings', sql: 'ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "notifyLessonReminder" integer DEFAULT 1 NOT NULL' },
      { table: 'settings', sql: 'ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "notifyPaymentDue" integer DEFAULT 1 NOT NULL' },
      { table: 'settings', sql: 'ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "notifyStudentAbsence" integer DEFAULT 1 NOT NULL' },
      { table: 'settings', sql: 'ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "notifyNewStudent" integer DEFAULT 1 NOT NULL' },
      { table: 'settings', sql: 'ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "notifyWeeklyReport" integer DEFAULT 0 NOT NULL' },
      { table: 'settings', sql: 'ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "automationEnabled" integer DEFAULT 0 NOT NULL' },
      { table: 'settings', sql: 'ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "automationLastRun" timestamp' },
      { table: 'settings', sql: 'ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "theme" varchar(20) DEFAULT \'light\'' },
      { table: 'settings', sql: 'ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "pixKey" text' },
      { table: 'settings', sql: 'ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "hiddenTabs" text DEFAULT \'\' NOT NULL' },
      { table: 'settings', sql: 'ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "whatsappBotUrl" varchar(255)' },
      { table: 'settings', sql: 'ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "whatsappBotToken" text' },
      { table: 'settings', sql: 'ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "whatsappAutoSend" integer DEFAULT 0 NOT NULL' },
      { table: 'settings', sql: 'ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "asaasApiKey" text' },
      { table: 'settings', sql: 'ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "asaasEnabled" integer DEFAULT 0 NOT NULL' },
      { table: 'settings', sql: 'ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "geminiApiKey" varchar(255)' },
      { table: 'settings', sql: 'ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "geminiModel" varchar(255)' },
      { table: 'settings', sql: 'ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "zapsignApiKey" text' },
      { table: 'daily_study_plans', sql: `
        CREATE TABLE IF NOT EXISTS "daily_study_plans" (
          "id" serial PRIMARY KEY NOT NULL,
          "organizationId" integer,
          "studentId" integer NOT NULL,
          "teacherId" integer NOT NULL,
          "planText" text NOT NULL,
          "status" varchar(50) DEFAULT 'ativo' NOT NULL,
          "daysCompleted" text DEFAULT '[false,false,false,false,false]' NOT NULL,
          "createdAt" timestamp DEFAULT now() NOT NULL,
          "updatedAt" timestamp DEFAULT now() NOT NULL,
          "completedAt" timestamp
        );`
      },
      { table: 'daily_study_plans', sql: 'ALTER TABLE "daily_study_plans" ADD COLUMN IF NOT EXISTS "updatedAt" timestamp DEFAULT now() NOT NULL' },
      { table: 'notifications', sql: `
        CREATE TABLE IF NOT EXISTS "notifications" (
          "id" serial PRIMARY KEY NOT NULL,
          "organizationId" integer,
          "userId" integer NOT NULL,
          "title" varchar(255) NOT NULL,
          "message" text NOT NULL,
          "type" varchar(50) DEFAULT 'info' NOT NULL,
          "read" boolean DEFAULT false NOT NULL,
          "actionUrl" text,
          "createdAt" timestamp DEFAULT now() NOT NULL
        );`
      },
      { table: 'attendance_tokens', sql: `
        CREATE TABLE IF NOT EXISTS "attendance_tokens" (
          "id" serial PRIMARY KEY NOT NULL,
          "organizationId" integer,
          "token" varchar(64) NOT NULL UNIQUE,
          "expiresAt" timestamp NOT NULL,
          "createdAt" timestamp DEFAULT now() NOT NULL
        );`
      },
      { table: 'attendance_logs', sql: `
        CREATE TABLE IF NOT EXISTS "attendance_logs" (
          "id" serial PRIMARY KEY NOT NULL,
          "organizationId" integer,
          "userId" integer NOT NULL,
          "lessonId" integer,
          "tokenId" integer,
          "scannedAt" timestamp DEFAULT now() NOT NULL
        );`
      },
      { table: 'message_automation_rules', sql: `
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
        );`
      },
      // Modalidade Online — expande enum e adiciona coluna de link
      { table: 'enum', sql: "ALTER TYPE lesson_type ADD VALUE IF NOT EXISTS 'online'" },
      { table: 'students', sql: 'ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "onlineMeetingLink" text' },
      { table: 'marketing_campaigns', sql: 'ALTER TABLE "marketing_campaigns" ADD COLUMN IF NOT EXISTS "mediaUrl" text' },

      // ── MusicPro Analytics — Tabelas de Ingestão e Métricas ─────────────────────
      { table: 'enum', sql: "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'analytics_event_name') THEN CREATE TYPE analytics_event_name AS ENUM ('page_view', 'session_start', 'session_end', 'button_click', 'link_click', 'signup_started', 'signup_completed', 'trial_started', 'trial_finished', 'login', 'logout', 'plan_selected', 'checkout_started', 'pix_generated', 'payment_success', 'payment_failed', 'subscription_created', 'subscription_cancelled', 'email_open', 'email_click', 'whatsapp_click', 'video_play', 'video_finish', 'download', 'upload', 'form_submit', 'search', 'feature_used', 'error', 'api_error', 'scroll_depth', 'heatmap_click', 'heatmap_move', 'web_vital'); END IF; END $$;" },
      { table: 'analytics_visitors', sql: `CREATE TABLE IF NOT EXISTS "analytics_visitors" ("id" serial PRIMARY KEY NOT NULL, "visitor_id" varchar(64) NOT NULL UNIQUE, "first_seen_at" timestamp DEFAULT now() NOT NULL, "last_seen_at" timestamp DEFAULT now() NOT NULL, "total_sessions" integer DEFAULT 1 NOT NULL, "country" varchar(100), "state" varchar(100), "city" varchar(100), "device_type" varchar(20) DEFAULT 'unknown' NOT NULL, "created_at" timestamp DEFAULT now() NOT NULL, "updated_at" timestamp DEFAULT now() NOT NULL);` },
      { table: 'analytics_sessions', sql: `CREATE TABLE IF NOT EXISTS "analytics_sessions" ("id" serial PRIMARY KEY NOT NULL, "session_id" varchar(64) NOT NULL UNIQUE, "visitor_id" varchar(64) NOT NULL, "user_id" integer, "ip_masked" varchar(20), "country" varchar(100), "state" varchar(100), "city" varchar(100), "language" varchar(20), "timezone" varchar(60), "device_type" varchar(20) DEFAULT 'unknown' NOT NULL, "os" varchar(80), "browser" varchar(80), "screen_res" varchar(20), "user_agent" varchar(500), "referrer" varchar(2000), "utm_source" varchar(100), "utm_medium" varchar(100), "utm_campaign" varchar(100), "utm_content" varchar(100), "utm_term" varchar(100), "started_at" timestamp DEFAULT now() NOT NULL, "ended_at" timestamp, "duration_sec" integer DEFAULT 0, "page_count" integer DEFAULT 1 NOT NULL, "is_bounce" boolean DEFAULT true NOT NULL, "created_at" timestamp DEFAULT now() NOT NULL, "updated_at" timestamp DEFAULT now() NOT NULL);` },
      { table: 'analytics_events', sql: `CREATE TABLE IF NOT EXISTS "analytics_events" ("id" serial PRIMARY KEY NOT NULL, "session_id" varchar(64) NOT NULL, "visitor_id" varchar(64) NOT NULL, "user_id" integer, "event_name" analytics_event_name NOT NULL, "page_url" varchar(2000), "page_title" varchar(255), "referrer" varchar(2000), "element_id" varchar(100), "element_text" varchar(255), "element_tag" varchar(30), "utm_source" varchar(100), "utm_medium" varchar(100), "utm_campaign" varchar(100), "utm_content" varchar(100), "utm_term" varchar(100), "country" varchar(100), "state" varchar(100), "city" varchar(100), "device_type" varchar(20) DEFAULT 'unknown' NOT NULL, "os" varchar(80), "browser" varchar(80), "screen_res" varchar(20), "value" text, "metadata" jsonb, "time_on_page_sec" integer, "scroll_depth" integer, "created_at" timestamp DEFAULT now() NOT NULL);` },
      { table: 'analytics_heatmap', sql: `CREATE TABLE IF NOT EXISTS "analytics_heatmap" ("id" serial PRIMARY KEY NOT NULL, "session_id" varchar(64) NOT NULL, "page_url" varchar(2000) NOT NULL, "page_url_normalized" varchar(255) NOT NULL, "x_percent" numeric(5, 2) NOT NULL, "y_percent" numeric(5, 2) NOT NULL, "event_type" varchar(20) DEFAULT 'click' NOT NULL, "viewport_w" integer, "viewport_h" integer, "created_at" timestamp DEFAULT now() NOT NULL);` },
      { table: 'analytics_online', sql: `CREATE TABLE IF NOT EXISTS "analytics_online" ("id" serial PRIMARY KEY NOT NULL, "session_id" varchar(64) NOT NULL UNIQUE, "visitor_id" varchar(64) NOT NULL, "user_id" integer, "user_name" varchar(255), "page_url" varchar(2000), "page_title" varchar(255), "country" varchar(100), "state" varchar(100), "city" varchar(100), "device_type" varchar(20) DEFAULT 'unknown' NOT NULL, "browser" varchar(80), "os" varchar(80), "screen_res" varchar(20), "utm_source" varchar(100), "referrer" varchar(2000), "ip_masked" varchar(20), "last_ping_at" timestamp DEFAULT now() NOT NULL, "entered_at" timestamp DEFAULT now() NOT NULL);` },
      { table: 'analytics_pages', sql: `CREATE TABLE IF NOT EXISTS "analytics_pages" ("id" serial PRIMARY KEY NOT NULL, "page_url_normalized" varchar(255) NOT NULL, "page_title" varchar(255), "date" date NOT NULL, "total_views" integer DEFAULT 0 NOT NULL, "unique_visitors" integer DEFAULT 0 NOT NULL, "bounces" integer DEFAULT 0 NOT NULL, "avg_time_sec" integer DEFAULT 0 NOT NULL, "created_at" timestamp DEFAULT now() NOT NULL, "updated_at" timestamp DEFAULT now() NOT NULL);` },
      { table: 'analytics_conversions', sql: `CREATE TABLE IF NOT EXISTS "analytics_conversions" ("id" serial PRIMARY KEY NOT NULL, "session_id" varchar(64) NOT NULL, "visitor_id" varchar(64) NOT NULL, "user_id" integer, "reached_landing" boolean DEFAULT false NOT NULL, "reached_signup_start" boolean DEFAULT false NOT NULL, "reached_signup_complete" boolean DEFAULT false NOT NULL, "reached_trial_start" boolean DEFAULT false NOT NULL, "reached_plan_select" boolean DEFAULT false NOT NULL, "reached_checkout" boolean DEFAULT false NOT NULL, "reached_pix_generated" boolean DEFAULT false NOT NULL, "reached_payment" boolean DEFAULT false NOT NULL, "reached_first_login" boolean DEFAULT false NOT NULL, "utm_source" varchar(100), "utm_campaign" varchar(100), "created_at" timestamp DEFAULT now() NOT NULL, "updated_at" timestamp DEFAULT now() NOT NULL);` },
      { table: 'analytics_revenue', sql: `CREATE TABLE IF NOT EXISTS "analytics_revenue" ("id" serial PRIMARY KEY NOT NULL, "organization_id" integer DEFAULT 1 NOT NULL, "session_id" varchar(64), "visitor_id" varchar(64), "user_id" integer, "amount" numeric(10, 2) NOT NULL, "plan_id" varchar(50), "plan_name" varchar(100), "utm_source" varchar(100), "utm_medium" varchar(100), "utm_campaign" varchar(100), "country" varchar(100), "state" varchar(100), "city" varchar(100), "created_at" timestamp DEFAULT now() NOT NULL);` },
      { table: 'analytics_campaigns', sql: `CREATE TABLE IF NOT EXISTS "analytics_campaigns" ("id" serial PRIMARY KEY NOT NULL, "utm_source" varchar(100) NOT NULL, "utm_medium" varchar(100), "utm_campaign" varchar(100) NOT NULL UNIQUE, "investment" numeric(10, 2) DEFAULT '0' NOT NULL, "created_at" timestamp DEFAULT now() NOT NULL, "updated_at" timestamp DEFAULT now() NOT NULL);` },
      { table: 'analytics_reports', sql: `CREATE TABLE IF NOT EXISTS "analytics_reports" ("id" serial PRIMARY KEY NOT NULL, "title" varchar(255) NOT NULL, "type" varchar(50) NOT NULL, "params" jsonb, "file_url" text, "status" varchar(30) DEFAULT 'completed' NOT NULL, "created_by" integer, "created_at" timestamp DEFAULT now() NOT NULL);` },
      { table: 'analytics_ai_insights', sql: `CREATE TABLE IF NOT EXISTS "analytics_ai_insights" ("id" serial PRIMARY KEY NOT NULL, "insight_type" varchar(50) NOT NULL, "title" varchar(255) NOT NULL, "content" text NOT NULL, "action_suggested" text, "priority" varchar(20) DEFAULT 'medium' NOT NULL, "is_read" boolean DEFAULT false NOT NULL, "generated_at" timestamp DEFAULT now() NOT NULL, "expires_at" timestamp);` },
      // Fiscal migrations
      { table: 'enum', sql: "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fiscal_invoice_status') THEN CREATE TYPE fiscal_invoice_status AS ENUM ('draft', 'pending', 'processing', 'authorized', 'rejected', 'cancel_requested', 'cancelled', 'error'); END IF; END $$;" },
      { table: 'enum', sql: "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fiscal_job_status') THEN CREATE TYPE fiscal_job_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'retry'); END IF; END $$;" },
      { table: 'enum', sql: "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'regime_tributario') THEN CREATE TYPE regime_tributario AS ENUM ('simples_nacional', 'lucro_presumido', 'lucro_real', 'mei'); END IF; END $$;" },
      { table: 'enum', sql: "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_emissao_nfse') THEN CREATE TYPE tipo_emissao_nfse AS ENUM ('municipal', 'nacional', 'automatico'); END IF; END $$;" },
      { table: 'students', sql: 'ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "personType" varchar(10) DEFAULT \'PF\'' },
      { table: 'students', sql: 'ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "fiscalCpfCnpj" varchar(30)' },
      { table: 'students', sql: 'ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "fiscalLegalName" varchar(255)' },
      { table: 'students', sql: 'ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "fiscalCep" varchar(20)' },
      { table: 'students', sql: 'ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "fiscalStreet" varchar(255)' },
      { table: 'students', sql: 'ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "fiscalNumber" varchar(50)' },
      { table: 'students', sql: 'ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "fiscalComplement" varchar(100)' },
      { table: 'students', sql: 'ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "fiscalNeighborhood" varchar(100)' },
      { table: 'students', sql: 'ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "fiscalCity" varchar(100)' },
      { table: 'students', sql: 'ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "fiscalState" varchar(10)' },
      { table: 'fiscal_companies', sql: `CREATE TABLE IF NOT EXISTS "fiscal_companies" (
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
      );` },
      { table: 'fiscal_services', sql: `CREATE TABLE IF NOT EXISTS "fiscal_services" (
        "id" serial PRIMARY KEY NOT NULL,
        "organizationId" integer NOT NULL,
        "nome" varchar(255) NOT NULL,
        "codigoServico" varchar(50) NOT NULL,
        "codigoTributacaoMunicipio" varchar(50),
        "aliquotaIss" numeric(5, 2) DEFAULT '0.00' NOT NULL,
        "naturezaOperacao" varchar(100) DEFAULT '1' NOT NULL,
        "descricaoPadrao" text DEFAULT 'Mensalidade referente a aulas de musica - Competencia {competencia}' NOT NULL,
        "itemListaServico" varchar(20) DEFAULT '08.01',
        "issRetido" boolean DEFAULT false NOT NULL,
        "ativo" boolean DEFAULT true NOT NULL,
        "createdAt" timestamp DEFAULT now() NOT NULL,
        "updatedAt" timestamp DEFAULT now() NOT NULL
      );` },
      { table: 'fiscal_invoices', sql: `CREATE TABLE IF NOT EXISTS "fiscal_invoices" (
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
      );` },
      { table: 'fiscal_jobs', sql: `CREATE TABLE IF NOT EXISTS "fiscal_jobs" (
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
      );` },
      { table: 'fiscal_logs', sql: `CREATE TABLE IF NOT EXISTS "fiscal_logs" (
        "id" serial PRIMARY KEY NOT NULL,
        "organizationId" integer NOT NULL,
        "invoiceId" integer,
        "event" varchar(100) NOT NULL,
        "payload" jsonb DEFAULT '{}'::jsonb,
        "userId" integer,
        "userName" varchar(255),
        "createdAt" timestamp DEFAULT now() NOT NULL
      );` },
      { table: 'system_plans', sql: `
        UPDATE "system_plans" SET "show_on_landing" = false WHERE CAST("price_monthly" AS numeric) <= 0 OR "id" LIKE '%parceiro%';
      ` },
      { table: 'reminder_templates', sql: 'ALTER TABLE "reminder_templates" ADD COLUMN IF NOT EXISTS "sendToStudent" boolean DEFAULT true NOT NULL' },
      { table: 'reminder_templates', sql: 'ALTER TABLE "reminder_templates" ADD COLUMN IF NOT EXISTS "sendToGuardian" boolean DEFAULT false NOT NULL' },
      { table: 'reminder_templates', sql: 'ALTER TABLE "reminder_templates" ADD COLUMN IF NOT EXISTS "organizationId" integer' },
      { table: 'enum', sql: "ALTER TYPE reminder_type ADD VALUE IF NOT EXISTS 'inadimplencia'" },
      { table: 'enum', sql: "ALTER TYPE reminder_type ADD VALUE IF NOT EXISTS 'estudo'" },
      // AUDIT-P1 FIX (duplicidade financeira): impede no BANCO duas mensalidades
      // para o mesmo aluno no mesmo mês/ano na mesma escola (além do check na API).
      // Se houver duplicatas legadas, a criação falha e o erro é logado (boot segue).
      { table: 'payment_dues', sql: `CREATE UNIQUE INDEX IF NOT EXISTS "uniq_payment_dues_org_student_month"
        ON "payment_dues" ("organizationId", "studentId", "month", "year")` },
      // AUDIT-P2 FIX: dados de tenant mais consultados sem índice
      { table: 'students', sql: `CREATE INDEX IF NOT EXISTS "idx_students_org_professor" ON "students" ("organizationId", "professorId")` },
      { table: 'chat_messages', sql: `CREATE INDEX IF NOT EXISTS "idx_chat_messages_pair" ON "chat_messages" ("senderId", "receiverId", "createdAt")` },
      { table: 'notifications', sql: `CREATE INDEX IF NOT EXISTS "idx_notifications_user" ON "notifications" ("userId", "createdAt")` },
      // ── PRD_PROMPTS_IA_CONSOLIDADOS — Telemetria de IA (RF-009) ────────────────
      { table: 'ai_call_logs', sql: `CREATE TABLE IF NOT EXISTS "ai_call_logs" (
        "id" serial PRIMARY KEY NOT NULL,
        "organizationId" integer,
        "userId" integer,
        "feature" varchar(60) NOT NULL,
        "promptVersion" varchar(12),
        "provider" varchar(20) NOT NULL,
        "model" varchar(80) NOT NULL,
        "durationMs" integer NOT NULL,
        "success" boolean NOT NULL,
        "errorCode" varchar(30),
        "errorMessage" text,
        "isJson" integer DEFAULT 0 NOT NULL,
        "createdAt" timestamp DEFAULT now() NOT NULL
      );` },
      { table: 'ai_call_logs', sql: `CREATE INDEX IF NOT EXISTS "idx_ai_call_logs_org_created" ON "ai_call_logs" ("organizationId", "createdAt")` },
      { table: 'ai_call_logs', sql: `CREATE INDEX IF NOT EXISTS "idx_ai_call_logs_feature_created" ON "ai_call_logs" ("feature", "createdAt")` },
      // ── PRD_OTIMIZACAO_PLANO_DIARIO — telemetria de tokens (RF-009) ────────────
      { table: 'ai_call_logs', sql: 'ALTER TABLE "ai_call_logs" ADD COLUMN IF NOT EXISTS "inputTokens" integer' },
      { table: 'ai_call_logs', sql: 'ALTER TABLE "ai_call_logs" ADD COLUMN IF NOT EXISTS "outputTokens" integer' },
      { table: 'ai_call_logs', sql: 'ALTER TABLE "ai_call_logs" ADD COLUMN IF NOT EXISTS "cachedTokens" integer' },
      // ── PRD_SISTEMA_RANKINGS — Gamificação (rankings, participantes, ajustes, conquistas) ──
      { table: 'enum', sql: "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ranking_status') THEN CREATE TYPE ranking_status AS ENUM ('rascunho', 'agendado', 'ativo', 'encerrado', 'cancelado'); END IF; END $$;" },
      { table: 'enum', sql: "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ranking_visibility') THEN CREATE TYPE ranking_visibility AS ENUM ('publico', 'privado'); END IF; END $$;" },
      { table: 'rankings', sql: `CREATE TABLE IF NOT EXISTS "rankings" (
        "id" serial PRIMARY KEY NOT NULL,
        "organizationId" integer,
        "userId" integer NOT NULL,
        "name" varchar(255) NOT NULL,
        "description" text,
        "image" text,
        "status" ranking_status DEFAULT 'rascunho' NOT NULL,
        "visibility" ranking_visibility DEFAULT 'publico' NOT NULL,
        "privacySettings" jsonb DEFAULT '{"showFullName":false,"showAvatar":true,"showScores":true,"showEvolution":true,"showParticipants":true,"privateTopRange":10}'::jsonb NOT NULL,
        "criteriaWeights" jsonb DEFAULT '{"presenca":20,"atividades":30,"pratica":25,"evolucao":15,"desafios":10}'::jsonb NOT NULL,
        "participantRule" varchar(20) DEFAULT 'todos' NOT NULL,
        "instrumentId" integer,
        "level" varchar(30),
        "participantStudentIds" jsonb DEFAULT '[]'::jsonb NOT NULL,
        "startDate" timestamp NOT NULL,
        "endDate" timestamp NOT NULL,
        "history" jsonb,
        "closedAt" timestamp,
        "createdAt" timestamp DEFAULT now() NOT NULL,
        "updatedAt" timestamp DEFAULT now() NOT NULL
      );` },
      { table: 'rankings', sql: `CREATE INDEX IF NOT EXISTS "idx_rankings_org_status" ON "rankings" ("organizationId", "status")` },
      { table: 'rankings', sql: `CREATE INDEX IF NOT EXISTS "idx_rankings_org_end" ON "rankings" ("organizationId", "endDate")` },
      { table: 'ranking_participants', sql: `CREATE TABLE IF NOT EXISTS "ranking_participants" (
        "id" serial PRIMARY KEY NOT NULL,
        "organizationId" integer,
        "rankingId" integer NOT NULL,
        "studentId" integer NOT NULL,
        "joinedAt" timestamp DEFAULT now() NOT NULL,
        "status" varchar(20) DEFAULT 'ativo' NOT NULL,
        "lastPosition" integer,
        "previousPosition" integer,
        "finalPosition" integer,
        "finalScore" integer
      );` },
      { table: 'ranking_participants', sql: `CREATE INDEX IF NOT EXISTS "idx_ranking_participants_ranking" ON "ranking_participants" ("rankingId", "studentId")` },
      { table: 'ranking_participants', sql: `CREATE INDEX IF NOT EXISTS "idx_ranking_participants_student" ON "ranking_participants" ("studentId", "organizationId")` },
      { table: 'ranking_scores', sql: `CREATE TABLE IF NOT EXISTS "ranking_scores" (
        "id" serial PRIMARY KEY NOT NULL,
        "organizationId" integer,
        "rankingId" integer NOT NULL,
        "studentId" integer NOT NULL,
        "source" varchar(30) NOT NULL,
        "sourceId" integer,
        "points" integer NOT NULL,
        "reason" text,
        "createdBy" integer NOT NULL,
        "createdAt" timestamp DEFAULT now() NOT NULL
      );` },
      { table: 'ranking_scores', sql: `CREATE INDEX IF NOT EXISTS "idx_ranking_scores_ranking_student" ON "ranking_scores" ("rankingId", "studentId")` },
      { table: 'student_achievements', sql: `CREATE TABLE IF NOT EXISTS "student_achievements" (
        "id" serial PRIMARY KEY NOT NULL,
        "organizationId" integer,
        "studentId" integer NOT NULL,
        "rankingId" integer,
        "challengeId" integer,
        "badge" varchar(50) NOT NULL,
        "title" varchar(255) NOT NULL,
        "description" text,
        "awardedAt" timestamp DEFAULT now() NOT NULL
      );` },
      { table: 'student_achievements', sql: `CREATE INDEX IF NOT EXISTS "idx_student_achievements_student" ON "student_achievements" ("studentId", "organizationId")` },

      // ═══ REPOSIÇÃO DE AULAS (PRD 01) — tabelas + enum ═══
      { table: 'enum', sql: `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reposition_status') THEN CREATE TYPE reposition_status AS ENUM ('aguardando_liberacao', 'disponivel', 'agendada', 'realizada', 'expirada', 'cancelada'); END IF; END $$;` },
      { table: 'enum', sql: `ALTER TYPE lesson_status ADD VALUE IF NOT EXISTS 'a_repor'` },
      { table: 'reposition_policies', sql: `CREATE TABLE IF NOT EXISTS "reposition_policies" (
        "id" serial PRIMARY KEY NOT NULL,
        "organizationId" integer NOT NULL,
        "expirationDays" integer DEFAULT 30 NOT NULL,
        "expirationUnit" varchar(10) DEFAULT 'dias' NOT NULL,
        "creditRelease" varchar(20) DEFAULT 'imediata' NOT NULL,
        "createdAt" timestamp DEFAULT now() NOT NULL,
        "updatedAt" timestamp DEFAULT now() NOT NULL
      );` },
      { table: 'reposition_policies', sql: `CREATE UNIQUE INDEX IF NOT EXISTS "reposition_policies_org_unique" ON "reposition_policies" ("organizationId")` },
      { table: 'reposition_reasons', sql: `CREATE TABLE IF NOT EXISTS "reposition_reasons" (
        "id" serial PRIMARY KEY NOT NULL,
        "organizationId" integer NOT NULL,
        "name" varchar(120) NOT NULL,
        "description" text,
        "active" boolean DEFAULT true NOT NULL,
        "generatesCredit" boolean DEFAULT true NOT NULL,
        "createdAt" timestamp DEFAULT now() NOT NULL,
        "updatedAt" timestamp DEFAULT now() NOT NULL
      );` },
      { table: 'reposition_reasons', sql: `CREATE INDEX IF NOT EXISTS "reposition_reasons_org_idx" ON "reposition_reasons" ("organizationId")` },
      { table: 'lesson_repositions', sql: `CREATE TABLE IF NOT EXISTS "lesson_repositions" (
        "id" serial PRIMARY KEY NOT NULL,
        "organizationId" integer NOT NULL,
        "lessonId" integer NOT NULL,
        "studentId" integer NOT NULL,
        "professorId" integer,
        "reasonId" integer,
        "notes" text,
        "status" reposition_status DEFAULT 'aguardando_liberacao' NOT NULL,
        "releasedAt" timestamp,
        "expiresAt" timestamp,
        "scheduledLessonId" integer,
        "scheduledAt" timestamp,
        "completedAt" timestamp,
        "completedByUserId" integer,
        "completionNotes" text,
        "createdAt" timestamp DEFAULT now() NOT NULL,
        "updatedAt" timestamp DEFAULT now() NOT NULL
      );` },
      { table: 'lesson_repositions', sql: `CREATE UNIQUE INDEX IF NOT EXISTS "lesson_repositions_lesson_unique" ON "lesson_repositions" ("lessonId")` },
      { table: 'lesson_repositions', sql: `CREATE INDEX IF NOT EXISTS "lesson_repositions_org_idx" ON "lesson_repositions" ("organizationId")` },
      { table: 'lesson_repositions', sql: `CREATE INDEX IF NOT EXISTS "lesson_repositions_student_idx" ON "lesson_repositions" ("studentId")` },
      { table: 'lesson_repositions', sql: `CREATE INDEX IF NOT EXISTS "lesson_repositions_status_idx" ON "lesson_repositions" ("status")` },
      { table: 'reposition_events', sql: `CREATE TABLE IF NOT EXISTS "reposition_events" (
        "id" serial PRIMARY KEY NOT NULL,
        "organizationId" integer NOT NULL,
        "repositionId" integer,
        "type" varchar(40) NOT NULL,
        "message" text,
        "userId" integer,
        "createdAt" timestamp DEFAULT now() NOT NULL
      );` },
      { table: 'reposition_events', sql: `CREATE INDEX IF NOT EXISTS "reposition_events_reposition_idx" ON "reposition_events" ("repositionId")` },

      // ═══ IA — ESPECIALISTAS PERSONALIZADOS + GESTÃO DE PROMPTS (PRD 02) ═══
      { table: 'ai_specialists', sql: `CREATE TABLE IF NOT EXISTS "ai_specialists" (
        "id" serial PRIMARY KEY NOT NULL,
        "organizationId" integer NOT NULL,
        "name" varchar(120) NOT NULL,
        "area" varchar(120),
        "icon" varchar(50),
        "description" text,
        "systemPrompt" text,
        "pedagogicalInstructions" text,
        "technicalKnowledge" text,
        "aiModel" varchar(120),
        "active" boolean DEFAULT true NOT NULL,
        "createdByUserId" integer,
        "createdAt" timestamp DEFAULT now() NOT NULL,
        "updatedAt" timestamp DEFAULT now() NOT NULL
      );` },
      { table: 'ai_specialists', sql: `CREATE INDEX IF NOT EXISTS "ai_specialists_org_idx" ON "ai_specialists" ("organizationId")` },
      { table: 'ai_prompts', sql: `CREATE TABLE IF NOT EXISTS "ai_prompts" (
        "id" serial PRIMARY KEY NOT NULL,
        "organizationId" integer NOT NULL,
        "name" varchar(120) NOT NULL,
        "type" varchar(30) DEFAULT 'especialista' NOT NULL,
        "specialistKey" varchar(60),
        "specialistId" integer,
        "content" text NOT NULL,
        "active" boolean DEFAULT true NOT NULL,
        "version" integer DEFAULT 1 NOT NULL,
        "createdByUserId" integer,
        "createdAt" timestamp DEFAULT now() NOT NULL,
        "updatedAt" timestamp DEFAULT now() NOT NULL
      );` },
      { table: 'ai_prompts', sql: `CREATE INDEX IF NOT EXISTS "ai_prompts_org_idx" ON "ai_prompts" ("organizationId")` },
      { table: 'ai_prompt_versions', sql: `CREATE TABLE IF NOT EXISTS "ai_prompt_versions" (
        "id" serial PRIMARY KEY NOT NULL,
        "organizationId" integer NOT NULL,
        "promptId" integer NOT NULL,
        "version" integer NOT NULL,
        "content" text NOT NULL,
        "createdByUserId" integer,
        "createdAt" timestamp DEFAULT now() NOT NULL
      );` },
      { table: 'ai_prompt_versions', sql: `CREATE INDEX IF NOT EXISTS "ai_prompt_versions_prompt_idx" ON "ai_prompt_versions" ("promptId")` },

      // ═══ REPERTÓRIO DO ALUNO (músicas do YouTube — PRD Repertório) ═══
      { table: 'student_repertoire', sql: `CREATE TABLE IF NOT EXISTS "student_repertoire" (
        "id" serial PRIMARY KEY NOT NULL,
        "organizationId" integer NOT NULL,
        "studentId" integer NOT NULL,
        "createdByUserId" integer NOT NULL,
        "title" varchar(255) NOT NULL,
        "youtubeUrl" text NOT NULL,
        "videoId" varchar(20),
        "playlistId" varchar(60),
        "description" text,
        "position" integer DEFAULT 0 NOT NULL,
        "active" boolean DEFAULT true NOT NULL,
        "viewedAt" timestamp,
        "learnedAt" timestamp,
        "createdAt" timestamp DEFAULT now() NOT NULL,
        "updatedAt" timestamp DEFAULT now() NOT NULL
      );` },
      { table: 'student_repertoire', sql: `CREATE INDEX IF NOT EXISTS "student_repertoire_org_student_idx" ON "student_repertoire" ("organizationId", "studentId", "position")` },
      { table: 'student_repertoire', sql: `CREATE UNIQUE INDEX IF NOT EXISTS "student_repertoire_student_video_unique" ON "student_repertoire" ("studentId", "videoId")` },
      { table: 'student_repertoire', sql: `ALTER TABLE "student_repertoire" ADD COLUMN IF NOT EXISTS "chordSheet" text` },
      { table: 'student_repertoire', sql: `ALTER TABLE "student_repertoire" ADD COLUMN IF NOT EXISTS "chordKey" varchar(4)` },
      { table: 'student_repertoire', sql: `ALTER TABLE "student_repertoire" ADD COLUMN IF NOT EXISTS "chordDiagrams" jsonb` },
      { table: 'student_repertoire', sql: `ALTER TABLE "student_repertoire" ADD COLUMN IF NOT EXISTS "cifraclubUrl" text` },
      { table: 'settings', sql: `ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "cifraClubImportEnabled" integer DEFAULT 1 NOT NULL` },
      { table: 'message_automation_rules', sql: `ALTER TABLE "message_automation_rules" ADD COLUMN IF NOT EXISTS "triggerUnit" varchar(10) DEFAULT 'meses' NOT NULL` },
      { table: 'enrollment_links', sql: `ALTER TABLE "enrollment_links" ADD COLUMN IF NOT EXISTS "contractTemplateId" integer` },
      { table: 'students', sql: `ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "guardianCpf" varchar(20)` },
      { table: 'support_tickets', sql: `CREATE TABLE IF NOT EXISTS "support_tickets" ("id" serial PRIMARY KEY, "organizationId" integer, "userId" integer NOT NULL, "category" varchar(20) DEFAULT 'melhoria' NOT NULL, "title" varchar(255) NOT NULL, "description" text NOT NULL, "pageUrl" varchar(500), "status" varchar(20) DEFAULT 'aberto' NOT NULL, "priority" varchar(10) DEFAULT 'media' NOT NULL, "adminResponse" text, "resolvedAt" timestamp, "createdAt" timestamp DEFAULT now() NOT NULL, "updatedAt" timestamp DEFAULT now() NOT NULL)` },
      { table: 'support_tickets', sql: `CREATE INDEX IF NOT EXISTS "support_tickets_org_idx" ON "support_tickets" ("organizationId")` },
      { table: 'support_tickets', sql: `CREATE INDEX IF NOT EXISTS "support_tickets_status_idx" ON "support_tickets" ("status")` },
      { table: 'support_tickets', sql: `ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "attachments" text` },
      { table: 'support_tickets', sql: `ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "hasUnreadResponse" boolean DEFAULT false NOT NULL` },
      { table: 'student_enrollments', sql: `CREATE TABLE IF NOT EXISTS "student_enrollments" ("id" serial PRIMARY KEY, "organizationId" integer NOT NULL, "studentId" integer NOT NULL, "instrumentId" integer, "planId" integer, "teacherUserId" integer, "studioRoomId" integer, "durationMonths" integer DEFAULT 1 NOT NULL, "lessonsPerWeek" integer DEFAULT 1 NOT NULL, "weekday" integer DEFAULT 1 NOT NULL, "timeStr" varchar(5), "monthlyFee" decimal(10,2) DEFAULT '0.00' NOT NULL, "enrollmentFee" decimal(10,2) DEFAULT '0.00' NOT NULL, "startDate" date, "endDate" date, "status" varchar(20) DEFAULT 'ativo' NOT NULL, "createdAt" timestamp default now() NOT NULL, "updatedAt" timestamp default now() NOT NULL)` },
      { table: 'student_enrollments', sql: `CREATE INDEX IF NOT EXISTS "student_enrollments_student_idx" ON "student_enrollments" ("studentId")` },
      { table: 'student_enrollments', sql: `CREATE INDEX IF NOT EXISTS "student_enrollments_org_idx" ON "student_enrollments" ("organizationId")` },
      { table: 'message_automation_rules', sql: `
        INSERT INTO "message_automation_rules" ("organizationId", "userId", name, description, "isSystem", "isActive", trigger, "offsetDays", "offsetHours", "triggerUnit", "messageTemplate", channel)
        SELECT DISTINCT mar."organizationId", mar."userId", 'Fim de Contrato (aviso de encerramento)', 'Avisa o aluno quando o contrato está próximo do fim. Configure a unidade (meses ou aulas) e o valor na aba de configurações.', 1, 1, 'contract_expiring', 1, 0, 'meses', 'Olá {nome_aluno}! 📄 Seu contrato de {curso} está chegando ao fim. Se quiser continuar suas aulas, fale com a {nome_escola} para renovar. Qualquer dúvida, estamos à disposição!', 'whatsapp'
        FROM "message_automation_rules" mar
        WHERE mar."isSystem" = 1
          AND NOT EXISTS (
            SELECT 1 FROM "message_automation_rules" m2
            WHERE m2."organizationId" = mar."organizationId" AND m2."userId" = mar."userId" AND m2.trigger = 'contract_expiring'
          )
      ` },
    ];

    for (const m of migrations) {
      try {
        await db.execute(sql.raw(m.sql));
        const colPart = m.sql.split('ADD COLUMN IF NOT EXISTS ')[1];
        results.push(`OK: ${m.table}${colPart ? ' - ' + colPart : ''}`);
      } catch (e: any) {
        const msg: string = e.message ?? String(e);
        if (msg.includes("already exists") || msg.includes("já existe") || msg.includes("duplicate column")) {
          results.push(`SKIP: ${m.table} já possui a estrutura`);
        } else {
          // Log real errors clearly - they are important for diagnosing missing tables/columns
          console.error(`[Migration] ERRO em ${m.table}: ${msg}`);
          results.push(`ERROR: ${m.table} - ${msg}`);
        }
      }
    }

    const errors = results.filter(r => r.startsWith('ERROR'));
    if (errors.length > 0) {
      console.warn(`[Database] Migrações concluídas com ${errors.length} erro(s):`, errors);
    } else {
      debugLog("[Database] Migrações automáticas concluídas sem erros!");
    }
    return { success: true, results };
  } catch (error: any) {
    console.error("[Database] Falha crítica nas migrações:", error.message);
    return { success: false, error: error.message };
  }
}
