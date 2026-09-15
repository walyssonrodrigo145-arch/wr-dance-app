import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    include: ["server/**/*.test.ts", "server/**/*.spec.ts"],
    // AUDIT FIX (infra de testes): env mínimos para importar módulos do server
    // (env.ts falha rápido sem JWT_SECRET/DATABASE_URL). Valores exclusivos de teste.
    env: {
      JWT_SECRET: "test-jwt-secret-not-for-production",
      DATABASE_URL: "postgres://test:test@localhost:5432/test",
      NODE_ENV: "test",
      // Regressão do webhook WhatsApp: token definido → endpoint DEVE exigir autenticação
      WHATSAPP_WEBHOOK_TOKEN: "test-webhook-secret",
    },
  },
});
