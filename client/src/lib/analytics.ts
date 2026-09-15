/**
 * analytics.ts — MusicPro Analytics Tracker (Sistema Próprio)
 *
 * Substitui o Google Analytics por um tracker 100% próprio.
 * Usa fetch() direto (sem tRPC React context) para funcionar fora do React tree.
 *
 * Funcionalidades:
 * - Gera IDs de visitante (localStorage) e sessão (sessionStorage) únicos
 * - Captura automaticamente page_view, session_start, session_end
 * - Detecta dispositivo, SO, browser, resolução, UTMs
 * - Envia eventos em lote com debounce de 5s para reduzir requests
 * - Mantém heartbeat a cada 30s para o painel de online
 * - Registra dados de heatmap (cliques)
 * - Respeita LGPD: IP mascarado no servidor, sem dados sensíveis no front
 */

// ── Tipos ─────────────────────────────────────────────────────────────────────
export type EventName =
  | "page_view" | "session_start" | "session_end" | "button_click" | "link_click"
  | "signup_started" | "signup_completed" | "trial_started" | "trial_finished"
  | "login" | "logout" | "plan_selected" | "checkout_started" | "pix_generated"
  | "payment_success" | "payment_failed" | "subscription_created" | "subscription_cancelled"
  | "email_open" | "email_click" | "whatsapp_click" | "video_play" | "video_finish"
  | "download" | "upload" | "form_submit" | "search" | "feature_used" | "error" | "api_error"
  | "scroll_depth" | "heatmap_click" | "heatmap_move" | "web_vital";

export interface TrackEventOptions {
  pageUrl?: string;
  pageTitle?: string;
  referrer?: string;
  elementId?: string;
  elementText?: string;
  elementTag?: string;
  value?: string;
  metadata?: Record<string, unknown>;
  timeOnPageSec?: number;
  scrollDepth?: number;
}

type DeviceType = "desktop" | "tablet" | "mobile" | "tv" | "unknown";

// ── Helpers de chamada tRPC via HTTP (sem React context) ──────────────────────
function callTrpc(procedure: string, input: unknown): Promise<unknown> {
  return fetch(`/api/trpc/${procedure}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ json: input }),
    credentials: "include",
  }).catch(() => null);
}

// ── Estado da sessão ──────────────────────────────────────────────────────────
const VISITOR_KEY = "mp_visitor_id";
const SESSION_KEY = "mp_session_id";
const SESSION_START_KEY = "mp_session_start";

let visitorId = "";
let sessionId = "";
let sessionStartTime = 0;
let pageStartTime = 0;
let currentUserId: number | null = null;
let currentUserName: string | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let isInitialized = false;

// Buffer de eventos para envio em lote
const eventBuffer: unknown[] = [];
let batchTimer: ReturnType<typeof setTimeout> | null = null;

// ── Geração de IDs ────────────────────────────────────────────────────────────
function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
}

function getOrCreateVisitorId(): string {
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = generateId();
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    return generateId();
  }
}

function getOrCreateSessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = generateId();
      sessionStorage.setItem(SESSION_KEY, id);
      sessionStorage.setItem(SESSION_START_KEY, String(Date.now()));
    }
    return id;
  } catch {
    return generateId();
  }
}

// ── Detecção de dispositivo/SO/browser ───────────────────────────────────────
function detectDevice(): { device: DeviceType; os: string; browser: string } {
  const ua = navigator.userAgent;

  let device: DeviceType = "desktop";
  if (/Smart[-_]?TV|WebOS|Tizen|netcast/i.test(ua)) device = "tv";
  else if (/iPad|Android.*Tablet/i.test(ua)) device = "tablet";
  else if (/iPhone|Android|Mobile|BlackBerry|Windows Phone/i.test(ua)) device = "mobile";

  let os = "Outros";
  if (/Windows/i.test(ua)) os = "Windows";
  else if (/Mac OS X/i.test(ua) && !/iPhone|iPad/i.test(ua)) os = "macOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone|iPad/i.test(ua)) os = "iOS";
  else if (/Linux/i.test(ua)) os = "Linux";

  let browser = "Outros";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/OPR|Opera/i.test(ua)) browser = "Opera";
  else if (/Firefox/i.test(ua)) browser = "Firefox";
  else if (/Chrome/i.test(ua)) browser = "Chrome";
  else if (/Safari/i.test(ua)) browser = "Safari";

  return { device, os, browser };
}

function getScreenRes(): string {
  return `${window.screen.width}x${window.screen.height}`;
}

function getUTMParams(): Record<string, string | null> {
  try {
    const params = new URLSearchParams(window.location.search);
    return {
      utmSource: params.get("utm_source"),
      utmMedium: params.get("utm_medium"),
      utmCampaign: params.get("utm_campaign"),
      utmContent: params.get("utm_content"),
      utmTerm: params.get("utm_term"),
    };
  } catch {
    return { utmSource: null, utmMedium: null, utmCampaign: null, utmContent: null, utmTerm: null };
  }
}

// ── Base do evento ────────────────────────────────────────────────────────────
function buildBaseEvent() {
  const { device, os, browser } = detectDevice();
  const utms = getUTMParams();
  return {
    sessionId,
    visitorId,
    userId: currentUserId,
    deviceType: device,
    os,
    browser,
    screenRes: getScreenRes(),
    utmSource: utms.utmSource,
    utmMedium: utms.utmMedium,
    utmCampaign: utms.utmCampaign,
    utmContent: utms.utmContent,
    utmTerm: utms.utmTerm,
    pageUrl: window.location.href,
    pageTitle: document.title,
    referrer: document.referrer || null,
  };
}

// ── Buffer de envio em lote ───────────────────────────────────────────────────
function flushEventBuffer() {
  if (eventBuffer.length === 0) return;
  const events = eventBuffer.splice(0, 50);
  callTrpc("analytics.event.trackBatch", { events }).catch(() => {});
}

function queueEvent(event: unknown) {
  eventBuffer.push(event);
  if (batchTimer) clearTimeout(batchTimer);
  if (eventBuffer.length >= 5) {
    flushEventBuffer();
    return;
  }
  batchTimer = setTimeout(flushEventBuffer, 1000);
}

// ── API Pública ───────────────────────────────────────────────────────────────

/**
 * Rastreia um evento customizado.
 */
export function trackEvent(eventName: EventName, options: TrackEventOptions = {}) {
  if (!isInitialized || typeof window === "undefined") return;

  const timeOnPageSec = options.timeOnPageSec ?? Math.floor((Date.now() - pageStartTime) / 1000);

  queueEvent({
    ...buildBaseEvent(),
    eventName,
    timeOnPageSec,
    ...options,
  });
}

/**
 * Registra um page_view. Chamado automaticamente ao mudar de rota.
 */
export function trackPageView(path: string) {
  if (!isInitialized || typeof window === "undefined") return;

  pageStartTime = Date.now();
  const fullUrl = `${window.location.origin}${path}`;

  queueEvent({
    ...buildBaseEvent(),
    eventName: "page_view" as EventName,
    pageUrl: fullUrl,
    pageTitle: document.title,
    timeOnPageSec: 0,
  });
  flushEventBuffer();
}

/**
 * Define o usuário autenticado para enriquecer os eventos.
 */
export function setAnalyticsUser(id: number | null, name?: string | null) {
  currentUserId = id;
  currentUserName = name ?? null;
}

// ── Scroll Depth ──────────────────────────────────────────────────────────────
const scrollMilestones = new Set<number>();

function setupScrollTracker() {
  window.addEventListener("scroll", () => {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    if (docHeight <= 0) return;
    const depth = Math.round((scrollTop / docHeight) * 100);

    [25, 50, 75, 100].forEach((milestone) => {
      if (depth >= milestone && !scrollMilestones.has(milestone)) {
        scrollMilestones.add(milestone);
        queueEvent({ ...buildBaseEvent(), eventName: "scroll_depth", scrollDepth: milestone });
      }
    });
  }, { passive: true });
}

// ── Heatmap (cliques, movimento, scroll) ──────────────────────────────────────
const heatmapBuffer: Array<{
  xPercent: number;
  yPercent: number;
  eventType: "click" | "move" | "scroll";
  viewportW: number;
  viewportH: number;
}> = [];
let heatmapTimer: ReturnType<typeof setTimeout> | null = null;

export function flushHeatmap() {
  if (heatmapBuffer.length === 0) return;
  const points = heatmapBuffer.splice(0, 100);
  const currentPath = typeof window !== "undefined" ? window.location.pathname : "/";
  callTrpc("analytics.event.heatmap", {
    sessionId,
    pageUrl: currentPath,
    points,
  }).catch(() => {});
}

function scheduleFlush() {
  if (heatmapBuffer.length >= 20) {
    if (heatmapTimer) clearTimeout(heatmapTimer);
    heatmapTimer = null;
    flushHeatmap();
  } else if (!heatmapTimer) {
    heatmapTimer = setTimeout(() => {
      heatmapTimer = null;
      flushHeatmap();
    }, 3_000);
  }
}

function setupHeatmapTracker() {
  if (typeof window === "undefined") return;

  // Track Cliques
  document.addEventListener("click", (e) => {
    const xPercent = parseFloat(((e.clientX / window.innerWidth) * 100).toFixed(2));
    const yPercent = parseFloat(
      (((e.clientY + window.scrollY) / Math.max(document.documentElement.scrollHeight, 1)) * 100).toFixed(2)
    );
    heatmapBuffer.push({
      xPercent,
      yPercent,
      eventType: "click",
      viewportW: window.innerWidth,
      viewportH: window.innerHeight,
    });
    scheduleFlush();
  }, { passive: true });

  // Track Movimento do Mouse (Throttled)
  let lastMoveTime = 0;
  document.addEventListener("mousemove", (e) => {
    const now = Date.now();
    if (now - lastMoveTime < 300) return; // a cada 300ms
    lastMoveTime = now;

    const xPercent = parseFloat(((e.clientX / window.innerWidth) * 100).toFixed(2));
    const yPercent = parseFloat(
      (((e.clientY + window.scrollY) / Math.max(document.documentElement.scrollHeight, 1)) * 100).toFixed(2)
    );
    heatmapBuffer.push({
      xPercent,
      yPercent,
      eventType: "move",
      viewportW: window.innerWidth,
      viewportH: window.innerHeight,
    });
    scheduleFlush();
  }, { passive: true });

  // Track Scroll (Throttled)
  let lastScrollTime = 0;
  window.addEventListener("scroll", () => {
    const now = Date.now();
    if (now - lastScrollTime < 500) return; // a cada 500ms
    lastScrollTime = now;

    const scrollY = window.scrollY;
    const docHeight = Math.max(document.documentElement.scrollHeight, 1);
    const yPercent = parseFloat(((scrollY / docHeight) * 100).toFixed(2));
    heatmapBuffer.push({
      xPercent: 50, // scroll é focado no centro da viewport
      yPercent,
      eventType: "scroll",
      viewportW: window.innerWidth,
      viewportH: window.innerHeight,
    });
    scheduleFlush();
  }, { passive: true });
}

// ── Heartbeat ─────────────────────────────────────────────────────────────────
function startHeartbeat() {
  const sendPing = () => {
    const { device, os, browser } = detectDevice();
    const utms = getUTMParams();
    callTrpc("analytics.event.heartbeat", {
      sessionId,
      visitorId,
      userId: currentUserId,
      userName: currentUserName,
      pageUrl: window.location.href,
      pageTitle: document.title,
      deviceType: device,
      browser,
      os,
      screenRes: getScreenRes(),
      utmSource: utms.utmSource,
      referrer: document.referrer || null,
    }).catch(() => {});
  };

  sendPing();
  heartbeatTimer = setInterval(sendPing, 30_000);
}

// ── Inicialização ─────────────────────────────────────────────────────────────
export function initAnalytics() {
  if (isInitialized || typeof window === "undefined") return;

  visitorId = getOrCreateVisitorId();
  sessionId = getOrCreateSessionId();
  sessionStartTime = parseInt(sessionStorage.getItem(SESSION_START_KEY) ?? String(Date.now()), 10);
  pageStartTime = Date.now();

  const { device, os, browser } = detectDevice();
  const utms = getUTMParams();

  // Inicia a sessão no servidor
  callTrpc("analytics.event.sessionStart", {
    visitor: { visitorId },
    session: {
      sessionId,
      visitorId,
      deviceType: device,
      os,
      browser,
      screenRes: getScreenRes(),
      language: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      referrer: document.referrer || null,
      userAgent: navigator.userAgent.substring(0, 500),
      utmSource: utms.utmSource,
      utmMedium: utms.utmMedium,
      utmCampaign: utms.utmCampaign,
      utmContent: utms.utmContent,
      utmTerm: utms.utmTerm,
    },
  }).catch(() => {});

  setupScrollTracker();
  setupHeatmapTracker();
  startHeartbeat();

  // Flush ao sair da página
  window.addEventListener("beforeunload", () => {
    const durationSec = Math.floor((Date.now() - sessionStartTime) / 1000);
    const timeOnPageSec = Math.floor((Date.now() - pageStartTime) / 1000);

    const endEvent = {
      ...buildBaseEvent(),
      eventName: "session_end" as EventName,
      timeOnPageSec,
      metadata: { durationSec },
    };

    // FIX: sendBeacon é a única forma confiável de enviar dados ao fechar a aba
    // (fetch/XHR são cancelados pelo navegador no beforeunload). Isso garante que
    // o usuário saia da lista de "online" imediatamente.
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(
          "/api/trpc/analytics.event.trackBatch",
          new Blob([JSON.stringify({ json: { events: [endEvent] } })], { type: "application/json" })
        );
      }
    } catch (e) {
      // fallback: envia pela fila normal
      queueEvent(endEvent);
      flushEventBuffer();
    }
    flushHeatmap();
  });

  isInitialized = true;
  console.log("[MusicPro Analytics] Iniciado:", { visitorId, sessionId });
}
