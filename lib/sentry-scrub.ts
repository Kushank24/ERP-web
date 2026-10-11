/**
 * Shared scrubbing utilities used by all three Sentry configs
 * (client / server / edge).  Nothing in here touches business data —
 * it only REMOVES or SANITIZES it before anything leaves the device.
 */
import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";
import type { StreamedSpanJSON } from "@sentry/core";

// ── URL sanitiser ─────────────────────────────────────────────────────────────
// Strips query strings, fragments, and replaces numeric path segments.
// /offers?id=1234        → /offers
// /api/v1/offers/99      → /api/v1/offers/[id]
// GET https://host/offers/99 → GET /api/v1/offers/[id]  (HTTP span names)
export function sanitizeUrl(url: string | undefined): string {
  if (!url) return "";
  // Handle "METHOD URL" format used in HTTP span names
  const httpMatch = url.match(/^([A-Z]{3,7})\s+(.+)$/);
  if (httpMatch) return `${httpMatch[1]} ${sanitizeUrl(httpMatch[2])}`;
  try {
    const u = new URL(url, "http://x");
    return u.pathname.replace(/\/\d+/g, "/[id]");
  } catch {
    return url.replace(/[?#].*$/, "").replace(/\/\d+/g, "/[id]");
  }
}

// ── Error message sanitiser ───────────────────────────────────────────────────
// Strips amounts (₹1,234.56), offer/SO reference codes (OF-2026-001),
// and long numeric IDs that may appear in error messages.
function sanitizeMessage(msg: string | undefined): string | undefined {
  if (!msg) return msg;
  return msg
    .replace(/₹[\d,. ]+/g, "[amount]")
    .replace(/\b[A-Z]{2,}-\d{3,}\b/g, "[ref]")   // OF-2026-001, SO-001, etc.
    .replace(/\b\d{5,}\b/g, "[id]");              // bare numeric IDs
}

// ── Main event scrubber ───────────────────────────────────────────────────────
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  // 1. Never send any user identity
  delete event.user;

  // 2. Strip ALL request detail; keep only method + sanitized path
  if (event.request) {
    event.request = {
      url: sanitizeUrl(event.request.url),
      method: event.request.method,
      // headers, data, cookies, query_string — all dropped
    };
  }

  // 3. Remove any manually attached extra context (could contain row data)
  delete event.extra;

  // 4. Keep only safe structured contexts (browser, OS, runtime)
  if (event.contexts) {
    const safe: Record<string, unknown> = {};
    if (event.contexts.browser) safe.browser = event.contexts.browser;
    if (event.contexts.os) {
      const os = event.contexts.os as Record<string, unknown>;
      safe.os = { name: os.name };          // name only, not version
    }
    if (event.contexts.runtime) safe.runtime = event.contexts.runtime;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    event.contexts = safe as any;
  }

  // 5. Sanitize exception messages
  if (event.exception?.values) {
    event.exception.values = event.exception.values.map((ex) => ({
      ...ex,
      value: sanitizeMessage(ex.value),
    }));
  }

  // 6. Sanitize log message if present
  if (event.message) {
    event.message = sanitizeMessage(event.message);
  }

  // 7. Allow only safe tags; drop anything the app may have attached
  if (event.tags) {
    const SAFE = new Set(["environment", "release", "transaction"]);
    for (const k of Object.keys(event.tags)) {
      if (!SAFE.has(k)) delete event.tags[k];
    }
  }

  return event;
}

// ── Breadcrumb scrubber ───────────────────────────────────────────────────────
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  // Drop network breadcrumbs — URLs like /api/v1/offers/123 expose record IDs
  if (breadcrumb.category === "fetch" || breadcrumb.category === "xhr") {
    return null;
  }
  // Drop console breadcrumbs — may contain logged API response data
  if (breadcrumb.category === "console") {
    return null;
  }
  // Keep navigation but strip query params (?id=123, ?company_id=456)
  if (breadcrumb.category === "navigation") {
    return {
      ...breadcrumb,
      data: {
        from: sanitizeUrl(breadcrumb.data?.from as string | undefined),
        to:   sanitizeUrl(breadcrumb.data?.to   as string | undefined),
      },
    };
  }
  // UI click breadcrumbs are safe (element targets, no data values)
  return breadcrumb;
}

// ── Span scrubber (performance tracing) ──────────────────────────────────────
// Called for every span before it leaves the browser.
// Keeps timing data; strips any URL detail that carries record IDs or query params.
export function scrubSpan(span: StreamedSpanJSON): StreamedSpanJSON {
  const attrs = span.attributes as Record<string, unknown>;
  const cleaned: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(attrs)) {
    // Drop query strings entirely
    if (key === "url.query" || key === "http.query") continue;
    // Drop full request/response bodies
    if (key.startsWith("http.request.body") || key === "http.response.body.content") continue;
    // Sanitize URL-bearing attributes
    if (
      (key === "url.full" || key === "url.path" || key === "http.url" || key === "http.target") &&
      typeof value === "string"
    ) {
      cleaned[key] = sanitizeUrl(value);
    } else {
      cleaned[key] = value;
    }
  }

  return {
    ...span,
    // Span name for HTTP spans looks like "GET https://host/api/v1/offers/99"
    name: sanitizeUrl(span.name) || span.name,
    attributes: cleaned as StreamedSpanJSON["attributes"],
  };
}
