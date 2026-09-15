// Logger condicional — AUDIT F7: debug silencioso em produção.
// Substitui `console.log` de debug. console.error/console.warn permanecem sempre ativos.
export function debugLog(...args: unknown[]): void {
  if (process.env.NODE_ENV !== "production") {
    console.log(...args);
  }
}