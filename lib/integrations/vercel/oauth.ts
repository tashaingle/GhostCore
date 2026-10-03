import "server-only";
import {randomBytes, timingSafeEqual} from "node:crypto";
import {z} from "zod";
import {vercelEnv} from "./config";

export const newVercelState = () => randomBytes(32).toString("base64url");

export function vercelStateMatches(a: string | undefined, b: string | null) {
  if (!a || !b) return false;
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Starts an install from Metric Mage. Vercel sends `state` back to the redirect URL. */
export function vercelInstallUrl(state: string) {
  const url = new URL(`https://vercel.com/integrations/${vercelEnv().slug}/new`);
  url.searchParams.set("state", state);
  return url.toString();
}

const tokenSchema = z.object({
  token_type: z.string(),
  access_token: z.string().min(10),
  installation_id: z.string().min(3),
  user_id: z.string().min(3),
  team_id: z.string().nullable().optional(),
});

export async function exchangeVercelCode(code: string) {
  const env = vercelEnv();
  let response: Response;
  try {
    response = await fetch("https://api.vercel.com/v2/oauth/access_token", {
      method: "POST",
      headers: {"Content-Type": "application/x-www-form-urlencoded", Accept: "application/json"},
      body: new URLSearchParams({
        client_id: env.clientId,
        client_secret: env.clientSecret,
        code,
        redirect_uri: env.redirectUri,
      }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error("Vercel could not be reached. Try again shortly.");
  }
  const parsed = tokenSchema.safeParse(await response.json().catch(() => null));
  if (!response.ok || !parsed.success)
    throw new Error("Vercel authorization could not be completed.");
  return parsed.data;
}
