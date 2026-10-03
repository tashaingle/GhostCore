import "server-only";
import {createHash, randomBytes, timingSafeEqual} from "node:crypto";

/**
 * Mail.ReadBasic is Microsoft's most limited mail permission: sender, recipients, subject and
 * dates, but never the message body, preview or attachments. offline_access lets syncs renew.
 */
export const OUTLOOK_SCOPES = ["openid", "email", "offline_access", "User.Read", "Mail.ReadBasic"];
// "common" accepts both personal Outlook/Hotmail accounts and work or school Microsoft 365 ones.
const AUTHORITY = "https://login.microsoftonline.com/common/oauth2/v2.0";

export function outlookOAuthEnv() {
  const clientId = process.env.MICROSOFT_CLIENT_ID?.trim(),
    clientSecret = process.env.MICROSOFT_CLIENT_SECRET?.trim(),
    redirectUri =
      process.env.OUTLOOK_REDIRECT_URI?.trim() ||
      `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/api/integrations/outlook/callback`;
  if (!clientId || !clientSecret) throw new Error("Outlook isn't set up on this site yet.");
  return {clientId, clientSecret, redirectUri};
}

export const oauthSecret = () => randomBytes(32).toString("base64url");
export const challenge = (v: string) => createHash("sha256").update(v).digest("base64url");
export function stateMatches(a?: string, b?: string | null) {
  if (!a || !b) return false;
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function outlookAuthorisationUrl(state: string, verifier: string) {
  const e = outlookOAuthEnv();
  const q = new URLSearchParams({
    client_id: e.clientId,
    redirect_uri: e.redirectUri,
    response_type: "code",
    response_mode: "query",
    scope: OUTLOOK_SCOPES.join(" "),
    // Always show the account picker, so people can choose which mailbox to connect.
    prompt: "select_account",
    state,
    code_challenge: challenge(verifier),
    code_challenge_method: "S256",
  });
  return `${AUTHORITY}/authorize?${q}`;
}

export type OutlookTokens = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

async function tokenRequest(params: Record<string, string>, request: typeof fetch) {
  const e = outlookOAuthEnv();
  const response = await request(`${AUTHORITY}/token`, {
    method: "POST",
    headers: {"content-type": "application/x-www-form-urlencoded"},
    body: new URLSearchParams({client_id: e.clientId, client_secret: e.clientSecret, ...params}),
  });
  return {ok: response.ok, body: (await response.json()) as OutlookTokens};
}

export async function exchangeOutlookCode(
  code: string,
  verifier: string,
  request: typeof fetch = fetch,
) {
  const {ok, body} = await tokenRequest(
    {
      grant_type: "authorization_code",
      code,
      redirect_uri: outlookOAuthEnv().redirectUri,
      code_verifier: verifier,
      scope: OUTLOOK_SCOPES.join(" "),
    },
    request,
  );
  if (!ok || !body.access_token)
    throw new Error(firstLine(body.error_description) ?? "Microsoft sign-in failed. Try again.");
  if (!/Mail\.ReadBasic|Mail\.Read/i.test(body.scope ?? ""))
    throw new Error("Permission to read your mailbox wasn't granted. Connect again and accept.");
  return body;
}

/** Microsoft issues a new refresh token each time; the caller must store it. */
export function refreshOutlookToken(refreshToken: string, request: typeof fetch = fetch) {
  return tokenRequest(
    {grant_type: "refresh_token", refresh_token: refreshToken, scope: OUTLOOK_SCOPES.join(" ")},
    request,
  );
}

// Microsoft's error descriptions add trace IDs and timestamps on later lines.
const firstLine = (text?: string) => text?.split(/\r?\n/)[0]?.trim() || undefined;
