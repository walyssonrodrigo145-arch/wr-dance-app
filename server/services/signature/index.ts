/**
 * signature/index.ts — Fábrica de provedores de assinatura.
 *
 * O restante do sistema nunca deve acessar a API do provedor diretamente:
 * usa a interface SignatureProvider.
 */

import type { SignatureProvider } from "./SignatureProvider";
import { AssinafyProvider } from "./AssinafyProvider";
import { decryptSecret } from "../../utils/integrationCrypto";
import type { SchoolIntegration } from "../../../drizzle/schema";

export type { SignatureProvider } from "./SignatureProvider";

export function getSignatureProvider(integration: {
  provider: string;
  apiKeyEncrypted: string;
  environment: "sandbox" | "production";
  accountId?: string | null;
}): SignatureProvider {
  const apiKey = decryptSecret(integration.apiKeyEncrypted);
  switch (integration.provider) {
    case "assinafy":
      return new AssinafyProvider(apiKey, integration.environment, integration.accountId);
    default:
      throw new Error(`Provedor de assinatura não suportado: ${integration.provider}`);
  }
}

export function providerFromIntegration(
  integration: SchoolIntegration
): SignatureProvider {
  return getSignatureProvider({
    provider: integration.provider,
    apiKeyEncrypted: integration.apiKeyEncrypted,
    environment: integration.environment,
    accountId: integration.accountId,
  });
}
