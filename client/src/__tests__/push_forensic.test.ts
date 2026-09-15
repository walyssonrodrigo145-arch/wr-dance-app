import { describe, it, expect, vi } from 'vitest';
import { VAPID_KEY, urlBase64ToUint8Array } from '../lib/firebaseConfig';

describe('Auditoria Forense — WebPush & FCM', () => {
  it('Etapa 7: Validação e decode da VAPID key', () => {
    expect(VAPID_KEY).toBeDefined();
    expect(typeof VAPID_KEY).toBe('string');
    expect(VAPID_KEY.length).toBe(87);

    const bytes = urlBase64ToUint8Array(VAPID_KEY);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBe(65); // Chave pública P-256 descompressa tem 65 bytes (0x04 + 32 bytes X + 32 bytes Y)
  });

  it('Etapa 13: Estrutura do Teste Isolado e Mocks de PushManager', async () => {
    const mockSubscribe = vi.fn().mockResolvedValue({
      endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint-123',
      toJSON: () => ({
        endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint-123',
        keys: { p256dh: 'mockP256dh', auth: 'mockAuth' }
      })
    });

    const mockPushManager = {
      subscribe: mockSubscribe,
      getSubscription: vi.fn().mockResolvedValue(null)
    };

    expect(mockPushManager.subscribe).toBeDefined();
    const sub = await mockPushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_KEY)
    });

    expect(sub.endpoint).toContain('fcm.googleapis.com');
  });
});
