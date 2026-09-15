import { describe, expect, it } from "vitest";
import {
  isVapidSubscription,
  parseSubscription,
  truncateText,
  buildPushPayload,
} from "./pushService";

const validSub = JSON.stringify({
  endpoint: "https://fcm.googleapis.com/wp/v1/abc123/send",
  keys: { p256dh: "P256DH_KEY", auth: "AUTH_KEY" },
});

describe("PRD_PUSH_VAPID_001 — pushService", () => {
  describe("isVapidSubscription — detecção de formato do token", () => {
    it("reconhece JSON de subscrição WebPush", () => {
      expect(isVapidSubscription(validSub)).toBe(true);
    });

    it("rejeita token FCM legado", () => {
      expect(isVapidSubscription("dEj8xJpJk2s:APA91bEXAMPLE")).toBe(false);
    });

    it("rejeita vazio, null-like e lixo", () => {
      expect(isVapidSubscription("")).toBe(false);
      expect(isVapidSubscription("   ")).toBe(false);
      expect(isVapidSubscription("{sem endpoint}")).toBe(false);
    });
  });

  describe("parseSubscription — validação estrutural", () => {
    it("aceita subscrição completa", () => {
      const sub = parseSubscription(validSub);
      expect(sub).not.toBeNull();
      expect(sub!.endpoint).toContain("https://");
      expect(sub!.keys.p256dh).toBe("P256DH_KEY");
    });

    it("rejeita sem keys (p256dh/auth obrigatórios)", () => {
      expect(parseSubscription(JSON.stringify({ endpoint: "https://x/send" }))).toBeNull();
      expect(parseSubscription(JSON.stringify({ endpoint: "https://x/send", keys: { p256dh: "a" } }))).toBeNull();
    });

    it("rejeita endpoint não-https e JSON inválido", () => {
      expect(parseSubscription(JSON.stringify({ endpoint: "http://inseguro/send", keys: { p256dh: "a", auth: "b" } }))).toBeNull();
      expect(parseSubscription("nao-e-json{")).toBeNull();
    });
  });

  describe("truncateText — RN-002 (payload ≤ 4 kB)", () => {
    it("mantém textos curtos intactos", () => {
      expect(truncateText("Desafio aprovado!", 300)).toBe("Desafio aprovado!");
    });

    it("trunca textos longos com reticências", () => {
      const out = truncateText("a".repeat(500), 300);
      expect(out.length).toBe(300);
      expect(out.endsWith("…")).toBe(true);
    });

    it("usa limite padrão de 300 caracteres", () => {
      expect(truncateText("b".repeat(1000)).length).toBe(300);
    });
  });

  describe("buildPushPayload — paridade visual com o FCM atual", () => {
    it("monta notification + data.url e ícones padrão", () => {
      const payload = buildPushPayload("🎯 Novo Desafio!", "Responda antes do prazo.", { id: "7" }, { url: "/aluno" });
      expect(payload.notification.title).toBe("🎯 Novo Desafio!");
      expect(payload.notification.icon).toContain("icon-192.png");
      expect(payload.notification.badge).toContain("icon-badge.png");
      expect(payload.data.url).toBe("/aluno");
      expect(payload.data.id).toBe("7");
      expect(JSON.stringify(payload).length).toBeLessThan(4096);
    });

    it("trunca corpo longo para respeitar o limite do push service", () => {
      const payload = buildPushPayload("T", "x".repeat(2000));
      expect(payload.notification.body.length).toBe(300);
    });
  });
});
