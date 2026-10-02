import {formatMinorAmount as format} from "@/lib/integrations/stripe/translator";
import {INTELLIGENCE_CONFIG as C} from "../../config";
import type {IntelligenceRule} from "../../types";
import {
  comparisonWindows,
  contextNow,
  coversSince,
  groupBy,
  isoWeek,
  metadataNumber,
  metadataString,
  percentChange,
  sum,
  within,
} from "../../windows";

export const stripeRevenueDeclineRule: IntelligenceRule = {
  id: "payments.stripe_revenue_decline",
  name: "Stripe revenue declining",
  description: "Flags a week-on-week fall in successful live Stripe payment value, per currency.",
  priority: 38,
  supportedProviders: ["stripe"],
  evaluate(events, context) {
    const now = contextNow(context),
      {previousStart, currentStart, end} = comparisonWindows(now, C.comparisonWindowDays),
      payments = events.filter(
        (e) =>
          e.eventType === "stripe.payment_succeeded" &&
          e.metadata.mode === "live" &&
          metadataNumber(e.metadata, "amountMinor") !== null,
      );
    // Currencies are never combined or converted.
    return [...groupBy(payments, (e) => metadataString(e.metadata, "currency"))].flatMap(
      ([currency, inCurrency]) => {
        if (!coversSince(inCurrency, previousStart)) return [];
        const previous = inCurrency.filter((e) => within(e, previousStart, currentStart)),
          current = inCurrency.filter((e) => within(e, currentStart, end)),
          total = (list: typeof inCurrency) =>
            sum(list.map((e) => metadataNumber(e.metadata, "amountMinor") ?? 0)),
          previousTotal = total(previous),
          currentTotal = total(current),
          change = percentChange(previousTotal, currentTotal);
        if (previous.length < C.minimumPreviousPayments || change > -C.revenueDeclinePercent)
          return [];
        return [
          {
            title: `Stripe revenue down ${Math.abs(change)}% this week (${currency.toUpperCase()})`,
            summary: `Successful payments totalled ${format(currentTotal, currency)} in the last ${C.comparisonWindowDays} days, compared with ${format(previousTotal, currency)} the week before.`,
            severity: "warning" as const,
            confidence: Math.min(90, 68 + Math.round(previous.length / 5)),
            explanation: `${current.length} successful payments (${format(currentTotal, currency)}) versus ${previous.length} (${format(previousTotal, currency)}) in the previous ${C.comparisonWindowDays} days.`,
            recommendation:
              "Check whether the drop comes from fewer payments or smaller ones, then look at failed payments, cancelled subscriptions and recent pricing or checkout changes.",
            sourceEventIds: current.slice(0, 50).map((e) => e.id),
            fingerprintKey: `${currency}:${isoWeek(now)}`,
            metadata: {
              currency,
              currentAmountMinor: currentTotal,
              previousAmountMinor: previousTotal,
              currentPayments: current.length,
              previousPayments: previous.length,
              changePercent: change,
            },
          },
        ];
      },
    );
  },
};
