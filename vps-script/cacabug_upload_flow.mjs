// CAÇA-BUG (runtime em produção): probe do upload de imagens do dispositivo.
// Cria escola de teste, envia um PNG real via uploads.image, valida:
//  1) resposta com URL /uploads/fotos/org_X/...
//  2) GET autenticado → 200 image/png
//  3) GET sem sessão → 401 (isolamento)
//  4) arquivo inválido (MIME mentido) → rejeitado
// Uso: node vps-script/cacabug_upload_flow.mjs

import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";

const BASE_TRPC = process.env.E2E_BASE || "https://dancepro.wrvsystems.com.br/api/trpc";
const BASE_HTTP = BASE_TRPC.replace(/\/api\/trpc\/?$/, "");
const stamp = String(Date.now()).slice(-6);
const schoolEmail = process.env.SCHOOL_EMAIL || `cacabug.upload.${stamp}@gmail.com`;
const schoolPass = process.env.SCHOOL_PASS || `cacabug${stamp}`;
const results = [];

function makeSession() {
  const jar = { cookie: "" };
  const doFetch = async (input, init = {}) => {
    const headers = new Headers(init.headers || {});
    if (jar.cookie) headers.set("cookie", jar.cookie);
    const res = await fetch(input, { ...init, headers });
    const setCookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    if (setCookies.length) jar.cookie = setCookies.map((c) => c.split(";")[0]).join("; ");
    return res;
  };
  return {
    jar,
    client: createTRPCProxyClient({ links: [httpBatchLink({ url: BASE_TRPC, fetch: doFetch, transformer: superjson })] }),
    doFetch,
  };
}

async function step(name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    const ms = Date.now() - started;
    results.push({ name, status: "PASS", detail, ms });
    console.log(`✅ ${name} (${ms}ms) — ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
    return detail;
  } catch (err) {
    const ms = Date.now() - started;
    const message = err?.message || String(err);
    results.push({ name, status: "FAIL", detail: message, ms });
    console.log(`❌ ${name} (${ms}ms) — ${message}`);
    return null;
  }
}

const expect = (cond, message) => { if (!cond) throw new Error(message); return true; };

// PNG 4x4 válido (magic bytes corretos)
const PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAADElEQVR4nGNgIB0AAAA0AAF2Xq7DAAAAAElFTkSuQmCC";

const pub = makeSession();
const admin = makeSession();
let uploadedUrl = null;

if (!process.env.SCHOOL_EMAIL) await step("Cadastro da escola (caçabug upload)", async () => {
  const res = await pub.client.auth.registerWithPlan.mutate({
    name: `Caça-Bug Upload ${stamp}`,
    email: schoolEmail,
    phone: "(11) 97777-3000",
    password: schoolPass,
    planType: "MONTHLY",
    planId: "dancepro_start",
  });
  expect(res?.success !== false, "cadastro sem sucesso");
  return "ok";
});

await step("Login admin", async () => {
  await admin.client.auth.login.mutate({ email: schoolEmail, password: schoolPass, loginType: "professor" });
  return "ok";
});

await step("Upload de PNG válido (uploads.image)", async () => {
  const res = await admin.client.uploads.image.mutate({
    fileName: "teste.png",
    fileType: "image/png",
    base64Data: `data:image/png;base64,${PNG_BASE64}`,
  });
  expect(res?.url?.includes("/uploads/fotos/org_"), `URL inesperada: ${res?.url}`);
  uploadedUrl = res.url;
  return res.url;
});

await step("GET autenticado devolve a imagem (200 image/*)", async () => {
  const res = await admin.doFetch(uploadedUrl);
  expect(res.status === 200, `status ${res.status}`);
  const type = res.headers.get("content-type") || "";
  expect(type.includes("image/png"), `content-type ${type}`);
  return `200 · ${type}`;
});

await step("GET sem sessão é bloqueado (401)", async () => {
  const res = await fetch(uploadedUrl, { headers: { cookie: "" } });
  expect(res.status === 401, `esperava 401, veio ${res.status}`);
  return "401 bloqueado";
});

await step("MIME mentido (PNG dizendo ser JPEG) é rejeitado", async () => {
  let rejected = false;
  try {
    await admin.client.uploads.image.mutate({
      fileName: "fake.jpg",
      fileType: "image/jpeg",
      base64Data: PNG_BASE64,
    });
  } catch {
    rejected = true;
  }
  expect(rejected, "conteúdo divergente deveria ser rejeitado");
  return "rejeitado";
});

await step("Payload inválido (texto puro como imagem) é rejeitado", async () => {
  let rejected = false;
  try {
    await admin.client.uploads.image.mutate({
      fileName: "hack.png",
      fileType: "image/png",
      base64Data: Buffer.from("nao e uma imagem").toString("base64"),
    });
  } catch {
    rejected = true;
  }
  expect(rejected, "texto puro deveria ser rejeitado");
  return "rejeitado";
});

await step("Imagem salva como photoUrl de produto (round-trip)", async () => {
  const prod = await admin.client.figurinos.create.mutate({
    name: `Produto Foto ${stamp}`,
    type: "outro",
    quantity: 1,
    cost: 0,
    salePrice: 10,
    sellable: true,
    photoUrl: uploadedUrl,
  });
  expect(prod?.id, "produto não criado");
  const rows = await admin.client.figurinos.list.query({});
  const found = rows.find((r) => r.id === prod.id);
  expect(found?.photoUrl === uploadedUrl, "photoUrl não persistiu");
  await admin.client.figurinos.delete.mutate({ id: prod.id });
  return "ok";
});

const pass = results.filter((r) => r.status === "PASS").length;
console.log(`\n=============== RESUMO CACABUG UPLOAD ===============`);
console.log(`Passos: ${results.length} · PASS: ${pass} · FAIL: ${results.length - pass}`);
if (!process.env.SCHOOL_EMAIL) console.log(`\nEscola de teste: ${schoolEmail} / ${schoolPass}`);
process.exit(results.length - pass === 0 ? 0 : 1);
