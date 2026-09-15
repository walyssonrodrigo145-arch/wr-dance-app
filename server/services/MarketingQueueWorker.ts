import { debugLog } from "../_core/logger";
import { getDb } from "../db";
import { marketingCampaigns, marketingContacts, marketingJobs, marketingLogs, settings } from "../../drizzle/schema";
import { eq, and, isNull, inArray, sql } from "drizzle-orm";
import { sendWhatsAppMessage } from "../utils/whatsapp";

const WORKER_INTERVAL_MS = 5000; // Check every 5 seconds

export class MarketingQueueWorker {
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;
  private workerId = "worker-" + Math.random().toString(36).substring(7);

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.intervalId = setInterval(() => this.processQueue(), WORKER_INTERVAL_MS);
    debugLog(`[Marketing Worker] Started with ID ${this.workerId}`);
  }

  stop() {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    debugLog(`[Marketing Worker] Stopped`);
  }

  private async processQueue() {
    const db = await getDb();
    if (!db) return;

    try {
      // 1. Find a running campaign that has pending contacts and is ready to process
      const campaigns = await db.select()
        .from(marketingCampaigns)
        .where(eq(marketingCampaigns.status, 'running'));

      for (const campaign of campaigns) {
        await this.processCampaign(db, campaign);
      }
    } catch (error) {
      console.error("[Marketing Worker] Global error:", error);
    }
  }

  private async processCampaign(db: any, campaign: any) {
    try {
      // Check if we should pause due to consecutive errors
      if (campaign.consecutiveErrors >= 5) {
        await db.update(marketingCampaigns)
          .set({ status: 'paused' })
          .where(eq(marketingCampaigns.id, campaign.id));
        console.warn(`[Marketing Worker] Campaign ${campaign.id} auto-paused due to 5 consecutive errors.`);
        return;
      }

      // 2. Fetch the job for this campaign, or create one
      let [job] = await db.select().from(marketingJobs).where(eq(marketingJobs.campaignId, campaign.id));
      if (!job) {
        const [newJob] = await db.insert(marketingJobs).values({
          organizationId: campaign.organizationId,
          campaignId: campaign.id,
          status: 'pending'
        }).returning();
        job = newJob;
      }

      // Enforce rate limiting: wait for minDelay
      // Since it's a fixed interval, we ensure we don't send if the last contact was processed too recently
      if (job.lastProcessedContactId) {
        const [lastContact] = await db.select().from(marketingContacts).where(eq(marketingContacts.id, job.lastProcessedContactId));
        if (lastContact && lastContact.processedAt) {
          const secondsSinceLast = (Date.now() - new Date(lastContact.processedAt).getTime()) / 1000;
          if (secondsSinceLast < campaign.minDelay) {
            // Not enough time has passed. Wait for the next tick.
            return;
          }
        }
      }

      // 3. Find the next pending contact
      const [nextContact] = await db.select()
        .from(marketingContacts)
        .where(
          and(
            eq(marketingContacts.campaignId, campaign.id),
            eq(marketingContacts.status, 'pending')
          )
        )
        .limit(1);

      if (!nextContact) {
        // Campaign completed
        await db.update(marketingCampaigns)
          .set({ status: 'completed', completedAt: new Date() })
          .where(eq(marketingCampaigns.id, campaign.id));
        await db.update(marketingJobs).set({ status: 'completed' }).where(eq(marketingJobs.id, job.id));
        debugLog(`[Marketing Worker] Campaign ${campaign.id} completed.`);
        return;
      }

      // 4. Update contact to processing
      await db.update(marketingContacts).set({ status: 'processing' }).where(eq(marketingContacts.id, nextContact.id));

      // 5. Send message
      const contactVars = { nome: nextContact.name || "Contato", ...((nextContact.variables as Record<string, string>) || {}) };
      const text = this.parseVariables(nextContact.messageText, contactVars);
      
      let success = false;
      let evolutionResponse = null;
      let errorMessage = "";
      
      try {
        // Busca as configurações da organização/usuário para usar a instância pareada real (prof_{userId})
        const [orgSettings] = await db.select().from(settings).where(eq(settings.organizationId, campaign.organizationId));
        const sessionId = orgSettings?.whatsappSessionId || `prof_${campaign.createdBy}`;
        
        evolutionResponse = await sendWhatsAppMessage({ 
          url: orgSettings?.evolutionApiUrl || undefined,
          token: orgSettings?.evolutionApiKey || undefined,
          sessionId: sessionId,
          phone: nextContact.phone, 
          message: text,
          mediaUrl: campaign.mediaUrl || undefined
        });
        
        if (evolutionResponse && (evolutionResponse as any).success === false) {
          success = false;
          errorMessage = (evolutionResponse as any).error || "Falha na resposta do WhatsApp";
        } else {
          success = true;
        }
      } catch (err: any) {
        success = false;
        errorMessage = err.message || "Unknown error";
      }

      // 6. Update Contact & Campaign Stats
      if (success) {
        await db.update(marketingContacts).set({
          status: 'sent',
          processedAt: new Date(),
          evolutionMessageId: evolutionResponse?.messageId
        }).where(eq(marketingContacts.id, nextContact.id));

        await db.update(marketingCampaigns).set({
          sentCount: sql`${marketingCampaigns.sentCount} + 1`,
          consecutiveErrors: 0 // reset
        }).where(eq(marketingCampaigns.id, campaign.id));
        
        await db.insert(marketingLogs).values({
          organizationId: campaign.organizationId,
          campaignId: campaign.id,
          contactId: nextContact.id,
          level: 'info',
          message: 'Mensagem enviada com sucesso',
          response: evolutionResponse
        });
      } else {
        await db.update(marketingContacts).set({
          status: 'failed',
          processedAt: new Date(),
          errorMessage: errorMessage
        }).where(eq(marketingContacts.id, nextContact.id));

        await db.update(marketingCampaigns).set({
          failedCount: sql`${marketingCampaigns.failedCount} + 1`,
          consecutiveErrors: sql`${marketingCampaigns.consecutiveErrors} + 1`
        }).where(eq(marketingCampaigns.id, campaign.id));

        await db.insert(marketingLogs).values({
          organizationId: campaign.organizationId,
          campaignId: campaign.id,
          contactId: nextContact.id,
          level: 'error',
          message: `Falha ao enviar: ${errorMessage}`
        });
      }

      // Update job
      await db.update(marketingJobs).set({ lastProcessedContactId: nextContact.id }).where(eq(marketingJobs.id, job.id));

    } catch (error) {
      console.error(`[Marketing Worker] Error processing campaign ${campaign.id}:`, error);
    }
  }

  private parseVariables(template: string, vars: Record<string, string>): string {
    let result = template;
    for (const [key, value] of Object.entries(vars)) {
      const regex = new RegExp(`{{${key}}}`, "gi");
      result = result.replace(regex, value);
    }
    return result;
  }
}

export const marketingWorker = new MarketingQueueWorker();
