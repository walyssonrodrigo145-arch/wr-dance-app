// ─── Logos reais das plataformas de pagamento (integrações oficiais) ─────────
// Ícones oficiais baixados dos próprios sites:
//   Asaas        → asaas.com
//   Mercado Pago → mercadopago.com.br
//   InfinitePay  → infinitepay.io
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
}

export function AsaasLogoMark({ className }: LogoProps) {
  return (
    <img
      src="/logos/asaas.png"
      alt="Asaas"
      width={512}
      height={512}
      loading="lazy"
      decoding="async"
      className={cn("w-8 h-8 object-contain", className)}
    />
  );
}

export function MercadoPagoLogoMark({ className }: LogoProps) {
  return (
    <img
      src="/logos/mercadopago.png"
      alt="Mercado Pago"
      width={128}
      height={128}
      loading="lazy"
      decoding="async"
      className={cn("w-8 h-8 object-contain", className)}
    />
  );
}

export function InfinitePayLogoMark({ className }: LogoProps) {
  return (
    <img
      src="/logos/infinitepay.png"
      alt="InfinitePay"
      width={128}
      height={128}
      loading="lazy"
      decoding="async"
      className={cn("w-8 h-8 object-contain", className)}
    />
  );
}

export const PAYMENT_BRANDS = {
  asaas: AsaasLogoMark,
  mercadopago: MercadoPagoLogoMark,
  infinitepay: InfinitePayLogoMark,
} as const;

/** Faixa "Pagamentos integrados" usada na landing e na página de preços. */
export function PaymentBrandLogos({ className }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-5", className)}>
      <AsaasLogoMark />
      <MercadoPagoLogoMark />
      <InfinitePayLogoMark />
    </div>
  );
}
