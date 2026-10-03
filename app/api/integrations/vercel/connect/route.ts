import {NextResponse} from "next/server";
import {cookies} from "next/headers";
import {organisationApiContext} from "@/lib/organisations/api-context";
import {hasPermission, type OrganisationRole} from "@/lib/auth/permissions";
import {newVercelState, vercelInstallUrl} from "@/lib/integrations/vercel/oauth";
import {vercelEnv} from "@/lib/integrations/vercel/config";

export async function GET(request: Request) {
  const ctx = await organisationApiContext();
  if (!ctx) return NextResponse.redirect(new URL("/login", request.url));
  if (!hasPermission(ctx.membership.role as OrganisationRole, "integration.manage"))
    return NextResponse.redirect(
      new URL("/app/integrations?error=Owner%20or%20admin%20access%20is%20required.", request.url),
    );
  try {
    const expected = new URL(
      "/api/integrations/vercel/callback",
      new URL(request.url).origin,
    ).toString();
    if (vercelEnv().redirectUri !== expected)
      throw new Error(`Vercel redirect URI must be exactly ${expected}`);
    const state = newVercelState(),
      store = await cookies();
    store.set(
      "ghost_vercel_oauth",
      JSON.stringify({
        state,
        userId: ctx.user.id,
        organisationId: ctx.organisationId,
        provider: "vercel",
        returnTo: "/app/integrations/vercel/settings",
        createdAt: Date.now(),
      }),
      {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/api/integrations/vercel",
        maxAge: 600,
      },
    );
    return NextResponse.redirect(vercelInstallUrl(state));
  } catch (error) {
    return NextResponse.redirect(
      new URL(
        `/app/integrations?error=${encodeURIComponent(error instanceof Error ? error.message : "Vercel connection could not be started.")}`,
        request.url,
      ),
    );
  }
}
