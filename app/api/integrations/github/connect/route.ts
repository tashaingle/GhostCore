import {NextResponse} from "next/server";
import {cookies} from "next/headers";
import {organisationApiContext} from "@/lib/organisations/api-context";
import {hasPermission, type OrganisationRole} from "@/lib/auth/permissions";
import {GITHUB_APP_COOKIE, githubAppEnv, installUrl, newState} from "@/lib/integrations/github/app";

/** Sends the user to GitHub to install the Ghost Core app on the repositories they choose. */
export async function GET(request: Request) {
  const ctx = await organisationApiContext();
  if (!ctx) return NextResponse.redirect(new URL("/login", request.url));
  if (!hasPermission(ctx.membership.role as OrganisationRole, "integration.manage"))
    return NextResponse.redirect(
      new URL("/app/integrations?error=Owner%20or%20admin%20access%20is%20required.", request.url),
    );
  const env = githubAppEnv();
  if (!env)
    return NextResponse.redirect(
      new URL("/app/integrations?error=GitHub%20App%20is%20not%20configured%20yet.", request.url),
    );
  const state = newState(),
    store = await cookies();
  store.set(
    GITHUB_APP_COOKIE,
    JSON.stringify({
      state,
      userId: ctx.user.id,
      organisationId: ctx.organisationId,
      createdAt: Date.now(),
    }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api/integrations/github",
      maxAge: 900,
    },
  );
  return NextResponse.redirect(installUrl(env.slug, state));
}
