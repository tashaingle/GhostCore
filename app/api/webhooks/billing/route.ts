import {NextResponse} from "next/server";
import type Stripe from "stripe";
import {stripeClient} from "@/lib/integrations/stripe/client";
import {saveSubscription} from "@/lib/billing/stripe";

export const runtime = "nodejs";
const reply = (message: string, status = 200) =>
  NextResponse.json({received: status < 300, message}, {status});

/**
 * Stripe tells Metric Mage about its own subscriptions here (separate from the Connect webhook,
 * which is about customers' Stripe accounts). Every change is re-read from the event's
 * subscription, so events arriving out of order still leave the latest state.
 */
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature"),
    secret = process.env.STRIPE_BILLING_WEBHOOK_SECRET?.trim();
  if (!signature) return reply("Missing Stripe signature.", 400);
  if (!secret) return reply("Billing webhook is not configured.", 503);
  const raw = await request.text();
  if (raw.length > 512_000) return reply("Payload too large.", 413);
  const stripe = stripeClient();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, signature, secret);
  } catch {
    return reply("Invalid Stripe signature.", 400);
  }
  // Connect events from customers' accounts carry `account`; they don't belong here.
  if (event.account) return reply("Ignored connected-account event.");
  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      if (session.mode === "subscription" && typeof session.subscription === "string")
        await saveSubscription(
          await stripe.subscriptions.retrieve(session.subscription),
          session.client_reference_id ?? undefined,
        );
    } else if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted" ||
      event.type === "customer.subscription.paused" ||
      event.type === "customer.subscription.resumed"
    ) {
      // Re-read so a late event can't overwrite a newer state with an older one.
      await saveSubscription(await stripe.subscriptions.retrieve(event.data.object.id));
    }
    return reply("ok");
  } catch (error) {
    console.error("Billing webhook failed", event.type, error);
    // 500 so Stripe retries.
    return reply("Billing update failed.", 500);
  }
}
