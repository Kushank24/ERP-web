/**
 * Sentry Edge runtime initialisation (middleware, edge API routes).
 * Identical privacy posture to the server config.
 */
import * as Sentry from "@sentry/nextjs";
import { scrubBreadcrumb, scrubEvent } from "@/lib/sentry-scrub";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0,

  beforeBreadcrumb: scrubBreadcrumb,

  beforeSend(event) {
    return scrubEvent(event);
  },
});
