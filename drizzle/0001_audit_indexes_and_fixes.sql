CREATE TYPE "public"."campaign_contact_status" AS ENUM('pending', 'processing', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."campaign_status" AS ENUM('draft', 'running', 'paused', 'completed', 'error');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "marketing_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"status" "campaign_status" DEFAULT 'draft' NOT NULL,
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
);
--> statement-breakpoint
CREATE TABLE "marketing_contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"campaignId" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"phone" varchar(50) NOT NULL,
	"variables" jsonb,
	"messageText" text NOT NULL,
	"status" "campaign_contact_status" DEFAULT 'pending' NOT NULL,
	"errorMessage" text,
	"evolutionMessageId" varchar(255),
	"processedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"campaignId" integer NOT NULL,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"lockedAt" timestamp,
	"lockedBy" varchar(255),
	"lastProcessedContactId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"campaignId" integer NOT NULL,
	"contactId" integer,
	"level" varchar(50) NOT NULL,
	"message" text NOT NULL,
	"payload" jsonb,
	"response" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "students" DROP CONSTRAINT "students_email_unique";--> statement-breakpoint
ALTER TABLE "daily_study_plans" ADD COLUMN "daysTimeSpent" text DEFAULT '[0,0,0,0,0]' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_dues" ADD COLUMN "mpPaymentId" text;--> statement-breakpoint
ALTER TABLE "payment_dues" ADD COLUMN "mpPaymentLink" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "dueDaysForecast" text DEFAULT '5,10,15,20';--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "chatbotEnabled" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "mpAccessToken" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "paymentGateway" varchar(20) DEFAULT 'asaas' NOT NULL;--> statement-breakpoint
ALTER TABLE "marketing_contacts" ADD CONSTRAINT "marketing_contacts_campaignId_marketing_campaigns_id_fk" FOREIGN KEY ("campaignId") REFERENCES "public"."marketing_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_jobs" ADD CONSTRAINT "marketing_jobs_campaignId_marketing_campaigns_id_fk" FOREIGN KEY ("campaignId") REFERENCES "public"."marketing_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_logs" ADD CONSTRAINT "marketing_logs_campaignId_marketing_campaigns_id_fk" FOREIGN KEY ("campaignId") REFERENCES "public"."marketing_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_logs" ADD CONSTRAINT "marketing_logs_contactId_marketing_contacts_id_fk" FOREIGN KEY ("contactId") REFERENCES "public"."marketing_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asaas_customers_student_org_idx" ON "asaas_customers" USING btree ("studentId","organizationId");--> statement-breakpoint
CREATE INDEX "lessons_student_id_idx" ON "lessons" USING btree ("studentId");--> statement-breakpoint
CREATE INDEX "lessons_organization_id_idx" ON "lessons" USING btree ("organizationId");--> statement-breakpoint
CREATE INDEX "lessons_scheduled_at_idx" ON "lessons" USING btree ("scheduledAt");--> statement-breakpoint
CREATE INDEX "lessons_status_idx" ON "lessons" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payment_dues_student_id_idx" ON "payment_dues" USING btree ("studentId");--> statement-breakpoint
CREATE INDEX "payment_dues_organization_id_idx" ON "payment_dues" USING btree ("organizationId");--> statement-breakpoint
CREATE INDEX "payment_dues_status_idx" ON "payment_dues" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payment_dues_due_date_idx" ON "payment_dues" USING btree ("dueDate");--> statement-breakpoint
CREATE INDEX "payment_dues_asaas_id_idx" ON "payment_dues" USING btree ("asaasId");--> statement-breakpoint
CREATE INDEX "reminders_ref_id_idx" ON "reminders" USING btree ("refId");--> statement-breakpoint
CREATE INDEX "reminders_organization_id_idx" ON "reminders" USING btree ("organizationId");--> statement-breakpoint
CREATE INDEX "reminders_status_idx" ON "reminders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reminders_scheduled_at_idx" ON "reminders" USING btree ("scheduledAt");--> statement-breakpoint
CREATE UNIQUE INDEX "students_email_org_idx" ON "students" USING btree ("email","organizationId");