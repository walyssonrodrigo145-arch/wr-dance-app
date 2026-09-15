-- Migration 0004: student_pedagogical_memory, schedule_optimization_logs, landing, slot_offers, fiscal and rate limits

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
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_student_pedagogical_memory_student_org" ON "student_pedagogical_memory" ("studentId", "organizationId");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "schedule_optimization_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"userId" integer NOT NULL,
	"inputConstraints" text NOT NULL,
	"proposedSchedule" text NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"appliedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_schedule_optimization_logs_org_user" ON "schedule_optimization_logs" ("organizationId", "userId");--> statement-breakpoint

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
);--> statement-breakpoint

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
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "slot_offers_org_status_idx" ON "slot_offers" ("organizationId", "status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "slot_offers_slot_date_idx" ON "slot_offers" ("slotDate");--> statement-breakpoint

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
);--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE regime_tributario AS ENUM ('simples_nacional', 'lucro_presumido', 'lucro_real', 'mei');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE tipo_emissao_nfse AS ENUM ('automatico', 'manual', 'desativado');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE fiscal_invoice_status AS ENUM ('draft', 'pending', 'authorized', 'cancelled', 'error');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE fiscal_job_status AS ENUM ('pending', 'processing', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

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
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "fiscal_companies_org_idx" ON "fiscal_companies" ("organizationId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fiscal_companies_cnpj_idx" ON "fiscal_companies" ("cnpj");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "fiscal_services" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"nome" varchar(255) NOT NULL,
	"codigoServico" varchar(50) NOT NULL,
	"codigoTributacaoMunicipio" varchar(50),
	"aliquotaIss" numeric(5, 2) DEFAULT 0.00 NOT NULL,
	"naturezaOperacao" varchar(100) DEFAULT '1' NOT NULL,
	"descricaoPadrao" text DEFAULT 'Mensalidade referente a aulas de musica - Competencia {competencia}' NOT NULL,
	"itemListaServico" varchar(20) DEFAULT '08.01',
	"issRetido" boolean DEFAULT false NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "fiscal_services_org_idx" ON "fiscal_services" ("organizationId");--> statement-breakpoint

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
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "fiscal_invoices_org_idx" ON "fiscal_invoices" ("organizationId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fiscal_invoices_student_idx" ON "fiscal_invoices" ("studentId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fiscal_invoices_payment_idx" ON "fiscal_invoices" ("paymentId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fiscal_invoices_status_idx" ON "fiscal_invoices" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fiscal_invoices_reference_idx" ON "fiscal_invoices" ("reference");--> statement-breakpoint

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
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "fiscal_jobs_org_status_idx" ON "fiscal_jobs" ("organizationId", "status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fiscal_jobs_invoice_idx" ON "fiscal_jobs" ("invoiceId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fiscal_jobs_next_attempt_idx" ON "fiscal_jobs" ("nextAttemptAt");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "fiscal_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"invoiceId" integer,
	"event" varchar(100) NOT NULL,
	"payload" jsonb DEFAULT '{}',
	"userId" integer,
	"userName" varchar(255),
	"createdAt" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "fiscal_logs_org_idx" ON "fiscal_logs" ("organizationId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fiscal_logs_invoice_idx" ON "fiscal_logs" ("invoiceId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fiscal_logs_created_at_idx" ON "fiscal_logs" ("createdAt");--> statement-breakpoint

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
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "webhook_events_gateway_event_idx" ON "webhook_events" ("gateway", "gatewayEventId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhook_events_org_idx" ON "webhook_events" ("organizationId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhook_events_status_idx" ON "webhook_events" ("status");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "whatsapp_rate_limits" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"userId" integer,
	"windowStart" timestamp NOT NULL,
	"messageCount" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_rate_limits_org_window_idx" ON "whatsapp_rate_limits" ("organizationId", "windowStart");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "whatsapp_rate_limits_org_idx" ON "whatsapp_rate_limits" ("organizationId");
