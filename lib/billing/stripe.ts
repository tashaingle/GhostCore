import "server-only";
import type Stripe from "stripe";
import {stripeClient} from "@/lib/integrations/stripe/client";
import {createServiceClient} from "@/lib/supabase/service";
import {isCancelling, PLAN, toBillingStatus} from "./plan";

/**
 * Billing turns on once the webhook secret is set, so deploying this code changes nothing until
 * Stripe is ready to tell Metric Mage about subscriptions.
 */
export const billingEnabled = () =>
  Boolean(
    process.env.STRIPE_BILLING_WEBHOOK_SECRET?.trim() && process.env.STRIPE_PLATFORM_SECRET_KEY,
  );

const site = () =>
  (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");

/** The one monthly price, created the first time it's needed and found by its lookup key after. */
export async function ensurePrice(stripe: Stripe) {
  const found = await stripe.prices.list({lookup_keys: [PLAN.lookupKey], active: true, limit: 1});
  if (found.data[0]) return found.data[0].id;
  const price = await stripe.prices.create({
    currency: PLAN.currency,
    recurring: {interval: "month"},
    billing_scheme: "tiered",
    tiers_mode: "graduated",
    tiers: [
      {up_to: PLAN.includedOrganisations, flat_amount: PLAN.baseMinor, unit_amount: 0},
      {up_to: "inf", unit_amount: PLAN.extraOrganisationMinor},
    ],
    lookup_key: PLAN.lookupKey,
    nickname: "Metric Mage monthly",
    product_data: {name: "Metric Mage", unit_label: "organisation"},
  });
  return price.id;
}

/** Stripe's hosted page for changing card, seeing invoices and cancelling; set up once. */
export async function ensurePortalConfiguration(stripe: Stripe) {
  const existing = await stripe.billingPortal.configurations.list({active: true, limit: 100});
  const ours = existing.data.find((c) => c.metadata?.app === "metric_mage");
  if (ours) return ours.id;
  const created = await stripe.billingPortal.configurations.create({
    business_profile: {
      headline: "Metric Mage",
      privacy_policy_url: `${site()}/privacy`,
      terms_of_service_url: `${site()}/terms`,
    },
    features: {
      invoice_history: {enabled: true},
      payment_method_update: {enabled: true},
      customer_update: {enabled: true, allowed_updates: ["email", "name", "address"]},
      subscription_cancel: {enabled: true, mode: "at_period_end"},
    },
    metadata: {app: "metric_mage"},
  });
  return created.id;
}

export async function billingAccount(userId: string) {
  const {data} = await createServiceClient()
    .from("billing_accounts")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

/** Organisations a person created; these are what their subscription pays for. */
export async function ownedOrganisations(userId: string) {
  const {count} = await createServiceClient()
    .from("organisations")
    .select("id", {count: "exact", head: true})
    .eq("created_by", userId);
  return count ?? 0;
}

/** A Stripe Checkout page for the subscription, with a 7-day trial the first time. */
export async function checkoutUrl(input: {userId: string; email: string; next: string}) {
  const stripe = stripeClient(),
    [price, account, organisations] = await Promise.all([
      ensurePrice(stripe),
      billingAccount(input.userId),
      ownedOrganisations(input.userId),
    ]);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    ...(account?.stripe_customer_id
      ? {customer: account.stripe_customer_id}
      : {customer_email: input.email}),
    client_reference_id: input.userId,
    line_items: [{price, quantity: Math.max(1, organisations)}],
    // A card is taken up front; the trial converts automatically unless they cancel.
    payment_method_collection: "always",
    subscription_data: {
      ...(account?.trial_used ? {} : {trial_period_days: PLAN.trialDays}),
      metadata: {user_id: input.userId},
    },
    metadata: {user_id: input.userId},
    allow_promotion_codes: true,
    success_url: `${site()}${input.next}${input.next.includes("?") ? "&" : "?"}billing=started`,
    cancel_url: `${site()}/billing`,
  });
  if (!session.url) throw new Error("Stripe didn't return a checkout page.");
  return session.url;
}

export async function portalUrl(userId: string) {
  const account = await billingAccount(userId);
  if (!account?.stripe_customer_id) return null;
  const stripe = stripeClient();
  const session = await stripe.billingPortal.sessions.create({
    customer: account.stripe_customer_id,
    configuration: await ensurePortalConfiguration(stripe),
    return_url: `${site()}/billing`,
  });
  return session.url;
}

/** Saves a subscription's state against the person it belongs to. */
export async function saveSubscription(subscription: Stripe.Subscription, userIdHint?: string) {
  const db = createServiceClient(),
    customerId =
      typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  let userId = subscription.metadata?.user_id || userIdHint;
  if (!userId) {
    const {data} = await db
      .from("billing_accounts")
      .select("user_id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    userId = data?.user_id;
  }
  if (!userId) return false;
  const item = subscription.items.data[0],
    toIso = (s: number | null | undefined) => (s ? new Date(s * 1000).toISOString() : null);
  const {error} = await db.from("billing_accounts").upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      status: toBillingStatus(subscription.status),
      trial_ends_at: toIso(subscription.trial_end),
      current_period_end: toIso(item?.current_period_end),
      cancel_at_period_end: isCancelling(subscription),
      organisations_billed: item?.quantity ?? 0,
      trial_used: true,
      updated_at: new Date().toISOString(),
    },
    {onConflict: "user_id"},
  );
  if (error) throw new Error(`Billing couldn't be saved: ${error.message}`);
  return true;
}

/**
 * Keeps the subscription's quantity equal to the organisations the person created, so adding a
 * fourth organisation adds £1 a month (prorated) and deleting one takes it off.
 */
export async function syncOrganisationCount(userId: string) {
  if (!billingEnabled()) return;
  const account = await billingAccount(userId);
  if (!account?.stripe_subscription_id || account.comped) return;
  if (!["trialing", "active", "past_due"].includes(account.status)) return;
  const stripe = stripeClient(),
    wanted = Math.max(1, await ownedOrganisations(userId)),
    subscription = await stripe.subscriptions.retrieve(account.stripe_subscription_id),
    item = subscription.items.data[0];
  if (!item || item.quantity === wanted) return;
  const updated = await stripe.subscriptions.update(subscription.id, {
    items: [{id: item.id, quantity: wanted}],
    proration_behavior: "create_prorations",
  });
  await saveSubscription(updated, userId);
}

/**
 * Re-reads the person's subscription from Stripe and saves it. The Billing page calls this, so a
 * missed or misread webhook is corrected the next time they look.
 */
export async function refreshSubscription(userId: string) {
  if (!billingEnabled()) return;
  const account = await billingAccount(userId);
  if (!account?.stripe_subscription_id) return;
  const subscription = await stripeClient().subscriptions.retrieve(account.stripe_subscription_id);
  await saveSubscription(subscription, userId);
}
