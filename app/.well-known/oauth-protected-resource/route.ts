import {metadataCorsOptionsRequestHandler, protectedResourceHandler} from "mcp-handler";
import {authorizationServerUrl} from "@/lib/mcp/auth";
import {mcpUrl} from "@/lib/mcp/urls";

/** RFC 9728 metadata for the Claude connector: tokens come from Supabase Auth's OAuth server. */
export function GET(request: Request) {
  return protectedResourceHandler({
    authServerUrls: [authorizationServerUrl()],
    resourceUrl: mcpUrl(request),
  })(request);
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
