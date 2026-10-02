import {formatMinorAmount} from "@/lib/integrations/stripe/translator";
import type {IntelligenceEvent} from "@/lib/intelligence/types";
import {
  comparisonWindows,
  metaAccountDays,
  percentChange,
  splitMetaDays,
  sum,
  within,
} from "@/lib/intelligence/windows";

export type PulseMetric = {
  key: "revenue" | "orders" | "adSpend" | "activity";
  label: string;
  value: string;
  /** Percentage change versus the previous 7 days; null when there is nothing to compare. */
  change: number | null;
  source: string;
  /** Whether a rise is good news (revenue, orders) or neutral (spend, activity). */
  higherIsBetter: boolean | null;
};

/** Event types the home page needs; keeps the query small. */
export const PULSE_EVENT_TYPES = [
  "stripe.payment_succeeded",
  "shopify.order_created",
  "meta_ads.performance.daily_recorded",
];

const WINDOW_DAYS = 7;
const change = (previous: number, current: number) => {
  const value = percentChange(previous, current);
  return Number.isFinite(value) ? value : null;
};
const mostCommon = (values: string[], fallback: string) => {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? fallback;
};

function revenue(events: IntelligenceEvent[], now: Date, currencyHint: string): PulseMetric | null {
  const payments = events.filter(
    (e) =>
      e.eventType === "stripe.payment_succeeded" &&
      typeof e.metadata.amountMinor === "number" &&
      typeof e.metadata.currency === "string",
  );
  if (!payments.length) return null;
  // Prefer live payments; fall back to test mode (labelled) so a new setup still shows something.
  const live = payments.filter((e) => e.metadata.mode === "live"),
    chosen = live.length ? live : payments,
    currency = mostCommon(
      chosen.map((e) => String(e.metadata.currency)),
      currencyHint.toLowerCase(),
    ),
    inCurrency = chosen.filter((e) => e.metadata.currency === currency),
    {previousStart, currentStart, end} = comparisonWindows(now, WINDOW_DAYS),
    total = (start: number, stop: number) =>
      sum(
        inCurrency.filter((e) => within(e, start, stop)).map((e) => Number(e.metadata.amountMinor)),
      ),
    current = total(currentStart, end),
    previous = total(previousStart, currentStart);
  return {
    key: "revenue",
    label: "Revenue",
    value: formatMinorAmount(current, currency),
    change: change(previous, current),
    source: live.length ? "Stripe" : "Stripe · test mode",
    higherIsBetter: true,
  };
}

function orders(events: IntelligenceEvent[], now: Date): PulseMetric | null {
  const created = events.filter((e) => e.eventType === "shopify.order_created");
  if (!created.length) return null;
  const {previousStart, currentStart, end} = comparisonWindows(now, WINDOW_DAYS),
    current = created.filter((e) => within(e, currentStart, end)).length,
    previous = created.filter((e) => within(e, previousStart, currentStart)).length;
  return {
    key: "orders",
    label: "Orders",
    value: current.toLocaleString("en-GB"),
    change: change(previous, current),
    source: "Shopify",
    higherIsBetter: true,
  };
}

function adSpend(events: IntelligenceEvent[], now: Date): PulseMetric | null {
  const days = metaAccountDays(events, now);
  if (!days.length) return null;
  const currencies = new Set(days.map((d) => d.currency));
  // Never add up spend across currencies.
  if (currencies.size !== 1) return null;
  const [currency] = currencies,
    {current, previous} = splitMetaDays(days, now, WINDOW_DAYS),
    spendNow = sum(current.map((d) => d.spend)),
    spendBefore = sum(previous.map((d) => d.spend));
  return {
    key: "adSpend",
    label: "Ad spend",
    value: new Intl.NumberFormat("en-GB", {style: "currency", currency}).format(spendNow),
    change: previous.length ? change(spendBefore, spendNow) : null,
    source: "Meta Ads",
    higherIsBetter: null,
  };
}

export function weeklyPulse(input: {
  events: IntelligenceEvent[];
  activity: {current: number; previous: number};
  now?: Date;
  currencyHint?: string;
}): PulseMetric[] {
  const now = input.now ?? new Date();
  return [
    revenue(input.events, now, input.currencyHint ?? "GBP"),
    orders(input.events, now),
    adSpend(input.events, now),
    {
      key: "activity" as const,
      label: "Activity",
      value: input.activity.current.toLocaleString("en-GB"),
      change: change(input.activity.previous, input.activity.current),
      source: "All connected tools",
      higherIsBetter: null,
    },
  ].filter((m): m is PulseMetric => m !== null);
}
