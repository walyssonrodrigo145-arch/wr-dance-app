import { useEffect } from "react";

const SITE = "https://dancepro.wrmusicpro.com.br";

type SeoOptions = {
  title: string;
  description: string;
  path: string;
  jsonLd?: Record<string, unknown> | null;
};

function upsertMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

/**
 * SEO por rota (client-side): título, description, canonical, Open Graph e
 * JSON-LD. As páginas públicas do DancePro usam este hook para meta correta.
 */
export function useSeo({ title, description, path, jsonLd }: SeoOptions) {
  const jsonLdKey = JSON.stringify(jsonLd ?? null);

  useEffect(() => {
    document.title = title;
    upsertMeta("name", "description", description);
    upsertMeta("property", "og:title", title);
    upsertMeta("property", "og:description", description);
    upsertMeta("property", "og:url", `${SITE}${path}`);
    upsertMeta("name", "twitter:title", title);
    upsertMeta("name", "twitter:description", description);

    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = `${SITE}${path}`;

    const scriptId = "dp-seo-jsonld";
    document.getElementById(scriptId)?.remove();
    if (jsonLdKey && jsonLdKey !== "null") {
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.id = scriptId;
      script.textContent = jsonLdKey;
      document.head.appendChild(script);
    }
  }, [title, description, path, jsonLdKey]);
}

export const SEO_SITE_URL = SITE;
