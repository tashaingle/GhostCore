import "server-only";

export const APP_STORE_API = "https://api.appstoreconnect.apple.com";

export const APP_STORE_LIMITS = {
  apps: 20,
  storedApps: 200,
  reviewsPerApp: 50,
  reviewPages: 2,
  initialReviewDays: 30,
  requests: 40,
  // Apple rejects tokens that live longer than 20 minutes.
  tokenSeconds: 15 * 60,
  timeoutMs: 15_000,
} as const;
