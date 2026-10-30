import "server-only";
import {createClient, type SupabaseClient, type User} from "@supabase/supabase-js";
import type {AuthInfo} from "@modelcontextprotocol/server";
import type {Database} from "@/types/database";
import {getSupabaseEnv} from "@/lib/supabase/env";

/**
 * Claude connects through Supabase Auth's OAuth 2.1 server, so the bearer token Claude sends is an
 * ordinary Supabase access token for the person who approved the connection. Queries made with
 * this client run as that person, and row-level security limits them to their own organisations.
 */
export function userClient(accessToken: string): SupabaseClient<Database> {
  const {url, key} = getSupabaseEnv();
  return createClient<Database>(url, key, {
    auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false},
    global: {headers: {Authorization: `Bearer ${accessToken}`}},
  });
}

/** The OAuth issuer Claude is sent to: Supabase Auth for this project. */
export function authorizationServerUrl() {
  return `${getSupabaseEnv().url.replace(/\/$/, "")}/auth/v1`;
}

/** The claims in a JWT, without checking its signature. Only read after Supabase has accepted it. */
export function jwtClaims(token: string): Record<string, unknown> | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const claims = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
    return claims && typeof claims === "object" && !Array.isArray(claims) ? claims : null;
  } catch {
    return null;
  }
}

type GetUser = (token: string) => Promise<{data: {user: User | null}; error: unknown}>;

const supabaseGetUser: GetUser = (token) => userClient(token).auth.getUser(token);

/**
 * Accepts only tokens Supabase issued to an OAuth client (they carry `client_id`), so a stolen
 * browser session cookie can't be replayed here. Supabase checks the token on every call rather
 * than trusting its signature alone, which means revoking the connection takes effect at once.
 */
export async function verifyMcpToken(
  token: string | undefined,
  getUser: GetUser = supabaseGetUser,
): Promise<AuthInfo | undefined> {
  if (!token) return undefined;
  const claims = jwtClaims(token);
  const clientId = typeof claims?.client_id === "string" ? claims.client_id : "";
  if (!claims || !clientId) return undefined;
  const {data, error} = await getUser(token);
  if (error || !data.user || data.user.id !== claims.sub) return undefined;
  return {
    token,
    clientId,
    scopes: typeof claims.scope === "string" ? claims.scope.split(" ").filter(Boolean) : [],
    expiresAt: typeof claims.exp === "number" ? claims.exp : undefined,
    extra: {userId: data.user.id, email: data.user.email ?? null},
  };
}
