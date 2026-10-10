/** £4.99 a month covers the first three organisations; each one after that is £1 a month. */
export const PLAN = {
  currency: "gbp",
  baseMinor: 499,
  includedOrganisations: 3,
  extraOrganisationMinor: 100,
  trialDays: 7,
  /** Lets Metric Mage find (or create once) the price in whichever Stripe account it uses. */
  lookupKey: "metric_mage_monthly_v1",
} as const;

export type BillingStatus =
  | "none"
  | "trialing"
  | "active"
  | "past_due"
  | "unpaid"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "paused";

export type BillingAccount = {
  status: BillingStatus;
  comped: boolean;
  trial_ends_at: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  trial_used: boolean;
};

/** Trialing, paying, or a failed payment Stripe is still retrying. Matches the SQL check. */
export function hasAccess(account: {status: string; comped: boolean} | null | undefined) {
  if (!account) return false;
  return account.comped || ["trialing", "active", "past_due"].includes(account.status);
}

/** Monthly price in pence for a number of organisations (at least one is always billed). */
export function monthlyMinor(organisations: number) {
  const extra = Math.max(0, Math.max(1, organisations) - PLAN.includedOrganisations);
  return PLAN.baseMinor + extra * PLAN.extraOrganisationMinor;
}

export const pounds = (minor: number) =>
  new Intl.NumberFormat("en-GB", {style: "currency", currency: "GBP"}).format(minor / 100);

/** "£4.99 a month for up to 3 organisations" / "£6.99 a month for 5 organisations". */
export function describePrice(organisations: number) {
  const count = Math.max(1, organisations);
  return count <= PLAN.includedOrganisations
    ? `${pounds(PLAN.baseMinor)} a month, including up to ${PLAN.includedOrganisations} organisations`
    : `${pounds(monthlyMinor(count))} a month for ${count} organisations (${PLAN.includedOrganisations} included, then ${pounds(PLAN.extraOrganisationMinor)} each)`;
}

/** Stripe's subscription statuses are the same names we store. */
export function toBillingStatus(status: string): BillingStatus {
  const known: BillingStatus[] = [
    "trialing",
    "active",
    "past_due",
    "unpaid",
    "canceled",
    "incomplete",
    "incomplete_expired",
    "paused",
  ];
  return (known as string[]).includes(status) ? (status as BillingStatus) : "none";
}
