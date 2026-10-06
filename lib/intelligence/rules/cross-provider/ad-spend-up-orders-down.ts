import {INTELLIGENCE_CONFIG as C} from "../../config";
import type {IntelligenceRule} from "../../types";
import {
  comparisonWindows,
  contextNow,
  coversSince,
  googleAdsAccountDays,
  isoWeek,
  metaAccountDays,
  percentChange,
  splitMetaDays,
  sum,
  within,
} from "../../windows";

const MIN_DAYS_PER_WINDOW = 5;

export const adSpendUpOrdersDownRule: IntelligenceRule = {
  id: "cross_provider.ad_spend_up_orders_down",
  name: "Ad spend up while orders fall",
  description:
    "Flags when Meta Ads and Google Ads spend rises while Shopify orders fall over the same week.",
  priority: 32,
  supportedProviders: ["meta_ads", "google_ads", "shopify"],
  evaluate(events, context) {
    const now = contextNow(context),
      {previousStart, currentStart, end} = comparisonWindows(now, C.comparisonWindowDays),
      orders = events.filter((e) => e.eventType === "shopify.order_created"),
      metaDays = metaAccountDays(events, now),
      googleDays = googleAdsAccountDays(events, now),
      platforms = [metaDays.length ? "Meta Ads" : "", googleDays.length ? "Google Ads" : ""]
        .filter(Boolean)
        .join(" and "),
      {current: adsNow, previous: adsBefore} = splitMetaDays(
        [...metaDays, ...googleDays],
        now,
        C.comparisonWindowDays,
      );
    if (
      !coversSince(orders, previousStart) ||
      new Set(adsNow.map((d) => d.date)).size < MIN_DAYS_PER_WINDOW ||
      new Set(adsBefore.map((d) => d.date)).size < MIN_DAYS_PER_WINDOW
    )
      return [];
    // Only compare when every ad account uses one currency; amounts are never converted or mixed.
    const currencies = [...new Set([...adsNow, ...adsBefore].map((d) => d.currency))];
    if (currencies.length !== 1) return [];
    const spendBefore = sum(adsBefore.map((d) => d.spend)),
      spendNow = sum(adsNow.map((d) => d.spend)),
      ordersBefore = orders.filter((e) => within(e, previousStart, currentStart)),
      ordersNow = orders.filter((e) => within(e, currentStart, end)),
      spendChange = percentChange(spendBefore, spendNow),
      orderChange = percentChange(ordersBefore.length, ordersNow.length);
    if (
      spendBefore <= 0 ||
      ordersBefore.length < C.minimumPreviousOrders ||
      spendChange < C.adSpendIncreasePercent ||
      orderChange > -C.crossOrderDeclinePercent
    )
      return [];
    return [
      {
        title: `Ad spend up ${spendChange}% while Shopify orders fell ${Math.abs(orderChange)}%`,
        summary: `${platforms} spend rose over the last ${C.comparisonWindowDays} days while orders went from ${ordersBefore.length} to ${ordersNow.length}.`,
        severity: "warning" as const,
        confidence: Math.min(85, 62 + Math.round(ordersBefore.length / 5)),
        explanation: `Across connected ${platforms} accounts, spend changed by ${spendChange}% while Shopify orders changed by ${orderChange}% over the same ${C.comparisonWindowDays}-day periods. This shows the two moved in opposite directions; it does not prove one caused the other.`,
        recommendation:
          "Check that ads point to working, in-stock product pages and that checkout works on mobile, then review which campaigns increased spend before raising budgets further.",
        sourceEventIds: [
          ...adsNow.map((d) => d.event.id),
          ...ordersNow.slice(0, 25).map((e) => e.id),
        ],
        fingerprintKey: isoWeek(now),
        metadata: {
          currency: currencies[0],
          platforms,
          currentSpend: spendNow,
          previousSpend: spendBefore,
          currentOrders: ordersNow.length,
          previousOrders: ordersBefore.length,
          spendChangePercent: spendChange,
          orderChangePercent: orderChange,
        },
      },
    ];
  },
};
