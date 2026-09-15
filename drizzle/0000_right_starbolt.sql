CREATE TYPE "public"."contract_status" AS ENUM('rascunho', 'enviado', 'assinado', 'cancelado');--> statement-breakpoint
CREATE TYPE "public"."file_category" AS ENUM('imagem', 'video', 'pdf', 'audio', 'documento');--> statement-breakpoint
CREATE TYPE "public"."goal_status" AS ENUM('pendente', 'concluida');--> statement-breakpoint
CREATE TYPE "public"."lesson_status" AS ENUM('agendada', 'concluida', 'cancelada', 'remarcada', 'falta');--> statement-breakpoint
CREATE TYPE "public"."lesson_type" AS ENUM('individual', 'turma', 'online');--> statement-breakpoint
CREATE TYPE "public"."level" AS ENUM('iniciante', 'intermediario', 'avancado');--> statement-breakpoint
CREATE TYPE "public"."payment_due_status" AS ENUM('pendente', 'pago', 'atrasado');--> statement-breakpoint
CREATE TYPE "public"."professor_payment_status" AS ENUM('aberto', 'aprovado', 'pago');--> statement-breakpoint
CREATE TYPE "public"."professor_payment_type" AS ENUM('fixo', 'porcentagem');--> statement-breakpoint
CREATE TYPE "public"."reminder_status" AS ENUM('pendente', 'enviado', 'cancelado');--> statement-breakpoint
CREATE TYPE "public"."reminder_type" AS ENUM('aula', 'cobranca', 'inadimplencia', 'manual');--> statement-breakpoint
CREATE TYPE "public"."reschedule_status" AS ENUM('pendente', 'aprovada', 'recusada');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'professor', 'aluno');--> statement-breakpoint
CREATE TYPE "public"."status" AS ENUM('ativo', 'inativo', 'pausado');--> statement-breakpoint
CREATE TYPE "public"."timeline_category" AS ENUM('tecnica', 'teoria', 'repertorio', 'geral');--> statement-breakpoint
CREATE TABLE "ai_conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"userId" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"userId" integer NOT NULL,
	"fileName" varchar(255) NOT NULL,
	"fileType" varchar(50) NOT NULL,
	"extractedText" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversationId" integer NOT NULL,
	"role" varchar(50) NOT NULL,
	"content" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer,
	"userId" integer NOT NULL,
	"targetStudentId" integer,
	"title" varchar(255) NOT NULL,
	"content" text NOT NULL,
	"important" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asaas_customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer,
	"studentId" integer NOT NULL,
	"asaasCustomerId" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer,
	"userId" integer NOT NULL,
	"lessonId" integer,
	"tokenId" integer NOT NULL,
	"scannedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer,
	"token" varchar(64) NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer,
	"senderId" integer NOT NULL,
	"receiverId" integer NOT NULL,
	"content" text NOT NULL,
	"isRead" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chatbot_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer,
	"phone" varchar(30) NOT NULL,
	"state" varchar(50) DEFAULT 'START' NOT NULL,
	"data" text,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chatbot_sessions_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer,
	"userId" integer NOT NULL,
	"studentId" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"status" "contract_status" DEFAULT 'rascunho' NOT NULL,
	"zapsignDocId" text,
	"zapsignSignUrl" text,
	"signedAt" timestamp,
	"documentUrl" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_study_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer,
	"studentId" integer NOT NULL,
	"teacherId" integer NOT NULL,
	"planText" text NOT NULL,
	"status" "status" DEFAULT 'ativo' NOT NULL,
	"publishedStatus" varchar(20) DEFAULT 'rascunho' NOT NULL,
	"daysCompleted" text DEFAULT '[false,false,false,false,false]' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"completedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer,
	"userId" integer NOT NULL,
	"description" varchar(255) NOT NULL,
	"supplier" varchar(255),
	"account" varchar(255),
	"recurrence" varchar(50) DEFAULT 'unica' NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"date" date NOT NULL,
	"category" varchar(100) NOT NULL,
	"status" "payment_due_status" DEFAULT 'pendente' NOT NULL,
	"receiptUrl" text,
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fcm_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer,
	"userId" integer NOT NULL,
	"token" text NOT NULL,
	"deviceInfo" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fcm_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "file_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer,
	"fileId" integer NOT NULL,
	"userId" integer NOT NULL,
	"content" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instruments" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer,
	"userId" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"category" varchar(100) NOT NULL,
	"icon" varchar(50),
	"color" varchar(20),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer,
	"userId" integer NOT NULL,
	"studentId" integer,
	"isExperimental" boolean DEFAULT false NOT NULL,
	"experimentalName" varchar(255),
	"experimentalPhone" varchar(30),
	"title" varchar(255) NOT NULL,
	"description" text,
	"scheduledAt" timestamp NOT NULL,
	"duration" integer DEFAULT 60 NOT NULL,
	"status" "lesson_status" DEFAULT 'agendada' NOT NULL,
	"lessonType" "lesson_type" DEFAULT 'individual' NOT NULL,
	"notes" text,
	"rating" integer,
	"instrumentId" integer,
	"recurringGroupId" varchar(100),
	"alertSent1h" boolean DEFAULT false NOT NULL,
	"alertSent30m" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_automation_rules" (
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
	"sendToStudent" integer DEFAULT 1 NOT NULL,
	"sendToGuardian" integer DEFAULT 0 NOT NULL,
	"totalSent" integer DEFAULT 0 NOT NULL,
	"lastExecutedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monthly_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer,
	"userId" integer NOT NULL,
	"month" integer NOT NULL,
	"year" integer NOT NULL,
	"newStudents" integer DEFAULT 0 NOT NULL,
	"activeStudents" integer DEFAULT 0 NOT NULL,
	"lessonsGiven" integer DEFAULT 0 NOT NULL,
	"lessonsCancelled" integer DEFAULT 0 NOT NULL,
	"revenue" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer,
	"userId" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"type" varchar(50) DEFAULT 'info' NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"actionUrl" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"logo" text,
	"active" boolean DEFAULT true NOT NULL,
	"ownerId" integer,
	"subscriptionStatus" varchar(50) DEFAULT 'trialing' NOT NULL,
	"trialEndsAt" timestamp,
	"currentPeriodEnd" timestamp,
	"asaasCustomerId" varchar(100),
	"asaasSubscriptionId" varchar(100),
	"planId" varchar(50) DEFAULT 'premium' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "payment_dues" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer,
	"userId" integer NOT NULL,
	"studentId" integer NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"dueDate" date NOT NULL,
	"paidAt" timestamp,
	"status" "payment_due_status" DEFAULT 'pendente' NOT NULL,
	"month" integer NOT NULL,
	"year" integer NOT NULL,
	"notes" text,
	"asaasId" text,
	"asaasPaymentLink" text,
	"asaasBillingType" varchar(30),
	"receiptUrl" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "professor_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer,
	"professorId" integer NOT NULL,
	"month" integer NOT NULL,
	"year" integer NOT NULL,
	"totalClasses" integer DEFAULT 0 NOT NULL,
	"totalMinutes" integer DEFAULT 0 NOT NULL,
	"totalCredits" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"totalDebits" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"totalAmount" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"status" "professor_payment_status" DEFAULT 'aberto' NOT NULL,
	"approvedAt" timestamp,
	"paidAt" timestamp,
	"notes" text,
	"adjustments" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "professores" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer,
	"userId" integer NOT NULL,
	"especialidade" text,
	"telefone" varchar(30),
	"foto" text,
	"pixKey" text,
	"paymentType" "professor_payment_type" DEFAULT 'fixo',
	"hourlyRate" numeric(10, 2) DEFAULT '0.00',
	"paymentPercentage" numeric(5, 2) DEFAULT '0.00',
	"permissions" jsonb DEFAULT '["aulas", "progresso", "recepcao", "ia", "lembretes", "relatorios"]',
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "professores_userId_unique" UNIQUE("userId")
);
--> statement-breakpoint
CREATE TABLE "reminder_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer,
	"userId" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"type" "reminder_type" DEFAULT 'manual' NOT NULL,
	"body" text NOT NULL,
	"isDefault" integer DEFAULT 0 NOT NULL,
	"sendToStudent" boolean DEFAULT true NOT NULL,
	"sendToGuardian" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer,
	"userId" integer NOT NULL,
	"studentId" integer,
	"lessonId" integer,
	"paymentDueId" integer,
	"templateId" integer,
	"type" "reminder_type" DEFAULT 'manual' NOT NULL,
	"message" text NOT NULL,
	"scheduledAt" timestamp NOT NULL,
	"status" "reminder_status" DEFAULT 'pendente' NOT NULL,
	"autoGenerated" integer DEFAULT 0 NOT NULL,
	"sentAt" timestamp,
	"cancelledAt" timestamp,
	"refId" varchar(200),
	"targetPhone" varchar(30),
	"externalMessageId" varchar(255),
	"errorMessage" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reschedule_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer,
	"studentId" integer NOT NULL,
	"lessonId" integer NOT NULL,
	"reason" text NOT NULL,
	"preferredDates" text NOT NULL,
	"status" "reschedule_status" DEFAULT 'pendente' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer,
	"userId" integer NOT NULL,
	"phone" varchar(30),
	"bio" text,
	"schoolName" varchar(255),
	"schoolAddress" text,
	"schoolCity" varchar(100),
	"schoolPhone" varchar(30),
	"schoolWebsite" varchar(255),
	"schoolDescription" text,
	"notifyLessonReminder" integer DEFAULT 1 NOT NULL,
	"notifyPaymentDue" integer DEFAULT 1 NOT NULL,
	"notifyStudentAbsence" integer DEFAULT 1 NOT NULL,
	"notifyNewStudent" integer DEFAULT 1 NOT NULL,
	"notifyWeeklyReport" integer DEFAULT 0 NOT NULL,
	"automationEnabled" integer DEFAULT 0 NOT NULL,
	"automationLastRun" timestamp,
	"theme" varchar(20) DEFAULT 'light',
	"pixKey" text,
	"hiddenTabs" text DEFAULT '' NOT NULL,
	"whatsappBotUrl" varchar(255),
	"whatsappBotToken" text,
	"whatsappAutoSend" integer DEFAULT 0 NOT NULL,
	"asaasApiKey" text,
	"asaasEnabled" integer DEFAULT 0 NOT NULL,
	"aiProvider" varchar(50) DEFAULT 'gemini',
	"geminiApiKey" varchar(255),
	"geminiModel" varchar(255),
	"groqApiKey" varchar(255),
	"groqModel" varchar(255),
	"schoolHours" text DEFAULT '{"monday":{"active":true,"start":"08:00","end":"18:00"},"tuesday":{"active":true,"start":"08:00","end":"18:00"},"wednesday":{"active":true,"start":"08:00","end":"18:00"},"thursday":{"active":true,"start":"08:00","end":"18:00"},"friday":{"active":true,"start":"08:00","end":"18:00"},"saturday":{"active":false,"start":"08:00","end":"12:00"},"sunday":{"active":false,"start":"08:00","end":"12:00"}}' NOT NULL,
	"zapsignApiKey" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "settings_userId_unique" UNIQUE("userId")
);
--> statement-breakpoint
CREATE TABLE "student_evolution" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer,
	"studentId" integer NOT NULL,
	"technical" integer DEFAULT 0 NOT NULL,
	"rhythm" integer DEFAULT 0 NOT NULL,
	"harmony" integer DEFAULT 0 NOT NULL,
	"reading" integer DEFAULT 0 NOT NULL,
	"recordedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_files" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer,
	"userId" integer NOT NULL,
	"studentId" integer NOT NULL,
	"fileName" varchar(255) NOT NULL,
	"fileType" varchar(100) NOT NULL,
	"category" "file_category" NOT NULL,
	"folder" varchar(100),
	"fileUrl" text NOT NULL,
	"thumbnailUrl" text,
	"comments" text,
	"size" integer,
	"viewedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_goals" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer,
	"userId" integer NOT NULL,
	"studentId" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"status" "goal_status" DEFAULT 'pendente' NOT NULL,
	"targetDate" date,
	"completedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_timeline" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer,
	"userId" integer NOT NULL,
	"studentId" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"category" timeline_category DEFAULT 'geral' NOT NULL,
	"grade" numeric(3, 1),
	"achievedAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer,
	"userId" integer NOT NULL,
	"professorId" integer NOT NULL,
	"studentUserId" integer,
	"name" varchar(255) NOT NULL,
	"socialName" varchar(255),
	"email" varchar(320),
	"phone" varchar(30) DEFAULT '' NOT NULL,
	"birthDate" date,
	"gender" varchar(50),
	"cpf" varchar(20),
	"rg" varchar(20),
	"address" text,
	"guardianName" varchar(255),
	"guardianPhone" varchar(30),
	"guardianEmail" varchar(320),
	"avatar" text,
	"instrumentId" integer,
	"level" "level" DEFAULT 'iniciante' NOT NULL,
	"status" "status" DEFAULT 'ativo' NOT NULL,
	"monthlyFee" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"dueDay" integer DEFAULT 10 NOT NULL,
	"lessonType" "lesson_type" DEFAULT 'individual' NOT NULL,
	"onlineMeetingLink" text,
	"startDate" date,
	"notes" text,
	"permissions" text,
	"methodologyFilename" varchar(255),
	"methodologyText" text,
	"allowAutoReminders" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "students_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "system_coupons" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(50) NOT NULL,
	"discount_type" varchar(20) NOT NULL,
	"discount_value" numeric NOT NULL,
	"duration_months" integer,
	"max_uses" integer,
	"current_uses" integer DEFAULT 0 NOT NULL,
	"valid_until" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "system_coupons_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "system_plans" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"price_monthly" numeric NOT NULL,
	"price_yearly" numeric NOT NULL,
	"max_students" integer NOT NULL,
	"features" text DEFAULT '[]' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"show_on_landing" boolean DEFAULT true NOT NULL,
	"is_popular" boolean DEFAULT false NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"passwordHash" varchar(255),
	"mustChangePassword" boolean DEFAULT false NOT NULL,
	"hasSeenTutorial" boolean DEFAULT false NOT NULL,
	"loginMethod" varchar(64),
	"role" "role" DEFAULT 'professor' NOT NULL,
	"studentId" integer,
	"isEmailVerified" boolean DEFAULT false NOT NULL,
	"verificationToken" text,
	"verificationTokenExpiresAt" timestamp,
	"resetPasswordToken" text,
	"resetPasswordTokenExpiresAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
