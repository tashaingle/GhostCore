import {INTELLIGENCE_CONFIG as C} from "../../config";
import type {IntelligenceRule} from "../../types";
import {
  contextNow,
  groupBy,
  isoWeek,
  metaAccountDays,
  percentChange,
  splitMetaDays,
  sum,
  type MetaAccountDay,
} from "../../windows";

const MIN_DAYS_PER_WINDOW = 5;
const totals = (days: MetaAccountDay[]) => ({
  spend: sum(days.map((d) => d.spend)),
  purchases: sum(days.map((d) => d.purchases ?? 0)),
  value: sum(days.map((d) => d.purchaseValue ?? 0)),
});
const money = (amount: number, currency: string) =>
  new Intl.NumberFormat("en-GB", {style: "currency", currency}).format(amount);
const roas = (value: number, spend: number) =>
  spend > 0 ? Math.round((value / spend) * 100) / 100 : 0;

export const metaReturnDeclineRule: IntelligenceRule = {
  id: "advertising.meta_return_decline",
  name: "Meta Ads return falling",
  description:
    "Flags when Meta-reported purchase value falls sharply while ad spend holds steady or rises.",
  priority: 45,
  supportedProviders: ["meta_ads"],
  evaluate(events, context) {
    const now = contextNow(context),
      days = metaAccountDays(events, now);
    return [...groupBy(days, (d) => d.accountId)].flatMap(([accountId, accountDays]) => {
      const {current, previous} = splitMetaDays(accountDays, now, C.comparisonWindowDays);
      if (current.length < MIN_DAYS_PER_WINDOW || previous.length < MIN_DAYS_PER_WINDOW) return [];
      const before = totals(previous),
        after = totals(current),
        currency = accountDays[0].currency,
        spendChange = percentChange(before.spend, after.spend),
        valueChange = percentChange(before.value, after.value);
      if (
        before.purchases < C.minimumPreviousAdPurchases ||
        before.value <= 0 ||
        spendChange < -C.adSpendSteadyTolerancePercent ||
        valueChange > -C.adReturnDeclinePercent
      )
        return [];
      return [
        {
          title: `Meta Ads purchase value down ${Math.abs(valueChange)}% while spend held`,
          summary: `Meta reported ${money(after.value, currency)} in purchases from ${money(after.spend, currency)} of spend over the last ${C.comparisonWindowDays} days, compared with ${money(before.value, currency)} from ${money(before.spend, currency)} the week before.`,
          severity: "warning" as const,
          confidence: Math.min(88, 65 + Math.round(before.purchases / 2)),
          explanation: `Reported return on ad spend went from ${roas(before.value, before.spend)} to ${roas(after.value, after.spend)}. Spend changed by ${spendChange}% and Meta-attributed purchase value by ${valueChange}%. These are Meta's own attributed figures, not confirmed sales.`,
          recommendation:
            "Compare with actual orders in your shop, then review recent campaign, audience or creative changes and check that the Meta pixel and Conversions API are still firing.",
          sourceEventIds: [...current, ...previous].map((d) => d.event.id),
          fingerprintKey: `${accountId}:${isoWeek(now)}`,
          metadata: {
            accountId,
            currency,
            currentSpend: after.spend,
            previousSpend: before.spend,
            currentPurchaseValue: after.value,
            previousPurchaseValue: before.value,
            spendChangePercent: spendChange,
            purchaseValueChangePercent: valueChange,
          },
        },
      ];
    });
  },
};
