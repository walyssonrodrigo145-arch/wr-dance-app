import { debugLog } from "../_core/logger";
import crypto from "crypto";

interface SendWhatsAppParams {
  url?: string;
  token?: string | null;
  phone: string;
  message: string;
  mediaUrl?: string | null;
  sessionId?: string;
}

// SEGURANÇA: URLs e tokens do Evolution API NÃO devem ser hardcoded.
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || "http://179.197.76.174:8080";
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || "minha_chave_secreta_123";

const DEFAULT_INSTANCE = "prof_1";

// ─── REGISTRO DE ENVIOS DO BOT ────────────────────────────────────────────────
// Permite ao webhook diferenciar o "eco" de uma mensagem enviada pelo próprio
// bot (fromMe=true) de uma resposta MANUAL digitada pelo professor no celular.
// Sem isso, a resposta manual do professor era ignorada e o robô continuava
// respondendo por cima dele (conflito de atendimento).
interface BotSendRecord {
  messageId: string;
  textHash: string;
  sentAt: number;
}

const BOT_SEND_TTL_MS = 15 * 60 * 1000; // janela de matching do eco (15 min)
const botSentRegistry = new Map<string, BotSendRecord[]>(); // key: `${sessionId}|${cleanPhone}`

function hashWaText(text: string | undefined): string {
  return crypto.createHash("sha256").update(text || "", "utf8").digest("hex");
}

function purgeBotSentRegistry(now = Date.now()) {
  const expiredKeys: string[] = [];
  botSentRegistry.forEach((records: BotSendRecord[], key: string) => {
    const alive = records.filter((r: BotSendRecord) => now - r.sentAt < BOT_SEND_TTL_MS);
    if (alive.length === 0) expiredKeys.push(key);
    else botSentRegistry.set(key, alive);
  });
  for (const k of expiredKeys) {
    botSentRegistry.delete(k);
  }
}

/** Normaliza telefone para comparação com o registro de envios. */
export function normalizeWaPhone(phone: string): string {
  let clean = (phone || "").replace(/\D/g, "");
  if (clean.length === 10 || clean.length === 11) clean = "55" + clean;
  return clean;
}

/**
 * Chave canônica de sessão por contato (RF-005 do PRD de Atendimento).
 * O WhatsApp pode entregar o MESMO número em dois JIDs (com/sem 9º dígito:
 * 5533999958830 vs 553399958830), o que criava sessões duplicadas com
 * históricos divididos. Aqui padronizamos para 55 + DDD + número com 9.
 */
export function canonicalizeWaPhone(phone: string): string {
  let digits = (phone || "").replace(/\D/g, "");
  // BR antigo sem o 9º dígito: 55 + DDD(2) + 8 dígitos = 12 dígitos no total
  if (digits.startsWith("55") && digits.length === 12) {
    digits = "55" + digits.slice(2, 4) + "9" + digits.slice(4);
  }
  return digits;
}

/**
 * Registra um envio bem-sucedido do bot (chamado dentro de sendWhatsAppMessage).
 * @param sessionId nome da instância Evolution (ex.: "prof_1")
 * @param phone destinatário (qualquer formato; normalizado internamente)
 * @param messageId id retornado pela Evolution API (matching primário)
 * @param message texto enviado (hash como fallback de matching)
 */
export function registerBotSend(sessionId: string | undefined, phone: string, messageId?: string, message?: string) {
  try {
    const clean = normalizeWaPhone(phone);
    if (!clean) return;
    purgeBotSentRegistry();
    const key = `${sessionId || DEFAULT_INSTANCE}|${clean}`;
    const arr = botSentRegistry.get(key) || [];
    arr.push({ messageId: (messageId || "").trim(), textHash: hashWaText(message), sentAt: Date.now() });
    if (arr.length > 50) arr.splice(0, arr.length - 50);
    botSentRegistry.set(key, arr);
  } catch (_) {
    // registro é best-effort; nunca deve quebrar o envio
  }
}

/**
 * Verifica se uma mensagem recebida via webhook (fromMe=true) corresponde a um
 * envio recente do próprio bot (eco).
 *
 * Matching:
 * - Se AMBOS os lados têm messageId → compara APENAS os ids (o texto é fraco:
 *   o professor pode digitar exatamente a mesma mensagem do bot de propósito).
 * - Fallback por hash do texto apenas quando falta id em algum lado
 *   (ex.: resposta da Evolution sem key.id).
 *
 * Em caso de dúvida retorna false → tratada como mensagem manual do professor
 * (direção segura: pausa o robô).
 */
export function isRecentBotMessage(sessionId: string | undefined, phone: string, messageId?: string, text?: string): boolean {
  try {
    const clean = normalizeWaPhone(phone);
    if (!clean) return false;
    const arr = botSentRegistry.get(`${sessionId || DEFAULT_INSTANCE}|${clean}`);
    if (!arr || arr.length === 0) return false;
    const now = Date.now();
    const mid = (messageId || "").trim();
    const h = hashWaText(text);
    for (const r of arr) {
      if (now - r.sentAt >= BOT_SEND_TTL_MS) continue;
      if (mid && r.messageId) {
        if (mid === r.messageId) return true;
        continue; // ids diferentes = mensagens diferentes, mesmo texto igual
      }
      if (text && r.textHash && r.textHash === h) return true;
    }
    return false;
  } catch (_) {
    return false;
  }
}

// ─── ANTI-BAN: Delay humanizado entre mensagens ───────────────────────────────
// Simula comportamento humano: pausa aleatória entre 3s e 9s.
export function humanDelay(minMs = 3000, maxMs = 9000): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise(r => setTimeout(r, ms));
}

// ─── ANTI-BAN: Backoff exponencial para reenvio em caso de falha ──────────────
// Se a API retornar erro temporário (5xx), espera 2^attempt * 1s antes de tentar de novo.
async function withExponentialBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts = 3
): Promise<T> {
  let lastErr: any;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const waitMs = Math.pow(2, attempt) * 1000 + Math.random() * 500;
      console.warn(`[WhatsApp] Tentativa ${attempt + 1} falhou. Aguardando ${Math.round(waitMs)}ms...`);
      await new Promise(r => setTimeout(r, waitMs));
    }
  }
  throw lastErr;
}

/**
 * Envia uma mensagem de texto ou mídia via Evolution API.
 * Endpoint: POST /message/sendText/{instanceName} ou /message/sendMedia/{instanceName}
 */
export async function sendWhatsAppMessage({ url, token, phone, message, mediaUrl, sessionId }: SendWhatsAppParams): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const baseUrl = (url || EVOLUTION_API_URL).replace(/\/+$/, "");
    const activeToken = token || EVOLUTION_API_KEY;

    // Higienização do telefone: manter apenas dígitos
    let cleanPhone = phone.replace(/\D/g, "");
    if (!cleanPhone) {
      return { success: false, error: "Telefone inválido para envio." };
    }

    // Se o número tiver 10 ou 11 dígitos, provavelmente é do Brasil e o usuário esqueceu o 55
    if (cleanPhone.length === 10 || cleanPhone.length === 11) {
      cleanPhone = "55" + cleanPhone;
    }

    const instanceName = sessionId || DEFAULT_INSTANCE;
    const isMedia = !!(mediaUrl && mediaUrl.trim());
    const endpoint = isMedia 
      ? `${baseUrl}/message/sendMedia/${instanceName}`
      : `${baseUrl}/message/sendText/${instanceName}`;

    // ANTI-BAN: Delay humanizado antes de enviar (3~7s aleatório)
    await humanDelay(3000, 7000);

    // Função auxiliar para tentar o envio
    const trySend = async (phoneToTry: string) => {
      // ANTI-BAN: delay de digitação aleatório entre 2s e 6s simulando pessoa digitando
      const typingDelay = Math.floor(Math.random() * 4000) + 2000;
      const payload: any = isMedia ? {
        number: phoneToTry,
        options: { delay: typingDelay, presence: "composing" },
        mediatype: "image",
        media: mediaUrl,
        caption: message,
        mediaMessage: {
          mediatype: "image",
          caption: message,
          media: mediaUrl
        }
      } : {
        number: phoneToTry,
        options: { delay: typingDelay, presence: "composing" },
        text: message
      };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": activeToken },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeout);

      let responseData: any = {};
      try { responseData = await res.json(); } catch (_) {}

      if (!res.ok) {
        let errorMsg = responseData?.response?.message || responseData?.message || responseData?.error || `HTTP Error ${res.status}`;
        
        // Se falhou o envio com mídia/logo (ex: imagem inacessível), tenta enviar como texto simples para garantir a entrega
        if (isMedia) {
          try {
            console.warn(`[WhatsApp] Envio com imagem/logo falhou (${res.status}). Tentando entrega alternativa como texto...`);
            const fallbackRes = await fetch(`${baseUrl}/message/sendText/${instanceName}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "apikey": activeToken },
              body: JSON.stringify({
                number: phoneToTry,
                options: { delay: typingDelay, presence: "composing" },
                text: message,
              }),
            });
            if (fallbackRes.ok) {
              const fallbackData = await fallbackRes.json().catch(() => ({}));
              registerBotSend(instanceName, phoneToTry, fallbackData?.key?.id, message);
              return { success: true, messageId: fallbackData?.key?.id || `msg-${Date.now()}` };
            }
          } catch (_) {}
        }

        // Retorna um objeto com erro padronizado para tratamento
        if (Array.isArray(errorMsg) && errorMsg.length > 0 && errorMsg[0].exists === false) {
          return { success: false, notFound: true, error: `O número informado não está registrado no WhatsApp.` };
        }

        // ANTI-BAN: Se for erro 5xx (servidor), lança exceção para o backoff tentar de novo
        if (res.status >= 500) {
          throw new Error(`Servidor da API falhou (${res.status}): ${typeof errorMsg === 'object' ? JSON.stringify(errorMsg) : errorMsg}`);
        }

        if (typeof errorMsg === 'object') errorMsg = JSON.stringify(errorMsg);
        return { success: false, error: `Falha na API (${res.status}): ${errorMsg}` };
      }

      registerBotSend(instanceName, phoneToTry, responseData?.key?.id, message);
      return { success: true, messageId: responseData?.key?.id || `msg-${Date.now()}` };
    };

    // ANTI-BAN: Envolve o envio no backoff exponencial para erros de servidor
    let result = await withExponentialBackoff(() => trySend(cleanPhone));

    // Se falhou por número não encontrado E for um celular do Brasil com 9º dígito
    if (!result.success && (result as any).notFound && cleanPhone.length === 13 && cleanPhone.startsWith("55") && cleanPhone[4] === "9") {
      const phoneWithout9 = cleanPhone.substring(0, 4) + cleanPhone.substring(5);
      result = await withExponentialBackoff(() => trySend(phoneWithout9));
    }

    if (!result.success && (result as any).notFound) {
      return { success: false, error: result.error };
    }

    return result;
  } catch (error: any) {
    return { success: false, error: `Erro de conexão com o robô: ${error.message}` };
  }
}

// ─── GESTÃO DE SESSÕES EVOLUTION API v2 ──────────────────────────────────────

interface StartSessionParams {
  url?: string;
  token?: string;
  sessionId: string;
  phoneNumber?: string;
  mode?: "QR_CODE" | "PAIRING_CODE";
}

/**
 * Cria ou conecta uma instância WhatsApp na Evolution API v2.3.7+.
 *
 * Comportamento confirmado via testes na v2.3.7:
 * - Criar com qrcode:true sempre inicializa o Baileys corretamente
 * - GET /instance/connect/{name}              → retorna QR code (base64)
 * - GET /instance/connect/{name}?number=55XX  → tenta pairing code (pode retornar null na v2.3.7)
 * - Se pairing code vier null mas base64 existir, usamos QR como fallback automático
 */
export async function startWhatsAppSession({ url, token, sessionId, phoneNumber, mode }: StartSessionParams) {
  const baseUrl = (url || EVOLUTION_API_URL).replace(/\/+$/, "");
  const activeToken = token || EVOLUTION_API_KEY;

  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  try {
    // ── PASSO 1: Deletar instância anterior ──────────────────────────────────────
    await fetch(`${baseUrl}/instance/delete/${sessionId}`, {
      method: "DELETE",
      headers: { "apikey": activeToken },
    }).catch(() => {});
    await sleep(2000);

    // ── PASSO 2: Número limpo ─────────────────────────────────────────────────────
    let cleanPhone = "";
    if (phoneNumber) {
      cleanPhone = phoneNumber.replace(/\D/g, "");
      if (cleanPhone.length === 10 || cleanPhone.length === 11) {
        cleanPhone = "55" + cleanPhone;
      }
    }

    // ── PASSO 3: Criar instância (sempre qrcode:true para Baileys inicializar) ───
    await fetch(`${baseUrl}/instance/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": activeToken },
      body: JSON.stringify({ instanceName: sessionId, qrcode: true, integration: "WHATSAPP-BAILEYS" }),
    }).catch(() => {});

    // ── PASSO 4: Aguardar state = connecting ─────────────────────────────────────
    for (let i = 0; i < 10; i++) {
      await sleep(1000);
      const stateData = await fetch(`${baseUrl}/instance/connectionState/${sessionId}`, {
        headers: { "apikey": activeToken },
      }).then(r => r.json()).catch(() => ({})) as any;
      const state = stateData?.instance?.state;
      if (state === "connecting" || state === "open") break;
    }

    // Registra o webhook somente após a instância estar criada e respondendo
    await setupEvolutionWebhook(sessionId);

    // ── PASSO 5: Obter QR ou Pairing Code via /connect ───────────────────────────
    let connectUrl = `${baseUrl}/instance/connect/${sessionId}`;
    if (mode === "PAIRING_CODE" && cleanPhone) {
      connectUrl += `?number=${cleanPhone}`;
    }

    let pairingCode = "";
    let qrBase64 = "";

    // Função utilitária para extrair código de pareamento válido (exatamente 8 caracteres alfanuméricos)
    const extractValidPairingCode = (data: any): string => {
      const raw = data?.pairingCode || data?.pairing_code || "";
      if (typeof raw === "string") {
        const clean = raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
        if (clean.length === 8) {
          return `${clean.slice(0, 4)}-${clean.slice(4)}`;
        }
      }
      return "";
    };

    // No modo PAIRING_CODE, o Baileys pode levar alguns segundos adicionais para negociar o código
    const maxAttempts = mode === "PAIRING_CODE" ? 5 : 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const connectData = await fetch(connectUrl, {
        method: "GET",
        headers: { "apikey": activeToken },
      }).then(r => r.json()).catch((e) => {
        console.error(`[WhatsApp] Error fetching connect url (attempt ${attempt}):`, e);
        return {};
      }) as any;

      debugLog(`[WhatsApp] Connect data for ${sessionId} (attempt ${attempt}):`, JSON.stringify(connectData).substring(0, 200));

      pairingCode = extractValidPairingCode(connectData);
      qrBase64 = connectData?.base64 || connectData?.qrcode || (typeof connectData?.code === "string" && connectData.code.length > 20 ? connectData.code : "");

      if (mode === "PAIRING_CODE" && pairingCode) {
        break;
      }
      if (mode === "QR_CODE" && qrBase64) {
        break;
      }
      if (attempt < maxAttempts) {
        await sleep(1500);
      }
    }

    if (mode === "PAIRING_CODE") {
      if (pairingCode) {
        return { success: true, status: "PAIRING" as const, mode: "PAIRING_CODE" as const, pairingCode, qr: "" };
      }
      // Se não retornou pairingCode mas tem QR Code, informa fallback
      if (qrBase64) {
        console.warn(`[WhatsApp] Pairing code indisponível — usando QR Code como fallback para sessão ${sessionId}.`);
        return { success: true, status: "PAIRING" as const, mode: "QR_CODE" as const, pairingCode: "", qr: qrBase64 };
      }
      throw new Error("Falha ao gerar código de pareamento. Verifique o número digitado ou utilize a opção QR Code.");
    }

    return { success: true, status: "PAIRING" as const, mode: "QR_CODE" as const, pairingCode: "", qr: qrBase64 };

  } catch (err: any) {
    return {
      success: false,
      status: "DISCONNECTED" as const,
      mode: (mode || "NONE") as any,
      pairingCode: "",
      qr: "",
      error: err.message,
    };
  }
}

interface SessionStatusParams {
  url?: string;
  token?: string;
  sessionId: string;
}

/**
 * Verifica o estado de conexão de uma instância na Evolution API v2.
 * Endpoint: GET /instance/connectionState/{instanceName}
 *
 * Estados da v2:
 * - "open"       → conectado com sucesso
 * - "connecting" → inicializando / aguardando scan do QR ou código
 * - "close"      → desconectado
 */
export async function getWhatsAppSessionStatus({ url, token, sessionId }: SessionStatusParams) {
  const baseUrl = (url || EVOLUTION_API_URL).replace(/\/+$/, "");
  const activeToken = token || EVOLUTION_API_KEY;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    
    const res = await fetch(`${baseUrl}/instance/connectionState/${sessionId}`, {
      method: "GET",
      headers: { "apikey": activeToken },
      signal: controller.signal
    });
    clearTimeout(timeout);

    const data = await res.json().catch(() => ({})) as any;
    
    if (!res.ok) {
      throw new Error("Instância não existe ou offline");
    }

    const state = data?.instance?.state;

    // state=open → conectado com sucesso
    if (state === "open") {
      return {
        sessionId,
        status: "CONNECTED" as const,
        phone: data?.instance?.owner || "",
        mode: "QR_CODE" as const,
        qr: "",
        pairingCode: "",
      };
    }

    // state=connecting → instância inicializando (Baileys conectando ao WA)
    // Retorna PAIRING e tenta resgatar o QR/Pairing Code
    if (state === "connecting") {
      const connectData = await fetch(`${baseUrl}/instance/connect/${sessionId}`, {
        headers: { "apikey": activeToken }
      }).then(r => r.json()).catch((e) => {
        console.error("[WhatsApp] Error in getSessionStatus polling:", e);
        return {};
      }) as any;

      debugLog(`[WhatsApp] Status polling connect data for ${sessionId}:`, JSON.stringify(connectData).substring(0, 200));

      let statusPairingCode = "";
      const rawCode = connectData?.pairingCode || connectData?.pairing_code || "";
      if (typeof rawCode === "string") {
        const clean = rawCode.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
        if (clean.length === 8) {
          statusPairingCode = `${clean.slice(0, 4)}-${clean.slice(4)}`;
        }
      }

      return {
        sessionId,
        status: "PAIRING" as const,
        phone: "",
        mode: "QR_CODE" as const,
        qr: connectData?.base64 || connectData?.qrcode || "",
        pairingCode: statusPairingCode,
      };
    }

    // state=close ou qualquer outro → desconectado
    return {
      sessionId,
      status: "DISCONNECTED" as const,
      phone: "",
      mode: "QR_CODE" as const,
      qr: "",
      pairingCode: "",
    };
  } catch (err: any) {
    return {
      sessionId,
      status: "DISCONNECTED" as const,
      phone: "",
      mode: "QR_CODE" as const,
      qr: "",
      pairingCode: "",
    };
  }
}

/**
 * Desconecta uma instância da Evolution API.
 * Endpoint: DELETE /instance/logout/{instanceName}
 */
export async function logoutWhatsAppSession({ url, token, sessionId }: SessionStatusParams) {
  const baseUrl = (url || EVOLUTION_API_URL).replace(/\/+$/, "");
  const activeToken = token || EVOLUTION_API_KEY;

  try {
    await fetch(`${baseUrl}/instance/logout/${sessionId}`, {
      method: "DELETE",
      headers: { "apikey": activeToken },
    });
  } catch (err) {}

  return { success: true, message: "Sessão encerrada com sucesso." };
}

/**
 * Força a reconexão de uma sessão existente.
 * Na Evolution API v2, se o connectionState estiver close, chamamos /instance/connect.
 */
export async function reconnectWhatsAppSession({ url, token, sessionId }: SessionStatusParams) {
  const baseUrl = (url || EVOLUTION_API_URL).replace(/\/+$/, "");
  const activeToken = token || EVOLUTION_API_KEY;

  try {
    const controller1 = new AbortController();
    const timeout1 = setTimeout(() => controller1.abort(), 10000);
    const res = await fetch(`${baseUrl}/instance/connectionState/${sessionId}`, {
      method: "GET",
      headers: { "apikey": activeToken },
      signal: controller1.signal
    });
    clearTimeout(timeout1);

    const data = await res.json().catch(() => ({})) as any;
    if (data?.instance?.state === "open") {
       return { success: true, status: "CONNECTED", message: "Já conectado." };
    }

    // Se estiver fechado, chama o connect
    const controller2 = new AbortController();
    const timeout2 = setTimeout(() => controller2.abort(), 10000);
    await fetch(`${baseUrl}/instance/connect/${sessionId}`, {
      method: "GET",
      headers: { "apikey": activeToken },
      signal: controller2.signal
    });
    clearTimeout(timeout2);

    return {
      success: true,
      status: "RECONNECTING",
      message: "Reconexão solicitada.",
    };
  } catch (err: any) {
    console.error(`[WhatsApp] Erro ao reconectar sessão ${sessionId}:`, err.message);
    return { success: false, status: "DISCONNECTED", message: err.message };
  }
}

/**
 * Registra a URL de webhook do app na Evolution API para receber eventos
 */
export async function setupEvolutionWebhook(instanceName: string = DEFAULT_INSTANCE) {
  try {
    const activeToken = EVOLUTION_API_KEY;
    const baseUrl = EVOLUTION_API_URL.replace(/\/+$/, "");

    const publicUrl = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL;
    if (!publicUrl) {
      console.warn("[Evolution API] Não foi possível registrar webhook automaticamente: URL pública não definida.");
      return;
    }

    // AUDIT FIX: incluir o WHATSAPP_WEBHOOK_TOKEN na URL — sem ele, o servidor
    // rejeita as chamadas do webhook (401) após o fechamento de segurança.
    const webhookToken = (process.env.WHATSAPP_WEBHOOK_TOKEN || "").trim();
    const webhookUrl = `${publicUrl.replace(/\/+$/, "")}/api/webhooks/whatsapp${
      webhookToken ? `?token=${encodeURIComponent(webhookToken)}` : ""
    }`;

    const payload = {
      webhook: {
        enabled: true,
        url: webhookUrl,
        byEvents: false,
        base64: false,
        events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"]
      }
    };

    const res = await fetch(`${baseUrl}/webhook/set/${instanceName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": activeToken,
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      debugLog(`[Evolution API] Webhook registrado com sucesso em: ${webhookUrl}`);
    } else {
      const errTxt = await res.text();
      console.error(`[Evolution API] Falha ao registrar webhook: ${errTxt}`);
    }
  } catch (err: any) {
    console.error(`[Evolution API] Erro ao registrar webhook: ${err.message}`);
  }
}

/**
 * Registra o webhook para TODAS as instâncias existentes na Evolution API.
 * Deve ser chamado no startup do servidor para garantir que instâncias já criadas
 * recebam notificações de mensagens corretamente.
 */
export async function setupAllEvolutionWebhooks() {
  try {
    const baseUrl = EVOLUTION_API_URL.replace(/\/+$/, "");
    const publicUrl = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL;
    if (!publicUrl) {
      console.warn("[Evolution API] Não foi possível registrar webhooks: APP_URL não definida.");
      return;
    }

    // Buscar todas as instâncias
    const res = await fetch(`${baseUrl}/instance/fetchInstances`, {
      headers: { "apikey": EVOLUTION_API_KEY },
    });

    if (!res.ok) {
      console.warn(`[Evolution API] Falha ao listar instâncias: ${res.status}`);
      return;
    }

    const instances: any[] = await res.json();
    if (!Array.isArray(instances) || instances.length === 0) {
      debugLog("[Evolution API] Nenhuma instância encontrada para registrar webhook.");
      return;
    }

    for (const inst of instances) {
      const instanceName = inst.name || inst.instance?.instanceName;
      if (!instanceName) continue;
      await setupEvolutionWebhook(instanceName);
    }

    debugLog(`[Evolution API] Webhooks registrados para ${instances.length} instância(s).`);
  } catch (err: any) {
    console.error(`[Evolution API] Erro ao registrar webhooks no startup: ${err.message}`);
  }
}
