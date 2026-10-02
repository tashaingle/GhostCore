import {INTELLIGENCE_CONFIG as C} from "../../config";
import type {IntelligenceRule} from "../../types";
import {
  comparisonWindows,
  contextNow,
  coversSince,
  groupBy,
  isoWeek,
  metadataString,
  percentChange,
  within,
} from "../../windows";

export const shopifyOrderDeclineRule: IntelligenceRule = {
  id: "commerce.shopify_order_decline",
  name: "Shopify orders declining",
  description: "Flags a week-on-week fall in Shopify orders for a store.",
  priority: 40,
  supportedProviders: ["shopify"],
  evaluate(events, context) {
    const now = contextNow(context),
      {previousStart, currentStart, end} = comparisonWindows(now, C.comparisonWindowDays),
      orders = events.filter((e) => e.eventType === "shopify.order_created");
    return [...groupBy(orders, (e) => metadataString(e.metadata, "shop"))].flatMap(
      ([shop, shopOrders]) => {
        if (!coversSince(shopOrders, previousStart)) return [];
        const previous = shopOrders.filter((e) => within(e, previousStart, currentStart)),
          current = shopOrders.filter((e) => within(e, currentStart, end)),
          change = percentChange(previous.length, current.length);
        if (previous.length < C.minimumPreviousOrders || change > -C.orderDeclinePercent) return [];
        const decline = Math.abs(change);
        return [
          {
            title: `Shopify orders down ${decline}% this week`,
            summary: `${shop} received ${current.length} orders in the last ${C.comparisonWindowDays} days, compared with ${previous.length} the week before.`,
            severity:
              decline >= C.orderDeclineCriticalPercent
                ? ("critical" as const)
                : ("warning" as const),
            confidence: Math.min(92, 70 + Math.round(previous.length / 5)),
            explanation: `Orders fell from ${previous.length} to ${current.length} (${change}%) between consecutive ${C.comparisonWindowDays}-day periods.`,
            recommendation:
              "Check checkout and payment settings, best sellers' stock levels, recent theme or app changes, and whether paid or organic traffic dropped at the same time.",
            sourceEventIds: [...current, ...previous].slice(0, 50).map((e) => e.id),
            fingerprintKey: `${shop}:${isoWeek(now)}`,
            metadata: {
              shop,
              currentOrders: current.length,
              previousOrders: previous.length,
              changePercent: change,
            },
          },
        ];
      },
    );
  },
};
