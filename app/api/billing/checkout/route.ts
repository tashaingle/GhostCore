import {NextResponse} from "next/server";
import {requireUser} from "@/lib/auth/user";
import {safeNext} from "@/lib/auth/next";
import {hasAccess} from "@/lib/billing/plan";
import {billingAccount, billingEnabled, checkoutUrl} from "@/lib/billing/stripe";

/** Sends the person to Stripe Checkout to start their trial (or restart their subscription). */
export async function GET(request: Request) {
  const url = new URL(request.url),
    next = safeNext(url.searchParams.get("next"), "/app");
  if (!billingEnabled()) return NextResponse.redirect(new URL(next, url));
  const {user} = await requireUser();
  if (hasAccess(await billingAccount(user.id))) return NextResponse.redirect(new URL(next, url));
  try {
    return NextResponse.redirect(
      await checkoutUrl({userId: user.id, email: user.email ?? "", next}),
    );
  } catch (error) {
    console.error("Checkout couldn't start", error);
    return NextResponse.redirect(
      new URL(
        `/billing?error=${encodeURIComponent("Stripe couldn't be reached. Please try again.")}`,
        url,
      ),
    );
  }
}
