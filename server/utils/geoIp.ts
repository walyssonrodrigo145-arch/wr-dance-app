/**
 * geoIp.ts — Servico de geolocalizacao por IP com cache em memoria
 */

interface GeoData {
  country: string;
  state: string;
  city: string;
}

const geoCache = new Map<string, GeoData>();

function isPrivateIp(ip: string): boolean {
  if (!ip) return true;
  const clean = ip.replace(/^::ffff:/, "").trim();
  return (
    clean === "127.0.0.1" ||
    clean === "localhost" ||
    clean === "::1" ||
    clean.startsWith("192.168.") ||
    clean.startsWith("10.") ||
    clean.startsWith("172.16.") ||
    clean.startsWith("172.31.")
  );
}

export async function resolveGeoFromIp(rawIp?: string): Promise<GeoData> {
  const ip = (rawIp || "").replace(/^::ffff:/, "").trim();

  // IP local ou ausente
  if (!ip || isPrivateIp(ip)) {
    return {
      country: "Brasil",
      state: "São Paulo",
      city: "São Paulo",
    };
  }

  // Cache hit
  if (geoCache.has(ip)) {
    return geoCache.get(ip)!;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);

    const res = await fetch(`http://ip-api.com/json/${ip}?lang=pt-BR`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && data.status === "success") {
        const geo: GeoData = {
          country: data.country || "Brasil",
          state: data.regionName || "São Paulo",
          city: data.city || "São Paulo",
        };
        geoCache.set(ip, geo);
        return geo;
      }
    }
  } catch (e) {
    // Silently fallback if timeout or offline
  }

  const fallback: GeoData = {
    country: "Brasil",
    state: "São Paulo",
    city: "São Paulo",
  };
  geoCache.set(ip, fallback);
  return fallback;
}
