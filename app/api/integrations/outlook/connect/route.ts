import {NextResponse} from "next/server";
import {cookies} from "next/headers";
import {organisationApiContext} from "@/lib/organisations/api-context";
import {hasPermission, type OrganisationRole} from "@/lib/auth/permissions";
import {oauthSecret, outlookAuthorisationUrl} from "@/lib/integrations/outlook/oauth";

/** Sends the user to Microsoft to choose a mailbox and grant read-only access. */
export async function GET(request: Request) {
  const ctx = await organisationApiContext();
  if (!ctx) return NextResponse.redirect(new URL("/login", request.url));
  if (!hasPermission(ctx.membership.role as OrganisationRole, "integration.manage"))
    return NextResponse.redirect(
      new URL("/app/integrations?error=Owner%20or%20admin%20access%20is%20required.", request.url),
    );
  try {
    const state = oauthSecret(),
      verifier = oauthSecret(),
      store = await cookies(),
      options = {
        httpOnly: true,
        sameSite: "lax" as const,
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 600,
      };
    store.set("outlook_oauth_state", state, options);
    store.set("outlook_pkce", verifier, options);
    store.set("outlook_oauth_org", ctx.organisationId, options);
    return NextResponse.redirect(outlookAuthorisationUrl(state, verifier));
  } catch (error) {
    return NextResponse.redirect(
      new URL(
        `/app/integrations?error=${encodeURIComponent(error instanceof Error ? error.message : "Outlook couldn't be connected. Try again.")}`,
        request.url,
      ),
    );
  }
}
