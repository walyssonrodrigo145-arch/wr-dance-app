import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { TRPCError } from "@trpc/server";
import { marketingCampaigns, marketingContacts, marketingLogs, marketingJobs } from "../drizzle/schema";
import { eq, desc, asc, and, sql } from "drizzle-orm";

// Requer super_admin (owner) - verificamos dentro das rotas
const ensureSuperAdmin = (ctx: any) => {
  if (ctx.user.role !== 'admin') {
    throw new TRPCError({ code: "FORBIDDEN", message: "Somente administradores podem acessar." });
  }
};

export const marketingRouter = router({
  getCampaigns: protectedProcedure.query(async ({ ctx }) => {
    ensureSuperAdmin(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    
    // Only fetch campaigns for the current organization
    return await db.select().from(marketingCampaigns)
      .where(eq(marketingCampaigns.organizationId, ctx.user.organizationId!))
      .orderBy(desc(marketingCampaigns.createdAt));
  }),

  createCampaign: protectedProcedure
    .input(z.object({
      name: z.string(),
      description: z.string().optional(),
      mediaUrl: z.string().optional(),
      minDelay: z.number().default(10),
      batchSize: z.number().default(20),
      batchDelay: z.number().default(600),
      contacts: z.array(z.object({
        name: z.string(),
        phone: z.string(),
        messageText: z.string(),
        variables: z.record(z.string()).optional()
      }))
    }))
    .mutation(async ({ ctx, input }) => {
      ensureSuperAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [campaign] = await db.insert(marketingCampaigns).values({
        organizationId: ctx.user.organizationId!,
        name: input.name,
        description: input.description,
        mediaUrl: input.mediaUrl,
        minDelay: input.minDelay,
        maxDelay: input.minDelay, // Ignored logic for variation
        batchSize: input.batchSize,
        batchDelay: input.batchDelay,
        totalContacts: input.contacts.length,
        status: 'draft',
        createdBy: ctx.user.id
      }).returning();

      if (input.contacts.length > 0) {
        const contactsToInsert = input.contacts.map(c => ({
          organizationId: ctx.user.organizationId!,
          campaignId: campaign.id,
          name: c.name,
          phone: c.phone,
          messageText: c.messageText,
          variables: c.variables || {},
          status: 'pending' as const
        }));
        
        // Insert contacts in chunks if large
        const chunkSize = 500;
        for (let i = 0; i < contactsToInsert.length; i += chunkSize) {
          await db.insert(marketingContacts).values(contactsToInsert.slice(i, i + chunkSize));
        }
      }

      return campaign;
    }),

  updateCampaignStatus: protectedProcedure
    .input(z.object({ campaignId: z.number(), status: z.enum(['draft', 'running', 'paused', 'completed', 'error']) }))
    .mutation(async ({ ctx, input }) => {
      ensureSuperAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [updated] = await db.update(marketingCampaigns)
        .set({ status: input.status, updatedAt: new Date() })
        .where(
          and(
            eq(marketingCampaigns.id, input.campaignId),
            eq(marketingCampaigns.organizationId, ctx.user.organizationId!)
          )
        ).returning();

      if (input.status === 'running') {
        await db.update(marketingCampaigns).set({ startedAt: new Date() }).where(eq(marketingCampaigns.id, input.campaignId));
      }

      return updated;
    }),

  getCampaignDetails: protectedProcedure
    .input(z.object({ campaignId: z.number() }))
    .query(async ({ ctx, input }) => {
      ensureSuperAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [campaign] = await db.select()
        .from(marketingCampaigns)
        .where(and(
          eq(marketingCampaigns.id, input.campaignId),
          eq(marketingCampaigns.organizationId, ctx.user.organizationId!)
        ));

      if (!campaign) throw new TRPCError({ code: "NOT_FOUND", message: "Campanha não encontrada" });

      const contacts = await db.select().from(marketingContacts).where(eq(marketingContacts.campaignId, campaign.id));
      const logs = await db.select().from(marketingLogs).where(eq(marketingLogs.campaignId, campaign.id)).orderBy(desc(marketingLogs.createdAt)).limit(100);

      return { campaign, contacts, logs };
    }),

  deleteCampaign: protectedProcedure
    .input(z.object({ campaignId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      ensureSuperAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db.delete(marketingCampaigns)
        .where(
          and(
            eq(marketingCampaigns.id, input.campaignId),
            eq(marketingCampaigns.organizationId, ctx.user.organizationId!)
          )
        );

      return { ok: true };
    }),

  reactivateCampaign: protectedProcedure
    .input(z.object({ campaignId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      ensureSuperAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [campaign] = await db.select()
        .from(marketingCampaigns)
        .where(and(
          eq(marketingCampaigns.id, input.campaignId),
          eq(marketingCampaigns.organizationId, ctx.user.organizationId!)
        ));

      if (!campaign) throw new TRPCError({ code: "NOT_FOUND", message: "Campanha não encontrada." });

      // Resetar status dos contatos da campanha para 'pending'
      await db.update(marketingContacts)
        .set({
          status: "pending",
          processedAt: null,
          errorMessage: null,
        })
        .where(eq(marketingContacts.campaignId, input.campaignId));

      // Limpar jobs de envio pendentes antigos
      await db.delete(marketingJobs)
        .where(eq(marketingJobs.campaignId, input.campaignId));

      // Reiniciar status e contadores da campanha
      const [updated] = await db.update(marketingCampaigns)
        .set({
          status: "running",
          sentCount: 0,
          failedCount: 0,
          consecutiveErrors: 0,
          startedAt: new Date(),
          completedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(marketingCampaigns.id, input.campaignId))
        .returning();

      return updated;
    }),

  editCampaign: protectedProcedure
    .input(z.object({
      campaignId: z.number(),
      name: z.string(),
      messageText: z.string().optional(),
      description: z.string().optional(),
      mediaUrl: z.string().optional(),
      minDelay: z.number().default(10),
      batchSize: z.number().default(20),
      batchDelay: z.number().default(600),
    }))
    .mutation(async ({ ctx, input }) => {
      ensureSuperAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [updated] = await db.update(marketingCampaigns)
        .set({
          name: input.name,
          description: input.description,
          mediaUrl: input.mediaUrl,
          minDelay: input.minDelay,
          maxDelay: input.minDelay,
          batchSize: input.batchSize,
          batchDelay: input.batchDelay,
          updatedAt: new Date(),
        })
        .where(and(
          eq(marketingCampaigns.id, input.campaignId),
          eq(marketingCampaigns.organizationId, ctx.user.organizationId!)
        ))
        .returning();

      if (input.messageText && input.messageText.trim().length > 0) {
        await db.update(marketingContacts)
          .set({ messageText: input.messageText.trim() })
          .where(eq(marketingContacts.campaignId, input.campaignId));
      }

      return updated;
    })
});
