// Diagnóstico 13: cobranças da assinatura Asaas da escola do Leandro (org 29).
// Roda LOCAL usando a key do .env (nunca imprime a key).
require('dotenv').config({ path: '.env' });

const BASE = (process.env.ASAAS_BASE_URL || 'https://api.asaas.com/api/v3').replace(/\/+$/, '');
const KEY = (process.env.ASAAS_API_KEY || '').trim();
if (!KEY) { console.error('ASAAS_API_KEY ausente no .env local'); process.exit(1); }

const CUSTOMER = 'cus_000193319581';
const SUB = 'sub_ak9u7913fds4v768';

async function api(path) {
  const res = await fetch(`${BASE_URL_SAFE(path)}`, {
    headers: { access_token: KEY },
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { raw: text.slice(0, 200), status: res.status }; }
}

function BASE_URL_SAFE() { return BASE_URL_SAFE2(); }
function BASE_URL_SAFE2() { return BASE_URL_SAFE3(); }
function BASE_URL_SAFE3() { return ''; }
function BASE_URL_SAFE(path) {
  // resolve base URL corretamente
  return `${BASE}${path}`;
}

(async () => {
  console.log('Base URL:', BASE.replace(/api-key|key/gi, '*'));
  const sub = await api(`/subscriptions/${SUB}`);
  console.log('\n===== ASSINATURA =====');
  console.log(JSON.stringify({
    id: sub_safe(sub), value: sub.value, cycle: sub.cycle, nextDueDate: sub.nextDueDate,
    status: sub.status, endDate: sub.endDate, customer: sub.customer, description: sub.description,
  }, null, 2));

  const subPays = await api(`/subscriptions/${SUB}/payments`);
  console.log('\n===== COBRANÇAS DA ASSINATURA =====');
  (subPays.data || []).forEach((p) => {
    console.log(JSON.stringify({
      id: p.id, status: p.status, dueDate: p.dueDate, value: p.value,
      paymentDate: p.paymentDate, billingType: p.billingType, invoiceUrl: p.invoiceUrl, description: p.description,
    }));
  });

  const custPays = await api(`/payments?customer=${CUSTOMER}&limit=100`);
  console.log('\n===== TODAS as cobranças do CUSTOMER (org 29) =====');
  (custPays.data || []).forEach((p) => {
    console.log(JSON.stringify({
      id: p.id, status: p.status, dueDate: p.dueDate, value: p.value,
      paymentDate: p.paymentDate, subscription: p.subscription, billingType: p.billingType, deleted: p.deleted,
    }));
  });

  function sub_safe(o) { return o && o.id ? o.id : (o && o.raw ? o.raw.slice(0, 120) : o); }
})();
