import "server-only";

/** Google offers no read-only Business Profile scope; Metric Mage only reads with it. */
export const BUSINESS_PROFILE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/business.manage",
] as const;

export const BUSINESS_PROFILE_LIMITS = {
  locations: 20,
  storedLocations: 200,
  accounts: 10,
  reviewsPerLocation: 50,
  reviewPages: 2,
  initialReviewDays: 30,
  // Google publishes daily activity a few days late, so each sync looks back over a week.
  activityDays: 10,
  requests: 80,
  timeoutMs: 15_000,
} as const;

export function businessProfileOAuthEnv() {
  const clientId = process.env.GOOGLE_CLIENT_ID,
    clientSecret = process.env.GOOGLE_CLIENT_SECRET,
    redirectUri = process.env.GOOGLE_BUSINESS_PROFILE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri)
    throw new Error("Google Business Profile isn't set up on this site yet.");
  return {clientId, clientSecret, redirectUri};
}

/**
 * True when Google granted Business Profile access. Google leaves scope off the token
 * response when the grant matches the request, so an empty scope counts as granted.
 */
export function businessScopeGranted(scope: string | undefined) {
  const raw = (scope ?? "").trim();
  if (!raw) return true;
  return raw.split(/[\s,]+/).includes("https://www.googleapis.com/auth/business.manage");
}
