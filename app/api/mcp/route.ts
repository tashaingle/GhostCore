import {createMcpHandler, withMcpAuth} from "mcp-handler";
import {verifyMcpToken} from "@/lib/mcp/auth";
import {MCP_INSTRUCTIONS, registerMetricMageTools} from "@/lib/mcp/server";
import {RESOURCE_METADATA_PATH, siteOrigin} from "@/lib/mcp/urls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const mcp = createMcpHandler(registerMetricMageTools, {
  serverInfo: {name: "metric-mage", version: "1.0.0"},
  instructions: MCP_INSTRUCTIONS,
});

// Every request must carry a token Supabase issued to Claude; without one, the 401 points Claude
// at the protected-resource metadata so it can start the OAuth flow.
const handler = withMcpAuth(
  mcp,
  async (request, token) => {
    const info = await verifyMcpToken(token);
    return info && {...info, extra: {...info.extra, siteUrl: siteOrigin(request)}};
  },
  {required: true, resourceMetadataPath: RESOURCE_METADATA_PATH},
);

export {handler as GET, handler as POST, handler as DELETE};
