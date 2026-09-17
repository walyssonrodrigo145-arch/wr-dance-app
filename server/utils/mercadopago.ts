import { ENV } from "../_core/env";

export interface MPPreferenceItem {
  title: string;
  quantity: number;
  currency_id: string;
  unit_price: number;
}

export interface MPPreferencePayer {
  name: string;
  email: string;
}

export interface CreatePreferenceParams {
  items: MPPreferenceItem[];
  payer: MPPreferencePayer;
  external_reference: string;
  successUrl: string;
}

export async function createMPPreference(
  params: CreatePreferenceParams,
  accessToken: string
) {
  const url = "https://api.mercadopago.com/checkout/preferences";

  const payload = {
    items: params.items,
    payer: params.payer,
    payment_methods: {
      excluded_payment_types: [
        { id: "ticket" }
      ],
      installments: 1
    },
    back_urls: {
      success: params.successUrl,
      failure: params.successUrl,
      pending: params.successUrl,
    },
    // auto_return: "all" redireciona para qualquer status (aprovado, pendente, falha)
    ...(params.successUrl.startsWith("https://") ? { auto_return: "all" } : {}),
    external_reference: params.external_reference,
    notification_url: `${ENV.appUrl || 'https://wrmusicpro.com.br'}/api/webhooks/mercadopago/student?dueId=${params.external_reference}`,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`[MercadoPago] Erro ao criar preferência: ${response.status} - ${errorBody}`);
  }

  const data = await response.json();

  return {
    id: data.id,
    init_point: data.init_point,
    sandbox_init_point: data.sandbox_init_point
  };
}

// ── PIX direto (copia e cola) via API de Pagamentos ──────────────────────────
// POST /v1/payments com payment_method_id=pix. Retorna o QR Code (copia-e-cola)
// para pagamento imediato — usado na Loja. Conciliação pelo webhook /student.
export async function createMPPixPayment(params: {
  transactionAmount: number;
  description: string;
  payerEmail: string;
  externalReference: string;
  notificationUrl: string;
}, accessToken: string): Promise<{
  paymentId: string;
  status: string;
  qrCode: string | null;
  qrCodeBase64: string | null;
  ticketUrl: string | null;
}> {
  const response = await fetch("https://api.mercadopago.com/v1/payments", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": `mp-pix-${params.externalReference}`,
    },
    body: JSON.stringify({
      transaction_amount: Number(params.transactionAmount.toFixed(2)),
      description: params.description,
      payment_method_id: "pix",
      external_reference: params.externalReference,
      notification_url: params.notificationUrl,
      payer: { email: params.payerEmail },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`[MercadoPago] Erro ao criar PIX: ${response.status} - ${errorBody}`);
  }

  const data = await response.json();
  const transactionData = data?.point_of_interaction?.transaction_data ?? {};
  return {
    paymentId: String(data.id),
    status: String(data.status ?? "pending"),
    qrCode: transactionData.qr_code ?? null,
    qrCodeBase64: transactionData.qr_code_base64 ?? null,
    ticketUrl: transactionData.ticket_url ?? null,
  };
}

// ── Saldo da conta Mercado Pago ───────────────────────────────────────────────
// GET /users/me/mercadopago_account/balance — disponível para a conta que recebe.
// Nunca lança: devolve erro tratado para a UI exibir "indisponível".
export async function getMPBalance(accessToken: string): Promise<{
  balance: number | null;
  unavailable: number | null;
  error?: string;
}> {
  const pickAmount = (value: any): number | null => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value?.amount === "number" && Number.isFinite(value.amount)) return value.amount;
    return null;
  };

  try {
    const response = await fetch("https://api.mercadopago.com/users/me/mercadopago_account/balance", {
      headers: { "Authorization": `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      return { balance: null, unavailable: null, error: `HTTP ${response.status}` };
    }
    const data: any = await response.json();
    return {
      balance: pickAmount(data?.available_balance) ?? pickAmount(data?.total_amount),
      unavailable: pickAmount(data?.unavailable_balance),
    };
  } catch (error: any) {
    return { balance: null, unavailable: null, error: error?.message ?? "Falha ao consultar saldo" };
  }
}

// ── Verifica status real de um pagamento na API do Mercado Pago ───────────────
// MP redireciona com ?payment_id=XXX&status=YYY na URL de retorno.
// Esta função consulta a API oficial para garantir que o status é legítimo.
export async function verifyMPPayment(paymentId: string, accessToken: string): Promise<{
  verified: boolean;
  status: string; // "approved" | "pending" | "rejected" | "cancelled" | "in_process"
  externalReference: string | null;
}> {
  const url = `https://api.mercadopago.com/v1/payments/${paymentId}`;
  const response = await fetch(url, {
    headers: { "Authorization": `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    return { verified: false, status: "unknown", externalReference: null };
  }

  const data = await response.json();
  const status = data.status as string;

  // Válido: aprovado (cartão) ou pendente (PIX aguardando confirmação do banco)
  const verified = status === "approved" || status === "pending" || status === "in_process";

  return {
    verified,
    status,
    externalReference: data.external_reference ?? null,
  };
}
