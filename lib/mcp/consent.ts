/** The consent page Supabase sends people to. Set Authorization Path to this in Supabase Auth. */
export const CONSENT_PATH = "/app/connect/authorize";

export const consentPath = (authorizationId: string) =>
  `${CONSENT_PATH}?authorization_id=${encodeURIComponent(authorizationId)}`;

/** Supabase authorisation IDs are short opaque tokens; anything else is refused before use. */
export const isAuthorizationId = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9._~-]{8,200}$/.test(value);

/** Only follow a redirect back to the client if it's a real web address. */
export function isClientRedirect(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
