import "server-only";
import {randomBytes, timingSafeEqual} from "node:crypto";
import {z} from "zod";
import {notionEnv} from "./config";

export const newNotionState = () => randomBytes(32).toString("base64url");

export function notionStateMatches(a: string | undefined, b: string | null) {
  if (!a || !b) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function notionAuthorisationUrl(state: string) {
  const env = notionEnv();
  const url = new URL("https://api.notion.com/v1/oauth/authorize");
  url.search = new URLSearchParams({
    client_id: env.clientId,
    response_type: "code",
    owner: "user",
    redirect_uri: env.redirectUri,
    state,
  }).toString();
  return url.toString();
}

// Notion returns workspace_icon as a URL, an emoji string, or null - not always a URL.
const tokenSchema = z.object({
  access_token: z.string().min(10),
  token_type: z.string(),
  bot_id: z.string(),
  workspace_id: z.string(),
  workspace_name: z.string().nullable().optional(),
  workspace_icon: z.string().nullable().optional(),
  owner: z.object({type: z.string()}).passthrough(),
  refresh_token: z.string().optional(),
  expires_in: z.number().optional(),
});

async function tokenRequest(body: Record<string, string>) {
  const env = notionEnv();
  const response = await fetch("https://api.notion.com/v1/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${env.clientId}:${env.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  const json: unknown = await response.json().catch(() => ({}));
  const parsed = tokenSchema.safeParse(json);

  if (!response.ok) {
    const err =
      typeof json === "object" &&
      json !== null &&
      "error" in json &&
      typeof (json as {error?: unknown}).error === "string"
        ? String((json as {error: string}).error)
        : `HTTP ${response.status}`;
    const description =
      typeof json === "object" &&
      json !== null &&
      "error_description" in json &&
      typeof (json as {error_description?: unknown}).error_description === "string"
        ? `: ${(json as {error_description: string}).error_description}`
        : "";
    throw new Error(`Notion authorization token exchange failed (${err}${description}).`);
  }

  if (!parsed.success) {
    throw new Error(
      "Notion authorized Ghost, but the token response shape was unexpected. Check NOTION_CLIENT_ID/SECRET and try again.",
    );
  }

  return parsed.data;
}

export const exchangeNotionCode = (code: string) =>
  tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: notionEnv().redirectUri,
  });

export const refreshNotionToken = (refreshToken: string) =>
  tokenRequest({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
