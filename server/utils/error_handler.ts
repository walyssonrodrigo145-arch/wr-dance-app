import { TRPCError } from "@trpc/server";

export function handleDbError(error: any, context: string = "operação"): never {
  console.error(`[DB Error] ${context}:`, error);

  // Se já for um erro do tRPC, apenas repassamos
  if (error instanceof TRPCError) {
    throw error;
  }

  const message = error.message || "";
  const detail = error.detail || "";
  const code = error.code || "UNKNOWN";
  const hint = error.hint || "";
  const column = error.column || "";
  
  // Log completo no servidor para debug profundo
  console.error(`[DB Error Details] Code: ${code}, Detail: ${detail}, Hint: ${hint}, Column: ${column}`);
  console.error(`[Full Error Object] ${JSON.stringify(error)}`);

  // Mapeamento de erros comuns do PostgreSQL/Drizzle
  if (code === '23505' || message.includes("unique constraint") || message.includes("duplicate key")) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Este registro já existe (e-mail ou identificador duplicado).",
    });
  }

  if (code === '23503' || message.includes("foreign key constraint")) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Não foi possível realizar esta ação pois existem registros dependentes.",
    });
  }

  // Erro de NOT NULL (específico para studentId)
  if (code === '23502' || (message.includes("null value") && message.includes("not-null constraint"))) {
     throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Erro de integridade: O campo '${column || "desconhecido"}' não pode ser nulo. A migração automática está tentando corrigir isso, por favor reinicie o servidor.`,
    });
  }

  if (message.includes("lesson_status") && message.includes("invalid input value")) {
     throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "O status selecionado não é suportado pelo sistema no momento.",
    });
  }

  // Erro genérico amigável e limpo para o cliente (detalhes técnicos permanecem nos logs do console acima)
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: `Não foi possível ${context}. Por favor, tente novamente ou contate o suporte se o problema persistir.`,
    cause: error,
  });
}
