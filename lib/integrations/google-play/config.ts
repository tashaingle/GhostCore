import "server-only";

/** OpenID plus the two Play read scopes. Review reads use androidpublisher, which Google does not offer as read-only. */
export const PLAY_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/playdeveloperreporting",
  "https://www.googleapis.com/auth/androidpublisher",
] as const;

export const PLAY_LIMITS = {
  apps: 20,
  storedApps: 100,
  reviewsPerApp: 50,
  reviewPages: 2,
  initialReviewDays: 30,
  crashDays: 7,
  requests: 40,
  timeoutMs: 15_000,
} as const;

export function googlePlayOAuthEnv() {
  const clientId = process.env.GOOGLE_CLIENT_ID,
    clientSecret = process.env.GOOGLE_CLIENT_SECRET,
    redirectUri = process.env.GOOGLE_PLAY_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri)
    throw new Error("Google Play isn't set up on this site yet.");
  return {clientId, clientSecret, redirectUri};
}

/** Google sometimes returns scopes as one comma-separated string. */
export function scopesGranted(scope: string | undefined) {
  const parts = new Set((scope ?? "").split(/[\s,]+/).filter(Boolean));
  return PLAY_SCOPES.every((item) => parts.has(item));
}
