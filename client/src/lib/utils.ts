import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getFixedUrl(url?: string): string {
  if (!url) return '';
  return url.replace('https://wr-music-app.onrender.com', '');
}
export function maskPhone(value: string) {
  let clean = value.replace(/\D/g, "");
  if (!clean) return "";
  
  let prefix = "";
  if (clean.startsWith("55") && clean.length > 11) {
    prefix = "+55 ";
    clean = clean.substring(2);
  }
  
  if (clean.length <= 2) {
    return prefix + clean;
  }
  
  if (clean.length <= 6) {
    return prefix + `(${clean.slice(0, 2)}) ${clean.slice(2)}`;
  }
  
  return prefix + `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7, 11)}`;
}

/**
 * Converte erros técnicos (Zod JSON, SQL do Postgres, tRPC e falhas de rede)
 * em mensagens claras, elegantes e de fácil compreensão para o usuário.
 */
export function formatFriendlyError(error: any, fallbackMessage: string = "Ocorreu um erro ao realizar a operação."): string {
  if (!error) return fallbackMessage;

  let rawMessage = typeof error === "string" ? error : error?.message || "";

  // 1. Tentar fazer parse se for um JSON retornado pelo Zod (ex: [{"message": "...", "path": [...] }])
  if (rawMessage.startsWith("[") || rawMessage.startsWith("{")) {
    try {
      const parsed = JSON.parse(rawMessage);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
          .map((item: any) => {
            const field = item.path ? item.path.join(".") : "";
            const msg = item.message || "Campo inválido";
            if (msg === "Required") {
              return field ? `O campo "${field}" é obrigatório.` : "Preencha os campos obrigatórios.";
            }
            if (msg.includes("Expected string, received number") || msg.includes("Expected number, received string")) {
              return field ? `Formato inválido no campo "${field}".` : "Formato de dado inválido.";
            }
            return msg;
          })
          .join(", ");
      } else if (parsed.message) {
        rawMessage = parsed.message;
      }
    } catch {
      // Segue para as checagens por padrão
    }
  }

  const lower = rawMessage.toLowerCase();

  // 2. Erros de Banco de Dados / Integridade
  if (lower.includes("unique constraint") || lower.includes("duplicate key") || lower.includes("23505")) {
    return "Já existe um registro cadastrado com estes dados (e-mail, CPF ou identificador em uso).";
  }

  if (lower.includes("foreign key constraint") || lower.includes("23503")) {
    return "Esta ação não pode ser concluída pois existem dados vinculados a este registro.";
  }

  if (lower.includes("not-null constraint") || lower.includes("23502")) {
    return "Por favor, preencha todos os campos obrigatórios em destaque.";
  }

  // 3. Erros de Conexão e Sessão
  if (lower.includes("failed to fetch") || lower.includes("networkerror") || lower.includes("timeout")) {
    return "Falha de conexão com o servidor. Verifique sua internet e tente novamente.";
  }

  if (lower.includes("unauthorized") || lower.includes("não autorizado") || lower.includes("unauthenticated")) {
    return "Sua sessão expirou ou você não possui permissão para esta ação. Faça login novamente.";
  }

  if (lower.includes("forbidden")) {
    return "Você não possui permissão para realizar esta operação.";
  }

  // 4. Limpeza de prefixos técnicos desagradáveis
  let cleaned = rawMessage
    .replace(/^error:\s*/i, "")
    .replace(/^trpcerror:\s*/i, "")
    .replace(/^\[db error\]:\s*/i, "")
    .replace(/\(code:\s*\w+\)/i, "")
    .trim();

  if (cleaned.length > 0 && !cleaned.includes("at Object.") && !cleaned.includes("node_modules")) {
    return cleaned;
  }

  return fallbackMessage;
}

