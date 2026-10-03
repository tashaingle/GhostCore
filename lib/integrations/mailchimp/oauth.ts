import "server-only";
import {randomBytes, timingSafeEqual} from "node:crypto";

const LOGIN = "https://login.mailchimp.com/oauth2";

export function mailchimpOAuthEnv() {
  const clientId = process.env.MAILCHIMP_CLIENT_ID?.trim(),
    clientSecret = process.env.MAILCHIMP_CLIENT_SECRET?.trim(),
    redirectUri =
      process.env.MAILCHIMP_REDIRECT_URI?.trim() ||
      `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/api/integrations/mailchimp/callback`;
  if (!clientId || !clientSecret) throw new Error("Mailchimp isn't set up on this site yet.");
  return {clientId, clientSecret, redirectUri};
}

export const oauthSecret = () => randomBytes(32).toString("base64url");
export function stateMatches(a?: string, b?: string | null) {
  if (!a || !b) return false;
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Mailchimp has no scopes: every app gets account access, so Metric Mage's code only reads. */
export function mailchimpAuthorisationUrl(state: string) {
  const e = mailchimpOAuthEnv();
  return `${LOGIN}/authorize?${new URLSearchParams({
    response_type: "code",
    client_id: e.clientId,
    redirect_uri: e.redirectUri,
    state,
  })}`;
}

export async function exchangeMailchimpCode(code: string, request: typeof fetch = fetch) {
  const e = mailchimpOAuthEnv();
  const response = await request(`${LOGIN}/token`, {
    method: "POST",
    headers: {"content-type": "application/x-www-form-urlencoded"},
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: e.clientId,
      client_secret: e.clientSecret,
      redirect_uri: e.redirectUri,
      code,
    }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !body.access_token)
    throw new Error(body.error_description || "Mailchimp sign-in failed. Try again.");
  return body.access_token;
}

/** Which Mailchimp data centre the account lives in; every API call goes there. */
export async function mailchimpMetadata(token: string, request: typeof fetch = fetch) {
  const response = await request(`${LOGIN}/metadata`, {
    headers: {Authorization: `OAuth ${token}`},
  });
  const body = (await response.json().catch(() => ({}))) as {
    dc?: string;
    accountname?: string;
    api_endpoint?: string;
    login?: {login_email?: string; login_name?: string};
  };
  if (!response.ok || !body.dc || !body.api_endpoint)
    throw new Error("Mailchimp didn't say which account this is. Try connecting again.");
  return body as {
    dc: string;
    api_endpoint: string;
    accountname?: string;
    user_id?: number | string;
    login?: {login_email?: string};
  };
}
