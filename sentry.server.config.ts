/**
 * Sentry Node.js (server-side) initialisation.
 *
 * The server runtime can see full API request bodies and database responses.
 * The same scrubbing rules as the client config apply here, with an extra
 * note: never add Sentry ORM/Prisma/Supabase integrations — those would
 * capture query parameters containing real customer data.
 */
import * as Sentry from "@sentry/nextjs";
import { scrubBreadcrumb, scrubEvent } from "@/lib/sentry-scrub";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // ── Sampling ───────────────────────────────────────────────────────────────
  tracesSampleRate: 0,

  // ── Noise reduction ────────────────────────────────────────────────────────
  ignoreErrors: [
    /^ECONNREFUSED/,
    /^ECONNRESET/,
    /^ETIMEDOUT/,
  ],

  // ── Breadcrumb scrubbing ────────────────────────────────────────────────────
  beforeBreadcrumb: scrubBreadcrumb,

  // ── Event scrubbing ─────────────────────────────────────────────────────────
  beforeSend(event) {
    return scrubEvent(event);
  },
});
