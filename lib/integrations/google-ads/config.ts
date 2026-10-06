import "server-only";

/** Google offers no read-only Ads scope; Metric Mage only runs reporting queries with it. */
export const ADS_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/adwords"] as const;

export const ADS_LIMITS = {
  accounts: 10,
  storedAccounts: 50,
  // Complete days only; Google keeps updating conversions for a few days, so recent days are re-read.
  days: 7,
  campaignsPerDay: 10,
  pages: 5,
  requests: 60,
  timeoutMs: 20_000,
} as const;

export function googleAdsEnv() {
  const clientId = process.env.GOOGLE_CLIENT_ID,
    clientSecret = process.env.GOOGLE_CLIENT_SECRET,
    redirectUri = process.env.GOOGLE_ADS_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri)
    throw new Error("Google Ads isn't set up on this site yet.");
  return {
    clientId,
    clientSecret,
    redirectUri,
    // Google moved access to Cloud projects in 2026; the token is still sent when one is set.
    developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim() || undefined,
    version: /^v\d{2}$/.test(process.env.GOOGLE_ADS_API_VERSION ?? "")
      ? process.env.GOOGLE_ADS_API_VERSION!
      : "v25",
  };
}

/** Google leaves scope off the token response when the grant matches the request. */
export function adsScopeGranted(scope: string | undefined) {
  const raw = (scope ?? "").trim();
  if (!raw) return true;
  return raw.split(/[\s,]+/).includes("https://www.googleapis.com/auth/adwords");
}
