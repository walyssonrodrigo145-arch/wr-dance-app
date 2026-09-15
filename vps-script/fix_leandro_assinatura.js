// Correção financeira: assinatura MusicPro da org 29 (Leandro Alves Ribeiro).
// 1) Baixa (receiveInCash) da cobrança pendente de setembro.
// 2) Cria NOVA cobrança de outubro (venc 2026-10-13) — única que fica em aberto.
require('dotenv').config({ path: '.env' });

const BASE = (process.env.ASAAS_BASE_URL || 'https://api.asaas.com/api/v3').replace(/\/+$/, '');
const KEY = (process.env.ASAAS_API_KEY || '').trim();
if (!KEY) { console.error('ASAAS_API_KEY ausente'); process.exit(1); }

const SEP_PAY = 'pay_kkxybqm1bvpniqqt';
const CUSTOMER = 'cus_000193319581';

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { access_token: KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

(async () => {
  // ── 1. Baixa da mensalidade de setembro (mês 9) ──
  console.log('1) receiveInCash na cobrança de setembro...');
  const baixa = await api('POST', `/payments/${SEP_PAY}/receiveInCash`, {
    paymentDate: '2026-09-14',
    value: 49.99,
  });
  console.log('HTTP', baixa.status, JSON.stringify({
    id: baixa.json?.id, status: baixa.json?.status, paymentDate: baixa.json?.paymentDate,
    value: baixa.json?.value, errors: baixa.json?.errors,
  }, null, 2));

  if (baixa.status >= 400) {
    console.error('FALHA na baixa — abortando antes de criar a nova cobrança.');
    process.exit(2);
  }

  // ── 2. Nova cobrança do mês 10 (única em aberto) ──
  console.log('\n2) Criando nova cobrança de outubro...');
  const nova = await api('POST', '/payments', {
    customer: CUSTOMER,
    billingType: 'UNDEFINED',
    value: 49.99,
    dueDate: '2026-10-13',
    description: 'Assinatura MusicPro - Plano MusicPro Essencial (MONTHLY) - 10/2026',
  });
  console.log('HTTP', nova.status, JSON.stringify({
    id: nova.json?.id, status: nova.json?.status, dueDate: nova.json?.dueDate,
    value: nova.json?.value, invoiceUrl: nova.json?.invoiceUrl, errors: nova.json?.errors,
  }, null, 2));

  // ── 3. Estado final do customer ──
  const fin = await api('GET', `/payments?customer=${CUSTOMER}&limit=100`);
  console.log('\n===== ESTADO FINAL (cobranças do customer) =====');
  (fin.json?.data || []).forEach((p) => {
    console.log(JSON.stringify({ id: p.id, status: p.status, dueDate: p.dueDate, value: p.value, paymentDate: p.paymentDate }));
  });
})();
