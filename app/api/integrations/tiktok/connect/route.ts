import {NextResponse} from "next/server";
import {cookies} from "next/headers";
import {organisationApiContext} from "@/lib/organisations/api-context";
import {hasPermission, type OrganisationRole} from "@/lib/auth/permissions";
import {tiktokEnv} from "@/lib/integrations/tiktok/config";
import {newTikTokState, tiktokAuthorisationUrl} from "@/lib/integrations/tiktok/oauth";

export async function GET(request: Request) {
  const ctx = await organisationApiContext();
  if (!ctx) return NextResponse.redirect(new URL("/login", request.url));
  if (!hasPermission(ctx.membership.role as OrganisationRole, "integration.manage"))
    return NextResponse.redirect(
      new URL("/app/integrations?error=Owner%20or%20admin%20access%20is%20required.", request.url),
    );
  try {
    const expected = new URL(
      "/api/integrations/tiktok/callback",
      new URL(request.url).origin,
    ).toString();
    if (tiktokEnv().redirectUri !== expected)
      throw new Error(`TikTok redirect URI must be exactly ${expected}`);
    const state = newTikTokState(),
      store = await cookies();
    store.set(
      "ghost_tiktok_oauth",
      JSON.stringify({
        state,
        userId: ctx.user.id,
        organisationId: ctx.organisationId,
        provider: "tiktok",
        returnTo: "/app/integrations",
        createdAt: Date.now(),
      }),
      {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/api/integrations/tiktok",
        maxAge: 600,
      },
    );
    return NextResponse.redirect(tiktokAuthorisationUrl(state));
  } catch (error) {
    return NextResponse.redirect(
      new URL(
        `/app/integrations?error=${encodeURIComponent(error instanceof Error ? error.message : "TikTok connection could not be started.")}`,
        request.url,
      ),
    );
  }
}
