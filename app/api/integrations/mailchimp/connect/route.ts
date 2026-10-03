import {NextResponse} from "next/server";
import {cookies} from "next/headers";
import {organisationApiContext} from "@/lib/organisations/api-context";
import {hasPermission, type OrganisationRole} from "@/lib/auth/permissions";
import {mailchimpAuthorisationUrl, oauthSecret} from "@/lib/integrations/mailchimp/oauth";

/** Sends the user to Mailchimp to approve access to their account. */
export async function GET(request: Request) {
  const ctx = await organisationApiContext();
  if (!ctx) return NextResponse.redirect(new URL("/login", request.url));
  if (!hasPermission(ctx.membership.role as OrganisationRole, "integration.manage"))
    return NextResponse.redirect(
      new URL("/app/integrations?error=Owner%20or%20admin%20access%20is%20required.", request.url),
    );
  try {
    const state = oauthSecret(),
      store = await cookies(),
      options = {
        httpOnly: true,
        sameSite: "lax" as const,
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 600,
      };
    store.set("mailchimp_oauth_state", state, options);
    store.set("mailchimp_oauth_org", ctx.organisationId, options);
    return NextResponse.redirect(mailchimpAuthorisationUrl(state));
  } catch (error) {
    return NextResponse.redirect(
      new URL(
        `/app/integrations?error=${encodeURIComponent(error instanceof Error ? error.message : "Mailchimp couldn't be connected. Try again.")}`,
        request.url,
      ),
    );
  }
}
