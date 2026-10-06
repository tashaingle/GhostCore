import {NextResponse} from "next/server";
import {cookies} from "next/headers";
import {organisationApiContext} from "@/lib/organisations/api-context";
import {hasPermission, type OrganisationRole} from "@/lib/auth/permissions";
import {businessProfileOAuthEnv} from "@/lib/integrations/google-business-profile/config";
import {authorisationUrl, oauthSecret} from "@/lib/integrations/google-business-profile/oauth";

export async function GET(request: Request) {
  const ctx = await organisationApiContext();
  if (!ctx) return NextResponse.redirect(new URL("/login", request.url));
  if (!hasPermission(ctx.membership.role as OrganisationRole, "integration.manage"))
    return NextResponse.redirect(
      new URL("/app/integrations?error=Owner%20or%20admin%20access%20is%20required.", request.url),
    );
  try {
    const expected = new URL(
      "/api/integrations/google-business-profile/callback",
      new URL(request.url).origin,
    ).toString();
    if (businessProfileOAuthEnv().redirectUri !== expected)
      throw new Error(`Google Business Profile redirect URI must be exactly ${expected}`);
    const state = oauthSecret(),
      verifier = oauthSecret(),
      store = await cookies(),
      options = {
        httpOnly: true,
        sameSite: "lax" as const,
        secure: process.env.NODE_ENV === "production",
        path: "/api/integrations/google-business-profile",
        maxAge: 600,
      };
    store.set("ghost_gbp_state", state, options);
    store.set("ghost_gbp_verifier", verifier, options);
    store.set("ghost_gbp_org", ctx.organisationId, options);
    return NextResponse.redirect(authorisationUrl(state, verifier));
  } catch (error) {
    return NextResponse.redirect(
      new URL(
        `/app/integrations?error=${encodeURIComponent(error instanceof Error ? error.message : "Google Business Profile connection could not be started.")}`,
        request.url,
      ),
    );
  }
}
