import "server-only";
import {randomBytes, timingSafeEqual} from "node:crypto";
import {z} from "zod";
import {TIKTOK_SCOPES, tiktokEnv} from "./config";

export const newTikTokState = () => randomBytes(32).toString("base64url");

export function tiktokStateMatches(a: string | undefined, b: string | null) {
  if (!a || !b) return false;
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function tiktokAuthorisationUrl(state: string) {
  const env = tiktokEnv(),
    url = new URL("https://www.tiktok.com/v2/auth/authorize/");
  url.search = new URLSearchParams({
    client_key: env.clientKey,
    response_type: "code",
    scope: TIKTOK_SCOPES.join(","),
    redirect_uri: env.redirectUri,
    state,
  }).toString();
  return url.toString();
}

const tokenSchema = z.object({
  access_token: z.string().min(10),
  expires_in: z.number(),
  open_id: z.string().min(3),
  refresh_token: z.string().min(10),
  refresh_expires_in: z.number().optional(),
  scope: z.string().default(""),
  token_type: z.string().optional(),
});

async function token(body: Record<string, string>) {
  const env = tiktokEnv();
  let response: Response;
  try {
    response = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: {"Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache"},
      body: new URLSearchParams({
        client_key: env.clientKey,
        client_secret: env.clientSecret,
        ...body,
      }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error("TikTok could not be reached. Try again shortly.");
  }
  const parsed = tokenSchema.safeParse(await response.json().catch(() => null));
  if (!response.ok || !parsed.success)
    throw new Error("TikTok authorization could not be completed.");
  return parsed.data;
}

export const exchangeTikTokCode = (code: string) =>
  token({code, grant_type: "authorization_code", redirect_uri: tiktokEnv().redirectUri});

export const refreshTikTokToken = (refreshToken: string) =>
  token({grant_type: "refresh_token", refresh_token: refreshToken});
