import type {ErrorEvent} from "@sentry/nextjs";

/**
 * Shared Sentry settings for the browser, server and edge. Sentry only runs when a DSN is set,
 * and never collects personal details: no IP addresses, cookies or request bodies, and email
 * addresses are blanked out of error messages before anything is sent.
 */
export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const scrub = (text: string | undefined) => text?.replace(EMAIL, "[email]");

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  event.message = scrub(event.message);
  for (const exception of event.exception?.values ?? []) exception.value = scrub(exception.value);
  for (const crumb of event.breadcrumbs ?? []) crumb.message = scrub(crumb.message);
  if (event.user) event.user = event.user.id ? {id: event.user.id} : undefined;
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
    delete event.request.headers;
    if (event.request.query_string) event.request.query_string = "[removed]";
  }
  return event;
}

export const sentryOptions = {
  dsn: SENTRY_DSN,
  enabled: Boolean(SENTRY_DSN) && process.env.NODE_ENV === "production",
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  sendDefaultPii: false,
  // A sample of page loads for speed, kept low to stay inside the free plan.
  tracesSampleRate: 0.05,
  beforeSend: scrubEvent,
};
