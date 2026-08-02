import "server-only";

export const STRIPE_API_VERSION = "2026-03-25.dahlia" as const;
export const STRIPE_INITIAL_DAYS = 30;
export const STRIPE_RECONCILE_HOURS = 72;
export const STRIPE_MAX_PAGES = 10;
export const STRIPE_MAX_EVENTS = 1000;
export const STRIPE_MAX_RUNTIME_MS = 25_000;
/** Stripe Events API allows at most 20 values in the `types` parameter. */
export const STRIPE_MAX_TYPES_PER_REQUEST = 20;
export const STRIPE_WEBHOOK_MAX_BYTES = 256 * 1024;
export const STRIPE_OAUTH_COOKIE = "ghost_stripe_oauth";
export const STRIPE_SUPPORTED_EVENTS = [
  "payment_intent.succeeded","payment_intent.payment_failed","payment_intent.canceled",
  "refund.created","refund.updated","refund.failed",
  "checkout.session.completed","checkout.session.async_payment_succeeded","checkout.session.async_payment_failed","checkout.session.expired",
  "invoice.created","invoice.finalized","invoice.paid","invoice.payment_failed","invoice.voided","invoice.marked_uncollectible",
  "customer.subscription.created","customer.subscription.updated","customer.subscription.deleted","customer.subscription.paused","customer.subscription.resumed","customer.subscription.trial_will_end",
  "charge.dispute.created","charge.dispute.updated","charge.dispute.closed",
  "payout.created","payout.paid","payout.failed","payout.canceled",
] as const;

export function stripeEnvironment(){
  const secretKey=process.env.STRIPE_PLATFORM_SECRET_KEY;
  const clientId=process.env.STRIPE_CONNECT_CLIENT_ID;
  const redirectUri=process.env.STRIPE_REDIRECT_URI;
  if(!secretKey||!clientId||!redirectUri)throw new Error("Stripe server configuration is incomplete.");
  if(process.env.NODE_ENV==="production"&&secretKey.startsWith("sk_test_"))throw new Error("Production cannot use a Stripe test secret key.");
  return{secretKey,clientId,redirectUri};
}
