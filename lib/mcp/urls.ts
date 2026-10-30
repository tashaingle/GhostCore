import {getPublicOrigin} from "mcp-handler";

/** Where Claude reaches the connector, relative to the site. */
export const MCP_PATH = "/api/mcp";
export const RESOURCE_METADATA_PATH = `/.well-known/oauth-protected-resource${MCP_PATH}`;

/** The public address of the app: the configured site URL, or the one the request came in on. */
export function siteOrigin(request?: Request) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (configured) return configured;
  return request ? getPublicOrigin(request) : "http://localhost:3000";
}

export const mcpUrl = (request?: Request) => `${siteOrigin(request)}${MCP_PATH}`;
