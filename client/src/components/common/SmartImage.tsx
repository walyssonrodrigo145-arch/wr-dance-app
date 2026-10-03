import { useState, type ReactNode } from "react";

/**
 * Imagem com fallback elegante: quando a URL está vazia ou falha ao carregar
 * (rede/adblock/404), mostra o `fallback` em vez do ícone de imagem quebrada.
 */
export function SmartImage({
  src,
  alt,
  className,
  fallback,
}: {
  src?: string | null;
  alt?: string;
  className?: string;
  fallback: ReactNode;
}) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return <>{fallback}</>;
  return (
    <img
      src={src}
      alt={alt ?? ""}
      className={className}
      loading="lazy"
      decoding="async"
      onError={() => setBroken(true)}
    />
  );
}
