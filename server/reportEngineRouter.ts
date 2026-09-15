import { router, protectedProcedure } from './_core/trpc';
import { z } from 'zod';
import { ReportGenerator } from './report_engine';
import { getDb } from './db';
import { callGemini } from './utils/gemini';
import { resolveAiCredentials } from './utils/aiProvider';
import { buildReportInsightsPrompt, AI_PROMPT_VERSIONS } from './utils/aiPrompts';

export const reportEngineRouter = router({
  generate: protectedProcedure
    .input(
      z.object({
        format: z.enum(['csv', 'excel']),
        title: z.string(),
        company: z.string().optional(),
        period: z.string().optional(),
        columns: z.array(z.string()),
        rows: z.array(z.array(z.any())),
        includeAiInsights: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      let aiInsightsText: string | undefined = undefined;

      if (input.includeAiInsights && input.format === 'excel') {
        const db = await getDb();
        if (db) {
          const { getSettingsByUserId } = await import('./db');
          const settings = await getSettingsByUserId(ctx.user.organizationId!, ctx.user.id);
          // RF-002 (PRD): resolução unificada (suporta gemini|groq|opencode)
          const creds = resolveAiCredentials(settings);

          const todayStr = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
          const systemPrompt = buildReportInsightsPrompt({
            todayStr,
            title: input.title,
            period: input.period,
          });

          const dataStr = JSON.stringify({
            columns: input.columns,
            rows: input.rows.slice(0, 500) // Limite de 500 linhas para não estourar o token limit
          });

          try {
            aiInsightsText = await callGemini(
              [{ role: 'user', content: `Analise estes dados: ${dataStr}` }],
              systemPrompt,
              false,
              creds.apiKey,
              creds.model,
              0.2,
              {
                organizationId: ctx.user.organizationId,
                userId: ctx.user.id,
                feature: 'insights_relatorio',
                promptVersion: AI_PROMPT_VERSIONS.insightsRelatorio,
              }
            );
          } catch (error) {
            console.error("Falha ao gerar AI Insights para o relatório:", error);
            aiInsightsText = "A Inteligência Artificial não conseguiu gerar o relatório devido a uma falha na API ou falta de chave configurada.";
          }
        }
      }

      const report = new ReportGenerator({
        title: input.title,
        company: input.company,
        period: input.period,
        generated_by: ctx.user.name || undefined,
        columns: input.columns,
        rows: input.rows,
        includeAiInsights: input.includeAiInsights,
        aiInsightsText: aiInsightsText,
      });

      if (input.format === 'csv') {
        const csvString = report.exportCSV();
        return { type: 'csv', data: Buffer.from(csvString, 'utf-8').toString('base64') };
      } else {
        const excelBuffer = await report.exportExcel();
        return { type: 'excel', data: excelBuffer.toString('base64') };
      }
    }),
});
