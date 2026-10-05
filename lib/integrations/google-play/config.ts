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

const PLAY_REQUIRED = [
  ["https://www.googleapis.com/auth/playdeveloperreporting", "Play reporting"],
  ["https://www.googleapis.com/auth/androidpublisher", "Play reviews"],
] as const;

/**
 * Names of the Play permissions still missing.
 * An empty scope means Google granted every permission we asked for: OAuth leaves
 * scope off the token response in that case. `email` may also come back as the
 * userinfo address, so this check only looks for the two Play permissions.
 */
export function missingPlayScopes(scope: string | undefined) {
  const raw = (scope ?? "").trim();
  if (!raw) return [];
  const parts = new Set(raw.split(/[\s,]+/).filter(Boolean));
  return PLAY_REQUIRED.filter(([url]) => !parts.has(url)).map(([, label]) => label);
}

export function scopesGranted(scope: string | undefined) {
  return missingPlayScopes(scope).length === 0;
}
