import {NextResponse} from "next/server";
import {cookies} from "next/headers";
import {organisationApiContext} from "@/lib/organisations/api-context";
import {hasPermission, type OrganisationRole} from "@/lib/auth/permissions";
import {googlePlayOAuthEnv} from "@/lib/integrations/google-play/config";
import {authorisationUrl, oauthSecret} from "@/lib/integrations/google-play/oauth";

export async function GET(request: Request) {
  const ctx = await organisationApiContext();
  if (!ctx) return NextResponse.redirect(new URL("/login", request.url));
  if (!hasPermission(ctx.membership.role as OrganisationRole, "integration.manage"))
    return NextResponse.redirect(
      new URL("/app/integrations?error=Owner%20or%20admin%20access%20is%20required.", request.url),
    );
  try {
    const expected = new URL(
      "/api/integrations/google-play/callback",
      new URL(request.url).origin,
    ).toString();
    if (googlePlayOAuthEnv().redirectUri !== expected)
      throw new Error(`Google Play redirect URI must be exactly ${expected}`);
    const state = oauthSecret(),
      verifier = oauthSecret(),
      store = await cookies(),
      options = {
        httpOnly: true,
        sameSite: "lax" as const,
        secure: process.env.NODE_ENV === "production",
        path: "/api/integrations/google-play",
        maxAge: 600,
      };
    store.set("ghost_play_state", state, options);
    store.set("ghost_play_verifier", verifier, options);
    store.set("ghost_play_org", ctx.organisationId, options);
    return NextResponse.redirect(authorisationUrl(state, verifier));
  } catch (error) {
    return NextResponse.redirect(
      new URL(
        `/app/integrations?error=${encodeURIComponent(error instanceof Error ? error.message : "Google Play connection could not be started.")}`,
        request.url,
      ),
    );
  }
}
