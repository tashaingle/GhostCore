import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    const {sentryOptions} = await import("./lib/monitoring/sentry-options");
    Sentry.init(sentryOptions);
  }
}

/** Errors in pages, server actions and API routes go to Sentry. */
export const onRequestError = Sentry.captureRequestError;
