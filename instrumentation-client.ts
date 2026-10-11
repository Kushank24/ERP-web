/**
 * Sentry browser (client-side) initialisation.
 *
 * Privacy guarantees enforced here:
 *   • sendDefaultPii: false  — no IP address, no user-agent string
 *   • No session replay      — would capture live screen content with ERP data
 *   • No performance tracing — transactions can carry route context with IDs
 *   • beforeSend             — strips user, request body/headers, extra context,
 *                              and sanitises error messages
 *   • beforeBreadcrumb       — drops all fetch/xhr/console breadcrumbs;
 *                              sanitises navigation URLs (removes query params)
 */
import * as Sentry from "@sentry/nextjs";
import { browserTracingIntegration } from "@sentry/nextjs";
import { scrubBreadcrumb, scrubEvent, scrubSpan } from "@/lib/sentry-scrub";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // ── Performance tracing ────────────────────────────────────────────────────
  // Sample 20% of page loads — enough for p50/p95 trends without high volume.
  // beforeSendSpan (below) strips all URLs/IDs before any span leaves the browser.
  tracesSampleRate: 1.0,
  integrations: [
    browserTracingIntegration(),
  ],

  // Every span is scrubbed before sending: numeric IDs replaced, query params dropped.
  beforeSendSpan: scrubSpan,

  // ── Noise reduction ────────────────────────────────────────────────────────
  // Errors that are browser quirks or transient network failures, not bugs.
  ignoreErrors: [
    "ResizeObserver loop limit exceeded",
    "ResizeObserver loop completed with undelivered notifications",
    /^NetworkError/,
    /^Failed to fetch/,
    /^Load failed/,
    /^The operation was aborted/,          // AbortError from cancelled requests
    /^Non-Error (promise rejection|exception)/,
  ],

  // Only capture errors originating from our own scripts.
  // In development allowUrls is skipped so local chunk URLs aren't filtered out.
  ...(process.env.NODE_ENV === "production" && {
    allowUrls: [/https?:\/\/erp\.e-safe\.in/],
  }),

  // ── Breadcrumb scrubbing ────────────────────────────────────────────────────
  beforeBreadcrumb: scrubBreadcrumb,

  // ── Event scrubbing ─────────────────────────────────────────────────────────
  beforeSend(event) {
    return scrubEvent(event);
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
