import {
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  varchar,
  decimal,
  date,
  serial,
  boolean,
  jsonb,
  index,
  uniqueIndex
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum('role', ["admin", "professor", "aluno"]);
export const levelEnum = pgEnum('level', ["iniciante", "intermediario", "avancado"]);
export const statusEnum = pgEnum('status', ["ativo", "inativo", "pausado"]);
// "a_repor" = Aula a Repor (PRD Reposição) — o crédito é gerado na tabela lesson_repositions
export const lessonStatusEnum = pgEnum('lesson_status', ["agendada", "concluida", "cancelada", "remarcada", "falta", "a_repor"]);
export const repositionStatusEnum = pgEnum('reposition_status', ["aguardando_liberacao", "disponivel", "agendada", "realizada", "expirada", "cancelada"]);
export const reminderTypeEnum = pgEnum('reminder_type', ["aula", "cobranca", "inadimplencia", "manual"]);
export const reminderStatusEnum = pgEnum('reminder_status', ["pendente", "enviado", "cancelado"]);
export const paymentDueStatusEnum = pgEnum('payment_due_status', ["pendente", "pago", "atrasado"]);
export const goalStatusEnum = pgEnum('goal_status', ["pendente", "concluida"]);
export const timelineCategoryEnum = pgEnum('timeline_category', ["tecnica", "teoria", "repertorio", "geral"]);
export const fileCategoryEnum = pgEnum('file_category', ["imagem", "video", "pdf", "audio", "documento"]);
export const rescheduleStatusEnum = pgEnum('reschedule_status', ["pendente", "aprovada", "recusada"]);
export const lessonTypeEnum = pgEnum('lesson_type', ["individual", "turma", "online"]);
export const contractStatusEnum = pgEnum('contract_status', ["rascunho", "enviado", "assinado", "cancelado", "aguardando_assinatura", "expirado", "erro"]);
export const integrationProviderEnum = pgEnum('integration_provider', ["assinafy"]);
export const integrationEnvironmentEnum = pgEnum('integration_environment', ["sandbox", "production"]);
export const integrationConnectionStatusEnum = pgEnum('integration_connection_status', ["connected", "invalid_credentials", "disconnected", "error"]);
export const professorPaymentTypeEnum = pgEnum('professor_payment_type', ["fixo", "porcentagem"]);
export const professorPaymentStatusEnum = pgEnum('professor_payment_status', ["aberto", "aprovado", "pago"]);

// Marketing Enums
export const campaignStatusEnum = pgEnum('campaign_status', ["draft", "running", "paused", "completed", "error"]);
export const campaignContactStatusEnum = pgEnum('campaign_contact_status', ["pending", "processing", "sent", "failed"]);
export const jobStatusEnum = pgEnum('job_status', ["pending", "running", "completed", "failed"]);

// Fiscal Enums
export const fiscalInvoiceStatusEnum = pgEnum('fiscal_invoice_status', ["draft", "pending", "processing", "authorized", "rejected", "cancel_requested", "cancelled", "error"]);
export const fiscalJobStatusEnum = pgEnum('fiscal_job_status', ["pending", "processing", "completed", "failed", "retry"]);
export const regimeTributarioEnum = pgEnum('regime_tributario', ["simples_nacional", "lucro_presumido", "lucro_real", "mei"]);
export const tipoEmissaoNfseEnum = pgEnum('tipo_emissao_nfse', ["municipal", "nacional", "automatico"]);

export const organizations = pgTable("organizations", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  logo: text("logo"),
  active: boolean("active").default(true).notNull(),
  ownerId: integer("ownerId"), // Admin/Owner of the school
  
  // Platform Subscription Fields
  subscriptionStatus: varchar("subscriptionStatus", { length: 50 }).default("trialing").notNull(),
  trialEndsAt: timestamp("trialEndsAt"),
  currentPeriodEnd: timestamp("currentPeriodEnd"),
  asaasCustomerId: varchar("asaasCustomerId", { length: 100 }),
  asaasSubscriptionId: varchar("asaasSubscriptionId", { length: 100 }),
  planId: varchar("planId", { length: 50 }).default("premium").notNull(),

  // Endereço da escola (capturado no cadastro público — ViaCEP)
  zipCode: varchar("zipCode", { length: 9 }),
  addressStreet: varchar("addressStreet", { length: 255 }),
  addressNumber: varchar("addressNumber", { length: 20 }),
  addressDistrict: varchar("addressDistrict", { length: 120 }),
  addressCity: varchar("addressCity", { length: 120 }),
  addressState: varchar("addressState", { length: 2 }),

  // Espelho dos Dados da Escola (settings.updateSchool) — usado por contratos/fiscal
  // AUDIT-CONTRACTS: colunas ausentes do schema quebravam o UPDATE com erro SQL.
  phone: varchar("phone", { length: 30 }),
  email: varchar("email", { length: 255 }),
  address: text("address"),
  city: varchar("city", { length: 120 }),
  cnpj: varchar("cnpj", { length: 25 }),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId"), // Multi-tenancy isolation
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  passwordHash: varchar("passwordHash", { length: 255 }),
  mustChangePassword: boolean("mustChangePassword").default(false).notNull(),
  hasSeenTutorial: boolean("hasSeenTutorial").default(false).notNull(),
  // Última versão de "Novidades" vista pelo usuário (changelog em shared/releases.ts)
  lastSeenReleaseVersion: varchar("lastSeenReleaseVersion", { length: 20 }).default("").notNull(),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: roleEnum("role").default("professor").notNull(),
  studentId: integer("studentId"), // Link to students table if role is 'aluno'
  isEmailVerified: boolean("isEmailVerified").default(false).notNull(),
  verificationToken: text("verificationToken"),
  verificationTokenExpiresAt: timestamp("verificationTokenExpiresAt"),
  resetPasswordToken: text("resetPasswordToken"),
  resetPasswordTokenExpiresAt: timestamp("resetPasswordTokenExpiresAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const professores = pgTable("professores", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId"),
  userId: integer("userId").notNull().unique(),
  especialidade: text("especialidade"),
  telefone: varchar("telefone", { length: 30 }),
  foto: text("foto"),
  pixKey: text("pixKey"),
  // Payment calculation fields
  paymentType: professorPaymentTypeEnum("paymentType").default("fixo"),
  hourlyRate: decimal("hourlyRate", { precision: 10, scale: 2 }).default("0.00"),
  paymentPercentage: decimal("paymentPercentage", { precision: 5, scale: 2 }).default("0.00"),
  permissions: jsonb("permissions").default('["aulas", "progresso", "recepcao", "ia", "lembretes", "relatorios"]'),
  // Cards do dashboard PERMITIDOS para este professor (definido pelo admin, modo trava).
  // JSON array de widget IDs; vazio = todos permitidos (retrocompatível).
  dashboardWidgets: text("dashboardWidgets").default("").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const instruments = pgTable("instruments", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId"),
  userId: integer("userId").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  icon: varchar("icon", { length: 50 }),
  color: varchar("color", { length: 20 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const students = pgTable("students", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId"),
  userId: integer("userId").notNull(),
  professorId: integer("professorId").notNull(), // Owner of the student record
  studentUserId: integer("studentUserId"), // Student's own user account
  name: varchar("name", { length: 255 }).notNull(),
  socialName: varchar("socialName", { length: 255 }),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 30 }).default("").notNull(),
  birthDate: date("birthDate"),
  gender: varchar("gender", { length: 50 }),
  cpf: varchar("cpf", { length: 20 }),
  rg: varchar("rg", { length: 20 }),
  address: text("address"),
  guardianName: varchar("guardianName", { length: 255 }),
  guardianPhone: varchar("guardianPhone", { length: 30 }),
  guardianEmail: varchar("guardianEmail", { length: 320 }),
  guardianCpf: varchar("guardianCpf", { length: 20 }),
  avatar: text("avatar"),
  instrumentId: integer("instrumentId"),
  level: levelEnum("level").default("iniciante").notNull(),
  status: statusEnum("status").default("ativo").notNull(),
  monthlyFee: decimal("monthlyFee", { precision: 10, scale: 2 }).default("0.00").notNull(),
  billingPeriodicity: varchar("billingPeriodicity", { length: 20 }).default("mensal").notNull(),
  dueDay: integer("dueDay").default(10).notNull(),
  schoolPlanId: integer("schoolPlanId"), // Catálogo de Planos & Bolsas da escola
  lessonType: lessonTypeEnum("lessonType").default("individual").notNull(),
  onlineMeetingLink: text("onlineMeetingLink"),
  startDate: date("startDate"),
  notes: text("notes"),
  permissions: text("permissions"), // JSON string: { canSeeFinanceiro: boolean, etc }
  methodologyFilename: varchar("methodologyFilename", { length: 255 }),
  methodologyText: text("methodologyText"),
  allowAutoReminders: boolean("allowAutoReminders").default(true).notNull(),
  studioRoomId: integer("studioRoomId"),
  // Fiscal Data
  personType: varchar("personType", { length: 10 }).default("PF"), // PF ou PJ
  fiscalCpfCnpj: varchar("fiscalCpfCnpj", { length: 30 }),
  fiscalLegalName: varchar("fiscalLegalName", { length: 255 }),
  fiscalCep: varchar("fiscalCep", { length: 20 }),
  fiscalStreet: varchar("fiscalStreet", { length: 255 }),
  fiscalNumber: varchar("fiscalNumber", { length: 50 }),
  fiscalComplement: varchar("fiscalComplement", { length: 100 }),
  fiscalNeighborhood: varchar("fiscalNeighborhood", { length: 100 }),
  fiscalCity: varchar("fiscalCity", { length: 100 }),
  fiscalState: varchar("fiscalState", { length: 10 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("students_email_org_idx").on(table.email, table.organizationId),
]);

export const lessons = pgTable("lessons", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId"),
  userId: integer("userId").notNull(),
  studentId: integer("studentId"),
  isExperimental: boolean("isExperimental").default(false).notNull(),
  experimentalName: varchar("experimentalName", { length: 255 }),
  experimentalPhone: varchar("experimentalPhone", { length: 30 }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  scheduledAt: timestamp("scheduledAt").notNull(),
  duration: integer("duration").default(60).notNull(),
  status: lessonStatusEnum("status").default("agendada").notNull(),
  lessonType: lessonTypeEnum("lessonType").default("individual").notNull(),
  notes: text("notes"),
  rating: integer("rating"),
  instrumentId: integer("instrumentId"),
  studioRoomId: integer("studioRoomId"),
  recurringGroupId: varchar("recurringGroupId", { length: 100 }),
  // Tipo de recorrência da série (AgendarModal): "semanal" | "quinzenal" | "mensal30" | "mensal_fixo".
  // null = aula avulsa/única. Usado para destacar na agenda aulas que NÃO são semanais.
  recurrence: varchar("recurrence", { length: 20 }),
  alertSent1h: boolean("alertSent1h").default(false).notNull(),
  alertSent30m: boolean("alertSent30m").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
}, (table) => [
  index("lessons_student_id_idx").on(table.studentId),
  index("lessons_organization_id_idx").on(table.organizationId),
  index("lessons_scheduled_at_idx").on(table.scheduledAt),
  index("lessons_status_idx").on(table.status),
]);

export const monthlyStats = pgTable("monthly_stats", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId"),
  userId: integer("userId").notNull(),
  month: integer("month").notNull(),
  year: integer("year").notNull(),
  newStudents: integer("newStudents").default(0).notNull(),
  activeStudents: integer("activeStudents").default(0).notNull(),
  lessonsGiven: integer("lessonsGiven").default(0).notNull(),
  lessonsCancelled: integer("lessonsCancelled").default(0).notNull(),
  revenue: decimal("revenue", { precision: 12, scale: 2 }).default("0.00").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId"),
  userId: integer("userId").notNull().unique(),
  phone: varchar("phone", { length: 30 }),
  bio: text("bio"),
  schoolName: varchar("schoolName", { length: 255 }),
  schoolCnpj: varchar("schoolCnpj", { length: 30 }),
  schoolAddress: text("schoolAddress"),
  schoolCity: varchar("schoolCity", { length: 100 }),
  schoolPhone: varchar("schoolPhone", { length: 30 }),
  schoolEmail: varchar("schoolEmail", { length: 255 }),
  schoolWebsite: varchar("schoolWebsite", { length: 255 }),
  schoolDescription: text("schoolDescription"),
  showSchoolName: integer("showSchoolName").default(1).notNull(), // 1 = logo + nome | 0 = somente logo
  logoUrl: text("logoUrl"),
  dueDaysForecast: text("dueDaysForecast").default("5,10,15,20"),
  notifyLessonReminder: integer("notifyLessonReminder").default(1).notNull(),
  notifyPaymentDue: integer("notifyPaymentDue").default(1).notNull(),
  notifyStudentAbsence: integer("notifyStudentAbsence").default(1).notNull(),
  notifyNewStudent: integer("notifyNewStudent").default(1).notNull(),
  notifyWeeklyReport: integer("notifyWeeklyReport").default(0).notNull(),
  automationEnabled: integer("automationEnabled").default(0).notNull(),
  automationLastRun: timestamp("automationLastRun"),
  theme: varchar("theme", { length: 20 }).default("light"),
  pixKey: text("pixKey"),
  hiddenTabs: text("hiddenTabs").default("").notNull(),
  // Cards do dashboard OCULTADOS pelo próprio usuário (JSON array de widget IDs).
  // O efetivo é: permitidos(professor) \ ocultos(usuário).
  hiddenDashboardWidgets: text("hiddenDashboardWidgets").default("").notNull(),
  // 1 = mascarar valores financeiros no Dashboard e no Financeiro (por usuário)
  hideFinancialValues: integer("hideFinancialValues").default(0).notNull(),
  // Turnos personalizáveis da escola (JSON: [{name, start, end}]) — usados nas turmas
  shifts: text("shifts").default("").notNull(),
  // Regras de venda da Loja (JSON) — Configurações → Loja
  storeSalesRules: text("storeSalesRules").default("").notNull(),
  // ⭐ Avaliações de Professores: frequência dos ciclos + janela aberta (dias)
  professorEvalFrequency: varchar("professorEvalFrequency", { length: 20 }), // mensal | bimestral | trimestral | semestral
  professorEvalWindowDays: integer("professorEvalWindowDays"),
  // WhatsApp Bot integration (Fly.io)
  whatsappBotUrl: varchar("whatsappBotUrl", { length: 255 }).default("http://179.197.76.174:8080"),
  whatsappBotToken: text("whatsappBotToken").default("minha_chave_secreta_123"),
  whatsappAutoSend: integer("whatsappAutoSend").default(0).notNull(),
  // Chatbot (Robô de Autoatendimento WhatsApp)
  chatbotEnabled: integer("chatbotEnabled").default(0).notNull(),
  // Recepcionista Virtual (IA conversacional no WhatsApp)
  conversationalMode: integer("conversationalMode").default(1).notNull(),
  attendancePersonaName: varchar("attendancePersonaName", { length: 60 }),
  attendanceTone: varchar("attendanceTone", { length: 20 }), // 'amigavel' | 'formal' | 'direto'
  // Asaas Integration
  asaasApiKey: text("asaasApiKey"),
  asaasEnabled: integer("asaasEnabled").default(0).notNull(),
  // Mercado Pago Integration
  mpAccessToken: text("mpAccessToken"),
  // InfinitePay Integration (Checkout Integrado — Pix taxa zero / Cartão 12x)
  infinitepayHandle: varchar("infinitepayHandle", { length: 100 }), // InfiniteTag sem o "$"
  infinitepayApiKey: text("infinitepayApiKey"), // chave BYOK — criptografada em repouso (AES-256-GCM)
  infinitepayEnabled: integer("infinitepayEnabled").default(0).notNull(),
  paymentGateway: varchar("paymentGateway", { length: 20 }).default("asaas").notNull(),
  // AI Integration
  aiProvider: varchar("aiProvider", { length: 50 }).default("gemini"),
  geminiApiKey: varchar("geminiApiKey", { length: 255 }),
  geminiModel: varchar("geminiModel", { length: 255 }),
  groqApiKey: varchar("groqApiKey", { length: 255 }),
  groqModel: varchar("groqModel", { length: 255 }),
  opencodeApiKey: text("opencodeApiKey"),
  opencodeModel: varchar("opencodeModel", { length: 255 }),
  opencodeApiUrl: text("opencodeApiUrl"),
  // School Operating Hours
  schoolHours: text("schoolHours").default('{"monday":{"active":true,"start":"08:00","end":"18:00"},"tuesday":{"active":true,"start":"08:00","end":"18:00"},"wednesday":{"active":true,"start":"08:00","end":"18:00"},"thursday":{"active":true,"start":"08:00","end":"18:00"},"friday":{"active":true,"start":"08:00","end":"18:00"},"saturday":{"active":false,"start":"08:00","end":"12:00"},"sunday":{"active":false,"start":"08:00","end":"12:00"}}').notNull(),
  // Lesson Duration (minutos): 30, 45, 60, 90, 120
  lessonDuration: integer("lessonDuration").default(60).notNull(),
  // ZapSign Integration (Digital Contracts)
  zapsignApiKey: text("zapsignApiKey"),
  // Billing Engine (Juros e Multas)
  lateFeeEnabled: integer("lateFeeEnabled").default(1).notNull(),
  lateFeeType: varchar("lateFeeType", { length: 20 }).default("percentage").notNull(),
  lateFeeValue: decimal("lateFeeValue", { precision: 10, scale: 2 }).default("2.00").notNull(),
  interestEnabled: integer("interestEnabled").default(1).notNull(),
  interestType: varchar("interestType", { length: 20 }).default("daily").notNull(),
  interestRate: decimal("interestRate", { precision: 10, scale: 4 }).default("0.3300").notNull(),
  graceDays: integer("graceDays").default(3).notNull(),
  autoUpdateInvoice: integer("autoUpdateInvoice").default(1).notNull(),
  showFeeBreakdown: integer("showFeeBreakdown").default(1).notNull(),
  earlyDiscountEnabled: integer("earlyDiscountEnabled").default(0).notNull(),
  earlyDiscountType: varchar("earlyDiscountType", { length: 20 }).default("percentage").notNull(),
  earlyDiscountValue: decimal("earlyDiscountValue", { precision: 10, scale: 2 }).default("5.00").notNull(),
  earlyDiscountDays: integer("earlyDiscountDays").default(0).notNull(),
  // Antecipação Inteligente de Vagas por Falta (Desativado por padrão)
  autoAdvanceSlotsEnabled: integer("autoAdvanceSlotsEnabled").default(0).notNull(),
  autoAdvanceWhatsAppTemplate: text("autoAdvanceWhatsAppTemplate"),
  // Repertório: importação de cifra (só acordes, sem letra — RN-007). OFF = professores colam manualmente.
  cifraClubImportEnabled: integer("cifraClubImportEnabled").default(1).notNull(),
  // Presença Digital / QR Code de Recepção (Check-in momento e tolerância)
  attendanceCheckinMoment: varchar("attendanceCheckinMoment", { length: 20 }).default("inicio").notNull(), // 'inicio' | 'fim' | 'livre'
  attendanceToleranceMinutes: integer("attendanceToleranceMinutes").default(30).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
});

export const reminders = pgTable("reminders", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId"),
  userId: integer("userId").notNull(),
  studentId: integer("studentId"),
  lessonId: integer("lessonId"),
  paymentDueId: integer("paymentDueId"),
  templateId: integer("templateId"),
  type: reminderTypeEnum("type").default("manual").notNull(),
  message: text("message").notNull(),
  scheduledAt: timestamp("scheduledAt").notNull(),
  status: reminderStatusEnum("status").default("pendente").notNull(),
  autoGenerated: integer("autoGenerated").default(0).notNull(),
  sentAt: timestamp("sentAt"),
  cancelledAt: timestamp("cancelledAt"),
  refId: varchar("refId", { length: 200 }), // BUG-002 FIX: Aumentado de 100→200 para evitar truncamento em refIds longos (ex: auto-rule-{id}-lesson-{id}-{date})
  targetPhone: varchar("targetPhone", { length: 30 }),
  // WhatsApp Bot tracking
  externalMessageId: varchar("externalMessageId", { length: 255 }),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
}, (table) => [
  index("reminders_ref_id_idx").on(table.refId),
  index("reminders_organization_id_idx").on(table.organizationId),
  index("reminders_status_idx").on(table.status),
  index("reminders_scheduled_at_idx").on(table.scheduledAt),
]);

export const reminderTemplates = pgTable("reminder_templates", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId"),
  userId: integer("userId").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  type: reminderTypeEnum("type").default("manual").notNull(),
  body: text("body").notNull(),
  isDefault: integer("isDefault").default(0).notNull(),
  sendToStudent: boolean("sendToStudent").default(true).notNull(),
  sendToGuardian: boolean("sendToGuardian").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
});

export const paymentDues = pgTable("payment_dues", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId"),
  userId: integer("userId").notNull(),
  studentId: integer("studentId").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  dueDate: date("dueDate").notNull(),
  paidAt: timestamp("paidAt"),
  status: paymentDueStatusEnum("status").default("pendente").notNull(),
  month: integer("month").notNull(),
  year: integer("year").notNull(),
  notes: text("notes"),
  billingPeriodicity: varchar("billingPeriodicity", { length: 20 }).default("mensal"),
  // Asaas integration
  asaasId: text("asaasId"),
  asaasPaymentLink: text("asaasPaymentLink"),
  asaasBillingType: varchar("asaasBillingType", { length: 30 }), // PIX, CREDIT_CARD
  // Mercado Pago integration
  mpPaymentId: text("mpPaymentId"),
  mpPaymentLink: text("mpPaymentLink"),
  // InfinitePay integration (Checkout Integrado)
  infinitepayPaymentId: text("infinitepayPaymentId"), // transaction_nsu da transação paga
  infinitepayPaymentLink: text("infinitepayPaymentLink"), // URL do checkout hospedado
  infinitepaySlug: text("infinitepaySlug"), // invoice_slug (necessário no payment_check)
  receiptUrl: text("receiptUrl"),
  // Billing Engine cache/informative fields
  originalAmount: decimal("originalAmount", { precision: 10, scale: 2 }),
  lastCalculation: timestamp("lastCalculation"),
  daysOverdueCache: integer("daysOverdueCache"),
  updatedAmountCache: decimal("updatedAmountCache", { precision: 10, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
}, (table) => [
  index("payment_dues_student_id_idx").on(table.studentId),
  index("payment_dues_organization_id_idx").on(table.organizationId),
  index("payment_dues_status_idx").on(table.status),
  index("payment_dues_due_date_idx").on(table.dueDate),
  index("payment_dues_asaas_id_idx").on(table.asaasId),
  index("payment_dues_infinitepay_id_idx").on(table.infinitepayPaymentId),
]);

export const billingAuditLogs = pgTable("billing_audit_logs", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId"),
  invoiceId: integer("invoiceId").notNull(),
  originalAmount: decimal("originalAmount", { precision: 10, scale: 2 }).notNull(),
  lateFeeAmount: decimal("lateFeeAmount", { precision: 10, scale: 2 }).notNull(),
  interestAmount: decimal("interestAmount", { precision: 10, scale: 2 }).notNull(),
  daysOverdue: integer("daysOverdue").notNull(),
  updatedAmount: decimal("updatedAmount", { precision: 10, scale: 2 }).notNull(),
  userId: integer("userId"),
  origin: varchar("origin", { length: 50 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("billing_audit_logs_invoice_idx").on(table.invoiceId),
  index("billing_audit_logs_org_idx").on(table.organizationId),
]);

export const asaasCustomers = pgTable("asaas_customers", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId"),
  studentId: integer("studentId").notNull(),
  asaasCustomerId: text("asaasCustomerId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("asaas_customers_student_org_idx").on(table.studentId, table.organizationId),
]);

export const expenses = pgTable("expenses", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId"),
  userId: integer("userId").notNull(),
  description: varchar("description", { length: 255 }).notNull(),
  supplier: varchar("supplier", { length: 255 }),
  account: varchar("account", { length: 255 }),
  recurrence: varchar("recurrence", { length: 50 }).default("unica").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  date: date("date").notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  status: paymentDueStatusEnum("status").default("pendente").notNull(),
  receiptUrl: text("receiptUrl"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
});


export const studentGoals = pgTable("student_goals", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId"),
  userId: integer("userId").notNull(),
  studentId: integer("studentId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  status: goalStatusEnum("status").default("pendente").notNull(),
  targetDate: date("targetDate"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
});

export const studentTimeline = pgTable("student_timeline", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId"),
  userId: integer("userId").notNull(),
  studentId: integer("studentId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  category: timelineCategoryEnum("category").default("geral").notNull(),
  grade: decimal("grade", { precision: 3, scale: 1 }),
  achievedAt: timestamp("achievedAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const studentFiles = pgTable("student_files", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId"),
  userId: integer("userId").notNull(),
  studentId: integer("studentId").notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  fileType: varchar("fileType", { length: 100 }).notNull(),
  category: fileCategoryEnum("category").notNull(),
  folder: varchar("folder", { length: 100 }),
  fileUrl: text("fileUrl").notNull(),
  thumbnailUrl: text("thumbnailUrl"),
  comments: text("comments"),
  size: integer("size"),
  viewedAt: timestamp("viewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
});

export const fileComments = pgTable("file_comments", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId"),
  fileId: integer("fileId").notNull(),
  userId: integer("userId").notNull(), // can be student or professor
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const announcements = pgTable("announcements", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId"),
  userId: integer("userId").notNull(), // Author (Professor/Admin)
  targetStudentId: integer("targetStudentId"), // Null means "All students of this professor"
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  important: boolean("important").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId"),
  senderId: integer("senderId").notNull(),
  receiverId: integer("receiverId").notNull(),
  content: text("content").notNull(),
  isRead: boolean("isRead").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const rescheduleRequests = pgTable("reschedule_requests", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId"),
  studentId: integer("studentId").notNull(),
  lessonId: integer("lessonId").notNull(),
  reason: text("reason").notNull(),
  preferredDates: text("preferredDates").notNull(),
  status: rescheduleStatusEnum("status").default("pendente").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const studentEvolution = pgTable("student_evolution", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId"),
  studentId: integer("studentId").notNull(),
  technical: integer("technical").default(0).notNull(),
  rhythm: integer("rhythm").default(0).notNull(),
  harmony: integer("harmony").default(0).notNull(),
  reading: integer("reading").default(0).notNull(),
  recordedAt: timestamp("recordedAt").defaultNow().notNull(),
});

export const dailyStudyPlans = pgTable("daily_study_plans", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId"),
  studentId: integer("studentId").notNull(),
  teacherId: integer("teacherId").notNull(),
  planText: text("planText").notNull(),
  status: statusEnum("status").default("ativo").notNull(), // 'ativo', 'concluido' (we can reuse statusEnum or just use a boolean)
  publishedStatus: varchar("publishedStatus", { length: 20 }).default("rascunho").notNull(), // 'rascunho', 'publicado'
  daysCompleted: text("daysCompleted").default("[false,false,false,false,false]").notNull(), // JSON array
  daysTimeSpent: text("daysTimeSpent").default("[0,0,0,0,0]").notNull(), // Tempo gasto em segundos
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId"),
  userId: integer("userId").notNull(), // Receiver
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  type: varchar("type", { length: 50 }).default("info").notNull(), // 'info', 'warning', 'success', 'error'
  read: boolean("read").default(false).notNull(),
  actionUrl: text("actionUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Reminder = typeof reminders.$inferSelect;
export type InsertReminder = typeof reminders.$inferInsert;
export type ReminderTemplate = typeof reminderTemplates.$inferSelect;
export type InsertReminderTemplate = typeof reminderTemplates.$inferInsert;
export type PaymentDue = typeof paymentDues.$inferSelect;
export type InsertPaymentDue = typeof paymentDues.$inferInsert;

export type Settings = typeof settings.$inferSelect;
export type InsertSettings = typeof settings.$inferInsert;

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Instrument = typeof instruments.$inferSelect;
export type Student = typeof students.$inferSelect;
export type Lesson = typeof lessons.$inferSelect;
export type MonthlyStat = typeof monthlyStats.$inferSelect;

export type StudentGoal = typeof studentGoals.$inferSelect;
export type InsertStudentGoal = typeof studentGoals.$inferInsert;
export type StudentTimeline = typeof studentTimeline.$inferSelect;
export type InsertStudentTimeline = typeof studentTimeline.$inferInsert;
export type StudentFile = typeof studentFiles.$inferSelect;
export type InsertStudentFile = typeof studentFiles.$inferInsert;
export type FileComment = typeof fileComments.$inferSelect;
export type InsertFileComment = typeof fileComments.$inferInsert;

export type Announcement = typeof announcements.$inferSelect;
export type InsertAnnouncement = typeof announcements.$inferInsert;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = typeof chatMessages.$inferInsert;
export type RescheduleRequest = typeof rescheduleRequests.$inferSelect;
export type InsertRescheduleRequest = typeof rescheduleRequests.$inferInsert;

// PRD_AULA_EXTRA: solicitação de aula extra do portal do aluno (sem lessonId —
// não há aula origem; o professor aprova/recusa e agenda manualmente).
export const extraLessonRequests = pgTable("extra_lesson_requests", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId"),
  studentId: integer("studentId").notNull(),
  preferredDates: text("preferredDates").notNull(),
  reason: text("reason"),
  status: rescheduleStatusEnum("status").default("pendente").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ExtraLessonRequest = typeof extraLessonRequests.$inferSelect;
export type InsertExtraLessonRequest = typeof extraLessonRequests.$inferInsert;

export type DailyStudyPlan = typeof dailyStudyPlans.$inferSelect;
export type InsertDailyStudyPlan = typeof dailyStudyPlans.$inferInsert;

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = typeof organizations.$inferInsert;

export const aiConversations = pgTable("ai_conversations", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  userId: integer("userId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
});

export const aiDocuments = pgTable("ai_documents", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  userId: integer("userId").notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  fileType: varchar("fileType", { length: 50 }).notNull(),
  extractedText: text("extractedText").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const aiMessages = pgTable("ai_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversationId").notNull(),
  role: varchar("role", { length: 50 }).notNull(), // 'user', 'assistant', 'system'
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const chatbotSessions = pgTable("chatbot_sessions", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId"), // to link it if needed
  phone: varchar("phone", { length: 30 }).notNull().unique(),
  state: varchar("state", { length: 50 }).default("START").notNull(),
  data: text("data"), // JSON payload to store temporary information (e.g. chosen date)
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const chatbotFlows = pgTable("chatbot_flows", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  userId: integer("userId"),
  flowType: varchar("flowType", { length: 30 }).default("aluno").notNull(), // 'aluno' ou 'lead'
  name: varchar("name", { length: 100 }),
  welcomeMessage: text("welcomeMessage"),
  fallbackMessage: text("fallbackMessage"),
  humanMessage: text("humanMessage"),
  exitMessage: text("exitMessage"),
  options: text("options"), // JSON string array of options: [{ id, order, digit, title, icon, actionType, systemAction, customReply, isActive }]
  isActive: integer("isActive").default(1).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const chatbotLogs = pgTable("chatbot_logs", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  userId: integer("userId"),
  phone: varchar("phone", { length: 30 }).notNull(),
  userMessage: text("userMessage"),
  actionUsed: varchar("actionUsed", { length: 80 }),
  escalated: integer("escalated").default(0).notNull(),
  durationMs: integer("durationMs").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const schoolKnowledgeBase = pgTable("school_knowledge_base", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  userId: integer("userId"),
  title: varchar("title", { length: 150 }).notNull(),
  category: varchar("category", { length: 50 }).default("faq_geral").notNull(), // 'cursos_precos', 'politicas', 'localizacao', 'faq_geral', 'diferenciais'
  content: text("content").notNull(),
  isActive: integer("isActive").default(1).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AiConversation = typeof aiConversations.$inferSelect;
export type InsertAiConversation = typeof aiConversations.$inferInsert;
export type AiDocument = typeof aiDocuments.$inferSelect;
export type InsertAiDocument = typeof aiDocuments.$inferInsert;
export type AiMessage = typeof aiMessages.$inferSelect;
export type InsertAiMessage = typeof aiMessages.$inferInsert;
export type ChatbotSession = typeof chatbotSessions.$inferSelect;
export type InsertChatbotSession = typeof chatbotSessions.$inferInsert;
export type ChatbotFlow = typeof chatbotFlows.$inferSelect;
export type InsertChatbotFlow = typeof chatbotFlows.$inferInsert;
export type SchoolKnowledgeBase = typeof schoolKnowledgeBase.$inferSelect;
export type InsertSchoolKnowledgeBase = typeof schoolKnowledgeBase.$inferInsert;

export const fcmTokens = pgTable("fcm_tokens", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId"),
  userId: integer("userId").notNull(),
  token: text("token").notNull().unique(),
  deviceInfo: text("deviceInfo"), // e.g., "Chrome on Windows", "iPhone", etc.
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
});

export type FcmToken = typeof fcmTokens.$inferSelect;
export type InsertFcmToken = typeof fcmTokens.$inferInsert;

// ─── CONTRACTS (ZapSign + Assinafy) ──────────────────────────
export const contracts = pgTable("contracts", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId"),
  userId: integer("userId").notNull(),
  studentId: integer("studentId").notNull(),
  contractNumber: varchar("contractNumber", { length: 40 }),
  title: varchar("title", { length: 255 }).notNull(),
  status: contractStatusEnum("status").default("rascunho").notNull(),
  provider: varchar("provider", { length: 30 }).default("assinafy").notNull(),
  templateId: integer("templateId"),
  templateContentSnapshot: text("templateContentSnapshot"),
  monthlyFee: decimal("monthlyFee", { precision: 10, scale: 2 }),
  dueDay: integer("dueDay"),
  startDate: date("startDate"),
  endDate: date("endDate"),
  assinafyDocId: text("assinafyDocId"),
  assinafySignUrl: text("assinafySignUrl"),
  signedDocumentUrl: text("signedDocumentUrl"),
  signedAt: timestamp("signedAt"),
  sentAt: timestamp("sentAt"),
  cancelledAt: timestamp("cancelledAt"),
  expiresAt: timestamp("expiresAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
});

export type Contract = typeof contracts.$inferSelect;
export type InsertContract = typeof contracts.$inferInsert;

// ─── SCHOOL INTEGRATIONS (BYOK — chave por escola/provedor) ───
export const schoolIntegrations = pgTable("school_integrations", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  provider: integrationProviderEnum("provider").notNull(),
  apiKeyEncrypted: text("apiKeyEncrypted").notNull(),
  environment: integrationEnvironmentEnum("environment").default("production").notNull(),
  accountId: varchar("accountId", { length: 100 }),
  active: boolean("active").default(true).notNull(),
  lastConnectionTest: timestamp("lastConnectionTest"),
  connectionStatus: integrationConnectionStatusEnum("connectionStatus").default("disconnected").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("school_integrations_org_provider_idx").on(table.organizationId, table.provider),
]);

export type SchoolIntegration = typeof schoolIntegrations.$inferSelect;
export type InsertSchoolIntegration = typeof schoolIntegrations.$inferInsert;

// ─── CONTRACT TEMPLATES (modelos por escola) ──────────────────
export const contractTemplates = pgTable("contract_templates", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  content: text("content").notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
});

export type ContractTemplate = typeof contractTemplates.$inferSelect;
export type InsertContractTemplate = typeof contractTemplates.$inferInsert;

// ─── CONTRACT EVENTS (histórico + idempotência de webhook) ────
export const contractEvents = pgTable("contract_events", {
  id: serial("id").primaryKey(),
  contractId: integer("contractId").notNull(),
  provider: varchar("provider", { length: 30 }).default("assinafy").notNull(),
  providerEventId: varchar("providerEventId", { length: 100 }),
  eventType: varchar("eventType", { length: 100 }).notNull(),
  description: text("description"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("contract_events_provider_event_idx").on(table.provider, table.providerEventId),
]);

export type ContractEvent = typeof contractEvents.$inferSelect;
export type InsertContractEvent = typeof contractEvents.$inferInsert;

// ─── PROFESSOR PAYMENTS (Monthly Payroll) ─────────────────────
export const professorPayments = pgTable("professor_payments", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId"),
  professorId: integer("professorId").notNull(),
  month: integer("month").notNull(),
  year: integer("year").notNull(),
  totalClasses: integer("totalClasses").default(0).notNull(),
  totalMinutes: integer("totalMinutes").default(0).notNull(),
  totalCredits: decimal("totalCredits", { precision: 10, scale: 2 }).default("0.00").notNull(),
  totalDebits: decimal("totalDebits", { precision: 10, scale: 2 }).default("0.00").notNull(),
  totalAmount: decimal("totalAmount", { precision: 10, scale: 2 }).default("0.00").notNull(),
  status: professorPaymentStatusEnum("status").default("aberto").notNull(),
  approvedAt: timestamp("approvedAt"),
  paidAt: timestamp("paidAt"),
  notes: text("notes"),
  adjustments: text("adjustments"), // JSON array of manual adjustments: [{desc: string, value: number}]
  // ── PRD Regras de Cobrança: snapshot da regra usada + memória do cálculo ──
  ruleSnapshot: jsonb("ruleSnapshot"),
  calculationMemory: jsonb("calculationMemory"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
});

export type ProfessorPayment = typeof professorPayments.$inferSelect;

// ═══════════════════════════════════════════════════════════════════════════════
// REGRAS DE COBRANÇA DE PROFESSORES (PRD Regras de Cobrança)
// Motor de remuneração versionado: cada save cria uma NOVA versão (startDate)
// e fecha a anterior (endDate). A folha usa a regra VIGENTE no período e guarda
// snapshot + memória de cálculo no professor_payments (folhas fechadas imutáveis).
// ═══════════════════════════════════════════════════════════════════════════════

export const teacherPaymentRules = pgTable("teacher_payment_rules", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  // NULL = regra PADRÃO da escola (isSchoolDefault = true)
  teacherId: integer("teacherId"),
  name: varchar("name", { length: 120 }).notNull(),
  // por_aula | percentual | fixo_mensal | hibrido
  ruleType: varchar("ruleType", { length: 20 }).notNull(),
  fixedAmount: decimal("fixedAmount", { precision: 10, scale: 2 }).default("0.00").notNull(),
  amountPerClass: decimal("amountPerClass", { precision: 10, scale: 2 }).default("0.00").notNull(),
  percentage: decimal("percentage", { precision: 5, scale: 2 }).default("0.00").notNull(),
  // bruto | recebido | liquido | manual
  calculationBase: varchar("calculationBase", { length: 20 }).default("bruto").notNull(),
  manualBaseAmount: decimal("manualBaseAmount", { precision: 10, scale: 2 }).default("0.00").notNull(),
  // semanal | quinzenal | mensal
  closingPeriod: varchar("closingPeriod", { length: 20 }).default("mensal").notNull(),
  closingDay: integer("closingDay").default(30).notNull(),
  paymentDay: integer("paymentDay").default(5).notNull(),
  paymentDaysAfter: integer("paymentDaysAfter").default(0).notNull(),
  isSchoolDefault: boolean("isSchoolDefault").default(false).notNull(),
  active: boolean("active").default(true).notNull(),
  startDate: timestamp("startDate").notNull(),
  endDate: timestamp("endDate"),
  createdByUserId: integer("createdByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
}, (table) => [
  index("teacher_payment_rules_teacher_idx").on(table.teacherId, table.startDate),
]);

export type TeacherPaymentRule = typeof teacherPaymentRules.$inferSelect;
export type InsertTeacherPaymentRule = typeof teacherPaymentRules.$inferInsert;

/** Condições por tipo de aula/falta/cancelamento (uma linha por condição da regra). */
export const teacherPaymentRuleConditions = pgTable("teacher_payment_rule_conditions", {
  id: serial("id").primaryKey(),
  ruleId: integer("ruleId").notNull(),
  // aula_realizada|aula_reposicao|aula_experimental|aula_gratuita|aula_extra|aula_avulsa|
  // falta_aluno|falta_professor|cancelamento_aluno|cancelamento_escola
  conditionType: varchar("conditionType", { length: 40 }).notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  // remunerar|nao_remunerar|parcial|descontar|exigir_reposicao|valor_diferente|gerar_reposicao
  action: varchar("action", { length: 30 }).default("remunerar").notNull(),
  percentage: decimal("percentage", { precision: 5, scale: 2 }).default("0.00").notNull(),
  fixedAmount: decimal("fixedAmount", { precision: 10, scale: 2 }).default("0.00").notNull(),
  // antecedência mínima em horas (cancelamento_aluno)
  minHours: integer("minHours"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
}, (table) => [
  index("teacher_payment_rule_conditions_rule_idx").on(table.ruleId),
]);

export type TeacherPaymentRuleCondition = typeof teacherPaymentRuleConditions.$inferSelect;
export type InsertTeacherPaymentRuleCondition = typeof teacherPaymentRuleConditions.$inferInsert;

/** Regras específicas por INSTRUMENTO (cursos são mapeados para instrumentos).
 * Prioridade: regra do instrumento > regra geral da professora. */
export const teacherPaymentRuleCourses = pgTable("teacher_payment_rule_courses", {
  id: serial("id").primaryKey(),
  ruleId: integer("ruleId").notNull(),
  instrumentId: integer("instrumentId").notNull(),
  ruleType: varchar("ruleType", { length: 20 }).notNull(), // por_aula|percentual|fixo_mensal|hibrido
  amountPerClass: decimal("amountPerClass", { precision: 10, scale: 2 }).default("0.00").notNull(),
  percentage: decimal("percentage", { precision: 5, scale: 2 }).default("0.00").notNull(),
  fixedAmount: decimal("fixedAmount", { precision: 10, scale: 2 }).default("0.00").notNull(),
  startDate: timestamp("startDate").notNull(),
  endDate: timestamp("endDate"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("teacher_payment_rule_courses_rule_idx").on(table.ruleId),
]);

export type TeacherPaymentRuleCourse = typeof teacherPaymentRuleCourses.$inferSelect;
export type InsertTeacherPaymentRuleCourse = typeof teacherPaymentRuleCourses.$inferInsert;
export type InsertProfessorPayment = typeof professorPayments.$inferInsert;

// ─── ATTENDANCE TOKENS (QR Code Presence) ─────────────────────
export const attendanceTokens = pgTable("attendance_tokens", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId"),
  token: varchar("token", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AttendanceToken = typeof attendanceTokens.$inferSelect;
export type InsertAttendanceToken = typeof attendanceTokens.$inferInsert;

export const attendanceLogs = pgTable("attendance_logs", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId"),
  userId: integer("userId").notNull(),
  lessonId: integer("lessonId"),
  tokenId: integer("tokenId").notNull(),
  scannedAt: timestamp("scannedAt").defaultNow().notNull(),
});

export type AttendanceLog = typeof attendanceLogs.$inferSelect;
export type InsertAttendanceLog = typeof attendanceLogs.$inferInsert;

// ─── MESSAGE AUTOMATION RULES ─────────────────────────────────────────────────
export const messageAutomationRules = pgTable("message_automation_rules", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId"),
  userId: integer("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  isSystem: integer("isSystem").default(0).notNull(),    // 1 = native rule, 0 = custom
  isActive: integer("isActive").default(1).notNull(),
  trigger: varchar("trigger", { length: 100 }).notNull(), // payment_due | payment_overdue | lesson_scheduled | birthday | student_inactive | payment_confirmed | new_student | contract_expiring
  offsetDays: integer("offsetDays").default(0).notNull(), // negative = before, positive = after
  offsetHours: integer("offsetHours").default(0).notNull(),
  // Unidade do valor para contratos (contract_expiring): 'meses' | 'aulas'
  triggerUnit: varchar("triggerUnit", { length: 10 }).default("meses").notNull(),
  conditions: text("conditions"),                         // JSON: [{field, operator, value}]
  actions: text("actions"),                               // JSON: [{type: 'whatsapp'|'notification'|'task'}]
  messageTemplate: text("messageTemplate").notNull(),
  channel: varchar("channel", { length: 50 }).default("whatsapp").notNull(),
  sendToStudent: integer("sendToStudent").default(1).notNull(), // 1 = true, 0 = false (sqlite style boolean mapping for pg)
  sendToGuardian: integer("sendToGuardian").default(0).notNull(),
  totalSent: integer("totalSent").default(0).notNull(),
  lastExecutedAt: timestamp("lastExecutedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
});

export type MessageAutomationRule = typeof messageAutomationRules.$inferSelect;
export type InsertMessageAutomationRule = typeof messageAutomationRules.$inferInsert;

// ─── SUPORTE / CHAMADOS (bugs e melhorias reportados pelas escolas) ──────────
export const supportTickets = pgTable("support_tickets", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId"),
  userId: integer("userId").notNull(), // autor do chamado
  // bug | melhoria | duvida | outro
  category: varchar("category", { length: 20 }).default("melhoria").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  // página/URL onde ocorreu (contexto para o suporte)
  pageUrl: varchar("pageUrl", { length: 500 }),
  // aberto | em_andamento | resolvido | fechado
  status: varchar("status", { length: 20 }).default("aberto").notNull(),
  // baixa | media | alta
  priority: varchar("priority", { length: 10 }).default("media").notNull(),
  adminResponse: text("adminResponse"),
  // Anexos (imagens) — JSON array de URLs
  attachments: text("attachments"),
  // true quando o SuperAdmin responde e o cliente ainda não viu (badge/pulso no header)
  hasUnreadResponse: boolean("hasUnreadResponse").default(false).notNull(),
  resolvedAt: timestamp("resolvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
}, (table) => [
  index("support_tickets_org_idx").on(table.organizationId),
  index("support_tickets_status_idx").on(table.status),
]);

export type SupportTicket = typeof supportTickets.$inferSelect;
export type InsertSupportTicket = typeof supportTickets.$inferInsert;

// ─── SYSTEM PLANS & COUPONS (SUPER ADMIN) ─────────────────────
export const systemPlans = pgTable("system_plans", {
  id: varchar("id", { length: 50 }).primaryKey(), // e.g. "10alunos", "basico"
  name: varchar("name", { length: 100 }).notNull(),
  priceMonthly: decimal("price_monthly").notNull(),
  priceYearly: decimal("price_yearly").notNull(),
  maxStudents: integer("max_students").notNull(),
  features: text("features").default("[]").notNull(), // JSON array
  isActive: boolean("is_active").default(true).notNull(),
  showOnLanding: boolean("show_on_landing").default(true).notNull(),
  isPopular: boolean("is_popular").default(false).notNull(),
  order: integer("order").default(0).notNull(),
  allowExtraStudents: boolean("allow_extra_students").default(true).notNull(),
  extraStudentPrice: decimal("extra_student_price").default("1.49").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
});

export type SystemPlan = typeof systemPlans.$inferSelect;
export type InsertSystemPlan = typeof systemPlans.$inferInsert;

export const systemCoupons = pgTable("system_coupons", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  discountType: varchar("discount_type", { length: 20 }).notNull(), // 'PERCENTAGE' | 'FIXED'
  discountValue: decimal("discount_value").notNull(),
  durationMonths: integer("duration_months"), // null = vitalicio
  maxUses: integer("max_uses"),
  currentUses: integer("current_uses").default(0).notNull(),
  validUntil: timestamp("valid_until"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SystemCoupon = typeof systemCoupons.$inferSelect;
export type InsertSystemCoupon = typeof systemCoupons.$inferInsert;

// --- Marketing Tables ---

export const marketingCampaigns = pgTable("marketing_campaigns", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  mediaUrl: text("mediaUrl"),
  status: campaignStatusEnum("status").default("draft").notNull(),
  
  // Settings
  minDelay: integer("minDelay").default(10).notNull(), // Intervalo fixo (segundos)
  maxDelay: integer("maxDelay").default(20).notNull(), // Intervalo máximo (mantido para compatibilidade, mas ignoraremos variação)
  batchSize: integer("batchSize").default(20).notNull(),
  batchDelay: integer("batchDelay").default(600).notNull(), // Segundos
  
  // Stats cache
  totalContacts: integer("totalContacts").default(0).notNull(),
  sentCount: integer("sentCount").default(0).notNull(),
  failedCount: integer("failedCount").default(0).notNull(),
  consecutiveErrors: integer("consecutiveErrors").default(0).notNull(),
  
  createdBy: integer("createdBy").notNull(), // User ID
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
});

export const marketingContacts = pgTable("marketing_contacts", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  campaignId: integer("campaignId").notNull().references(() => marketingCampaigns.id, { onDelete: "cascade" }),
  
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 50 }).notNull(), // WhatsApp format
  
  // Custom Variables ({{empresa}}, {{cidade}}, etc.)
  variables: jsonb("variables"), 
  
  messageText: text("messageText").notNull(), // The compiled message or raw template
  
  status: campaignContactStatusEnum("status").default("pending").notNull(),
  errorMessage: text("errorMessage"),
  evolutionMessageId: varchar("evolutionMessageId", { length: 255 }),
  
  processedAt: timestamp("processedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const marketingJobs = pgTable("marketing_jobs", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  campaignId: integer("campaignId").notNull().references(() => marketingCampaigns.id, { onDelete: "cascade" }),
  
  status: jobStatusEnum("status").default("pending").notNull(),
  lockedAt: timestamp("lockedAt"),
  lockedBy: varchar("lockedBy", { length: 255 }), // Worker ID or instance ID
  
  lastProcessedContactId: integer("lastProcessedContactId"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
});

export const marketingLogs = pgTable("marketing_logs", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  campaignId: integer("campaignId").notNull().references(() => marketingCampaigns.id, { onDelete: "cascade" }),
  contactId: integer("contactId").references(() => marketingContacts.id, { onDelete: "set null" }),
  
  level: varchar("level", { length: 50 }).notNull(), // info, error, warning
  message: text("message").notNull(),
  payload: jsonb("payload"),
  response: jsonb("response"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MarketingCampaign = typeof marketingCampaigns.$inferSelect;
export type InsertMarketingCampaign = typeof marketingCampaigns.$inferInsert;
export type MarketingContact = typeof marketingContacts.$inferSelect;
export type InsertMarketingContact = typeof marketingContacts.$inferInsert;
export type MarketingJob = typeof marketingJobs.$inferSelect;
export type InsertMarketingJob = typeof marketingJobs.$inferInsert;
export type MarketingLog = typeof marketingLogs.$inferSelect;
export type InsertMarketingLog = typeof marketingLogs.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// MusicPro Analytics — Tabelas de Rastreamento e Métricas
// ─────────────────────────────────────────────────────────────────────────────

export const deviceTypeEnum = pgEnum('device_type', ['desktop', 'tablet', 'mobile', 'tv', 'unknown']);
export const analyticsEventNameEnum = pgEnum('analytics_event_name', [
  'page_view', 'session_start', 'session_end', 'button_click', 'link_click',
  'signup_started', 'signup_completed', 'trial_started', 'trial_finished',
  'login', 'logout', 'plan_selected', 'checkout_started', 'pix_generated',
  'payment_success', 'payment_failed', 'subscription_created', 'subscription_cancelled',
  'email_open', 'email_click', 'whatsapp_click', 'video_play', 'video_finish',
  'download', 'upload', 'form_submit', 'search', 'feature_used', 'error', 'api_error',
  'scroll_depth', 'heatmap_click', 'heatmap_move', 'web_vital',
]);

// ── Visitantes únicos (por fingerprint/cookie anônimo) ────────────────────────
export const analyticsVisitors = pgTable("analytics_visitors", {
  id: serial("id").primaryKey(),
  visitorId: varchar("visitor_id", { length: 64 }).notNull().unique(), // UUID do localStorage
  fingerprint: varchar("fingerprint", { length: 128 }),
  firstSeenAt: timestamp("first_seen_at").defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  totalSessions: integer("total_sessions").default(1).notNull(),
  totalEvents: integer("total_events").default(0).notNull(),
  country: varchar("country", { length: 100 }),
  state: varchar("state", { length: 100 }),
  city: varchar("city", { length: 100 }),
  deviceType: deviceTypeEnum("device_type").default("unknown"),
}, (table) => [
  index("analytics_visitors_visitor_id_idx").on(table.visitorId),
  index("analytics_visitors_first_seen_idx").on(table.firstSeenAt),
  index("analytics_visitors_country_idx").on(table.country),
]);

// ── Sessões de navegação ───────────────────────────────────────────────────────
export const analyticsSessions = pgTable("analytics_sessions", {
  id: serial("id").primaryKey(),
  sessionId: varchar("session_id", { length: 64 }).notNull().unique(),
  visitorId: varchar("visitor_id", { length: 64 }).notNull(),
  userId: integer("user_id"),       // null se visitante anônimo
  organizationId: integer("organization_id"),

  // Geo (via Cloudflare headers ou IP-api)
  ipMasked: varchar("ip_masked", { length: 20 }), // ex: 189.28.*.*
  country: varchar("country", { length: 100 }),
  state: varchar("state", { length: 100 }),
  city: varchar("city", { length: 100 }),
  language: varchar("language", { length: 20 }),
  timezone: varchar("timezone", { length: 60 }),

  // Dispositivo
  deviceType: deviceTypeEnum("device_type").default("unknown"),
  os: varchar("os", { length: 80 }),
  browser: varchar("browser", { length: 80 }),
  screenRes: varchar("screen_res", { length: 20 }),
  userAgent: text("user_agent"),

  // Origem
  referrer: text("referrer"),
  utmSource: varchar("utm_source", { length: 100 }),
  utmMedium: varchar("utm_medium", { length: 100 }),
  utmCampaign: varchar("utm_campaign", { length: 100 }),
  utmContent: varchar("utm_content", { length: 100 }),
  utmTerm: varchar("utm_term", { length: 100 }),

  // Métricas da sessão
  startedAt: timestamp("started_at").defaultNow().notNull(),
  endedAt: timestamp("ended_at"),
  durationSec: integer("duration_sec"),
  pageCount: integer("page_count").default(1).notNull(),
  isBounce: boolean("is_bounce").default(true).notNull(),
}, (table) => [
  index("analytics_sessions_session_id_idx").on(table.sessionId),
  index("analytics_sessions_visitor_id_idx").on(table.visitorId),
  index("analytics_sessions_started_at_idx").on(table.startedAt),
  index("analytics_sessions_utm_source_idx").on(table.utmSource),
  index("analytics_sessions_utm_campaign_idx").on(table.utmCampaign),
  index("analytics_sessions_country_idx").on(table.country),
]);

// ── Todos os eventos rastreados ────────────────────────────────────────────────
export const analyticsEvents = pgTable("analytics_events", {
  id: serial("id").primaryKey(),
  sessionId: varchar("session_id", { length: 64 }).notNull(),
  visitorId: varchar("visitor_id", { length: 64 }).notNull(),
  userId: integer("user_id"),

  // Evento
  eventName: analyticsEventNameEnum("event_name").notNull(),
  pageUrl: text("page_url"),
  pageTitle: varchar("page_title", { length: 255 }),
  referrer: text("referrer"),

  // Elemento (para button_click, link_click)
  elementId: varchar("element_id", { length: 100 }),
  elementText: varchar("element_text", { length: 255 }),
  elementTag: varchar("element_tag", { length: 30 }),

  // UTMs (copiados da sessão para facilitar queries diretas)
  utmSource: varchar("utm_source", { length: 100 }),
  utmMedium: varchar("utm_medium", { length: 100 }),
  utmCampaign: varchar("utm_campaign", { length: 100 }),
  utmContent: varchar("utm_content", { length: 100 }),
  utmTerm: varchar("utm_term", { length: 100 }),

  // Geo e Device
  country: varchar("country", { length: 100 }),
  state: varchar("state", { length: 100 }),
  city: varchar("city", { length: 100 }),
  deviceType: deviceTypeEnum("device_type").default("unknown"),
  os: varchar("os", { length: 80 }),
  browser: varchar("browser", { length: 80 }),
  screenRes: varchar("screen_res", { length: 20 }),

  // Valor financeiro (para payment_success, etc.)
  value: decimal("value", { precision: 10, scale: 2 }),

  // Dados extras (JSON livre)
  metadata: jsonb("metadata"),

  // Métricas de tempo
  timeOnPageSec: integer("time_on_page_sec"),
  scrollDepth: integer("scroll_depth"), // percentual 0-100

  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("analytics_events_event_name_idx").on(table.eventName),
  index("analytics_events_created_at_idx").on(table.createdAt),
  index("analytics_events_session_id_idx").on(table.sessionId),
  index("analytics_events_visitor_id_idx").on(table.visitorId),
  index("analytics_events_utm_campaign_idx").on(table.utmCampaign),
  index("analytics_events_event_date_idx").on(table.eventName, table.createdAt),
  index("analytics_events_page_url_idx").on(table.pageUrl),
  index("analytics_events_country_idx").on(table.country),
]);

// ── Dados de Heatmap (cliques e movimentos por página) ────────────────────────
export const analyticsHeatmap = pgTable("analytics_heatmap", {
  id: serial("id").primaryKey(),
  sessionId: varchar("session_id", { length: 64 }).notNull(),
  pageUrl: text("page_url").notNull(),
  pageUrlNormalized: varchar("page_url_normalized", { length: 255 }).notNull(), // sem query params

  // Coordenadas relativas (0-100%)
  xPercent: decimal("x_percent", { precision: 5, scale: 2 }).notNull(),
  yPercent: decimal("y_percent", { precision: 5, scale: 2 }).notNull(),

  eventType: varchar("event_type", { length: 20 }).notNull(), // click | move | scroll

  // Viewport (para normalização)
  viewportW: integer("viewport_w"),
  viewportH: integer("viewport_h"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("analytics_heatmap_page_url_idx").on(table.pageUrlNormalized),
  index("analytics_heatmap_event_type_idx").on(table.eventType),
  index("analytics_heatmap_created_at_idx").on(table.createdAt),
]);

// ── Usuários Online (TTL: 2min sem ping = offline) ────────────────────────────
export const analyticsOnline = pgTable("analytics_online", {
  sessionId: varchar("session_id", { length: 64 }).primaryKey(),
  visitorId: varchar("visitor_id", { length: 64 }).notNull(),
  userId: integer("user_id"),
  userName: varchar("user_name", { length: 255 }),

  pageUrl: text("page_url"),
  pageTitle: varchar("page_title", { length: 255 }),

  country: varchar("country", { length: 100 }),
  state: varchar("state", { length: 100 }),
  city: varchar("city", { length: 100 }),

  deviceType: deviceTypeEnum("device_type").default("unknown"),
  browser: varchar("browser", { length: 80 }),
  os: varchar("os", { length: 80 }),
  screenRes: varchar("screen_res", { length: 20 }),

  utmSource: varchar("utm_source", { length: 100 }),
  referrer: text("referrer"),
  ipMasked: varchar("ip_masked", { length: 20 }),

  enteredAt: timestamp("entered_at").defaultNow().notNull(),
  lastPingAt: timestamp("last_ping_at").defaultNow().notNull(),
}, (table) => [
  index("analytics_online_last_ping_idx").on(table.lastPingAt),
  index("analytics_online_visitor_id_idx").on(table.visitorId),
]);

// ── Estatísticas agregadas por página ─────────────────────────────────────────
export const analyticsPages = pgTable("analytics_pages", {
  id: serial("id").primaryKey(),
  pageUrlNormalized: varchar("page_url_normalized", { length: 500 }).notNull(),
  pageTitle: varchar("page_title", { length: 255 }),
  date: date("date").notNull(), // agrega por dia

  totalViews: integer("total_views").default(0).notNull(),
  uniqueVisitors: integer("unique_visitors").default(0).notNull(),
  avgTimeOnPageSec: integer("avg_time_on_page_sec").default(0).notNull(),
  bounces: integer("bounces").default(0).notNull(),
  exits: integer("exits").default(0).notNull(),
  conversions: integer("conversions").default(0).notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdateFn(() => new Date()).notNull(),
}, (table) => [
  index("analytics_pages_url_date_idx").on(table.pageUrlNormalized, table.date),
  index("analytics_pages_date_idx").on(table.date),
]);

// ── Funil de Conversão (etapas) ───────────────────────────────────────────────
export const analyticsConversions = pgTable("analytics_conversions", {
  id: serial("id").primaryKey(),
  sessionId: varchar("session_id", { length: 64 }).notNull(),
  visitorId: varchar("visitor_id", { length: 64 }).notNull(),
  userId: integer("user_id"),

  // Etapas alcançadas (booleano por etapa)
  reachedLanding: boolean("reached_landing").default(false).notNull(),
  reachedSignupStart: boolean("reached_signup_start").default(false).notNull(),
  reachedSignupComplete: boolean("reached_signup_complete").default(false).notNull(),
  reachedTrialStart: boolean("reached_trial_start").default(false).notNull(),
  reachedPlanSelect: boolean("reached_plan_select").default(false).notNull(),
  reachedCheckout: boolean("reached_checkout").default(false).notNull(),
  reachedPixGenerated: boolean("reached_pix_generated").default(false).notNull(),
  reachedPayment: boolean("reached_payment").default(false).notNull(),
  reachedFirstLogin: boolean("reached_first_login").default(false).notNull(),

  utmSource: varchar("utm_source", { length: 100 }),
  utmCampaign: varchar("utm_campaign", { length: 100 }),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdateFn(() => new Date()).notNull(),
}, (table) => [
  index("analytics_conversions_session_id_idx").on(table.sessionId),
  index("analytics_conversions_created_at_idx").on(table.createdAt),
  index("analytics_conversions_utm_campaign_idx").on(table.utmCampaign),
]);

// ── Espelho de Receita para Analytics ─────────────────────────────────────────
export const analyticsRevenue = pgTable("analytics_revenue", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull(),
  sessionId: varchar("session_id", { length: 64 }),
  visitorId: varchar("visitor_id", { length: 64 }),
  userId: integer("user_id"),

  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  planId: varchar("plan_id", { length: 50 }),
  planName: varchar("plan_name", { length: 100 }),

  utmSource: varchar("utm_source", { length: 100 }),
  utmMedium: varchar("utm_medium", { length: 100 }),
  utmCampaign: varchar("utm_campaign", { length: 100 }),

  country: varchar("country", { length: 100 }),
  state: varchar("state", { length: 100 }),
  city: varchar("city", { length: 100 }),

  type: varchar("type", { length: 50 }).default("subscription").notNull(), // subscription | one_time
  asaasPaymentId: varchar("asaas_payment_id", { length: 100 }),

  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("analytics_revenue_created_at_idx").on(table.createdAt),
  index("analytics_revenue_org_id_idx").on(table.organizationId),
  index("analytics_revenue_utm_campaign_idx").on(table.utmCampaign),
  index("analytics_revenue_state_idx").on(table.state),
]);

// ── Campanhas UTM (agregação) ─────────────────────────────────────────────────
export const analyticsCampaigns = pgTable("analytics_campaigns", {
  id: serial("id").primaryKey(),
  utmSource: varchar("utm_source", { length: 100 }).notNull(),
  utmMedium: varchar("utm_medium", { length: 100 }),
  utmCampaign: varchar("utm_campaign", { length: 100 }).notNull(),
  utmContent: varchar("utm_content", { length: 100 }),
  utmTerm: varchar("utm_term", { length: 100 }),

  // Investimento (manual, informado pelo usuário)
  investment: decimal("investment", { precision: 10, scale: 2 }).default("0.00"),

  // Métricas calculadas (cache)
  totalVisits: integer("total_visits").default(0).notNull(),
  totalLeads: integer("total_leads").default(0).notNull(),
  totalConversions: integer("total_conversions").default(0).notNull(),
  totalRevenue: decimal("total_revenue", { precision: 10, scale: 2 }).default("0.00"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdateFn(() => new Date()).notNull(),
}, (table) => [
  index("analytics_campaigns_utm_campaign_idx").on(table.utmCampaign),
  index("analytics_campaigns_utm_source_idx").on(table.utmSource),
]);

// ── Relatórios agendados ──────────────────────────────────────────────────────
export const analyticsReports = pgTable("analytics_reports", {
  id: serial("id").primaryKey(),
  type: varchar("type", { length: 50 }).notNull(), // daily | weekly | monthly | annual
  period: varchar("period", { length: 30 }).notNull(), // ex: 2025-07-28
  status: varchar("status", { length: 30 }).default("pending").notNull(),

  // Snapshot JSON do relatório
  data: jsonb("data"),

  emailSentTo: text("email_sent_to"),
  emailSentAt: timestamp("email_sent_at"),

  generatedAt: timestamp("generated_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Insights gerados por IA ────────────────────────────────────────────────────
export const analyticsAiInsights = pgTable("analytics_ai_insights", {
  id: serial("id").primaryKey(),
  insightType: varchar("insight_type", { length: 50 }).notNull(), // growth | drop | campaign | revenue | churn | behavior
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  severity: varchar("severity", { length: 20 }).default("info").notNull(), // info | warning | success | critical
  recommendation: text("recommendation"),
  metricRef: varchar("metric_ref", { length: 100 }),
  metricValue: decimal("metric_value", { precision: 10, scale: 2 }),

  generatedAt: timestamp("generated_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"),
  isRead: boolean("is_read").default(false).notNull(),
}, (table) => [
  index("analytics_ai_insights_generated_at_idx").on(table.generatedAt),
  index("analytics_ai_insights_type_idx").on(table.insightType),
]);

// ── Security & Audit Logs ───────────────────────────────────────────────────
export const analyticsSecurityLogs = pgTable("analytics_security_logs", {
  id: serial("id").primaryKey(),
  ip: varchar("ip", { length: 45 }).notNull(),
  route: text("route").notNull(),
  method: varchar("method", { length: 10 }).notNull(),
  statusCode: integer("status_code").default(200).notNull(),
  eventCategory: varchar("event_category", { length: 50 }).notNull(), // 'access' | 'blocked_rate_limit' | 'unauthorized' | 'bot_scanner' | 'brute_force'
  severity: varchar("severity", { length: 20 }).default("info").notNull(), // 'info' | 'low' | 'medium' | 'high' | 'critical'
  userAgent: text("user_agent"),
  referer: text("referer"),
  userId: integer("user_id"),
  organizationId: integer("organization_id"),
  details: text("details"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("analytics_security_logs_ip_idx").on(table.ip),
  index("analytics_security_logs_created_at_idx").on(table.createdAt),
  index("analytics_security_logs_category_idx").on(table.eventCategory),
  index("analytics_security_logs_severity_idx").on(table.severity),
]);

// ── Types exportados ──────────────────────────────────────────────────────────
export type AnalyticsVisitor = typeof analyticsVisitors.$inferSelect;
export type InsertAnalyticsVisitor = typeof analyticsVisitors.$inferInsert;
export type AnalyticsSession = typeof analyticsSessions.$inferSelect;
export type InsertAnalyticsSession = typeof analyticsSessions.$inferInsert;
export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
export type InsertAnalyticsEvent = typeof analyticsEvents.$inferInsert;
export type AnalyticsHeatmap = typeof analyticsHeatmap.$inferSelect;
export type InsertAnalyticsHeatmap = typeof analyticsHeatmap.$inferInsert;
export type AnalyticsOnline = typeof analyticsOnline.$inferSelect;
export type InsertAnalyticsOnline = typeof analyticsOnline.$inferInsert;
export type AnalyticsRevenue = typeof analyticsRevenue.$inferSelect;
export type InsertAnalyticsRevenue = typeof analyticsRevenue.$inferInsert;
export type AnalyticsAiInsight = typeof analyticsAiInsights.$inferSelect;
export type InsertAnalyticsAiInsight = typeof analyticsAiInsights.$inferInsert;
export type AnalyticsSecurityLog = typeof analyticsSecurityLogs.$inferSelect;
export type InsertAnalyticsSecurityLog = typeof analyticsSecurityLogs.$inferInsert;

// ── CRM / Funil de Vendas & Dashboard Comercial ─────────────────────────────
export const crmLeads = pgTable("crm_leads", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull(),
  name: text("name").notNull(),
  companyOrSchool: text("company_or_school"),
  cityState: text("city_state"), // ex: 'São Paulo - SP'
  phone: text("phone"),
  email: text("email"),
  birthDate: varchar("birth_date", { length: 20 }),
  instrument: text("instrument"),
  course: text("course"),
  level: text("level"), // 'Iniciante' | 'Intermediário' | 'Avançado'
  modality: text("modality"), // 'Presencial' | 'Online' | 'Híbrido'
  preferredTeacherId: integer("preferred_teacher_id"),
  planName: text("plan_name").default("Plano Pro"),
  stage: text("stage").notNull().default("novo"), // 'novo' | 'primeiro_contato' | 'em_conversa' | 'aula_experimental' | 'proposta' | 'aguardando_decisao' | 'matriculado' | 'perdido'
  temperature: text("temperature").default("morno"), // 'quente' | 'morno' | 'frio'
  priority: text("priority").default("media"), // 'alta' | 'media' | 'baixa'
  conversionProbability: integer("conversion_probability").default(50),
  expectedEnrollmentDate: timestamp("expected_enrollment_date"),
  firstContactAt: timestamp("first_contact_at"),
  lastContactAt: timestamp("last_contact_at"),
  nextFollowUpAt: timestamp("next_follow_up_at"),
  value: decimal("value", { precision: 10, scale: 2 }).default("0.00"),
  notes: text("notes"),
  source: text("source").default("WhatsApp"),
  tags: jsonb("tags").$type<string[]>().default([]),
  lostReason: text("lost_reason"),
  lossNotes: text("loss_notes"),
  productService: text("product_service"), // Produto / Serviço / Imóvel / Projeto de interesse
  customFields: jsonb("custom_fields").$type<Record<string, any>>().default({}),
  assignedToUserId: integer("assigned_to_user_id"),
  convertedStudentId: integer("converted_student_id"),
  convertedAt: timestamp("converted_at"),
  dueDateAlert: timestamp("due_date_alert"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type CrmLead = typeof crmLeads.$inferSelect;
export type InsertCrmLead = typeof crmLeads.$inferInsert;

export const crmGoals = pgTable("crm_goals", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull(),
  monthYear: varchar("month_year", { length: 20 }).notNull(), // ex: '08/2026'
  targetNewStudents: integer("target_new_students").default(10).notNull(),
  targetDemos: integer("target_demos").default(25).notNull(),
  targetProposals: integer("target_proposals").default(20).notNull(),
  targetDeals: integer("target_deals").default(10).notNull(),
  targetMrr: decimal("target_mrr", { precision: 10, scale: 2 }).default("2000.00").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type CrmGoal = typeof crmGoals.$inferSelect;

export const crmActivities = pgTable("crm_activities", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull(),
  leadId: integer("lead_id"),
  title: text("title").notNull(),
  type: text("type").notNull().default("whatsapp"), // 'criacao' | 'mudanca_etapa' | 'contato' | 'ligacao' | 'whatsapp' | 'email' | 'aula_experimental' | 'proposta' | 'follow_up' | 'conversao' | 'perda' | 'observacao'
  description: text("description"),
  scheduledTime: text("scheduled_time"),
  assignedUserName: text("assigned_user_name"),
  completed: boolean("completed").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type CrmActivity = typeof crmActivities.$inferSelect;

export const crmFollowUps = pgTable("crm_follow_ups", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull(),
  leadId: integer("lead_id").notNull(),
  title: text("title").notNull(),
  dueDate: timestamp("due_date").notNull(),
  dueTime: varchar("due_time", { length: 10 }),
  assignedToUserId: integer("assigned_to_user_id"),
  assignedUserName: text("assigned_user_name"),
  contactType: text("contact_type").default("whatsapp").notNull(), // 'whatsapp' | 'ligacao' | 'reuniao' | 'email' | 'outro'
  notes: text("notes"),
  completed: boolean("completed").default(false).notNull(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type CrmFollowUp = typeof crmFollowUps.$inferSelect;
export type InsertCrmFollowUp = typeof crmFollowUps.$inferInsert;

export const crmSettings = pgTable("crm_settings", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().unique(),
  customOrigins: jsonb("custom_origins").$type<string[]>().default([]),
  customLossReasons: jsonb("custom_loss_reasons").$type<string[]>().default([]),
  customTags: jsonb("custom_tags").$type<string[]>().default([]),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type CrmSettings = typeof crmSettings.$inferSelect;

// ── Salas de Estúdio / Ensaio ───────────────────────────────────────────────
export const studioRooms = pgTable("studio_rooms", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }).default("Estúdio de gravação").notNull(),
  capacity: integer("capacity").default(8).notNull(),
  equipments: text("equipments").default("Bateria, Teclado, Ar Condicionado").notNull(),
  status: varchar("status", { length: 20 }).default("ativa").notNull(), // "ativa" | "manutencao" | "inativa"
  imageUrl: text("imageUrl"),
  utilizationRate: integer("utilization_rate").default(75).notNull(),
  isPrincipal: boolean("is_principal").default(false).notNull(),
  color: varchar("color", { length: 20 }).default("#3b82f6").notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
});

export type StudioRoom = typeof studioRooms.$inferSelect;
export type InsertStudioRoom = typeof studioRooms.$inferInsert;

// ── Convites e Links de Auto-Matrícula do Aluno ──────────────────────────────
export const enrollmentLinks = pgTable("enrollment_links", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  code: varchar("code", { length: 64 }).notNull().unique(),
  instrumentId: integer("instrumentId"),
  monthlyFee: decimal("monthlyFee", { precision: 10, scale: 2 }),
  leadId: integer("leadId"),
  // Modelo de contrato a ser gerado automaticamente na matrícula (opcional).
  // null = automático (menor de idade se <18 e existir modelo "menor"; senão padrão).
  contractTemplateId: integer("contractTemplateId"),
  status: varchar("status", { length: 20 }).default("active").notNull(), // 'active' | 'used' | 'expired'
  expiresAt: timestamp("expiresAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ── Catálogo de Planos & Bolsas da Escola (comercial) ────────────────────────
// Genérico e multi-tenant: cada escola configura suas próprias bolsas/planos
// (ex.: 1ª Bolsa 12x R$ 180, taxa R$ 60, dias limite 10/20, valor cheio R$ 300).
// A duração (duracaoMeses) define o prazo; isBolsa=false = plano valor cheio.
export const schoolPlans = pgTable("school_plans", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  nome: varchar("nome", { length: 120 }).notNull(),
  aulasPorSemana: integer("aulasPorSemana").default(1).notNull(),
  duracaoMeses: integer("duracaoMeses").default(1).notNull(), // 12 | 6 | 3 | 1...
  isBolsa: boolean("isBolsa").default(true).notNull(), // false = valor cheio
  valorMensal: decimal("valorMensal", { precision: 10, scale: 2 }).notNull(),
  valorCheio: decimal("valorCheio", { precision: 10, scale: 2 }), // regra de atraso (futuro)
  taxaInscricao: decimal("taxaInscricao", { precision: 10, scale: 2 }).default("0").notNull(),
  diasLimite: varchar("diasLimite", { length: 20 }).default("10,20").notNull(), // CSV
  descricao: text("descricao"),
  ativo: boolean("ativo").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
});
export type SchoolPlan = typeof schoolPlans.$inferSelect;
export type InsertSchoolPlan = typeof schoolPlans.$inferInsert;

// ─── MATRÍCULAS POR CURSO (aluno pode ter mais de um curso) ───────────────────
export const studentEnrollments = pgTable("student_enrollments", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  studentId: integer("studentId").notNull(),
  instrumentId: integer("instrumentId"),
  planId: integer("planId"),
  teacherUserId: integer("teacherUserId"),
  studioRoomId: integer("studioRoomId"),
  durationMonths: integer("durationMonths").default(1).notNull(),
  lessonsPerWeek: integer("lessonsPerWeek").default(1).notNull(),
  weekday: integer("weekday").default(1).notNull(), // 0=Dom ... 6=Sáb
  timeStr: varchar("timeStr", { length: 5 }), // HH:mm
  monthlyFee: decimal("monthlyFee", { precision: 10, scale: 2 }).default("0.00").notNull(),
  enrollmentFee: decimal("enrollmentFee", { precision: 10, scale: 2 }).default("0.00").notNull(),
  // turma | individual | online (permite individual + turma simultâneos)
  lessonType: varchar("lessonType", { length: 20 }).default("turma").notNull(),
  // Turno personalizável (opcional, vem das configurações da escola)
  shift: varchar("shift", { length: 40 }),
  startDate: date("startDate"),
  endDate: date("endDate"),
  status: varchar("status", { length: 20 }).default("ativo").notNull(), // ativo | encerrado
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
}, (table) => [
  index("student_enrollments_student_idx").on(table.studentId),
  index("student_enrollments_org_idx").on(table.organizationId),
]);

export type StudentEnrollment = typeof studentEnrollments.$inferSelect;
export type InsertStudentEnrollment = typeof studentEnrollments.$inferInsert;

// ── Desafios (PRD_RANKINGS §55 — critério "Desafios" do motor) ───────────────
// Professor cria desafios para os alunos responderem; APROVAÇÃO OBRIGATÓRIA
// para pontuar. Solto (rankingId null) aprovado → medalha no studentAchievements.
// Vinculado a ranking aprovado → rankingScores (source 'desafio') → total do ranking.
export const schoolChallenges = pgTable("school_challenges", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  userId: integer("userId").notNull(), // criador
  titulo: varchar("titulo", { length: 160 }).notNull(),
  descricao: text("descricao"),
  tipo: varchar("tipo", { length: 20 }).notNull(), // performance | quiz | pratica | relampago | batalha | turma
  pontos: integer("pontos").default(50).notNull(),
  prazo: timestamp("prazo"), // null = sem prazo; relâmpago = janela curta
  rankingId: integer("rankingId"), // null = desafio solto
  turmaNome: varchar("turmaNome", { length: 120 }), // tipo turma
  batalhaStudentA: integer("batalhaStudentA"), // tipo batalha
  batalhaStudentB: integer("batalhaStudentB"),
  quizQuestions: text("quizQuestions"), // JSON [{q, opts[], correct}]
  praticaMinutos: integer("praticaMinutos"), // tipo pratica (meta informativa)
  praticaDias: integer("praticaDias"),
  status: varchar("status", { length: 20 }).default("ativa").notNull(), // ativa | encerrada
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
});

export const challengeResponses = pgTable("challenge_responses", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  challengeId: integer("challengeId").notNull(),
  studentId: integer("studentId").notNull(),
  respostaTexto: text("respostaTexto"),
  fileUrl: text("fileUrl"), // mídia (performance) via storagePut
  fileType: varchar("fileType", { length: 100 }),
  respostasQuiz: text("respostasQuiz"), // JSON [{selecionou}] índice por pergunta
  status: varchar("status", { length: 20 }).default("enviado").notNull(), // enviado | aprovado | reprovado
  pontos: integer("pontos"),
  feedback: text("feedback"),
  avaliadoBy: integer("avaliadoBy"),
  avaliadoAt: timestamp("avaliadoAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type SchoolChallenge = typeof schoolChallenges.$inferSelect;
export type ChallengeResponse = typeof challengeResponses.$inferSelect;

// ── Memória Pedagógica Contínua da IA (Opção 4) ──────────────────────────────
export const studentPedagogicalMemory = pgTable("student_pedagogical_memory", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  studentId: integer("studentId").notNull().unique(),
  strongPoints: text("strongPoints").default("[]"), // JSON string / array
  weakPoints: text("weakPoints").default("[]"),   // JSON string / array
  repertoireMastered: text("repertoireMastered").default("[]"), // JSON array
  repertoireLearning: text("repertoireLearning").default("[]"), // JSON array
  pedagogicalDirectives: text("pedagogicalDirectives"), // Recomendações consolidadas da IA
  lastAiAnalysisAt: timestamp("lastAiAnalysisAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
});

export type StudentPedagogicalMemory = typeof studentPedagogicalMemory.$inferSelect;
export type InsertStudentPedagogicalMemory = typeof studentPedagogicalMemory.$inferInsert;

// ── Registro e Cache de Otimizações de Agenda via IA (Opção 6) ───────────────
export const scheduleOptimizationLogs = pgTable("schedule_optimization_logs", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  userId: integer("userId").notNull(),
  inputConstraints: text("inputConstraints").notNull(), // JSON com parâmetros enviados
  proposedSchedule: text("proposedSchedule").notNull(),  // JSON com a grade ótima sugerida
  status: varchar("status", { length: 20 }).default("pending").notNull(), // 'pending', 'applied', 'rejected'
  appliedAt: timestamp("appliedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ScheduleOptimizationLog = typeof scheduleOptimizationLogs.$inferSelect;
export type InsertScheduleOptimizationLog = typeof scheduleOptimizationLogs.$inferInsert;

// ── Clientes / Escolas em Destaque na Landing Page (Super Admin) ────────────
export const landingClients = pgTable("landing_clients", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  logoUrl: text("logoUrl").notNull(),
  websiteUrl: text("websiteUrl"),
  testimonial: text("testimonial"),
  order: integer("order").default(0).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
});

export type LandingClient = typeof landingClients.$inferSelect;
export type InsertLandingClient = typeof landingClients.$inferInsert;

// ── Ofertas de Antecipação de Horários por Falta ───────────────────────────
export const slotOffers = pgTable("slot_offers", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId"),
  originalLessonId: integer("originalLessonId").notNull(),
  teacherId: integer("teacherId").notNull(),
  slotDate: timestamp("slotDate").notNull(),
  duration: integer("duration").default(60).notNull(),
  instrumentId: integer("instrumentId"),
  title: varchar("title", { length: 255 }),
  status: varchar("status", { length: 20 }).default("aberta").notNull(), // 'aberta', 'aceita', 'expirada', 'cancelada'
  acceptedByStudentId: integer("acceptedByStudentId"),
  acceptedLessonId: integer("acceptedLessonId"),
  acceptedAt: timestamp("acceptedAt"),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
}, (table) => [
  index("slot_offers_org_status_idx").on(table.organizationId, table.status),
  index("slot_offers_slot_date_idx").on(table.slotDate),
]);

export type SlotOffer = typeof slotOffers.$inferSelect;
export type InsertSlotOffer = typeof slotOffers.$inferInsert;

// ── Slides de Funcionalidades do Hero na Landing Page (Super Admin) ─────────
export const landingHeroSlides = pgTable("landing_hero_slides", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  highlight: varchar("highlight", { length: 255 }).notNull(),
  subtitle: text("subtitle").notNull(),
  points: text("points").default("[]").notNull(), // JSON array de strings
  imageUrl: text("imageUrl").notNull(),
  bgTheme: varchar("bgTheme", { length: 50 }).default("slate-900").notNull(), // 'slate-50' | 'blue-600' | 'slate-900' | 'indigo-50'
  order: integer("order").default(0).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
});

export type LandingHeroSlide = typeof landingHeroSlides.$inferSelect;
export type InsertLandingHeroSlide = typeof landingHeroSlides.$inferInsert;

// ─── MÓDULO FISCAL (FOCUS NFE MULTI-TENANT) ──────────────────────────────────

export const fiscalCompanies = pgTable("fiscal_companies", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull().unique(),
  cnpj: varchar("cnpj", { length: 25 }).notNull(),
  razaoSocial: varchar("razaoSocial", { length: 255 }).notNull(),
  nomeFantasia: varchar("nomeFantasia", { length: 255 }),
  inscricaoMunicipal: varchar("inscricaoMunicipal", { length: 50 }),
  inscricaoEstadual: varchar("inscricaoEstadual", { length: 50 }),
  regimeTributario: regimeTributarioEnum("regimeTributario").default("simples_nacional").notNull(),
  optanteSimplesNacional: boolean("optanteSimplesNacional").default(true).notNull(),
  tipoEmissaoNfse: tipoEmissaoNfseEnum("tipoEmissaoNfse").default("automatico").notNull(),
  
  // Endereço fiscal
  cep: varchar("cep", { length: 20 }),
  logradouro: varchar("logradouro", { length: 255 }),
  numero: varchar("numero", { length: 50 }),
  complemento: varchar("complemento", { length: 100 }),
  bairro: varchar("bairro", { length: 100 }),
  cidade: varchar("cidade", { length: 100 }),
  uf: varchar("uf", { length: 10 }),
  codigoMunicipio: varchar("codigoMunicipio", { length: 20 }), // Código IBGE do município
  telefone: varchar("telefone", { length: 30 }),
  email: varchar("email", { length: 255 }),
  
  // Focus NFe & Certificado A1
  focusCompanyId: varchar("focusCompanyId", { length: 100 }),
  focusApiKey: text("focusApiKey"), // Opcional se usar API Key própria por escola
  certificateA1Status: varchar("certificateA1Status", { length: 30 }).default("nao_configurado"), // configurado, vencido, pendente, nao_configurado
  certificateExpiresAt: timestamp("certificateExpiresAt"),
  
  // Automações fiscais
  autoEmitOnPayment: boolean("autoEmitOnPayment").default(false).notNull(),
  emitTiming: varchar("emitTiming", { length: 20 }).default("imediato").notNull(), // imediato, manual
  autoEmailInvoice: boolean("autoEmailInvoice").default(true).notNull(),
  autoRetryErrors: boolean("autoRetryErrors").default(true).notNull(),
  
  status: varchar("status", { length: 30 }).default("ativo").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
}, (table) => [
  index("fiscal_companies_org_idx").on(table.organizationId),
  index("fiscal_companies_cnpj_idx").on(table.cnpj),
]);

export type FiscalCompany = typeof fiscalCompanies.$inferSelect;
export type InsertFiscalCompany = typeof fiscalCompanies.$inferInsert;

export const fiscalServices = pgTable("fiscal_services", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  nome: varchar("nome", { length: 255 }).notNull(), // Ex: Mensalidade de Aulas de Música
  codigoServico: varchar("codigoServico", { length: 50 }).notNull(), // Código municipal/nacional
  codigoTributacaoMunicipio: varchar("codigoTributacaoMunicipio", { length: 50 }),
  aliquotaIss: decimal("aliquotaIss", { precision: 5, scale: 2 }).default("0.00").notNull(),
  naturezaOperacao: varchar("naturezaOperacao", { length: 100 }).default("1").notNull(), // 1: Tributação no município, etc.
  descricaoPadrao: text("descricaoPadrao").default("Mensalidade referente a aulas de musica - Competencia {competencia}").notNull(),
  itemListaServico: varchar("itemListaServico", { length: 20 }).default("08.01"), // Item LC 116 (ex: 08.01 Ensino/Instrução)
  issRetido: boolean("issRetido").default(false).notNull(),
  ativo: boolean("ativo").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
}, (table) => [
  index("fiscal_services_org_idx").on(table.organizationId),
]);

export type FiscalServiceRecord = typeof fiscalServices.$inferSelect;
export type InsertFiscalServiceRecord = typeof fiscalServices.$inferInsert;

export const fiscalInvoices = pgTable("fiscal_invoices", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  studentId: integer("studentId"),
  paymentId: integer("paymentId"),
  serviceId: integer("serviceId"),
  
  reference: varchar("reference", { length: 100 }).notNull().unique(), // WRMUSIC-{orgId}-PAY-{paymentId} ou WRMUSIC-{orgId}-MAN-{nanoid}
  provider: varchar("provider", { length: 50 }).default("focusnfe").notNull(),
  providerId: varchar("providerId", { length: 100 }), // ID ou chave na Focus
  
  numero: varchar("numero", { length: 50 }),
  serie: varchar("serie", { length: 20 }),
  codigoVerificacao: varchar("codigoVerificacao", { length: 100 }),
  
  status: fiscalInvoiceStatusEnum("status").default("draft").notNull(),
  valor: decimal("valor", { precision: 10, scale: 2 }).notNull(),
  competencia: varchar("competencia", { length: 30 }), // Ex: "08/2026"
  dataEmissao: timestamp("dataEmissao"),
  
  // Tomador
  customerName: varchar("customerName", { length: 255 }).notNull(),
  customerTaxId: varchar("customerTaxId", { length: 30 }).notNull(),
  customerEmail: varchar("customerEmail", { length: 255 }),
  customerPhone: varchar("customerPhone", { length: 30 }),
  serviceDescription: text("serviceDescription").notNull(),
  
  // Documentos
  pdfUrl: text("pdfUrl"),
  xmlUrl: text("xmlUrl"),
  
  // Tratamento de erros & cancelamento
  errorCode: varchar("errorCode", { length: 100 }),
  errorMessage: text("errorMessage"),
  cancelReason: text("cancelReason"),
  cancelledAt: timestamp("cancelledAt"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
}, (table) => [
  index("fiscal_invoices_org_idx").on(table.organizationId),
  index("fiscal_invoices_student_idx").on(table.studentId),
  index("fiscal_invoices_payment_idx").on(table.paymentId),
  index("fiscal_invoices_status_idx").on(table.status),
  index("fiscal_invoices_reference_idx").on(table.reference),
]);

export type FiscalInvoice = typeof fiscalInvoices.$inferSelect;
export type InsertFiscalInvoice = typeof fiscalInvoices.$inferInsert;

export const fiscalJobs = pgTable("fiscal_jobs", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  invoiceId: integer("invoiceId").notNull(),
  type: varchar("type", { length: 50 }).default("emit").notNull(), // emit, cancel, query_status
  status: fiscalJobStatusEnum("status").default("pending").notNull(),
  attempts: integer("attempts").default(0).notNull(),
  maxAttempts: integer("maxAttempts").default(5).notNull(),
  lastError: text("lastError"),
  nextAttemptAt: timestamp("nextAttemptAt").defaultNow().notNull(),
  processedAt: timestamp("processedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
}, (table) => [
  index("fiscal_jobs_org_status_idx").on(table.organizationId, table.status),
  index("fiscal_jobs_invoice_idx").on(table.invoiceId),
  index("fiscal_jobs_next_attempt_idx").on(table.nextAttemptAt),
]);

export type FiscalJob = typeof fiscalJobs.$inferSelect;
export type InsertFiscalJob = typeof fiscalJobs.$inferInsert;

export const fiscalLogs = pgTable("fiscal_logs", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  invoiceId: integer("invoiceId"),
  event: varchar("event", { length: 100 }).notNull(), // NFS-E_CREATED, NFS-E_SENT, NFS-E_AUTHORIZED, etc.
  payload: jsonb("payload").default({}),
  userId: integer("userId"),
  userName: varchar("userName", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("fiscal_logs_org_idx").on(table.organizationId),
  index("fiscal_logs_invoice_idx").on(table.invoiceId),
  index("fiscal_logs_created_at_idx").on(table.createdAt),
]);

export type FiscalLog = typeof fiscalLogs.$inferSelect;
export type InsertFiscalLog = typeof fiscalLogs.$inferInsert;

// ─── SHORT LINKS (encurtador de links de pagamento — /p/{code}) ──────────────
// Códigos aleatórios (não enumeráveis) criados server-side apenas nos fluxos de
// cobrança. A rota pública GET /p/:code (server/_core/index.ts) faz 302 para
// targetUrl. A conciliação InfinitePay não depende da URL (payment_check usa
// handle/order_nsu/slug), então encurtar é seguro.
export const shortLinks = pgTable("short_links", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId"),
  userId: integer("userId"),
  code: varchar("code", { length: 16 }).notNull().unique(),
  targetUrl: text("targetUrl").notNull(),
  paymentDueId: integer("paymentDueId"),
  enrollmentCode: varchar("enrollmentCode", { length: 100 }),
  clicks: integer("clicks").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("short_links_payment_due_idx").on(table.paymentDueId),
  index("short_links_enrollment_code_idx").on(table.enrollmentCode),
]);

export type ShortLink = typeof shortLinks.$inferSelect;
export type InsertShortLink = typeof shortLinks.$inferInsert;

export const webhookEvents = pgTable("webhook_events", {
  id: serial("id").primaryKey(),
  gateway: varchar("gateway", { length: 50 }).notNull(), // asaas, mercadopago, infinitepay, assinafy, focusnfe
  gatewayEventId: varchar("gatewayEventId", { length: 255 }).notNull().unique(),
  eventType: varchar("eventType", { length: 100 }).notNull(),
  organizationId: integer("organizationId"),
  payload: jsonb("payload").default({}),
  status: varchar("status", { length: 50 }).default("received").notNull(), // received, processed, failed, ignored
  processedAt: timestamp("processedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("webhook_events_gateway_event_idx").on(table.gateway, table.gatewayEventId),
  index("webhook_events_org_idx").on(table.organizationId),
  index("webhook_events_status_idx").on(table.status),
]);

export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type InsertWebhookEvent = typeof webhookEvents.$inferInsert;

export const whatsappRateLimits = pgTable("whatsapp_rate_limits", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  userId: integer("userId"),
  windowStart: timestamp("windowStart").notNull(),
  messageCount: integer("messageCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("whatsapp_rate_limits_org_window_idx").on(table.organizationId, table.windowStart),
  index("whatsapp_rate_limits_org_idx").on(table.organizationId),
]);

export type WhatsappRateLimit = typeof whatsappRateLimits.$inferSelect;
export type InsertWhatsappRateLimit = typeof whatsappRateLimits.$inferInsert;

// ─── Telemetria de IA (PRD_PROMPTS_IA_CONSOLIDADOS — RF-009) ─────────────────
// Metadados de cada chamada de IA. RN-004: nunca grava chave, prompt ou PII.
export const aiCallLogs = pgTable("ai_call_logs", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId"),
  userId: integer("userId"),
  feature: varchar("feature", { length: 60 }).notNull(),
  promptVersion: varchar("promptVersion", { length: 12 }),
  provider: varchar("provider", { length: 20 }).notNull(),
  model: varchar("model", { length: 80 }).notNull(),
  durationMs: integer("durationMs").notNull(),
  success: boolean("success").notNull(),
  errorCode: varchar("errorCode", { length: 30 }),
  errorMessage: text("errorMessage"),
  isJson: integer("isJson").default(0).notNull(),
  inputTokens: integer("inputTokens"),
  outputTokens: integer("outputTokens"),
  cachedTokens: integer("cachedTokens"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_ai_call_logs_org_created").on(table.organizationId, table.createdAt),
  index("idx_ai_call_logs_feature_created").on(table.feature, table.createdAt),
]);

export type AiCallLog = typeof aiCallLogs.$inferSelect;
export type InsertAiCallLog = typeof aiCallLogs.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════════
// RANKINGS & DESAFIOS (PRD_SISTEMA_RANKINGS) — gamificação educacional
// Princípio: pontuação DERIVADA no backend a partir de sinais reais
// (presença, atividades, prática validada, evolução). Nunca calculada no client.
// ═══════════════════════════════════════════════════════════════════════════════

export const rankingStatusEnum = pgEnum('ranking_status', ["rascunho", "agendado", "ativo", "encerrado", "cancelado"]);
export const rankingVisibilityEnum = pgEnum('ranking_visibility', ["publico", "privado"]);

/** Configuração de privacidade definida pelo professor/admin (§32). O aluno não altera. */
export interface RankingPrivacySettings {
  showFullName: boolean;   // false = apenas primeiro nome
  showAvatar: boolean;
  showScores: boolean;     // pontuação dos outros
  showEvolution: boolean;  // indicadores ↑↓—
  showParticipants: boolean;
  /** Em rankings privados, mostra faixa "Você está entre os N melhores" quando aplicável */
  privateTopRange: number;
}

export const RANKING_DEFAULT_PRIVACY: RankingPrivacySettings = {
  showFullName: false,
  showAvatar: true,
  showScores: true,
  showEvolution: true,
  showParticipants: true,
  privateTopRange: 10,
};

/** Pesos por critério (em %, somados pelo admin). Internos — não exibidos ao aluno (§17). */
export type RankingWeights = {
  presenca: number;
  atividades: number;
  pratica: number;
  evolucao: number;
  desafios: number;
};

export const RANKING_DEFAULT_WEIGHTS: RankingWeights = {
  presenca: 20,
  atividades: 30,
  pratica: 25,
  evolucao: 15,
  desafios: 10,
};

export const rankings = pgTable("rankings", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId"),
  userId: integer("userId").notNull(), // criador (admin/professor)
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  image: text("image"),
  status: rankingStatusEnum("status").default("rascunho").notNull(),
  visibility: rankingVisibilityEnum("visibility").default("publico").notNull(),
  privacySettings: jsonb("privacySettings").$type<RankingPrivacySettings>().default(RANKING_DEFAULT_PRIVACY).notNull(),
  criteriaWeights: jsonb("criteriaWeights").$type<RankingWeights>().default(RANKING_DEFAULT_WEIGHTS).notNull(),
  // Regra de participação (§12): todos | modalidade | nivel | manual
  // (o valor legado "instrumento" do MusicPro continua aceito pelo engine)
  participantRule: varchar("participantRule", { length: 20 }).default("todos").notNull(),
  instrumentId: integer("instrumentId"),
  level: varchar("level", { length: 30 }),
  participantStudentIds: jsonb("participantStudentIds").$type<number[]>().default([]).notNull(),
  startDate: timestamp("startDate").notNull(),
  endDate: timestamp("endDate").notNull(),
  // Snapshot do resultado final gravado no encerramento (§48) — podium + estatísticas
  history: jsonb("history").$type<{ podium: Array<{ position: number; studentId: number; name: string; avatar: string | null; score: number }>; totalParticipants: number; closedAt: string } | null>(),
  closedAt: timestamp("closedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
}, (table) => [
  index("idx_rankings_org_status").on(table.organizationId, table.status),
  index("idx_rankings_org_end").on(table.organizationId, table.endDate),
]);

export type Ranking = typeof rankings.$inferSelect;
export type InsertRanking = typeof rankings.$inferInsert;

export const rankingParticipants = pgTable("ranking_participants", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId"),
  rankingId: integer("rankingId").notNull(),
  studentId: integer("studentId").notNull(),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
  status: varchar("status", { length: 20 }).default("ativo").notNull(),
  // Posições persistidas pelo job (leitura do aluno não faz escrita — §49)
  lastPosition: integer("lastPosition"),
  previousPosition: integer("previousPosition"),
  finalPosition: integer("finalPosition"),
  finalScore: integer("finalScore"),
}, (table) => [
  index("idx_ranking_participants_ranking").on(table.rankingId, table.studentId),
  index("idx_ranking_participants_student").on(table.studentId, table.organizationId),
]);

export type RankingParticipant = typeof rankingParticipants.$inferSelect;
export type InsertRankingParticipant = typeof rankingParticipants.$inferInsert;

/**
 * Eventos de pontuação MANUAIS (bônus/ajustes) — trilha de auditoria (§45-47).
 * Os critérios derivados (presença/atividades/prática/evolução) NÃO gravam aqui:
 * são recalculados a partir das tabelas-fonte, garantindo consistência e
 * impossibilidade de manipulação. Este registro é append-only.
 */
export const rankingScores = pgTable("ranking_scores", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId"),
  rankingId: integer("rankingId").notNull(),
  studentId: integer("studentId").notNull(),
  source: varchar("source", { length: 30 }).notNull(), // bonus | ajuste | desafio (fase 2)
  sourceId: integer("sourceId"),
  points: integer("points").notNull(), // pode ser negativo (ajuste/correção)
  reason: text("reason"),
  createdBy: integer("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_ranking_scores_ranking_student").on(table.rankingId, table.studentId),
]);

export type RankingScore = typeof rankingScores.$inferSelect;
export type InsertRankingScore = typeof rankingScores.$inferInsert;

/** Medalhas e conquistas (§25) — concedidas SOMENTE pelo backend no encerramento. */
export const studentAchievements = pgTable("student_achievements", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId"),
  studentId: integer("studentId").notNull(),
  rankingId: integer("rankingId"),
  challengeId: integer("challengeId"),
  badge: varchar("badge", { length: 50 }).notNull(), // campeao | vice | top3 | constante | desafiante | evolucao | meta_atingida
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  awardedAt: timestamp("awardedAt").defaultNow().notNull(),
}, (table) => [
  index("idx_student_achievements_student").on(table.studentId, table.organizationId),
]);

export type StudentAchievement = typeof studentAchievements.$inferSelect;
export type InsertStudentAchievement = typeof studentAchievements.$inferInsert;

// ─── Avaliações de Professores (PRD módulo 2) — sigilosas para o admin ────────
// Ciclo (janela) aberto de tempo em tempo (frequência configurada pelo admin);
// o aluno avalia o próprio professor (nota 1–5 + comentário). O professor NUNCA
// acessa dados deste módulo — leitura exclusiva do admin.
export const professorEvaluationPeriods = pgTable("professor_evaluation_periods", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  startDate: date("startDate").notNull(),
  endDate: date("endDate").notNull(),
  status: varchar("status", { length: 20 }).default("aberta").notNull(), // aberta | fechada
  createdBy: integer("createdBy").default(0).notNull(), // 0 = automático (job)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_prof_eval_periods_org_status").on(table.organizationId, table.status),
]);

export const professorEvaluations = pgTable("professor_evaluations", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  periodId: integer("periodId").notNull(),
  studentId: integer("studentId").notNull(),
  professorId: integer("professorId").notNull(), // professores.userId (conta do professor)
  nota: integer("nota").notNull(), // 1–5
  comentario: text("comentario"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_prof_evals_org_period").on(table.organizationId, table.periodId),
  index("idx_prof_evals_professor").on(table.professorId, table.organizationId),
]);

export type ProfessorEvaluationPeriod = typeof professorEvaluationPeriods.$inferSelect;
export type InsertProfessorEvaluationPeriod = typeof professorEvaluationPeriods.$inferInsert;
export type ProfessorEvaluation = typeof professorEvaluations.$inferSelect;
export type InsertProfessorEvaluation = typeof professorEvaluations.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════════
// REPOSIÇÃO DE AULAS (PRD 01) — créditos rastreáveis por escola
// Regras: 1 aula elegível = 1 crédito (unique em lessonId); crédito usado não volta;
// expiração = liberação + prazo configurado; liberação pode ser imediata ou no fim do contrato.
// ═══════════════════════════════════════════════════════════════════════════════

/** Política de reposição — 1 linha por escola (upsert por organizationId). */
export const repositionPolicies = pgTable("reposition_policies", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  // Prazo para realizar a reposição a partir da liberação do crédito
  expirationDays: integer("expirationDays").default(30).notNull(),
  // Unidade do prazo: "dias" | "semanas" | "meses"
  expirationUnit: varchar("expirationUnit", { length: 10 }).default("dias").notNull(),
  // Quando liberar o crédito: "imediata" | "fim_contrato"
  creditRelease: varchar("creditRelease", { length: 20 }).default("imediata").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("reposition_policies_org_unique").on(table.organizationId),
]);

export type RepositionPolicy = typeof repositionPolicies.$inferSelect;
export type InsertRepositionPolicy = typeof repositionPolicies.$inferInsert;

/** Motivos de reposição cadastrados pela escola. */
export const repositionReasons = pgTable("reposition_reasons", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
  active: boolean("active").default(true).notNull(),
  // Gera direito à reposição? (ex: "Falta não justificada" = false)
  generatesCredit: boolean("generatesCredit").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
}, (table) => [
  index("reposition_reasons_org_idx").on(table.organizationId),
]);

export type RepositionReason = typeof repositionReasons.$inferSelect;
export type InsertRepositionReason = typeof repositionReasons.$inferInsert;

/**
 * Crédito de reposição — 1 por aula marcada como "Aula a Repor" (unique em lessonId
 * impede crédito duplicado). A reposição agendada cria uma nova lesson (scheduledLessonId).
 */
export const lessonRepositions = pgTable("lesson_repositions", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  // Aula original que gerou o crédito (unique = nunca 2 créditos para a mesma aula)
  lessonId: integer("lessonId").notNull(),
  studentId: integer("studentId").notNull(),
  // Professor efetivo do aluno (students.professorId) no momento da geração
  professorId: integer("professorId"),
  reasonId: integer("reasonId"),
  notes: text("notes"),
  status: repositionStatusEnum("status").default("aguardando_liberacao").notNull(),
  // Liberação do crédito (imediata ou no encerramento do contrato)
  releasedAt: timestamp("releasedAt"),
  // Validade do crédito (liberação + prazo da política)
  expiresAt: timestamp("expiresAt"),
  // Aula de reposição criada na agenda
  scheduledLessonId: integer("scheduledLessonId"),
  scheduledAt: timestamp("scheduledAt"),
  // Conclusão da reposição (consome o crédito)
  completedAt: timestamp("completedAt"),
  completedByUserId: integer("completedByUserId"),
  completionNotes: text("completionNotes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("lesson_repositions_lesson_unique").on(table.lessonId),
  index("lesson_repositions_org_idx").on(table.organizationId),
  index("lesson_repositions_student_idx").on(table.studentId),
  index("lesson_repositions_status_idx").on(table.status),
]);

export type LessonReposition = typeof lessonRepositions.$inferSelect;
export type InsertLessonReposition = typeof lessonRepositions.$inferInsert;

/** Histórico/auditoria das reposições (criação, liberação, expiração, agendamento, realização...). */
export const repositionEvents = pgTable("reposition_events", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  // null para eventos globais (ex: politica_alterada)
  repositionId: integer("repositionId"),
  type: varchar("type", { length: 40 }).notNull(), // criado | liberado | expirado | agendado | realizado | cancelado | politica_alterada
  message: text("message"),
  userId: integer("userId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("reposition_events_reposition_idx").on(table.repositionId),
]);

export type RepositionEvent = typeof repositionEvents.$inferSelect;
export type InsertRepositionEvent = typeof repositionEvents.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════════
// IA — ESPECIALISTAS PERSONALIZADOS & GESTÃO DE PROMPTS VERSIONADA (PRD 02)
// ═══════════════════════════════════════════════════════════════════════════════

/** Especialistas de IA criados pela escola (os padrão vivem em InstrumentSpecialistService). */
export const aiSpecialists = pgTable("ai_specialists", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  // Instrumento/área (ex: Flauta, Saxofone, Musicalização Infantil)
  area: varchar("area", { length: 120 }),
  icon: varchar("icon", { length: 50 }),
  description: text("description"),
  // Prompt do sistema do especialista
  systemPrompt: text("systemPrompt"),
  pedagogicalInstructions: text("pedagogicalInstructions"),
  technicalKnowledge: text("technicalKnowledge"),
  // Modelo de IA opcional (preparado para multi-modelo; null = usa o padrão da escola)
  aiModel: varchar("aiModel", { length: 120 }),
  active: boolean("active").default(true).notNull(),
  createdByUserId: integer("createdByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
}, (table) => [
  index("ai_specialists_org_idx").on(table.organizationId),
]);

export type AiSpecialist = typeof aiSpecialists.$inferSelect;
export type InsertAiSpecialist = typeof aiSpecialists.$inferInsert;

/** Prompt gerenciado — conteúdo editável com versionamento (ai_prompt_versions). */
export const aiPrompts = pgTable("ai_prompts", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  // "especialista" (sobrescreve bloco do especialista na geração do plano) | "geral"
  type: varchar("type", { length: 30 }).default("especialista").notNull(),
  // Especialista padrão alvo (chave do INSTRUMENT_SPECIALISTS, ex: "teclado")
  specialistKey: varchar("specialistKey", { length: 60 }),
  // Especialista personalizado alvo (ai_specialists.id)
  specialistId: integer("specialistId"),
  content: text("content").notNull(),
  active: boolean("active").default(true).notNull(),
  version: integer("version").default(1).notNull(),
  createdByUserId: integer("createdByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
}, (table) => [
  index("ai_prompts_org_idx").on(table.organizationId),
]);

export type AiPrompt = typeof aiPrompts.$inferSelect;
export type InsertAiPrompt = typeof aiPrompts.$inferInsert;

/** Histórico imutável de versões — restaurar versão cria uma nova versão (nunca apaga). */
export const aiPromptVersions = pgTable("ai_prompt_versions", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  promptId: integer("promptId").notNull(),
  version: integer("version").notNull(),
  content: text("content").notNull(),
  createdByUserId: integer("createdByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("ai_prompt_versions_prompt_idx").on(table.promptId),
]);

export type AiPromptVersion = typeof aiPromptVersions.$inferSelect;
export type InsertAiPromptVersion = typeof aiPromptVersions.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════════
// REPERTÓRIO DO ALUNO (PRD Repertório) — músicas do YouTube indicadas pelo professor
// O aluno executa com player embutido (youtube-nocookie) no portal, sem sair do app.
// videoId é extraído/validado server-side; iframe NUNCA recebe URL livre do usuário.
// ═══════════════════════════════════════════════════════════════════════════════

/** Diagrama de acorde (extraído do Cifra Club ou manual). */
export interface ChordDiagram {
  name: string;   // ex: "Am7"
  mount: string;  // ex: "X 0 2 0 1 0" (6 cordas; X = abafada)
  tuning: string; // ex: "E A D G B E"
}

export const studentRepertoire = pgTable("student_repertoire", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  studentId: integer("studentId").notNull(),
  // Professor/admin autor do cadastro
  createdByUserId: integer("createdByUserId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  // URL original informada (rastreabilidade)
  youtubeUrl: text("youtubeUrl").notNull(),
  // Extraído server-side (null = playlist sem vídeo específico)
  videoId: varchar("videoId", { length: 20 }),
  playlistId: varchar("playlistId", { length: 60 }),
  description: text("description"),
  position: integer("position").default(0).notNull(),
  active: boolean("active").default(true).notNull(),
  // 1º acesso do aluno no player (idempotente)
  viewedAt: timestamp("viewedAt"),
  // Badge "Aprendida" — NÃO bloqueia reescuta (toggle)
  learnedAt: timestamp("learnedAt"),
  // ── Cifra (PRD Cifra: RN-007 — SÓ acordes/estrutura, NUNCA letra) ──
  chordSheet: text("chordSheet"), // texto plano; máx 50.000 chars
  chordKey: varchar("chordKey", { length: 4 }), // tom declarado (ex: "Em")
  chordDiagrams: jsonb("chordDiagrams").$type<ChordDiagram[]>(),
  // Fonte da cifra no Cifra Club (atribuição + link "ver letra")
  cifraclubUrl: text("cifraclubUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
}, (table) => [
  index("student_repertoire_org_student_idx").on(table.organizationId, table.studentId, table.position),
  // videoId null (playlist) fica fora do unique — NULLs são distintos no Postgres
  uniqueIndex("student_repertoire_student_video_unique").on(table.studentId, table.videoId),
]);

export type StudentRepertoire = typeof studentRepertoire.$inferSelect;
export type InsertStudentRepertoire = typeof studentRepertoire.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════════
// TUTORIAIS DO SISTEMA (PRD Tutoriais) — vídeos do YouTube que explicam as
// funcionalidades do MusicPro. Gestão EXCLUSIVA do Superadmin (master panel);
// visualização para admin/professor (aba "Tutoriais" no menu).
// Mesmo mecanismo do Repertório: videoId/playlistId extraídos server-side
// (RN-005 — iframe NUNCA recebe URL crua); player via VideoFacade/VideoThumb.
// ═══════════════════════════════════════════════════════════════════════════════

export const systemTutorials = pgTable("system_tutorials", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  // URL original informada (rastreabilidade)
  youtubeUrl: text("youtubeUrl").notNull(),
  // Extraído server-side (null = playlist sem vídeo específico)
  videoId: varchar("videoId", { length: 20 }),
  playlistId: varchar("playlistId", { length: 60 }),
  description: text("description"),
  category: varchar("category", { length: 60 }).default("Geral").notNull(),
  position: integer("position").default(0).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdByUserId: integer("createdByUserId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
}, (table) => [
  index("system_tutorials_active_pos_idx").on(table.isActive, table.position),
]);

export type SystemTutorial = typeof systemTutorials.$inferSelect;
export type InsertSystemTutorial = typeof systemTutorials.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════════
// COREOGRAFIAS (DancePro) — núcleo pedagógico de dança
// A coreografia é a entidade central do espetáculo: reúne elenco (alunos),
// modalidade/ritmo, nível, formação, vídeo de marcação e vínculo com evento.
// ═══════════════════════════════════════════════════════════════════════════════

export const coreografias = pgTable("coreografias", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  createdByUserId: integer("createdByUserId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  // FK lógica → instruments.id (modalidade/ritmo de dança)
  modalidadeId: integer("modalidadeId"),
  // iniciante | intermediario | avancado | todas
  nivel: varchar("nivel", { length: 30 }).default("todas").notNull(),
  // solo | duo | grupo | formacao
  formacao: varchar("formacao", { length: 30 }).default("grupo").notNull(),
  // FK lógica → users.id (professor/coreógrafo responsável)
  professorId: integer("professorId"),
  musica: varchar("musica", { length: 255 }),
  descricao: text("descricao"),
  // Vídeo de marcação (YouTube — videoId extraído/validado server-side)
  videoUrl: text("videoUrl"),
  videoId: varchar("videoId", { length: 20 }),
  // em_montagem | ensaiando | pronta | arquivada
  status: varchar("status", { length: 30 }).default("em_montagem").notNull(),
  // FK lógica → events.id (espetáculo/apresentação vinculada)
  eventId: integer("eventId"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
}, (table) => [
  index("coreografias_org_idx").on(table.organizationId, table.status),
  index("coreografias_org_modalidade_idx").on(table.organizationId, table.modalidadeId),
]);

export type Coreografia = typeof coreografias.$inferSelect;
export type InsertCoreografia = typeof coreografias.$inferInsert;

/** Elenco da coreografia: aluno escalado + progresso de domínio da coreografia. */
export const coreografiaAlunos = pgTable("coreografia_alunos", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  coreografiaId: integer("coreografiaId").notNull(),
  studentId: integer("studentId").notNull(),
  // Papel no elenco (ex.: "Solo", "Primeiro plano", "Corpo de baile")
  papel: varchar("papel", { length: 120 }),
  // convidado | confirmado | desistiu | substituto
  status: varchar("status", { length: 30 }).default("convidado").notNull(),
  // Domínio da coreografia: 0 a 100 (%)
  progresso: integer("progresso").default(0).notNull(),
  observacoes: text("observacoes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("coreografia_alunos_unique").on(table.coreografiaId, table.studentId),
  index("coreografia_alunos_student_idx").on(table.studentId),
  index("coreografia_alunos_org_idx").on(table.organizationId),
]);

export type CoreografiaAluno = typeof coreografiaAlunos.$inferSelect;
export type InsertCoreografiaAluno = typeof coreografiaAlunos.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════════
// EVENTOS / ESPETÁCULOS (DancePro) — recitais, festivais, competições e workshops
// Reúne coreografias (ordem de apresentação) e participantes com controle de
// autorização de imagem/participação (menores de idade).
// ═══════════════════════════════════════════════════════════════════════════════

export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  createdByUserId: integer("createdByUserId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  // recital | festival | competicao | workshop | audicao | ensaio_geral | outro
  type: varchar("type", { length: 30 }).default("recital").notNull(),
  description: text("description"),
  venueName: varchar("venueName", { length: 255 }),
  venueAddress: text("venueAddress"),
  startsAt: timestamp("startsAt").notNull(),
  endsAt: timestamp("endsAt"),
  // planejado | confirmado | realizado | cancelado
  status: varchar("status", { length: 30 }).default("planejado").notNull(),
  // Exige autorização de imagem/participação dos participantes
  requiresAuthorization: boolean("requiresAuthorization").default(true).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
}, (table) => [
  index("events_org_idx").on(table.organizationId, table.startsAt),
  index("events_org_status_idx").on(table.organizationId, table.status),
]);

export type DanceEvent = typeof events.$inferSelect;
export type InsertDanceEvent = typeof events.$inferInsert;

/** Coreografias do evento + ordem de apresentação no palco. */
export const eventChoreographies = pgTable("event_choreographies", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  eventId: integer("eventId").notNull(),
  coreografiaId: integer("coreografiaId").notNull(),
  ordem: integer("ordem").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("event_choreographies_unique").on(table.eventId, table.coreografiaId),
  index("event_choreographies_event_idx").on(table.eventId),
]);

export type EventChoreography = typeof eventChoreographies.$inferSelect;
export type InsertEventChoreography = typeof eventChoreographies.$inferInsert;

/** Participantes do evento + autorizações (imagem/participação) e confirmação. */
export const eventParticipants = pgTable("event_participants", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  eventId: integer("eventId").notNull(),
  studentId: integer("studentId").notNull(),
  // convidado | confirmado | recusado
  status: varchar("status", { length: 30 }).default("convidado").notNull(),
  imageAuthorization: boolean("imageAuthorization").default(false).notNull(),
  participationAuthorization: boolean("participationAuthorization").default(false).notNull(),
  // Responsável que autorizou (para menores)
  guardianName: varchar("guardianName", { length: 255 }),
  costumeNotes: text("costumeNotes"),
  notes: text("notes"),
  confirmedAt: timestamp("confirmedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("event_participants_unique").on(table.eventId, table.studentId),
  index("event_participants_student_idx").on(table.studentId),
  index("event_participants_org_idx").on(table.organizationId),
]);

export type EventParticipant = typeof eventParticipants.$inferSelect;
export type InsertEventParticipant = typeof eventParticipants.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════════
// FIGURINOS / VESTUÁRIO (DancePro) — acervo + empréstimos por aluno/coreografia
// Controle de saída e devolução com disponibilidade calculada em tempo real.
// ═══════════════════════════════════════════════════════════════════════════════

export const costumes = pgTable("costumes", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  createdByUserId: integer("createdByUserId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  // Código/tombamento interno (ex.: "FIG-001")
  code: varchar("code", { length: 60 }),
  // saia | collant | sapatilha | top | calca | acessorio | uniforme | outro
  type: varchar("type", { length: 60 }).default("outro").notNull(),
  size: varchar("size", { length: 30 }),
  color: varchar("color", { length: 60 }),
  // Quantidade de unidades deste item
  quantity: integer("quantity").default(1).notNull(),
  // novo | bom | usado | danificado
  condition: varchar("condition", { length: 30 }).default("bom").notNull(),
  cost: decimal("cost", { precision: 10, scale: 2 }).default("0.00").notNull(),
  // Preço de venda na Loja (0 = não à venda)
  salePrice: decimal("salePrice", { precision: 10, scale: 2 }).default("0.00").notNull(),
  // Disponível para venda (Loja / Loja do evento)
  sellable: boolean("sellable").default(true).notNull(),
  photoUrl: text("photoUrl"),
  notes: text("notes"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
}, (table) => [
  index("costumes_org_idx").on(table.organizationId, table.active),
  index("costumes_org_name_idx").on(table.organizationId, table.name),
]);

export type Costume = typeof costumes.$inferSelect;
export type InsertCostume = typeof costumes.$inferInsert;

/** Empréstimo de figurino: saída, devolução prevista e devolução efetiva. */
export const costumeLoans = pgTable("costume_loans", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  createdByUserId: integer("createdByUserId").notNull(),
  costumeId: integer("costumeId").notNull(),
  studentId: integer("studentId").notNull(),
  // Vínculos opcionais (coreografia/espetáculo)
  coreografiaId: integer("coreografiaId"),
  eventId: integer("eventId"),
  quantity: integer("quantity").default(1).notNull(),
  checkedOutAt: timestamp("checkedOutAt").defaultNow().notNull(),
  dueDate: date("dueDate"),
  returnedAt: timestamp("returnedAt"),
  // Condição na devolução (novo|bom|usado|danificado)
  conditionOnReturn: varchar("conditionOnReturn", { length: 30 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
}, (table) => [
  index("costume_loans_costume_idx").on(table.costumeId),
  index("costume_loans_student_idx").on(table.studentId),
  index("costume_loans_org_idx").on(table.organizationId, table.returnedAt),
]);

export type CostumeLoan = typeof costumeLoans.$inferSelect;
export type InsertCostumeLoan = typeof costumeLoans.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════════
// VENDAS DE FIGURINO / LOJA (Epic 3) — venda avulsa ou dentro do evento
// Estoque disponível = quantity − empréstimos ativos − vendas não canceladas.
// ═══════════════════════════════════════════════════════════════════════════════

export const costumeSales = pgTable("costume_sales", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  costumeId: integer("costumeId").notNull(),
  studentId: integer("studentId").notNull(),
  // Vínculo opcional com evento (Loja do evento)
  eventId: integer("eventId"),
  quantity: integer("quantity").default(1).notNull(),
  unitPrice: decimal("unitPrice", { precision: 10, scale: 2 }).default("0.00").notNull(),
  totalPrice: decimal("totalPrice", { precision: 10, scale: 2 }).default("0.00").notNull(),
  // mensalidade | avulso
  paymentMode: varchar("paymentMode", { length: 20 }).default("mensalidade").notNull(),
  // Desconto aplicado na venda (%)
  discountPercent: decimal("discountPercent", { precision: 5, scale: 2 }).default("0.00").notNull(),
  // Venda sob encomenda (sem estoque disponível, permitida pelas regras)
  madeToOrder: boolean("madeToOrder").default(false).notNull(),
  // pendente | pago | cancelado
  status: varchar("status", { length: 20 }).default("pendente").notNull(),
  notes: text("notes"),
  createdByUserId: integer("createdByUserId").notNull(),
  // Cobrança gerada na Loja (asaas | mercadopago | infinitepay | pixkey) — conciliação automática
  paymentProvider: varchar("paymentProvider", { length: 20 }),
  externalPaymentId: varchar("externalPaymentId", { length: 80 }),
  paymentLink: text("paymentLink"),
  // PIX copia-e-cola gerado (para reexibir/reenviar sem nova chamada)
  pixPayload: text("pixPayload"),
  paidAt: timestamp("paidAt"),
  canceledAt: timestamp("canceledAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
}, (table) => [
  index("costume_sales_org_idx").on(table.organizationId, table.status),
  index("costume_sales_event_idx").on(table.eventId),
  index("costume_sales_student_idx").on(table.studentId),
  index("costume_sales_costume_idx").on(table.costumeId),
]);

export type CostumeSale = typeof costumeSales.$inferSelect;
export type InsertCostumeSale = typeof costumeSales.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════════
// TURMAS (DancePro) — turmas fixas com vagas e lista de espera
// Diferente da aula (lessons): a turma é o "contrato coletivo" com grade semanal,
// capacidade e fila de espera. A promoção da espera é automática ao abrir vaga.
// ═══════════════════════════════════════════════════════════════════════════════

export const turmas = pgTable("turmas", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  createdByUserId: integer("createdByUserId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  // FK lógica → instruments.id (modalidade/ritmo)
  modalidadeId: integer("modalidadeId"),
  // FK lógica → users.id (professor responsável)
  professorId: integer("professorId"),
  // FK lógica → studio_rooms.id
  studioRoomId: integer("studioRoomId"),
  // Grade semanal: 0=Dom ... 6=Sáb
  weekdays: jsonb("weekdays").$type<number[]>().default([]).notNull(),
  timeStr: varchar("timeStr", { length: 5 }),
  durationMinutes: integer("durationMinutes").default(60).notNull(),
  capacity: integer("capacity").default(20).notNull(),
  // Faixa etária recomendada (ex.: 6–9 anos) — alerta, não bloqueia
  ageMin: integer("ageMin"),
  ageMax: integer("ageMax"),
  // Turno personalizável definido pela escola (Configurações → Escola → Turnos)
  shift: varchar("shift", { length: 40 }),
  // iniciante | intermediario | avancado | todas
  level: varchar("level", { length: 30 }).default("todas").notNull(),
  // ativa | pausada | encerrada
  status: varchar("status", { length: 30 }).default("ativa").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
}, (table) => [
  index("turmas_org_idx").on(table.organizationId, table.status),
  index("turmas_org_modalidade_idx").on(table.organizationId, table.modalidadeId),
]);

export type Turma = typeof turmas.$inferSelect;
export type InsertTurma = typeof turmas.$inferInsert;

/** Matrícula em turma: ativa (vaga) ou espera (fila com posição). */
export const turmaAlunos = pgTable("turma_alunos", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  turmaId: integer("turmaId").notNull(),
  studentId: integer("studentId").notNull(),
  // ativa | espera | cancelada
  status: varchar("status", { length: 30 }).default("ativa").notNull(),
  position: integer("position").default(0).notNull(),
  enrolledAt: timestamp("enrolledAt").defaultNow().notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("turma_alunos_unique").on(table.turmaId, table.studentId),
  index("turma_alunos_student_idx").on(table.studentId),
  index("turma_alunos_org_idx").on(table.organizationId, table.status),
]);

export type TurmaAluno = typeof turmaAlunos.$inferSelect;
export type InsertTurmaAluno = typeof turmaAlunos.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════════
// SAÚDE & CONDICIONAMENTO FÍSICO (DancePro) — interno da escola
// Avaliações periódicas (peso, flexibilidade, condicionamento) e histórico de
// lesões/restrições — segurança e evolução técnica do bailarino.
// ═══════════════════════════════════════════════════════════════════════════════

export const studentHealthRecords = pgTable("student_health_records", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  studentId: integer("studentId").notNull(),
  recordedByUserId: integer("recordedByUserId").notNull(),
  recordDate: date("recordDate").notNull(),
  weightKg: decimal("weightKg", { precision: 5, scale: 2 }),
  heightCm: integer("heightCm"),
  flexibilityCm: decimal("flexibilityCm", { precision: 5, scale: 1 }),
  // ruim | regular | bom | excelente
  conditioning: varchar("conditioning", { length: 20 }),
  injuryNotes: text("injuryNotes"),
  restrictions: text("restrictions"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("student_health_records_student_idx").on(table.studentId, table.recordDate),
  index("student_health_records_org_idx").on(table.organizationId),
]);

export type StudentHealthRecord = typeof studentHealthRecords.$inferSelect;
export type InsertStudentHealthRecord = typeof studentHealthRecords.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════════
// NPS — PESQUISA DE SATISFAÇÃO (DancePro)
// Resposta única por aluno (0–10) + comentário. Cálculo: promotores 9–10,
// neutros 7–8, detratores 0–6; NPS = %promotores − %detratores.
// ═══════════════════════════════════════════════════════════════════════════════

export const npsResponses = pgTable("nps_responses", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  studentId: integer("studentId"),
  // 0 a 10 (obrigatório)
  score: integer("score").notNull(),
  comment: text("comment"),
  // portal | manual | whatsapp
  source: varchar("source", { length: 30 }).default("portal").notNull(),
  // quem registrou (null = resposta do próprio aluno pelo portal)
  createdByUserId: integer("createdByUserId"),
  respondedAt: timestamp("respondedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("nps_responses_org_idx").on(table.organizationId, table.respondedAt),
  index("nps_responses_student_idx").on(table.studentId),
]);

export type NpsResponse = typeof npsResponses.$inferSelect;
export type InsertNpsResponse = typeof npsResponses.$inferInsert;

