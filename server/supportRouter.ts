// ─── Suporte / Chamados (bugs e melhorias reportados pelas escolas) ───────────
// Qualquer usuário autenticado (admin/professor) abre um chamado. O dono da
// plataforma (SuperAdmin) lista e atualiza o status pelo Master Panel.
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { supportTickets, organizations, users } from "../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { notifyOwner } from "./_core/notification";
import { isSuperAdmin } from "./superAdminRouter";
import { storagePut } from "./storage";
import { nanoid } from "nanoid";

export const supportRouter = router({
  // Upload de imagem anexa ao chamado (base64 → storage próprio → URL)
  uploadAttachment: protectedProcedure
    .input(z.object({
      fileName: z.string().max(255),
      fileType: z.string().max(100),
      base64Data: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId ?? 0;
      const base64 = input.base64Data.includes(",") ? input.base64Data.split(",")[1] : input.base64Data;
      const buffer = Buffer.from(base64, "base64");
      if (buffer.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Arquivo vazio." });
      if (buffer.length > 8 * 1024 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: "Imagem maior que 8MB." });
      if (!input.fileType.startsWith("image/")) throw new TRPCError({ code: "BAD_REQUEST", message: "Envie apenas imagens (PNG/JPG)." });
      const ext = (input.fileName.split(".").pop() || "png").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);
      const key = `support/org_${orgId}/user_${ctx.user.id}/${nanoid(10)}.${ext}`;
      const { url } = await storagePut(key, buffer, input.fileType);
      return { url };
    }),

  create: protectedProcedure
    .input(z.object({
      category: z.enum(["bug", "melhoria", "duvida", "outro"]).default("melhoria"),
      title: z.string().min(3).max(200),
      description: z.string().min(5).max(5000),
      pageUrl: z.string().max(500).optional(),
      priority: z.enum(["baixa", "media", "alta"]).default("media"),
      attachments: z.array(z.string().max(1000)).max(5).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const [ticket] = await db.insert(supportTickets).values({
        organizationId: ctx.user.organizationId ?? null,
        userId: ctx.user.id,
        category: input.category,
        title: input.title.trim(),
        description: input.description.trim(),
        pageUrl: input.pageUrl ?? null,
        priority: input.priority,
        status: "aberto",
        attachments: input.attachments && input.attachments.length > 0 ? JSON.stringify(input.attachments) : null,
      }).returning({ id: supportTickets.id });

      // Notifica o dono da plataforma (best-effort)
      try {
        const cat = input.category === "bug" ? "Bug" : input.category === "melhoria" ? "Melhoria" : input.category === "duvida" ? "Dúvida" : "Outro";
        await notifyOwner({
          title: `🎫 Novo chamado (${cat})`,
          content: `${ctx.user.name || "Usuário"}: ${input.title}\n\n${input.description}`,
        });
      } catch (e) {
        console.warn("[Support] Falha ao notificar o dono:", e);
      }

      return { success: true, id: ticket.id };
    }),

  // Chamados da escola do usuário (o admin acompanha os da própria escola)
  listMine: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const orgId = ctx.user.organizationId;
    if (!orgId) return [];
    return db.select().from(supportTickets)
      .where(eq(supportTickets.organizationId, orgId))
      .orderBy(desc(supportTickets.createdAt))
      .limit(100);
  }),

  // Todos os chamados (apenas SuperAdmin)
  listAll: isSuperAdmin.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db.select({
      ticket: supportTickets,
      orgName: organizations.name,
      userName: users.name,
      userEmail: users.email,
    }).from(supportTickets)
      .leftJoin(organizations, eq(supportTickets.organizationId, organizations.id))
      .leftJoin(users, eq(supportTickets.userId, users.id))
      .orderBy(desc(supportTickets.createdAt))
      .limit(500);
    return rows.map((r: any) => ({ ...r.ticket, orgName: r.orgName, userName: r.userName, userEmail: r.userEmail }));
  }),

  // Atualiza status/prioridade/resposta (apenas SuperAdmin)
  updateStatus: isSuperAdmin
    .input(z.object({
      id: z.number(),
      status: z.enum(["aberto", "em_andamento", "resolvido", "fechado"]),
      priority: z.enum(["baixa", "media", "alta"]).optional(),
      adminResponse: z.string().max(5000).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const patch: Record<string, any> = { status: input.status, updatedAt: new Date() };
      if (input.priority) patch.priority = input.priority;
      if (input.adminResponse !== undefined) patch.adminResponse = input.adminResponse;
      // Resposta nova → marca como não lida para o cliente (pulso no header)
      if (typeof input.adminResponse === "string" && input.adminResponse.trim() !== "") {
        patch.hasUnreadResponse = true;
      }
      if (input.status === "resolvido" || input.status === "fechado") patch.resolvedAt = new Date();
      await db.update(supportTickets).set(patch).where(eq(supportTickets.id, input.id));
      return { success: true };
    }),

  // Marca as respostas da escola como vistas (para parar o pulso/badge)
  markResponsesRead: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { success: false };
    const orgId = ctx.user.organizationId;
    if (!orgId) return { success: false };
    await db.update(supportTickets)
      .set({ hasUnreadResponse: false, updatedAt: new Date() })
      .where(and(eq(supportTickets.organizationId, orgId), eq(supportTickets.hasUnreadResponse, true)));
    return { success: true };
  }),

  // Quantidade de chamados com resposta nova (badge/pulso no header)
  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return 0;
    const orgId = ctx.user.organizationId;
    if (!orgId) return 0;
    const [row] = await db.select({ c: sql<number>`CAST(count(*) AS INT)` })
      .from(supportTickets)
      .where(and(eq(supportTickets.organizationId, orgId), eq(supportTickets.hasUnreadResponse, true)));
    return Number(row?.c ?? 0);
  }),

  // Contagem de chamados abertos da escola (badge no header)
  openCount: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return 0;
    const orgId = ctx.user.organizationId;
    if (!orgId) return 0;
    const [row] = await db.select({ c: sql<number>`CAST(count(*) AS INT)` })
      .from(supportTickets)
      .where(and(eq(supportTickets.organizationId, orgId), eq(supportTickets.status, "aberto")));
    return Number(row?.c ?? 0);
  }),
});
