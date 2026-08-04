import {NextResponse} from "next/server";
import {cookies} from "next/headers";
import {organisationApiContext} from "@/lib/organisations/api-context";
import {hasPermission, type OrganisationRole} from "@/lib/auth/permissions";
import {authorisationUrl, newState} from "@/lib/integrations/meta-social/oauth";
import {metaSocialEnv} from "@/lib/integrations/meta-social/config";

export async function GET(request: Request) {
  const ctx = await organisationApiContext();
  if (!ctx) return NextResponse.redirect(new URL("/login", request.url));
  if (!hasPermission(ctx.membership.role as OrganisationRole, "integration.manage")) {
    return NextResponse.redirect(
      new URL("/app/integrations?error=Owner%20or%20admin%20access%20is%20required.", request.url),
    );
  }
  try {
    const origin = new URL(request.url).origin;
    const expected = new URL("/api/integrations/meta-social/callback", origin).toString();
    if (metaSocialEnv().redirectUri !== expected) {
      throw new Error(`Meta Social redirect URI must be exactly ${expected}`);
    }
    const state = newState();
    const payload = JSON.stringify({
      state,
      userId: ctx.user.id,
      organisationId: ctx.organisationId,
      provider: "meta_social",
      returnTo: "/app/integrations/meta-social/settings",
      createdAt: Date.now(),
    });
    const store = await cookies();
    store.set("ghost_meta_social_oauth", payload, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api/integrations/meta-social",
      maxAge: 600,
    });
    return NextResponse.redirect(authorisationUrl(state));
  } catch (error) {
    return NextResponse.redirect(
      new URL(
        `/app/integrations?error=${encodeURIComponent(error instanceof Error ? error.message : "Meta Social connection could not be started.")}`,
        request.url,
      ),
    );
  }
}
