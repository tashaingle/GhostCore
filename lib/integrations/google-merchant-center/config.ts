import "server-only";

/**
 * Google offers one Merchant API permission, and it can also edit products. There is no
 * read-only version, so the client refuses every call that isn't a read before it is sent.
 */
export const MERCHANT_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/content",
] as const;

export const MERCHANT_LIMITS = {
  accounts: 5,
  storedAccounts: 50,
  productPages: 3,
  productsPerPage: 1000,
  disapprovedProductsPerSync: 50,
  accountIssues: 50,
  // Complete days only; Google keeps updating recent clicks for a few days.
  performanceDays: 14,
  requests: 60,
  timeoutMs: 20_000,
} as const;

export function merchantCenterEnv() {
  const clientId = process.env.GOOGLE_CLIENT_ID,
    clientSecret = process.env.GOOGLE_CLIENT_SECRET,
    redirectUri = process.env.GOOGLE_MERCHANT_CENTER_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri)
    throw new Error("Google Merchant Center isn't set up on this site yet.");
  return {clientId, clientSecret, redirectUri};
}

/** Google leaves scope off the token response when the grant matches the request. */
export function merchantScopeGranted(scope: string | undefined) {
  const raw = (scope ?? "").trim();
  if (!raw) return true;
  return raw.split(/[\s,]+/).includes("https://www.googleapis.com/auth/content");
}
