import {NextResponse} from "next/server";
import {requireUser} from "@/lib/auth/user";
import {billingEnabled, portalUrl} from "@/lib/billing/stripe";

/** Opens Stripe's billing portal: change card, see invoices, cancel. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!billingEnabled()) return NextResponse.redirect(new URL("/app", url));
  const {user} = await requireUser();
  try {
    const portal = await portalUrl(user.id);
    if (portal) return NextResponse.redirect(portal);
    return NextResponse.redirect(new URL("/api/billing/checkout", url));
  } catch (error) {
    console.error("Billing portal couldn't open", error);
    return NextResponse.redirect(
      new URL(
        `/billing?error=${encodeURIComponent("Stripe couldn't be reached. Please try again.")}`,
        url,
      ),
    );
  }
}
