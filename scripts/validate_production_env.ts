// Script de validação pré-deploy para produção
// Testa a consistência dos webhooks e variáveis de ambiente sem expor segredos.
import "dotenv/config";
import { ENV } from "../server/_core/env";

console.log("=== CHECKLIST DE CONFIGURAÇÃO DE PRODUÇÃO ===");

const checks = [
  { name: "DATABASE_URL", ok: !!ENV.databaseUrl && !ENV.databaseUrl.includes("password_seguro_db_local") },
  { name: "JWT_SECRET", ok: !!ENV.cookieSecret && ENV.cookieSecret.length >= 32 },
  { name: "ASAAS_API_KEY", ok: !!ENV.asaasApiKey },
  { name: "ASAAS_BASE_URL (produção)", ok: !!ENV.asaasBaseUrl && !ENV.asaasBaseUrl.includes("sandbox") },
  { name: "ASAAS_WEBHOOK_TOKEN", ok: !!ENV.asaasWebhookToken },
  { name: "WHATSAPP_WEBHOOK_TOKEN", ok: !!ENV.whatsappWebhookToken },
  { name: "BOT_WEBHOOK_SECRET", ok: !!process.env.BOT_WEBHOOK_SECRET },
  { name: "SUPER_ADMIN_PASSWORD", ok: !!ENV.superAdminPassword },
  { name: "SUPER_ADMIN_EMAIL", ok: !!ENV.superAdminEmail },
  { name: "APP_URL", ok: ENV.appUrl === "https://wrmusicpro.com.br" },
  { name: "FIREBASE_PROJECT_ID", ok: !!process.env.FIREBASE_PROJECT_ID },
  { name: "FIREBASE_PRIVATE_KEY", ok: !!process.env.FIREBASE_PRIVATE_KEY },
  { name: "VITE_FIREBASE_API_KEY", ok: !!process.env.VITE_FIREBASE_API_KEY },
];

let allOk = true;
checks.forEach((c) => {
  const status = c.ok ? "✅ OK" : "⚠️ ATENÇÃO";
  console.log(`[${status}] ${c.name}`);
  if (!c.ok) allOk = false;
});

console.log("\n--- URLs de Webhook para Configurar em Produção ---");
console.log(`Asaas: ${ENV.appUrl}/api/webhooks/asaas`);
console.log(`WhatsApp (Evolution): ${ENV.appUrl}/api/webhooks/whatsapp?token=${ENV.whatsappWebhookToken ? "CONFIGURADO" : "PENDENTE"}`);
console.log(`Bot Status: ${ENV.appUrl}/api/webhooks/bot-status`);
console.log(`Assinafy: ${ENV.appUrl}/api/webhooks/assinafy`);
console.log(`FocusNFe: ${ENV.appUrl}/api/webhooks/focusnfe`);
console.log(`Mercado Pago: ${ENV.appUrl}/api/webhooks/mercadopago/student`);

if (allOk) {
  console.log("\n🚀 Todas as variáveis e webhooks estão com formato válido!");
} else {
  console.log("\nℹ️ Algumas variáveis estão usando valores de desenvolvimento ou precisam de revisão antes de subir.");
}
