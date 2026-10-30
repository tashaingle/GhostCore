import {metadataCorsOptionsRequestHandler} from "mcp-handler";
import {authorizationServerUrl} from "@/lib/mcp/auth";
import {getSupabaseEnv} from "@/lib/supabase/env";

/**
 * Older MCP clients look for authorisation-server metadata on the MCP server's own origin. Supabase
 * Auth is the real issuer, so this returns its RFC 8414 document unchanged.
 */
export async function GET() {
  const base = getSupabaseEnv().url.replace(/\/$/, "");
  try {
    const response = await fetch(`${base}/.well-known/oauth-authorization-server/auth/v1`, {
      next: {revalidate: 3600},
    });
    if (!response.ok) throw new Error(`Supabase returned ${response.status}`);
    return Response.json(await response.json(), {
      headers: {"Access-Control-Allow-Origin": "*", "Cache-Control": "max-age=3600"},
    });
  } catch (error) {
    console.error("Supabase OAuth metadata unavailable", error);
    return Response.json(
      {error: "server_error", error_description: `OAuth is served by ${authorizationServerUrl()}.`},
      {status: 503},
    );
  }
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
