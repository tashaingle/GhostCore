import "server-only";
import {randomBytes, timingSafeEqual} from "node:crypto";
import {metaSocialEnv, metaSocialPermissions} from "./config";

export const newState = () => randomBytes(32).toString("base64url");

export function stateMatches(a: string | undefined, b: string | null) {
  if (!a || !b) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function authorisationUrl(state: string) {
  const env = metaSocialEnv();
  const url = new URL(`https://www.facebook.com/${env.version}/dialog/oauth`);
  url.search = new URLSearchParams({
    client_id: env.appId,
    redirect_uri: env.redirectUri,
    state,
    scope: metaSocialPermissions().join(","),
    response_type: "code",
  }).toString();
  return url.toString();
}

export async function exchangeCode(code: string) {
  const env = metaSocialEnv();
  const shortUrl = new URL(`https://graph.facebook.com/${env.version}/oauth/access_token`);
  shortUrl.search = new URLSearchParams({
    client_id: env.appId,
    client_secret: env.appSecret,
    redirect_uri: env.redirectUri,
    code,
  }).toString();
  const short = await fetch(shortUrl, {signal: AbortSignal.timeout(15_000)});
  const shortBody = (await short.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: {message?: string};
  };
  if (!short.ok || !shortBody.access_token) throw new Error("Meta Social authorization code exchange failed.");

  const longUrl = new URL(`https://graph.facebook.com/${env.version}/oauth/access_token`);
  longUrl.search = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: env.appId,
    client_secret: env.appSecret,
    fb_exchange_token: shortBody.access_token,
  }).toString();
  const long = await fetch(longUrl, {signal: AbortSignal.timeout(15_000)});
  const longBody = (await long.json()) as typeof shortBody;
  return long.ok && longBody.access_token ? longBody : shortBody;
}
