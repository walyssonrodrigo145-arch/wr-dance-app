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
