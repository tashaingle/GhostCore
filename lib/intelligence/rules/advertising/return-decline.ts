import {INTELLIGENCE_CONFIG as C} from "../../config";
import type {IntelligenceEvent, IntelligenceRule} from "../../types";
import {
  contextNow,
  groupBy,
  isoWeek,
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

/**
 * Flags an ad account whose reported results value falls sharply while spend holds or rises.
 * Each platform gets its own rule, because each reports results its own way.
 */
export function returnDeclineRule(platform: {
  id: string;
  name: string;
  provider: string;
  /** "Meta Ads" */
  label: string;
  /** "purchase value", "conversion value" */
  valueLabel: string;
  /** "Meta-attributed" */
  attributed: string;
  days: (events: IntelligenceEvent[], now: Date) => MetaAccountDay[];
  caveat: string;
  recommendation: string;
}): IntelligenceRule {
  return {
    id: platform.id,
    name: platform.name,
    description: `Flags when ${platform.label}-reported ${platform.valueLabel} falls sharply while ad spend holds steady or rises.`,
    priority: 45,
    supportedProviders: [platform.provider],
    evaluate(events, context) {
      const now = contextNow(context),
        days = platform.days(events, now);
      return [...groupBy(days, (d) => d.accountId)].flatMap(([accountId, accountDays]) => {
        const {current, previous} = splitMetaDays(accountDays, now, C.comparisonWindowDays);
        if (current.length < MIN_DAYS_PER_WINDOW || previous.length < MIN_DAYS_PER_WINDOW)
          return [];
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
            title: `${platform.label} ${platform.valueLabel} down ${Math.abs(valueChange)}% while spend held`,
            summary: `${platform.label} reported ${money(after.value, currency)} in ${platform.valueLabel} from ${money(after.spend, currency)} of spend over the last ${C.comparisonWindowDays} days, compared with ${money(before.value, currency)} from ${money(before.spend, currency)} the week before.`,
            severity: "warning" as const,
            confidence: Math.min(88, 65 + Math.round(before.purchases / 2)),
            explanation: `Reported return on ad spend went from ${roas(before.value, before.spend)} to ${roas(after.value, after.spend)}. Spend changed by ${spendChange}% and ${platform.attributed} ${platform.valueLabel} by ${valueChange}%. ${platform.caveat}`,
            recommendation: platform.recommendation,
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
}
