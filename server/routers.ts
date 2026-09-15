// Barrel do router — re-exporta o appRouter dividido por domínio (server/routers/)
// Importado por server/_core/index.ts e para tipos pelo client (client/src/lib/trpc.ts).
export { appRouter, type AppRouter } from "./routers/index";